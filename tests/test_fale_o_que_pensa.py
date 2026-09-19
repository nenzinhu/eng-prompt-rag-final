"""Testes da aba "Fale o que pensa" (dentro de Elenco).

O modelo de IA é substituído por um dublê: o que se verifica é o que chega ao
modelo (personalidade, contexto, rascunho), as validações da rota e a separação
da saída nos quatro títulos.

    .venv/Scripts/python.exe -m pytest tests/ -v
"""
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "api"))

import index  # noqa: E402
from rag_core import separar_secoes_fale  # noqa: E402

cliente = TestClient(index.app, raise_server_exceptions=False)

SAIDA_MODELO = (
    "<think>vou analisar</think>"
    "### INTENÇÃO\nQuer que o amigo pare de atrasar.\n"
    "### ANÁLISE\n- O rascunho soa como ataque.\n- Tirei o palavrão.\n"
    "### MENSAGEM\n\"Mano, os atrasos tão me incomodando. Bora combinar melhor?\"\n"
    "### DICA\nMande por mensagem, não no grupo."
)


@pytest.fixture
def llm_falso(monkeypatch):
    chamadas = []

    async def _chamar(provider, modelo, system_prompt, user_prompt, timeout=None):
        chamadas.append({"system": system_prompt, "user": user_prompt})
        return SAIDA_MODELO

    monkeypatch.setattr(index, "chamar_llm", _chamar)
    index._uso_por_ip.clear()
    return chamadas


def _pedir(**campos):
    corpo = {"rascunho": "vc sempre atrasa, que saco", "provider": "groq", **campos}
    return cliente.post("/api/fale-o-que-pensa", json=corpo)


def test_lista_personalidades_com_automatico_primeiro():
    personas = cliente.get("/api/fale-personas").json()["personas"]
    ids = [p["persona_id"] for p in personas]
    assert ids[0] == "auto"
    assert {"direto", "diplomata", "ex", "amigo", "mentor", "agir_certo"} <= set(ids)
    assert all(p["exemplo"] and p["description"] for p in personas)
    assert "prompt_modifier" not in personas[0]  # instrução interna não vai para o navegador


def test_devolve_secoes_separadas(llm_falso):
    r = _pedir(persona_id="amigo", contexto="amigo de infância")
    assert r.status_code == 200
    d = r.json()
    assert d["intencao"] == "Quer que o amigo pare de atrasar."
    assert d["analise"].startswith("- O rascunho soa como ataque.")
    assert d["mensagem"] == "Mano, os atrasos tão me incomodando. Bora combinar melhor?"
    assert d["dica"] == "Mande por mensagem, não no grupo."
    assert d["persona_id"] == "amigo"


def test_personalidade_e_contexto_chegam_ao_modelo(llm_falso):
    _pedir(persona_id="ex", contexto="ex-namorada, terminamos em março")
    chamada = llm_falso[0]
    assert "PERSONALIDADE ATIVA — Para o(a) Ex" in chamada["system"]
    assert "terminamos em março" in chamada["user"]
    assert "vc sempre atrasa" in chamada["user"]


def test_sem_personalidade_usa_automatico(llm_falso):
    _pedir()
    assert "PERSONALIDADE ATIVA — Automático" in llm_falso[0]["system"]


@pytest.mark.parametrize(
    "campos, trecho",
    [
        ({"rascunho": "   "}, "rascunho"),
        ({"persona_id": "nao-existe"}, "desconhecida"),
        ({"rascunho": "a" * 4001}, "longo demais"),
        ({"contexto": "b" * 1501}, "longo demais"),
    ],
)
def test_validacoes_nao_chamam_o_modelo(llm_falso, campos, trecho):
    r = _pedir(**campos)
    assert r.status_code == 400
    assert trecho in r.json()["detail"]
    assert llm_falso == []


def test_modelo_sem_formato_vira_mensagem_inteira():
    d = separar_secoes_fale("Oi, desculpa pelo atraso de ontem.")
    assert d["mensagem"] == "Oi, desculpa pelo atraso de ontem."
    assert d["intencao"] == d["analise"] == d["dica"] == ""


def test_aceita_titulos_em_negrito_e_sem_acento():
    d = separar_secoes_fale("**INTENCAO:**\nPedir desculpa.\n**MENSAGEM**\nFoi mal, errei.\n**ANALISE**\n- ok")
    assert d["intencao"] == "Pedir desculpa."
    assert d["mensagem"] == "Foi mal, errei."
    assert d["analise"] == "- ok"


def test_remove_separadores_entre_secoes():
    # Saída real do ministral-8b em 19/09/2026: "---" colado no fim das seções.
    d = separar_secoes_fale(
        "### INTENÇÃO\nNão quer perder a amizade. ---\n\n"
        "### ANÁLISE\n- Soa agressivo.\n\n---\n"
        "### MENSAGEM\n\"Mano, foi a terceira vez no mês.\"\n\n---\n"
        "### DICA\nMande com calma."
    )
    assert d["intencao"] == "Não quer perder a amizade."
    assert d["analise"] == "- Soa agressivo."
    assert d["mensagem"] == "Mano, foi a terceira vez no mês."
    assert d["dica"] == "Mande com calma."


def test_mantem_aspas_que_fazem_parte_da_mensagem():
    d = separar_secoes_fale('### MENSAGEM\n"Oi" foi o que ele disse, e "tchau" depois.')
    assert d["mensagem"] == '"Oi" foi o que ele disse, e "tchau" depois.'
