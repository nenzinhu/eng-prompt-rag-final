"""Extração de texto de .docx e .pptx — formatos adicionados além de PDF/TXT/MD.

    .venv/Scripts/python.exe -m pytest tests/test_extrair_paginas_formatos.py -v
"""
import io
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "api"))

from docx import Document as DocxDocument  # noqa: E402
from pptx import Presentation  # noqa: E402
from pptx.util import Inches  # noqa: E402

import index  # noqa: E402
from _app import documentos  # noqa: E402


def _gerar_docx() -> bytes:
    doc = DocxDocument()
    doc.add_paragraph("Introdução geral do curso.")
    doc.add_heading("Capítulo 1", level=1)
    doc.add_paragraph("Conteúdo do capítulo 1.")
    doc.add_heading("Capítulo 2", level=1)
    doc.add_paragraph("Conteúdo do capítulo 2.")
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def _gerar_pptx() -> bytes:
    prs = Presentation()
    layout = prs.slide_layouts[5]  # em branco, com placeholder de título
    for texto in ("Slide um", "Slide dois"):
        slide = prs.slides.add_slide(layout)
        caixa = slide.shapes.add_textbox(Inches(1), Inches(1), Inches(4), Inches(1))
        caixa.text_frame.text = texto
    buf = io.BytesIO()
    prs.save(buf)
    return buf.getvalue()


def test_docx_divide_por_heading_1():
    paginas = index.extrair_paginas(_gerar_docx(), "apostila.docx")
    assert len(paginas) == 3
    assert paginas[0] == (1, "Introdução geral do curso.")
    assert paginas[1][0] == 2
    assert "Capítulo 1" in paginas[1][1]
    assert "Conteúdo do capítulo 1." in paginas[1][1]
    assert paginas[2][0] == 3
    assert "Capítulo 2" in paginas[2][1]


def test_docx_sem_heading_vira_uma_pagina():
    doc = DocxDocument()
    doc.add_paragraph("Só um parágrafo solto.")
    buf = io.BytesIO()
    doc.save(buf)

    paginas = index.extrair_paginas(buf.getvalue(), "sem-heading.docx")
    assert paginas == [(1, "Só um parágrafo solto.")]


def test_pptx_um_slide_por_pagina():
    paginas = index.extrair_paginas(_gerar_pptx(), "apresentacao.pptx")
    assert len(paginas) == 2
    assert paginas[0] == (1, "Slide um")
    assert paginas[1] == (2, "Slide dois")


def test_extensoes_documento_inclui_novos_formatos():
    assert ".docx" in index.EXTENSOES_DOCUMENTO
    assert ".pptx" in index.EXTENSOES_DOCUMENTO


def test_texto_extraido_sai_sem_caractere_nulo():
    """Postgres recusa \u0000 em texto (22P05). Caso real em 18/09/2026:
    model-context-protocol-mcp-...pdf travava a indexação no primeiro lote."""
    from _app.documentos import extrair_paginas

    [(pagina, texto)] = extrair_paginas("Model\x00 Con\x00text Protocol".encode(), "a.txt")
    assert pagina == 1
    assert "\x00" not in texto
    assert texto == "Model Context Protocol"


def test_texto_extraido_troca_surrogate_solto():
    """Surrogate UTF-16 solto (PDF mal formado) também quebra a gravação."""
    from _app import documentos

    orig = documentos._extrair_paginas_bruto
    try:
        documentos._extrair_paginas_bruto = lambda _b, _n="": [(1, "ok \ud800 fim")]
        [(_, texto)] = documentos.extrair_paginas(b"x", "a.pdf")
    finally:
        documentos._extrair_paginas_bruto = orig
    texto.encode("utf-8")  # não pode levantar
    assert texto.startswith("ok ") and texto.endswith(" fim")


# ── Bug B-23: tabelas e notas ficavam fora do índice ───────────────────────


