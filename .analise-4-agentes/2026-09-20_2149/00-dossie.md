# Dossiê — Eng. Prompt RAG (2026-09-20_2149)

## O que é
Plataforma web de estudo com IA baseada em RAG: aluno pergunta e o sistema busca
trechos no material indexado (apostilas) e responde citando fonte/página. Também tem
Feynman, resolução de questões, glossário, comparação de modelos, gerador de
apostilas (PDF/DOCX), compressão de arquivos no navegador, e ferramentas de
comunicação (Perfis Comportamentais, Elenco, Suporte técnico).

## Stack
- Frontend: Next.js 15.5, React 19, TS 5.9, Tailwind 3.4, GSAP, lucide-react,
  react-markdown. Processamento client-side: pdfjs-dist, pdf-lib, mammoth,
  tesseract.js (OCR).
- Backend: Python/FastAPI (`api/index.py`), httpx, pypdf+fonttools, python-docx,
  python-pptx, fpdf2. Núcleo puro em `api/rag_core.py`.
- Dados: Supabase (Postgres+pgvector, Storage, Edge Functions Deno).
- IA: Groq, Nous Portal, NVIDIA NIM, AnyAPI, Orca Router, OpenRouter (OpenAI-compatible).
- Hospedagem: Vercel (Next.js + função Python `api/index.py`, maxDuration 60s).
- Qualidade: pytest, ruff, eslint, tsc, `node --test`, GitHub Actions.

## Pastas principais
- `api/` — rotas FastAPI, RAG core, `_app/` (prompts, provedores IA, extração docs, HTTP)
- `app/` — página/layout Next.js
- `components/` — header, navegação, anexos, evidências; `tabs/` uma aba por arquivo
- `lib/` — cliente API, tipos, hooks, OCR, compressão
- `scripts/` — backup, smoke test, latência, reconstrução
- `supabase-backup/` — SQL, migrações, dumps, Edge Function
- `tests/` (pytest) e `tests-js/` (node --test)

## Estado (de PROJECT.md/MEMORY.md, 20/09/2026)
- Análise anterior mais recente (2026-09-20_0342): média 6,75/10, **reprovado** (sem
  bug crítico), mas com 3 regressões introduzidas pelas próprias correções da sessão
  anterior — já consertadas segundo MEMORY.md: `GET /api/trecho` sem limite de uso,
  `.pptx` podendo cair com 500, tabelas de `.docx` indo todas para a última página.
- Dezenas de bugs (B-01 a B-27) e "suspeitas" (S-1 a S-3) da rodada anterior foram
  corrigidos e testados (300 pytest, 75 JS, ruff/tsc/eslint/build OK), mas vários
  caminhos (OCR, arquivo grande, Supabase de produção) **não foram conferidos no
  navegador**, só via teste automatizado.
- Itens ainda em aberto, de produto/infra (não bugs): `/api/config` publica a chave
  anon e RLS dá `select` a `anon` em `ementas_chunks` (índice acessível direto via
  Supabase); campos de texto sem teto de tamanho (`pergunta`/`historico`/`query`);
  conversa contínua não persiste (some no F5); cota conta requisição, não chamada
  (Resumo gasta 41 chamadas por 1 unidade de cota); falta `REVOKE` de privilégios da
  chave anon (RLS já nega, mas sem redundância).
- Dados: 526 trechos indexados, mas maior parte (`Empreendedorismo_..._completo.pdf`,
  384 trechos / 73%) não está no Storage — reconstruído e pendente de reenvio; 2 PDFs
  pendentes de reindexação (0 trechos).
- Documentação divergente do código em alguns pontos (README-BACKUP menciona
  provedor que não existe mais no código; .env.example incompleto; contagem de
  testes desatualizada em CORRECOES-2026-09-10.md).

## IDEIAS.md (já registradas, não repetir)
- I-001 Histórico salvo na conta (nova)
- I-002 Cota de uso por aluno logado (nova)
- I-003 Revisão espaçada do Glossário (nova)
- I-004 Simulado com correção citando fontes (nova)
- I-005 Painel de lacunas do material (nova)
- I-006 Analogias nas apostilas geradas (feita, aguardando publicação)

Ideias N-02 a N-04, N-06 a N-12 do relatório de 19/09 ainda não estão no IDEIAS.md
(`.analise-4-agentes/2026-09-19_2230/04-ideias.md`).
