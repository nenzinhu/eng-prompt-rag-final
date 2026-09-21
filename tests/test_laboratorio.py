"""Laboratório de Prompts (`/api/laboratorio`).

O aluno escreve o próprio system+user prompt e vê a resposta crua do modelo,
sem persona fixa e sem RAG — é o único lugar do app onde o texto do aluno vai
direto ao modelo como INSTRUÇÃO, não como dado. Por isso: tetos de tamanho
próprios, mesma cota de qualquer chamada de IA (`_limitar_llm`) e a resposta
não passa por `limpar_resposta` (o aluno precisa ver o que o modelo respondeu
de verdade, inclusive `<think>`, para aprender a diagnosticar o próprio prompt).

    .venv/Scripts/python.exe -m pytest tests/test_laboratorio.py -v
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
def sem_cota(monkeypatch):
    async def _nada(_request):
        return None

    monkeypatch.setattr(index, "_limitar_llm", _nada)


@pytest.fixture
def llm_falso(monkeypatch, sem_cota):
    visto = {}

    async def _llm(prov, mod, system, user, timeout=None):
        visto["provider"] = prov
        visto["modelo"] = mod
        visto["system"] = system
        visto["user"] = user
        return "resposta crua do modelo <think>raciocínio</think>"

    monkeypatch.setattr(index, "resolver_modelo", lambda _p, _m: "modelo-de-teste")
    monkeypatch.setattr(index, "chamar_llm", _llm)
    return visto


def test_prompt_vazio_e_recusado(sem_cota):
    r = cliente.post("/api/laboratorio", json={"user_prompt": "   "})
    assert r.status_code == 400


def test_executa_o_prompt_do_aluno(llm_falso):
    r = cliente.post(
        "/api/laboratorio",
        json={"system_prompt": "Responda em uma palavra.", "user_prompt": "Diga oi"},
    )
    assert r.status_code == 200
    corpo = r.json()
    assert llm_falso["system"] == "Responda em uma palavra."
    assert llm_falso["user"] == "Diga oi"
    # Diferente das outras rotas, NÃO passa por limpar_resposta: o <think> fica.
    assert "<think>" in corpo["resposta"]


def test_sem_system_prompt_usa_um_padrao_neutro(llm_falso):
    r = cliente.post("/api/laboratorio", json={"user_prompt": "Diga oi"})
    assert r.status_code == 200
    assert llm_falso["system"]  # não é vazio


def test_user_prompt_longo_demais_e_recusado(sem_cota):
    gigante = "a" * (index.MAX_CHARS_LAB_USER + 1)
    r = cliente.post("/api/laboratorio", json={"user_prompt": gigante})
    assert r.status_code == 400


def test_system_prompt_longo_demais_e_recusado(sem_cota):
    gigante = "a" * (index.MAX_CHARS_LAB_SYSTEM + 1)
    r = cliente.post(
        "/api/laboratorio", json={"system_prompt": gigante, "user_prompt": "oi"}
    )
    assert r.status_code == 400


def test_passa_o_orcamento_de_tempo_ao_modelo(llm_falso):
    r = cliente.post("/api/laboratorio", json={"user_prompt": "oi"})
    assert r.status_code == 200
