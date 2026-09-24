"""Testes da aba "Professores": 10 personalidades, resposta sem consultar o material.

O modelo de IA é substituído por um dublê: o que se verifica é o que chega ao
modelo (personalidade, pergunta), que o índice NÃO é consultado e as validações.

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


@pytest.fixture
def llm_falso(monkeypatch):
    chamadas = []

    async def _chamar(provider, modelo, system_prompt, user_prompt, timeout=None):
        chamadas.append({"system": system_prompt, "user": user_prompt})
        return "<think>raciocínio</think>Gabarito: 42."

    monkeypatch.setattr(index, "chamar_llm", _chamar)
    index._uso_por_ip.clear()
    return chamadas


def _pedir(**campos):
    corpo = {"pergunta": "O que é inércia?", "provider": "groq", **campos}
    return cliente.post("/api/professor-responder", json=corpo)


def test_lista_dez_professores_com_exemplo():
    personas = cliente.get("/api/professor-personas").json()["personas"]
    assert len(personas) == 10
    assert len({p["persona_id"] for p in personas}) == 10
    assert all(p["nome"] and p["exemplo"] and p["description"] for p in personas)
    assert "prompt_modifier" not in personas[0]


def test_resposta_usa_personalidade_e_regras_cirurgicas(llm_falso):
    r = _pedir(persona_id="banca")
    assert r.status_code == 200
    assert r.json()["resposta"] == "Gabarito: 42."  # <think> removido
    system = llm_falso[0]["system"]
    assert "Prof.ª Banca" in system
    assert "cirúrgico" in system
    assert "NÃO há apostila" in system
    assert "O que é inércia?" in llm_falso[0]["user"]


def test_nao_consulta_o_material(llm_falso, monkeypatch):
    def _proibido(*_a, **_k):
        raise AssertionError("a aba Professores não deve buscar no índice")

    monkeypatch.setattr(index, "montar_contexto", _proibido)
    assert _pedir().status_code == 200


def test_pergunta_vazia_ou_longa_e_recusada(llm_falso):
    assert _pedir(pergunta="   ").status_code == 400
    assert _pedir(pergunta="x" * (index.MAX_PERGUNTA_PROFESSOR + 1)).status_code == 400
    assert not llm_falso


def test_professor_desconhecido_e_recusado(llm_falso):
    assert _pedir(persona_id="nao-existe").status_code == 400
    assert not llm_falso
