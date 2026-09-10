"""
Engenharia de Prompt — RAG API (cloud)

Roda como Vercel Serverless Function (Python/ASGI). Sem backend local:
- Banco vetorial + storage dos PDFs: Supabase (Postgres/pgvector + Storage)
- Embeddings: Supabase Edge Function "embeddings" (modelo gte-small, gratuito)
- Geração de resposta: provedor de IA escolhido no dropdown do frontend
  (OpenRouter, Groq, NVIDIA NIM, AIHubMix, ...) via API OpenAI-compatible
"""
import asyncio
import hashlib
import io
import json
import os
import re
import time
import unicodedata
from typing import Optional
from urllib.parse import quote

import httpx
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pypdf import PdfReader

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")


def _checar_config_supabase():
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise HTTPException(
            500,
            "SUPABASE_URL/SUPABASE_ANON_KEY não configuradas nas variáveis de ambiente do Vercel.",
        )

LIMIAR_CONFIANCA = 0.35  # abaixo disso, avisamos que a resposta é pouco embasada na apostila

app = FastAPI(title="Engenharia de Prompt — RAG API (cloud)")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ── Provedores de IA (todos com API "OpenAI-compatible") ───────────────────
# Lista verificada em 10/09/2026: cada modelo abaixo respondeu de fato a uma
# chamada real de chat. Modelos que retornavam erro/recusa foram removidos.
# O primeiro de cada lista é o padrão do dropdown.
PROVIDERS = {
    "groq": {
        "label": "Groq",
        "base_url": "https://api.groq.com/openai/v1",
        "env_key": "GROQ_API_KEY",
        "models": [
            "groq/compound-mini",
            "groq/compound",
            "openai/gpt-oss-120b",
            "openai/gpt-oss-20b",
            "qwen/qwen3.8-27b",
            "allam-2-7b",
            "qwen/qwen3.6-27b",  # emite tags <think> na resposta
        ],
    },
    "openrouter": {
        "label": "OpenRouter",
        "base_url": "https://openrouter.ai/api/v1",
        "env_key": "OPENROUTER_API_KEY",
        "models": [
            "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
            "inclusionai/ling-3.0-flash-fin:free",
            "nex-agi/nex-n2.5-pro:free",
            "nex-agi/nex-n2.5-mini:free",
            "cohere/north-mini-code:free",
            "liquid/lfm-2.5-2.6b:free",
            "dots-studio/dots-3-note-preview:free",
            "inclusionai/ling-3.0-flash-sante:free",
            "nvidia/nemotron-3-super-120b-a12b:free",
            "poolside/laguna-xs-2.1:free",
            "openrouter/free",
            "nvidia/nemotron-3.5-lightning:free",  # lento (~90 s)
        ],
    },
    "nvidia": {
        "label": "NVIDIA NIM",
        "base_url": "https://integrate.api.nvidia.com/v1",
        "env_key": "NVIDIA_API_KEY",
        "models": [
            "nvidia/nemotron-3-super-120b-a12b",
            "nvidia/nemotron-3.5-lightning-30b-a3b",
        ],
    },
    "nous": {
        "label": "Nous Portal",
        "base_url": "https://inference-api.nousresearch.com/v1",
        "env_key": "NOUS_API_KEY",
        "models": [
            # Verificados em 10/09/2026 (chamada real de chat) — gratuitos primeiro
            "meituan/longcat-2.0:free",
            "inclusionai/ling-3.0-flash-sante:free",
            "inclusionai/ling-3.0-flash-fin:free",
            "poolside/laguna-s-2.1:free",
            "poolside/laguna-xs-2.1:free",
            "mistralai/mistral-nemo",  # pago, mais barato do portal (~$0.02/1M in)
            "openai/gpt-oss-20b",
            "meta-llama/llama-3.1-8b-instruct",
            "inclusionai/ling-3.0-flash",
            "qwen/qwen3.7-flash",
            "amazon/nova-micro-v1",
            "openai/gpt-oss-120b",
            "deepseek/deepseek-v4-flash-0731",
            "qwen/qwen3-30b-a3b-instruct-2507",
        ],
    },
}

_H = {"Authorization": f"Bearer {SUPABASE_ANON_KEY}", "apikey": SUPABASE_ANON_KEY}


