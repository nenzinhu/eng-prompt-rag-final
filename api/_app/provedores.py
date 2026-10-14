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
#
# `notas` aparece ao lado do modelo no dropdown: quem escolhe precisa saber o
# que é pago e o que é lento (análise de 17/09/2026, A3-25 e A2-65: 4 modelos
# pagos do Nous estavam sem marcação). `aviso` aparece abaixo do seletor quando
# o provedor está escolhido. Preços do catálogo do Nous em 17/09/2026, em US$
# por 1 milhão de tokens de saída.
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
            # qwen3.8-27b deu 502 em 10/09/2026, mas consta como Preview no catálogo
            # oficial do Groq em 14/10/2026 — reinstalado a pedido do usuário.
            "qwen/qwen3.8-27b",
        ],
    },
    # Verificado com CHAMADA REAL em 14/10/2026: o /v1/models da chave devolve só
    # estes dois modelos e ambos responderam texto (~0,2-1,3 s). command-a-03-2025,
    # command-a-plus-05-2026 e gpt-oss-20b deram HTTP 404 ("Model does not exist or
    # you do not have access to it") nesta conta.
    "cerebras": {
        "label": "Cerebras",
        "base_url": "https://api.cerebras.ai/v1",
        "env_key": "CEREBRAS_API_KEY",
        "models": [
            "gpt-oss-120b",     # 0,2 s
            "qwen-3.8-27b",     # 1,3 s — emite reasoning antes; o content vem preenchido
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
        "notas": {
            "meituan/longcat-2.0:free": "lento, ~17 s",
            "meta-llama/llama-3.1-8b-instruct": "pago, ~$0,04/1M",
            "amazon/nova-micro-v1": "pago, ~$0,14/1M",
            "mistralai/mistral-nemo": "pago, ~$0,03/1M",
            "openai/gpt-oss-20b": "pago, ~$0,10/1M",
            "qwen/qwen3.7-flash": "pago, ~$0,13/1M",
            "openai/gpt-oss-120b": "pago, ~$0,17/1M",
            "deepseek/deepseek-v4-flash-0731": "pago, ~$0,10/1M",
        },
    },
    "nvidia": {
        "label": "NVIDIA NIM",
        "base_url": "https://integrate.api.nvidia.com/v1",
        "env_key": "NVIDIA_API_KEY",
        "models": [
            "nvidia/nemotron-3-super-120b-a12b",        # 4,8 s
            # nemotron-3.5-lightning-30b-a3b removido em 17/09/2026: 47,7 s numa
            # pergunta trivial, não cabe no orçamento de ~52 s com contexto real.
        ],
    },
    "mistral": {
        "label": "Mistral",
        "base_url": "https://api.mistral.ai/v1",
        "env_key": "MISTRAL_API_KEY",
        # Plano gratuito (Experiment). Testados com CHAMADA REAL em 19/09/2026,
        # com contexto de ~700 tokens, lendo os headers x-ratelimit-*:
        #   ministral-8b   1,4 s · 188 req/min · 625 mil tokens/min
        #   ministral-3b   0,6 s · 750 req/min · 1,3 mi tokens/min
        #   ministral-14b  8,2 s ·  30 req/min · 937 mil tokens/min
        #   codestral      0,6 s · 125 req/min · 625 mil tokens/min
        # mistral-small, mistral-medium e magistral-* respondem 429 com limite
        # de 0 req/min nesta conta: não fazem parte do plano gratuito.
        "models": [
            "ministral-8b-latest",
            "ministral-3b-latest",
            "ministral-14b-latest",
            "codestral-latest",
        ],
        "notas": {
            "ministral-3b-latest": "o mais rápido, respostas mais simples",
            "ministral-14b-latest": "mais completo, ~8 s",
            "codestral-latest": "focado em código",
        },
        "aviso": "Plano gratuito do Mistral: as perguntas podem ser usadas para treinar os modelos, "
        "a não ser que o dono da chave desative isso no painel.",
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
    # ── Provedores adicionados em 24/09/2026 ────────────────────────────────
    # AINDA SEM CHAMADA REAL: a rede do ambiente em que foram adicionados
    # bloqueava estes hosts. Modelos escolhidos pelo plano gratuito documentado
    # de cada provedor; rode `python scripts/verificar_modelos.py` com as chaves
    # no .env para medir e tirar da lista o que não responder.
    "together": {
        "label": "Together AI",
        "base_url": "https://api.together.xyz/v1",
        "env_key": "TOGETHER_API_KEY",
        # Endpoints "-Free": gratuitos, com limite baixo de requisições por minuto.
        "models": [
            "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free",
            "deepseek-ai/DeepSeek-R1-Distill-Llama-70B-free",
        ],
        "notas": {
            "deepseek-ai/DeepSeek-R1-Distill-Llama-70B-free": "raciocina antes, mais lento",
        },
        "aviso": "Modelos gratuitos do Together: poucas requisições por minuto. Ainda não testados neste app.",
    },
    "cohere": {
        "label": "Cohere",
        # Endpoint de compatibilidade com a API da OpenAI.
        "base_url": "https://api.cohere.ai/compatibility/v1",
        "env_key": "COHERE_API_KEY",
        # Testados com CHAMADA REAL em 14/10/2026 via /compatibility/v1: os três
        # primeiros responderam texto em ~0,3 s; command-r7b continua no catálogo
        # (/models) da chave.
        "models": [
            "c4ai-aya-vision-32b",
            "command-a-03-2025",
            "command-a-plus-05-2026",
            "command-r7b-12-2024",
        ],
        "notas": {
            "c4ai-aya-vision-32b": "entende texto e imagem",
            "command-a-03-2025": "rápido e completo",
            "command-a-plus-05-2026": "o mais completo",
            "command-r7b-12-2024": "rápido, respostas mais simples",
        },
        "aviso": "Chave de teste do Cohere: gratuita, com cerca de 1.000 chamadas por mês.",
    },
    "huggingface": {
        "label": "Hugging Face",
        "base_url": "https://router.huggingface.co/v1",
        "env_key": "HUGGINGFACE_API_KEY",
        "models": [
            "meta-llama/Llama-3.1-8B-Instruct",
            "Qwen/Qwen2.5-72B-Instruct",
        ],
        "aviso": "Hugging Face: créditos gratuitos pequenos por mês. O token precisa da permissão "
        "“Make calls to Inference Providers”. Ainda não testado neste app.",
    },
    "modelscope": {
        "label": "ModelScope",
        "base_url": "https://api-inference.modelscope.cn/v1",
        "env_key": "MODELSCOPE_API_KEY",
        # Qwen3 exige desligar o raciocínio fora do streaming; os modelos abaixo não.
        "models": [
            "Qwen/Qwen2.5-72B-Instruct",
            "deepseek-ai/DeepSeek-V3",
        ],
        "aviso": "ModelScope: cota diária gratuita; a conta precisa estar vinculada à Alibaba Cloud. "
        "Ainda não testado neste app.",
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
            # Conferidos no catálogo do OpenRouter em 14/10/2026 (ids exatos do
            # /models, incluindo o sufixo -it do Gemma). Os do Poolside têm
            # expiração anunciada para 31/10/2026.
            "thinkingmachines/inkling:free",
            "thinkingmachines/inkling-small:free",
            "poolside/laguna-s-2.1:free",
            "google/gemma-4-26b-a4b-it:free",
            "google/gemma-4-31b-it:free",
            "openrouter/free",
            # nvidia/nemotron-3.5-lightning:free removido em 17/09/2026: ~90 s,
            # passa do tempo máximo da função (60 s).
        ],
        "aviso": "Conta gratuita: só 50 respostas por dia no total, somando todos os modelos.",
    },
}


