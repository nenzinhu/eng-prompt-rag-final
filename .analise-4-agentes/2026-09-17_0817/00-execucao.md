# 00 — Execução de testes, lint, tipos, build e auditoria (17/09/2026, 08:17–08:30)

Executado pelo orquestrador em ambientes descartáveis **fora do projeto**, sem alterar
a pasta do projeto. Logs completos em
`C:\Users\PMSC\AppData\Local\Temp\claude\C--Users-PMSC\618d3caa-4ffc-41e6-aab9-291f4b420df8\scratchpad\exec\`.

## Backend (Python)

- **Interpretador:** Python **3.14.7**. O projeto declara 3.11 (`iniciar-tudo.bat`) e 3.12 (CI e `ruff.toml` `target-version = "py312"`). Na máquina existem 3.14 e 3.11.15 (via uv); o venv foi criado com 3.14. **Os resultados abaixo não garantem o comportamento em 3.11/3.12.**
- **Instalação:** `pip install -r requirements-dev.txt` → exit 0. Como `requirements.txt` usa `>=`, as versões resolvidas foram as mais recentes disponíveis:
  `fastapi==0.141.1`, `starlette==1.6.0`, `uvicorn==0.53.0`, `httpx==0.28.1`, `pydantic==2.13.5`, `pypdf==6.19.0`, `fonttools==4.65.0`, `python-docx==1.2.0`, `python-pptx==1.0.2`, `fpdf2==2.8.8`, `python-multipart==0.0.32`, `python-dotenv==1.2.3`, `pytest==9.1.1`, `ruff==0.16.8`.
- **`python -m pytest tests -q`** → exit 0 — **145 passed, 2 warnings in 3.65s**.
  - Aviso 1: `StarletteDeprecationWarning: Using httpx with starlette.testclient is deprecated; install httpx2 instead.` (vindo de `fastapi/testclient.py:1`)
  - Aviso 2: `DeprecationWarning: The anyio.abc.BlockingPortal alias is deprecated` (vindo de `starlette/testclient.py:53`)
- **`ruff check .`** → exit 0 — `All checks passed!` (regras configuradas: só `F` e `E9`).

## Frontend (Node 24.19.0, npm 11.17.0)

Cópia de `app`, `components`, `lib`, `tests-js` e arquivos de configuração para o scratchpad; `npm ci` a partir do `package-lock.json`.

- **`npm ci`** → exit 0 — 501 pacotes. Avisos:
  - `npm warn deprecated eslint@9.39.5: This version is no longer supported.`
  - `npm warn allow-scripts`: `tesseract.js@7.0.0` (postinstall `opencollective-postinstall || true`) e `unrs-resolver@1.12.2` (postinstall) ainda não cobertos por `allowScripts`.
- **`npm run lint`** → exit 0, sem avisos.
- **`npm run typecheck`** → exit 0, sem erros.
- **`npm run test:js`** → exit 0 — **35 tests, 35 pass, 0 fail**. Aviso repetido: `MODULE_TYPELESS_PACKAGE_JSON` (os `.test.ts` são reparseados como ES module porque `package.json` não declara `"type"`).
- **`npm run build`** (`NEXT_TELEMETRY_DISABLED=1`) → exit 0 — Next.js 15.5.25, compilado em 57 s. Rota `/` estática: **114 kB** de página, **217 kB** First Load JS; compartilhado 102 kB.
- **`npm audit --omit=dev`** → exit 1 — **2 vulnerabilidades (1 moderate, 1 high)**:
  - `postcss <=8.5.22` (high), em `node_modules/next/node_modules/postcss`: GHSA-qx2v-qp2m-jg93 (XSS via `</style>` no stringify), GHSA-6g55-p6wh-862q, GHSA-fxqj-rqcc-2cmp, GHSA-r28c-9q8g-f849 (leitura de arquivos `.map` via `sourceMappingURL`).
  - `next 9.3.4-canary.0 – 16.3.0-preview.10` (moderate), por depender da postcss vulnerável.
  - Correção sugerida pelo npm: `npm audit fix --force`, que instalaria **next@16.3.5 (mudança incompatível)**. Exploração real no contexto deste app: **não avaliada**.

## Contagens para comparar com a documentação

| Documento | Afirma | Medido agora |
|---|---|---|
| `CORRECOES-2026-09-10.md` (topo) | 50 testes passando | 145 testes Python passando (em 3.14) + 35 JS |
| `CORRECOES-2026-09-10.md` (Verificação) | 58 testes, sem rede | idem |

## O que NÃO foi executado

- `scripts/smoke.py` e qualquer chamada à produção (sem `.env`; gravaria dados ou gastaria créditos).
- Testes em Python 3.11 ou 3.12.
- Testes de interface no navegador.
