"""
Engenharia de Prompt — RAG API (cloud)

Roda como Vercel Serverless Function (Python/ASGI). Sem backend local:
- Banco vetorial + storage dos documentos: Supabase (Postgres/pgvector + Storage)
- Embeddings: Supabase Edge Function "embeddings" (modelo gte-small, gratuito)
- Geração de resposta: provedor de IA escolhido no dropdown do frontend
  (OpenRouter, Groq, NVIDIA NIM, Nous Portal, ...) via API OpenAI-compatible

Segurança (10/09/2026):
- Leitura usa a chave pública (anon); ESCRITA usa a service_role, que só existe
  no servidor. Com RLS ligado, a chave pública não grava mais nada no banco.
- Rotas de escrita exigem o header `X-Admin-Token`.
- CORS restrito pelas origens em ALLOWED_ORIGINS.

O núcleo de texto (chunking, heurísticas de comparação) vive em `rag_core.py`,
que não faz I/O e é coberto pelos testes em `tests/test_rag_core.py`.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import io
import json
import os
import re
import secrets
import sys
import time
import unicodedata
from pathlib import Path
from typing import Optional
from urllib.parse import quote

import httpx
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from pypdf import PdfReader

# `rag_core.py` fica ao lado deste arquivo. O sys.path garante o import tanto
# rodando local (`uvicorn api.index:app`) quanto no bundle da Vercel.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from rag_core import (  # noqa: E402
    calcular_concordancia,
    chunk_texto,
    classificar_fidelidade,
    conclusao_fallback,
    extrair_alternativas,
    extrair_bloco_json,
    extrair_resposta_direta,
    formatar_alternativas,
    frase_tem_apoio_textual,
    limpar_resposta,
    quebrar_frases,
    remover_linha_resposta_direta,
    rotulos_unicos,
)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "")
ADMIN_USER = os.environ.get("ADMIN_USER", "")
ADMIN_PASS = os.environ.get("ADMIN_PASS", "")

# Duração da sessão do admin (segundos). A área restrita pede usuário e senha;
# o login emite um token assinado (HMAC) com esta validade. Serverless é
# stateless, então a sessão é auto-contida (assinatura + expiração), não um
# estado em memória.
SESSAO_ADMIN_SEGUNDOS = 8 * 60 * 60  # 8 horas

# Origens liberadas no CORS. Sem configuração, só o desenvolvimento local.
ALLOWED_ORIGINS = [
    o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",") if o.strip()
]

LIMIAR_CONFIANCA = 0.35  # abaixo disso, avisamos que a resposta é pouco embasada na apostila

# Teto de upload. NÃO é escolha do app: a função serverless da Vercel recusa
# qualquer requisição acima de 4,5 MB ANTES do código rodar (413
# FUNCTION_PAYLOAD_TOO_LARGE, em texto puro). O app anunciava 25 MB, então um
# arquivo de 5 MB morria com "Erro 413 na requisição" e nenhuma explicação —
# medido no navegador em 10/09/2026: 3 MB passa, 5 MB é cortado.
#   - na Vercel: 4 MB (deixa margem para o cabeçalho do multipart);
#   - local (uvicorn): 25 MB, que é o limite real do app;
#   - MAX_UPLOAD_MB no ambiente sobrepõe os dois.
LIMITE_UPLOAD_PLATAFORMA_MB = 4
LIMITE_UPLOAD_LOCAL_MB = 25


def limite_upload_mb() -> int:
    explicito = os.environ.get("MAX_UPLOAD_MB")
    if explicito:
        try:
            return max(1, int(float(explicito)))
        except ValueError:
            pass
    return LIMITE_UPLOAD_PLATAFORMA_MB if os.environ.get("VERCEL") else LIMITE_UPLOAD_LOCAL_MB


def motivo_limite_upload() -> str:
    if os.environ.get("MAX_UPLOAD_MB"):
        return "definido por MAX_UPLOAD_MB no servidor"
    if os.environ.get("VERCEL"):
        return (
            "a função serverless da Vercel recusa corpos acima de 4,5 MB antes do código rodar — "
            "para arquivos maiores, rode o app localmente (início rápido pelo iniciar-tudo.bat), "
            "onde o limite é 25 MB"
        )
    return "limite do app rodando localmente"


def limite_upload_bytes() -> int:
    """Teto em bytes, calculado na hora (e não congelado no import).

    A avaliação tardia importa: o limite depende de `VERCEL`/`MAX_UPLOAD_MB` no
    ambiente, e um valor congelado no import deixaria `/api/config` anunciando um
    teto diferente do que a rota de upload aplica.
    """
    return limite_upload_mb() * 1024 * 1024


MAX_RESULTADOS_BUSCA = 20
CACHE_STATUS_SEGUNDOS = 30
LIMITE_LLM_POR_MINUTO = 20  # por IP, por instância (ver observação em _limitar_llm)

# Orçamento de tempo da função serverless (vercel.json: maxDuration). Os timeouts
# das chamadas de IA precisam caber AQUI DENTRO: antes o cliente esperava 90 s num
# orçamento de 60 s, então um modelo lento morria com 504 sem explicação, em vez
# de devolver um erro claro. Medido em produção: /api/glossario estourava o
# limite quando o modelo não devolvia JSON válido e a retentativa dobrava o tempo.
TEMPO_MAX_FUNCAO = float(os.environ.get("MAX_DURACAO_FUNCAO", "60"))
MARGEM_SEGURANCA = 8.0  # reserva para serializar a resposta antes do corte
TIMEOUT_LLM = TEMPO_MAX_FUNCAO - MARGEM_SEGURANCA

EXTENSOES_DOCUMENTO = (".pdf", ".txt", ".md")

app = FastAPI(title="Engenharia de Prompt — RAG API (cloud)")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def falha_inesperada(request: Request, exc: Exception):
    """Transforma qualquer falha não tratada numa resposta JSON legível.

    Sem isto, o Starlette responde `Internal Server Error` em TEXTO PURO para
    exceções inesperadas (httpx, pypdf, banco). O front não encontra o campo
    `detail` no corpo, não tem o que mostrar, e a tela fica só com
    "Erro 500 na requisição" — sem pista nenhuma do que quebrou. Foi assim que
    um upload falho virou um mistério em 10/09/2026.

    Aqui a falha vira uma mensagem que diz o que aconteceu e onde.
    """
    if isinstance(exc, httpx.HTTPStatusError):
        # Falha do Supabase/Storage/provedor: o mais comum e o mais acionável.
        alvo = f"{exc.request.url.host}{exc.request.url.path}"
        detalhe = f"o serviço {alvo} respondeu {exc.response.status_code}: {exc.response.text[:200]}"
        dica = "Isso é do Supabase/Storage, não da sua pergunta. Tente de novo; se persistir, confira as chaves e o RLS."
    elif isinstance(exc, httpx.TimeoutException):
        detalhe = f"o serviço externo não respondeu a tempo ({type(exc).__name__})"
        dica = "Tente de novo — costuma ser lentidão momentânea do Supabase."
    elif type(exc).__module__.startswith("pypdf"):
        detalhe = f"o PDF não pôde ser lido ({type(exc).__name__}: {exc})"[:300]
        dica = (
            "O arquivo pode estar corrompido, protegido por senha, ou ser digitalizado "
            "(imagem) sem camada de texto — nesse caso o OCR é necessário antes de indexar."
        )
    else:
        detalhe = f"{type(exc).__name__}: {exc}"[:300]
        dica = "Falha interna do servidor."

    print(f"[falha_inesperada] {request.method} {request.url.path} -> {detalhe}", flush=True)
    return JSONResponse(
        status_code=500,
        content={"detail": f"{detalhe} — {dica}"},
    )

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


# ── Configuração e credenciais ─────────────────────────────────────────────


def _checar_config_supabase():
    if not SUPABASE_URL or not (SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY):
        raise HTTPException(
            500,
            "SUPABASE_URL/SUPABASE_ANON_KEY não configuradas nas variáveis de ambiente.",
        )


def _checar_config_escrita():
    """Escrita no banco: prefere a service_role; avisa quando cai na anon."""
    _checar_config_supabase()
    if not SUPABASE_SERVICE_ROLE_KEY and not SUPABASE_ANON_KEY:
        raise HTTPException(500, "Nenhuma chave do Supabase configurada para escrita.")


def _chave_leitura() -> str:
    return SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY


def _chave_escrita() -> str:
    """A service_role ignora RLS; a anon só escreve enquanto o RLS estiver desligado."""
    return SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY


def _h_leitura() -> dict:
    """Chave pública: usada na busca vetorial, no glossário e nos embeddings.

    Com RLS ligado, esta chave lê (política de select) e não escreve nada.
    """
    chave = _chave_leitura()
    return {"Authorization": f"Bearer {chave}", "apikey": chave}


def _h_escrita() -> dict:
    chave = _chave_escrita()
    return {"Authorization": f"Bearer {chave}", "apikey": chave}


def _h_documentos() -> dict:
    """Storage: sempre pela service_role quando disponível.

    O bucket 'ementas' é privado e não tem política para anon — os documentos
    são lidos e gravados pelo servidor, nunca pelo navegador.
    """
    chave = SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY
    return {"Authorization": f"Bearer {chave}", "apikey": chave}



def escrita_via_service_role() -> bool:
    return bool(SUPABASE_SERVICE_ROLE_KEY)


def _segredo_sessao() -> str:
    """Segredo usado para assinar as sessões. Deriva do ADMIN_TOKEN para não
    exigir mais uma variável de ambiente. Se não houver, a autenticação fica
    indisponível (falha fechada)."""
    if not ADMIN_TOKEN:
        raise HTTPException(
            503,
            "ADMIN_TOKEN não configurado no servidor. Defina a variável de ambiente "
            "ADMIN_TOKEN (segredo) para habilitar a área restrita.",
        )
    return ADMIN_TOKEN


def emitir_sessao(usuario: str) -> tuple[str, int]:
    """Emite um token de sessão assinado (HMAC) com expiração.

    Formato: base64url(payload).base64url(assinatura), onde payload é
    `{"u": usuario, "exp": epoch}`. Serverless é stateless, então a sessão é
    auto-contida: qualquer instância valida pela assinatura + expiração.
    """
    segredo = _segredo_sessao()
    exp = int(time.time()) + SESSAO_ADMIN_SEGUNDOS
    payload = base64.urlsafe_b64encode(json.dumps({"u": usuario, "exp": exp}).encode()).rstrip(b"=").decode()
    assinatura = base64.urlsafe_b64encode(
        hmac.new(segredo.encode(), payload.encode(), hashlib.sha256).digest()
    ).rstrip(b"=").decode()
    return f"{payload}.{assinatura}", exp


def validar_sessao(token: str) -> bool:
    """Valida a assinatura e a expiração de um token de sessão."""
    if not token:
        return False
    try:
        segredo = _segredo_sessao()
    except HTTPException:
        return False
    if "." not in token:
        return False
    payload, assinatura = token.rsplit(".", 1)
    esperada = base64.urlsafe_b64encode(
        hmac.new(segredo.encode(), payload.encode(), hashlib.sha256).digest()
    ).rstrip(b"=").decode()
    if not hmac.compare_digest(assinatura, esperada):
        return False
    try:
        dados = json.loads(base64.urlsafe_b64decode(payload.encode() + b"=" * (-len(payload) % 4)))
    except Exception:
        return False
    exp = dados.get("exp", 0)
    return int(exp) > int(time.time())


async def exigir_admin(x_admin_token: str = Header(default="")):
    """Protege as rotas de escrita e as que gastam chave de IA.

    Aceita um token de sessão válido (emitido pelo /api/admin/login) ou, por
    retrocompatibilidade, o ADMIN_TOKEN direto (usado por scripts/CLI).

    Falha fechada: sem ADMIN_TOKEN configurado, as rotas ficam indisponíveis
    (503) em vez de abertas.
    """
    if not ADMIN_TOKEN:
        raise HTTPException(
            503,
            "ADMIN_TOKEN não configurado no servidor. Defina a variável de ambiente "
            "ADMIN_TOKEN para habilitar as rotas de escrita.",
        )
    if validar_sessao(x_admin_token):
        return
    if secrets.compare_digest(x_admin_token, ADMIN_TOKEN):
        return
    raise HTTPException(401, "Sessão de admin ausente ou inválida (faça login na área restrita).")


# ── Limite de uso das rotas que gastam chave de IA ─────────────────────────
#
# Observação honesta: em serverless cada instância tem seu próprio contador, então
# isto barra abuso trivial, não substitui autenticação. Para limite confiável use
# o Firewall/Vercel KV ou um contador externo.
_uso_por_ip: dict[str, list[float]] = {}


def _limitar_llm(request: Request):
    ip = (request.client.host if request.client else "?") or "?"
    agora = time.time()
    usos = [t for t in _uso_por_ip.get(ip, []) if agora - t < 60]
    if len(usos) >= LIMITE_LLM_POR_MINUTO:
        raise HTTPException(429, f"Muitas requisições em sequência. Tente de novo em instantes.")
    usos.append(agora)
    _uso_por_ip[ip] = usos


# ── Supabase: embeddings, busca vetorial, chunks, storage ──────────────────

EMBEDDINGS_LOTE = 8  # a Edge Function estoura WORKER_RESOURCE_LIMIT acima de ~10-12 textos por chamada
_TIMEOUT = httpx.Timeout(60.0, connect=10.0)


async def gerar_embeddings(textos: list[str]) -> list[list[float]]:
    _checar_config_supabase()
    resultado: list[list[float]] = []
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        for i in range(0, len(textos), EMBEDDINGS_LOTE):
            lote = textos[i : i + EMBEDDINGS_LOTE]
            r = await client.post(
                f"{SUPABASE_URL}/functions/v1/embeddings",
                headers={**_h_leitura(), "Content-Type": "application/json"},
                json={"texts": lote},
            )
            r.raise_for_status()
            resultado.extend(r.json()["embeddings"])
    return resultado


async def buscar_chunks(query_embedding: list[float], n: int = 6) -> list[dict]:
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        r = await client.post(
            f"{SUPABASE_URL}/rest/v1/rpc/match_ementas",
            headers={**_h_leitura(), "Content-Type": "application/json"},
            json={"query_embedding": query_embedding, "match_count": n},
        )
    r.raise_for_status()
    return r.json()


async def inserir_chunks(rows: list[dict]):
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        r = await client.post(
            f"{SUPABASE_URL}/rest/v1/ementas_chunks",
            headers={**_h_escrita(), "Content-Type": "application/json", "Prefer": "return=minimal"},
            json=rows,
        )
    r.raise_for_status()


async def contar_chunks_por_fonte(nome: str) -> int:
    """Quantos chunks já existem para esta fonte (usa o count exato do PostgREST)."""
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        r = await client.head(
            f"{SUPABASE_URL}/rest/v1/ementas_chunks",
            headers={**_h_leitura(), "Prefer": "count=exact"},
            params={"select": "id", "source": f"eq.{nome}"},
        )
    if r.status_code >= 400:
        return 0
    cr = r.headers.get("content-range") or ""
    if "/" in cr:
        try:
            return int(cr.split("/")[-1])
        except ValueError:
            return 0
    return 0


async def medir_indice_atual(nome: str) -> tuple[int, int]:
    """(quantidade de chunks, total de caracteres indexados) para uma fonte.

    Pede só a coluna `content` — trazer os vetores de 384 dimensões seria 20x mais
    dados para nada. O total de caracteres é o que mede perda de conteúdo de
    verdade: o chunker novo gera chunks maiores, então contar chunks engana.
    """
    total_chars = 0
    quantidade = 0
    inicio = 0
    while True:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            r = await client.get(
                f"{SUPABASE_URL}/rest/v1/ementas_chunks",
                headers={**_h_leitura(), "Range": f"{inicio}-{inicio + 999}", "Range-Unit": "items"},
                params={"select": "content", "source": f"eq.{nome}"},
            )
        if r.status_code >= 400:
            break
        lote = r.json()
        if not lote:
            break
        quantidade += len(lote)
        total_chars += sum(len(c.get("content") or "") for c in lote)
        if len(lote) < 1000:
            break
        inicio += 1000
    return quantidade, total_chars


async def apagar_chunks_por_fonte(nome: str):
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        r = await client.delete(
            f"{SUPABASE_URL}/rest/v1/ementas_chunks",
            headers=_h_escrita(),
            params={"source": f"eq.{nome}"},
        )
    r.raise_for_status()


async def upload_documento_storage(filename: str, data: bytes, mimetype: str = "application/pdf"):
    _checar_config_supabase()
    # O timeout tem de caber no tempo que a função ainda tem de vida: esperar
    # 120 s dentro de um orçamento de 60 s faz a plataforma matar o processo no
    # meio do envio, e o aluno recebe uma falha genérica sem explicação.
    limite = max(10.0, TIMEOUT_LLM)
    async with httpx.AsyncClient(timeout=httpx.Timeout(limite, connect=10.0)) as client:
        r = await client.post(
            f"{SUPABASE_URL}/storage/v1/object/ementas/{quote(filename)}",
            headers={**_h_documentos(), "Content-Type": mimetype, "x-upsert": "true"},
            content=data,
        )
    r.raise_for_status()


def _mimetype(nome: str) -> str:
    if nome.lower().endswith(".pdf"):
        return "application/pdf"
    if nome.lower().endswith(".md"):
        return "text/markdown; charset=utf-8"
    return "text/plain; charset=utf-8"


async def listar_arquivos_storage() -> list[dict]:
    """Documentos do bucket, com o MD5 do conteúdo (eTag) para detectar duplicatas."""
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        r = await client.post(
            f"{SUPABASE_URL}/storage/v1/object/list/ementas",
            headers={**_h_documentos(), "Content-Type": "application/json"},
            json={"prefix": ""},
        )
    r.raise_for_status()
    arquivos = []
    for f in r.json():
        if not f["name"].lower().endswith(EXTENSOES_DOCUMENTO):
            continue
        meta = f.get("metadata") or {}
        arquivos.append({
            "nome": f["name"],
            # O Storage guarda o MD5 do arquivo no eTag — não precisamos baixá-lo.
            "md5": (meta.get("eTag") or "").strip('"').lower(),
            "tamanho": meta.get("size"),
            "criado_em": f.get("created_at"),
        })
    return arquivos


async def listar_documentos_storage() -> list[str]:
    return [a["nome"] for a in await listar_arquivos_storage()]


async def remover_documento_storage(filename: str):
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        r = await client.request(
            "DELETE",
            f"{SUPABASE_URL}/storage/v1/object/ementas/{quote(filename)}",
            headers=_h_documentos(),
        )
    r.raise_for_status()


async def baixar_documento_storage(filename: str) -> bytes:
    async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=10.0)) as client:
        r = await client.get(f"{SUPABASE_URL}/storage/v1/object/ementas/{quote(filename)}", headers=_h_documentos())
    r.raise_for_status()
    return r.content


async def salvar_termos_glossario(termos: list[dict], origem: str = "") -> Optional[str]:
    """Grava os termos. Devolve None em caso de sucesso, ou o motivo da falha.

    Antes o erro era engolido em silêncio: a gravação falhava e ninguém sabia.
    """
    if not termos:
        return None
    rows = [
        {"termo": t["termo"], "explicacao": t["explicacao"], "exemplo": t.get("exemplo") or None, "origem": origem}
        for t in termos
    ]
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            r = await client.post(
                f"{SUPABASE_URL}/rest/v1/glossario_termos",
                headers={
                    **_h_escrita(),
                    "Content-Type": "application/json",
                    "Prefer": "resolution=merge-duplicates,return=minimal",
                },
                params={"on_conflict": "termo_normalizado"},
                json=rows,
            )
        r.raise_for_status()
    except httpx.HTTPStatusError as e:
        return f"HTTP {e.response.status_code}: {e.response.text[:200]}"
    except Exception as e:  # rede/timeout
        return f"{type(e).__name__}: {e}"[:200]
    return None


async def buscar_termos_glossario(q: str = "", limite: int = 200) -> list[dict]:
    params = {"select": "termo,explicacao,exemplo,created_at", "order": "termo.asc", "limit": str(limite)}
    if q.strip():
        termo_like = f"*{q.strip()}*"
        params["or"] = f"(termo.ilike.{termo_like},explicacao.ilike.{termo_like})"
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        r = await client.get(f"{SUPABASE_URL}/rest/v1/glossario_termos", headers=_h_leitura(), params=params)
    r.raise_for_status()
    return r.json()


# ── Extração de texto ───────────────────────────────────────────────────────


def extrair_paginas(pdf_bytes: bytes, nome: str = "") -> list[tuple[int, str]]:
    """Devolve [(numero_da_pagina, texto)]. Aceita PDF, TXT e MD."""
    if nome.lower().endswith((".txt", ".md")):
        try:
            texto = pdf_bytes.decode("utf-8")
        except UnicodeDecodeError:
            texto = pdf_bytes.decode("latin-1", "replace")
        return [(1, texto)]
    reader = PdfReader(io.BytesIO(pdf_bytes))
    return [(i + 1, page.extract_text() or "") for i, page in enumerate(reader.pages)]


def montar_contexto(chunks: list[dict]) -> tuple[str, float]:
    contexto = "\n\n".join(f"[Fonte: {c['source']}, página {c['page']}]\n{c['content']}" for c in chunks)
    media = sum(c["similarity"] for c in chunks) / len(chunks) if chunks else 0.0
    return contexto, media


def contexto_para_texto(evidencias: list[dict]) -> str:
    return "\n\n".join(
        f"[Fonte: {e.get('fonte', '?')}, página {e.get('pagina', '?')}]\n{e.get('conteudo', '')}"
        for e in evidencias
    )


# ── Chamada ao provedor de IA escolhido (dropdown) ──────────────────────────


async def chamar_llm(
    provider: str,
    modelo: str,
    system_prompt: str,
    user_prompt: str,
    timeout: Optional[float] = None,
) -> str:
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
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(limite, connect=10.0)) as client:
            r = await client.post(
                f"{cfg['base_url']}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": modelo,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    "temperature": 0.3,
                },
            )
    except httpx.TimeoutException:
        # Erro claro em vez do 504 seco da plataforma.
        raise HTTPException(
            504,
            f"O modelo '{modelo}' não respondeu em {round(limite)}s. Tente outro modelo "
            f"ou uma pergunta mais curta.",
        )
    if r.status_code != 200:
        raise HTTPException(502, f"Erro do provedor {provider}: {r.text[:300]}")
    return r.json()["choices"][0]["message"]["content"]


def resolver_modelo(provider: str, modelo: Optional[str]) -> str:
    cfg = PROVIDERS.get(provider)
    if not cfg:
        raise HTTPException(
            400,
            f"Provedor desconhecido: '{provider}'. Recarregue a página para atualizar a lista.",
        )
    return modelo or cfg["models"][0]


SYSTEM_PROMPT_PERGUNTA = (
    "Você é um assistente do curso de Engenharia de Prompt. Responda à pergunta do aluno "
    "usando principalmente o CONTEXTO fornecido (trechos das apostilas do curso). "
    "Se o contexto tiver só a teoria mas a pergunta pedir algo mais específico (como um código, "
    "cálculo ou exemplo prático que não está literalmente no material), complemente com seu "
    "conhecimento geral para dar uma resposta completa e útil. Sempre que possível, cite a fonte "
    "e a página de onde tirou a informação."
)

SYSTEM_PROMPT_RESOLVER = (
    "Você é um assistente que resolve questões de múltipla escolha do curso de Engenharia de "
    "Prompt, usando o CONTEXTO das apostilas e, se necessário, conhecimento geral. Para CADA "
    "alternativa que NÃO for a correta, explique em 1 frase curta por que ela está errada "
    "(o que a torna um distrator). Responda SEMPRE em JSON, sem nenhum texto fora dele:\n"
    "{\n"
    '  "letra": "A",\n'
    '  "explicacao_rapida": "resumo de 1-2 frases, direto ao ponto, fácil de ler rápido",\n'
    '  "explicacao_detalhada": "raciocínio completo, citando o contexto quando possível",\n'
    '  "alternativas_erradas": {"B": "motivo curto", "C": "motivo curto", "D": "motivo curto"}\n'
    "}\n"
    "Não inclua a letra correta em \"alternativas_erradas\"."
)

SYSTEM_PROMPT_SIMPLIFICAR = (
    "Você é um assistente do curso de Engenharia de Prompt. Você já respondeu a pergunta do aluno "
    "e agora ele pediu para explicar de novo, de um jeito bem mais simples (estilo ELI5: frases "
    "curtas, sem jargão, com uma analogia do dia a dia se ajudar). Use o CONTEXTO e a RESPOSTA "
    "ORIGINAL como base — não invente informação nova, só reformule de forma mais simples e direta."
)

SYSTEM_PROMPT_VERIFICAR = (
    "Você é um professor cético do curso de Engenharia de Prompt. Você acabou de responder a "
    "pergunta de um aluno. Sua tarefa agora é testar se ele realmente entendeu, gerando 1 a 2 "
    "perguntas curtas de verificação sobre o conteúdo da resposta (não repita a pergunta original). "
    'Responda SEMPRE em JSON: {"perguntas": ["...", "..."]}, sem nenhum texto fora do JSON.'
)

SYSTEM_PROMPT_GLOSSARIO = (
    "Você é um assistente do curso de Engenharia de Prompt. Identifique os termos técnicos, "
    "siglas e conceitos importantes no material abaixo (se houver um TEXTO/QUESTÃO fornecido "
    "pelo aluno, priorize os termos que aparecem nele — inclusive nas alternativas — mesmo que "
    "o CONTEXTO das apostilas só cite alguns deles) e explique cada um em 1-2 frases simples, "
    "sem jargão adicional, como se fosse para um iniciante. Quando ajudar a fixar o conceito, "
    "inclua um exemplo curto e concreto. Ignore palavras comuns que não são termos técnicos. "
    'Responda SEMPRE em JSON: {"termos": [{"termo": "...", "explicacao": "...", "exemplo": "..."}]}, '
    'com "exemplo" como string vazia quando não for necessário. Ordene alfabeticamente pelo termo. '
    "Sem nenhum texto fora do JSON."
)

SYSTEM_PROMPT_COMPARAR = (
    "Você é um assistente do curso de Engenharia de Prompt. Responda à pergunta do aluno "
    "usando principalmente o CONTEXTO fornecido (trechos das apostilas). Cite a fonte e a página "
    "quando possível. Complemente com conhecimento geral se o contexto não bastar.\n\n"
    "Ao final, escreva OBRIGATORIAMENTE uma última linha, sozinha, no formato exato:\n"
    "RESPOSTA DIRETA: <a resposta essencial em no máximo 20 palavras, sem markdown>"
)


# ── Rotas ────────────────────────────────────────────────────────────────────

_cache_status: dict = {"em": 0.0, "total": -1, "status": "empty"}


@app.get("/api/status")
async def status():
    """Estado do índice. Cacheado por 30 s: o front consulta isso a cada 30 s por aba."""
    _checar_config_supabase()
    agora = time.time()
    if agora - _cache_status["em"] < CACHE_STATUS_SEGUNDOS and _cache_status["total"] >= 0:
        return {
            "status": _cache_status["status"],
            "total": _cache_status["total"],
            "escrita_via": "service_role" if escrita_via_service_role() else "anon",
            "cache": True,
        }
    async with httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=8.0)) as client:
        r = await client.head(
            f"{SUPABASE_URL}/rest/v1/ementas_chunks",
            headers={**_h_leitura(), "Prefer": "count=exact"},
            params={"select": "id"},
        )
    total = 0
    cr = r.headers.get("content-range")
    if cr and "/" in cr:
        try:
            total = int(cr.split("/")[-1])
        except ValueError:
            total = 0
    _cache_status.update({"em": agora, "total": total, "status": "ready" if total > 0 else "empty"})
    return {
        "status": _cache_status["status"],
        "total": total,
        "escrita_via": "service_role" if escrita_via_service_role() else "anon",
        "cache": False,
    }


@app.get("/api/config")
def config_publica():
    """O que o front precisa saber antes de mostrar os botões de escrita."""
    return {
        "admin_necessario": bool(ADMIN_TOKEN and ADMIN_USER and ADMIN_PASS),
        "escrita_via": "service_role" if escrita_via_service_role() else "anon",
        "inseguro": not escrita_via_service_role(),
        "extensoes": list(EXTENSOES_DOCUMENTO),
        "max_upload_mb": limite_upload_mb(),
        # Por que o teto é esse: na Vercel a plataforma corta em 4,5 MB antes do
        # código rodar, então anunciar 25 MB fazia o aluno tomar um 413 sem
        # entender. O front mostra este texto junto do campo de upload.
        "limite_upload_motivo": motivo_limite_upload(),
    }


class LoginReq(BaseModel):
    usuario: str
    senha: str


@app.post("/api/admin/login")
def admin_login(req: LoginReq):
    """Autentica o administrador e devolve uma sessão.

    Valida usuário e senha (comparação em tempo constante para evitar ataque de
    timing). Emite um token de sessão assinado com validade de 8 h, que o front
    envia no header X-Admin-Token nas rotas de escrita.
    """
    if not (ADMIN_USER and ADMIN_PASS and ADMIN_TOKEN):
        raise HTTPException(
            503,
            "Credenciais de admin não configuradas. Defina ADMIN_USER, ADMIN_PASS e "
            "ADMIN_TOKEN no servidor.",
        )
    if not (secrets.compare_digest(req.usuario or "", ADMIN_USER) and secrets.compare_digest(req.senha or "", ADMIN_PASS)):
        raise HTTPException(401, "Usuário ou senha inválidos.")
    token, exp = emitir_sessao(ADMIN_USER)
    return {"token": token, "expira": exp, "usuario": ADMIN_USER}


@app.get("/api/admin/verificar")
async def admin_verificar(_: None = Depends(exigir_admin)):
    return {"ok": True}


@app.get("/api/providers")
def listar_providers():
    return {
        nome: {
            "label": cfg["label"],
            "models": cfg["models"],
            "configurado": bool(os.environ.get(cfg["env_key"])),
        }
        for nome, cfg in PROVIDERS.items()
    }


class BuscarReq(BaseModel):
    query: str
    n: int = 6


@app.post("/api/buscar")
async def buscar(req: BuscarReq, request: Request):
    _limitar_llm(request)
    if not req.query.strip():
        raise HTTPException(400, "Informe um termo de busca.")
    n = max(1, min(req.n, MAX_RESULTADOS_BUSCA))
    emb = (await gerar_embeddings([req.query]))[0]
    chunks = await buscar_chunks(emb, n=n)
    if not chunks:
        raise HTTPException(400, "Banco vetorial vazio — ingira os PDFs primeiro.")
    return {
        "resultados": [
            {
                "conteudo": c["content"],
                "fonte": c["source"],
                "pagina": c["page"],
                "relevancia": round(c["similarity"], 3),
            }
            for c in chunks
        ]
    }


class PerguntaReq(BaseModel):
    pergunta: str
    provider: str = "nous"
    modelo: Optional[str] = None


@app.post("/api/perguntar")
async def perguntar(req: PerguntaReq, request: Request):
    _limitar_llm(request)
    if not req.pergunta.strip():
        raise HTTPException(400, "Pergunta vazia.")
    emb = (await gerar_embeddings([req.pergunta]))[0]
    chunks = await buscar_chunks(emb, n=6)
    if not chunks:
        raise HTTPException(400, "Banco vetorial vazio — ingira os PDFs primeiro.")

    contexto, media = montar_contexto(chunks)
    modelo = resolver_modelo(req.provider, req.modelo)
    resposta = await chamar_llm(
        req.provider, modelo, SYSTEM_PROMPT_PERGUNTA, f"CONTEXTO:\n{contexto}\n\nPERGUNTA: {req.pergunta}"
    )

    return {
        "resposta": resposta,
        "contexto": [
            {"conteudo": c["content"], "fonte": c["source"], "pagina": c["page"], "relevancia": round(c["similarity"], 3)}
            for c in chunks
        ],
        "pouco_embasado": media < LIMIAR_CONFIANCA,
        "confianca_media": round(media, 3),
        "provider": req.provider,
        "modelo": modelo,
    }


class EvidenciaIn(BaseModel):
    conteudo: str
    fonte: str
    pagina: Optional[int] = None
    relevancia: Optional[float] = None


class SimplificarReq(BaseModel):
    pergunta: str
    resposta: str
    contexto: list[EvidenciaIn] = []
    provider: str = "nous"
    modelo: Optional[str] = None


@app.post("/api/simplificar")
async def simplificar(req: SimplificarReq, request: Request):
    _limitar_llm(request)
    contexto = contexto_para_texto([e.model_dump() for e in req.contexto])
    modelo = resolver_modelo(req.provider, req.modelo)
    resposta = await chamar_llm(
        req.provider,
        modelo,
        SYSTEM_PROMPT_SIMPLIFICAR,
        f"CONTEXTO:\n{contexto}\n\nPERGUNTA ORIGINAL: {req.pergunta}\n\n"
        f"RESPOSTA ORIGINAL:\n{req.resposta}\n\nReescreva a resposta de forma bem mais simples.",
    )
    return {"resposta": limpar_resposta(resposta), "provider": req.provider, "modelo": modelo}


class VerificarReq(BaseModel):
    pergunta: str
    resposta: str
    contexto: list[EvidenciaIn] = []
    provider: str = "nous"
    modelo: Optional[str] = None


@app.post("/api/verificar")
async def verificar(req: VerificarReq, request: Request):
    _limitar_llm(request)
    contexto = contexto_para_texto([e.model_dump() for e in req.contexto])
    modelo = resolver_modelo(req.provider, req.modelo)
    bruto = limpar_resposta(
        await chamar_llm(
            req.provider,
            modelo,
            SYSTEM_PROMPT_VERIFICAR,
            f"CONTEXTO:\n{contexto}\n\nPERGUNTA: {req.pergunta}\n\nRESPOSTA DADA:\n{req.resposta}",
        )
    )
    perguntas: list[str] = []
    bloco = extrair_bloco_json(bruto)
    if bloco:
        try:
            parsed = json.loads(bloco)
            perguntas = [p for p in parsed.get("perguntas", []) if isinstance(p, str) and p.strip()]
        except json.JSONDecodeError:
            pass
    if not perguntas:
        perguntas = [l.strip("-•* ").strip() for l in bruto.splitlines() if l.strip()][:2]
    return {"perguntas": perguntas[:2], "provider": req.provider, "modelo": modelo}


class AuditarReq(BaseModel):
    resposta: str
    n_por_frase: int = 1


@app.post("/api/auditar")
async def auditar(req: AuditarReq, request: Request):
    """Verifica frase por frase se a resposta tem apoio no material (detecção de alucinação).

    Quebra a resposta em frases e, para cada uma, busca no índice vetorial o
    trecho mais parecido. A similaridade vira um nível (apoiada / parcial /
    não apoiada) — o front pinta as frases sem apoio para o aluno ver onde a IA
    saiu da apostila.

    Fica fora do tempo da resposta: é uma chamada separada, disparada pelo front
    depois que a resposta aparece. Por isso tem o mesmo limite de uso das rotas
    que gastam chave.
    """
    _limitar_llm(request)
    resposta = (req.resposta or "").strip()
    if not resposta:
        raise HTTPException(400, "Resposta vazia.")

    frases = quebrar_frases(resposta)
    if not frases:
        return {"frases": [], "resumo": {"apoiadas": 0, "parciais": 0, "nao_apoiadas": 0}}

    # Embeddings de todas as frases de uma vez (1 chamada ao gte-small).
    embeddings = await gerar_embeddings(frases)

    resultados = []
    for frase, emb in zip(frases, embeddings):
        # Busca até 3 chunks: a frase pode estar espalhada em mais de um trecho,
        # e o chunk mais próximo nem sempre contém o trecho literal.
        chunks = await buscar_chunks(emb, n=max(req.n_por_frase, 3))
        melhor = max((c["similarity"] for c in chunks), default=0.0)
        nivel = classificar_fidelidade(melhor)
        # A similaridade sozinha dá falso-positivo (frase inventada curta acha
        # um chunk parecido). O apoio textual rebaixa o nível conforme a
        # cobertura real das palavras da frase nos chunks:
        #   nenhum apoio textual  → não apoiada
        #   apoio parcial         → parcial (nunca acima de parcial)
        apoio = frase_tem_apoio_textual(frase, chunks)
        if apoio == "nenhum":
            nivel = "nao_apoiada"
        elif apoio == "parcial" and nivel == "apoiada":
            nivel = "parcial"
        resultados.append({
            "frase": frase,
            "nivel": nivel,
            "similaridade": round(melhor, 3),
            "fonte": chunks[0]["source"] if chunks else None,
            "pagina": chunks[0]["page"] if chunks else None,
        })

    resumo = {
        "apoiadas": sum(1 for r in resultados if r["nivel"] == "apoiada"),
        "parciais": sum(1 for r in resultados if r["nivel"] == "parcial"),
        "nao_apoiadas": sum(1 for r in resultados if r["nivel"] == "nao_apoiada"),
    }
    return {"frases": resultados, "resumo": resumo}


class GlossarioReq(BaseModel):
    tema: str = ""  # opcional: assunto pra focar, ou uma questão/texto colado para extrair termos dele
    provider: str = "nous"
    modelo: Optional[str] = None


@app.post("/api/glossario")
async def glossario(req: GlossarioReq, request: Request):
    _limitar_llm(request)
    texto_usuario = req.tema.strip()
    query = texto_usuario or "principais conceitos, termos técnicos e siglas do curso"
    emb = (await gerar_embeddings([query]))[0]
    # 12 chunks em vez de 25: o glossário é a rota com o maior contexto e era a
    # única que estourava o tempo da função. Metade do contexto acelera a resposta
    # sem perder os termos relevantes (o material por assunto vem nos primeiros).
    chunks = await buscar_chunks(emb, n=12)
    if not chunks:
        raise HTTPException(400, "Banco vetorial vazio — ingira os PDFs primeiro.")

    contexto, _ = montar_contexto(chunks)
    modelo = resolver_modelo(req.provider, req.modelo)
    partes = [f"CONTEXTO DAS APOSTILAS:\n{contexto}"]
    if texto_usuario:
        partes.append(f"TEXTO/QUESTÃO FORNECIDO PELO ALUNO (priorize os termos daqui):\n{texto_usuario}")
    user_prompt = "\n\n".join(partes)

    def extrair_termos(bruto: str) -> list[dict]:
        bloco = extrair_bloco_json(bruto)
        if not bloco:
            return []
        try:
            parsed = json.loads(bloco)
        except json.JSONDecodeError:
            return []
        return [
            {
                "termo": t.get("termo", "").strip(),
                "explicacao": t.get("explicacao", "").strip(),
                "exemplo": (t.get("exemplo") or "").strip(),
            }
            for t in parsed.get("termos", [])
            if isinstance(t, dict) and t.get("termo") and t.get("explicacao")
        ]

    # A retentativa resolve a maioria dos casos em que o modelo foge do formato
    # JSON, mas cada tentativa custa uma chamada inteira do modelo. Duas chamadas
    # não cabem no orçamento da função quando o modelo é lento — era essa a causa
    # do 504 no glossário (2 × ~25 s num limite de 60 s).
    inicio = time.perf_counter()
    termos: list[dict] = []
    for _ in range(2):
        restante = TEMPO_MAX_FUNCAO - (time.perf_counter() - inicio) - MARGEM_SEGURANCA
        if restante < 8:  # não há mais tempo para uma chamada útil
            break
        bruto = limpar_resposta(
            await chamar_llm(req.provider, modelo, SYSTEM_PROMPT_GLOSSARIO, user_prompt, timeout=restante)
        )
        termos = extrair_termos(bruto)
        if termos:
            break

    aviso = None
    if termos:
        aviso = await salvar_termos_glossario(termos, origem=texto_usuario[:200])

    resposta = {"termos": termos, "provider": req.provider, "modelo": modelo}
    if not termos:
        resposta["aviso_geracao"] = (
            "O modelo não devolveu os termos no formato esperado dentro do tempo disponível. "
            "Tente de novo ou escolha outro modelo."
        )
    if aviso:
        # Não bloqueia a resposta ao aluno, mas deixa de falhar em silêncio.
        resposta["aviso_salvamento"] = f"Termos exibidos, mas não foram salvos no banco — {aviso}"
    return resposta


@app.get("/api/glossario/termos")
async def listar_termos_glossario(q: str = ""):
    """Busca termos já salvos no banco (gerados em sumários anteriores)."""
    return {"termos": await buscar_termos_glossario(q)}


class ResolverReq(BaseModel):
    texto: str
    provider: str = "nous"
    modelo: Optional[str] = None


@app.post("/api/resolver")
async def resolver(req: ResolverReq, request: Request):
    _limitar_llm(request)
    texto = req.texto.strip()
    questao, alternativas = extrair_alternativas(texto)

    if not alternativas:
        raise HTTPException(400, "Não foi possível identificar alternativas (A, B, C...) no texto.")

    emb = (await gerar_embeddings([questao]))[0]
    chunks = await buscar_chunks(emb, n=8)
    if not chunks:
        raise HTTPException(400, "Banco vetorial vazio — ingira os PDFs primeiro.")

    contexto, media = montar_contexto(chunks)
    modelo = resolver_modelo(req.provider, req.modelo)
    resposta_bruta = limpar_resposta(
        await chamar_llm(
            req.provider,
            modelo,
            SYSTEM_PROMPT_RESOLVER,
            f"CONTEXTO:\n{contexto}\n\nQUESTÃO:\n{questao}\n\nALTERNATIVAS:\n{formatar_alternativas(alternativas)}",
        )
    )

    letra = None
    explicacao_rapida = resposta_bruta
    explicacao_detalhada = ""
    alternativas_erradas: dict[str, str] = {}
    bloco = extrair_bloco_json(resposta_bruta)
    if bloco:
        try:
            parsed = json.loads(bloco)
            letra = (parsed.get("letra") or "").strip().upper() or None
            explicacao_rapida = parsed.get("explicacao_rapida") or parsed.get("explicacao") or resposta_bruta
            explicacao_detalhada = parsed.get("explicacao_detalhada") or ""
            alternativas_erradas = {
                k.strip().upper(): v.strip()
                for k, v in (parsed.get("alternativas_erradas") or {}).items()
                if isinstance(v, str) and v.strip() and k.strip().upper() != letra
            }
        except json.JSONDecodeError:
            pass

    return {
        "questao": questao,
        "alternativas": alternativas,
        "resposta": letra,
        "conteudo_resposta": alternativas.get(letra, "") if letra else "",
        "explicacao": explicacao_rapida,
        "explicacao_rapida": explicacao_rapida,
        "explicacao_detalhada": explicacao_detalhada,
        "alternativas_erradas": alternativas_erradas,
        "pouco_embasado": media < LIMIAR_CONFIANCA,
        "confianca_media": round(media, 3),
        "contexto": [{"conteudo": c["content"], "fonte": c["source"], "pagina": c["page"]} for c in chunks[:4]],
        "provider": req.provider,
        "modelo": modelo,
    }


# ── Comparar a mesma pergunta entre vários modelos ─────────────────────────
#
# A comparação roda sobre FATOS concretos (números e nomes próprios) — ver a
# explicação em `rag_core.calcular_concordancia`.


class CompararItem(BaseModel):
    provider: str
    modelo: Optional[str] = None


class CompararReq(BaseModel):
    pergunta: str
    modelos: list[CompararItem]


@app.post("/api/comparar")
async def comparar(req: CompararReq, request: Request):
    """Consulta a MESMA pergunta em vários modelos e aponta onde eles divergem.

    Todos recebem o mesmo contexto do RAG, então qualquer diferença vem do
    modelo. Cada um é instruído a terminar com uma linha 'RESPOSTA DIRETA:',
    que dá uma conclusão curta e comparável — comparar o texto completo seria
    comparar formatação, não conteúdo.
    """
    _limitar_llm(request)
    pergunta = req.pergunta.strip()
    if not pergunta:
        raise HTTPException(400, "Pergunta vazia.")
    if not 2 <= len(req.modelos) <= 4:
        raise HTTPException(400, "Informe entre 2 e 4 modelos para comparar.")

    emb = (await gerar_embeddings([pergunta]))[0]
    chunks = await buscar_chunks(emb, n=6)
    if not chunks:
        raise HTTPException(400, "Banco vetorial vazio — ingira os PDFs primeiro.")

    contexto, media = montar_contexto(chunks)
    user_prompt = f"CONTEXTO:\n{contexto}\n\nPERGUNTA: {pergunta}"

    async def responder(item: CompararItem) -> dict:
        try:
            modelo = resolver_modelo(item.provider, item.modelo)
        except HTTPException as e:
            return {
                "provider": item.provider,
                "modelo": item.modelo or "",
                "rotulo": f"{item.provider}/{item.modelo or '?'}",
                "resposta": "",
                "resposta_direta": "",
                "segundos": 0.0,
                "erro": str(e.detail),
            }
        nome = f"{item.provider}/{modelo}"
        inicio = time.perf_counter()
        try:
            bruto = await chamar_llm(item.provider, modelo, SYSTEM_PROMPT_COMPARAR, user_prompt)
            resposta = limpar_resposta(bruto)
            erro = None
        except HTTPException as e:
            resposta, erro = "", str(e.detail)
        except Exception as e:  # rede, timeout, formato inesperado
            resposta, erro = "", f"{type(e).__name__}: {e}"[:300]
        direta = extrair_resposta_direta(resposta)
        resto = resposta
        if direta:
            # remove a linha da resposta direta do corpo exibido (fica no campo próprio)
            resto = remover_linha_resposta_direta(resposta)
        else:
            # O modelo não emitiu a linha obrigatória: usa a última linha útil, para
            # que a comparação entre modelos não fique cega.
            direta = conclusao_fallback(resposta)
        return {
            "provider": item.provider,
            "modelo": modelo,
            "rotulo": nome,
            "resposta": resto,
            "resposta_direta": direta,
            "segundos": round(time.perf_counter() - inicio, 1),
            "erro": erro,
        }

    # Em paralelo: o tempo total é o do modelo mais lento, não a soma.
    respostas = list(await asyncio.gather(*(responder(m) for m in req.modelos)))

    # ── Comparação sobre a RESPOSTA DIRETA (curta e comparável) ────────────
    boas = [r for r in respostas if not r["erro"] and r["resposta_direta"]]
    # Rótulos repetidos (mesmo provedor+modelo duas vezes) são desambiguados, senão
    # o dicionário perderia uma das respostas e o veredito sairia "indefinida".
    diretas = dict(zip(rotulos_unicos([r["rotulo"] for r in boas]), [r["resposta_direta"] for r in boas]))
    comparacao = calcular_concordancia(diretas)

    return {
        "pergunta": pergunta,
        "respostas": respostas,
        **comparacao,
        "modelos_ok": len(boas),
        "modelos_total": len(req.modelos),
        "pouco_embasado": media < LIMIAR_CONFIANCA,
        "confianca_media": round(media, 3),
        "contexto": [
            {"conteudo": c["content"], "fonte": c["source"], "pagina": c["page"], "relevancia": round(c["similarity"], 3)}
            for c in chunks
        ],
    }


# ── Ingestão ────────────────────────────────────────────────────────────────

LOTE_INGESTAO = 24  # chunks por chamada (evita estourar o timeout da function serverless)
QUEDA_MAXIMA_TEXTO = 0.4  # reindexar pode perder no máximo 40% do TEXTO indexado


def preparar_linhas(paginas: list[tuple[int, str]]) -> list[dict]:
    linhas = []
    for num_pagina, texto_pagina in paginas:
        for pedaco in chunk_texto(texto_pagina):
            if pedaco.strip():
                linhas.append({"pagina": num_pagina, "texto": pedaco})
    return linhas


async def _analisar_ingestao(arquivo: str) -> dict:
    """Prepara a ingestão sem gravar nada: quanto existe hoje × quanto viria.

    A comparação é feita sobre o TOTAL DE CARACTERES indexados, não sobre a
    quantidade de chunks. O chunker atual produz trechos de ~900 caracteres
    (antes: cortes de 500), então uma reindexação sadia costuma gerar MENOS
    chunks com o mesmo conteúdo — comparar contagem acusaria perda falsa e
    ensinaria o usuário a confirmar sem ler.
    """
    todos = await listar_documentos_storage()
    if arquivo not in todos:
        raise HTTPException(404, f"Arquivo '{arquivo}' não encontrado no Storage.")

    dados = await baixar_documento_storage(arquivo)
    try:
        paginas = extrair_paginas(dados, arquivo)
    except Exception as e:
        # Um PDF ilegível não pode derrubar a rota com "Internal Server Error":
        # o usuário precisa saber QUAL arquivo e POR QUÊ. Caso real: um
        # certificado do curso faz o pypdf levantar PdfReadError.
        raise HTTPException(
            422,
            f"Não consegui ler o PDF '{arquivo}' ({type(e).__name__}). O arquivo pode estar "
            f"corrompido ou protegido por senha. Detalhe: {str(e)[:160]}",
        )
    linhas = preparar_linhas(paginas)
    existentes, chars_existentes = await medir_indice_atual(arquivo)

    chars_novos = sum(len(l["texto"]) for l in linhas)
    paginas_com_texto = sum(1 for _, t in paginas if (t or "").strip())
    avisos: list[str] = []

    if not linhas:
        if paginas_com_texto == 0:
            avisos.append(
                "Nenhum texto extraído das páginas. Se o PDF for digitalizado (imagem), "
                "o texto precisa de OCR antes de indexar."
            )
        else:
            avisos.append("O material tem texto, mas nenhum trecho atingiu o tamanho mínimo para indexação.")
    elif chars_existentes and chars_novos < chars_existentes * (1 - QUEDA_MAXIMA_TEXTO):
        perdido = round(100 - 100 * chars_novos / chars_existentes)
        avisos.append(
            f"A reindexação cobriria {chars_novos} caracteres contra {chars_existentes} já indexados "
            f"(perda de {perdido}% do texto). Confirme se é mesmo isso."
        )

    return {
        "arquivo": arquivo,
        "paginas": len(paginas),
        "paginas_com_texto": paginas_com_texto,
        "chunks_existentes": existentes,
        "chunks_novos": len(linhas),
        "chars_existentes": chars_existentes,
        "chars_novos": chars_novos,
        "perda": max(0, existentes - len(linhas)),
        "perda_texto_percentual": (
            round(100 - 100 * chars_novos / chars_existentes) if chars_existentes else 0
        ),
        "avisos": avisos,
        "ok": bool(linhas) and not avisos,
    }


class IngerirReq(BaseModel):
    arquivo: str
    offset: int = 0
    forcar: bool = False


async def _risco_de_perda(fonte: str, data: bytes, nome_arquivo: str) -> Optional[dict]:
    """O upload substituiria um documento indexado por outro que rende menos texto?

    Devolve o corpo do 409 (com os números e os avisos) ou None quando é seguro.
    Cobre o caso em que o arquivo novo não extrai texto nenhum — um PDF
    digitalizado subindo no lugar de um indexado apagaria o material.
    """
    existentes, chars_existentes = await medir_indice_atual(fonte)
    if not chars_existentes:
        return None  # nada indexado nesta fonte: não há o que perder

    avisos: list[str] = []
    try:
        linhas = preparar_linhas(extrair_paginas(data, nome_arquivo))
        chars_novos = sum(len(l["texto"]) for l in linhas)
    except Exception as e:  # PDF corrompido, formato inesperado
        linhas, chars_novos = [], 0
        avisos.append(f"Não foi possível extrair texto do arquivo enviado ({type(e).__name__}: {e})"[:200])

    if not linhas:
        avisos.append(
            "O arquivo enviado não rendeu nenhum trecho indexável — substituir deixaria "
            "este documento sem conteúdo no índice."
        )
    elif chars_novos < chars_existentes * (1 - QUEDA_MAXIMA_TEXTO):
        perdido = round(100 - 100 * chars_novos / chars_existentes)
        avisos.append(
            f"O arquivo enviado cobre {chars_novos} caracteres contra {chars_existentes} já indexados "
            f"(perda de {perdido}% do texto)."
        )

    if not avisos:
        return None

    return {
        "mensagem": (
            f"Substituir '{fonte}' apaga os chunks atuais antes de indexar o arquivo novo. "
            "Reenvie com forcar=true se for mesmo isso."
        ),
        "arquivo": nome_arquivo,
        "fonte_afetada": fonte,
        "chunks_existentes": existentes,
        "chars_existentes": chars_existentes,
        "chars_novos": chars_novos,
        "perda_texto_percentual": (
            round(100 - 100 * chars_novos / chars_existentes) if chars_existentes else 0
        ),
        "avisos": avisos,
    }


@app.post("/api/ingerir/previa")
async def ingerir_previa(req: IngerirReq, _: None = Depends(exigir_admin)):
    """Dry-run: o que a reindexação faria, sem tocar em nada."""
    return await _analisar_ingestao(req.arquivo)


@app.post("/api/ingerir")
async def ingerir(req: IngerirReq, _: None = Depends(exigir_admin)):
    """Indexa um documento do Storage em lotes.

    A versão anterior apagava os chunks da fonte ANTES de saber se a extração
    produzia algo — um clique em "reindexar" apagava 384 chunks de um PDF que
    não existe mais no Storage. Agora a queda de conteúdo precisa ser
    confirmada com `forcar: true`.
    """
    # A análise (medir o índice atual contra o que viria) só decide algo no
    # PRIMEIRO lote. Nos seguintes era trabalho jogado fora: um download do PDF
    # inteiro mais uma varredura do índice a cada 24 chunks. Num documento de 123
    # páginas isso são 11 análises completas dentro de um orçamento de 60 s por
    # chamada — o que faz a indexação estourar o tempo no meio.
    if req.offset == 0:
        analise = await _analisar_ingestao(req.arquivo)
        if not req.forcar and not analise["ok"]:
            raise HTTPException(
                409,
                {
                    "mensagem": "Reindexação bloqueada para não perder conteúdo. Use /api/ingerir/previa para ver os números.",
                    **analise,
                },
            )
    else:
        analise = None

    dados = await baixar_documento_storage(req.arquivo)
    linhas = preparar_linhas(extrair_paginas(dados, req.arquivo))

    if not linhas:
        return {
            "ok": True,
            "arquivo": req.arquivo,
            "processado": 0,
            "total": 0,
            "proximo_offset": 0,
            "done": True,
            "avisos": (analise or {}).get("avisos", []),
        }

    if req.offset == 0:
        await apagar_chunks_por_fonte(req.arquivo)  # evita duplicar ao reindexar

    fatia = linhas[req.offset : req.offset + LOTE_INGESTAO]
    if fatia:
        embeddings = await gerar_embeddings([l["texto"] for l in fatia])
        rows = [
            {"content": l["texto"], "embedding": emb, "source": req.arquivo, "page": l["pagina"]}
            for l, emb in zip(fatia, embeddings)
        ]
        await inserir_chunks(rows)

    proximo = req.offset + len(fatia)
    return {
        "ok": True,
        "arquivo": req.arquivo,
        "processado": len(fatia),
        "total": len(linhas),
        "proximo_offset": proximo,
        "done": proximo >= len(linhas),
    }


# ── Upload ──────────────────────────────────────────────────────────────────


@app.post("/api/upload")
async def upload(
    files: list[UploadFile] = File(...),
    forcar: bool = Form(False),
    _: None = Depends(exigir_admin),
):
    """Envia documentos ao Storage sem permitir duplicatas.

    Regras (evitam indexar o mesmo documento duas vezes):
    - mesmo conteúdo + mesmo nome  → ignora (já está lá)
    - mesmo conteúdo + outro nome  → SOBRESCREVE: apaga o antigo (arquivo e
      chunks) e mantém só o novo nome, para não haver dois iguais no índice
    - mesmo nome + conteúdo novo   → versão atualizada: apaga os chunks antigos
      (senão sobrariam chunks das duas versões)
    - arquivo novo                 → salva

    Antes de apagar chunks de uma fonte que já está indexada, compara quanto
    texto o arquivo novo renderia com o que está indexado hoje. Se cobrir menos
    de 60% do texto, exige `forcar=true` — é este o caminho em que o material
    de um documento pode ser destruído por um upload mal extraído.
    """
    existentes = await listar_arquivos_storage()
    por_md5 = {a["md5"]: a for a in existentes if a["md5"]}
    por_nome = {a["nome"]: a for a in existentes}

    salvos: list[str] = []
    substituidos: list[dict] = []
    ignorados: list[dict] = []

    for f in files:
        nome = Path(f.filename or "").name  # descarta caminhos vindos do cliente
        if not nome.lower().endswith(EXTENSOES_DOCUMENTO):
            ignorados.append({"arquivo": nome, "motivo": f"formato não suportado (aceito: {', '.join(EXTENSOES_DOCUMENTO)})"})
            continue

        data = await f.read()
        if not data:
            ignorados.append({"arquivo": nome, "motivo": "arquivo vazio"})
            continue
        if len(data) > limite_upload_bytes():
            ignorados.append({"arquivo": nome, "motivo": f"maior que {limite_upload_mb()} MB"})
            continue
        md5 = hashlib.md5(data).hexdigest()

        igual = por_md5.get(md5)
        if igual and igual["nome"] == nome:
            ignorados.append({"arquivo": nome, "motivo": "conteúdo idêntico já indexado"})
            continue

        # Qual fonte teria os chunks apagados, e o que o arquivo novo oferece.
        fonte_afetada = igual["nome"] if igual else (nome if nome in por_nome else None)
        if fonte_afetada and not forcar:
            bloqueio = await _risco_de_perda(fonte_afetada, data, nome)
            if bloqueio:
                raise HTTPException(409, bloqueio)

        if igual:
            # Mesmo documento com nome diferente → substitui o existente.
            await apagar_chunks_por_fonte(igual["nome"])
            await remover_documento_storage(igual["nome"])
            por_nome.pop(igual["nome"], None)
            substituidos.append({"arquivo": nome, "substituiu": igual["nome"],
                                 "motivo": "mesmo conteúdo, nome diferente"})
        elif nome in por_nome:
            # Mesmo nome, conteúdo novo → versão atualizada.
            await apagar_chunks_por_fonte(nome)
            substituidos.append({"arquivo": nome, "substituiu": nome,
                                 "motivo": "versão atualizada do mesmo arquivo"})
        else:
            salvos.append(nome)

        await upload_documento_storage(nome, data, _mimetype(nome))
        por_md5[md5] = {"nome": nome, "md5": md5}
        por_nome[nome] = {"nome": nome, "md5": md5}

    return {"salvos": salvos, "substituidos": substituidos, "ignorados": ignorados}


@app.get("/api/duplicatas")
async def duplicatas(_: None = Depends(exigir_admin)):
    """Diagnóstico: arquivos no Storage com o mesmo conteúdo (MD5)."""
    arquivos = await listar_arquivos_storage()
    agrupado: dict[str, list[str]] = {}
    for a in arquivos:
        if a["md5"]:
            agrupado.setdefault(a["md5"], []).append(a["nome"])
    grupos = [nomes for nomes in agrupado.values() if len(nomes) > 1]
    return {"total_arquivos": len(arquivos), "grupos_duplicados": grupos}


@app.get("/api/pdfs")
async def pdfs():
    return {"arquivos": await listar_documentos_storage()}
