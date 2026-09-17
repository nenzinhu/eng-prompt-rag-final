# 00 — Dossiê do projeto (Ciclos 1 e 2)

- **Projeto:** Eng. Prompt RAG — `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main`
- **Data da análise:** 17/09/2026
- **Foco pedido pelo usuário:** correções de bug, melhorias e sugestões de novas features. Problemas CRÍTICOS fora do foco também devem ser reportados.
- **Pasta de trabalho:** `.analise-4-agentes/2026-09-17_0817/`
- **Visão geral descritiva já escrita:** [`PROJECT.md`](../../PROJECT.md) na raiz. Leia-a primeiro. Ela descreve funcionalidades, arquitetura, stack, dados, segurança, como rodar e testes, e foi escrita a partir do código nesta mesma data.

Este dossiê **descreve**, não julga. Tudo aqui que vem de documentação do projeto é afirmação a verificar.

---

## 1. O que o projeto diz ser

| Afirmação | Fonte |
|---|---|
| "Engenharia de Prompt — RAG API (cloud)", roda como Vercel Serverless Function (Python/ASGI), sem backend local | `api/index.py:1-18` |
| Banco vetorial e storage no Supabase; embeddings pela Edge Function `embeddings` (gte-small); geração por provedor escolhido no dropdown | `api/index.py:4-8`, `README-BACKUP.md` |
| Backup completo recuperado em 09/09/2026 do deploy Vercel + Supabase; o repositório GitHub estava desatualizado em relação à produção | `README-BACKUP.md` |
| Revisão completa em 10/09/2026, com "50 testes automatizados passando" e três falhas reais de perda de dados fechadas | `CORRECOES-2026-09-10.md` (topo) |
| Usuário-alvo tratado como "aluno do curso de Engenharia de Prompt" | `api/_app/prompts.py` (SYSTEM_PROMPT_VERIFICAR, SIMPLIFICAR) |
| Modelos ordenados "gratuitos primeiro, do mais rápido ao mais lento", com latência medida em 10/09/2026 | `api/_app/provedores.py:15-24` |

## 2. Mapa por camadas

### OBJETIVO
Estudar o material do curso com uma IA que responde a partir das apostilas indexadas e cita fonte e página (`PROJECT.md` §1). Não há documento de objetivo, visão de produto ou roadmap: **AUSENTE**.

### PROBLEMA
IA genérica responde sem base no material e pode inventar; o RAG restringe a resposta ao contexto recuperado (inferido dos prompts e da arquitetura, não declarado num documento de produto).

### PREMISSAS (implícitas no código/documentação)
- Os alunos usam provedores gratuitos por padrão (`provedores.py`).
- O conteúdo das apostilas é público para leitura (RLS de leitura pública em `supabase-backup/migracoes/2026-09-10-rls-e-glossario.sql`).
- A função serverless termina em até 60 s (`vercel.json` `maxDuration: 60`; `api/_app/http_util.py`).
- A Edge Function suporta lotes de até ~8 textos (`api/index.py` `EMBEDDINGS_LOTE = 8`, comentário: estoura acima de ~10–12).
- Upload na Vercel limitado a 4 MB por causa do limite de 4,5 MB da plataforma (`api/index.py:126-160`).
- A "escrita insegura" (anon) é estado transitório até configurarem a service_role (`components/Header.tsx:161`).

### PROCESSOS
- **Pergunta:** limite de uso → embedding → `match_ementas` → contexto com fonte/página → LLM → NDJSON (`api/index.py` `/api/perguntar/stream`, linhas ~1036–1075).
- **Ingestão (admin):** upload no Storage → extração por página (`api/_app/documentos.py`) → chunking (`api/rag_core.py`) → embeddings em lotes → gravação; guarda de 60% de cobertura antes de apagar (`CORRECOES` §2).
- **Autenticação admin:** usuário/senha → sessão assinada de 8 h → header `X-Admin-Token` (`api/index.py:756-780`).
- **Limite de uso:** memória (20/min por IP) + Supabase `consumir_cota` (min/dia por IP, dia global), com fallback para só memória se o banco falhar (`api/index.py:398-455`).
- **Processamento no navegador:** OCR (tesseract.js, `lib/ocr.ts`), compressão de PDF/imagem (`lib/compress/*`), leitura de .docx (mammoth, `lib/documento.ts`).

