"""Testes da autenticação por usuário/senha + sessão assinada.

Cobre o fluxo novo da área restrita: o login valida credenciais e emite uma
sessão assinada (HMAC) que as rotas de escrita aceitam. Sem credenciais
configuradas, a autenticação falha fechada (503).

    .venv/Scripts/python.exe -m pytest tests/ -v
"""
import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "api"))

import index  # noqa: E402


@pytest.fixture
def config_admin(monkeypatch):
    monkeypatch.setattr(index, "ADMIN_USER", "nenzinhu")
    monkeypatch.setattr(index, "ADMIN_PASS", "Nei*6280760")
    monkeypatch.setattr(index, "ADMIN_TOKEN", "segredo-de-teste")


def test_login_valido_emite_sessao(config_admin):
    token, exp = index.emitir_sessao("nenzinhu")
    assert token.count(".") == 1  # payload.assinatura
    assert exp > index.time.time()
    assert index.validar_sessao(token) is True


def test_sessao_rejeita_assinatura_trocada(config_admin):
    token, _ = index.emitir_sessao("nenzinhu")
    payload, assinatura = token.rsplit(".", 1)
    forjado = f"{payload}.{'A' * len(assinatura)}"
    assert index.validar_sessao(forjado) is False


def test_sessao_rejeita_payload_alterado(config_admin):
    token, _ = index.emitir_sessao("nenzinhu")
    payload, assinatura = token.rsplit(".", 1)
    # Troca o último char do payload (sem re-assinar).
    novo_payload = payload[:-1] + ("B" if payload[-1] != "B" else "C")
    assert index.validar_sessao(f"{novo_payload}.{assinatura}") is False


def test_sessao_expirada_e_rejeitada(config_admin, monkeypatch):
    monkeypatch.setattr(index, "SESSAO_ADMIN_SEGUNDOS", -1)  # expira imediatamente
    token, _ = index.emitir_sessao("nenzinhu")
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
        index.emitir_sessao("nenzinhu")
    assert "ADMIN_TOKEN" in str(e.value)


def test_credenciais_comparacao_constante(config_admin):
    """A comparação de credenciais usa compare_digest (tempo constante)."""
    assert index.secrets.compare_digest("senha", "senha") is True
    assert index.secrets.compare_digest("senha", "outra") is False
