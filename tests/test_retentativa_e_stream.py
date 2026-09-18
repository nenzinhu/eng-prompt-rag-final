"""Retentativa de falhas passageiras e streaming da resposta.

    .venv/Scripts/python.exe -m pytest tests/ -v
"""
import asyncio
import json
import sys
from pathlib import Path

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "api"))

import index  # noqa: E402
from _app import provedores  # noqa: E402


class _Ctx:
    """Substitui `_http`: devolve respostas em sequência e conta as chamadas."""

    def __init__(self, respostas, chamadas):
        self.respostas = respostas
        self.chamadas = chamadas

    def __call__(self, _timeout):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def post(self, url, **_):
        self.chamadas.append(url)
        r = self.respostas.pop(0)
        if isinstance(r, Exception):
            raise r
        return r


def _resp(status, corpo, headers=None):
    return httpx.Response(status, json=corpo, headers=headers, request=httpx.Request("POST", "https://x"))


@pytest.fixture
def chave(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "k")
    dormir = asyncio.sleep
    monkeypatch.setattr(provedores.asyncio, "sleep", lambda _s: dormir(0))


OK = {"choices": [{"message": {"content": "resposta"}}]}


def test_llm_tenta_de_novo_apos_429(monkeypatch, chave):
    chamadas = []
    monkeypatch.setattr(provedores, "_http", _Ctx([_resp(429, {}, {"retry-after": "1"}), _resp(200, OK)], chamadas))
    assert asyncio.run(provedores.chamar_llm("groq", "m", "s", "u")) == "resposta"
    assert len(chamadas) == 2


def test_llm_nao_repete_erro_definitivo(monkeypatch, chave):
    chamadas = []
    monkeypatch.setattr(provedores, "_http", _Ctx([_resp(400, {"erro": "modelo"})], chamadas))
    with pytest.raises(HTTPException) as e:
        asyncio.run(provedores.chamar_llm("groq", "m", "s", "u"))
    assert e.value.status_code == 502
    assert len(chamadas) == 1


def test_llm_desiste_na_segunda_falha(monkeypatch, chave):
    chamadas = []
    monkeypatch.setattr(provedores, "_http", _Ctx([_resp(503, {}), _resp(503, {})], chamadas))
    with pytest.raises(HTTPException):
        asyncio.run(provedores.chamar_llm("groq", "m", "s", "u"))
    assert len(chamadas) == 2


def test_llm_repete_falha_de_conexao(monkeypatch, chave):
    chamadas = []
    monkeypatch.setattr(provedores, "_http", _Ctx([httpx.ConnectError("caiu"), _resp(200, OK)], chamadas))
    assert asyncio.run(provedores.chamar_llm("groq", "m", "s", "u")) == "resposta"


def test_stream_de_pergunta_em_ndjson(monkeypatch):
    async def _emb(_t):
        return [[0.0] * 384]

    async def _buscar(_e, n=6):
        return [{"content": "trecho", "source": "a.pdf", "page": 3, "similarity": 0.8}]

    async def _stream(*_a, **_k):
        for pedaco in ("Olá", ", ", "mundo"):
            yield pedaco

    async def _sem_limite(_r):
        return None

    monkeypatch.setattr(index, "gerar_embeddings", _emb)
    monkeypatch.setattr(index, "buscar_chunks", _buscar)
    monkeypatch.setattr(index, "chamar_llm_stream", _stream)
    monkeypatch.setattr(index, "_limitar_llm", _sem_limite)

    r = TestClient(index.app).post(
        "/api/perguntar/stream",
        json={"pergunta": "oi", "provider": "groq", "modelo": index.PROVIDERS["groq"]["models"][0]},
    )
    assert r.status_code == 200
    eventos = [json.loads(l) for l in r.text.splitlines() if l]
    assert eventos[0]["tipo"] == "meta"
    assert eventos[0]["contexto"][0]["pagina"] == 3
    assert "".join(e["t"] for e in eventos if e["tipo"] == "texto") == "Olá, mundo"
    assert eventos[-1]["tipo"] == "fim"