# ── Chamada ao provedor de IA escolhido (dropdown) ──────────────────────────


# Falhas passageiras que valem uma segunda tentativa. Timeout NÃO entra: esperar
# de novo o mesmo tempo estouraria o orçamento de 60 s da função.
STATUS_TRANSITORIOS = {429, 500, 502, 503, 504}
MAX_ESPERA_RETENTATIVA = 3.0


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


def _conteudo_da_resposta(provider: str, r: httpx.Response) -> str:
    """Tira o texto de um 200 do provedor sem confiar no formato.

    Nem todo 200 traz `choices`: alguns provedores (OpenRouter, por exemplo)
    respondem 200 com `{"error": {...}}` — o caminho de streaming já tratava
    isso, mas aqui um `KeyError: 'choices'` cru virava HTTP 500 e derrubava o
    resumo inteiro. Também cobre `content` nulo (modelo que só devolve
    raciocínio) e corpo que nem é JSON.
    """
    try:
        dados = r.json()
    except ValueError:
        raise HTTPException(502, f"Erro do provedor {provider}: resposta não é JSON ({r.text[:200]}).")
    if not isinstance(dados, dict):
        raise HTTPException(502, f"Erro do provedor {provider}: resposta em formato inesperado.")
    if dados.get("error"):
        erro = dados["error"]
        detalhe = erro.get("message") if isinstance(erro, dict) else erro
        raise HTTPException(502, f"Erro do provedor {provider}: {str(detalhe)[:300]}")
    escolhas = dados.get("choices")
    if not isinstance(escolhas, list) or not escolhas or not isinstance(escolhas[0], dict):
        raise HTTPException(502, f"Erro do provedor {provider}: resposta sem 'choices'.")
    conteudo = (escolhas[0].get("message") or {}).get("content")
    if not conteudo:
        raise HTTPException(502, f"O modelo respondeu sem texto pelo provedor {provider}. Tente outro modelo.")
    return conteudo


