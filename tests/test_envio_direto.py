"""Envio direto: arquivos acima do teto da Vercel (4,5 MB por requisição).

O navegador manda o arquivo ao Storage por uma URL assinada e o servidor só
confirma. Estes testes fixam que a confirmação aplica as mesmas regras do
/api/upload e que o caminho vindo do cliente não alcança outros objetos.

    .venv/Scripts/python.exe -m pytest tests/ -v
"""
import hashlib
import sys
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "api"))

import index  # noqa: E402

CAMINHO = f"{index.PREFIXO_ENVIO}/{'a' * 32}/Apostila.pdf"


@pytest.fixture
def storage(monkeypatch):
    """Storage simulado: `objetos` guarda o bucket, `alteracoes` o que mudou."""
    estado = {"objetos": {}, "alteracoes": [], "risco": None}

    async def _listar():
        return [
            {"nome": n, "md5": hashlib.md5(d).hexdigest()}
            for n, d in estado["objetos"].items()
            if "/" not in n
        ]

    async def _baixar(nome):
        if nome not in estado["objetos"]:
            req = httpx.Request("GET", "https://x")
            raise httpx.HTTPStatusError("404", request=req, response=httpx.Response(400, request=req))
        return estado["objetos"][nome]

    async def _gravar(nome, dados, _m=""):
        estado["objetos"][nome] = dados
        estado["alteracoes"].append(("gravou", nome))

    async def _remover(nome):
        estado["objetos"].pop(nome, None)
        estado["alteracoes"].append(("removeu", nome))

    async def _renomear(a, b):
        estado["alteracoes"].append(("renomeou", a, b))

    async def _risco(*_a):
        return estado["risco"]

    async def _url(caminho):
        return f"https://supabase.test/storage/v1/object/upload/sign/ementas/{caminho}?token=t"

    monkeypatch.setattr(index, "listar_arquivos_storage", _listar)
    monkeypatch.setattr(index, "baixar_documento_storage", _baixar)
    monkeypatch.setattr(index, "upload_documento_storage", _gravar)
    monkeypatch.setattr(index, "remover_documento_storage", _remover)
    monkeypatch.setattr(index, "renomear_fonte_chunks", _renomear)
    monkeypatch.setattr(index, "_risco_de_perda", _risco)
    monkeypatch.setattr(index, "url_envio_assinada", _url)
    index.app.dependency_overrides[index.exigir_admin] = lambda: None
    yield estado
    index.app.dependency_overrides.clear()


def _post(rota, corpo):
    return TestClient(index.app).post(rota, json=corpo)


def test_url_gera_caminho_provisorio_com_nome_sem_acento(storage):
    r = _post("/api/upload/url", {"nome": "Introdução.pdf", "tamanho": 20 * 1024 * 1024})
    assert r.status_code == 200
    corpo = r.json()
    assert corpo["nome"] == "Introducao.pdf"
    assert corpo["renomeado"] is True
    assert index._CAMINHO_ENVIO.match(corpo["caminho"])
    assert corpo["caminho"].endswith("/Introducao.pdf")
    assert corpo["url"].startswith("https://supabase.test/")


@pytest.mark.parametrize(
    ("nome", "tamanho"),
    [("planilha.xlsx", 1000), ("a.pdf", 0), ("a.pdf", (index.LIMITE_ENVIO_DIRETO_MB + 1) * 1024 * 1024)],
)
def test_url_recusa_formato_vazio_e_acima_do_teto(storage, nome, tamanho):
    assert _post("/api/upload/url", {"nome": nome, "tamanho": tamanho}).status_code == 400


@pytest.mark.parametrize(
    "caminho",
    [
        "Apostila.pdf",  # objeto final do bucket
        f"{index.PREFIXO_ENVIO}/../Apostila.pdf",
        f"{index.PREFIXO_ENVIO}/{'a' * 32}/../../Apostila.pdf",
        f"{index.PREFIXO_ENVIO}/curto/Apostila.pdf",
    ],
)
def test_confirmar_recusa_caminho_fora_da_area_provisoria(storage, caminho):
    storage["objetos"]["Apostila.pdf"] = b"indexado"
    r = _post("/api/upload/confirmar", {"caminho": caminho})
    assert r.status_code == 400
    assert storage["alteracoes"] == []


def test_confirmar_grava_no_nome_final_e_apaga_o_provisorio(storage):
    storage["objetos"][CAMINHO] = b"conteudo grande"
    r = _post("/api/upload/confirmar", {"caminho": CAMINHO})
    assert r.status_code == 200
    assert r.json()["salvos"] == ["Apostila.pdf"]
    assert storage["objetos"] == {"Apostila.pdf": b"conteudo grande"}


def test_confirmar_conteudo_identico_e_ignorado(storage):
    storage["objetos"]["Apostila.pdf"] = b"mesmo"
    storage["objetos"][CAMINHO] = b"mesmo"
    r = _post("/api/upload/confirmar", {"caminho": CAMINHO})
    assert r.status_code == 200
    assert r.json()["ignorados"][0]["motivo"] == "conteúdo idêntico já indexado"
    assert CAMINHO not in storage["objetos"]
    assert ("gravou", "Apostila.pdf") not in storage["alteracoes"]


def test_confirmar_bloqueado_mantem_provisorio_para_forcar_depois(storage):
    storage["objetos"]["Apostila.pdf"] = b"versao antiga"
    storage["objetos"][CAMINHO] = b"versao nova"
    storage["risco"] = {"mensagem": "rende menos texto", "avisos": []}

    r = _post("/api/upload/confirmar", {"caminho": CAMINHO})
    assert r.status_code == 409
    assert storage["objetos"][CAMINHO] == b"versao nova"
    assert storage["objetos"]["Apostila.pdf"] == b"versao antiga"

    r = _post("/api/upload/confirmar", {"caminho": CAMINHO, "forcar": True})
    assert r.status_code == 200
    assert r.json()["substituidos"][0]["motivo"] == "versão atualizada do mesmo arquivo"
    assert storage["objetos"] == {"Apostila.pdf": b"versao nova"}


def test_confirmar_mesmo_conteudo_com_outro_nome_renomeia(storage):
    storage["objetos"]["Antiga.pdf"] = b"conteudo X"
    storage["objetos"][CAMINHO] = b"conteudo X"
    r = _post("/api/upload/confirmar", {"caminho": CAMINHO})
    assert r.status_code == 200
    assert ("renomeou", "Antiga.pdf", "Apostila.pdf") in storage["alteracoes"]
    assert storage["objetos"] == {"Apostila.pdf": b"conteudo X"}


def test_confirmar_sem_arquivo_no_storage_da_404(storage):
    r = _post("/api/upload/confirmar", {"caminho": CAMINHO})
    assert r.status_code == 404
    assert "Envie de novo" in r.json()["detail"]


def test_config_anuncia_envio_direto():
    corpo = TestClient(index.app).get("/api/config").json()
    assert corpo["envio_direto_mb"] == index.LIMITE_ENVIO_DIRETO_MB