class _CtxStream:
    """Substitui `_http` no streaming: o provedor devolve as linhas SSE dadas."""

    def __init__(self, linhas, status=200):
        self.linhas = linhas
        self.status_code = status

    def __call__(self, _timeout):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    def stream(self, *_a, **_k):
        return self

    async def aread(self):
        return b"erro"

    async def aiter_lines(self):
        for linha in self.linhas:
            if isinstance(linha, Exception):
                raise linha
            yield linha


def _sse(obj):
    return "data: " + json.dumps(obj)


def _pedaco(texto, fim=None):
    return _sse({"choices": [{"delta": {"content": texto}, "finish_reason": fim}]})


def _coletar(monkeypatch, linhas):
    """Roda o stream e devolve (texto recebido, exceção ou None)."""
    monkeypatch.setattr(provedores, "_http", _CtxStream(linhas))
    recebido: list[str] = []

    async def _rodar():
        async for p in provedores.chamar_llm_stream("groq", "m", "s", "u"):
            recebido.append(p)

    try:
        asyncio.run(_rodar())
    except HTTPException as e:
        return "".join(recebido), e
    return "".join(recebido), None


def test_stream_completo_com_done(monkeypatch, chave):
    texto, erro = _coletar(monkeypatch, [_pedaco("Olá"), _pedaco(" mundo", "stop"), "data: [DONE]"])
    assert (texto, erro) == ("Olá mundo", None)


def test_stream_aceita_finish_reason_stop_sem_done(monkeypatch, chave):
    texto, erro = _coletar(monkeypatch, [_pedaco("Olá", "stop")])
    assert (texto, erro) == ("Olá", None)


def test_stream_erro_do_provedor_no_meio_nao_vira_fim(monkeypatch, chave):
    # Formato do OpenRouter para erro depois que o stream já começou.
    linhas = [_pedaco("metade"), _sse({"error": {"message": "Provider returned error", "code": 502}})]
    texto, erro = _coletar(monkeypatch, linhas)
    assert texto == "metade"
    assert erro is not None and "Provider returned error" in erro.detail


@pytest.mark.parametrize("motivo", ["length", "error", "content_filter"])
def test_stream_finish_reason_de_corte_vira_erro(monkeypatch, chave, motivo):
    texto, erro = _coletar(monkeypatch, [_pedaco("metade", motivo), "data: [DONE]"])
    assert texto == "metade"
    assert erro is not None


def test_stream_que_termina_sem_done_vira_erro(monkeypatch, chave):
    texto, erro = _coletar(monkeypatch, [_pedaco("metade")])
    assert texto == "metade"
    assert erro is not None and "caiu" in erro.detail


def test_stream_conexao_caida_vira_erro(monkeypatch, chave):
    texto, erro = _coletar(monkeypatch, [_pedaco("metade"), httpx.ReadError("caiu")])
    assert texto == "metade"
    assert erro is not None and erro.status_code == 502


def test_notas_de_modelo_so_para_modelos_da_lista():
    """Nota esquecida de um modelo removido não aparece em lugar nenhum — e engana."""
    for nome, cfg in provedores.PROVIDERS.items():
        sobrando = set(cfg.get("notas", {})) - set(cfg["models"])
        assert not sobrando, f"{nome}: notas de modelos fora da lista: {sobrando}"


def test_rota_de_provedores_entrega_notas_e_aviso():
    r = TestClient(index.app).get("/api/providers").json()
    assert r["nous"]["notas"]["openai/gpt-oss-120b"].startswith("pago")
    assert "50" in r["openrouter"]["aviso"]
    assert r["groq"]["notas"] == {} and r["groq"]["aviso"] == ""


def test_stream_valida_antes_de_comecar(monkeypatch):
    """Modelo fora da lista sai como 400 de verdade, não como evento no meio do stream."""
    async def _sem_limite(_r):
        return None

    monkeypatch.setattr(index, "_limitar_llm", _sem_limite)
    r = TestClient(index.app).post(
        "/api/perguntar/stream", json={"pergunta": "oi", "provider": "groq", "modelo": "caro/modelo-x"}
    )
    assert r.status_code == 400