# ── Supabase: embeddings, busca vetorial, chunks, storage ──────────────────

EMBEDDINGS_LOTE = 8  # a Edge Function estoura WORKER_RESOURCE_LIMIT acima de ~10-12 textos por chamada


async def gerar_embeddings(textos: list[str]) -> list[list[float]]:
    _checar_config_supabase()
    resultado: list[list[float]] = []
    async with httpx.AsyncClient(timeout=30) as client:
        for i in range(0, len(textos), EMBEDDINGS_LOTE):
            lote = textos[i : i + EMBEDDINGS_LOTE]
            r = await client.post(
                f"{SUPABASE_URL}/functions/v1/embeddings",
                headers={**_H, "Content-Type": "application/json"},
                json={"texts": lote},
            )
            r.raise_for_status()
            resultado.extend(r.json()["embeddings"])
    return resultado


async def buscar_chunks(query_embedding: list[float], n: int = 6) -> list[dict]:
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"{SUPABASE_URL}/rest/v1/rpc/match_ementas",
            headers={**_H, "Content-Type": "application/json"},
            json={"query_embedding": query_embedding, "match_count": n},
        )
    r.raise_for_status()
    return r.json()


async def inserir_chunks(rows: list[dict]):
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"{SUPABASE_URL}/rest/v1/ementas_chunks",
            headers={**_H, "Content-Type": "application/json", "Prefer": "return=minimal"},
            json=rows,
        )
    r.raise_for_status()


async def apagar_chunks_por_fonte(nome: str):
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.delete(
            f"{SUPABASE_URL}/rest/v1/ementas_chunks",
            headers=_H,
            params={"source": f"eq.{nome}"},
        )
    r.raise_for_status()


async def upload_pdf_storage(filename: str, data: bytes):
    _checar_config_supabase()
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(
            f"{SUPABASE_URL}/storage/v1/object/ementas/{quote(filename)}",
            headers={**_H, "Content-Type": "application/pdf", "x-upsert": "true"},
            content=data,
        )
    r.raise_for_status()


async def listar_arquivos_storage() -> list[dict]:
    """PDFs do bucket, com o MD5 do conteúdo (eTag) para detectar duplicatas."""
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"{SUPABASE_URL}/storage/v1/object/list/ementas",
            headers={**_H, "Content-Type": "application/json"},
            json={"prefix": ""},
        )
    r.raise_for_status()
    arquivos = []
    for f in r.json():
        if not f["name"].lower().endswith(".pdf"):
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


async def listar_pdfs_storage() -> list[str]:
    return [a["nome"] for a in await listar_arquivos_storage()]


async def remover_pdf_storage(filename: str):
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.request(
            "DELETE",
            f"{SUPABASE_URL}/storage/v1/object/ementas/{quote(filename)}",
            headers=_H,
        )
    r.raise_for_status()


async def baixar_pdf_storage(filename: str) -> bytes:
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.get(f"{SUPABASE_URL}/storage/v1/object/ementas/{quote(filename)}", headers=_H)
    r.raise_for_status()
    return r.content


# ── Chunking + extração de PDF ──────────────────────────────────────────────

def chunk_texto(texto: str, tamanho: int = 500, sobreposicao: int = 50) -> list[str]:
    texto = texto.strip()
    if not texto:
        return []
    chunks, inicio = [], 0
    while inicio < len(texto):
        chunks.append(texto[inicio: inicio + tamanho])
        inicio += tamanho - sobreposicao
    return chunks


def extrair_paginas(pdf_bytes: bytes) -> list[tuple[int, str]]:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    return [(i + 1, page.extract_text() or "") for i, page in enumerate(reader.pages)]


# ── Chamada ao provedor de IA escolhido (dropdown) ──────────────────────────

async def chamar_llm(provider: str, modelo: str, system_prompt: str, user_prompt: str) -> str:
    cfg = PROVIDERS.get(provider)
    if not cfg:
        raise HTTPException(400, f"Provedor desconhecido: {provider}")
    api_key = os.environ.get(cfg["env_key"])
    if not api_key:
        raise HTTPException(
            500,
            f"Chave de API não configurada para '{provider}' "
            f"(defina {cfg['env_key']} nas variáveis de ambiente do Vercel).",
        )
    async with httpx.AsyncClient(timeout=60) as client:
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
    if r.status_code != 200:
        raise HTTPException(502, f"Erro do provedor {provider}: {r.text[:300]}")
    return r.json()["choices"][0]["message"]["content"]


