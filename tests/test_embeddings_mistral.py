"""Embeddings do Mistral (mistral-embed) com o gte-small de reserva.

A busca só usa o Mistral quando EMBEDDINGS_BUSCA=mistral E há chave; qualquer
falha do Mistral cai no gte, e o tamanho do vetor (1024 x 384) escolhe a
função de busca no banco — assim um vetor nunca é comparado com a coluna do
outro modelo.

    .venv/Scripts/python.exe -m pytest tests/test_embeddings_mistral.py -v
"""
import asyncio
import sys
from pathlib import Path

import httpx
import pytest
from fastapi import HTTPException

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "api"))

import index  # noqa: E402
from rag_core import classificar_fidelidade  # noqa: E402

BAIXAR_OCR_REAL = index.baixar_ocr


def _resp(status, corpo):
    return httpx.Response(status, json=corpo, request=httpx.Request("POST", "https://x"))


class _Cliente:
    """Cliente httpx falso: `responder(url, json)` decide a resposta."""

    def __init__(self, responder):
        self.responder = responder
        self.chamadas: list[tuple[str, dict]] = []

    def __call__(self, *_a, **_k):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_a):
        return False

    async def post(self, url, json=None, **_):
        self.chamadas.append((url, json))
        return self.responder(url, json)

    async def get(self, url, **_):
        self.chamadas.append((url, None))
        return self.responder(url, None)


def _mistral_ok(url, corpo):
    # Devolve fora de ordem de propósito: o código deve ordenar por `index`.
    dados = [{"index": i, "embedding": [float(i)] * 1024} for i in range(len(corpo["input"]))]
    return _resp(200, {"data": list(reversed(dados))})


@pytest.fixture
def ambiente(monkeypatch):
    dormir = asyncio.sleep
    monkeypatch.setattr(index.asyncio, "sleep", lambda _s: dormir(0))
    monkeypatch.setattr(index, "SUPABASE_URL", "https://x")
    monkeypatch.setattr(index, "SUPABASE_ANON_KEY", "k")
    monkeypatch.setenv("MISTRAL_API_KEY", "m")
    monkeypatch.setattr(index, "EMBEDDINGS_BUSCA", "mistral")

    async def _gte(textos):
        return [[0.5] * 384 for _ in textos]

    monkeypatch.setattr(index, "gerar_embeddings_gte", _gte)
    return monkeypatch


def test_busca_padrao_continua_no_gte(ambiente):
    ambiente.setattr(index, "EMBEDDINGS_BUSCA", "gte")
    cliente = _Cliente(_mistral_ok)
    ambiente.setattr(index, "_http", cliente)
    vetores = asyncio.run(index.gerar_embeddings(["a"]))
    assert len(vetores[0]) == 384
    assert cliente.chamadas == [], "sem EMBEDDINGS_BUSCA=mistral o Mistral não é chamado"


def test_sem_chave_nao_usa_mistral(ambiente):
    ambiente.delenv("MISTRAL_API_KEY")
    ambiente.setattr(index, "_http", _Cliente(_mistral_ok))
    assert len(asyncio.run(index.gerar_embeddings(["a"]))[0]) == 384


def test_mistral_em_lotes_e_na_ordem(ambiente):
    cliente = _Cliente(_mistral_ok)
    ambiente.setattr(index, "_http", cliente)
    textos = [str(i) for i in range(40)]
    vetores = asyncio.run(index.gerar_embeddings(textos))
    assert [len(c[1]["input"]) for c in cliente.chamadas] == [32, 8]
    assert [v[0] for v in vetores] == [float(i) for i in range(32)] + [float(i) for i in range(8)]
    assert all(len(v) == 1024 for v in vetores)


def test_429_passageiro_tenta_de_novo(ambiente):
    respostas = iter([_resp(429, {"message": "rate"}), None])

    def responder(url, corpo):
        r = next(respostas)
        return r if r is not None else _mistral_ok(url, corpo)

    ambiente.setattr(index, "_http", _Cliente(responder))
    assert len(asyncio.run(index.gerar_embeddings(["a"]))[0]) == 1024


