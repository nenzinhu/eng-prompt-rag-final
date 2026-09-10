"""Dump de segurança das tabelas vivas do Supabase (Seção 0 do plano de correções).

Baixa `ementas_chunks` (com os vetores de 384 dimensões) e `glossario_termos`
para arquivos JSONL datados em `supabase-backup/dumps/`.

Motivo: a pasta do projeto não é um repositório git e o `ementas_chunks.csv` do
backup é de 09/09/2026. Sem um dump fresco, qualquer operação destrutiva no
índice (reindexação, reconstrução do material) é irreversível.

Uso:
    python scripts/backup_dump.py
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "supabase-backup" / "dumps"
PAGINA = 100  # linhas por requisição


def carregar_env(caminho: Path) -> None:
    """Lê .env para os.environ sem sobrescrever o que já existe no ambiente."""
    if not caminho.exists():
        return
    for linha in caminho.read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if not linha or linha.startswith("#") or "=" not in linha:
            continue
        chave, _, valor = linha.partition("=")
        os.environ.setdefault(chave.strip(), valor.strip())


def requisicao(url: str, chave: str, headers_extras: dict[str, str] | None = None) -> tuple[bytes, dict]:
    headers = {
        "apikey": chave,
        "Authorization": f"Bearer {chave}",
        "Accept": "application/json",
        **({"Range-Unit": "items"} if headers_extras and "Range" in headers_extras else {}),
        **(headers_extras or {}),
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.read(), dict(r.headers)
    except urllib.error.HTTPError as e:
        corpo = e.read().decode("utf-8", "replace")[:400]
        raise SystemExit(f"ERRO HTTP {e.code} em {url}\n{corpo}") from None


def baixar_tabela(base: str, chave: str, tabela: str, select: str = "*") -> list[dict]:
    """Baixa a tabela inteira, paginando por Range de itens."""
    linhas: list[dict] = []
    inicio = 0
    while True:
        fim = inicio + PAGINA - 1
        url = f"{base}/rest/v1/{tabela}?select={select}&order=id.asc"
        corpo, headers = requisicao(url, chave, {"Range": f"{inicio}-{fim}"})
        lote = json.loads(corpo or b"[]")
        linhas.extend(lote)
        total = headers.get("Content-Range", "").split("/")[-1]
        print(f"  {tabela}: {len(linhas)}/{total}", end="\r", flush=True)
        if len(lote) < PAGINA:
            break
        inicio += PAGINA
    print(f"  {tabela}: {len(linhas)} linhas baixadas          ")
    return linhas


def gravar(destino: Path, linhas: list[dict]) -> None:
    destino.parent.mkdir(parents=True, exist_ok=True)
    with destino.open("w", encoding="utf-8") as f:
        for linha in linhas:
            f.write(json.dumps(linha, ensure_ascii=False) + "\n")
    mb = destino.stat().st_size / 1_048_576
    print(f"  -> {destino.relative_to(RAIZ)}  ({len(linhas)} linhas, {mb:.2f} MB)")


def main() -> int:
    carregar_env(RAIZ / ".env")
    base = os.environ.get("SUPABASE_URL", "").rstrip("/")
    chave = os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not base or not chave:
        print("Defina SUPABASE_URL e SUPABASE_ANON_KEY (ou SERVICE_ROLE) no .env", file=sys.stderr)
        return 1

    data = time.strftime("%Y-%m-%d")
    print(f"Dump de {base} em {data}")

    # 1. Chunks vetorizados — o índice que sustenta todo o RAG.
    chunks = baixar_tabela(base, chave, "ementas_chunks")
    gravar(DESTINO / f"ementas_chunks-{data}.jsonl", chunks)

    # 2. Glossário — dado vivo que nunca entrou no backup original.
    termos = baixar_tabela(base, chave, "glossario_termos")
    gravar(DESTINO / f"glossario_termos-{data}.jsonl", termos)

    # 3. Conferência: o mesmo número que /api/status reporta.
    from collections import Counter

    por_fonte = Counter(c["source"] for c in chunks)
    print("\nChunks por fonte:")
    for fonte, qtd in por_fonte.most_common():
        print(f"  {qtd:5d}  {fonte}")
    print(f"  {len(chunks):5d}  TOTAL")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