def montar_contexto(chunks: list[dict]) -> tuple[str, float]:
    contexto = "\n\n".join(f"[Fonte: {c['source']}, página {c['page']}]\n{c['content']}" for c in chunks)
    media = sum(c["similarity"] for c in chunks) / len(chunks) if chunks else 0.0
    return contexto, media


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
    'Prompt, usando o CONTEXTO das apostilas. Responda SEMPRE em JSON: {"letra": "A", '
    '"explicacao": "..."}. Escolha a alternativa correta com base no contexto e, se necessário, '
    "complemente com conhecimento geral."
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


def contexto_para_texto(evidencias: list[dict]) -> str:
    return "\n\n".join(
        f"[Fonte: {e.get('fonte', '?')}, página {e.get('pagina', '?')}]\n{e.get('conteudo', '')}"
        for e in evidencias
    )


# ── Rotas ────────────────────────────────────────────────────────────────────

@app.get("/api/status")
async def status():
    _checar_config_supabase()
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.head(
            f"{SUPABASE_URL}/rest/v1/ementas_chunks",
            headers={**_H, "Prefer": "count=exact"},
            params={"select": "id"},
        )
    total = 0
    cr = r.headers.get("content-range")
    if cr and "/" in cr:
        total = int(cr.split("/")[-1])
    return {"status": "ready" if total > 0 else "empty", "total": total}


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
async def buscar(req: BuscarReq):
    emb = (await gerar_embeddings([req.query]))[0]
    chunks = await buscar_chunks(emb, n=req.n)
    if not chunks:
        raise HTTPException(400, "Banco vetorial vazio — ingira os PDFs primeiro.")
    return {
        "resultados": [
            {"conteudo": c["content"], "fonte": c["source"], "pagina": c["page"], "relevancia": round(c["similarity"], 3)}
            for c in chunks
        ]
    }


class PerguntaReq(BaseModel):
    pergunta: str
    provider: str = "groq"
    modelo: Optional[str] = None


@app.post("/api/perguntar")
async def perguntar(req: PerguntaReq):
    emb = (await gerar_embeddings([req.pergunta]))[0]
    chunks = await buscar_chunks(emb, n=6)
    if not chunks:
        raise HTTPException(400, "Banco vetorial vazio — ingira os PDFs primeiro.")

    contexto, media = montar_contexto(chunks)
    modelo = req.modelo or PROVIDERS[req.provider]["models"][0]
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
    provider: str = "groq"
    modelo: Optional[str] = None


@app.post("/api/simplificar")
async def simplificar(req: SimplificarReq):
    contexto = contexto_para_texto([e.model_dump() for e in req.contexto])
    modelo = req.modelo or PROVIDERS[req.provider]["models"][0]
    resposta = await chamar_llm(
        req.provider,
        modelo,
        SYSTEM_PROMPT_SIMPLIFICAR,
        f"CONTEXTO:\n{contexto}\n\nPERGUNTA ORIGINAL: {req.pergunta}\n\n"
        f"RESPOSTA ORIGINAL:\n{req.resposta}\n\nReescreva a resposta de forma bem mais simples.",
    )
    return {"resposta": resposta, "provider": req.provider, "modelo": modelo}


class VerificarReq(BaseModel):
    pergunta: str
    resposta: str
    contexto: list[EvidenciaIn] = []
    provider: str = "groq"
    modelo: Optional[str] = None


