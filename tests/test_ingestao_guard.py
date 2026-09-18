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
# indexado. O upload antigo apagava os chunks da fonte na hora, sem
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


def _upload(monkeypatch, *, storage: list[dict], nome: str, dados: bytes, forcar=False):
    """Chama /api/upload com o Storage simulado e registra o que foi alterado."""
    from fastapi.testclient import TestClient

    alteracoes: list[tuple] = []

    async def _listar():
        return storage

    async def _gravar(n, _d, _m=""):
        alteracoes.append(("gravou", n))

    async def _renomear(a, b):
        alteracoes.append(("renomeou", a, b))

    async def _remover(n):
        alteracoes.append(("removeu", n))

    async def _sem_risco(*_a):
        return None

    monkeypatch.setattr(index, "listar_arquivos_storage", _listar)
    monkeypatch.setattr(index, "upload_documento_storage", _gravar)
    monkeypatch.setattr(index, "renomear_fonte_chunks", _renomear)
    monkeypatch.setattr(index, "remover_documento_storage", _remover)
    monkeypatch.setattr(index, "_risco_de_perda", _sem_risco)
    index.app.dependency_overrides[index.exigir_admin] = lambda: None
    try:
        r = TestClient(index.app).post(
            "/api/upload", files={"files": (nome, dados)}, data={"forcar": str(forcar).lower()}
        )
    finally:
        index.app.dependency_overrides.clear()
    return r, alteracoes


def test_upload_conteudo_de_a_com_nome_de_b_e_recusado(monkeypatch):
    """Análise de 17/09/2026 (A1-08): renomeava os chunks de A para B, misturando
    os dois documentos, e removia A — sem a guarda olhar para B."""
    import hashlib

    x, y = b"conteudo X", b"conteudo Y"
    storage = [
        {"nome": "A.pdf", "md5": hashlib.md5(x).hexdigest()},
        {"nome": "B.pdf", "md5": hashlib.md5(y).hexdigest()},
    ]
    for forcar in (False, True):
        r, alteracoes = _upload(monkeypatch, storage=storage, nome="B.pdf", dados=x, forcar=forcar)
        assert r.status_code == 409
        assert r.json()["detail"]["sem_forcar"] is True
        assert alteracoes == [], "nada pode ser gravado, renomeado ou removido"


def test_upload_mesmo_conteudo_com_nome_novo_continua_renomeando(monkeypatch):
    import hashlib

    x = b"conteudo X"
    storage = [{"nome": "A.pdf", "md5": hashlib.md5(x).hexdigest()}]
    r, alteracoes = _upload(monkeypatch, storage=storage, nome="A-v2.pdf", dados=x)
    assert r.status_code == 200
    assert ("renomeou", "A.pdf", "A-v2.pdf") in alteracoes


@pytest.mark.parametrize(
    ("enviado", "salvo"),
    [
        ("Infográfico_RAG_final.pdf", "Infografico_RAG_final.pdf"),
        ("Introdução à Programação.pdf", "Introducao a Programacao.pdf"),
        ("Playbook do Curso - v1.3.pdf", "Playbook do Curso - v1.3.pdf"),
        ("relatório #2 (final)!.docx", "relatorio _2 (final)_.docx"),
        ("ção.pdf", "cao.pdf"),
        ("🚀.pdf", "documento.pdf"),
    ],
)
def test_nome_para_storage(enviado, salvo):
    from _app.documentos import nome_para_storage

    assert nome_para_storage(enviado) == salvo


def test_upload_troca_nome_com_acento_e_avisa(monkeypatch):
    """Storage respondia 400 InvalidKey para "Infográfico_RAG_final.pdf"."""
    r, alteracoes = _upload(monkeypatch, storage=[], nome="Infográfico_RAG_final.pdf", dados=b"conteudo novo")
    assert r.status_code == 200
    assert ("gravou", "Infografico_RAG_final.pdf") in alteracoes
    assert r.json()["salvos"] == ["Infografico_RAG_final.pdf"]
    assert r.json()["renomeados"] == [{"de": "Infográfico_RAG_final.pdf", "para": "Infografico_RAG_final.pdf"}]