def test_docx_indexa_o_conteudo_das_tabelas():
    """`documento.paragraphs` não inclui células de tabela.

    Material de curso põe comparações e resumos em tabela, e esse conteúdo
    ficava fora do índice: a IA respondia "não encontrei" sobre algo que
    estava na apostila.
    """
    doc = DocxDocument()
    doc.add_paragraph("Texto normal.")
    tabela = doc.add_table(rows=2, cols=2)
    tabela.cell(0, 0).text = "Inovação incremental"
    tabela.cell(0, 1).text = "melhoria contínua"
    tabela.cell(1, 0).text = "Inovação radical"
    tabela.cell(1, 1).text = "rompe o padrão"
    buf = io.BytesIO()
    doc.save(buf)

    texto = "\n".join(t for _, t in index.extrair_paginas(buf.getvalue(), "com-tabela.docx"))
    assert "Inovação incremental | melhoria contínua" in texto
    assert "Inovação radical | rompe o padrão" in texto
    assert "Texto normal." in texto


def test_pptx_indexa_tabela_e_notas_do_slide():
    prs = Presentation()
    slide = prs.slides.add_slide(prs.slide_layouts[5])
    caixa = slide.shapes.add_textbox(Inches(1), Inches(1), Inches(4), Inches(1))
    caixa.text_frame.text = "Título do slide"
    forma = slide.shapes.add_table(2, 2, Inches(1), Inches(3), Inches(4), Inches(1))
    forma.table.cell(0, 0).text = "Conceito"
    forma.table.cell(0, 1).text = "Definição"
    forma.table.cell(1, 0).text = "RAG"
    forma.table.cell(1, 1).text = "busca antes de gerar"
    slide.notes_slide.notes_text_frame.text = "Explicar com o exemplo da apostila."
    buf = io.BytesIO()
    prs.save(buf)

    texto = "\n".join(t for _, t in index.extrair_paginas(buf.getvalue(), "slides.pptx"))
    assert "Título do slide" in texto
    assert "RAG | busca antes de gerar" in texto
    assert "Explicar com o exemplo da apostila." in texto


def test_docx_tabela_fica_na_pagina_do_seu_capitulo():
    """Regressão: as tabelas iam TODAS para a última página.

    `documento.paragraphs` pula tabelas, e juntá-las no fim fazia a citação
    apontar o capítulo errado — pior do que não indexar.
    """
    doc = DocxDocument()
    doc.add_heading("Capítulo 1", level=1)
    doc.add_paragraph("Texto do capítulo 1.")
    t1 = doc.add_table(rows=1, cols=2)
    t1.cell(0, 0).text = "Conceito um"
    t1.cell(0, 1).text = "definição um"
    doc.add_heading("Capítulo 2", level=1)
    doc.add_paragraph("Texto do capítulo 2.")
    t2 = doc.add_table(rows=1, cols=2)
    t2.cell(0, 0).text = "Conceito dois"
    t2.cell(0, 1).text = "definição dois"
    buf = io.BytesIO()
    doc.save(buf)

    paginas = dict(index.extrair_paginas(buf.getvalue(), "capitulos.docx"))
    assert "Conceito um | definição um" in paginas[1]
    assert "Conceito dois | definição dois" in paginas[2]
    # A tabela do capítulo 1 não pode vazar para o capítulo 2.
    assert "Conceito um" not in paginas[2]


def test_pptx_forma_problematica_nao_derruba_o_arquivo():
    """Regressão: `shape_type` levanta NotImplementedError em forma não
    reconhecida, e `getattr(..., None)` NÃO segura isso — a exceção vem de
    dentro da property. A ingestão do .pptx inteiro caía com 500."""

    class FormaQuebrada:
        @property
        def shape_type(self):
            raise NotImplementedError("forma desconhecida")

        @property
        def has_text_frame(self):
            raise NotImplementedError("forma desconhecida")

    assert documentos._texto_da_forma(FormaQuebrada()) == []


def test_pptx_ignora_forma_ruim_e_mantem_o_resto_do_slide():
    prs = Presentation()
    slide = prs.slides.add_slide(prs.slide_layouts[5])
    caixa = slide.shapes.add_textbox(Inches(1), Inches(1), Inches(4), Inches(1))
    caixa.text_frame.text = "Conteúdo bom do slide"
    buf = io.BytesIO()
    prs.save(buf)
    texto = "\n".join(t for _, t in index.extrair_paginas(buf.getvalue(), "s.pptx"))
    assert "Conteúdo bom do slide" in texto