@app.post("/api/verificar")
async def verificar(req: VerificarReq):
    contexto = contexto_para_texto([e.model_dump() for e in req.contexto])
    modelo = req.modelo or PROVIDERS[req.provider]["models"][0]
    bruto = await chamar_llm(
        req.provider,
        modelo,
        SYSTEM_PROMPT_VERIFICAR,
        f"CONTEXTO:\n{contexto}\n\nPERGUNTA: {req.pergunta}\n\nRESPOSTA DADA:\n{req.resposta}",
    )
    perguntas: list[str] = []
    match = re.search(r"\{.*\}", bruto, re.DOTALL)
    if match:
        try:
            parsed = json.loads(match.group(0))
            perguntas = [p for p in parsed.get("perguntas", []) if isinstance(p, str) and p.strip()]
        except json.JSONDecodeError:
            pass
    if not perguntas:
        perguntas = [l.strip("-•* ").strip() for l in bruto.splitlines() if l.strip()][:2]
    return {"perguntas": perguntas[:2], "provider": req.provider, "modelo": modelo}


class ResolverReq(BaseModel):
    texto: str
    provider: str = "groq"
    modelo: Optional[str] = None


@app.post("/api/resolver")
async def resolver(req: ResolverReq):
    texto = req.texto.strip()
    raw_alts = re.findall(
        r"(?:^|\n)\s*([A-Ea-e])\s*[).\-]\s*(.+?)(?=(?:\n\s*[A-Ea-e]\s*[).\-])|\Z)", texto, re.DOTALL
    )
    alternativas = {l.upper(): c.strip() for l, c in raw_alts}
    primeiro = re.search(r"\n?\s*[A-Ea-e]\s*[).\-]", texto)
    questao = texto[: primeiro.start()].strip() if primeiro else texto

    if not alternativas:
        raise HTTPException(400, "Não foi possível identificar alternativas (A, B, C...) no texto.")

    emb = (await gerar_embeddings([questao]))[0]
    chunks = await buscar_chunks(emb, n=8)
    if not chunks:
        raise HTTPException(400, "Banco vetorial vazio — ingira os PDFs primeiro.")

    contexto, media = montar_contexto(chunks)
    modelo = req.modelo or PROVIDERS[req.provider]["models"][0]
    alternativas_fmt = "\n".join(f"{l}) {c}" for l, c in alternativas.items())
    resposta_bruta = await chamar_llm(
        req.provider,
        modelo,
        SYSTEM_PROMPT_RESOLVER,
        f"CONTEXTO:\n{contexto}\n\nQUESTÃO:\n{questao}\n\nALTERNATIVAS:\n{alternativas_fmt}",
    )

    letra, explicacao = None, resposta_bruta
    match = re.search(r"\{.*\}", resposta_bruta, re.DOTALL)
    if match:
        try:
            parsed = json.loads(match.group(0))
            letra = (parsed.get("letra") or "").strip().upper() or None
            explicacao = parsed.get("explicacao", resposta_bruta)
        except json.JSONDecodeError:
            pass

    return {
        "questao": questao,
        "alternativas": alternativas,
        "resposta": letra,
        "conteudo_resposta": alternativas.get(letra, "") if letra else "",
        "explicacao": explicacao,
        "pouco_embasado": media < LIMIAR_CONFIANCA,
        "confianca_media": round(media, 3),
        "contexto": [{"conteudo": c["content"], "fonte": c["source"], "pagina": c["page"]} for c in chunks[:4]],
        "provider": req.provider,
        "modelo": modelo,
    }


# ── Comparar a mesma pergunta entre vários modelos ─────────────────────────
#
# Sobre a métrica: similaridade de vocabulário NÃO mede concordância. Medições
# reais mostraram que respostas divergentes ("26 milhões" vs "450 mil
# habitantes") pontuavam MAIS que respostas concordantes, porque falar do mesmo
# assunto já compartilha vocabulário. A comparação abaixo é feita sobre FATOS
# concretos (números e nomes próprios), que é onde a discordância aparece.

_STOPWORDS = {
    "que", "qual", "quais", "para", "por", "com", "uma", "dos", "das", "the", "and",
    "sao", "ser", "esta", "estao", "como", "mais", "menos", "seu", "sua", "seus",
    "suas", "nao", "sim", "tambem", "onde", "quando", "porque", "pode", "podem",
    "deve", "devem", "esse", "essa", "isso", "este", "aquele", "aquela",
    "um", "uma", "uns", "umas", "de", "do", "da", "em", "no", "na", "nos", "nas",
    "ao", "aos", "as", "os", "e", "ou", "se", "ele", "ela", "eles", "elas",
}

