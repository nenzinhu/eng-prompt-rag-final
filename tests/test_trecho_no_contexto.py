"""Rota /api/trecho — "ver no contexto" a página citada na resposta.

A resposta do RAG cita `arquivo, pág. N` e mostra um pedaço cortado em 3
linhas. Esta rota entrega a página inteira (e as vizinhas) para o aluno
conferir a citação, lendo só o índice: sem embedding e sem modelo, com cota
própria (não gasta o orçamento de IA do aluno).

    .venv/Scripts/python.exe -m pytest tests/test_trecho_no_contexto.py -v
"""
import sys
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "api"))

import index  # noqa: E402
from rag_core import SOBREPOSICAO_CHUNK  # noqa: E402

cliente = TestClient(index.app, raise_server_exceptions=False)


class _Ctx:
    """Cliente httpx simulado que guarda os parâmetros da consulta."""

    def __init__(self, linhas, registro, status=200):
        self.linhas, self.registro, self.status = linhas, registro, status

    def __call__(self, *_a, **_k):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_a):
        return False

    async def get(self, _url, headers=None, params=None):
        self.registro.append(params)
        return httpx.Response(
            self.status, json=self.linhas, request=httpx.Request("GET", "https://x")
        )


@pytest.fixture(autouse=True)
def balde_de_leitura_zerado():
    """O contador por IP vive no módulo e vazaria de um teste para o outro."""
    index._leituras_por_ip.clear()
    yield
    index._leituras_por_ip.clear()


@pytest.fixture
def indice(monkeypatch):
    """Devolve as linhas que o teste definir, e registra a consulta feita."""
    estado = {"linhas": [], "consultas": [], "status": 200}

    def _instalar():
        monkeypatch.setattr(
            index, "_http", _Ctx(estado["linhas"], estado["consultas"], estado["status"])
        )

    estado["instalar"] = _instalar
    return estado


def _buscar(estado, **query):
    estado["instalar"]()
    return cliente.get("/api/trecho", params={"fonte": "Apostila.pdf", **query})


def test_agrupa_por_pagina_e_pede_as_vizinhas(indice):
    indice["linhas"] = [
        {"id": 1, "page": 4, "content": "fim da anterior"},
        {"id": 2, "page": 5, "content": "primeira parte"},
        {"id": 3, "page": 5, "content": "segunda parte"},
        {"id": 4, "page": 6, "content": "começo da seguinte"},
    ]
    corpo = _buscar(indice, pagina=5).json()
    assert [p["pagina"] for p in corpo["paginas"]] == [4, 5, 6]
    assert corpo["paginas"][1]["texto"] == "primeira parte\n\nsegunda parte"

    # Dois filtros na mesma coluna: o PostgREST espera o parâmetro repetido.
    consulta = indice["consultas"][0]
    assert ("page", "gte.4") in consulta and ("page", "lte.6") in consulta


def test_sem_vizinhas_filtra_so_a_pagina(indice):
    indice["linhas"] = [{"id": 2, "page": 5, "content": "só a 5"}]
    r = _buscar(indice, pagina=5, vizinhas="false")
    assert r.status_code == 200
    assert ("page", "eq.5") in indice["consultas"][0]


def test_emenda_descarta_a_sobreposicao_do_divisor():
    """Chunks vizinhos repetem os últimos caracteres do anterior."""
    miolo = "palavra " * 40
    fim = miolo[-SOBREPOSICAO_CHUNK:]
    juntado = index._juntar_sem_repetir([miolo, fim + "continuação nova"])
    assert juntado.count("continuação nova") == 1
    assert juntado == miolo + "continuação nova"


def test_emenda_mantem_textos_sem_repeticao():
    assert index._juntar_sem_repetir(["um texto", "outro bem diferente"]) == (
        "um texto\n\noutro bem diferente"
    )
    assert index._juntar_sem_repetir(["", "  ", "só este"]) == "só este"


def test_fonte_vazia_e_pagina_invalida_sao_400(indice):
    indice["instalar"]()
    assert cliente.get("/api/trecho", params={"fonte": "  "}).status_code == 400
    assert _buscar(indice, pagina=0).status_code == 400


def test_sem_nada_indexado_responde_404(indice):
    indice["linhas"] = []
    r = _buscar(indice, pagina=9)
    assert r.status_code == 404
    assert "reindexado" in r.json()["detail"]


def test_erro_do_banco_vira_502_legivel(indice):
    indice["status"] = 500
    indice["linhas"] = {"message": "erro"}
    r = _buscar(indice, pagina=2)
    assert r.status_code == 502
    assert "material indexado" in r.json()["detail"]


def test_texto_da_pagina_tem_teto(indice):
    indice["linhas"] = [{"id": 1, "page": 1, "content": "x" * 30000}]
    corpo = _buscar(indice, pagina=1).json()
    assert len(corpo["paginas"][0]["texto"]) == index.MAX_CHARS_TRECHO


# ── Cota própria: a rota lê o acervo e é pública ──────────────────────────


def test_leitura_tem_limite_por_minuto(indice):
    """Sem limite, iterando `pagina` dava para baixar a apostila inteira."""
    indice["linhas"] = [{"id": 1, "page": 1, "content": "texto"}]
    for _ in range(index.LIMITE_LEITURA_POR_MINUTO):
        assert _buscar(indice, pagina=1).status_code == 200
    r = _buscar(indice, pagina=1)
    assert r.status_code == 429
    assert "material" in r.json()["detail"]


def test_limite_de_leitura_nao_gasta_a_cota_de_ia(indice, monkeypatch):
    """Conferir citação não pode consumir o orçamento de perguntas do aluno."""
    chamadas = []

    async def _llm_limite(_request):
        chamadas.append(1)

    monkeypatch.setattr(index, "_limitar_llm", _llm_limite)
    indice["linhas"] = [{"id": 1, "page": 1, "content": "texto"}]
    assert _buscar(indice, pagina=1).status_code == 200
    assert chamadas == [], "a rota de leitura não deve passar pelo limite da IA"
