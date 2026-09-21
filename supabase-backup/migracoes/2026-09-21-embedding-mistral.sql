-- ============================================================
-- 21/09/2026 — segunda coluna de vetores: mistral-embed (1024 dimensões)
--
-- Só ACRESCENTA: a coluna `embedding` (gte-small, 384) e a função
-- `match_ementas` continuam como estão e seguem sendo a reserva da busca
-- quando o Mistral falha. Nada é apagado ou reescrito.
--
-- Ordem da implantação:
--   1. esta migração;
--   2. deploy do backend (a ingestão passa a gravar `embedding_mistral`);
--   3. python scripts/vetorizar_mistral.py   (preenche os trechos antigos);
--   4. python scripts/calibrar_embeddings.py (mede e sugere os limiares);
--   5. EMBEDDINGS_BUSCA=mistral na Vercel.
--
-- Para desfazer: EMBEDDINGS_BUSCA=gte (ou remover a variável) já volta a busca
-- ao gte-small. Remover de vez:
--   drop function if exists public.match_ementas_hibrido_mistral(vector, text, integer, integer);
--   drop function if exists public.match_ementas_mistral(vector, integer);
--   drop index if exists public.ementas_chunks_embedding_mistral_hnsw;
--   alter table public.ementas_chunks drop column if exists embedding_mistral;
-- ============================================================

alter table public.ementas_chunks
  add column if not exists embedding_mistral vector(1024);

create index if not exists ementas_chunks_embedding_mistral_hnsw
  on public.ementas_chunks using hnsw (embedding_mistral vector_cosine_ops);

-- Mesmo formato de retorno de match_ementas: o backend troca uma pela outra
-- conforme o tamanho do vetor da pergunta. Trechos ainda sem vetor Mistral
-- ficam de fora (distância nula não pode ser ordenada nem virar similaridade).
create or replace function public.match_ementas_mistral(
  query_embedding vector,
  match_count integer default 6
)
returns table (
  id bigint,
  content text,
  source text,
  page integer,
  similarity double precision
)
language sql
stable
as $function$
  select
    id,
    content,
    source,
    page,
    1 - (embedding_mistral <=> query_embedding) as similarity
  from ementas_chunks
  where embedding_mistral is not null
  order by embedding_mistral <=> query_embedding
  limit match_count;
$function$;

-- Híbrida (vetor Mistral + full-text em português, fusão RRF). Cópia de
-- match_ementas_hibrido (que usa o gte) trocando a coluna do vetor. Os dois
-- lados só consideram trechos que já têm vetor Mistral, para a similaridade
-- devolvida nunca ser nula.
create or replace function public.match_ementas_hibrido_mistral(
  query_embedding vector,
  query_text text,
  match_count integer default 6,
  rrf_k integer default 50
)
returns table (
  id bigint,
  content text,
  source text,
  page integer,
  similarity double precision
)
language sql
stable
as $function$
  with consulta as (
    select coalesce(
      (select to_tsquery('simple', string_agg(quote_literal(termo), ' | '))
         from unnest(tsvector_to_array(to_tsvector('portuguese', coalesce(query_text, '')))) as termo),
      ''::tsquery
    ) as q
  ),
  vetorial as (
    select c.id, row_number() over (order by c.embedding_mistral <=> query_embedding) as pos
      from public.ementas_chunks c
     where c.embedding_mistral is not null
     order by c.embedding_mistral <=> query_embedding
     limit greatest(match_count, 1) * 4
  ),
  textual as (
    select c.id, row_number() over (order by ts_rank_cd(c.fts, consulta.q) desc, c.id) as pos
      from public.ementas_chunks c, consulta
     where c.fts @@ consulta.q
       and c.embedding_mistral is not null
     order by ts_rank_cd(c.fts, consulta.q) desc, c.id
     limit greatest(match_count, 1) * 4
  ),
  fusao as (
    select coalesce(v.id, t.id) as id,
           coalesce(1.0 / (rrf_k + v.pos), 0) + coalesce(1.0 / (rrf_k + t.pos), 0) as score
      from vetorial v
      full outer join textual t on t.id = v.id
  )
  select c.id, c.content, c.source, c.page,
         1 - (c.embedding_mistral <=> query_embedding) as similarity
    from fusao f
    join public.ementas_chunks c on c.id = f.id
   order by f.score desc, similarity desc
   limit match_count;
$function$;

do $$
declare
  schema_vetor text;
begin
  select n.nspname into schema_vetor
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'vector';
  if schema_vetor is not null then
    execute format(
      'alter function public.match_ementas_mistral(vector, integer) set search_path = public, %I',
      schema_vetor
    );
    execute format(
      'alter function public.match_ementas_hibrido_mistral(vector, text, integer, integer) set search_path = public, %I',
      schema_vetor
    );
  end if;
end $$;
