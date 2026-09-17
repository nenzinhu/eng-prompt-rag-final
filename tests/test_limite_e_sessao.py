"""Limite de uso compartilhado (Supabase) e segredo de sessão separado.

    .venv/Scripts/python.exe -m pytest tests/ -v
"""
import asyncio
import sys
from pathlib import Path

import httpx
import pytest
from fastapi import HTTPException
from starlette.requests import Request

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "api"))

import index  # noqa: E402


def _request(ip="1.2.3.4"):
    return Request({"type": "http", "headers": [(b"x-real-ip", ip.encode())], "client": ("9.9.9.9", 1)})


class _ClienteFalso:
    """Responde ao RPC `consumir_cota` com o que o teste mandar."""

    def __init__(self, respostas, chamadas):
        self.respostas = respostas
        self.chamadas = chamadas

    async def post(self, url, json=None, **_):
        self.chamadas.append(json["p_chave"])
        resp = self.respostas(json["p_chave"])
        if isinstance(resp, Exception):
            raise resp
        return httpx.Response(200, json=resp, request=httpx.Request("POST", url))


def _preparar(monkeypatch, respostas):
    chamadas: list[str] = []
    cliente = _ClienteFalso(respostas, chamadas)

    class _Ctx:
        def __init__(self, _t):
            pass

        async def __aenter__(self):
            return cliente

        async def __aexit__(self, *a):
            return False

    monkeypatch.setattr(index, "_http", _Ctx)
    monkeypatch.setattr(index, "SUPABASE_URL", "https://exemplo.supabase.co")
    monkeypatch.setattr(index, "SUPABASE_SERVICE_ROLE_KEY", "service")
    index._uso_por_ip.clear()
    return chamadas


def test_cota_diaria_estourada_devolve_429(monkeypatch):
    chamadas = _preparar(monkeypatch, lambda chave: not chave.startswith("ip-dia"))
    with pytest.raises(HTTPException) as e:
        asyncio.run(index._limitar_llm(_request()))
    assert e.value.status_code == 429
    assert "diário" in e.value.detail
    assert chamadas[0].startswith("ip-min:")


def test_ip_nao_vai_em_claro_para_o_banco(monkeypatch):
    chamadas = _preparar(monkeypatch, lambda _c: True)
    asyncio.run(index._limitar_llm(_request("200.100.50.25")))
    assert chamadas and all("200.100.50.25" not in c for c in chamadas)
    assert "global-dia" in chamadas


def test_banco_fora_do_ar_nao_derruba_o_app(monkeypatch):
    _preparar(monkeypatch, lambda _c: httpx.ConnectError("sem rede"))
    asyncio.run(index._limitar_llm(_request()))  # não levanta


def test_sem_service_role_so_limite_local(monkeypatch):
    chamadas = _preparar(monkeypatch, lambda _c: False)
    monkeypatch.setattr(index, "SUPABASE_SERVICE_ROLE_KEY", "")
    asyncio.run(index._limitar_llm(_request()))
    assert chamadas == []


def test_session_secret_invalida_sessoes_sem_trocar_admin_token(monkeypatch):
    monkeypatch.setattr(index, "ADMIN_TOKEN", "token-mestre")
    monkeypatch.setattr(index, "SESSION_SECRET", "segredo-1")
    token, _ = index.emitir_sessao("admin")
    assert index.validar_sessao(token)

    monkeypatch.setattr(index, "SESSION_SECRET", "segredo-2")
    assert not index.validar_sessao(token), "trocar SESSION_SECRET derruba as sessões"
    # O ADMIN_TOKEN direto (scripts/CLI) continua valendo.
    asyncio.run(index.exigir_admin("token-mestre"))
