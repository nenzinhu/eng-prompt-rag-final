"""Provedores de IA (API OpenAI-compatible): lista curada, validação de modelo e chamada."""
from __future__ import annotations

import asyncio
import json
import os
import time
from typing import Optional

import httpx
from fastapi import HTTPException

from .http_util import TIMEOUT_LLM, _http

# ── Provedores de IA (todos com API "OpenAI-compatible") ───────────────────
# Listas verificadas com CHAMADA REAL em 10/09/2026, medindo latência via
# /api/perguntar com pergunta trivial. A ordem importa duas vezes: o primeiro
# item é o padrão do dropdown, e o primeiro provedor da lista é o padrão da
# interface. Um modelo lento no topo faz o app parecer quebrado — o glossário
# estourava o orçamento de 60 s da função serverless por causa disso.
#
# Regras da ordenação: entre gratuitos primeiro (o aluno não deve gastar nada por
# padrão) e, dentro de cada grupo, do mais rápido para o mais lento. Modelos que
# responderam erro foram removidos, com a medição anotada.
PROVIDERS = {
    "groq": {
        "label": "Groq",
        "base_url": "https://api.groq.com/openai/v1",
        "env_key": "GROQ_API_KEY",
        # Medidos: compound-mini 1,8 s · gpt-oss-120b 1,2 s · allam-2-7b 1,8 s
        # · compound 1,9 s · qwen3.6-27b 2,5 s · gpt-oss-20b 3,0 s
        "models": [
            "groq/compound-mini",      # 1,8 s
            "openai/gpt-oss-120b",     # 1,2 s (o mais rápido)
            "groq/compound",           # 1,9 s
            "allam-2-7b",              # 1,8 s
            "openai/gpt-oss-20b",      # 3,0 s
            "qwen/qwen3.6-27b",        # 2,5 s — emite tags <think>, tratadas na limpeza
            # qwen/qwen3.8-27b removido: HTTP 502 na verificação de 10/09/2026.
        ],
    },
    "nous": {
        "label": "Nous Portal",
        "base_url": "https://inference-api.nousresearch.com/v1",
        "env_key": "NOUS_API_KEY",
        # Gratuitos primeiro (padrão não custa nada), depois os pagos baratos.
        # Medidos: laguna-xs 1,9 s · ling-sante 2,6 s · ling-fin 4,7 s · laguna-s 6,2 s
        # · longcat 16,6 s · llama-8b 1,6 s · nova-micro 1,7 s · mistral-nemo 2,3 s
        # · gpt-oss-20b 4,9 s · qwen3.7-flash 8,9 s
        "models": [
            "poolside/laguna-xs-2.1:free",              # 1,9 s — gratuito e rápido
            "inclusionai/ling-3.0-flash-sante:free",    # 2,6 s
            "inclusionai/ling-3.0-flash-fin:free",      # 4,7 s
            "poolside/laguna-s-2.1:free",               # 6,2 s
            "meituan/longcat-2.0:free",                 # 16,6 s — o mais lento; evite no glossário
            "meta-llama/llama-3.1-8b-instruct",         # 1,6 s (pago ~$0.04/1M)
            "amazon/nova-micro-v1",                     # 1,7 s (pago ~$0.03/1M)
            "mistralai/mistral-nemo",                   # 2,3 s (pago ~$0.02/1M)
            "openai/gpt-oss-20b",                       # 4,9 s
            "qwen/qwen3.7-flash",                       # 8,9 s
            # Verificados em 09/09/2026 (chamada real), sem medição de latência nesta rodada.
            "openai/gpt-oss-120b",
            "deepseek/deepseek-v4-flash-0731",
        ],
    },
    "nvidia": {
        "label": "NVIDIA NIM",
        "base_url": "https://integrate.api.nvidia.com/v1",
        "env_key": "NVIDIA_API_KEY",
        "models": [
            "nvidia/nemotron-3-super-120b-a12b",        # 4,8 s
            "nvidia/nemotron-3.5-lightning-30b-a3b",    # 47,7 s — lento demais para o glossário
        ],
    },
    "anyapi": {
        "label": "AnyAPI",
        "base_url": "https://api.anyapi.ai/v1",
        "env_key": "ANYAPI_API_KEY",
        # Testados com CHAMADA REAL em 10/09/2026 via /v1/chat/completions.
        # O /v1/models lista 10 modelos :free, mas só 2 respondem de fato:
        #   dots-studio  ~2-4 s  (responde JSON, emite <thinking> removido na limpeza)
        #   nemotron-omni ~1-3 s  (o mais rápido)
        # Os outros 8 dão 404 (erro de modelo), 429 (rate limit) ou estouram o
        # timeout (nemotron-ultra >60 s). Deixá-los fora evita o dropdown cheio
        # de opções que falham.
        "models": [
            "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",  # ~1-3 s
            "dots-studio/dots-3-note-preview:free",                # ~2-4 s
        ],
    },
    "orcarouter": {
        "label": "Orca Router",
        "base_url": "https://api.orcarouter.ai/v1",
        "env_key": "ORCAROUTER_API_KEY",
        # Testados com CHAMADA REAL em 10/09/2026 via /v1/chat/completions.
        # A chave lista 196 modelos no /v1/models, mas a maioria é paga. Os três
        # abaixo responderam de fato com `content` preenchido:
        #   deepseek-v4-flash-free  ~3 s  (o mais rápido e limpo)
        #   glm-5.3-flash-free      ~6 s  (devolve a resposta num bloco ```json)
        #   tencent/hy3-free        ~7,5 s (raciocínio longo no reasoning_content;
        #                                   a resposta vem no content)
        # Os `orca/fusion-*`, `orca/free` e `orca/auto` listam no /models mas
        # devolvem 404 ("No available capacity") — ficam de fora.
        "models": [
            "deepseek/deepseek-v4-flash-free",
            "z-ai/glm-5.3-flash-free",
            "tencent/hy3-free",
        ],
    },
    "openrouter": {
        "label": "OpenRouter",
        "base_url": "https://openrouter.ai/api/v1",
        "env_key": "OPENROUTER_API_KEY",
        # ATENÇÃO (10/09/2026): a cota diária de modelos gratuitos está esgotada
        # ("free-models-per-day", 0/50 restantes) — o provedor responde 429 até o
        # reset. A lista abaixo volta a funcionar quando a cota renovar; a
        # mensagem do provedor é repassada ao usuário em caso de erro.
        "models": [
            "liquid/lfm-2.5-2.6b:free",
            "cohere/north-mini-code:free",
            "nex-agi/nex-n2.5-mini:free",
            "dots-studio/dots-3-note-preview:free",
            "inclusionai/ling-3.0-flash-fin:free",
            "nex-agi/nex-n2.5-pro:free",
            "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
            "nvidia/nemotron-3-super-120b-a12b:free",
            "poolside/laguna-xs-2.1:free",
            "openrouter/free",
            "nvidia/nemotron-3.5-lightning:free",  # lento (~90 s)
        ],
    },
}


