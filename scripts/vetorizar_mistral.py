"""Preenche `embedding_mistral` nos trechos que ainda não têm o vetor do Mistral.

Roda depois da migração supabase-backup/migracoes/2026-09-21-embedding-mistral.sql.
Só escreve a coluna nova: `content` e o vetor do gte-small ficam intactos. Pode
ser interrompido e rodado de novo — retoma dos trechos que ainda estão vazios.

Precisa no .env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e MISTRAL_API_KEY.

Uso:
    python scripts/vetorizar_mistral.py --contar     # só mostra quantos faltam
    python scripts/vetorizar_mistral.py
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
MISTRAL_URL = "https://api.mistral.ai/v1/embeddings"
LOTE = 32
DIMENSAO = 1024


def carregar_env(caminho: Path) -> None:
    if not caminho.exists():
        return
    for linha in caminho.read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if not linha or linha.startswith("#") or "=" not in linha:
            continue
        chave, _, valor = linha.partition("=")
        os.environ.setdefault(chave.strip(), valor.strip())


def requisicao(metodo: str, url: str, headers: dict, corpo: dict | list | None = None):
    dados = json.dumps(corpo).encode("utf-8") if corpo is not None else None
    req = urllib.request.Request(url, data=dados, method=metodo)
    req.add_header("Content-Type", "application/json")
    for k, v in headers.items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, r.read(), dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read(), dict(e.headers)


def trechos_pendentes(base: str, h: dict) -> list[dict]:
    pendentes: list[dict] = []
    inicio = 0
    while True:
        url = (
            f"{base}/rest/v1/ementas_chunks?select=id,content&embedding_mistral=is.null"
            f"&order=id.asc&offset={inicio}&limit=1000"
        )
        st, corpo, _ = requisicao("GET", url, h)
        if st >= 400:
            raise SystemExit(
                f"Falha ao ler os trechos (HTTP {st}): {corpo[:300].decode('utf-8', 'replace')}\n"
                "A migração 2026-09-21-embedding-mistral.sql já foi aplicada?"
            )
        pagina = json.loads(corpo)
        pendentes.extend(pagina)
        if len(pagina) < 1000:
            return pendentes
        inicio += 1000


def vetorizar(textos: list[str], chave: str) -> list[list[float]]:
    for tentativa in range(1, 6):
        st, corpo, headers = requisicao(
            "POST", MISTRAL_URL, {"Authorization": f"Bearer {chave}"},
            {"model": "mistral-embed", "input": textos},
        )
        if st == 200:
            dados = sorted(json.loads(corpo)["data"], key=lambda d: d["index"])
            vetores = [d["embedding"] for d in dados]
            if len(vetores) != len(textos) or any(len(v) != DIMENSAO for v in vetores):
                raise SystemExit("Resposta do mistral-embed fora do formato esperado.")
            return vetores
        if st in (429, 500, 502, 503, 504):
            espera = min(30, 2 ** tentativa)
            print(f"  … HTTP {st} do Mistral, tentando de novo em {espera}s")
            time.sleep(espera)
            continue
        raise SystemExit(f"Mistral recusou (HTTP {st}): {corpo[:300].decode('utf-8', 'replace')}")
    raise SystemExit("Mistral continuou recusando depois de 5 tentativas. Rode de novo mais tarde.")


def main() -> int:
    ap = argparse.ArgumentParser(description="Preenche embedding_mistral nos trechos pendentes.")
    ap.add_argument("--contar", action="store_true", help="só mostra quantos trechos faltam")
    args = ap.parse_args()

    carregar_env(RAIZ / ".env")
    base = os.environ.get("SUPABASE_URL", "").rstrip("/")
    servico = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    chave_mistral = os.environ.get("MISTRAL_API_KEY", "")
    faltam = [n for n, v in (("SUPABASE_URL", base), ("SUPABASE_SERVICE_ROLE_KEY", servico)) if not v]
    if not args.contar and not chave_mistral:
        faltam.append("MISTRAL_API_KEY")
    if faltam:
        print(f"Defina no .env: {', '.join(faltam)}", file=sys.stderr)
        return 1
    h = {"apikey": servico, "Authorization": f"Bearer {servico}"}

    pendentes = trechos_pendentes(base, h)
    print(f"Trechos sem vetor Mistral: {len(pendentes)}")
    if args.contar or not pendentes:
        return 0

    feitos = 0
    for i in range(0, len(pendentes), LOTE):
        lote = pendentes[i : i + LOTE]
        vetores = vetorizar([t["content"] for t in lote], chave_mistral)
        for trecho, vetor in zip(lote, vetores):
            st, corpo, _ = requisicao(
                "PATCH", f"{base}/rest/v1/ementas_chunks?id=eq.{trecho['id']}",
                {**h, "Prefer": "return=minimal"}, {"embedding_mistral": vetor},
            )
            if st >= 400:
                print(f"  ✗ id {trecho['id']}: HTTP {st} {corpo[:200].decode('utf-8', 'replace')}", file=sys.stderr)
                return 1
        feitos += len(lote)
        print(f"  ✓ {feitos}/{len(pendentes)}")

    restantes = len(trechos_pendentes(base, h))
    print(f"Concluído. Ainda sem vetor Mistral: {restantes}")
    return 0 if restantes == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
