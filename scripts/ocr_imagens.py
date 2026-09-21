"""Transcreve o texto/código que está em IMAGEM dentro de um PDF do Storage.

Caso que motivou (21/09/2026): a apostila de algoritmos traz os exemplos de
Python como print de tela — o texto em volta foi indexado, o código não. O
resultado vai para ementas/ocr/<nome>.json e a ingestão junta cada transcrição
à página de origem (`mesclar_ocr`). Depois de gravar, reindexe o documento
(aba PDFs ou scripts/indexar.py).

Modelo: ministral-8b (plano gratuito do Mistral, lê imagem). A API de OCR do
Mistral não está no plano gratuito (limite 0/min nesta conta).

Precisa no .env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e MISTRAL_API_KEY.

Uso:
    python scripts/ocr_imagens.py --arquivo "algoritmo-e-logica-de-programacao.pdf"           # só mostra
    python scripts/ocr_imagens.py --arquivo "algoritmo-e-logica-de-programacao.pdf" --gravar
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import os
import sys
import time
import urllib.parse
from collections import Counter
from pathlib import Path

import httpx
from pypdf import PdfReader

RAIZ = Path(__file__).resolve().parent.parent
MODELO = "ministral-8b-latest"
LARGURA_MINIMA = 600          # ícones e logos ficam de fora
REPETIDA_EM_PAGINAS = 3       # a mesma imagem em 3+ páginas é decoração (capa de capítulo, logo)
LARGURA_MAXIMA_ENVIO = 1600   # reduz prints enormes antes de mandar ao modelo
MINIMO_CHARS = 15
PROMPT = (
    "Transcreva TODO o texto ou código visível nesta imagem, exatamente como aparece, "
    "preservando quebras de linha e indentação. Não use blocos ``` nem comente nada. "
    "Se a imagem não tiver texto legível (foto, ícone, ilustração, gráfico sem rótulos), "
    "responda apenas: VAZIO"
)


def carregar_env(caminho: Path) -> None:
    if not caminho.exists():
        return
    for linha in caminho.read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if not linha or linha.startswith("#") or "=" not in linha:
            continue
        chave, _, valor = linha.partition("=")
        os.environ.setdefault(chave.strip(), valor.strip().strip('"').strip("'"))


def baixar(base: str, h: dict, nome: str) -> bytes:
    """Download com retomada: o Storage fecha a conexão no meio em arquivos grandes."""
    url = f"{base}/storage/v1/object/ementas/{urllib.parse.quote(nome)}"
    dados = bytearray()
    for _ in range(8):
        try:
            with httpx.stream("GET", url, headers={**h, "Range": f"bytes={len(dados)}-"}, timeout=120) as r:
                if r.status_code not in (200, 206):
                    raise SystemExit(f"Não consegui baixar '{nome}' (HTTP {r.status_code}).")
                total = int(r.headers.get("content-range", "/0").split("/")[-1] or 0) or None
                for bloco in r.iter_bytes():
                    dados.extend(bloco)
            if total is None or len(dados) >= total:
                return bytes(dados)
        except httpx.HTTPError:
            print(f"  … conexão caiu em {len(dados)} bytes, retomando")
    raise SystemExit("Download não completou depois de 8 tentativas.")


def candidatas(pdf: PdfReader) -> list[tuple[int, bytes]]:
    """(página, PNG) das imagens que podem ter texto."""
    por_pagina: list[tuple[int, str, object]] = []
    for numero, pagina in enumerate(pdf.pages, 1):
        try:
            imagens = list(pagina.images)
        except Exception as e:  # imagem com filtro que o pypdf não decodifica
            print(f"  p.{numero}: imagens ilegíveis ({type(e).__name__}), pulando")
            continue
        for img in imagens:
            try:
                largura, _ = img.image.size
            except Exception:
                continue
            if largura >= LARGURA_MINIMA:
                por_pagina.append((numero, hashlib.md5(img.data).hexdigest(), img.image))
    paginas_por_imagem = Counter()
    for numero, chave in {(n, c) for n, c, _ in por_pagina}:
        paginas_por_imagem[chave] += 1
    saida = []
    for numero, chave, imagem in por_pagina:
        if paginas_por_imagem[chave] >= REPETIDA_EM_PAGINAS:
            continue
        imagem = imagem.convert("RGB")
        if imagem.width > LARGURA_MAXIMA_ENVIO:
            imagem.thumbnail((LARGURA_MAXIMA_ENVIO, LARGURA_MAXIMA_ENVIO * 4))
        buf = io.BytesIO()
        imagem.save(buf, "PNG")
        saida.append((numero, buf.getvalue()))
    return saida


def transcrever(png: bytes, chave: str) -> str:
    corpo = {
        "model": MODELO,
        "temperature": 0,
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": PROMPT},
            {"type": "image_url", "image_url": "data:image/png;base64," + base64.b64encode(png).decode()},
        ]}],
    }
    for tentativa in range(1, 6):
        r = httpx.post("https://api.mistral.ai/v1/chat/completions",
                       headers={"Authorization": f"Bearer {chave}"}, json=corpo, timeout=90)
        if r.status_code == 200:
            texto = (r.json()["choices"][0]["message"]["content"] or "").strip()
            texto = texto.removeprefix("```python").removeprefix("```").removesuffix("```").strip()
            return "" if texto.upper().startswith("VAZIO") or len(texto) < MINIMO_CHARS else texto
        if r.status_code in (429, 500, 502, 503, 504):
            time.sleep(min(30, 2 ** tentativa))
            continue
        raise SystemExit(f"Mistral recusou (HTTP {r.status_code}): {r.text[:300]}")
    raise SystemExit("Mistral continuou recusando depois de 5 tentativas.")


def main() -> int:
    ap = argparse.ArgumentParser(description="Transcreve imagens com texto de um PDF do Storage.")
    ap.add_argument("--arquivo", required=True, help="nome exato do PDF no bucket 'ementas'")
    ap.add_argument("--gravar", action="store_true", help="grava ementas/ocr/<nome>.json no Storage")
    args = ap.parse_args()

    carregar_env(RAIZ / ".env")
    base = os.environ.get("SUPABASE_URL", "").rstrip("/")
    servico = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    chave = os.environ.get("MISTRAL_API_KEY", "")
    if not (base and servico and chave):
        print("Defina no .env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e MISTRAL_API_KEY", file=sys.stderr)
        return 1
    h = {"apikey": servico, "Authorization": f"Bearer {servico}"}

    pdf = PdfReader(io.BytesIO(baixar(base, h, args.arquivo)))
    imagens = candidatas(pdf)
    print(f"{args.arquivo}: {len(pdf.pages)} páginas, {len(imagens)} imagens candidatas")

    resultado: dict[str, list[str]] = {}
    for i, (numero, png) in enumerate(imagens, 1):
        texto = transcrever(png, chave)
        print(f"  [{i}/{len(imagens)}] p.{numero}: " + (f"{len(texto)} chars — {texto[:70]!r}" if texto else "sem texto"))
        if texto:
            resultado.setdefault(str(numero), []).append(texto)

    local = RAIZ / "scripts" / "dados" / "ocr" / f"{args.arquivo}.json"
    local.parent.mkdir(parents=True, exist_ok=True)
    local.write_text(json.dumps(resultado, ensure_ascii=False, indent=1), encoding="utf-8")
    total = sum(len(t) for ts in resultado.values() for t in ts)
    print(f"\n{len(resultado)} páginas com transcrição, {total} caracteres. Cópia local: {local.relative_to(RAIZ)}")

    if not args.gravar:
        print("Nada foi gravado no Storage. Rode com --gravar para usar na ingestão.")
        return 0
    destino = f"ocr/{args.arquivo}.json"
    r = httpx.post(
        f"{base}/storage/v1/object/ementas/{urllib.parse.quote(destino)}",
        headers={**h, "Content-Type": "application/json", "x-upsert": "true"},
        content=json.dumps(resultado, ensure_ascii=False).encode("utf-8"),
        timeout=60,
    )
    if r.status_code >= 400:
        print(f"Falha ao gravar no Storage (HTTP {r.status_code}): {r.text[:300]}", file=sys.stderr)
        return 1
    print(f"Gravado em ementas/{destino}. Agora reindexe o documento.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
