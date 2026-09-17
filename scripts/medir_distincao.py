"""Mede se as personalidades do Professor Sabe Tudo soam diferentes de verdade.

Faz as mesmas perguntas a todas as personas pela API real e mede duas coisas:

- estrutura: fração das seções obrigatórias da ficha que aparecem como título,
  na ordem certa. É o que mais separa uma persona da outra — se o modelo ignora
  a estrutura, as respostas voltam a se parecer;
- semelhança: sobreposição de trigramas de palavras entre as respostas de duas
  personas para a MESMA pergunta. O conteúdo técnico é o mesmo, então alguma
  sobreposição é natural; o que interessa é o par mais parecido e a média.

A ordenação é dado, não palpite: rode de novo quando mexer nas fichas ou trocar
o modelo padrão, e compare os números.

Uso:
    .venv/Scripts/python.exe scripts/medir_distincao.py                      # http://127.0.0.1:8000
    .venv/Scripts/python.exe scripts/medir_distincao.py --url https://...    # produção
    .venv/Scripts/python.exe scripts/medir_distincao.py --provider groq --personas professor,visual
    .venv/Scripts/python.exe scripts/medir_distincao.py --json relatorio.json  # guarda as respostas

Sai com código 1 se alguma persona ficar abaixo de --min-estrutura (padrão 0,75).
"""
from __future__ import annotations

import argparse
import itertools
import json
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "api"))

from _app.prompts import PROFESSOR_PERSONAS  # noqa: E402

PERGUNTAS_PADRAO = [
    "O que é few-shot prompting e quando vale a pena usar?",
    "Por que um prompt vago gera respostas ruins?",
]

# Limite da API: 20 chamadas de IA por minuto por IP.
INTERVALO_PADRAO = 3.2


def _palavras(texto: str) -> list[str]:
    sem_acento = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", " ", sem_acento.lower()).split()


def _titulos_da_resposta(texto: str) -> list[str]:
    """Linhas que funcionam como título: `### X` ou uma linha inteira em negrito."""
    titulos = []
    for linha in texto.splitlines():
        linha = linha.strip()
        m = re.match(r"^#{1,6}\s+(.+?)\s*#*$", linha) or re.match(r"^\*\*(.+?)\*\*:?$", linha)
        if m:
            titulos.append(" ".join(_palavras(m.group(1))))
    return titulos


def aderencia_estrutura(texto: str, titulos: list[str]) -> float:
    """Fração dos `titulos` que aparecem como título na resposta, respeitando a ordem.

    Aceita título com complemento ("### Antes: o prompt original"), porque o
    modelo costuma acrescentar algo depois do nome da seção.
    """
    if not titulos:
        return 1.0
    encontrados = _titulos_da_resposta(texto)
    pos = 0
    achados = 0
    for titulo in titulos:
        alvo = " ".join(_palavras(titulo))
        for i in range(pos, len(encontrados)):
            if encontrados[i] == alvo or encontrados[i].startswith(alvo + " "):
                achados += 1
                pos = i + 1
                break
    return achados / len(titulos)


