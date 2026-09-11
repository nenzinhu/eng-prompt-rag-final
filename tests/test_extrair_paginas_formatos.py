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
