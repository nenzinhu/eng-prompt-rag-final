"""Conversa contínua em /api/perguntar (feature N-01 da análise de 19/09/2026).

Antes, cada pergunta era isolada: "e no caso de X?" perdia o assunto, tanto no
prompt quanto — pior — na busca vetorial, que gerava o embedding de uma frase
sem tema nenhum.

    .venv/Scripts/python.exe -m pytest tests/test_conversa_continua.py -v
"""
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "api"))

import index  # noqa: E402

cliente = TestClient(index.app, raise_server_exceptions=False)

CHUNK = {"content": "texto do material", "source": "Apostila.pdf", "page": 3, "similarity": 0.8}


@pytest.fixture
def espiao(monkeypatch):
    """Registra o que foi para o embedding e para o modelo."""
    visto = {"busca": [], "prompt": ""}

    async def _nada(_request):
        return None

    async def _embeddings(textos):
        visto["busca"].append(textos[0])
        return [[0.0] * 384]

    async def _buscar(_emb, n=6, texto=None):
        return [CHUNK]

    async def _llm(_prov, _mod, _system, user, **_k):
        visto["prompt"] = user
        return "resposta do modelo"

    monkeypatch.setattr(index, "_limitar_llm", _nada)
    monkeypatch.setattr(index, "resolver_modelo", lambda _p, _m: "modelo-de-teste")
    monkeypatch.setattr(index, "gerar_embeddings", _embeddings)
    monkeypatch.setattr(index, "buscar_chunks", _buscar)
    monkeypatch.setattr(index, "chamar_llm", _llm)
    return visto


def _perguntar(corpo):
    return cliente.post("/api/perguntar", json=corpo)


def test_sem_historico_continua_como_antes(espiao):
    r = _perguntar({"pergunta": "O que é inovação?"})
    assert r.status_code == 200
    assert espiao["busca"] == ["O que é inovação?"]
    assert "CONVERSA ATÉ AQUI" not in espiao["prompt"]


def test_pergunta_anterior_entra_na_busca(espiao):
    """O embedding de "e no caso de X?" sozinho não acha nada."""
    r = _perguntar(
        {
            "pergunta": "E no caso de uma startup?",
            "historico": [{"pergunta": "O que é inovação incremental?", "resposta": "É..."}],
        }
    )
    assert r.status_code == 200
    assert espiao["busca"][0] == "O que é inovação incremental?\nE no caso de uma startup?"


def test_conversa_entra_no_prompt_como_dado(espiao):
    _perguntar(
        {
            "pergunta": "E no caso de uma startup?",
            "historico": [{"pergunta": "O que é inovação?", "resposta": "É uma novidade útil."}],
        }
    )
    prompt = espiao["prompt"]
    assert "CONVERSA ATÉ AQUI" in prompt
    assert "Aluno: O que é inovação?" in prompt
    assert "Você respondeu: É uma novidade útil." in prompt
    # A pergunta atual continua sendo a última coisa do prompt.
    assert prompt.rstrip().endswith("PERGUNTA: E no caso de uma startup?")


def test_historico_tem_teto_de_turnos_e_de_tamanho(espiao):
    historico = [{"pergunta": f"pergunta {i}", "resposta": "r" * 5000} for i in range(10)]
    _perguntar({"pergunta": "e agora?", "historico": historico})
    prompt = espiao["prompt"]
    assert prompt.count("Aluno: ") == index.MAX_TURNOS_CONVERSA
    assert "pergunta 9" in prompt  # mantém os mais recentes
    assert "pergunta 6" not in prompt
    assert "r" * (index.MAX_CHARS_HISTORICO + 1) not in prompt


def test_turnos_vazios_sao_descartados(espiao):
    _perguntar(
        {
            "pergunta": "e agora?",
            "historico": [{"pergunta": "  ", "resposta": ""}, {"pergunta": "tema real"}],
        }
    )
    assert espiao["busca"][0] == "tema real\ne agora?"
    assert espiao["prompt"].count("Aluno: ") == 1


def test_resposta_nao_streaming_vem_sem_raciocinio(espiao, monkeypatch):
    async def _llm(*_a, **_k):
        return "<think>vou pensar</think>Resposta limpa."

    monkeypatch.setattr(index, "chamar_llm", _llm)
    corpo = _perguntar({"pergunta": "algo"}).json()
    assert corpo["resposta"] == "Resposta limpa."
