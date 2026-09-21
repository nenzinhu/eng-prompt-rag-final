-- ============================================================
-- Busca híbrida (vetor gte-small + full-text em português, fusão RRF)
--
-- REGISTRO: isto JÁ ESTAVA aplicado no banco de produção e não havia cópia no
-- repositório (conferido em 21/09/2026 lendo o catálogo). Guardado aqui para
-- que um banco recriado do zero tenha a mesma coisa. Idempotente.
-- ============================================================

alter table public.ementas_chunks
  add column if not exists fts tsvector
  generated always as (to_tsvector('portuguese', coalesce(content, ''))) stored;

create index if not exists ementas_chunks_fts_gin
  on public.ementas_chunks using gin (fts);

create or replace function public.match_ementas_hibrido(
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
set search_path to 'public'
as $function$
  with consulta as (
    select coalesce(
      (select to_tsquery('simple', string_agg(quote_literal(termo), ' | '))
         from unnest(tsvector_to_array(to_tsvector('portuguese', coalesce(query_text, '')))) as termo),
      ''::tsquery
    ) as q
  ),
  vetorial as (
    select c.id, row_number() over (order by c.embedding <=> query_embedding) as pos
      from public.ementas_chunks c
     order by c.embedding <=> query_embedding
     limit greatest(match_count, 1) * 4
  ),
  textual as (
    select c.id, row_number() over (order by ts_rank_cd(c.fts, consulta.q) desc, c.id) as pos
      from public.ementas_chunks c, consulta
     where c.fts @@ consulta.q
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
         1 - (c.embedding <=> query_embedding) as similarity
    from fusao f
    join public.ementas_chunks c on c.id = f.id
   order by f.score desc, similarity desc
   limit match_count;
$function$;
