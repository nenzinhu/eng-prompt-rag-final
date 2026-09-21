"""Fixtures comuns aos testes do backend."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "api"))

import index  # noqa: E402


@pytest.fixture(autouse=True)
def _sem_ocr_na_rede(monkeypatch):
    """A ingestão procura a transcrição das imagens no Storage. Nos testes não
    há Storage: sem isto, cada teste de ingestão esperava a falha de rede."""

    async def _nenhum(_nome):
        return {}

    monkeypatch.setattr(index, "baixar_ocr", _nenhum)
