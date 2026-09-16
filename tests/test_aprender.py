"""Testes da aba "Aprender" (explicação em níveis + técnica Feynman).

O modelo e a busca vetorial são dublês: o que se verifica é o nível que chega ao
modelo, a leitura do JSON da avaliação e o plano B quando o JSON vem quebrado.

    .venv/Scripts/python.exe -m pytest tests/ -v
"""
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "api"))

import index  # noqa: E402

cliente = TestClient(index.app, raise_server_exceptions=False)

CHUNK = {"content": "Few-shot é dar exemplos no prompt.", "source": "apostila.pdf", "page": 3, "similarity": 0.8}


@pytest.fixture
def dubles(monkeypatch):
    estado = {"chamadas": [], "resposta": "Explicação simples."}

    async def _llm(provider, modelo, system_prompt, user_prompt, timeout=None):
        estado["chamadas"].append({"system": system_prompt, "user": user_prompt})
        return estado["resposta"]

    async def _emb(textos):
        return [[0.0] * 3 for _ in textos]

    async def _chunks(emb, n=6):
        return [CHUNK]

    monkeypatch.setattr(index, "chamar_llm", _llm)
    monkeypatch.setattr(index, "gerar_embeddings", _emb)
    monkeypatch.setattr(index, "buscar_chunks", _chunks)
    index._uso_por_ip.clear()
    return estado


def test_explicar_usa_o_nivel_pedido_e_devolve_fontes(dubles):
    r = cliente.post("/api/aprender/explicar", json={"tema": "few-shot", "nivel": "simples", "provider": "groq"})
    assert r.status_code == 200
    corpo = r.json()
    assert corpo["resposta"] == "Explicação simples."
    assert corpo["nivel"] == "simples"
    assert corpo["contexto"][0]["fonte"] == "apostila.pdf"
    assert "10 anos" in dubles["chamadas"][0]["system"]


def test_explicar_recusa_nivel_desconhecido_e_tema_vazio(dubles):
    assert cliente.post("/api/aprender/explicar", json={"tema": "x", "nivel": "doutor"}).status_code == 400
    assert cliente.post("/api/aprender/explicar", json={"tema": "  ", "nivel": "simples"}).status_code == 400
    assert not dubles["chamadas"]


def _avaliar(**campos):
    corpo = {
        "tema": "few-shot",
        "explicacao_aluno": "É colocar exemplos no prompt pra IA imitar.",
        "contexto": [{"conteudo": CHUNK["content"], "fonte": "apostila.pdf", "pagina": 3}],
        "provider": "groq",
        **campos,
    }
    return cliente.post("/api/aprender/avaliar", json=corpo)


def test_avaliar_le_o_json_do_modelo(dubles):
    dubles["resposta"] = (
        '<think>x</think>```json\n{"nota": 82, "acertos": ["usa exemplos"], "lacunas": ["quantos exemplos"],'
        ' "confusoes": [], "proxima_pergunta": "E zero-shot?"}\n```'
    )
    r = _avaliar()
    assert r.status_code == 200
    a = r.json()
    assert a["nota"] == 82
    assert a["acertos"] == ["usa exemplos"]
    assert a["lacunas"] == ["quantos exemplos"]
    assert a["confusoes"] == []
    assert a["proxima_pergunta"] == "E zero-shot?"
    assert "pra IA imitar" in dubles["chamadas"][0]["user"]


def test_avaliar_limita_a_nota_entre_0_e_100(dubles):
    dubles["resposta"] = '{"nota": 140, "acertos": [], "lacunas": [], "confusoes": [], "proxima_pergunta": ""}'
    assert _avaliar().json()["nota"] == 100


def test_avaliar_com_json_quebrado_devolve_texto_sem_nota(dubles):
    dubles["resposta"] = "Você entendeu a ideia, mas faltou dizer quantos exemplos usar."
    a = _avaliar().json()
    assert a["nota"] is None
    assert a["comentario"].startswith("Você entendeu")


def test_avaliar_recusa_explicacao_vazia(dubles):
    assert _avaliar(explicacao_aluno="   ").status_code == 400
    assert not dubles["chamadas"]
