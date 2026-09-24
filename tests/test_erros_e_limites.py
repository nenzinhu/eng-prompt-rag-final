"""Testes das falhas que a tela escondia ("Erro 500 na requisição").

Dois defeitos reais, ambos vistos em 10/09/2026:

1. Exceção não tratada (httpx, pypdf) fazia o Starlette responder em TEXTO PURO
   — o front não achava o campo `detail` e mostrava só "Erro 500 na requisição",
   sem pista de nada.
2. O app anunciava 25 MB de upload, mas a Vercel recusa qualquer corpo acima de
   4,5 MB antes do código rodar (413 FUNCTION_PAYLOAD_TOO_LARGE, medido no
   navegador: 3 MB passa, 5 MB é cortado).

    .venv/Scripts/python.exe -m pytest tests/ -v
"""
import asyncio
import sys
from pathlib import Path

import httpx
import pytest
from fastapi import HTTPException, Request
from fastapi.testclient import TestClient

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "api"))

import index  # noqa: E402

cliente = TestClient(index.app, raise_server_exceptions=False)


# ── 1. Falha interna precisa virar JSON legível ─────────────────────────────


def test_falha_inesperada_vira_json():
    """A rota levanta uma exceção genérica; o corpo tem de ser JSON com `detail`."""

    @index.app.get("/api/_teste_quebra")
    def _quebra():  # pragma: no cover - só existe para o teste
        raise RuntimeError("quebrou de propósito")

    r = cliente.get("/api/_teste_quebra")
    assert r.status_code == 500
    assert r.headers["content-type"].startswith("application/json")
    corpo = r.json()
    assert "detail" in corpo
    assert "RuntimeError" in corpo["detail"]
    assert "quebrou de propósito" in corpo["detail"]


def test_falha_do_supabase_diz_qual_servico_e_status():
    """Erro do Supabase tem de aparecer com status e trecho do corpo."""

    @index.app.get("/api/_teste_supabase")
    def _supabase():  # pragma: no cover
        pedido = httpx.Request("POST", "https://exemplo.supabase.co/rest/v1/ementas_chunks")
        resposta = httpx.Response(401, text="permission denied for table", request=pedido)
        raise httpx.HTTPStatusError("erro", request=pedido, response=resposta)

    r = cliente.get("/api/_teste_supabase")
    assert r.status_code == 500
    detalhe = r.json()["detail"]
    assert "exemplo.supabase.co" in detalhe
    assert "401" in detalhe
    assert "permission denied" in detalhe


def test_pdf_ilegivel_da_422_em_vez_de_500(monkeypatch):
    """PDF que o pypdf não lê: mensagem clara, sem derrubar a rota."""

    async def _baixar(_nome):
        return b"%PDF-1.4 conteudo falso"

    def _explode(_dados, _nome=""):
        raise ValueError("Invalid Elementary Object")

    async def _listar():
        return ["certificado.pdf"]

    monkeypatch.setattr(index, "listar_documentos_storage", _listar)
    monkeypatch.setattr(index, "baixar_documento_storage", _baixar)
    monkeypatch.setattr(index, "extrair_paginas", _explode)

    with pytest.raises(HTTPException) as erro:
        asyncio.run(index._analisar_ingestao("certificado.pdf"))

    assert erro.value.status_code == 422
    assert "certificado.pdf" in str(erro.value.detail)
    assert "ValueError" in str(erro.value.detail)


# ── 2. O teto de upload precisa ser o real ──────────────────────────────────


def test_limite_local_e_de_25_mb(monkeypatch):
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("MAX_UPLOAD_MB", raising=False)
    assert index.limite_upload_mb() == 25
    assert "localmente" in index.motivo_limite_upload()


def test_limite_na_vercel_e_de_4_mb(monkeypatch):
    """Na Vercel, anunciar 25 MB faz o aluno tomar um 413 sem explicação."""
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.delenv("MAX_UPLOAD_MB", raising=False)
    assert index.limite_upload_mb() == 4
    motivo = index.motivo_limite_upload()
    assert "4,5 MB" in motivo
    assert "localmente" in motivo  # diz o que fazer, não só o que falhou


def test_max_upload_mb_sobrepoe(monkeypatch):
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("MAX_UPLOAD_MB", "7")
    assert index.limite_upload_mb() == 7
    assert "MAX_UPLOAD_MB" in index.motivo_limite_upload()


