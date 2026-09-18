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
import json
import os
import secrets
import sys
import time
from pathlib import Path
from typing import Optional
from urllib.parse import quote

import httpx
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse
from pydantic import BaseModel

# `rag_core.py` fica ao lado deste arquivo. O sys.path garante o import tanto
# rodando local (`uvicorn api.index:app`) quanto no bundle da Vercel.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from _app.http_util import (  # noqa: E402
    TEMPO_MAX_FUNCAO,
    MARGEM_SEGURANCA,
    TIMEOUT_LLM,
    _TIMEOUT,
    _http,
)
from _app.provedores import (  # noqa: E402
    chamar_llm_stream,
    PROVIDERS,
    chamar_llm,
    resolver_modelo,
)
from _app.prompts import (  # noqa: E402
    SYSTEM_PROMPT_PERGUNTA,
    SYSTEM_PROMPT_RESOLVER,
    SYSTEM_PROMPT_SIMPLIFICAR,
    SYSTEM_PROMPT_VERIFICAR,
    SYSTEM_PROMPT_GLOSSARIO,
    SYSTEM_PROMPT_COMPARAR,
    SYSTEM_PROMPT_APOSTILA,
    SYSTEM_PROMPT_RESUMO_MAP,
    SYSTEM_PROMPT_RESUMO_REDUCE,
    SYSTEM_PROMPT_PERFIS_COMPORTAMENTAIS,
    PERFIS_COMPORTAMENTAIS,
    SYSTEM_PROMPT_ELENCO,
    ELENCO_PERSONAS,
    SYSTEM_PROMPT_SUPORTE,
    SUPORTE_PERSONAS,
    PERSONA_PROMPTS,
    NIVEIS_APRENDER,
    SYSTEM_PROMPT_AVALIAR_FEYNMAN,
)
from _app.documentos import (  # noqa: E402
    extrair_paginas,
    montar_contexto,
    contexto_para_texto,
    _slug_arquivo,
    _markdown_para_docx,
    _markdown_para_pdf,
    _mimetype,
)
from rag_core import (  # noqa: E402
    calcular_concordancia,
    chunk_texto,
    classificar_fidelidade,
    conclusao_fallback,
    extrair_alternativas,
    extrair_bloco_json,
    extrair_resolucao,
    extrair_resposta_direta,
    extrair_termos_glossario,
    formatar_alternativas,
    formatar_exemplos_para_banco,
    frase_tem_apoio_textual,
    limpar_resposta,
    quebrar_frases,
    remover_linha_resposta_direta,
    rotulos_unicos,
    separar_exemplos,
    varias_listas_de_alternativas,
)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "")
ADMIN_USER = os.environ.get("ADMIN_USER", "")
ADMIN_PASS = os.environ.get("ADMIN_PASS", "")
SESSION_SECRET = os.environ.get("SESSION_SECRET", "")

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
LIMITE_LLM_POR_MINUTO = 20  # por IP (ver as duas camadas em _limitar_llm)
# Tetos diários compartilhados entre instâncias (0 desliga). Ajustáveis por ambiente.
LIMITE_LLM_POR_DIA_IP = int(os.environ.get("LIMITE_LLM_POR_DIA_IP", "300"))
LIMITE_LLM_GLOBAL_POR_DIA = int(os.environ.get("LIMITE_LLM_GLOBAL_POR_DIA", "5000"))


EXTENSOES_DOCUMENTO = (".pdf", ".txt", ".md", ".docx", ".pptx")

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


# ── Configuração e credenciais ─────────────────────────────────────────────


