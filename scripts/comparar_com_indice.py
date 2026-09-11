"""A apostila perdida está no disco do usuário?

Compara o texto de um PDF candidato com o texto reconstruído a partir dos chunks
(`supabase-backup/reconstruido/..._completo.txt`), que é o que está indexado hoje.
Mede a fração do texto reconstruído que aparece no candidato e vice-versa.
"""
from __future__ import annotations

import os
import re
import sys
import unicodedata

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
os.chdir(RAIZ)

from api.index import extrair_paginas  # noqa: E402


def normalizar(texto: str) -> str:
    t = unicodedata.normalize("NFKD", (texto or "").lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = re.sub(r"página \d+", " ", t)
    t = re.sub(r"[^a-z0-9 ]", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def palavras(texto: str) -> list[str]:
    return [p for p in normalizar(texto).split(" ") if len(p) > 4]


reconstruido = open(
    "supabase-backup/reconstruido/Empreendedorismo_Inovacao_Tecnologia_completo.txt",
    encoding="utf-8",
).read()
pw_recon = palavras(reconstruido)
conj_recon = set(pw_recon)
print(f"reconstruído do banco: {len(pw_recon)} palavras úteis\n")

for candidato in sys.argv[1:]:
    if not os.path.exists(candidato):
        print(f"!! não existe: {candidato}")
        continue
    dados = open(candidato, "rb").read()
    try:
        paginas = extrair_paginas(dados, os.path.basename(candidato))
    except Exception as e:
        print(f"!! {os.path.basename(candidato)}: {type(e).__name__}: {e}")
        continue
    texto = "\n".join(t or "" for _, t in paginas)
    pw = palavras(texto)
    conj = set(pw)
    if not pw:
        print(f"{os.path.basename(candidato)}: sem texto extraível")
        continue

    # Fração das palavras do reconstruído que existem no candidato (e o inverso).
    cob_recon = len(conj_recon & conj) / len(conj_recon)
    cob_cand = len(conj_recon & conj) / len(conj) if conj else 0
    print(f"=== {os.path.basename(candidato)}")
    print(f"    {os.path.getsize(candidato) / 1024 / 1024:.2f} MB · {len(paginas)} páginas · {len(pw)} palavras úteis")
    print(f"    vocabulário do reconstruído presente no candidato: {cob_recon:.1%}")
    print(f"    vocabulário do candidato presente no reconstruído: {cob_cand:.1%}")

    # Similaridade de sequência, para não confiar só em vocabulário.
    import difflib

    amostra_recon = " ".join(pw_recon[:3000])
    amostra_cand = " ".join(pw[:3000])
    razao = difflib.SequenceMatcher(None, amostra_recon, amostra_cand).ratio()
    print(f"    similaridade de sequência (primeiras 3000 palavras): {razao:.3f}")
