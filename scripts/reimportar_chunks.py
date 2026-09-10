"""Devolve os chunks ao índice com os embeddings ORIGINAIS (restauração sem perda).

Caminho mais seguro para recuperar `Empreendedorismo_Inovacao_Tecnologia_completo.pdf`:
em vez de reindexar (que depende de uma nova extração e do chunker), reinsere os
chunks exatamente como estavam, com o vetor de 384 dimensões já calculado. Nada
é re-embedado, então o resultado é idêntico ao índice anterior.

Escreve no banco: exige a service_role (com RLS ligado, a chave pública não grava).

Uso:
    python scripts/reimportar_chunks.py --listar              # só mostra o plano
    python scripts/reimportar_chunks.py --fonte "<nome exato>"
    python scripts/reimportar_chunks.py --todas
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ENTRADAS = [RAIZ / "supabase-backup" / "dumps", RAIZ / "supabase-backup"]
LOTE = 50


def carregar_env(caminho: Path) -> None:
    if not caminho.exists():
        return
    for linha in caminho.read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if not linha or linha.startswith("#") or "=" not in linha:
            continue
        chave, _, valor = linha.partition("=")
        os.environ.setdefault(chave.strip(), valor.strip())


def ler_chunks() -> list[dict]:
    for pasta in ENTRADAS:
        candidatos = sorted(pasta.glob("ementas_chunks*.jsonl"), key=lambda p: p.stat().st_mtime)
        if candidatos:
            print(f"Origem: {candidatos[-1].relative_to(RAIZ)}")
            with candidatos[-1].open(encoding="utf-8") as f:
                return [json.loads(l) for l in f if l.strip()]
    raise SystemExit("Nenhum ementas_chunks*.jsonl encontrado.")


def requisicao(metodo: str, url: str, chave: str, corpo: bytes | None = None, headers: dict | None = None):
    req = urllib.request.Request(url, data=corpo, method=metodo)
    req.add_header("apikey", chave)
    req.add_header("Authorization", f"Bearer {chave}")
    req.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def main() -> int:
    ap = argparse.ArgumentParser(description="Reinsere os chunks com os embeddings originais.")
    ap.add_argument("--fonte", help="fonte exata (campo source) a restaurar")
    ap.add_argument("--todas", action="store_true", help="restaura todas as fontes do dump")
    ap.add_argument("--listar", action="store_true", help="apenas mostra o que seria feito")
    args = ap.parse_args()

    carregar_env(RAIZ / ".env")
    base = os.environ.get("SUPABASE_URL", "").rstrip("/")
    chave = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not base:
        print("SUPABASE_URL não definida no .env", file=sys.stderr)
        return 1

    chunks = ler_chunks()
    por_fonte: dict[str, list[dict]] = {}
    for c in chunks:
        por_fonte.setdefault(c["source"], []).append(c)

    print("\nChunks disponíveis no dump:")
    for fonte, lista in sorted(por_fonte.items(), key=lambda kv: -len(kv[1])):
        print(f"  {len(lista):5d}  {fonte}")

    if args.listar or not (args.fonte or args.todas):
        print("\nNada foi gravado. Use --fonte \"<nome>\" ou --todas para restaurar.")
        return 0

    alvos = list(por_fonte) if args.todas else [args.fonte]
    faltando = [f for f in alvos if f and f not in por_fonte]
    if faltando:
        print(f"\nFonte(s) não encontrada(s) no dump: {faltando}", file=sys.stderr)
        return 1

    if not chave:
        print(
            "\nSUPABASE_SERVICE_ROLE_KEY não definida. Com RLS ligado, a chave pública não\n"
            "consegue gravar — defina a service_role no .env para restaurar.",
            file=sys.stderr,
        )
        return 1

    for fonte in alvos:
        lista = sorted(por_fonte[fonte], key=lambda c: c.get("id") or 0)
        print(f"\n→ {fonte}: {len(lista)} chunks")

        st, corpo = requisicao("DELETE", f"{base}/rest/v1/ementas_chunks?source=eq.{urllib.parse.quote(fonte)}", chave)
        if st >= 400:
            print(f"  ✗ falha ao limpar os chunks atuais: HTTP {st} {corpo[:200].decode('utf-8','replace')}")
            return 1
        print("  ✓ chunks atuais removidos")

        enviados = 0
        for i in range(0, len(lista), LOTE):
            fatia = lista[i : i + LOTE]
            rows = [
                {
                    "content": c["content"],
                    "embedding": c["embedding"],
                    "source": c["source"],
                    "page": c.get("page"),
                }
                for c in fatia
            ]
            st, corpo = requisicao(
                "POST",
                f"{base}/rest/v1/ementas_chunks",
                chave,
                json.dumps(rows).encode("utf-8"),
                {"Prefer": "return=minimal"},
            )
            if st >= 400:
                print(f"  ✗ erro no lote {i // LOTE + 1}: HTTP {st} {corpo[:300].decode('utf-8','replace')}")
                return 1
            enviados += len(fatia)
            print(f"  … {enviados}/{len(lista)}", end="\r", flush=True)
        print(f"  ✓ {enviados} chunks restaurados          ")

    # Conferência final: o mesmo número que /api/status mostra.
    st, corpo = requisicao("HEAD", f"{base}/rest/v1/ementas_chunks?select=id", chave, headers={"Prefer": "count=exact"})
    print("\nConferência: rode /api/status (ou o log acima) para ver o total no índice.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
