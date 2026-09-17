"""Mede o que o upload faz com um documento ANTES de tocar no banco.

Reproduz, localmente e sem rede, as duas etapas pesadas de POST /api/upload:
1. `extrair_paginas` (pypdf + fonttools) — a mesma função que a prévia e a
   ingestão usam;
2. `preparar_linhas` (chunker do rag_core).

O objetivo é separar "o arquivo derruba a função" de "a plataforma cortou a
requisição": pico de memória e tempo dizem qual dos dois é.

Uso:
    python medir_extracao.py arquivo1.pdf arquivo2.pdf
"""
from __future__ import annotations

import os
import sys
import time
import tracemalloc

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
os.chdir(RAIZ)

import psutil  # noqa: E402

from api.index import extrair_paginas, preparar_linhas  # noqa: E402

LIMITE_MEMORIA_FUNCAO_MB = 1024  # padrão da função Python na Vercel
ORCAMENTO_SEGUNDOS = 60  # maxDuration do vercel.json

proc = psutil.Process()


def pico_mb() -> float:
    return proc.memory_info().peak_wset / (1024 * 1024) if hasattr(proc.memory_info(), "peak_wset") \
        else proc.memory_info().rss / (1024 * 1024)


def analisar(caminho: str) -> None:
    print(f"\n=== {caminho} ===")
    tamanho = os.path.getsize(caminho)
    print(f"  tamanho: {tamanho / 1024 / 1024:.2f} MB")
    dados = open(caminho, "rb").read()
    nome = os.path.basename(caminho)

    base = proc.memory_info().rss / (1024 * 1024)
    tracemalloc.start()
    inicio = time.perf_counter()
    try:
        paginas = extrair_paginas(dados, nome)
    except Exception as e:
        print(f"  !! extrair_paginas LEVANTOU {type(e).__name__}: {e}")
        tracemalloc.stop()
        return
    segundos = time.perf_counter() - inicio
    atual, pico = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    rss_pico = proc.memory_info().rss / (1024 * 1024)

    com_texto = [t for _, t in paginas if (t or "").strip()]
    chars = sum(len(t or "") for _, t in paginas)
    print(f"  páginas: {len(paginas)} ({len(com_texto)} com texto)")
    print(f"  caracteres extraídos: {chars}")
    print(f"  tempo de extração: {segundos:.1f} s   (orçamento da função: {ORCAMENTO_SEGUNDOS} s)")
    print(f"  pico do tracemalloc: {pico / 1024 / 1024:.0f} MB")
    print(f"  RSS antes: {base:.0f} MB -> depois: {rss_pico:.0f} MB")
    if hasattr(proc.memory_info(), "peak_wset"):
        print(f"  pico real do processo: {proc.memory_info().peak_wset / 1024 / 1024:.0f} MB"
              f"   (limite da função: {LIMITE_MEMORIA_FUNCAO_MB} MB)")

    inicio = time.perf_counter()
    linhas = preparar_linhas(paginas)
    print(f"  chunks gerados: {len(linhas)} (em {time.perf_counter() - inicio:.1f} s)")

    if not linhas and not com_texto:
        print("  >>> PDF sem texto extraível (digitalizado/imagem): precisa de OCR.")
    if segundos > ORCAMENTO_SEGUNDOS * 0.8:
        print("  >>> ATENÇÃO: a extração sozinha consome quase todo o orçamento de 60 s.")
    if hasattr(proc.memory_info(), "peak_wset") and proc.memory_info().peak_wset / (1024 * 1024) > LIMITE_MEMORIA_FUNCAO_MB * 0.8:
        print("  >>> ATENÇÃO: memória próxima do limite da função — risco de ser morta (erro 500).")


arquivos: list[str] = []
for arg in sys.argv[1:]:
    if arg.startswith("@"):
        with open(arg[1:], encoding="utf-8") as fh:
            arquivos.extend(l.strip() for l in fh if l.strip())
    else:
        arquivos.append(arg)

for caminho in arquivos:
    if os.path.exists(caminho):
        analisar(caminho)
    else:
        print(f"\n!! não existe: {caminho}")
