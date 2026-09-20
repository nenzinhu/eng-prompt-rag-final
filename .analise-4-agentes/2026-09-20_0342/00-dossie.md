# Dossiê — Eng. Prompt RAG (2026-09-20, 03:42)

**O que é:** plataforma web de estudo com IA (RAG). O aluno pergunta; o backend busca trechos
das apostilas indexadas (pgvector) e a IA responde citando `[Fonte: arquivo, página N]`.
13 abas em 5 grupos: Perguntar, Professor Sabe Tudo, Aprender (Feynman), Buscar, Resolver
Questão (OCR), Glossário, Comparar modelos, Resumir apostila, Apostila (PDF/DOCX), Comprimir,
Perfis comportamentais, Elenco/Fale o que pensa, Suporte TI, PDFs (admin).

**Stack:** Next.js 15.5 / React 19 / TS / Tailwind (`app/`, `components/`, `lib/`);
FastAPI Python em Vercel Function (`api/index.py` ~2700 linhas, `api/rag_core.py` ~765,
`api/_app/{prompts,provedores,documentos,http_util}.py`); Supabase (Postgres+pgvector,
Storage, Edge Function `embeddings` gte-small 384d); provedores IA OpenAI-compatíveis.

**Pastas:** `api/`, `app/`, `components/tabs/`, `lib/`, `tests/` (304 pytest),
`tests-js/` (75), `scripts/`, `supabase-backup/`, `.github/workflows/ci.yml`.

**Segurança/limites:** limite por minuto/IP em memória + `consumir_cota` no Supabase
(300/dia/IP, 5000/dia global); login de admin com 8 tentativas/IP a cada 15 min; sessão
assinada de 8 h; RLS ligado; conta de aluno opcional (Supabase Auth, nenhuma rota exige).

**ESTADO IMPORTANTE — leia antes de analisar:** duas rodadas de correção acabaram de ser
aplicadas e publicadas (commits `a96f87d` e `998cd34`), a partir da análise
`.analise-4-agentes/2026-09-19_2230/`. **Todos os bugs daquele relatório (B-01 a B-27, S-1 a
S-3) foram corrigidos**, mais duas features novas:
- `GET /api/trecho` — "ver no contexto": abre a página indexada inteira e as vizinhas.
- `/api/perguntar` aceita `historico` — conversa contínua, com a pergunta anterior entrando
  no texto do embedding.
Também entraram: `iguais_em_tempo_constante`, `_conteudo_da_resposta` (provedores),
`tempo_restante_llm` + middleware de início de requisição, `_hash_ip`/`_consumir_cota`,
`dividirQuestoes`/`SEPARADOR_QUESTAO`/`marcaDoNome` (lib/texto.ts), `TrechoNoContexto.tsx`,
tabelas de DOCX/PPTX no índice, guarda de ids na ingestão.
**Não repita esses achados como se fossem novos.** Se algum foi corrigido pela metade, aí sim
vale reportar — mas confira no código antes de afirmar.

**Pendências conhecidas (não são novidade):** semáforo no resumo de apostila (dispara até 40
chamadas juntas ao provedor); limites de tamanho nos campos de `resolver`, `simplificar`,
`verificar`, `aprender/*` e personas; cota própria para busca e auditoria; contadores de erro
na tabela de cota; `REVOKE` dos privilégios da chave pública no Supabase. Operação: 2
apostilas no Storage sem trechos no índice, 73% do acervo perdido (cópia reconstruída local).

**IDEIAS.md já registra (não repetir):** I-001 histórico na conta; I-002 cota por aluno
logado; I-003 revisão espaçada do Glossário; I-004 simulado citando fontes; I-005 painel de
lacunas do material; I-006 analogias do seu mundo nas apostilas.
**A análise de 19/09 também já propôs (não repetir):** N-01 conversa contínua e N-05 "ver no
contexto" (ambas JÁ IMPLEMENTADAS); e N-02 cache semântico, N-03 filtro por apostila, N-04
busca híbrida, N-06 voz, N-07 mapa mental, N-08 caderno de erros, N-09 plano de estudos,
N-10 RAG efêmero do próprio arquivo, N-11 feedback da resposta, N-12 painel de domínio.
