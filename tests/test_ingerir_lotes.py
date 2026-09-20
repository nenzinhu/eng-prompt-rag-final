"""Testes do laço de ingestão em lotes.

O lote é o que permite indexar um documento grande dentro do tempo da função
serverless (60 s por chamada). O defeito aqui era desperdício de tempo: cada
lote reanalisava o documento inteiro (download + extração + varredura do
índice), e um PDF de 123 páginas gera 11 lotes — trabalho repetido que
aproximava a indexação do limite da função.

    .venv/Scripts/python.exe -m pytest tests/ -v
"""
import asyncio
import sys
from pathlib import Path

import pytest
from fastapi import HTTPException

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "api"))

import index  # noqa: E402


def montar(monkeypatch, *, analises: list, chunks: list[dict]):
    """Registra quantas vezes a análise foi chamada e serve os chunks em lotes."""
    chamadas = {"analise": 0, "inseridos": 0}

    async def _analisar(_arquivo):
        chamadas["analise"] += 1
        return {"ok": True, "avisos": [], "arquivo": _arquivo, "chunks_novos": len(chunks)}

    async def _baixar(_nome):
        return b"pdf falso"

    def _extrair(_dados, _nome=""):
        # Cada "página" rende exatamente 1 chunk: 480 caracteres ficam abaixo do
        # tamanho de chunk (900) e acima do mínimo (80). Texto maior quebraria em
        # dois e a contagem de lotes mudaria.
        return [(i + 1, "texto " * 80) for i in range(len(chunks))]

    async def _emb(textos):
        return [[0.0] * 384 for _ in textos]

    async def _inserir(rows):
        chamadas["inseridos"] += len(rows)

    async def _maior_id(_nome):
        # Chunks antigos têm id <= 500; os novos nascem acima disso, como a
        # sequência `identity` do Postgres faz. A ingestão confere isso antes de
        # apagar os antigos (guarda do S-1).
        return 500 + chamadas["inseridos"]

    async def _apagar_ate(_nome, corte):
        chamadas.setdefault("apagou", []).append((corte, chamadas["inseridos"]))

    monkeypatch.setattr(index, "_analisar_ingestao", _analisar)
    monkeypatch.setattr(index, "baixar_documento_storage", _baixar)
    monkeypatch.setattr(index, "extrair_paginas", _extrair)
    monkeypatch.setattr(index, "gerar_embeddings", _emb)
    monkeypatch.setattr(index, "inserir_chunks", _inserir)
    monkeypatch.setattr(index, "maior_id_da_fonte", _maior_id)
    monkeypatch.setattr(index, "apagar_chunks_ate_id", _apagar_ate)
    return chamadas


def test_lotes_seguintes_nao_reanalisam(monkeypatch):
    """Só o primeiro lote analisa; os seguintes vão direto ao trabalho."""
    chamadas = montar(monkeypatch, analises=[], chunks=[{}] * 50)

    r1 = asyncio.run(index.ingerir(index.IngerirReq(arquivo="doc.pdf", offset=0)))
    r2 = asyncio.run(index.ingerir(index.IngerirReq(arquivo="doc.pdf", offset=24)))
    r3 = asyncio.run(index.ingerir(index.IngerirReq(arquivo="doc.pdf", offset=48)))

    assert chamadas["analise"] == 1, "a análise deve rodar apenas no primeiro lote"
    assert r1["processado"] == 24
    assert r2["processado"] == 24
    assert r3["processado"] == 2
    assert r3["done"] is True


def test_chunks_antigos_so_saem_depois_do_ultimo_lote(monkeypatch):
    """Sem janela vazia: nada é apagado até todos os lotes novos entrarem."""
    chamadas = montar(monkeypatch, analises=[], chunks=[{}] * 50)

    r1 = asyncio.run(index.ingerir(index.IngerirReq(arquivo="doc.pdf", offset=0)))
    assert r1["corte_id"] == 500
    assert "apagou" not in chamadas, "o primeiro lote não pode apagar nada"
    asyncio.run(index.ingerir(index.IngerirReq(arquivo="doc.pdf", offset=24, corte_id=r1["corte_id"])))
    assert "apagou" not in chamadas
    asyncio.run(index.ingerir(index.IngerirReq(arquivo="doc.pdf", offset=48, corte_id=r1["corte_id"])))
    # Apagou uma vez só, com o corte certo, e depois dos 50 chunks novos inseridos.
    assert chamadas["apagou"] == [(500, 50)]


def test_documento_de_um_lote_troca_no_mesmo_pedido(monkeypatch):
    chamadas = montar(monkeypatch, analises=[], chunks=[{}] * 5)
    r = asyncio.run(index.ingerir(index.IngerirReq(arquivo="doc.pdf", offset=0)))
    assert r["done"] is True
    assert chamadas["apagou"] == [(500, 5)]


