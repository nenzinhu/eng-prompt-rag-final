"""Testes do guarda de ingestão — o defeito que colocou 384 chunks em risco.

O caso real: `Empreendedorismo_Inovacao_Tecnologia_completo.pdf` tem 384 chunks
no índice, mas o PDF não está mais no Storage. Reindexar apagava os chunks
ANTES de saber se a nova extração produzia algo, e o material se perdia.

Estes testes fixam o comportamento correto sem tocar em rede nem em credenciais.

    .venv/Scripts/python.exe -m pytest tests/ -v
"""
import asyncio
import sys
from pathlib import Path

import pytest
from fastapi import HTTPException

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "api"))

import index  # noqa: E402


def preparar(monkeypatch, *, existentes=(384, 200_000), paginas=None, arquivos=("doc.pdf",)):
    """Substitui o I/O do Supabase por dublês."""
    async def _listar():
        return list(arquivos)

    async def _baixar(_nome):
        return b"conteudo"

    async def _medir(_nome):
        return existentes

    monkeypatch.setattr(index, "listar_documentos_storage", _listar)
    monkeypatch.setattr(index, "baixar_documento_storage", _baixar)
    monkeypatch.setattr(index, "medir_indice_atual", _medir)
    if paginas is not None:
        monkeypatch.setattr(index, "extrair_paginas", lambda _d, _n="": paginas)


def test_extracao_vazia_bloqueia(monkeypatch):
    """PDF digitalizado (sem texto extraível) não pode apagar o índice."""
    preparar(monkeypatch, paginas=[(1, ""), (2, "")])
    r = asyncio.run(index._analisar_ingestao("doc.pdf"))
    assert r["ok"] is False
    assert r["chunks_novos"] == 0
    assert any("OCR" in a for a in r["avisos"])


def test_queda_de_texto_bloqueia(monkeypatch):
    """384 chunks (200 mil caracteres) contra 2 mil caracteres novos = perda grave."""
    preparar(monkeypatch, existentes=(384, 200_000), paginas=[(1, "texto curto " * 150)])
    r = asyncio.run(index._analisar_ingestao("doc.pdf"))
    assert r["ok"] is False
    assert r["perda_texto_percentual"] > 90
    assert any("perda de" in a for a in r["avisos"])


def test_menos_chunks_com_mesmo_texto_nao_alerta(monkeypatch):
    """Regressão do falso positivo: chunker novo (900 chars) gera MENOS chunks.

    7 chunks de 500 chars viram 4 de 900 com o mesmo conteúdo. Comparar contagem
    de chunks acusaria perda inexistente e treinaria o usuário a confirmar sem ler.
    """
    texto_pagina = "conteudo relevante da apostila. " * 60  # ~1860 caracteres
    preparar(monkeypatch, existentes=(7, 1900), paginas=[(1, texto_pagina)])
    r = asyncio.run(index._analisar_ingestao("doc.pdf"))
    assert r["chunks_novos"] < 7, "o chunker novo deve produzir menos chunks"
    assert r["perda"] > 0, "a contagem de chunks realmente cai"
    assert r["perda_texto_percentual"] <= 0, "mas o texto fica preservado"
    assert r["ok"] is True, f"não deve alertar: {r['avisos']}"


def test_documento_ausente_da_404(monkeypatch):
    preparar(monkeypatch, arquivos=("outro.pdf",))
    with pytest.raises(HTTPException) as e:
        asyncio.run(index._analisar_ingestao("doc.pdf"))
    assert e.value.status_code == 404


def test_primeira_indexacao_sem_chunks_novos_ok(monkeypatch):
    """Documento novo, ainda sem nada no índice: nada a perder, nada a alertar."""
    preparar(monkeypatch, existentes=(0, 0), paginas=[(1, "material novo da apostila " * 20)])
    r = asyncio.run(index._analisar_ingestao("doc.pdf"))
    assert r["ok"] is True
    assert r["chunks_existentes"] == 0


# ── Guarda do upload ────────────────────────────────────────────────────────
#
# O caminho mais perigoso: subir um arquivo com o MESMO nome de um documento
# indexado. O upload antigo executava apagar_chunks_por_fonte na hora, sem
# comparar nada — um PDF que não extrai texto subindo no lugar de um indexado
# apagava o material e não colocava nada no lugar.


def test_upload_bloqueia_quando_rendaria_menos_texto(monkeypatch):
    preparar(monkeypatch, existentes=(384, 200_000), paginas=[(1, "quase nada")])
    r = asyncio.run(index._risco_de_perda("doc.pdf", b"x", "doc.pdf"))
    assert r is not None
    assert r["perda_texto_percentual"] > 90
    assert r["chunks_existentes"] == 384
    assert r["avisos"]


def test_upload_bloqueia_quando_nao_extrai_nada(monkeypatch):
    preparar(monkeypatch, existentes=(384, 200_000), paginas=[(1, ""), (2, "")])
    r = asyncio.run(index._risco_de_perda("doc.pdf", b"x", "doc.pdf"))
    assert r is not None
    assert any("nenhum trecho indexável" in a for a in r["avisos"])


def test_upload_bloqueia_quando_pdf_e_ilegivel(monkeypatch):
    preparar(monkeypatch, existentes=(384, 200_000))

    def explodir(_d, _n=""):
        raise ValueError("Cannot read PDF")

    monkeypatch.setattr(index, "extrair_paginas", explodir)
    r = asyncio.run(index._risco_de_perda("doc.pdf", b"lixo", "doc.pdf"))
    assert r is not None
    assert any("Não foi possível extrair" in a for a in r["avisos"])


def test_upload_libera_quando_texto_e_preservado(monkeypatch):
    """Trocar o arquivo por uma versão equivalente não deve exigir confirmação."""
    preparar(monkeypatch, existentes=(7, 1900), paginas=[(1, "conteudo relevante da apostila. " * 60)])
    assert asyncio.run(index._risco_de_perda("doc.pdf", b"x", "doc.pdf")) is None


def test_upload_libera_quando_fonte_nao_esta_indexada(monkeypatch):
    preparar(monkeypatch, existentes=(0, 0), paginas=[(1, "curto")])
    assert asyncio.run(index._risco_de_perda("doc.pdf", b"x", "doc.pdf")) is None