def _checar_config_supabase():
    if not SUPABASE_URL or not (SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY):
        raise HTTPException(
            500,
            "SUPABASE_URL/SUPABASE_ANON_KEY não configuradas nas variáveis de ambiente.",
        )


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
    """Segredo usado para assinar as sessões.

    Prefere SESSION_SECRET: com um segredo próprio, dá para derrubar todas as
    sessões emitidas (trocando só ele) sem invalidar o ADMIN_TOKEN que scripts
    e CLI usam. Sem ele, cai no ADMIN_TOKEN, como antes. Sem nenhum dos dois, a
    autenticação fica indisponível (falha fechada)."""
    if not ADMIN_TOKEN:
        raise HTTPException(
            503,
            "ADMIN_TOKEN não configurado no servidor. Defina a variável de ambiente "
            "ADMIN_TOKEN (segredo) para habilitar a área restrita.",
        )
    return SESSION_SECRET or ADMIN_TOKEN


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
    """Protege as rotas de ESCRITA (upload, ingestão e diagnóstico do Storage).

    Escopo real, para não prometer o que não entrega: as rotas de geração que
    gastam chave de IA (/api/perguntar, /api/glossario, /api/resolver,
    /api/comparar, /api/gerar-apostila, /api/resumir-apostila, /api/simplificar,
    /api/verificar, /api/auditar, /api/perfil-comportamental e
    /api/elenco-conversa) são PÚBLICAS de propósito — o aluno usa o app sem
    login. O que contém abuso ali é `_limitar_llm` (limite por IP) somado à
    validação de modelo em `resolver_modelo`, que impede escolher um modelo fora
    da lista curada.

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
# Camada local (por instância). A camada compartilhada fica no Supabase — ver
# `_limitar_llm` e supabase-backup/migracoes/2026-09-16-cota-de-uso.sql.
_uso_por_ip: dict[str, list[float]] = {}

# Acima disto, varre e descarta os IPs sem uso recente. Sem a varredura o
# dicionário só crescia: a poda antiga limpava apenas a lista do IP consultado,
# então quem passou uma vez e não voltou ficava na memória para sempre.
MAX_IPS_RASTREADOS = 5000


def _ip_cliente(request: Request) -> str:
    """IP do cliente, considerando o proxy da plataforma.

    `request.client.host` é o IP de quem abriu a conexão TCP — atrás da Vercel
    (ou de qualquer reverse proxy) isso é o proxy, não o usuário, e o limite por
    IP viraria um balde único compartilhado por todo mundo.

    Honestidade sobre o limite: `x-forwarded-for` é um cabeçalho e pode ser
    forjado por quem chama direto. Isto barra abuso trivial e devolve o limite
    por usuário atrás do proxy; não é controle de acesso.
    """
    # Na Vercel, `x-vercel-forwarded-for` é preenchido pela própria plataforma
    # (a Vercel sobrescreve o valor que o cliente mandar), então vem primeiro.
    real = (request.headers.get("x-vercel-forwarded-for") or "").split(",")[0].strip()
    if not real:
        real = (request.headers.get("x-real-ip") or "").strip()
    if not real:
        # O primeiro item da cadeia é o cliente original; o resto são os proxies.
        real = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    if real:
        return real
    return (request.client.host if request.client else "?") or "?"


async def _limitar_llm(request: Request):
    """Limite das rotas que gastam chave de IA, em duas camadas.

    1. Memória da instância (por minuto): barato, sempre roda, barra rajadas.
    2. Supabase (`consumir_cota`), compartilhado entre TODAS as instâncias: por
       minuto e por dia por IP, mais um teto diário global. É o que segura o
       custo de verdade — em serverless cada instância tem seu próprio contador,
       então a camada 1 sozinha multiplica o limite pelo número de instâncias.

    A camada 2 só roda com a service_role (a função não é executável pela anon).
    Se o banco falhar, a requisição segue só com a camada 1: o limite é proteção
    de custo, não pode derrubar o app inteiro numa instabilidade do Supabase.
    """
    ip = _ip_cliente(request)
    _limitar_em_memoria(ip)
    if not (SUPABASE_URL and escrita_via_service_role()):
        return
    # O IP não vai para o banco em claro: a chave é um hash com segredo.
    sal = (SESSION_SECRET or ADMIN_TOKEN or SUPABASE_SERVICE_ROLE_KEY).encode()
    ip_hash = hmac.new(sal, ip.encode(), hashlib.sha256).hexdigest()[:32]
    cotas = [
        (f"ip-min:{ip_hash}", LIMITE_LLM_POR_MINUTO, 60, "Muitas requisições em sequência. Tente de novo em instantes."),
        (f"ip-dia:{ip_hash}", LIMITE_LLM_POR_DIA_IP, 86400, "Limite diário de uso atingido para este acesso. Volte amanhã."),
        ("global-dia", LIMITE_LLM_GLOBAL_POR_DIA, 86400, "O app atingiu o limite diário de uso da IA. Volte amanhã."),
    ]
    for chave, limite, janela, mensagem in cotas:
        if limite <= 0:
            continue
        try:
            async with _http(httpx.Timeout(5.0, connect=3.0)) as client:
                r = await client.post(
                    f"{SUPABASE_URL}/rest/v1/rpc/consumir_cota",
                    headers={**_h_escrita(), "Content-Type": "application/json"},
                    json={"p_chave": chave, "p_limite": limite, "p_janela_seg": janela},
                )
            r.raise_for_status()
            permitido = r.json()
        except Exception as e:  # função ausente (migração não aplicada), rede, timeout
            print(f"[limite] cota distribuída indisponível ({type(e).__name__}); só limite local", flush=True)
            return
        if permitido is False:
            raise HTTPException(429, mensagem)


def _limitar_em_memoria(ip: str):
    agora = time.time()
    if len(_uso_por_ip) > MAX_IPS_RASTREADOS:
        for outro, marcas in list(_uso_por_ip.items()):
            if all(agora - t >= 60 for t in marcas):
                del _uso_por_ip[outro]
    usos = [t for t in _uso_por_ip.get(ip, []) if agora - t < 60]
    if len(usos) >= LIMITE_LLM_POR_MINUTO:
        raise HTTPException(429, "Muitas requisições em sequência. Tente de novo em instantes.")
    usos.append(agora)
    _uso_por_ip[ip] = usos


# ── Supabase: embeddings, busca vetorial, chunks, storage ──────────────────

EMBEDDINGS_LOTE = 8  # a Edge Function estoura WORKER_RESOURCE_LIMIT acima de ~10-12 textos por chamada

async def gerar_embeddings(textos: list[str]) -> list[list[float]]:
    _checar_config_supabase()
    resultado: list[list[float]] = []
    async with _http(_TIMEOUT) as client:
        for i in range(0, len(textos), EMBEDDINGS_LOTE):
            lote = textos[i : i + EMBEDDINGS_LOTE]
            # A Edge Function tem falhas passageiras (cold start, 546
            # WORKER_RESOURCE_LIMIT, 5xx): uma segunda tentativa curta resolve a
            # maioria sem o aluno ver erro.
            for tentativa in (1, 2):
                try:
                    r = await client.post(
                        f"{SUPABASE_URL}/functions/v1/embeddings",
                        headers={**_h_leitura(), "Content-Type": "application/json"},
                        json={"texts": lote},
                    )
                except httpx.TransportError:
                    if tentativa == 2:
                        raise
                    await asyncio.sleep(0.5)
                    continue
                if r.status_code < 500 or tentativa == 2:
                    break
                await asyncio.sleep(0.5)
            r.raise_for_status()
            resultado.extend(r.json()["embeddings"])
    return resultado


async def buscar_chunks(query_embedding: list[float], n: int = 6) -> list[dict]:
    async with _http(_TIMEOUT) as client:
        r = await client.post(
            f"{SUPABASE_URL}/rest/v1/rpc/match_ementas",
            headers={**_h_leitura(), "Content-Type": "application/json"},
            json={"query_embedding": query_embedding, "match_count": n},
        )
    r.raise_for_status()
    return r.json()


async def inserir_chunks(rows: list[dict]):
    async with _http(_TIMEOUT) as client:
        r = await client.post(
            f"{SUPABASE_URL}/rest/v1/ementas_chunks",
            headers={**_h_escrita(), "Content-Type": "application/json", "Prefer": "return=minimal"},
            json=rows,
        )
    r.raise_for_status()


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
        async with _http(_TIMEOUT) as client:
            r = await client.get(
                f"{SUPABASE_URL}/rest/v1/ementas_chunks",
                headers={**_h_leitura(), "Range": f"{inicio}-{inicio + 999}", "Range-Unit": "items"},
                params={"select": "content", "source": f"eq.{nome}"},
            )
        # Falha fechada: antes um erro aqui virava `break` e a função devolvia
        # (0, 0) — "nada indexado" —, o que liberava a substituição justamente
        # quando o banco estava instável. Sem medir, não dá para garantir nada.
        r.raise_for_status()
        lote = r.json()
        if not lote:
            break
        quantidade += len(lote)
        total_chars += sum(len(c.get("content") or "") for c in lote)
        if len(lote) < 1000:
            break
        inicio += 1000
    return quantidade, total_chars


async def maior_id_da_fonte(nome: str) -> int:
    """Maior `id` de chunk da fonte (0 se não houver nenhum).

    É o "corte" da troca sem janela vazia: os chunks novos nascem com ids maiores
    (identity), então no fim da reindexação basta apagar `id <= corte`.
    """
    async with _http(_TIMEOUT) as client:
        r = await client.get(
            f"{SUPABASE_URL}/rest/v1/ementas_chunks",
            headers=_h_leitura(),
            params={"select": "id", "source": f"eq.{nome}", "order": "id.desc", "limit": "1"},
        )
    r.raise_for_status()
    linhas = r.json()
    return int(linhas[0]["id"]) if linhas else 0


async def apagar_chunks_ate_id(nome: str, corte: int):
    """Apaga só os chunks ANTIGOS da fonte (id <= corte), preservando os recém-inseridos."""
    async with _http(_TIMEOUT) as client:
        r = await client.delete(
            f"{SUPABASE_URL}/rest/v1/ementas_chunks",
            headers=_h_escrita(),
            params={"source": f"eq.{nome}", "id": f"lte.{corte}"},
        )
    r.raise_for_status()


async def apagar_chunks_acima_de_id(nome: str, piso: int):
    """Apaga os chunks da fonte com id > piso: sobras de um lote que foi inserido
    mas cuja resposta se perdeu (a nova tentativa inseriria o lote de novo)."""
    async with _http(_TIMEOUT) as client:
        r = await client.delete(
            f"{SUPABASE_URL}/rest/v1/ementas_chunks",
            headers=_h_escrita(),
            params={"source": f"eq.{nome}", "id": f"gt.{piso}"},
        )
    r.raise_for_status()


async def renomear_fonte_chunks(antigo: str, novo: str):
    """Troca o `source` dos chunks numa única requisição — sem apagar nada."""
    async with _http(_TIMEOUT) as client:
        r = await client.patch(
            f"{SUPABASE_URL}/rest/v1/ementas_chunks",
            headers={**_h_escrita(), "Content-Type": "application/json", "Prefer": "return=minimal"},
            params={"source": f"eq.{antigo}"},
            json={"source": novo},
        )
    r.raise_for_status()


async def upload_documento_storage(filename: str, data: bytes, mimetype: str = "application/pdf"):
    _checar_config_supabase()
    # O timeout tem de caber no tempo que a função ainda tem de vida: esperar
    # 120 s dentro de um orçamento de 60 s faz a plataforma matar o processo no
    # meio do envio, e o aluno recebe uma falha genérica sem explicação.
    limite = max(10.0, TIMEOUT_LLM)
    async with _http(httpx.Timeout(limite, connect=10.0)) as client:
        r = await client.post(
            f"{SUPABASE_URL}/storage/v1/object/ementas/{quote(filename)}",
            headers={**_h_documentos(), "Content-Type": mimetype, "x-upsert": "true"},
            content=data,
        )
    r.raise_for_status()


async def listar_arquivos_storage() -> list[dict]:
    """Documentos do bucket, com o MD5 do conteúdo (eTag) para detectar duplicatas."""
    async with _http(_TIMEOUT) as client:
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
    async with _http(_TIMEOUT) as client:
        r = await client.request(
            "DELETE",
            f"{SUPABASE_URL}/storage/v1/object/ementas/{quote(filename)}",
            headers=_h_documentos(),
        )
    r.raise_for_status()


async def baixar_documento_storage(filename: str) -> bytes:
    async with _http(httpx.Timeout(120.0, connect=10.0)) as client:
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
        {
            "termo": t["termo"],
            "explicacao": t["explicacao"],
            # Os 1-2 exemplos vão numerados numa coluna de texto (ver
            # `rag_core.formatar_exemplos_para_banco`): assim não é preciso mudar
            # o schema, e o dado continua legível na tabela.
            "exemplo": formatar_exemplos_para_banco(t.get("exemplos") or t.get("exemplo")),
            "origem": origem,
        }
        for t in termos
    ]
    try:
        async with _http(_TIMEOUT) as client:
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
    async with _http(_TIMEOUT) as client:
        r = await client.get(f"{SUPABASE_URL}/rest/v1/glossario_termos", headers=_h_leitura(), params=params)
    r.raise_for_status()
    termos = r.json()
    # A coluna guarda os exemplos numerados num texto só; a interface recebe a
    # lista pronta (e `exemplo` continua preenchido, para não quebrar quem já usa).
    for t in termos:
        t["exemplos"] = separar_exemplos(t.get("exemplo"))
    return termos


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
    async with _http(httpx.Timeout(15.0, connect=8.0)) as client:
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
            "notas": cfg.get("notas", {}),
            "aviso": cfg.get("aviso", ""),
            "configurado": bool(os.environ.get(cfg["env_key"])),
        }
        for nome, cfg in PROVIDERS.items()
    }


class BuscarReq(BaseModel):
    query: str
    n: int = 6


@app.post("/api/buscar")
async def buscar(req: BuscarReq, request: Request):
    await _limitar_llm(request)
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


@app.get("/api/perfis-comportamentais")
def listar_perfis_comportamentais():
    return {
        "perfis": [
            {
                "temperament_id": tid,
                "display_name": p["display_name"],
                "description": p["description"],
            }
            for tid, p in PERFIS_COMPORTAMENTAIS.items()
        ]
    }


class PerfilComportamentalReq(BaseModel):
    contexto: str = ""
    mensagem: str
    temperament_id: str = "estoico"
    provider: str = "nous"
    modelo: Optional[str] = None


@app.post("/api/perfil-comportamental")
async def perfil_comportamental(req: PerfilComportamentalReq, request: Request):
    await _limitar_llm(request)
    if not req.mensagem.strip():
        raise HTTPException(400, "Informe a mensagem recebida do interlocutor.")
    perfil = PERFIS_COMPORTAMENTAIS.get(req.temperament_id)
    if not perfil:
        raise HTTPException(400, f"Perfil comportamental desconhecido: '{req.temperament_id}'.")
    modelo = resolver_modelo(req.provider, req.modelo)
    system_prompt = (
        f"{SYSTEM_PROMPT_PERFIS_COMPORTAMENTAIS}\n\n"
        f"PERFIL COMPORTAMENTAL ATIVO — {perfil['display_name']}:\n{perfil['prompt_modifier']}"
    )
    user_prompt = (
        f"Contexto: {req.contexto.strip() or '(não informado)'}\n"
        f'Entrada do Interlocutor: "{req.mensagem.strip()}"'
    )
    resposta = await chamar_llm(req.provider, modelo, system_prompt, user_prompt)
    return {
        "resposta": limpar_resposta(resposta),
        "temperament_id": req.temperament_id,
        "provider": req.provider,
        "modelo": modelo,
    }


@app.get("/api/elenco-personas")
def listar_elenco_personas():
    return {
        "personas": [
            {
                "persona_id": pid,
                "display_name": p["display_name"],
                "description": p["description"],
                "contexto_label": p["contexto_label"],
                "contexto_placeholder": p["contexto_placeholder"],
                "mensagem_label": p["mensagem_label"],
                "mensagem_placeholder": p["mensagem_placeholder"],
            }
            for pid, p in ELENCO_PERSONAS.items()
        ]
    }


class ElencoConversaReq(BaseModel):
    contexto: str = ""
    mensagem: str = ""
    persona_id: str = "debatedor"
    provider: str = "nous"
    modelo: Optional[str] = None


@app.post("/api/elenco-conversa")
async def elenco_conversa(req: ElencoConversaReq, request: Request):
    await _limitar_llm(request)
    persona = ELENCO_PERSONAS.get(req.persona_id)
    if not persona:
        raise HTTPException(400, f"Persona desconhecida: '{req.persona_id}'.")
    if not req.contexto.strip() and not req.mensagem.strip():
        raise HTTPException(400, "Informe o contexto da conversa ou a última mensagem recebida.")
    modelo = resolver_modelo(req.provider, req.modelo)
    system_prompt = (
        f"{SYSTEM_PROMPT_ELENCO}\n\n"
        f"PERSONA ATIVA — {persona['display_name']}:\n{persona['prompt_modifier']}"
    )
    user_prompt = (
        f"Contexto: {req.contexto.strip() or '(não informado)'}\n"
        f"Última mensagem recebida: {req.mensagem.strip() or '(nenhuma — inicie o assunto)'}"
    )
    resposta = await chamar_llm(req.provider, modelo, system_prompt, user_prompt)
    return {
        "resposta": limpar_resposta(resposta),
        "persona_id": req.persona_id,
        "provider": req.provider,
        "modelo": modelo,
    }


@app.get("/api/suporte-personas")
def listar_suporte_personas():
    return {
        "personas": [
            {
                "persona_id": pid,
                "nome": p["nome"],
                "display_name": p["display_name"],
                "bloco": p["bloco"],
                "description": p["description"],
                "exemplo": p["exemplo"],
                "usa_historico": bool(p.get("usa_historico")),
            }
            for pid, p in SUPORTE_PERSONAS.items()
        ]
    }


MAX_HISTORICO_SUPORTE = 3
MAX_CHARS_HISTORICO = 600


class SuporteReq(BaseModel):
    ambiente: str = ""
    problema: str
    persona_id: str = "byte"
    historico: list[str] = []
    provider: str = "nous"
    modelo: Optional[str] = None


@app.post("/api/suporte-atendimento")
async def suporte_atendimento(req: SuporteReq, request: Request):
    await _limitar_llm(request)
    persona = SUPORTE_PERSONAS.get(req.persona_id)
    if not persona:
        raise HTTPException(400, f"Persona desconhecida: '{req.persona_id}'.")
    if not req.problema.strip():
        raise HTTPException(400, "Descreva o problema, o erro ou cole o log.")
    modelo = resolver_modelo(req.provider, req.modelo)
    system_prompt = (
        f"{SYSTEM_PROMPT_SUPORTE}\n\n"
        f"PERSONALIDADE ATIVA — {persona['nome']}, {persona['display_name']}:\n{persona['prompt_modifier']}"
    )
    partes = [
        f"AMBIENTE: {req.ambiente.strip() or '(não informado)'}",
        f"PROBLEMA:\n{req.problema.strip()}",
    ]
    # Só a persona que declara usar histórico recebe os atendimentos anteriores —
    # nas outras, contexto antigo só distrairia o diagnóstico do chamado atual.
    anteriores = [h.strip()[:MAX_CHARS_HISTORICO] for h in req.historico if h.strip()][:MAX_HISTORICO_SUPORTE]
    if persona.get("usa_historico") and anteriores:
        partes.append(
            "ATENDIMENTOS ANTERIORES (do mais recente ao mais antigo):\n"
            + "\n---\n".join(anteriores)
        )
    resposta = await chamar_llm(req.provider, modelo, system_prompt, "\n\n".join(partes))
    return {
        "resposta": limpar_resposta(resposta),
        "persona_id": req.persona_id,
        "usou_historico": bool(persona.get("usa_historico") and anteriores),
        "provider": req.provider,
        "modelo": modelo,
    }


class PerguntaReq(BaseModel):
    pergunta: str
    provider: str = "nous"
    modelo: Optional[str] = None
    persona: str = "padrao"  # ver PERSONA_PROMPTS


async def _preparar_pergunta(req: PerguntaReq, request: Request) -> tuple[list[dict], str, float, str, str]:
    """Tudo o que vem antes da geração: limite, busca no material e validação.

    Compartilhado pela rota normal e pela de streaming — assim os erros (pergunta
    vazia, banco vazio, modelo inválido, limite) saem com o status HTTP certo
    antes de o stream começar.
    """
    await _limitar_llm(request)
    if not req.pergunta.strip():
        raise HTTPException(400, "Pergunta vazia.")
    modelo = resolver_modelo(req.provider, req.modelo)
    emb = (await gerar_embeddings([req.pergunta]))[0]
    chunks = await buscar_chunks(emb, n=6)
    if not chunks:
        raise HTTPException(400, "Banco vetorial vazio — ingira os PDFs primeiro.")
    contexto, media = montar_contexto(chunks)
    system_prompt = PERSONA_PROMPTS.get(req.persona, SYSTEM_PROMPT_PERGUNTA)
    return chunks, contexto, media, modelo, system_prompt


def _meta_pergunta(req: PerguntaReq, chunks: list[dict], media: float, modelo: str) -> dict:
    return {
        "contexto": [
            {"conteudo": c["content"], "fonte": c["source"], "pagina": c["page"], "relevancia": round(c["similarity"], 3)}
            for c in chunks
        ],
        "pouco_embasado": media < LIMIAR_CONFIANCA,
        "confianca_media": round(media, 3),
        "provider": req.provider,
        "modelo": modelo,
    }


@app.post("/api/perguntar")
async def perguntar(req: PerguntaReq, request: Request):
    chunks, contexto, media, modelo, system_prompt = await _preparar_pergunta(req, request)
    resposta = await chamar_llm(
        req.provider, modelo, system_prompt, f"CONTEXTO:\n{contexto}\n\nPERGUNTA: {req.pergunta}"
    )
    return {"resposta": resposta, **_meta_pergunta(req, chunks, media, modelo)}


@app.post("/api/perguntar/stream")
async def perguntar_stream(req: PerguntaReq, request: Request):
    """Mesma resposta de /api/perguntar, mas em NDJSON conforme o modelo escreve.

    Uma linha JSON por evento: `meta` (fontes e confiança, logo de cara),
    `texto` (cada pedaço gerado), e por fim `fim` ou `erro`. O aluno começa a
    ler em ~1 s em vez de esperar a resposta inteira.
    """
    chunks, contexto, media, modelo, system_prompt = await _preparar_pergunta(req, request)
    user_prompt = f"CONTEXTO:\n{contexto}\n\nPERGUNTA: {req.pergunta}"

    def linha(evento: dict) -> str:
        return json.dumps(evento, ensure_ascii=False) + "\n"

    async def eventos():
        yield linha({"tipo": "meta", **_meta_pergunta(req, chunks, media, modelo)})
        try:
            async for pedaco in chamar_llm_stream(req.provider, modelo, system_prompt, user_prompt):
                yield linha({"tipo": "texto", "t": pedaco})
        except HTTPException as e:
            yield linha({"tipo": "erro", "mensagem": str(e.detail)})
            return
        except Exception as e:  # rede caiu no meio do stream
            yield linha({"tipo": "erro", "mensagem": f"{type(e).__name__}: {e}"[:300]})
            return
        yield linha({"tipo": "fim"})

    return StreamingResponse(
        eventos(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


class ApostilaReq(BaseModel):
    tema: str
    formato: str = "pdf"  # "pdf" ou "docx"
    provider: str = "nous"
    modelo: Optional[str] = None


@app.post("/api/gerar-apostila")
async def gerar_apostila(req: ApostilaReq, request: Request):
    """Gera uma apostila (PDF ou DOCX) sobre o tema pedido.

    Busca contexto no RAG quando a base tiver algo sobre o tema; segue só com
    conhecimento geral quando a base estiver vazia ou indisponível — nunca
    bloqueia a geração por falta de material indexado.
    """
    await _limitar_llm(request)
    tema = req.tema.strip()
    if not tema:
        raise HTTPException(400, "Tema vazio.")
    if req.formato not in ("pdf", "docx"):
        raise HTTPException(400, "Formato inválido (use 'pdf' ou 'docx').")

    contexto = ""
    try:
        emb = (await gerar_embeddings([tema]))[0]
        chunks = await buscar_chunks(emb, n=8)
        if chunks:
            contexto, _ = montar_contexto(chunks)
    except HTTPException:
        pass  # base indisponível/vazia — segue só com conhecimento geral

    modelo = resolver_modelo(req.provider, req.modelo)
    prompt_usuario = f"TEMA: {tema}\n\n"
    if contexto:
        prompt_usuario += f"CONTEXTO DO CURSO:\n{contexto}\n\n"
    prompt_usuario += "Escreva a apostila completa sobre este tema."

    texto = limpar_resposta(await chamar_llm(req.provider, modelo, SYSTEM_PROMPT_APOSTILA, prompt_usuario))
    nome_arquivo = _slug_arquivo(tema)

    if req.formato == "docx":
        conteudo = _markdown_para_docx(texto, tema)
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    else:
        conteudo = _markdown_para_pdf(texto, tema)
        media_type = "application/pdf"

    return Response(
        content=conteudo,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{nome_arquivo}.{req.formato}"'},
    )


MAX_CHUNKS_RESUMO = 40  # cap de chamadas na fase map — acima disso, amostra uniformemente


@app.post("/api/resumir-apostila")
async def resumir_apostila(
    request: Request,
    file: UploadFile = File(...),
    provider: str = Form("nous"),
    modelo: Optional[str] = Form(None),
):
    """Resumo autoexplicativo de um PDF/.docx/.pptx avulso, via map-reduce.

    Não escreve nada no Supabase — o arquivo é processado só em memória, para
    esta requisição. Fase map: extrai pontos-chave de cada chunk em paralelo.
    Fase reduce: uma última chamada compõe o resumo didático final a partir
    desses pontos-chave.
    """
    await _limitar_llm(request)
    nome = Path(file.filename or "").name
    if not nome.lower().endswith(EXTENSOES_DOCUMENTO):
        raise HTTPException(400, f"Formato não suportado (aceito: {', '.join(EXTENSOES_DOCUMENTO)}).")
    dados = await file.read()
    if not dados:
        raise HTTPException(400, "Arquivo vazio.")
    if len(dados) > limite_upload_bytes():
        raise HTTPException(400, f"Arquivo maior que {limite_upload_mb()} MB.")

    paginas = extrair_paginas(dados, nome)
    texto_completo = "\n\n".join(texto for _, texto in paginas if texto.strip())
    chunks = chunk_texto(texto_completo)
    if not chunks:
        raise HTTPException(400, "Não foi possível extrair texto deste arquivo (PDF escaneado sem OCR?).")

    total_chunks = len(chunks)
    amostrado = total_chunks > MAX_CHUNKS_RESUMO
    if amostrado:
        passo = total_chunks / MAX_CHUNKS_RESUMO
        chunks = [chunks[int(i * passo)] for i in range(MAX_CHUNKS_RESUMO)]

    modelo = resolver_modelo(provider, modelo)

    async def extrair_pontos(chunk: str) -> Optional[str]:
        try:
            return await chamar_llm(provider, modelo, SYSTEM_PROMPT_RESUMO_MAP, chunk)
        except HTTPException:
            return None  # um chunk falho não derruba o resumo inteiro

    resultados = await asyncio.gather(*(extrair_pontos(c) for c in chunks))
    pontos_chave = [r for r in resultados if r and "sem conteúdo relevante" not in r.lower()]
    if not pontos_chave:
        raise HTTPException(502, "Não foi possível extrair conteúdo relevante do arquivo.")

    resumo = await chamar_llm(
        provider,
        modelo,
        SYSTEM_PROMPT_RESUMO_REDUCE,
        "\n\n".join(f"- {p}" for p in pontos_chave),
    )

    return {
        "resumo": limpar_resposta(resumo),
        "provider": provider,
        "modelo": modelo,
        "arquivo": nome,
        "chunks_usados": len(chunks),
        "chunks_total": total_chunks,
        "amostrado": amostrado,
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
    await _limitar_llm(request)
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
    await _limitar_llm(request)
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


# ── Aprender: explicação em níveis + técnica Feynman ────────────────────────
# O aluno escolhe o nível da explicação, reexplica com as próprias palavras e
# recebe uma avaliação do entendimento contra o material das apostilas.


class AprenderExplicarReq(BaseModel):
    tema: str
    nivel: str = "estudante"  # ver NIVEIS_APRENDER
    provider: str = "nous"
    modelo: Optional[str] = None


@app.post("/api/aprender/explicar")
async def aprender_explicar(req: AprenderExplicarReq, request: Request):
    if not req.tema.strip():
        raise HTTPException(400, "Tema vazio.")
    system_prompt = NIVEIS_APRENDER.get(req.nivel)
    if system_prompt is None:
        raise HTTPException(400, f"Nível desconhecido: {req.nivel}.")
    await _limitar_llm(request)
    emb = (await gerar_embeddings([req.tema]))[0]
    chunks = await buscar_chunks(emb, n=6)
    if not chunks:
        raise HTTPException(400, "Banco vetorial vazio — ingira os PDFs primeiro.")

    contexto, media = montar_contexto(chunks)
    modelo = resolver_modelo(req.provider, req.modelo)
    resposta = await chamar_llm(req.provider, modelo, system_prompt, f"CONTEXTO:\n{contexto}\n\nTEMA: {req.tema}")
    return {
        "resposta": limpar_resposta(resposta),
        "nivel": req.nivel,
        "contexto": [
            {"conteudo": c["content"], "fonte": c["source"], "pagina": c["page"], "relevancia": round(c["similarity"], 3)}
            for c in chunks
        ],
        "pouco_embasado": media < LIMIAR_CONFIANCA,
        "provider": req.provider,
        "modelo": modelo,
    }


class AprenderAvaliarReq(BaseModel):
    tema: str
    explicacao_aluno: str
    contexto: list[EvidenciaIn] = []
    provider: str = "nous"
    modelo: Optional[str] = None


def _lista_de_textos(valor) -> list[str]:
    if not isinstance(valor, list):
        return []
    return [str(v).strip() for v in valor if isinstance(v, (str, int, float)) and str(v).strip()][:8]


@app.post("/api/aprender/avaliar")
async def aprender_avaliar(req: AprenderAvaliarReq, request: Request):
    if not req.explicacao_aluno.strip():
        raise HTTPException(400, "Escreva sua explicação antes de pedir a avaliação.")
    await _limitar_llm(request)
    contexto = contexto_para_texto([e.model_dump() for e in req.contexto])
    modelo = resolver_modelo(req.provider, req.modelo)
    bruto = limpar_resposta(
        await chamar_llm(
            req.provider,
            modelo,
            SYSTEM_PROMPT_AVALIAR_FEYNMAN,
            f"CONTEXTO:\n{contexto}\n\nTEMA: {req.tema}\n\nEXPLICAÇÃO DO ALUNO:\n{req.explicacao_aluno}",
        )
    )
    avaliacao = {
        "nota": None,
        "acertos": [],
        "lacunas": [],
        "confusoes": [],
        "proxima_pergunta": "",
        "comentario": "",
    }
    parsed = None
    bloco = extrair_bloco_json(bruto)
    if bloco:
        try:
            parsed = json.loads(bloco)
        except json.JSONDecodeError:
            parsed = None
    if isinstance(parsed, dict):
        nota = parsed.get("nota")
        if isinstance(nota, (int, float)):
            avaliacao["nota"] = max(0, min(100, round(nota)))
        for campo in ("acertos", "lacunas", "confusoes"):
            avaliacao[campo] = _lista_de_textos(parsed.get(campo))
        if isinstance(parsed.get("proxima_pergunta"), str):
            avaliacao["proxima_pergunta"] = parsed["proxima_pergunta"].strip()
    else:
        # Plano B: o modelo não devolveu JSON — mostra o texto como comentário livre.
        avaliacao["comentario"] = bruto.strip()
    return {**avaliacao, "provider": req.provider, "modelo": modelo}


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
    await _limitar_llm(request)
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
    await _limitar_llm(request)
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
        # A leitura do JSON vive no rag_core (função pura, coberta por testes).
        termos = extrair_termos_glossario(bruto)
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
    await _limitar_llm(request)
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
    por_que_correta = ""
    exemplos: list[str] = []
    alternativas_erradas: dict[str, str] = {}
    # Leitura do JSON no rag_core (função pura, coberta por testes).
    resolucao = extrair_resolucao(resposta_bruta)
    if resolucao["letra"] or resolucao["explicacao_rapida"]:
        letra = resolucao["letra"]
        explicacao_rapida = resolucao["explicacao_rapida"] or resposta_bruta
        explicacao_detalhada = resolucao["explicacao_detalhada"]
        por_que_correta = resolucao["por_que_correta"]
        exemplos = resolucao["exemplos"]
        alternativas_erradas = resolucao["alternativas_erradas"]

    return {
        "questao": questao,
        # Mais de uma lista A, B, C… no texto: foi usada a última. A interface
        # mostra o enunciado reconhecido para o aluno conferir.
        "varias_listas": varias_listas_de_alternativas(texto),
        "alternativas": alternativas,
        "resposta": letra,
        "conteudo_resposta": alternativas.get(letra, "") if letra else "",
        "explicacao": explicacao_rapida,
        "explicacao_rapida": explicacao_rapida,
        "explicacao_detalhada": explicacao_detalhada,
        # "Professor auxiliar": por que a correta é a correta, com 1-2 exemplos.
        "por_que_correta": por_que_correta,
        "exemplos": exemplos,
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
    await _limitar_llm(request)
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
    # Maior id dos chunks antigos, devolvido pelo lote 0 (ver `ingerir`).
    corte_id: Optional[int] = None
    # Maior id da fonte depois do último lote confirmado (ver `ingerir`).
    ultimo_id: Optional[int] = None


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
            f"Substituir '{fonte}' troca os chunks atuais pelos do arquivo novo, que rende menos texto. "
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

    # Troca sem janela vazia: antes o primeiro lote APAGAVA tudo e os lotes
    # seguintes reinseriam. Se um lote falhasse no meio, o documento ficava
    # pela metade (ou vazio) no índice. Agora os chunks antigos continuam lá
    # enquanto os novos entram, e só são apagados (id <= corte) no último lote.
    # O corte é calculado no lote 0 e o cliente o devolve nos lotes seguintes.
    corte = await maior_id_da_fonte(req.arquivo) if req.offset == 0 else (req.corte_id or 0)

    # Retentativa idempotente (análise de 17/09/2026, A1-06): se o lote anterior
    # foi inserido mas a resposta se perdeu, repetir o mesmo offset inseria tudo
    # de novo. O cliente devolve o maior id confirmado (`ultimo_id`); acima dele
    # só pode haver sobra de tentativa falha, que sai antes de inserir. O piso
    # nunca fica abaixo do corte, então os chunks antigos não são tocados aqui.
    if req.offset > 0 and req.ultimo_id is not None:
        await apagar_chunks_acima_de_id(req.arquivo, max(req.ultimo_id, corte))

    fatia = linhas[req.offset : req.offset + LOTE_INGESTAO]
    if fatia:
        embeddings = await gerar_embeddings([l["texto"] for l in fatia])
        rows = [
            {"content": l["texto"], "embedding": emb, "source": req.arquivo, "page": l["pagina"]}
            for l, emb in zip(fatia, embeddings)
        ]
        await inserir_chunks(rows)

    proximo = req.offset + len(fatia)
    done = proximo >= len(linhas)
    if done and corte > 0:
        await apagar_chunks_ate_id(req.arquivo, corte)
    return {
        "ok": True,
        "arquivo": req.arquivo,
        "processado": len(fatia),
        "total": len(linhas),
        "proximo_offset": proximo,
        "done": done,
        "corte_id": corte,
        "ultimo_id": await maior_id_da_fonte(req.arquivo) if not done else None,
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
    - mesmo conteúdo + outro nome  → SOBRESCREVE: renomeia os chunks para o nome
      novo e remove o arquivo antigo, para não haver dois iguais no índice
    - mesmo nome + conteúdo novo   → versão atualizada: a ingestão seguinte troca
      os chunks antigos pelos novos (sem sobrar chunks das duas versões)
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
        atual = por_nome.get(nome)
        if (igual and igual["nome"] == nome) or (atual and atual["md5"] == md5):
            ignorados.append({"arquivo": nome, "motivo": "conteúdo idêntico já indexado"})
            continue

        # Conteúdo de A com o nome de B, sendo que B já existe com outro conteúdo:
        # renomear os chunks de A para B misturava os dois documentos e apagava
        # o arquivo de B sem a guarda olhar para ele (análise de 17/09/2026, A1-08).
        # Não há "forçar" que torne isso seguro: o arquivo precisa de outro nome.
        if igual and atual:
            raise HTTPException(
                409,
                {
                    "mensagem": (
                        f"'{nome}' já existe com outro conteúdo, e o arquivo enviado é igual a "
                        f"'{igual['nome']}'. Enviar misturaria os dois documentos."
                    ),
                    "arquivo": nome,
                    "fonte_afetada": nome,
                    "avisos": [f"Renomeie o arquivo ou apague '{nome}' ou '{igual['nome']}' antes."],
                    "sem_forcar": True,
                },
            )

        # Qual fonte teria os chunks apagados, e o que o arquivo novo oferece.
        fonte_afetada = igual["nome"] if igual else (nome if nome in por_nome else None)
        if fonte_afetada and not forcar:
            bloqueio = await _risco_de_perda(fonte_afetada, data, nome)
            if bloqueio:
                raise HTTPException(409, bloqueio)

        # O upload não apaga chunks: a ingestão que vem em seguida troca os
        # antigos pelos novos sem deixar o documento vazio no meio do caminho.
        if igual:
            # Mesmo documento com nome diferente → os chunks passam a responder
            # pelo nome novo (um PATCH só), e o arquivo antigo sai do Storage
            # depois que o novo já foi gravado.
            await upload_documento_storage(nome, data, _mimetype(nome))
            await renomear_fonte_chunks(igual["nome"], nome)
            await remover_documento_storage(igual["nome"])
            por_nome.pop(igual["nome"], None)
            por_md5[md5] = {"nome": nome, "md5": md5}
            por_nome[nome] = {"nome": nome, "md5": md5}
            substituidos.append({"arquivo": nome, "substituiu": igual["nome"],
                                 "motivo": "mesmo conteúdo, nome diferente"})
            continue
        elif nome in por_nome:
            # Mesmo nome, conteúdo novo → versão atualizada.
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
async def pdfs(_: None = Depends(exigir_admin)):
    """Lista os documentos do Storage.

    Exige admin pela mesma razão que /api/duplicatas: ambas expõem o conteúdo do
    bucket. É usada só pela aba de administração, dentro de um fluxo que já
    precisa do token para os passos seguintes (prévia e ingestão).
    """
    return {"arquivos": await listar_documentos_storage()}
