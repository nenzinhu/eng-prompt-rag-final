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

    async def _apagar(_nome):
        chamadas["apagou"] = True

    monkeypatch.setattr(index, "_analisar_ingestao", _analisar)
    monkeypatch.setattr(index, "baixar_documento_storage", _baixar)
    monkeypatch.setattr(index, "extrair_paginas", _extrair)
    monkeypatch.setattr(index, "gerar_embeddings", _emb)
    monkeypatch.setattr(index, "inserir_chunks", _inserir)
    monkeypatch.setattr(index, "apagar_chunks_por_fonte", _apagar)
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
