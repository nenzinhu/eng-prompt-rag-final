"""Smoke test das rotas reais da API.

Bate no backend de verdade (local ou produção) e confere o que cada rota devolve,
incluindo as proteções novas: rotas de escrita sem token precisam responder 401.

Pré-requisitos no .env: SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_TOKEN e a chave do
provedor que for testado (NOUS_API_KEY por padrão).

Uso:
    .venv/Scripts/python.exe scripts/smoke.py                        # http://127.0.0.1:8000
    .venv/Scripts/python.exe scripts/smoke.py --url https://...      # produção
    .venv/Scripts/python.exe scripts/smoke.py --sem-llm              # pula o que gasta chave
"""
from __future__ import annotations

import argparse
import json
import os
import urllib.error
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent

OK, FALHA, PULADO = "✓", "✗", "•"
resultados: list[tuple[str, str, str]] = []


def carregar_env(caminho: Path) -> None:
    if not caminho.exists():
        return
    for linha in caminho.read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if not linha or linha.startswith("#") or "=" not in linha:
            continue
        chave, _, valor = linha.partition("=")
        os.environ.setdefault(chave.strip(), valor.strip())


def chamar(metodo: str, url: str, corpo=None, token: str = "", timeout: int = 120):
    dados = json.dumps(corpo).encode("utf-8") if corpo is not None else None
    req = urllib.request.Request(url, data=dados, method=metodo)
    if dados is not None:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("X-Admin-Token", token)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            bruto = r.read()
            try:
                return r.status, json.loads(bruto or b"null")
            except json.JSONDecodeError:
                return r.status, bruto[:200]
    except urllib.error.HTTPError as e:
        bruto = e.read()
        try:
            return e.code, json.loads(bruto or b"null")
        except json.JSONDecodeError:
            return e.code, bruto[:200].decode("utf-8", "replace")
    except Exception as e:
        return 0, f"{type(e).__name__}: {e}"