### RECURSOS
- Código: ~12,2 mil linhas (maior arquivo `api/index.py` com 1.984 linhas; `api/_app/prompts.py` 669; `api/rag_core.py` 640; abas de 96 a 487 linhas).
- Acervo (backup 09/09/2026): 526 chunks — 384 de `Empreendedorismo_Inovacao_Tecnologia_completo.pdf` (arquivo ausente do Storage), 132 de `Praticas_Gerenciais...`, 7 de `Nous_Portal_Model_Prices - Summary.pdf`, 2 de `Empreendedorismo_Inovacao_Tecnologia.pdf`, 1 de `Logica_Programacao_Python.pdf`.
- Equipe, orçamento e tempo disponíveis: **AUSENTE**.

### TECNOLOGIA
- Frontend: Next.js 15.5.25, React 19.3.0, TypeScript 5.9.3, Tailwind 3.4.19, GSAP 3.15, pdfjs-dist 6.3.289, pdf-lib 1.17.1, tesseract.js 7.0.0, mammoth 1.12.3 (`package.json`). Node `>=22.6`.
- Backend: FastAPI, uvicorn, httpx, pypdf, fonttools, python-docx, python-pptx, fpdf2 — **sem versões fixadas** (`>=`) em `requirements.txt`.
- Provedores: groq, nous, nvidia, anyapi, orcarouter, openrouter (`api/_app/provedores.py:26-111`).
- Lint: ruff só com regras `F` e `E9` (`ruff.toml`); eslint `next/core-web-vitals` + `next/typescript`.
- `tsconfig.json` exclui `api`, `rag` e `supabase-backup`.

### OPERAÇÃO
- Deploy: Vercel (`vercel.json`), rewrite `/api/:path*` → `/api/index`; `.vercelignore` tira `supabase-backup/`, `tests/`, `scripts/`.
- Local: `iniciar-tudo.bat` (cria `.venv` com **Python 3.11**, sobe uvicorn:8000 e next:3000, mata processos nas portas).
- CI: `.github/workflows/ci.yml` — **Python 3.12** (ruff + pytest) e **Node 24** (eslint, tsc, test:js, build).
- Observabilidade: `print(...)` no backend (ex.: `api/index.py` em `_limitar_llm`); nenhuma ferramenta de monitoramento declarada.
- Backup: `scripts/backup_dump.py`; dumps em `supabase-backup/dumps/` (10/09/2026).

### CUSTOS
- Provedores de IA com modelos gratuitos e pagos (preços anotados em comentários de `provedores.py`, ex.: "pago ~$0.04/1M").
- Tetos diários: 300 por IP e 5000 global (`api/index.py:175-176`), dependentes da migração de 16/09/2026.
- Custo real mensal, plano da Vercel e do Supabase: **AUSENTE**.

### RISCOS declarados pelo próprio projeto
- Material perdido (73% do índice sem arquivo de origem) — `README-BACKUP.md`, `CORRECOES` §7.
- Pendências de 10/09/2026: service_role, migração RLS, reenvio do PDF reconstruído — `CORRECOES` "Estado em 10/09/2026".
- OpenRouter com cota gratuita esgotada (429) em 10/09/2026 — `CORRECOES` §8.
- Rate limit por instância não é confiável — `CORRECOES` §6 (depois tratado com `consumir_cota`, migração 16/09/2026).

### RESULTADOS / MÉTRICAS
- Smoke test em produção em 10/09/2026: 19/20 (Nous) e 16/17 (Groq) — `CORRECOES` "Verificação".
- Métricas de uso, de qualidade das respostas (acerto, alucinação) ou de satisfação: **AUSENTE**.

---

## 3. Afirmações a verificar

