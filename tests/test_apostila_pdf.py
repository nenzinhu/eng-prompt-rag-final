"""PDF do Gerador de Apostilas com caracteres fora do Latin-1 (análise de 17/09/2026, A1-04).

    .venv/Scripts/python.exe -m pytest tests/test_apostila_pdf.py -v
"""
import io
import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "api"))

from pypdf import PdfReader  # noqa: E402

from _app import documentos  # noqa: E402

# Antes da correção, todos levantavam FPDFUnicodeEncodingException na Helvetica.
CASOS = [
    "Inovação — conceito",
    "Intervalo 2010–2020",
    "Aspas “curvas” e ‘simples’",
    "Lista • item",
    "Reticências…",
    "Seta → resultado",
    "Hífen­inseparável",
    "x ≥ 3 e y ≤ 5",
    "Emoji 🚀 no texto",
    "- item com **negrito** no meio",
]


def _gerar(texto: str, titulo: str = "Tema — IA") -> bytes:
    pdf = documentos._markdown_para_pdf(texto, titulo)
    assert pdf.startswith(b"%PDF")
    return pdf


@pytest.mark.parametrize("texto", CASOS)
def test_pdf_aceita_caracteres_comuns_de_ia(texto):
    _gerar(f"# Título\n\n{texto}\n\n## Seção\n\n{texto}")


@pytest.mark.parametrize("texto", CASOS)
def test_pdf_sem_fonte_unicode_cai_no_plano_b(monkeypatch, tmp_path, texto):
    monkeypatch.setattr(documentos, "FONTE_PDF", tmp_path / "nao-existe.ttf")
    _gerar(texto)


def test_pdf_remove_negrito_do_markdown():
    pdf = _gerar("Um **termo** importante")
    texto = "".join(p.extract_text() for p in PdfReader(io.BytesIO(pdf)).pages)
    assert "**" not in texto
    assert "termo" in texto


def test_plano_b_troca_por_equivalentes():
    assert documentos._para_latin1("a — b “c” • d… →") == 'a - b "c" - d... ->'
    assert documentos._para_latin1("ação 🚀") == "ação ?"


def test_fonte_unicode_esta_no_pacote():
    """A fonte precisa estar em api/_app/fonts, que o vercel.json empacota (`_app/**`).
    Sem ela o PDF ainda sai, mas com símbolos trocados por equivalentes simples."""
    assert documentos.FONTE_PDF.exists(), f"faltando {documentos.FONTE_PDF}"
    assert documentos.FONTE_PDF_NEGRITO.exists(), f"faltando {documentos.FONTE_PDF_NEGRITO}"