def _banco_simulado(monkeypatch, *, antigos: int, chunks: int, falhar_apagar_uma_vez=False):
    """Índice em memória com ids crescentes, para ver o estado final de verdade."""
    banco = {"ids": list(range(1, antigos + 1)), "proximo": antigos + 1, "falhou": False}
    montar(monkeypatch, analises=[], chunks=[{}] * chunks)

    async def _inserir(rows):
        for _ in rows:
            banco["ids"].append(banco["proximo"])
            banco["proximo"] += 1

    async def _maior_id(_nome):
        return max(banco["ids"], default=0)

    async def _apagar_ate(_nome, corte):
        if falhar_apagar_uma_vez and not banco["falhou"]:
            banco["falhou"] = True
            raise RuntimeError("Supabase fora do ar")
        banco["ids"] = [i for i in banco["ids"] if i > corte]

    async def _apagar_acima(_nome, piso):
        banco["ids"] = [i for i in banco["ids"] if i <= piso]

    monkeypatch.setattr(index, "inserir_chunks", _inserir)
    monkeypatch.setattr(index, "maior_id_da_fonte", _maior_id)
    monkeypatch.setattr(index, "apagar_chunks_ate_id", _apagar_ate)
    monkeypatch.setattr(index, "apagar_chunks_acima_de_id", _apagar_acima)
    return banco


def _lote(offset, corte=None, ultimo=None):
    req = index.IngerirReq(arquivo="doc.pdf", offset=offset, corte_id=corte, ultimo_id=ultimo)
    return asyncio.run(index.ingerir(req))


def test_retentativa_do_ultimo_lote_nao_duplica(monkeypatch):
    """Análise de 17/09/2026 (A1-06): o último lote inseria, o apagar falhava, e a
    retentativa inseria o lote de novo — 52 chunks onde deviam ser 50."""
    banco = _banco_simulado(monkeypatch, antigos=10, chunks=50, falhar_apagar_uma_vez=True)
    r1 = _lote(0)
    r2 = _lote(24, r1["corte_id"], r1["ultimo_id"])
    with pytest.raises(RuntimeError):
        _lote(48, r1["corte_id"], r2["ultimo_id"])
    r3 = _lote(48, r1["corte_id"], r2["ultimo_id"])  # mesma tentativa, repetida
    assert r3["done"] is True
    assert len(banco["ids"]) == 50, "só os 50 chunks novos, sem duplicata e sem os antigos"
    assert min(banco["ids"]) > 10


def test_retentativa_de_lote_do_meio_nao_duplica(monkeypatch):
    banco = _banco_simulado(monkeypatch, antigos=10, chunks=50)
    r1 = _lote(0)
    _lote(24, r1["corte_id"], r1["ultimo_id"])  # inseriu, mas a resposta "se perdeu"
    r2 = _lote(24, r1["corte_id"], r1["ultimo_id"])
    _lote(48, r1["corte_id"], r2["ultimo_id"])
    assert len(banco["ids"]) == 50


def test_limpeza_nunca_toca_nos_chunks_antigos(monkeypatch):
    """Um ultimo_id errado (abaixo do corte) não pode apagar o índice antigo."""
    banco = _banco_simulado(monkeypatch, antigos=10, chunks=50)
    r1 = _lote(0)
    _lote(24, r1["corte_id"], ultimo=0)
    assert set(range(1, 11)) <= set(banco["ids"])


def test_medir_indice_falha_fechada(monkeypatch):
    """Erro do banco ao medir não pode virar 'nada indexado' e liberar a troca."""
    import httpx

    class _Cliente:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def get(self, url, **k):
            return httpx.Response(503, request=httpx.Request("GET", url))

    monkeypatch.setattr(index.httpx, "AsyncClient", _Cliente)
    with pytest.raises(httpx.HTTPStatusError):
        asyncio.run(index.medir_indice_atual("doc.pdf"))


def test_primeiro_lote_ainda_bloqueia_com_409(monkeypatch):
    """A proteção contra perda de conteúdo continua valendo no primeiro lote."""

    async def _analisar(_arquivo):
        return {"ok": False, "avisos": ["perda de 90% do texto"], "arquivo": _arquivo}

    monkeypatch.setattr(index, "_analisar_ingestao", _analisar)

    with pytest.raises(HTTPException) as erro:
        asyncio.run(index.ingerir(index.IngerirReq(arquivo="doc.pdf", offset=0)))
    assert erro.value.status_code == 409


def test_forcar_ignora_o_bloqueio(monkeypatch):
    chamadas = montar(monkeypatch, analises=[], chunks=[{}] * 10)

    async def _analisar(_arquivo):
        chamadas["analise"] += 1
        return {"ok": False, "avisos": ["perda"], "arquivo": _arquivo}

    monkeypatch.setattr(index, "_analisar_ingestao", _analisar)
    r = asyncio.run(index.ingerir(index.IngerirReq(arquivo="doc.pdf", offset=0, forcar=True)))
    assert r["processado"] == 10


# ── Guarda S-1: ids novos precisam ficar ACIMA do corte ────────────────────


def test_nao_apaga_os_antigos_quando_os_ids_novos_nao_sobem(monkeypatch):
    """Sequência do banco atrás do maior id da tabela.

    Acontece numa restauração com id explícito e sem `setval`. Os chunks novos
    nasceriam com id ABAIXO do corte e a limpeza final apagaria também eles: o
    documento ficava vazio com "✓ Concluído" na tela. Agora a ingestão para
    antes de apagar e explica o que fazer.
    """
    chamadas = montar(monkeypatch, analises=[], chunks=[{}] * 3)

    async def _maior_id_parado(_nome):
        return 500  # nunca sobe: a sequência está atrás

    monkeypatch.setattr(index, "maior_id_da_fonte", _maior_id_parado)

    with pytest.raises(HTTPException) as e:
        asyncio.run(index.ingerir(index.IngerirReq(arquivo="doc.pdf", offset=0)))

    assert e.value.status_code == 409
    assert "setval" in str(e.value.detail)
    assert "apagou" not in chamadas, "os chunks antigos não podem ser apagados aqui"