# ── Chamada ao provedor de IA escolhido (dropdown) ──────────────────────────


# Falhas passageiras que valem uma segunda tentativa. Timeout NÃO entra: esperar
# de novo o mesmo tempo estouraria o orçamento de 60 s da função.
STATUS_TRANSITORIOS = {429, 500, 502, 503, 504}
MAX_ESPERA_RETENTATIVA = 3.0

# Temperatura de quem não pede outra. As personas do Professor pedem a sua
# (as expressivas soltam mais, as rigorosas menos).
TEMPERATURA_PADRAO = 0.3


def _preparar_chamada(provider: str, modelo: str, timeout: Optional[float]) -> tuple[dict, str, float]:
    cfg = PROVIDERS.get(provider)
    if not cfg:
        raise HTTPException(400, f"Provedor desconhecido: {provider}")
    if not modelo:
        raise HTTPException(400, f"Nenhum modelo informado para o provedor '{provider}'.")
    api_key = os.environ.get(cfg["env_key"])
    if not api_key:
        raise HTTPException(
            500,
            f"Chave de API não configurada para '{provider}' "
            f"(defina {cfg['env_key']} nas variáveis de ambiente).",
        )
    limite = max(5.0, min(timeout or TIMEOUT_LLM, TIMEOUT_LLM))
    return cfg, api_key, limite


def _espera_retentativa(r: Optional[httpx.Response]) -> float:
    """Quanto esperar antes de tentar de novo (respeita Retry-After curto)."""
    if r is not None:
        try:
            return min(MAX_ESPERA_RETENTATIVA, max(0.5, float(r.headers.get("retry-after", "1"))))
        except ValueError:
            pass
    return 1.0