async def chamar_llm(
    provider: str,
    modelo: str,
    system_prompt: str,
    user_prompt: str,
    timeout: Optional[float] = None,
) -> str:
    cfg, api_key, limite = _preparar_chamada(provider, modelo, timeout)
    inicio = time.monotonic()
    corpo = {
        "model": modelo,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.3,
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
                return _conteudo_da_resposta(provider, r)
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
):
    """Versão em streaming: gera os pedaços de texto conforme o modelo escreve.

    O provedor responde em SSE (`data: {...}` por linha, `data: [DONE]` no fim).
    Erros ANTES do primeiro pedaço viram HTTPException (a rota ainda pode
    responder com status de erro); sem retentativa aqui, porque parte do texto
    pode já ter chegado ao aluno.

    Também vira HTTPException o que antes passava como resposta completa
    (análise de 17/09/2026, A1-05): objeto `error` no meio do stream (formato do
    OpenRouter), `finish_reason` de corte (`length`, `error`, `content_filter`)
    e stream que termina sem `[DONE]` nem `finish_reason: stop`.
    """
    cfg, api_key, limite = _preparar_chamada(provider, modelo, timeout)
    inicio = time.monotonic()
    terminou = False
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
                    "temperature": 0.3,
                    "stream": True,
                },
            ) as r:
                if r.status_code != 200:
                    texto = (await r.aread()).decode("utf-8", "replace")
                    raise HTTPException(502, f"Erro do provedor {provider}: {texto[:300]}")
                async for linha in r.aiter_lines():
                    # O timeout do httpx vale entre pedaços, não para a resposta
                    # inteira: um modelo lento e constante passaria do orçamento.
                    if time.monotonic() - inicio > limite:
                        raise HTTPException(504, f"O modelo '{modelo}' passou de {round(limite)}s escrevendo.")
                    if not linha.startswith("data:"):
                        continue
                    dado = linha[5:].strip()
                    if dado == "[DONE]":
                        terminou = True
                        break
                    try:
                        evento = json.loads(dado)
                    except ValueError:
                        continue
                    if not isinstance(evento, dict):
                        continue
                    if evento.get("error"):
                        erro = evento["error"]
                        detalhe = erro.get("message") if isinstance(erro, dict) else erro
                        raise HTTPException(502, f"Erro do provedor {provider}: {str(detalhe)[:300]}")
                    escolhas = evento.get("choices") or [{}]
                    escolha = escolhas[0] if isinstance(escolhas[0], dict) else {}
                    delta = escolha.get("delta") or {}
                    if delta.get("content"):
                        yield delta["content"]
                    motivo = escolha.get("finish_reason")
                    if motivo == "stop":
                        terminou = True
                    elif motivo in _MOTIVOS_DE_CORTE:
                        raise HTTPException(502, _MOTIVOS_DE_CORTE[motivo])
    except httpx.TimeoutException:
        raise HTTPException(
            504,
            f"O modelo '{modelo}' não respondeu em {round(limite)}s. Tente outro modelo "
            f"ou uma pergunta mais curta.",
        )
    except httpx.TransportError as e:
        raise HTTPException(502, f"A conexão com o provedor {provider} caiu: {type(e).__name__}")
    if not terminou:
        raise HTTPException(502, f"A conexão com o provedor {provider} caiu antes do fim da resposta.")


_MOTIVOS_DE_CORTE = {
    "length": "O modelo parou no limite de tamanho da resposta.",
    "error": "O provedor interrompeu a resposta com um erro.",
    "content_filter": "O filtro de conteúdo do provedor interrompeu a resposta.",
}


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