def similaridade(a: str, b: str) -> float:
    """Jaccard dos trigramas de palavras (0 = nada em comum, 1 = mesmo texto)."""
    def trigramas(texto: str) -> set[tuple[str, ...]]:
        p = _palavras(texto)
        return {tuple(p[i:i + 3]) for i in range(len(p) - 2)}

    ta, tb = trigramas(a), trigramas(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def _perguntar(base: str, corpo: dict, timeout: int = 120) -> tuple[int, dict | str]:
    req = urllib.request.Request(
        f"{base}/api/perguntar",
        data=json.dumps(corpo).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        bruto = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(bruto).get("detail", bruto)
        except json.JSONDecodeError:
            return e.code, bruto[:200]
    except Exception as e:
        return 0, f"{type(e).__name__}: {e}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://127.0.0.1:8000", help="base do backend")
    ap.add_argument("--provider", default="groq")
    ap.add_argument("--modelo", default="")
    ap.add_argument("--personas", default="", help="IDs separados por vírgula (padrão: todas)")
    ap.add_argument("--pergunta", action="append", help="repita para várias (padrão: 2 perguntas fixas)")
    ap.add_argument("--min-estrutura", type=float, default=0.75)
    ap.add_argument("--intervalo", type=float, default=INTERVALO_PADRAO, help="segundos entre chamadas")
    ap.add_argument("--json", default="", help="grava respostas e métricas neste arquivo")
    args = ap.parse_args()
    # Console do Windows redirecionado usa cp1252: símbolo sem representação vira "?" em vez de erro.
    sys.stdout.reconfigure(errors="replace")

    base = args.url.rstrip("/")
    ids = [p.strip() for p in args.personas.split(",") if p.strip()] or list(PROFESSOR_PERSONAS)
    desconhecidas = [p for p in ids if p not in PROFESSOR_PERSONAS]
    if desconhecidas:
        print(f"Personas desconhecidas: {', '.join(desconhecidas)}")
        return 2
    perguntas = args.pergunta or PERGUNTAS_PADRAO

    respostas: dict[str, dict[str, str]] = {q: {} for q in perguntas}
    erros: list[str] = []
    for q in perguntas:
        print(f"\n▸ {q}")
        for pid in ids:
            corpo = {"pergunta": q, "provider": args.provider, "persona": pid}
            if args.modelo:
                corpo["modelo"] = args.modelo
            inicio = time.monotonic()
            status, dado = _perguntar(base, corpo)
            if status == 429:  # passou do limite por minuto: espera a janela e tenta uma vez
                print("  … limite por minuto, esperando 60 s")
                time.sleep(60)
                status, dado = _perguntar(base, corpo)
            dur = time.monotonic() - inicio
            if status == 200 and isinstance(dado, dict):
                respostas[q][pid] = dado.get("resposta", "")
                print(f"  ✓ {pid:<14} {dur:5.1f} s")
            else:
                erros.append(f"{pid}: {status} {dado}")
                print(f"  ✗ {pid:<14} {status} {str(dado)[:120]}")
            time.sleep(args.intervalo)

    print("\nESTRUTURA (seções obrigatórias presentes, na ordem)")
    aderencias: dict[str, float] = {}
    for pid in ids:
        titulos = [t for t, _ in PROFESSOR_PERSONAS[pid]["estrutura"]]
        notas = [aderencia_estrutura(respostas[q][pid], titulos) for q in perguntas if pid in respostas[q]]
        if notas:
            aderencias[pid] = sum(notas) / len(notas)
            marca = "✓" if aderencias[pid] >= args.min_estrutura else "✗"
            print(f"  {marca} {pid:<14} {aderencias[pid]:.0%}")

    print("\nSEMELHANÇA ENTRE PERSONAS (trigramas; menor = mais distintas)")
    pares_por_pergunta = {}
    for q in perguntas:
        pares = sorted(
            ((similaridade(respostas[q][a], respostas[q][b]), a, b)
             for a, b in itertools.combinations(sorted(respostas[q]), 2)),
            reverse=True,
        )
        pares_por_pergunta[q] = pares
        if pares:
            media = sum(s for s, _, _ in pares) / len(pares)
            print(f"  {q[:60]}")
            print(f"    média {media:.3f} · mais parecidas: " + ", ".join(f"{a}×{b} {s:.3f}" for s, a, b in pares[:3]))

    if args.json:
        Path(args.json).write_text(
            json.dumps(
                {
                    "provider": args.provider,
                    "modelo": args.modelo or None,
                    "respostas": respostas,
                    "aderencia_estrutura": aderencias,
                    "pares": {q: [{"a": a, "b": b, "similaridade": round(s, 4)} for s, a, b in p]
                              for q, p in pares_por_pergunta.items()},
                    "erros": erros,
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        print(f"\nRelatório: {args.json}")

    abaixo = [pid for pid, nota in aderencias.items() if nota < args.min_estrutura]
    if erros:
        print(f"\n{len(erros)} chamada(s) falharam.")
    if abaixo:
        print(f"Abaixo de {args.min_estrutura:.0%} de estrutura: {', '.join(abaixo)}")
    return 1 if abaixo or erros else 0


if __name__ == "__main__":
    sys.exit(main())