def test_max_upload_mb_invalido_cai_no_padrao(monkeypatch):
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("MAX_UPLOAD_MB", "não-é-número")
    assert index.limite_upload_mb() == 4


def test_config_publica_explica_o_limite(monkeypatch):
    monkeypatch.setenv("VERCEL", "1")
    r = cliente.get("/api/config")
    assert r.status_code == 200
    corpo = r.json()
    assert corpo["max_upload_mb"] == 4
    assert corpo["limite_upload_motivo"]


# ── 3. Limite de custo: modelo tem de estar na lista curada ─────────────────
#
# As rotas de geração são públicas (o aluno usa sem login), então a lista curada
# de modelos é o que impede alguém de mandar um nome de modelo caro e deixar a
# conta na chave do servidor.


def test_modelo_fora_da_lista_e_recusado():
    with pytest.raises(HTTPException) as erro:
        index.resolver_modelo("groq", "openai/gpt-modelo-caro-inventado")
    assert erro.value.status_code == 400
    assert "não está disponível" in str(erro.value.detail)


def test_modelo_da_lista_e_aceito():
    modelo = index.PROVIDERS["groq"]["models"][1]
    assert index.resolver_modelo("groq", modelo) == modelo


def test_modelo_vazio_cai_no_padrao_do_provedor():
    assert index.resolver_modelo("groq", None) == index.PROVIDERS["groq"]["models"][0]
    assert index.resolver_modelo("groq", "") == index.PROVIDERS["groq"]["models"][0]


def test_provedor_desconhecido_continua_recusado():
    with pytest.raises(HTTPException) as erro:
        index.resolver_modelo("provedor-que-nao-existe", None)
    assert erro.value.status_code == 400


# ── 4. Limite por IP precisa enxergar o cliente atrás do proxy ──────────────


@index.app.get("/api/_teste_ip")
def _rota_ip(request: Request):  # pragma: no cover - só existe para o teste
    return {"ip": index._ip_cliente(request)}


def test_ip_usa_x_forwarded_for_quando_ha_proxy():
    """Sem isto, todo mundo atrás do proxy divide o mesmo balde de requisições."""
    r = cliente.get("/api/_teste_ip", headers={"x-forwarded-for": "203.0.113.7, 10.0.0.1"})
    assert r.json()["ip"] == "203.0.113.7"  # o primeiro é o cliente; o resto, proxies


def test_ip_prefere_x_real_ip():
    r = cliente.get("/api/_teste_ip", headers={"x-real-ip": "203.0.113.9", "x-forwarded-for": "198.51.100.2"})
    assert r.json()["ip"] == "203.0.113.9"


def test_ip_cai_no_socket_sem_cabecalho_de_proxy():
    r = cliente.get("/api/_teste_ip")
    assert r.json()["ip"]  # sem proxy, usa o IP da conexão (o TestClient usa "testclient")


# ── 5. /api/pdfs expõe o bucket: exige admin, como /api/duplicatas ──────────


def test_pdfs_sem_token_e_recusado(monkeypatch):
    monkeypatch.setattr(index, "ADMIN_TOKEN", "segredo-de-teste")
    r = cliente.get("/api/pdfs")
    assert r.status_code == 401


def test_pdfs_com_token_valido_lista(monkeypatch):
    async def _listar():
        return ["apostila.pdf"]

    monkeypatch.setattr(index, "ADMIN_TOKEN", "segredo-de-teste")
    monkeypatch.setattr(index, "listar_documentos_storage", _listar)
    r = cliente.get("/api/pdfs", headers={"X-Admin-Token": "segredo-de-teste"})
    assert r.status_code == 200
    assert r.json()["arquivos"] == ["apostila.pdf"]


def test_pdfs_sem_admin_configurado_falha_fechada(monkeypatch):
    monkeypatch.setattr(index, "ADMIN_TOKEN", "")
    r = cliente.get("/api/pdfs")
    assert r.status_code == 503


def test_provedores_novos_aparecem_e_validam_modelo():
    """Together, Cohere, Hugging Face e ModelScope entram no seletor com a lista curada."""
    lista = index.listar_providers()
    for nome in ("together", "cohere", "huggingface", "modelscope"):
        cfg = index.PROVIDERS[nome]
        assert cfg["base_url"].startswith("https://")
        assert nome in lista and lista[nome]["models"] == cfg["models"]
        assert index.resolver_modelo(nome, None) == cfg["models"][0]
    with pytest.raises(index.HTTPException):
        index.resolver_modelo("together", "modelo-pago-qualquer")
