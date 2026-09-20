# Dossiê — Eng. Prompt RAG (2026-09-19)

**O que é:** plataforma web de estudo com IA (RAG). O aluno pergunta; o backend busca trechos
das apostilas indexadas (pgvector) e a IA responde citando `[Fonte: arquivo, página N]`.
Extras: Feynman, Resolver Questão (OCR), Glossário, Comparar modelos, Resumir apostila,
Apostila (PDF), Comprimir arquivos, Perfis comportamentais, Elenco, Suporte. 13 abas em 5 grupos.

**Stack:** Next.js 15.5 / React 19 / TS / Tailwind (frontend, `app/`, `components/`, `lib/`);
FastAPI Python em Vercel Function (`api/index.py` ~2270 linhas, `api/rag_core.py`,
`api/_app/{prompts,provedores,documentos,http_util}.py`); Supabase (Postgres+pgvector, Storage,
Edge Function `embeddings` gte-small 384d); provedores IA OpenAI-compatíveis (gratuitos primeiro).

**Pastas:** `api/`, `app/`, `components/tabs/`, `lib/`, `tests/` (pytest, ~141 testes),
`tests-js/`, `scripts/`, `supabase-backup/` (migrações SQL, dumps, PDFs), `.github/workflows/ci.yml`.

**Segurança/limites:** limite por minuto/IP em memória + `consumir_cota` no Supabase (300/dia/IP,
5000/dia global); RLS ligado; login de admin por token; conta de aluno opcional (Supabase Auth,
só identifica, nenhuma rota exige login).

**Estado/pendências (MEMORY.md/PROJECT.md):** 2 PDFs sem trechos indexados; 73% do acervo perdido
do Storage (reconstruído local); limite de falhas no login admin; comparação de senha em bytes
(acento dá 500); resumo com ~40 chamadas simultâneas; limites de tamanho de campos; cota própria
p/ busca/auditoria; contadores de erro. Docs divergentes (README-BACKUP cita AIHubMix).
Análise anterior completa em `.analise-4-agentes/2026-09-17_0817/RELATORIO.md`.

**IDEIAS.md já registra (não repetir):** I-001 histórico salvo na conta; I-002 cota por aluno
logado; I-003 revisão espaçada do Glossário; I-004 simulado com correção citando fontes;
I-005 painel de lacunas do material; I-006 analogias do seu mundo nas apostilas geradas.

**Foco pedido pelo usuário nesta rodada:** analisar o código e propor NOVAS FEATURES.