| # | Afirmação | Fonte |
|---|---|---|
| V1 | "50 testes automatizados passando" e, na mesma página, "58 testes, sem rede" | `CORRECOES-2026-09-10.md` |
| V2 | Rotas de escrita (`/api/upload`, `/api/ingerir`, `/api/ingerir/previa`, `/api/duplicatas`) exigem `X-Admin-Token` e respondem 503 sem `ADMIN_TOKEN` | `CORRECOES` §6, `README-BACKUP.md` |
| V3 | Guarda de perda: reindexação/upload que cubra < 60% do texto indexado responde 409 e exige `forcar` | `CORRECOES` §2 |
| V4 | Chunker de ~900 caracteres com 120 de sobreposição, cortando em parágrafo/frase e descartando fragmento curto isolado | `CORRECOES` §3, `api/rag_core.py` |
| V5 | Siglas em caixa alta passaram a ser capturadas na comparação, com lista de exclusão | `CORRECOES` §3 |
| V6 | Seletor de provedor não trava mais em vazio (`lib/useProviderModel.ts`) | `CORRECOES` §4 |
| V7 | Falha ao salvar glossário devolve `aviso_salvamento` em vez de falhar em silêncio | `CORRECOES` §5 |
| V8 | CORS restrito por `ALLOWED_ORIGINS`; `n` da busca limitado a 1–20; cache de 30 s em `/api/status` | `CORRECOES` §6, `api/index.py:701` |
| V9 | Timeouts das chamadas de IA derivados do orçamento da função, "para nunca estourar o limite da plataforma" | `.env.example`, `api/_app/http_util.py` |
| V10 | Limite de uso em duas camadas; se o banco falhar, segue só com a camada em memória | `api/index.py:398-455` |
| V11 | Sessão de admin assinada, 8 h, comparação em tempo constante | `api/index.py:756-775` |
| V12 | IP gravado como hash HMAC, nunca em claro | `api/index.py:414-416` |
| V13 | Reconstrução do material com fidelidade média 0,9994 e pior caso 0,987 em 113 páginas | `CORRECOES` §7 |
| V14 | Latências e disponibilidade dos modelos listados (medidas em 09–10/09/2026) | `api/_app/provedores.py` |
| V15 | Versões fixadas em `package.json` existem e não têm vulnerabilidades conhecidas relevantes | `package.json` |
| V16 | OCR roda no navegador, custo zero, modelo de ~15 MB baixado uma vez | `lib/ocr.ts`, `components/AnexoImagem.tsx:275` |
| V17 | Gerador de apostilas "nunca bloqueia a geração por falta de material indexado" | `api/index.py:1077-1100` |
| V18 | `/api/auditar` "verifica frase por frase se a resposta tem apoio no material (detecção de alucinação)" | `api/index.py:1362` |
| V19 | Estado de produção (pendências de 10/09 e migração de 16/09 aplicadas ou não) | `CORRECOES`, `supabase-backup/migracoes/` |

## 4. Lacunas de contexto

| Item | Situação |
|---|---|
| Objetivo de produto / visão | AUSENTE |
| Público e número de usuários | AUSENTE (inferido "aluno do curso" pelos prompts) |
| Por que o app tem abas fora de estudo (Perfis Comportamentais, Elenco, Suporte TI/UEFI) | AUSENTE |
| Restrições (LGPD, institucionais) | AUSENTE |
| Equipe e quem mantém | AUSENTE |
| Prazo | AUSENTE |
| Orçamento (IA, Vercel, Supabase) | AUSENTE |
| Critérios de sucesso e métricas | AUSENTE |
| Estado atual de produção | NÃO VERIFICÁVEL daqui (sem `.env`, sem acesso autorizado) |

## 5. Ambiente desta análise

- Esta cópia **não tem** `.git`, `.env`, `.venv` nem `node_modules`.
- Python global: 3.14.7 (com fastapi, httpx, pypdf); sem pytest/ruff.
- Node 24.19.0, npm 11.17.0.
- O orquestrador está rodando testes, lint, checagem de tipos, build e `npm audit` em ambientes descartáveis **fora do projeto** (scratchpad). Os resultados ficam em `00-execucao.md` nesta pasta. **Agentes: não reinstalem nada; usem esse arquivo como evidência de execução.**
- **Proibido nesta análise:** chamar a produção de forma que grave dados ou gaste créditos de IA; ler ou copiar valores de segredos.