def registrar(nome: str, condicao: bool, detalhe: str = "") -> bool:
    resultados.append((OK if condicao else FALHA, nome, detalhe))
    print(f"  {OK if condicao else FALHA} {nome}{' — ' + detalhe if detalhe else ''}")
    return condicao


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://127.0.0.1:8000", help="base do backend")
    ap.add_argument("--provider", default="nous")
    ap.add_argument("--modelo", default="")
    ap.add_argument("--sem-llm", action="store_true", help="não chama os provedores de IA")
    ap.add_argument("--pergunta", default="O que é o Método NEOSA e quais são os seus pilares?")
    args = ap.parse_args()

    carregar_env(RAIZ / ".env")
    base = args.url.rstrip("/")
    token = os.environ.get("ADMIN_TOKEN", "")
    print(f"Smoke test em {base}\n")

    # ── Leitura ────────────────────────────────────────────────────────────
    print("Leitura:")
    st, d = chamar("GET", f"{base}/api/status")
    registrar("GET /api/status", st == 200 and isinstance(d, dict), f"HTTP {st} · {d if st == 200 else ''}")
    total = d.get("total") if isinstance(d, dict) else None
    if total is not None:
        registrar("índice com dados", total > 0, f"{total} chunks")
    if isinstance(d, dict) and "escrita_via" in d:
        registrar(
            "escrita via service_role",
            d.get("escrita_via") == "service_role",
            f"escrita_via={d.get('escrita_via')} (esperado service_role; 'anon' = inseguro)",
        )

    st, d = chamar("GET", f"{base}/api/config")
    registrar("GET /api/config", st == 200 and isinstance(d, dict), f"HTTP {st}")

    st, d = chamar("GET", f"{base}/api/providers")
    registrar("GET /api/providers", st == 200 and isinstance(d, dict), f"HTTP {st}")
    if isinstance(d, dict):
        configurados = [k for k, v in d.items() if v.get("configurado")]
        registrar("algum provedor com chave", bool(configurados), ", ".join(configurados) or "nenhum")

    st, d = chamar("GET", f"{base}/api/pdfs")
    arquivos = d.get("arquivos", []) if isinstance(d, dict) else []
    registrar("GET /api/pdfs", st == 200, f"{len(arquivos)} documento(s)")

    # ── Proteção das rotas de escrita ──────────────────────────────────────
    print("\nProteção (sem token):")
    st, _ = chamar("POST", f"{base}/api/ingerir/previa", {"arquivo": "x.pdf", "offset": 0})
    registrar("POST /api/ingerir/previa recusa sem token", st in (401, 503), f"HTTP {st}")

    st, _ = chamar("POST", f"{base}/api/ingerir", {"arquivo": "x.pdf", "offset": 0})
    registrar("POST /api/ingerir recusa sem token", st in (401, 503), f"HTTP {st}")

    st, _ = chamar("GET", f"{base}/api/duplicatas")
    registrar("GET /api/duplicatas recusa sem token", st in (401, 503), f"HTTP {st}")

    # ── Escrita (prévia é leitura, mas exige token) ────────────────────────
    if token and arquivos:
        print("\nIngestão (somente leitura do Storage):")
        st, d = chamar("GET", f"{base}/api/admin/verificar", token=token)
        registrar("token de admin aceito", st == 200, f"HTTP {st}")
        for nome in arquivos[:3]:
            st, d = chamar("POST", f"{base}/api/ingerir/previa", {"arquivo": nome, "offset": 0}, token=token)
            if st == 200 and isinstance(d, dict):
                registrar(
                    f"prévia de {nome[:38]}",
                    True,
                    f"{d.get('chunks_existentes')} → {d.get('chunks_novos')} chunks, "
                    f"{len(d.get('avisos') or [])} aviso(s)",
                )
            else:
                registrar(f"prévia de {nome[:38]}", False, f"HTTP {st} · {d}")
    elif not token:
        registrar("token de admin para testar a ingestão", False, "ADMIN_TOKEN ausente no .env")

    # ── Busca vetorial ─────────────────────────────────────────────────────
    print("\nBusca vetorial:")
    st, d = chamar("POST", f"{base}/api/buscar", {"query": args.pergunta, "n": 3})
    ok = st == 200 and isinstance(d, dict) and len(d.get("resultados", [])) > 0
    registrar("POST /api/buscar", ok, f"HTTP {st} · {len(d.get('resultados', [])) if isinstance(d, dict) else 0} resultado(s)")
    st, d = chamar("POST", f"{base}/api/buscar", {"query": "teste", "n": 999})
    limite_ok = st == 400 or (isinstance(d, dict) and len(d.get("resultados", [])) <= 20)
    registrar("n acima do limite é barrado", limite_ok, f"HTTP {st}")

    # ── Geração (gasta chave) ──────────────────────────────────────────────
    if args.sem_llm:
        registrar("rotas de IA", True, "puladas por --sem-llm")
    else:
        print(f"\nGeração pelo provedor '{args.provider}':")
        modelo = args.modelo
        if not modelo:
            st, provs = chamar("GET", f"{base}/api/providers")
            modelo = (provs.get(args.provider, {}).get("models") or [""])[0] if isinstance(provs, dict) else ""

        st, d = chamar("POST", f"{base}/api/perguntar", {"pergunta": args.pergunta, "provider": args.provider, "modelo": modelo})
        ok = st == 200 and isinstance(d, dict) and len(d.get("resposta", "")) > 20
        registrar("POST /api/perguntar", ok, f"HTTP {st} · {len(d.get('resposta','')) if ok else d}"[:150])

        questao = (
            "Qual é a principal vantagem do few-shot prompting?\n\n"
            "A) Reduz drasticamente o número de tokens\n"
            "B) Melhora a consistência sem necessidade de fine-tuning\n"
            "C) Aumenta a velocidade de inferência do modelo\n"
            "D) Elimina alucinações por completo"
        )
        st, d = chamar("POST", f"{base}/api/resolver", {"texto": questao, "provider": args.provider, "modelo": modelo})
        ok = st == 200 and isinstance(d, dict) and d.get("resposta")
        registrar("POST /api/resolver", ok, f"HTTP {st} · letra {d.get('resposta') if isinstance(d, dict) else d}")

        st, d = chamar("POST", f"{base}/api/glossario", {"tema": "RAG e embeddings", "provider": args.provider, "modelo": modelo})
        ok = st == 200 and isinstance(d, dict) and len(d.get("termos", [])) > 0
        registrar("POST /api/glossario", ok, f"HTTP {st} · {len(d.get('termos',[])) if isinstance(d, dict) else 0} termo(s)")

        st, d = chamar("POST", f"{base}/api/comparar", {
            "pergunta": args.pergunta,
            "modelos": [{"provider": args.provider, "modelo": modelo}, {"provider": args.provider, "modelo": modelo}],
        })
        ok = st == 200 and isinstance(d, dict) and d.get("nivel_concordancia")
        registrar("POST /api/comparar", ok, f"HTTP {st} · concordância: {d.get('nivel_concordancia') if isinstance(d, dict) else d}")

    # ── Resumo ─────────────────────────────────────────────────────────────
    falhas = [r for r in resultados if r[0] == FALHA]
    print(f"\n{len(resultados) - len(falhas)}/{len(resultados)} verificações passaram")
    if falhas:
        print("Falhas:")
        for _, nome, detalhe in falhas:
            print(f"  {FALHA} {nome} — {detalhe}")
    return 1 if falhas else 0


if __name__ == "__main__":
    raise SystemExit(main())
