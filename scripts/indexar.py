"""Indexa (ou reindexa) um documento do Storage rodando a rota /api/ingerir localmente.

Usa exatamente o código da ingestão (extração, limpeza, OCR guardado, os dois
vetores, troca sem janela vazia), sem o limite de 60 s da Vercel e sem precisar
da sessão de admin. Mesma proteção da interface: se a reindexação perder mais
de 40% do texto, para e mostra os números; `--forcar` confirma.

Precisa no .env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e MISTRAL_API_KEY.

Uso:
    python scripts/indexar.py --arquivo "EMPREENDEDORISMO_ INOVACAO E TECNOLOGIA.pdf" --previa
    python scripts/indexar.py --arquivo "EMPREENDEDORISMO_ INOVACAO E TECNOLOGIA.pdf"
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent


def carregar_env(caminho: Path) -> None:
    if not caminho.exists():
        return
    for linha in caminho.read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if not linha or linha.startswith("#") or "=" not in linha:
            continue
        chave, _, valor = linha.partition("=")
        os.environ.setdefault(chave.strip(), valor.strip().strip('"').strip("'"))


async def rodar(arquivo: str, previa: bool, forcar: bool) -> int:
    import index  # depois do .env: o módulo lê as variáveis ao ser importado
    from fastapi import HTTPException

    analise = await index._analisar_ingestao(arquivo)
    print(json.dumps({k: v for k, v in analise.items() if k != "arquivo"}, ensure_ascii=False, indent=1))
    if previa:
        return 0

    req = index.IngerirReq(arquivo=arquivo, forcar=forcar)
    while True:
        try:
            r = await index.ingerir(req)
        except HTTPException as e:
            print(f"Parado (HTTP {e.status_code}): {json.dumps(e.detail, ensure_ascii=False)[:600]}", file=sys.stderr)
            return 1
        print(f"  ✓ {r['proximo_offset']}/{r['total']}")
        if r["done"]:
            print("Concluído.")
            return 0
        req = index.IngerirReq(
            arquivo=arquivo, offset=r["proximo_offset"], forcar=forcar,
            corte_id=r["corte_id"], ultimo_id=r["ultimo_id"],
        )


def main() -> int:
    ap = argparse.ArgumentParser(description="Indexa um documento do Storage (mesmo código da rota).")
    ap.add_argument("--arquivo", required=True)
    ap.add_argument("--previa", action="store_true", help="só mostra os números, sem gravar")
    ap.add_argument("--forcar", action="store_true", help="confirma uma perda de texto acima de 40%%")
    args = ap.parse_args()

    carregar_env(RAIZ / ".env")
    os.environ.setdefault("EMBEDDINGS_BUSCA", "mistral")  # como em produção: vetor Mistral obrigatório
    faltam = [v for v in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "MISTRAL_API_KEY") if not os.environ.get(v)]
    if faltam:
        print(f"Defina no .env: {', '.join(faltam)}", file=sys.stderr)
        return 1
    sys.path.insert(0, str(RAIZ / "api"))
    return asyncio.run(rodar(args.arquivo, args.previa, args.forcar))


if __name__ == "__main__":
    raise SystemExit(main())
