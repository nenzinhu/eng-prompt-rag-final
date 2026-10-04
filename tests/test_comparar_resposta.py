"""Duas IAs avaliam a resposta com RAG opcional, sem chamadas de rede."""
import asyncio

import httpx
import pytest
from fastapi.testclient import TestClient

import index


@pytest.mark.parametrize("cenario", ["relevante", "fraco", "vazio", "falha", "sem_config"])
def test_comparar_avalia_resposta_com_rag_opcional(monkeypatch, cenario):
    monkeypatch.setattr(index, "APP_PRIVADO", False)
    monkeypatch.setattr(index, "SUPABASE_URL", "" if cenario == "sem_config" else "https://teste.invalid")
    monkeypatch.setattr(index, "SUPABASE_ANON_KEY", "teste")
    monkeypatch.setattr(index, "resolver_modelo", lambda p, m: m)
    chamadas = []

    async def limitar(request):
        pass

    async def embeddings(textos):
        if cenario == "sem_config":
            pytest.fail("Não deve consultar embeddings sem configuração")
        return [[0.0] * 384]

    async def buscar(*args, **kwargs):
        if cenario == "falha":
            raise httpx.ConnectError("offline")
        if cenario == "vazio":
            return []
        return [{"content": "Material de teste", "source": "apostila.pdf", "page": 3,
                 "similarity": 0.95 if cenario == "relevante" else 0.01, "modelo": "gte"}]

    async def llm(provider, modelo, system, user, **kwargs):
        chamadas.append((system, user))
        await asyncio.sleep(0)
        return "Justificativa curta.\nRESPOSTA DIRETA: Alternativa B."

    monkeypatch.setattr(index, "_limitar_llm", limitar)
    monkeypatch.setattr(index, "gerar_embeddings", embeddings)
    monkeypatch.setattr(index, "buscar_chunks", buscar)
    monkeypatch.setattr(index, "chamar_llm", llm)
    with TestClient(index.app) as client:
        r = client.post("/api/comparar", json={
            "pergunta": "Qual alternativa? A) Um B) Dois",
            "resposta_aluno": "Marquei A porque achei melhor",
            "modelos": [{"provider": "groq", "modelo": "um"},
                        {"provider": "nous", "modelo": "dois"}],
        })
    assert r.status_code == 200
    data = r.json()
    assert len(chamadas) == 2
    assert all("Marquei A porque achei melhor" in user for _, user in chamadas)
    assert chamadas[0][1] == chamadas[1][1]
    assert data["base_resposta"] == ("rag_ia" if cenario == "relevante" else "ia")
    if cenario == "relevante":
        assert data["contexto"][0]["fonte"] == "apostila.pdf"
    else:
        assert data["contexto"] == []
        assert data["confianca_media"] == 0
    if cenario == "falha":
        assert data["motivo_sem_rag"] == "busca_indisponivel"
