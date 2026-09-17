"""Cliente HTTP compartilhado e orçamento de tempo da função serverless."""
from __future__ import annotations

import asyncio
import os
from typing import Optional

import httpx

# Orçamento de tempo da função serverless (vercel.json: maxDuration). Os timeouts
# das chamadas de IA precisam caber AQUI DENTRO: antes o cliente esperava 90 s num
# orçamento de 60 s, então um modelo lento morria com 504 sem explicação, em vez
# de devolver um erro claro. Medido em produção: /api/glossario estourava o
# limite quando o modelo não devolvia JSON válido e a retentativa dobrava o tempo.
TEMPO_MAX_FUNCAO = float(os.environ.get("MAX_DURACAO_FUNCAO", "60"))
MARGEM_SEGURANCA = 8.0  # reserva para serializar a resposta antes do corte
TIMEOUT_LLM = TEMPO_MAX_FUNCAO - MARGEM_SEGURANCA


_TIMEOUT = httpx.Timeout(60.0, connect=10.0)

# Um cliente HTTP compartilhado por event loop. Antes cada chamada abria um
# `AsyncClient` novo — conexão TCP + TLS do zero a cada embedding, busca ou lote.
# O cache é por loop porque um cliente não pode ser usado fora do loop em que
# nasceu (os testes rodam cada caso num `asyncio.run` próprio).
_cliente_http: tuple[Optional[asyncio.AbstractEventLoop], Optional[httpx.AsyncClient]] = (None, None)


class _ClienteComTimeout:
    """Usa o cliente compartilhado aplicando o timeout de cada chamada.

    Mantém a forma `async with _http(t) as client:` dos pontos de uso, mas o
    `__aexit__` não fecha nada: a conexão fica viva para a próxima requisição.
    """

    def __init__(self, timeout):
        self._timeout = timeout

    async def __aenter__(self):
        global _cliente_http
        loop = asyncio.get_running_loop()
        dono, cliente = _cliente_http
        if dono is not loop or cliente is None:
            cliente = httpx.AsyncClient(timeout=_TIMEOUT)
            _cliente_http = (loop, cliente)
        self._cliente = cliente
        return self

    async def __aexit__(self, *_):
        return False

    def __getattr__(self, nome):
        metodo = getattr(self._cliente, nome)
        if nome in ("get", "post", "put", "patch", "delete", "head", "request", "stream"):
            return lambda *a, **k: metodo(*a, **{"timeout": self._timeout, **k})
        return metodo


def _http(timeout) -> _ClienteComTimeout:
    return _ClienteComTimeout(timeout)
