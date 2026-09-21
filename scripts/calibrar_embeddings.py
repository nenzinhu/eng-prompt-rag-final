"""Compara gte-small x mistral-embed no material real e sugere os limiares.

Para cada trecho sorteado do índice, o ministral-8b (plano gratuito do Mistral)
escreve: uma PERGUNTA respondida pelo trecho, uma AFIRMAÇÃO VERDADEIRA reescrita
com outras palavras e uma AFIRMAÇÃO FALSA plausível. O resultado fica em cache
(scripts/dados/calibracao.json), então rodar de novo não gasta o modelo.

Mede, para cada modelo de embeddings:
  - recall@1 e recall@6: o trecho de origem (ou a mesma página) volta na busca?
  - similaridade média do contexto em perguntas do material x perguntas fora
    do assunto → sugere LIMIAR_CONFIANCA (api/index.py);
  - melhor similaridade de afirmações verdadeiras x falsas → sugere
    LIMIARES_FIDELIDADE (api/rag_core.py).

Só lê o banco (chave pública). Precisa de a migração do Mistral estar aplicada
e de scripts/vetorizar_mistral.py já ter rodado.

Uso:
    python scripts/calibrar_embeddings.py            # 40 trechos
    python scripts/calibrar_embeddings.py --n 60 --semente 7
"""
from __future__ import annotations

import argparse
import json
import os
import random
import re
import statistics
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CACHE = RAIZ / "scripts" / "dados" / "calibracao.json"

FORA_DO_ASSUNTO = [
    "Qual é a receita tradicional de bolo de cenoura com cobertura de chocolate?",
    "Quantos gols Pelé marcou na carreira profissional?",
    "Como trocar o pneu furado de um carro na estrada?",
    "Qual a melhor época do ano para plantar tomate no sul do Brasil?",
    "Quem pintou o teto da Capela Sistina?",
    "Como funciona a fotossíntese nas plantas?",
    "Qual é a capital da Austrália?",
    "Quais são os sintomas da dengue?",
    "Como se calcula a área de um triângulo?",
    "Qual a diferença entre um jacaré e um crocodilo?",
    "Como cuidar de um gato filhote nas primeiras semanas?",
    "Em que ano terminou a Segunda Guerra Mundial?",
    "Quais os ingredientes de uma feijoada completa?",
    "Como funciona o câmbio de uma bicicleta?",
    "Qual o maior planeta do sistema solar?",
]

PROMPT = (
    "Você recebe um trecho de apostila. Responda SÓ com um JSON:\n"
    '{"pergunta": "...", "verdadeira": "...", "falsa": "..."}\n'
    "- pergunta: uma pergunta que um aluno faria e que ESTE trecho responde. "
    "Use palavras diferentes das do trecho, sem copiar frases.\n"
    "- verdadeira: uma afirmação que o trecho confirma, reescrita com outras palavras.\n"
    "- falsa: uma afirmação plausível sobre o mesmo tema que o trecho NÃO sustenta "
    "(inventada ou contraditória).\n"
    "Tudo em português, uma frase cada.\n\nTRECHO:\n"
)


def carregar_env(caminho: Path) -> None:
    if not caminho.exists():
        return
    for linha in caminho.read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if not linha or linha.startswith("#") or "=" not in linha:
            continue
        chave, _, valor = linha.partition("=")
        os.environ.setdefault(chave.strip(), valor.strip())


def post(url: str, headers: dict, corpo) -> dict | list:
    for tentativa in range(1, 6):
        req = urllib.request.Request(url, data=json.dumps(corpo).encode("utf-8"), method="POST")
        req.add_header("Content-Type", "application/json")
        for k, v in headers.items():
            req.add_header(k, v)
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504, 546) and tentativa < 5:
                time.sleep(min(30, 2 ** tentativa))
                continue
            raise SystemExit(f"HTTP {e.code} em {url}: {e.read()[:300].decode('utf-8', 'replace')}")
    raise AssertionError("inalcançável")


def get(url: str, headers: dict) -> list:
    req = urllib.request.Request(url)
    for k, v in headers.items():
        req.add_header(k, v)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())


