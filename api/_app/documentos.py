"""Extração de texto de documentos e geração de DOCX/PDF (sem I/O de rede)."""
from __future__ import annotations

import io
import re
import unicodedata

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


def extrair_paginas(pdf_bytes: bytes, nome: str = "") -> list[tuple[int, str]]:
    """Devolve [(numero_da_pagina, texto)]. Aceita PDF, TXT, MD, DOCX e PPTX."""
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


def _markdown_para_pdf(texto: str, titulo: str) -> bytes:
    from fpdf import FPDF  # import local: só carregado quando o formato pedido é pdf

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    def linha_pdf(tamanho: float, altura: float, conteudo: str, negrito: bool = False):
        # new_x="LMARGIN" é necessário: o padrão do fpdf2 deixa o cursor na borda
        # direita após multi_cell, e a chamada seguinte com largura 0 quebra
        # ("Not enough horizontal space") por não sobrar espaço até a margem.
        pdf.set_font("Helvetica", "B" if negrito else "", tamanho)
        pdf.multi_cell(0, altura, conteudo, new_x="LMARGIN", new_y="NEXT")

    linha_pdf(16, 10, titulo, negrito=True)
    pdf.ln(2)
    for linha in texto.splitlines():
        linha = linha.strip()
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