# Palavras capitalizadas por início de frase / uso comum — não são nomes próprios.
_NAO_SAO_NOMES = {
    "essa", "esse", "este", "esta", "isso", "aquilo", "aquele", "aquela", "alem",
    "portanto", "entao", "assim", "quando", "onde", "qual", "quais", "para", "com",
    "nao", "sim", "tambem", "porem", "contudo", "logo", "segundo", "durante",
    "apos", "antes", "depois", "aqui", "ali", "exemplo", "fonte", "fonte", "pagina",
    "nota", "observacao", "resposta", "resumo", "conclusao", "introducao",
    "de", "da", "do", "das", "dos", "em", "no", "na", "nos", "nas", "ao", "aos",
    "um", "uma", "uns", "umas", "se", "ou", "e", "mas", "que", "como", "quando",
}


def _limpar_resposta(texto: str) -> str:
    """Remove blocos de raciocínio (<think>...</think>) que alguns modelos emitem."""
    limpo = re.sub(r"<think>.*?</think>", "", texto, flags=re.DOTALL | re.IGNORECASE)
    limpo = re.sub(r"</?think>", "", limpo, flags=re.IGNORECASE)
    return limpo.strip()


def _normalizar_numero(tok: str) -> str:
    """'1.000' e '1000' viram o mesmo fato; '26,3' vira '26.3'."""
    t = tok.strip().rstrip(".,")
    if re.fullmatch(r"\d{1,3}(\.\d{3})+", t):      # separador de milhar brasileiro
        t = t.replace(".", "")
    elif re.fullmatch(r"\d{1,3}(,\d{3})+", t):    # separador de milhar americano
        t = t.replace(",", "")
    else:
        t = t.replace(",", ".")
    return t


def _extrair_numeros(texto: str) -> set[str]:
    """Números citados no texto, normalizados ('1.000' == '1000', '26,3' == '26.3')."""
    nums = set()
    for tok in re.findall(r"\d[\d.,]*", texto):
        n = _normalizar_numero(tok)
        if n and re.search(r"\d", n):
            nums.add(n)
    return nums


def _extrair_nomes(texto: str) -> set[str]:
    """Nomes próprios citados no texto (informativo — mais ruidoso que números).

    Descarta palavras capitalizadas que abrem frase/linha/item de lista ou que
    são rótulos seguidos de dois-pontos ("**Conecta:**", "Defina:") — são verbos
    que os modelos capitalizam por formatação, não nomes de coisa alguma.
    """
    nomes = set()
    terminadores = ".!?:\n"
    for m in re.finditer(r"\b[A-ZÀ-Ý][a-zà-ÿ]{2,}\b", texto):
        # é rótulo? ("Palavra:" ou "**Palavra:**")
        j = m.end()
        while j < len(texto) and texto[j] in "*_` \t":
            j += 1
        if j < len(texto) and texto[j] == ":":
            continue

        # abre frase/linha/item de lista?
        i = m.start() - 1
        while i >= 0 and texto[i] in " \t*_`-–—>#•|\"'([{":
            i -= 1
        if i < 0 or texto[i] in terminadores:
            continue

        norm = unicodedata.normalize("NFKD", m.group(0).lower())
        norm = "".join(c for c in norm if not unicodedata.combining(c))
        if norm in _NAO_SAO_NOMES or len(norm) < 3:
            continue
        nomes.add(norm)
    return nomes


