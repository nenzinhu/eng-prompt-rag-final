"""Testes da autenticação por usuário/senha + sessão assinada.

Cobre o fluxo novo da área restrita: o login valida credenciais e emite uma
sessão assinada (HMAC) que as rotas de escrita aceitam. Sem credenciais
configuradas, a autenticação falha fechada (503).

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
def config_admin(monkeypatch):
    monkeypatch.setattr(index, "ADMIN_USER", "admin-teste")
    monkeypatch.setattr(index, "ADMIN_PASS", "senha-falsa-de-teste")
    monkeypatch.setattr(index, "ADMIN_TOKEN", "segredo-de-teste")


def test_login_valido_emite_sessao(config_admin):
    token, exp = index.emitir_sessao("admin-teste")
    assert token.count(".") == 1  # payload.assinatura
    assert exp > index.time.time()
    assert index.validar_sessao(token) is True


def test_sessao_rejeita_assinatura_trocada(config_admin):
    token, _ = index.emitir_sessao("admin-teste")
    payload, assinatura = token.rsplit(".", 1)
    forjado = f"{payload}.{'A' * len(assinatura)}"
    assert index.validar_sessao(forjado) is False


def test_sessao_rejeita_payload_alterado(config_admin):
    token, _ = index.emitir_sessao("admin-teste")
    payload, assinatura = token.rsplit(".", 1)
    # Troca o último char do payload (sem re-assinar).
    novo_payload = payload[:-1] + ("B" if payload[-1] != "B" else "C")
    assert index.validar_sessao(f"{novo_payload}.{assinatura}") is False


def test_sessao_expirada_e_rejeitada(config_admin, monkeypatch):
    monkeypatch.setattr(index, "SESSAO_ADMIN_SEGUNDOS", -1)  # expira imediatamente
    token, _ = index.emitir_sessao("admin-teste")
    assert index.validar_sessao(token) is False


def test_sessao_invalida_nao_passa_exigir_admin(config_admin):
    assert index.validar_sessao("lixo.sem.sentido") is False
    assert index.validar_sessao("") is False
    assert index.validar_sessao("sem ponto") is False


def test_login_sem_credenciais_configuradas_falha_fechada(monkeypatch):
    monkeypatch.setattr(index, "ADMIN_USER", "")
    monkeypatch.setattr(index, "ADMIN_PASS", "")
    monkeypatch.setattr(index, "ADMIN_TOKEN", "")
    with pytest.raises(Exception) as e:
        index.emitir_sessao("admin-teste")
    assert "ADMIN_TOKEN" in str(e.value)


def test_credenciais_comparacao_constante(config_admin):
    """A comparação de credenciais é em tempo constante."""
    assert index.iguais_em_tempo_constante("senha", "senha") is True
    assert index.iguais_em_tempo_constante("senha", "outra") is False


# ── Credenciais com acento (bug B-02: dava HTTP 500) ───────────────────────


def test_comparacao_aceita_acento_sem_quebrar():
    """`secrets.compare_digest` com str não-ASCII levantava TypeError.

    Com acento na senha certa, o admin não entrava nem digitando certo.
    """
    assert index.iguais_em_tempo_constante("sénha", "sénha") is True
    assert index.iguais_em_tempo_constante("sénha", "senha") is False
    assert index.iguais_em_tempo_constante("", "") is True


def test_login_com_senha_acentuada_errada_responde_401(config_admin):
    """Senha acentuada errada é 401, não 500."""
    r = cliente.post("/api/admin/login", json={"usuario": "admin-teste", "senha": "sénha"})
    assert r.status_code == 401


def test_login_com_senha_acentuada_correta_entra(config_admin, monkeypatch):
    monkeypatch.setattr(index, "ADMIN_PASS", "sénha-falsa-de-teste")
    r = cliente.post(
        "/api/admin/login", json={"usuario": "admin-teste", "senha": "sénha-falsa-de-teste"}
    )
    assert r.status_code == 200
    assert index.validar_sessao(r.json()["token"]) is True


def test_token_de_admin_acentuado_responde_401(config_admin):
    """Token com acento no header também era 500.

    Cabeçalho HTTP trafega em latin-1, e o Starlette entrega a string já
    decodificada — ou seja, com caractere fora do ASCII.
    """
    r = cliente.get("/api/admin/verificar", headers={"X-Admin-Token": "é".encode("latin-1")})
    assert r.status_code == 401
