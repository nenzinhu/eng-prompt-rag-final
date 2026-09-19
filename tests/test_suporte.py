"""Testes da aba "Tecnologia — Suporte em TI e IA".

O modelo de IA é substituído por um dublê: o que se verifica é o que chega ao
modelo (persona, ambiente, histórico) e as validações da rota.

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
        return "<think>raciocínio</think>**Causa provável:** disco cheio."

    monkeypatch.setattr(index, "chamar_llm", _chamar)
    index._uso_por_ip.clear()
    return chamadas


def _pedir(**campos):
    corpo = {"problema": "tela preta no boot", "provider": "groq", **campos}
    return cliente.post("/api/suporte-atendimento", json=corpo)


def test_lista_as_personas_por_area():
    personas = cliente.get("/api/suporte-personas").json()["personas"]
    assert [p["persona_id"] for p in personas] == [
        "byte", "sam", "bolt", "nexus", "kernel", "trace", "vault",
        "pixel", "frame", "reel", "live", "turbo", "ping", "seed", "mobi",
    ]
    assert [p["bloco"] for p in personas if p["persona_id"] in ("pixel", "turbo", "seed")] == [
        "Games e gráficos", "Windows e desempenho", "Internet e redes",
    ]
    assert len({p["bloco"] for p in personas}) == 7
    assert [p["persona_id"] for p in personas if p["usa_historico"]] == ["nexus"]


def test_personas_novas_trazem_exemplos_dos_campos():
    personas = {p["persona_id"]: p for p in cliente.get("/api/suporte-personas").json()["personas"]}
    assert "RTX" in personas["pixel"]["ambiente_placeholder"]
    assert personas["byte"]["ambiente_placeholder"] is None  # usa o exemplo padrão da aba


def test_regras_gerais_valem_para_todas_as_areas(llm_falso):
    _pedir(persona_id="seed", problema="torrent lento")
    system = llm_falso[0]["system"]
    assert "Seed" in system
    assert "piratear" in system  # regra geral contra pirataria
    assert "DLSS" in system  # regra de não inventar versões novas


def test_atendimento_usa_persona_e_ambiente(llm_falso):
    r = _pedir(persona_id="kernel", ambiente="EDK II no QEMU")
    assert r.status_code == 200
    assert r.json()["resposta"] == "**Causa provável:** disco cheio."  # <think> removido
    assert "Kernel" in llm_falso[0]["system"]
    assert "EDK II no QEMU" in llm_falso[0]["user"]


def test_nexus_recebe_no_maximo_tres_atendimentos_anteriores(llm_falso):
    historico = [f"atendimento {i}" for i in range(5)]
    r = _pedir(persona_id="nexus", historico=historico)
    assert r.json()["usou_historico"] is True
    enviado = llm_falso[0]["user"]
    assert "atendimento 2" in enviado
    assert "atendimento 3" not in enviado


def test_outras_personas_ignoram_o_historico(llm_falso):
    r = _pedir(persona_id="byte", historico=["atendimento antigo"])
    assert r.json()["usou_historico"] is False
    assert "atendimento antigo" not in llm_falso[0]["user"]


def test_problema_vazio_e_recusado(llm_falso):
    r = _pedir(problema="   ")
    assert r.status_code == 400
    assert not llm_falso


def test_persona_desconhecida_e_recusada(llm_falso):
    r = _pedir(persona_id="nao-existe")
    assert r.status_code == 400
    assert not llm_falso