def _palavras_conteudo(texto: str) -> set[str]:
    """Vocabulário significativo — métrica AUXILIAR de semelhança de texto."""
    t = unicodedata.normalize("NFKD", texto.lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    return {p for p in re.findall(r"[a-z0-9]{4,}", t) if p not in _STOPWORDS}


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


SYSTEM_PROMPT_COMPARAR = (
    "Você é um assistente do curso de Engenharia de Prompt. Responda à pergunta do aluno "
    "usando principalmente o CONTEXTO fornecido (trechos das apostilas). Cite a fonte e a página "
    "quando possível. Complemente com conhecimento geral se o contexto não bastar.\n\n"
    "Ao final, escreva OBRIGATORIAMENTE uma última linha, sozinha, no formato exato:\n"
    "RESPOSTA DIRETA: <a resposta essencial em no máximo 20 palavras, sem markdown>"
)


def _extrair_resposta_direta(texto: str) -> str:
    """Pega a linha 'RESPOSTA DIRETA: ...' que o modelo foi instruído a emitir."""
    m = re.findall(r"RESPOSTA\s*DIRETA\s*:?\**\s*(.+)", texto, flags=re.IGNORECASE)
    if not m:
        return ""
    linha = m[-1]
    linha = linha.replace("*", "").strip()
    return linha[:400]


class CompararItem(BaseModel):
    provider: str
    modelo: Optional[str] = None


class CompararReq(BaseModel):
    pergunta: str
    modelos: list[CompararItem]


@app.post("/api/comparar")
async def comparar(req: CompararReq):
    """Consulta a MESMA pergunta em vários modelos e aponta onde eles divergem.

    Todos recebem o mesmo contexto do RAG, então qualquer diferença vem do
    modelo. Cada um é instruído a terminar com uma linha 'RESPOSTA DIRETA:',
    que dá uma conclusão curta e comparável — comparar o texto completo seria
    comparar formatação, não conteúdo.
    """
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
        cfg = PROVIDERS.get(item.provider)
        modelo = item.modelo or (cfg["models"][0] if cfg else "")
        nome = f"{item.provider}/{modelo}"
        inicio = time.perf_counter()
        try:
            bruto = await chamar_llm(item.provider, modelo, SYSTEM_PROMPT_COMPARAR, user_prompt)
            resposta = _limpar_resposta(bruto)
            erro = None
        except HTTPException as e:
            resposta, erro = "", str(e.detail)
        except Exception as e:  # rede, timeout, formato inesperado
            resposta, erro = "", f"{type(e).__name__}: {e}"[:300]
        direta, resto = _extrair_resposta_direta(resposta), resposta
        if direta:
            # remove a linha da resposta direta do corpo exibido (fica no campo próprio)
            resto = re.sub(r"\**\s*RESPOSTA\s*DIRETA\s*:?\**.*$", "", resposta,
                           flags=re.IGNORECASE | re.DOTALL).strip()
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
    diretas = {r["rotulo"]: r["resposta_direta"] for r in boas}

    numeros_por_modelo = {rot: _extrair_numeros(d) for rot, d in diretas.items()}
    nomes_por_modelo = {rot: _extrair_nomes(d) for rot, d in diretas.items()}

    def dividir(por_modelo: dict[str, set[str]]) -> tuple[list[str], list[dict]]:
        onde: dict[str, list[str]] = {}
        for rotulo, itens in por_modelo.items():
            for it in itens:
                onde.setdefault(it, []).append(rotulo)
        comuns = sorted(i for i, ms in onde.items() if len(ms) >= 2)
        exclusivos = sorted(
            ({"fato": i, "modelo": ms[0]} for i, ms in onde.items() if len(ms) == 1),
            key=lambda d: d["fato"],
        )
        return comuns, exclusivos

    def vazio(por_modelo):
        """Nenhum fato para comparar (todos os modelos não citam fatos)."""
        return not any(por_modelo.values())

    numeros_comuns, numeros_exclusivos = dividir(numeros_por_modelo)
    nomes_comuns, nomes_exclusivos = dividir(nomes_por_modelo)

    # Similaridade entre as conclusões (curtas, então aqui vocabulário diz algo).
    conj = [_palavras_conteudo(d) for d in diretas.values()]
    vocab, pares = [], 0
    for i in range(len(conj)):
        for j in range(i + 1, len(conj)):
            vocab.append(_jaccard(conj[i], conj[j]))
            pares += 1
    similaridade = round(sum(vocab) / pares, 3) if pares else 0.0

    # Divergência em número na conclusão = conflito concreto (26 mi vs 460 mil).
    divergencia_numerica = len(boas) >= 2 and bool(numeros_exclusivos)

    # Calibrado com medições reais: conclusões equivalentes escritas por modelos
    # diferentes ficam em ~0,28-0,36 de Jaccard (a redação difere), então o
    # limiar de "alta" não pode ser alto. Nomes compartilhados (os modelos
    # citam as mesmas entidades) reforçam o acordo.
    if len(boas) < 2:
        nivel = "indefinida"
    elif divergencia_numerica:
        nivel = "baixa"                      # conflito verificável
    elif len(nomes_comuns) >= 2 or similaridade >= 0.30:
        nivel = "alta"
    elif similaridade >= 0.20:
        nivel = "media"
    else:
        nivel = "baixa"

    return {
        "pergunta": pergunta,
        "respostas": respostas,
        "nivel_concordancia": nivel,
        "divergencia_numerica": divergencia_numerica,
        "similaridade_conclusoes": similaridade,
        "numeros_comuns": numeros_comuns,
        "numeros_exclusivos": numeros_exclusivos,
        "nomes_comuns": nomes_comuns,
        "nomes_exclusivos": nomes_exclusivos,
        "sem_fatos": vazio(numeros_por_modelo) and vazio(nomes_por_modelo),
        "modelos_ok": len(boas),
        "modelos_total": len(req.modelos),
        "pouco_embasado": media < LIMIAR_CONFIANCA,
        "confianca_media": round(media, 3),
        "contexto": [
            {"conteudo": c["content"], "fonte": c["source"], "pagina": c["page"], "relevancia": round(c["similarity"], 3)}
            for c in chunks
        ],
    }


@app.post("/api/upload")
async def upload(files: list[UploadFile] = File(...)):
    """Envia PDFs ao Storage sem permitir duplicatas.

    Regras (evitam indexar o mesmo documento duas vezes):
    - mesmo conteúdo + mesmo nome  → ignora (já está lá)
    - mesmo conteúdo + outro nome  → SOBRESCREVE: apaga o antigo (arquivo e
      chunks) e mantém só o novo nome, para não haver dois iguais no índice
    - mesmo nome + conteúdo novo   → versão atualizada: apaga os chunks antigos
      (senão sobrariam chunks das duas versões)
    - arquivo novo                 → salva
    """
    existentes = await listar_arquivos_storage()
    por_md5 = {a["md5"]: a for a in existentes if a["md5"]}
    por_nome = {a["nome"]: a for a in existentes}

    salvos: list[str] = []
    substituidos: list[dict] = []
    ignorados: list[dict] = []

    for f in files:
        nome = f.filename or ""
        if not nome.lower().endswith(".pdf"):
            ignorados.append({"arquivo": nome, "motivo": "não é PDF"})
            continue

        data = await f.read()
        if not data:
            ignorados.append({"arquivo": nome, "motivo": "arquivo vazio"})
            continue
        md5 = hashlib.md5(data).hexdigest()

        igual = por_md5.get(md5)
        if igual and igual["nome"] == nome:
            ignorados.append({"arquivo": nome, "motivo": "conteúdo idêntico já indexado"})
            continue

        if igual:
            # Mesmo documento com nome diferente → substitui o existente.
            await apagar_chunks_por_fonte(igual["nome"])
            await remover_pdf_storage(igual["nome"])
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

        await upload_pdf_storage(nome, data)
        por_md5[md5] = {"nome": nome, "md5": md5}
        por_nome[nome] = {"nome": nome, "md5": md5}

    return {"salvos": salvos, "substituidos": substituidos, "ignorados": ignorados}


@app.get("/api/duplicatas")
async def duplicatas():
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
    return {"arquivos": await listar_pdfs_storage()}


LOTE_INGESTAO = 24  # chunks por chamada (evita estourar o timeout da function serverless)


class IngerirReq(BaseModel):
    arquivo: str
    offset: int = 0


@app.post("/api/ingerir")
async def ingerir(req: IngerirReq):
    todos = await listar_pdfs_storage()
    if req.arquivo not in todos:
        raise HTTPException(404, f"Arquivo '{req.arquivo}' não encontrado no Storage.")

    pdf_bytes = await baixar_pdf_storage(req.arquivo)
    paginas = extrair_paginas(pdf_bytes)
    linhas = []
    for num_pagina, texto_pagina in paginas:
        for pedaco in chunk_texto(texto_pagina):
            if pedaco.strip():
                linhas.append({"pagina": num_pagina, "texto": pedaco})

    if not linhas:
        return {"ok": True, "arquivo": req.arquivo, "processado": 0, "total": 0, "done": True}

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
        "processado": proximo,
        "total": len(linhas),
        "proximo_offset": proximo,
        "done": proximo >= len(linhas),
    }
