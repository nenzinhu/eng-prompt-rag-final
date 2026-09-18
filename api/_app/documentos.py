"""Extração de texto de documentos e geração de DOCX/PDF (sem I/O de rede)."""
from __future__ import annotations

import io
import re
import unicodedata
from pathlib import Path

from docx import Document as DocxDocument
from pptx import Presentation
from pypdf import PdfReader

# ── Extração de texto ───────────────────────────────────────────────────────


def _extrair_paginas_docx(dados: bytes) -> list[tuple[int, str]]:
    """Um .docx não tem conceito nativo de página — cada heading de nível 1 vira
    uma "página" (mantém granularidade parecida com PDF para a citação de fonte).
    Sem heading nenhum, o documento inteiro vira a página 1.
    """
    documento = DocxDocument(io.BytesIO(dados))
    paginas: list[tuple[int, list[str]]] = [(1, [])]
    for paragrafo in documento.paragraphs:
        texto = paragrafo.text.strip()
        if not texto:
            continue
        if paragrafo.style.name == "Heading 1" and paginas[-1][1]:
            paginas.append((paginas[-1][0] + 1, []))
        paginas[-1][1].append(texto)
    return [(num, "\n".join(linhas)) for num, linhas in paginas]


def _extrair_paginas_pptx(dados: bytes) -> list[tuple[int, str]]:
    """Cada slide vira uma página — mapeamento natural, igual PDF."""
    apresentacao = Presentation(io.BytesIO(dados))
    paginas = []
    for i, slide in enumerate(apresentacao.slides):
        textos = [
            forma.text_frame.text
            for forma in slide.shapes
            if forma.has_text_frame and forma.text_frame.text.strip()
        ]
        paginas.append((i + 1, "\n".join(textos)))
    return paginas


def _texto_gravavel(texto: str) -> str:
    """Tira do texto o que o Postgres recusa numa coluna text.

    O caractere nulo (U+0000) vem de alguns geradores de PDF e derrubava a
    gravação com 22P05 (caso real em 18/09/2026). Surrogate UTF-16 solto, de PDF
    mal formado, também não vira UTF-8 válido e passa a ser trocado por "?".
    """
    return texto.replace("\x00", "").encode("utf-8", "replace").decode("utf-8")


def extrair_paginas(pdf_bytes: bytes, nome: str = "") -> list[tuple[int, str]]:
    """Devolve [(numero_da_pagina, texto)]. Aceita PDF, TXT, MD, DOCX e PPTX."""
    return [(n, _texto_gravavel(t)) for n, t in _extrair_paginas_bruto(pdf_bytes, nome)]


def _extrair_paginas_bruto(pdf_bytes: bytes, nome: str = "") -> list[tuple[int, str]]:
    nome_lower = nome.lower()
    if nome_lower.endswith((".txt", ".md")):
        try:
            texto = pdf_bytes.decode("utf-8")
        except UnicodeDecodeError:
            texto = pdf_bytes.decode("latin-1", "replace")
        return [(1, texto)]
    if nome_lower.endswith(".docx"):
        return _extrair_paginas_docx(pdf_bytes)
    if nome_lower.endswith(".pptx"):
        return _extrair_paginas_pptx(pdf_bytes)
    reader = PdfReader(io.BytesIO(pdf_bytes))
    return [(i + 1, page.extract_text() or "") for i, page in enumerate(reader.pages)]


def montar_contexto(chunks: list[dict]) -> tuple[str, float]:
    contexto = "\n\n".join(f"[Fonte: {c['source']}, página {c['page']}]\n{c['content']}" for c in chunks)
    media = sum(c["similarity"] for c in chunks) / len(chunks) if chunks else 0.0
    return contexto, media


def contexto_para_texto(evidencias: list[dict]) -> str:
    return "\n\n".join(
        f"[Fonte: {e.get('fonte', '?')}, página {e.get('pagina', '?')}]\n{e.get('conteudo', '')}"
        for e in evidencias
    )


def _slug_arquivo(texto: str) -> str:
    normalizado = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode("ascii")
    normalizado = re.sub(r"[^a-zA-Z0-9]+", "-", normalizado).strip("-").lower()
    return normalizado[:60] or "apostila"


def nome_para_storage(nome: str) -> str:
    """Nome de arquivo que o Storage do Supabase aceita.

    O Storage recusa com 400 "InvalidKey" nomes com acento ou símbolo fora do
    ASCII ("Infográfico_RAG_final.pdf"), e o erro chegava ao admin como se fosse
    problema de chave ou de RLS. Aqui o acento sai ("á" → "a") e o que sobrar
    fora de letras, números, espaço e `._-()` vira "_". O mesmo nome é usado no
    Storage e como fonte no índice, então as citações mostram o nome limpo.
    """
    base = unicodedata.normalize("NFKD", nome).encode("ascii", "ignore").decode("ascii")
    base = re.sub(r"[^A-Za-z0-9 ._()\-]+", "_", base)
    base = re.sub(r"_{2,}", "_", base).strip(" _")
    raiz, ponto, extensao = base.rpartition(".")
    if ponto and not raiz.strip(" ._"):
        base = f"documento.{extensao}"
    return base or "documento"


