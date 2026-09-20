"""Tetos da auditoria e orçamento de tempo da função (B-11 e B-12).

- B-11: `/api/auditar` é pública, faz uma busca vetorial POR FRASE em sequência
  e repassava `n_por_frase` cru ao banco. Sem teto, um texto grande estourava os
  60 s da função (504 em texto puro) gastando só 1 unidade de cota.
- B-12: o timeout do modelo era fixo e não descontava o tempo já gasto com
  embedding e busca, então a soma passava do limite da plataforma.

    .venv/Scripts/python.exe -m pytest tests/test_tetos_e_tempo.py -v
"""
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "api"))

import index  # noqa: E402

cliente = TestClient(index.app, raise_server_exceptions=False)

CHUNK = {"content": "texto do material", "source": "Apostila.pdf", "page": 1, "similarity": 0.9}


@pytest.fixture
def auditoria(monkeypatch):
    """Registra o `n` pedido ao banco e quantas buscas foram feitas."""
    visto = {"n": [], "frases": 0}

    async def _nada(_request):
        return None

    async def _embeddings(textos):
        visto["frases"] = len(textos)
        return [[0.0] * 384 for _ in textos]

    async def _buscar(_emb, n=6):
        visto["n"].append(n)
        return [CHUNK]

    monkeypatch.setattr(index, "_limitar_llm", _nada)
    monkeypatch.setattr(index, "gerar_embeddings", _embeddings)
    monkeypatch.setattr(index, "buscar_chunks", _buscar)
    return visto


def _frases(quantidade: int) -> str:
    # Frases longas o bastante para `quebrar_frases` não descartar (40+ chars).
    return " ".join(
        f"Esta e a frase numero {i} do texto com tamanho suficiente para ser auditada."
        for i in range(quantidade)
    )


def test_n_por_frase_tem_clamp(auditoria):
    r = cliente.post("/api/auditar", json={"resposta": _frases(2), "n_por_frase": 9999})
    assert r.status_code == 200
    assert max(auditoria["n"]) == index.MAX_RESULTADOS_BUSCA


def test_n_por_frase_nunca_abaixo_de_tres(auditoria):
    cliente.post("/api/auditar", json={"resposta": _frases(2), "n_por_frase": 1})
    assert auditoria["n"][0] == 3


def test_numero_de_frases_tem_teto_e_avisa(auditoria):
    corpo = cliente.post(
        "/api/auditar", json={"resposta": _frases(index.MAX_FRASES_AUDITORIA + 20)}
    ).json()
    assert len(corpo["frases"]) == index.MAX_FRASES_AUDITORIA
    assert auditoria["frases"] == index.MAX_FRASES_AUDITORIA
    assert corpo["truncada"] is True


def test_texto_normal_nao_e_marcado_como_truncado(auditoria):
    corpo = cliente.post("/api/auditar", json={"resposta": _frases(3)}).json()
    assert corpo["truncada"] is False
    assert len(corpo["frases"]) == 3


def test_texto_gigante_e_cortado_por_caracteres(auditoria):
    gigante = _frases(5) + " " + ("palavra " * 20000)
    corpo = cliente.post("/api/auditar", json={"resposta": gigante}).json()
    assert corpo["truncada"] is True
    assert len(corpo["frases"]) <= index.MAX_FRASES_AUDITORIA


# ── B-12 — orçamento de tempo ──────────────────────────────────────────────


def test_orcamento_desconta_o_tempo_ja_gasto(monkeypatch):
    """Com 40 s já gastos, o modelo não pode receber os 52 s de sempre."""

    class _Pedido:
        class state:
            inicio = 0.0

    pedido = _Pedido()
    pedido.state.inicio = index.time.perf_counter() - 40
    restante = index.tempo_restante_llm(pedido)
    assert restante < index.TIMEOUT_LLM
    assert restante == pytest.approx(index.TEMPO_MAX_FUNCAO - 40 - index.MARGEM_SEGURANCA, abs=1)


def test_orcamento_tem_piso_e_teto(monkeypatch):
    class _Pedido:
        class state:
            inicio = 0.0

    estourado = _Pedido()
    estourado.state.inicio = index.time.perf_counter() - 600
    assert index.tempo_restante_llm(estourado) == 5.0

    novinho = _Pedido()
    novinho.state.inicio = index.time.perf_counter()
    assert index.tempo_restante_llm(novinho) <= index.TIMEOUT_LLM


def test_sem_marca_de_inicio_usa_o_timeout_padrao():
    class _Pedido:
        class state:
            pass

    assert index.tempo_restante_llm(_Pedido()) == index.TIMEOUT_LLM


def test_rota_passa_o_orcamento_ao_modelo(monkeypatch):
    """A chamada precisa receber `timeout`, senão o desconto não vale de nada."""
    visto = {}

    async def _nada(_request):
        return None

    async def _embeddings(_textos):
        return [[0.0] * 384]

    async def _buscar(_emb, n=6):
        return [CHUNK]

    async def _llm(_prov, _mod, _system, _user, timeout=None):
        visto["timeout"] = timeout
        return "resposta"

    monkeypatch.setattr(index, "_limitar_llm", _nada)
    monkeypatch.setattr(index, "resolver_modelo", lambda _p, _m: "modelo-de-teste")
    monkeypatch.setattr(index, "gerar_embeddings", _embeddings)
    monkeypatch.setattr(index, "buscar_chunks", _buscar)
    monkeypatch.setattr(index, "chamar_llm", _llm)

    assert cliente.post("/api/perguntar", json={"pergunta": "algo"}).status_code == 200
    assert visto["timeout"] is not None
    assert 5.0 <= visto["timeout"] <= index.TIMEOUT_LLM
