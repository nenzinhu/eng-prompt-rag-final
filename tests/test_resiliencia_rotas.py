"""Rotas que prometem seguir mesmo com uma dependência fora do ar.

Defeitos da análise de 19/09/2026:

- B-05: `/api/gerar-apostila` diz que "nunca bloqueia a geração por falta de
  material indexado", mas só capturava `HTTPException` — uma queda do Supabase
  levanta erro do httpx e virava HTTP 500.
- B-06: `/api/resumir-apostila` descartava em silêncio os trechos que o
  provedor não conseguiu ler e ainda anunciava todos como usados.
- B-09: o glossário mandava a mesma chave duas vezes no mesmo INSERT, e o
  Postgres recusava o lote inteiro.

    .venv/Scripts/python.exe -m pytest tests/test_resiliencia_rotas.py -v
"""
import asyncio
import sys
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "api"))

import index  # noqa: E402

cliente = TestClient(index.app, raise_server_exceptions=False)


@pytest.fixture
def sem_limite(monkeypatch):
    """Tira o limite por IP do caminho: aqui o assunto é outro."""

    async def _nada(_request):
        return None

    monkeypatch.setattr(index, "_limitar_llm", _nada)
    monkeypatch.setattr(index, "resolver_modelo", lambda _p, _m: "modelo-de-teste")


# ── B-05 — apostila segue sem o RAG ────────────────────────────────────────


@pytest.mark.parametrize(
    "falha",
    [
        httpx.ConnectTimeout("Supabase fora do ar"),
        httpx.ReadTimeout("demorou demais"),
        httpx.HTTPStatusError(
            "500",
            request=httpx.Request("POST", "https://x"),
            response=httpx.Response(500, request=httpx.Request("POST", "https://x")),
        ),
    ],
)
def test_apostila_gera_mesmo_com_supabase_fora(monkeypatch, sem_limite, falha):
    async def _embeddings(_textos):
        raise falha

    async def _llm(*_a, **_k):
        return "# Tema\n\nTexto da apostila."

    monkeypatch.setattr(index, "gerar_embeddings", _embeddings)
    monkeypatch.setattr(index, "chamar_llm", _llm)

    r = cliente.post("/api/gerar-apostila", json={"tema": "Inovação", "formato": "pdf"})
    assert r.status_code == 200, r.text
    assert r.content.startswith(b"%PDF")


# ── B-06 — resumo conta o que realmente entrou ─────────────────────────────


@pytest.fixture
def resumo_simulado(monkeypatch, sem_limite):
    """Arquivo com 4 trechos; o teste escolhe quais falham."""
    monkeypatch.setattr(index, "extrair_paginas", lambda _d, _n: [(1, "texto")])
    monkeypatch.setattr(index, "chunk_texto", lambda _t: [f"trecho {i}" for i in range(4)])


def _resumir():
    return cliente.post(
        "/api/resumir-apostila",
        files={"file": ("Apostila.pdf", b"conteudo", "application/pdf")},
        data={"provider": "nous"},
    )


def test_resumo_informa_trechos_que_falharam(monkeypatch, resumo_simulado):
    """3 de 4 trechos falham: o corpo precisa dizer isso, não esconder."""

    async def _llm(_prov, _mod, system, user):
        if "REDUCE" in system or "trecho 0" not in user:
            if user.startswith("- "):
                return "resumo final"
            raise index.HTTPException(502, "provedor recusou")
        return "pontos do trecho 0"

    monkeypatch.setattr(index, "chamar_llm", _llm)
    corpo = _resumir().json()
    assert corpo["chunks_usados"] == 1  # antes dizia 4
    assert corpo["chunks_enviados"] == 4
    assert corpo["falhas"] == 3


def test_resumo_nao_cai_com_resposta_fora_do_formato(monkeypatch, resumo_simulado):
    """Um KeyError de um trecho derrubava o resumo inteiro com 500."""
    chamadas = []

    async def _llm(_prov, _mod, _system, user):
        chamadas.append(user)
        if user.startswith("- "):
            return "resumo final"
        if "trecho 1" in user:
            raise KeyError("choices")
        return f"pontos de {user}"

    monkeypatch.setattr(index, "chamar_llm", _llm)
    r = _resumir()
    assert r.status_code == 200, r.text
    corpo = r.json()
    assert corpo["resumo"] == "resumo final"
    assert corpo["chunks_usados"] == 3
    assert corpo["falhas"] == 1


def test_resumo_sem_nenhum_trecho_lido_avisa_em_vez_de_500(monkeypatch, resumo_simulado):
    async def _llm(*_a, **_k):
        raise httpx.ConnectError("provedor fora")

    monkeypatch.setattr(index, "chamar_llm", _llm)
    r = _resumir()
    assert r.status_code == 502
    assert "conteúdo relevante" in r.json()["detail"]


# ── B-09 — gravação do glossário não manda chave repetida ──────────────────


def test_gravacao_do_glossario_nao_repete_a_chave(monkeypatch):
    """Duas linhas com a mesma chave fazem o Postgres recusar o INSERT inteiro."""
    enviados = {}

    class _Ctx:
        def __call__(self, *_a, **_k):
            return self

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_a):
            return False

        async def post(self, _url, headers=None, params=None, json=None):
            enviados["rows"] = json
            return httpx.Response(201, request=httpx.Request("POST", "https://x"))

    monkeypatch.setattr(index, "_http", _Ctx())
    erro = asyncio.run(
        index.salvar_termos_glossario(
            [
                {"termo": "API", "explicacao": "primeira"},
                {"termo": "api", "explicacao": "segunda"},
                {"termo": "RAG", "explicacao": "outra"},
            ]
        )
    )
    assert erro is None
    assert [r["termo"] for r in enviados["rows"]] == ["API", "RAG"]