async def chamar_llm(
    provider: str,
    modelo: str,
    system_prompt: str,
    user_prompt: str,
    timeout: Optional[float] = None,
    temperatura: Optional[float] = None,
) -> str:
    cfg, api_key, limite = _preparar_chamada(provider, modelo, timeout)
    inicio = time.monotonic()
    corpo = {
        "model": modelo,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": TEMPERATURA_PADRAO if temperatura is None else temperatura,
    }
    for tentativa in (1, 2):
        restante = limite - (time.monotonic() - inicio)
        r: Optional[httpx.Response] = None
        try:
            async with _http(httpx.Timeout(max(5.0, restante), connect=10.0)) as client:
                r = await client.post(
                    f"{cfg['base_url']}/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json=corpo,
                )
        except httpx.TimeoutException:
            # Erro claro em vez do 504 seco da plataforma.
            raise HTTPException(
                504,
                f"O modelo '{modelo}' não respondeu em {round(limite)}s. Tente outro modelo "
                f"ou uma pergunta mais curta.",
            )
        except httpx.TransportError as e:
            # Conexão recusada/derrubada: falha rápida, costuma passar na 2ª vez.
            if tentativa == 2:
                raise HTTPException(502, f"Erro de conexão com o provedor {provider}: {type(e).__name__}")
        else:
            if r.status_code == 200:
                return r.json()["choices"][0]["message"]["content"]
            if tentativa == 2 or r.status_code not in STATUS_TRANSITORIOS:
                raise HTTPException(502, f"Erro do provedor {provider}: {r.text[:300]}")

        # Só tenta de novo se sobrar mais da metade do orçamento.
        espera = _espera_retentativa(r)
        if time.monotonic() - inicio + espera > limite / 2:
            detalhe = r.text[:300] if r is not None else "falha de conexão"
            raise HTTPException(502, f"Erro do provedor {provider}: {detalhe}")
        await asyncio.sleep(espera)
    raise AssertionError("inalcançável")


async def chamar_llm_stream(
    provider: str,
    modelo: str,
    system_prompt: str,
    user_prompt: str,
    timeout: Optional[float] = None,
    temperatura: Optional[float] = None,
):
    """Versão em streaming: gera os pedaços de texto conforme o modelo escreve.

    O provedor responde em SSE (`data: {...}` por linha, `data: [DONE]` no fim).
    Erros ANTES do primeiro pedaço viram HTTPException (a rota ainda pode
    responder com status de erro); sem retentativa aqui, porque parte do texto
    pode já ter chegado ao aluno.
    """
    cfg, api_key, limite = _preparar_chamada(provider, modelo, timeout)
    try:
        async with _http(httpx.Timeout(limite, connect=10.0)) as client:
            async with client.stream(
                "POST",
                f"{cfg['base_url']}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": modelo,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    "temperature": TEMPERATURA_PADRAO if temperatura is None else temperatura,
                    "stream": True,
                },
            ) as r:
                if r.status_code != 200:
                    texto = (await r.aread()).decode("utf-8", "replace")
                    raise HTTPException(502, f"Erro do provedor {provider}: {texto[:300]}")
                async for linha in r.aiter_lines():
                    if not linha.startswith("data:"):
                        continue
                    dado = linha[5:].strip()
                    if dado == "[DONE]":
                        return
                    try:
                        delta = json.loads(dado)["choices"][0].get("delta") or {}
                    except (ValueError, KeyError, IndexError):
                        continue
                    if delta.get("content"):
                        yield delta["content"]
    except httpx.TimeoutException:
        raise HTTPException(
            504,
            f"O modelo '{modelo}' não respondeu em {round(limite)}s. Tente outro modelo "
            f"ou uma pergunta mais curta.",
        )


def resolver_modelo(provider: str, modelo: Optional[str]) -> str:
    """Resolve o modelo pedido, aceitando SÓ o que está na lista curada do provedor.

    A checagem de pertinência é o limite de custo do app, não um detalhe: as
    listas em PROVIDERS são curadas para privilegiar modelos gratuitos (e os
    pagos escolhidos são os baratos, com o preço anotado ao lado). Sem esta
    validação, qualquer requisição podia mandar um nome de modelo arbitrário —
    inclusive um modelo caro do catálogo do provedor — e a conta ia para a
    chave que fica no servidor.
    """
    cfg = PROVIDERS.get(provider)
    if not cfg:
        raise HTTPException(
            400,
            f"Provedor desconhecido: '{provider}'. Recarregue a página para atualizar a lista.",
        )
    if not modelo:
        return cfg["models"][0]
    if modelo not in cfg["models"]:
        raise HTTPException(
            400,
            f"Modelo '{modelo}' não está disponível no provedor '{cfg['label']}'. "
            "Recarregue a página para atualizar a lista de modelos.",
        )
    return modelo