def main() -> int:
    ap = argparse.ArgumentParser(description="Compara gte-small x mistral-embed e sugere limiares.")
    ap.add_argument("--n", type=int, default=40, help="quantos trechos sortear")
    ap.add_argument("--semente", type=int, default=21)
    args = ap.parse_args()

    carregar_env(RAIZ / ".env")
    base = os.environ.get("SUPABASE_URL", "").rstrip("/")
    anon = os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    mistral = os.environ.get("MISTRAL_API_KEY", "")
    if not (base and anon and mistral):
        print("Defina no .env: SUPABASE_URL, SUPABASE_ANON_KEY e MISTRAL_API_KEY", file=sys.stderr)
        return 1
    hs = {"apikey": anon, "Authorization": f"Bearer {anon}"}
    hm = {"Authorization": f"Bearer {mistral}"}

    # ── 1. Casos de teste (em cache) ────────────────────────────────────────
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    trechos = get(f"{base}/rest/v1/ementas_chunks?select=id,content,source,page&order=id.asc", hs)
    trechos = [t for t in trechos if len(t["content"]) >= 300]
    sorteados = random.Random(args.semente).sample(trechos, min(args.n, len(trechos)))
    casos = []
    for t in sorteados:
        chave = str(t["id"])
        if chave not in cache:
            r = post("https://api.mistral.ai/v1/chat/completions", hm, {
                "model": "ministral-8b-latest",
                "temperature": 0.4,
                "response_format": {"type": "json_object"},
                "messages": [{"role": "user", "content": PROMPT + t["content"]}],
            })
            texto = r["choices"][0]["message"]["content"]
            achado = re.search(r"\{.*\}", texto, re.DOTALL)
            try:
                cache[chave] = json.loads(achado.group(0)) if achado else None
            except json.JSONDecodeError:
                cache[chave] = None
            CACHE.parent.mkdir(parents=True, exist_ok=True)
            CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
        gerado = cache[chave]
        if gerado and all(gerado.get(k) for k in ("pergunta", "verdadeira", "falsa")):
            casos.append({**gerado, "id": t["id"], "source": t["source"], "page": t["page"]})
    print(f"Casos válidos: {len(casos)} de {len(sorteados)} trechos sorteados\n")

    # ── 2. Vetores e buscas nos dois modelos ────────────────────────────────
    textos = (
        [c["pergunta"] for c in casos] + FORA_DO_ASSUNTO
        + [c["verdadeira"] for c in casos] + [c["falsa"] for c in casos]
    )

    def vetores_gte(lista):
        saida = []
        for i in range(0, len(lista), 4):  # mesmo lote da Edge Function no backend
            saida += post(f"{base}/functions/v1/embeddings", hs, {"texts": lista[i : i + 4]})["embeddings"]
        return saida

    def vetores_mistral(lista):
        saida = []
        for i in range(0, len(lista), 32):
            r = post("https://api.mistral.ai/v1/embeddings", hm, {"model": "mistral-embed", "input": lista[i : i + 32]})
            saida += [d["embedding"] for d in sorted(r["data"], key=lambda d: d["index"])]
        return saida

    modelos = {"gte": ("match_ementas", vetores_gte), "mistral": ("match_ementas_mistral", vetores_mistral)}
    n, m = len(casos), len(FORA_DO_ASSUNTO)
    sugestoes = {}
    for nome, (funcao, vetorizar) in modelos.items():
        vetores = vetorizar(textos)
        buscas = [post(f"{base}/rest/v1/rpc/{funcao}", hs, {"query_embedding": v, "match_count": 6}) for v in vetores]
        perguntas, fora = buscas[:n], buscas[n : n + m]
        verdadeiras, falsas = buscas[n + m : 2 * n + m], buscas[2 * n + m :]

        def acertou(caso, res, k):
            return any(r["id"] == caso["id"] or (r["source"], r["page"]) == (caso["source"], caso["page"]) for r in res[:k])

        def media_ctx(res):
            return sum(r["similarity"] for r in res) / len(res) if res else 0.0

        def melhor(res):
            return max((r["similarity"] for r in res), default=0.0)

        r1 = sum(acertou(c, b, 1) for c, b in zip(casos, perguntas)) / n
        r6 = sum(acertou(c, b, 6) for c, b in zip(casos, perguntas)) / n
        ctx_dentro = sorted(media_ctx(b) for b in perguntas)
        ctx_fora = sorted(media_ctx(b) for b in fora)
        s_verd = sorted(melhor(b[:3]) for b in verdadeiras)
        s_fals = sorted(melhor(b[:3]) for b in falsas)

        def q(lista, p):
            return statistics.quantiles(lista, n=20)[int(p * 20) - 1] if len(lista) >= 2 else (lista[0] if lista else 0.0)

        print(f"── {nome} ({funcao})")
        print(f"   recall@1 {r1:.0%}   recall@6 {r6:.0%}")
        print(f"   contexto  do material: mediana {statistics.median(ctx_dentro):.3f}  p10 {q(ctx_dentro, .1):.3f}")
        print(f"   contexto  fora do tema: mediana {statistics.median(ctx_fora):.3f}  p90 {q(ctx_fora, .9):.3f}")
        print(f"   afirmação verdadeira:  mediana {statistics.median(s_verd):.3f}  p25 {q(s_verd, .25):.3f}")
        print(f"   afirmação falsa:       mediana {statistics.median(s_fals):.3f}  p75 {q(s_fals, .75):.3f}")
        sugestoes[nome] = {
            "LIMIAR_CONFIANCA": round((q(ctx_dentro, .1) + q(ctx_fora, .9)) / 2, 2),
            "LIMIARES_FIDELIDADE": (round(q(s_verd, .25), 2), round(statistics.median(s_fals), 2)),
        }
        print()

    print("Sugestão de limiares (conferir antes de aplicar — amostra pequena):")
    for nome, s in sugestoes.items():
        print(f"   {nome:8s} LIMIAR_CONFIANCA={s['LIMIAR_CONFIANCA']}  LIMIARES_FIDELIDADE={s['LIMIARES_FIDELIDADE']}")
    print(
        "\nLIMIAR_CONFIANCA: ponto médio entre o p10 do contexto do material e o p90 do fora do tema."
        "\nLIMIARES_FIDELIDADE: (p25 das verdadeiras, mediana das falsas) — 'apoiada' e 'parcial'."
        "\nObs.: a afirmação falsa é sobre o MESMO tema, então parte dela sempre acha trecho parecido;"
        "\no apoio textual (frase_tem_apoio_textual) continua sendo a segunda barreira."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
