"""
Engenharia de Prompt — RAG API (cloud)

Roda como Vercel Serverless Function (Python/ASGI). Sem backend local:
- Banco vetorial + storage dos PDFs: Supabase (Postgres/pgvector + Storage)
- Embeddings: Supabase Edge Function "embeddings" (modelo gte-small, gratuito)
- Geração de resposta: provedor de IA escolhido no dropdown do frontend
  (OpenRouter, Groq, NVIDIA NIM, AIHubMix, ...) via API OpenAI-compatible
"""
import io
import json
import os
import re
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
PROVIDERS = {
    "groq": {
        "label": "Groq",
        "base_url": "https://api.groq.com/openai/v1",
        "env_key": "GROQ_API_KEY",
        "models": ["groq/compound", "groq/compound-mini"],
    },
    "openrouter": {
        "label": "OpenRouter",
        "base_url": "https://openrouter.ai/api/v1",
        "env_key": "OPENROUTER_API_KEY",
        "models": [
            "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
            "google/gemma-4-31b-it:free",
        ],
    },
    "nvidia": {
        "label": "NVIDIA NIM",
        "base_url": "https://integrate.api.nvidia.com/v1",
        "env_key": "NVIDIA_API_KEY",
        "models": ["meta/llama-3.1-70b-instruct"],
    },
    "aihubmix": {
        "label": "AIHubMix",
        "base_url": "https://aihubmix.com/v1",
        "env_key": "AIHUBMIX_API_KEY",
        "models": ["hy3-free", "nemotron-3.5-lightning-free", "coding-kimi-k3-free", "gpt-oss-20b-free"],
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


async def listar_pdfs_storage() -> list[str]:
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"{SUPABASE_URL}/storage/v1/object/list/ementas",
            headers={**_H, "Content-Type": "application/json"},
            json={"prefix": ""},
        )
    r.raise_for_status()
    return [f["name"] for f in r.json() if f["name"].endswith(".pdf")]


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


@app.post("/api/upload")
async def upload(files: list[UploadFile] = File(...)):
    salvos = []
    for f in files:
        if f.filename.endswith(".pdf"):
            data = await f.read()
            await upload_pdf_storage(f.filename, data)
            salvos.append(f.filename)
    return {"salvos": salvos}


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
