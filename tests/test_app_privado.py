"""Testes do modo app privado (APP_PRIVADO=1).

Com a opção ligada, toda rota /api exige login; a sessão vai num cookie
HttpOnly emitido pelo /api/admin/login. Scripts continuam entrando pelo header
X-Admin-Token. Sem a opção, nada muda.
"""
import pytest
from fastapi.testclient import TestClient

import index


@pytest.fixture
def privado(monkeypatch):
    monkeypatch.setattr(index, "APP_PRIVADO", True)
    monkeypatch.setattr(index, "ADMIN_USER", "dono")
    monkeypatch.setattr(index, "ADMIN_PASS", "senha-de-teste")
    monkeypatch.setattr(index, "ADMIN_TOKEN", "segredo-de-teste")
    monkeypatch.setattr(index, "SESSION_SECRET", "")
    # Sem Supabase: o limite de login fica só na memória.
    monkeypatch.setattr(index, "SUPABASE_URL", "")
    index._logins_por_ip.clear()
    yield
    index._logins_por_ip.clear()


def _cliente() -> TestClient:
    return TestClient(index.app, raise_server_exceptions=False)


def test_sem_login_a_api_responde_401(privado):
    r = _cliente().get("/api/providers")
    assert r.status_code == 401
    assert r.headers["x-sessao"] == "ausente"


def test_estado_da_sessao_responde_sem_login(privado):
    r = _cliente().get("/api/sessao")
    assert r.status_code == 200
    assert r.json() == {"privado": True, "logado": False}


def test_login_grava_cookie_e_libera_a_api(privado):
    cliente = _cliente()
    r = cliente.post("/api/admin/login", json={"usuario": "dono", "senha": "senha-de-teste"})
    assert r.status_code == 200
    cookie = r.headers["set-cookie"]
    assert index.COOKIE_SESSAO in cookie
    assert "HttpOnly" in cookie
    assert "samesite=lax" in cookie.lower()

    assert cliente.get("/api/sessao").json() == {"privado": True, "logado": True}
    assert cliente.get("/api/providers").status_code == 200


def test_senha_errada_nao_grava_cookie(privado):
    r = _cliente().post("/api/admin/login", json={"usuario": "dono", "senha": "errada"})
    assert r.status_code == 401
    assert "set-cookie" not in r.headers


def test_cookie_forjado_e_recusado(privado):
    cliente = _cliente()
    cliente.cookies.set(index.COOKIE_SESSAO, "eyJ1IjoieCJ9.assinatura-falsa")
    assert cliente.get("/api/providers").status_code == 401


def test_header_de_admin_continua_valendo_para_scripts(privado):
    r = _cliente().get("/api/providers", headers={"X-Admin-Token": "segredo-de-teste"})
    assert r.status_code == 200


def test_sair_apaga_o_cookie(privado):
    cliente = _cliente()
    cliente.post("/api/admin/login", json={"usuario": "dono", "senha": "senha-de-teste"})
    r = cliente.post("/api/sessao/sair")
    assert r.status_code == 200
    assert cliente.get("/api/providers").status_code == 401


def test_sem_admin_token_falha_fechada(privado, monkeypatch):
    monkeypatch.setattr(index, "ADMIN_TOKEN", "")
    cliente = _cliente()
    assert cliente.post(
        "/api/admin/login", json={"usuario": "dono", "senha": "senha-de-teste"}
    ).status_code == 503
    assert cliente.get("/api/providers").status_code == 401


def test_desligado_nada_muda(monkeypatch):
    monkeypatch.setattr(index, "APP_PRIVADO", False)
    cliente = _cliente()
    assert cliente.get("/api/providers").status_code == 200
    assert cliente.get("/api/sessao").json() == {"privado": False, "logado": True}