def _markdown_para_docx(texto: str, titulo: str) -> bytes:
    doc = DocxDocument()
    doc.add_heading(titulo, level=0)
    for linha in texto.splitlines():
        linha = linha.strip()
        if not linha:
            continue
        if linha.startswith("### "):
            doc.add_heading(linha[4:].strip(), level=3)
        elif linha.startswith("## "):
            doc.add_heading(linha[3:].strip(), level=2)
        elif linha.startswith("# "):
            doc.add_heading(linha[2:].strip(), level=1)
        elif linha.startswith(("- ", "* ")):
            doc.add_paragraph(linha[2:].strip(), style="List Bullet")
        else:
            doc.add_paragraph(linha)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


# Fonte Unicode para o PDF. A Helvetica embutida no fpdf2 só aceita Latin-1, e
# o PDF quebrava (erro 500, depois de pagar a chamada de IA) com travessão,
# aspas curvas e "•", que os modelos usam o tempo todo (análise de 17/09/2026).
PASTA_FONTES = Path(__file__).resolve().parent / "fonts"
FONTE_PDF = PASTA_FONTES / "DejaVuSans.ttf"
FONTE_PDF_NEGRITO = PASTA_FONTES / "DejaVuSans-Bold.ttf"

# Plano B, sem a fonte: equivalentes em Latin-1 para os caracteres mais comuns.
# O que sobrar fora do Latin-1 (emoji, por exemplo) vira "?" em vez de erro.
_TROCAS_LATIN1 = str.maketrans({
    "—": "-", "–": "-", "‒": "-", "‐": "-", "‑": "-", "−": "-",
    "“": '"', "”": '"', "„": '"', "‘": "'", "’": "'", "‚": "'",
    "•": "-", "●": "-", "▪": "-", "…": "...",
    "→": "->", "←": "<-", "⇒": "=>", "↔": "<->",
    "≤": "<=", "≥": ">=", "≠": "!=", "≈": "~",
    "✓": "v", "✔": "v", "✗": "x", "✘": "x",
    "­": "", "​": "", "‌": "", "‍": "", "﻿": "",
})


def _para_latin1(texto: str) -> str:
    return texto.translate(_TROCAS_LATIN1).encode("latin-1", "replace").decode("latin-1")


def _markdown_para_pdf(texto: str, titulo: str) -> bytes:
    from fpdf import FPDF  # import local: só carregado quando o formato pedido é pdf

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    familia, preparar = "Helvetica", _para_latin1
    if FONTE_PDF.exists() and FONTE_PDF_NEGRITO.exists():
        try:
            pdf.add_font("DejaVu", "", str(FONTE_PDF))
            pdf.add_font("DejaVu", "B", str(FONTE_PDF_NEGRITO))
            familia, preparar = "DejaVu", str
        except Exception:  # fonte corrompida: segue com o plano B em vez de falhar
            pass

    def linha_pdf(tamanho: float, altura: float, conteudo: str, negrito: bool = False):
        # new_x="LMARGIN" é necessário: o padrão do fpdf2 deixa o cursor na borda
        # direita após multi_cell, e a chamada seguinte com largura 0 quebra
        # ("Not enough horizontal space") por não sobrar espaço até a margem.
        pdf.set_font(familia, "B" if negrito else "", tamanho)
        pdf.multi_cell(0, altura, preparar(conteudo), new_x="LMARGIN", new_y="NEXT")

    linha_pdf(16, 10, titulo, negrito=True)
    pdf.ln(2)
    for linha in texto.splitlines():
        # O PDF não interpreta negrito do Markdown; sem isso os "**" saem impressos.
        linha = linha.replace("**", "").strip()
        if not linha:
            pdf.ln(2)
            continue
        if linha.startswith("### "):
            linha_pdf(12, 8, linha[4:].strip(), negrito=True)
        elif linha.startswith("## "):
            linha_pdf(13, 8, linha[3:].strip(), negrito=True)
        elif linha.startswith("# "):
            linha_pdf(15, 9, linha[2:].strip(), negrito=True)
        elif linha.startswith(("- ", "* ")):
            linha_pdf(11, 7, f"-  {linha[2:].strip()}")
        else:
            linha_pdf(11, 7, linha)
    return bytes(pdf.output())


def _mimetype(nome: str) -> str:
    if nome.lower().endswith(".pdf"):
        return "application/pdf"
    if nome.lower().endswith(".md"):
        return "text/markdown; charset=utf-8"
    if nome.lower().endswith(".docx"):
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    if nome.lower().endswith(".pptx"):
        return "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    return "text/plain; charset=utf-8"
