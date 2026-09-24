"""Confere, com chamada real, se cada modelo da lista de provedores responde.

Manda uma pergunta curta a cada modelo e mostra status e tempo. É a medição que
os comentários de `api/_app/provedores.py` citam: modelo que falha ou passa de
~20 s deve sair da lista (ou ganhar uma nota de "lento").

As chaves vêm do ambiente ou do `.env` na raiz; provedor sem chave é pulado.
Nenhuma chave é impressa.

Uso:
    python scripts/verificar_modelos.py                 # todos os provedores
    python scripts/verificar_modelos.py together cohere # só estes
"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

import httpx

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "api"))

from _app.provedores import PROVIDERS  # noqa: E402

PERGUNTA = "Responda só com a palavra: ok"
TIMEOUT = 45.0


def carregar_env(caminho: Path) -> None:
    if not caminho.exists():
        return
    for linha in caminho.read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if not linha or linha.startswith("#") or "=" not in linha:
            continue
        chave, valor = linha.split("=", 1)
        os.environ.setdefault(chave.strip(), valor.strip().strip('"').strip("'"))


def testar(base_url: str, chave: str, modelo: str) -> tuple[str, float]:
    inicio = time.perf_counter()
    try:
        r = httpx.post(
            f"{base_url}/chat/completions",
            headers={"Authorization": f"Bearer {chave}"},
            json={"model": modelo, "messages": [{"role": "user", "content": PERGUNTA}], "max_tokens": 50},
            timeout=TIMEOUT,
        )
    except httpx.HTTPError as e:
        return f"falhou ({type(e).__name__})", time.perf_counter() - inicio
    segundos = time.perf_counter() - inicio
    if r.status_code != 200:
        return f"HTTP {r.status_code}: {r.text[:120]}", segundos
    try:
        texto = r.json()["choices"][0]["message"]["content"] or ""
    except (ValueError, KeyError, IndexError, TypeError):
        return "200 sem texto", segundos
    return f"ok: {texto.strip()[:40]!r}", segundos


def main() -> int:
    carregar_env(RAIZ / ".env")
    pedidos = set(sys.argv[1:])
    falhas = 0
    for nome, cfg in PROVIDERS.items():
        if pedidos and nome not in pedidos:
            continue
        chave = os.environ.get(cfg["env_key"])
        if not chave:
            print(f"\n{cfg['label']}: pulado ({cfg['env_key']} não definida)")
            continue
        print(f"\n{cfg['label']}")
        for modelo in cfg["models"]:
            resultado, segundos = testar(cfg["base_url"], chave, modelo)
            if not resultado.startswith("ok"):
                falhas += 1
            print(f"  {segundos:5.1f} s  {modelo}  →  {resultado}")
    print(f"\n{falhas} modelo(s) com falha.")
    return 1 if falhas else 0


if __name__ == "__main__":
    raise SystemExit(main())