@pytest.mark.parametrize(
    "resposta",
    [
        _resp(429, {"message": "rate"}),
        _resp(401, {"message": "chave"}),
        _resp(200, {"data": [{"index": 0, "embedding": [0.1] * 10}]}),  # dimensão errada
        _resp(200, {"sem": "data"}),
    ],
)
def test_falha_do_mistral_cai_no_gte(ambiente, resposta):
    ambiente.setattr(index, "_http", _Cliente(lambda *_: resposta))
    assert len(asyncio.run(index.gerar_embeddings(["a"]))[0]) == 384


@pytest.mark.parametrize("dim,funcao,modelo", [(1024, "match_ementas_mistral", "mistral"), (384, "match_ementas", "gte")])
def test_buscar_chunks_escolhe_funcao_pelo_tamanho(ambiente, dim, funcao, modelo):
    linha = {"id": 1, "content": "c", "source": "s", "page": 1, "similarity": 0.7}
    cliente = _Cliente(lambda *_: _resp(200, [linha]))
    ambiente.setattr(index, "_http", cliente)
    chunks = asyncio.run(index.buscar_chunks([0.0] * dim, n=3))
    assert cliente.chamadas[0][0].endswith(f"/rpc/{funcao}")
    assert chunks[0]["modelo"] == modelo


@pytest.mark.parametrize("dim,sufixo", [(1024, "_mistral"), (384, "")])
def test_com_texto_usa_a_busca_hibrida(ambiente, dim, sufixo):
    ambiente.setattr(index, "BUSCA_HIBRIDA", True)
    cliente = _Cliente(lambda *_: _resp(200, []))
    ambiente.setattr(index, "_http", cliente)
    asyncio.run(index.buscar_chunks([0.0] * dim, n=6, texto="o que é LGPD?"))
    url, corpo = cliente.chamadas[0]
    assert url.endswith(f"/rpc/match_ementas_hibrido{sufixo}")
    assert corpo["query_text"] == "o que é LGPD?"
    assert len(cliente.chamadas) == 1


def test_hibrida_com_erro_cai_na_vetorial(ambiente):
    ambiente.setattr(index, "BUSCA_HIBRIDA", True)
    linha = {"id": 1, "content": "c", "source": "s", "page": 1, "similarity": 0.7}

    def responder(url, _corpo):
        return _resp(404, {"message": "sem função"}) if "hibrido" in url else _resp(200, [linha])

    cliente = _Cliente(responder)
    ambiente.setattr(index, "_http", cliente)
    chunks = asyncio.run(index.buscar_chunks([0.0] * 1024, texto="x"))
    assert [c[0].rsplit("/", 1)[1] for c in cliente.chamadas] == ["match_ementas_hibrido_mistral", "match_ementas_mistral"]
    assert chunks[0]["id"] == 1


@pytest.mark.parametrize("hibrida,texto", [(False, "x"), (True, None), (True, "  ")])
def test_sem_texto_ou_desligada_usa_so_o_vetor(ambiente, hibrida, texto):
    ambiente.setattr(index, "BUSCA_HIBRIDA", hibrida)
    cliente = _Cliente(lambda *_: _resp(200, []))
    ambiente.setattr(index, "_http", cliente)
    asyncio.run(index.buscar_chunks([0.0] * 384, texto=texto))
    assert [c[0].rsplit("/", 1)[1] for c in cliente.chamadas] == ["match_ementas"]


def test_limiares_por_modelo(monkeypatch):
    monkeypatch.setitem(index.LIMIAR_CONFIANCA, "mistral", 0.8)
    assert index.pouco_embasado([{"modelo": "mistral"}], 0.7) is True
    assert index.pouco_embasado([{"modelo": "gte"}], 0.7) is False
    assert index.pouco_embasado([{}], 0.7) is False  # chunk sem rótulo = gte
    assert index.pouco_embasado([], 0.0) is True

    import rag_core

    monkeypatch.setitem(rag_core.LIMIARES_FIDELIDADE, "mistral", (0.85, 0.75))
    assert classificar_fidelidade(0.8, "mistral") == "parcial"
    assert classificar_fidelidade(0.8, "gte") == "apoiada"
    assert classificar_fidelidade(0.8) == "apoiada"


