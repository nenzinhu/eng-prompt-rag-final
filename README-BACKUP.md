# Backup — Eng. Prompt RAG Final

**Backup COMPLETO**, recuperado em 09/09/2026 diretamente do deploy de produção
Vercel `eng-prompt-rag-final` + do projeto Supabase `eng-prompt-rag`.

| Item | Origem | Status |
|---|---|---|
| Código-fonte (24 arquivos) | Vercel API `/v8/deployments/.../files` | ✅ |
| Chaves de IA (Groq, OpenRouter, NVIDIA, AIHubMix) | Vercel CLI `env pull` | ✅ |
| Credenciais Supabase (URL, anon, service_role) | Supabase Management API | ✅ |
| Tabela `ementas_chunks` (526 chunks + vetores) | Supabase REST | ✅ |
| PDFs do bucket `ementas` (4 arquivos) | Supabase Storage | ✅ |
| Edge Function `embeddings` (fonte Deno) | Supabase Management API | ✅ |
| Schema SQL + política de recriação | information_schema / pg_proc | ✅ |
| Repositório GitHub (clone) | `nenzinhu/curso-eng-prompt` | ✅ (desatualizado) |

## Estrutura

```
eng-prompt-rag-final-fonte/
├── api/index.py                  # backend serverless (FastAPI/ASGI)
├── app/  components/  lib/       # frontend Next.js 15 + React 19 + TS
├── next.config.mjs  package.json  tailwind.config.ts  tsconfig.json  vercel.json
├── requirements.txt
├── .env / .env.prod.completo     # ⚠️ credenciais completas
├── README-BACKUP.md              # este arquivo
└── supabase-backup/
    ├── ementas_chunks.jsonl      # 526 chunks com embeddings (384 dim)
    ├── ementas_chunks.csv        # mesma coisa em CSV (2,7 MB)
    ├── openapi.json              # schema PostgREST da tabela
    ├── ementas_chunks_colunas.json
    ├── recriar-banco.sql         # DDL: tabela + função match_ementas
    ├── storage_manifest.json
    ├── edge-function/embeddings_source.ts
    └── pdfs/                     # os 4 PDFs do bucket
```

## Arquitetura

- **Frontend**: Next.js 15 + React 19 + TypeScript + Tailwind.
- **Backend**: `api/index.py` como Vercel Serverless Function (Python/ASGI).
- **Banco vetorial**: Supabase Postgres + pgvector — tabela `ementas_chunks`
  (`id`, `content`, `embedding vector(384)`, `source`, `page`, `created_at`),
  função RPC `match_ementas(query_embedding, match_count)`.
- **PDFs**: Supabase Storage, bucket privado `ementas`.
- **Embeddings**: Edge Function `embeddings` (Deno, modelo `gte-small`,
  nativo do Supabase — grátis, sem API externa).
- **Geração de texto**: dropdown — OpenRouter, Groq, NVIDIA NIM, AIHubMix
  (APIs compatíveis com OpenAI).

## Rodar localmente

```bash
npm install
cp .env.example .env   # e preencha as chaves (veja abaixo)
npm run dev
```

O `.env` **não vem preenchido** neste backup: as chaves de IA e a service_role
foram removidas por segurança. Preencha `SUPABASE_SERVICE_ROLE_KEY` (escrita e
Storage) e a chave do provedor de IA que for usar.

O `ADMIN_TOKEN` protege as rotas de escrita (`/api/upload`, `/api/ingerir`,
`/api/duplicatas`) — sem ele, essas rotas respondem 503.

> Correções de 10/09/2026 (RLS, guarda de perda de material, testes): veja
> **CORRECOES-2026-09-10.md** antes de mexer no banco.

## Restaurar o banco do zero

1. Crie um projeto no Supabase e rode `supabase-backup/recriar-banco.sql`.
2. Suba o bucket `ementas` e os PDFs de `supabase-backup/pdfs/`.
3. Importe `ementas_chunks.csv` (coluna `embedding` no formato `[0.1,0.2,...]`).
4. **Logo depois da importação, rode os dois `setval` do fim de `recriar-banco.sql`.**
   Importar com `id` não avança a sequência, e sem isso a primeira reindexação
   apaga o documento inteiro do índice (análise de 17/09/2026, A1-02). Outra
   opção é importar com `scripts/reimportar_chunks.py`, que não envia `id`.
5. Rode as migrações de `supabase-backup/migracoes/` em ordem de data.
6. Faça o deploy da Edge Function a partir de `edge-function/embeddings_source.ts`.
7. Confira RLS e sequência com as consultas de leitura do fim de `recriar-banco.sql`.

## ⚠️ Observações

1. **Documento faltando no Storage**: 384 dos 526 chunks (73% do material) vêm
   de `Empreendedorismo_Inovacao_Tecnologia_completo.pdf`, que **não está** no
   bucket `ementas` — só os chunks ficaram salvos. Em 10/09/2026 o material foi
   remontado a partir do JSONL em `supabase-backup/reconstruido/` (`.txt` de
   referência + `.pdf` reindexável, com as páginas originais preservadas).
   O PDF original continua não localizado.
2. **Repositório GitHub desatualizado**: `nenzinhu/curso-eng-prompt` (privado)
   está atrás da versão publicada — esta foi enviada por upload, sem commit.
   Clone de segurança em `D:\PROJETOS\eng-prompt-rag-final-backup`.
3. **Segredos**: a chave pública (publishable) está no `.env`, que é ignorado
   pelo git. A **service_role** nunca deve ser versionada nem chegada ao
   navegador. Dumps de banco ficam em `supabase-backup/dumps/` e contêm o
   conteúdo das apostilas.
4. **Cópia de segurança**: a pasta passou a ser um repositório git em
   10/09/2026 (commit inicial = estado recebido) e há um zip datado em
   `Downloads/eng-prompt-rag-final-backup-2026-09-10.zip`.
