"""Testes do "Me testa" (Praticar): leitura das questões e a rota /api/praticar/questoes.

O ponto central é "nunca inventar": uma questão só leva citação quando o par
fonte+página existe nos trechos recuperados.
"""
import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "api"))

import index  # noqa: E402
from rag_core import extrair_questoes  # noqa: E402

cliente = TestClient(index.app, raise_server_exceptions=False)

TRECHO = {"content": "Few-shot é dar exemplos no prompt.", "source": "apostila.pdf", "page": 3, "similarity": 0.8}


def _questao(**extra):
    base = {
        "pergunta": "O que é few-shot?",
        "alternativas": ["Dar exemplos no prompt", "Treinar o modelo", "Usar um modelo menor", "Aumentar a temperatura"],
        "correta": 0,
        "explicacao": "Os exemplos vão no próprio prompt.",
        "fonte": "apostila.pdf",
        "pagina": 3,
    }
    base.update(extra)
    return base


def _bruto(*questoes):
    return "Aqui está:\n" + json.dumps({"questoes": list(questoes)}, ensure_ascii=False)


def test_questao_valida_mantem_a_citacao():
    [q] = extrair_questoes(_bruto(_questao()), [TRECHO])
    assert q["correta"] == 0 and q["fonte"] == "apostila.pdf" and q["pagina"] == 3


def test_pagina_inventada_vira_citacao_nenhuma():
    [q] = extrair_questoes(_bruto(_questao(pagina=99)), [TRECHO])
    assert q["fonte"] is None and q["pagina"] is None


def test_correta_em_letra_e_pagina_em_texto_sao_aceitas():
    [q] = extrair_questoes(_bruto(_questao(correta="b", pagina="3")), [TRECHO])
    assert q["correta"] == 1 and q["pagina"] == 3


@pytest.mark.parametrize(
    "ruim",
    [
        {"correta": 7},
        {"correta": True},
        {"alternativas": ["só uma", "duas"]},
        {"alternativas": ["a", "", "c"]},
        {"pergunta": "  "},
        {"alternativas": "a, b, c"},
    ],
)
def test_questao_malformada_e_descartada(ruim):
    assert extrair_questoes(_bruto(_questao(**ruim)), [TRECHO]) == []


def test_resposta_sem_json_ou_com_formato_errado():
    assert extrair_questoes("não sei", [TRECHO]) == []
    assert extrair_questoes('{"questoes": null}', [TRECHO]) == []


@pytest.fixture
def dubles(monkeypatch):
    estado = {"respostas": [_bruto(_questao(), _questao(correta=2))], "chamadas": 0}

    async def _llm(provider, modelo, system_prompt, user_prompt, timeout=None):
        estado["chamadas"] += 1
        return estado["respostas"].pop(0) if estado["respostas"] else "sem json"

    async def _emb(textos):
        return [[0.0] * 3 for _ in textos]

    async def _chunks(emb, n=6, texto=None):
        return [TRECHO]

    monkeypatch.setattr(index, "chamar_llm", _llm)
    monkeypatch.setattr(index, "gerar_embeddings", _emb)
    monkeypatch.setattr(index, "buscar_chunks", _chunks)
    index._uso_por_ip.clear()
    return estado


def test_rota_devolve_questoes_na_quantidade_pedida(dubles):
    r = cliente.post("/api/praticar/questoes", json={"tema": "few-shot", "quantidade": 1, "provider": "groq"})
    assert r.status_code == 200
    corpo = r.json()
    assert len(corpo["questoes"]) == 1 and corpo["questoes"][0]["pagina"] == 3


def test_rota_tenta_de_novo_e_depois_explica_a_falha(dubles):
    dubles["respostas"] = ["sem json", _bruto(_questao())]
    assert cliente.post("/api/praticar/questoes", json={"provider": "groq"}).status_code == 200
    dubles["respostas"] = []
    r = cliente.post("/api/praticar/questoes", json={"provider": "groq"})
    assert r.status_code == 502 and "formato" in r.json()["detail"]