# ── Ingestão grava os dois vetores ──────────────────────────────────────────


def _montar_ingestao(ambiente, mistral):
    inseridas: list[dict] = []

    async def _analisar(arquivo):
        return {"ok": True, "avisos": [], "arquivo": arquivo, "chunks_novos": 2}

    async def _baixar(_nome):
        return b"x"

    async def _inserir(rows):
        inseridas.extend(rows)

    async def _maior_id(_nome):
        return 500 + len(inseridas)

    async def _nada(*_a):
        return None

    ambiente.setattr(index, "_analisar_ingestao", _analisar)
    ambiente.setattr(index, "baixar_documento_storage", _baixar)
    ambiente.setattr(index, "extrair_paginas", lambda *_a: [(1, "texto " * 80), (2, "outro " * 80)])
    ambiente.setattr(index, "gerar_embeddings_mistral", mistral)
    ambiente.setattr(index, "inserir_chunks", _inserir)
    ambiente.setattr(index, "maior_id_da_fonte", _maior_id)
    ambiente.setattr(index, "apagar_chunks_ate_id", _nada)
    return inseridas


def _ingerir():
    return asyncio.run(index.ingerir(index.IngerirReq(arquivo="doc.pdf", offset=0)))


async def _mistral_1024(textos):
    return [[0.1] * 1024 for _ in textos]


async def _mistral_falha(_textos):
    raise httpx.ConnectError("fora do ar")


def test_ingestao_grava_os_dois_vetores(ambiente):
    inseridas = _montar_ingestao(ambiente, _mistral_1024)
    _ingerir()
    assert len(inseridas) == 2
    assert all(len(r["embedding"]) == 384 and len(r["embedding_mistral"]) == 1024 for r in inseridas)


def test_ingestao_com_busca_no_mistral_exige_o_vetor(ambiente):
    inseridas = _montar_ingestao(ambiente, _mistral_falha)
    with pytest.raises(HTTPException) as erro:
        _ingerir()
    assert erro.value.status_code == 502
    assert inseridas == [], "nada entra no índice sem o vetor que a busca usa"


def test_ingestao_junta_a_transcricao_das_imagens(ambiente):
    inseridas = _montar_ingestao(ambiente, _mistral_1024)
    vistos = []

    async def _ocr(nome):
        vistos.append(nome)
        return {"2": ["for c in texto:\n    print(c)"]}

    ambiente.setattr(index, "baixar_ocr", _ocr)
    _ingerir()
    assert "doc.pdf" in vistos
    assert any("[Imagem da página 2]" in r["content"] and "print(c)" in r["content"] for r in inseridas)


@pytest.mark.parametrize(
    "resposta,esperado",
    [
        (_resp(404, {"error": "not found"}), {}),
        (_resp(400, {"error": "Object not found"}), {}),
        (_resp(200, ["não é objeto"]), {}),
        (_resp(200, {"1": ["x"]}), {"1": ["x"]}),
    ],
)
def test_baixar_ocr_ausente_ou_invalido_devolve_vazio(ambiente, resposta, esperado):
    ambiente.setattr(index, "_http", _Cliente(lambda *_: resposta))
    assert asyncio.run(BAIXAR_OCR_REAL("doc.pdf")) == esperado


def test_ingestao_com_busca_no_gte_segue_sem_o_vetor_mistral(ambiente):
    ambiente.setattr(index, "EMBEDDINGS_BUSCA", "gte")
    inseridas = _montar_ingestao(ambiente, _mistral_falha)
    _ingerir()
    assert len(inseridas) == 2
    assert all("embedding_mistral" not in r for r in inseridas)
