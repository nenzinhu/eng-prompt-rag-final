-- ============================================================================
-- Migração complementar — remove TODAS as políticas das tabelas e recria
-- apenas a de leitura pública. Garante que políticas permissivas de DELETE
-- (que ainda deixavam a chave anon apagar com 204) sejam eliminadas.
--
-- Por que isso é necessário: a migração anterior só removia políticas com
-- nomes específicos. Esta remove qualquer política (DELETE, INSERT, UPDATE,
-- SELECT) que ainda exista nas duas tabelas, e recria só a leitura pública.
--
-- Idempotente: pode rodar quantas vezes quiser.
-- ============================================================================

begin;

-- 1. Remove QUALQUER política das duas tabelas (looping pelas do catálogo).
do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and tablename in ('ementas_chunks', 'glossario_termos')
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    raise notice 'Política removida: %.% -> %', p.schemaname, p.tablename, p.policyname;
  end loop;
end $$;

-- 2. Reforça que o RLS está ligado (não pode estar desligado).
alter table public.ementas_chunks   enable row level security;
alter table public.glossario_termos enable row level security;

-- 3. Recria só a leitura pública (SELECT) para anon e authenticated.
drop policy if exists "leitura publica chunks" on public.ementas_chunks;
create policy "leitura publica chunks"
  on public.ementas_chunks
  for select
  to anon, authenticated
  using (true);

drop policy if exists "leitura publica glossario" on public.glossario_termos;
create policy "leitura publica glossario"
  on public.glossario_termos
  for select
  to anon, authenticated
  using (true);

commit;

-- ============================================================================
-- Depois de rodar, a verificação deve mostrar:
--   DELETE /ementas_chunks  com a chave anon → 401/403  (antes: 204)
--   DELETE /glossario_termos com a chave anon → 401/403 (antes: 204)
--   INSERT /glossario_termos com a chave anon → 401/403 (já bloqueado)
--   GET    (leitura)                          → 200
-- ============================================================================
