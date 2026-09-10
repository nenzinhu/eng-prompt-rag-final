-- ============================================================================
-- FECHA DEFINITIVAMENTE o DELETE/INSERT/UPDATE da chave anon nas duas tabelas.
-- Uso direto: remove TODAS as políticas e REVOGA os privilégios DML para os
-- papéis anon/authenticated. A leitura (SELECT) segue pública via política.
--
-- O INSERT já estava bloqueado (RLS); o problema são os DELETE que continuam
-- com 204. Este SQL ataca a causa de duas formas:
--   1. remove qualquer política nas duas tabelas;
--   2. REVOGA explicitamente INSERT/UPDATE/DELETE para anon e authenticated.
-- ============================================================================

begin;

-- 1. Remove TODAS as políticas das duas tabelas (guarda-chuva).
do $$
declare p record;
begin
  for p in
    select policyname
      from pg_policies
     where schemaname = 'public'
       and tablename in ('ementas_chunks', 'glossario_termos')
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
    raise notice 'Política removida: %', p.policyname;
  end loop;
end $$;

-- 2. REVOGA INSERT/UPDATE/DELETE para os papéis públicos.
--    (SELECT fica, mas sem política de SELECT o anon não lê — por isso depois
--    recriamos a política de leitura. Aqui garantimos que NINGUÉM anon apaga.)
revoke delete, insert, update on public.ementas_chunks   from anon, authenticated;
revoke delete, insert, update on public.glossario_termos from anon, authenticated;

-- 3. RLS ligado (reforço).
alter table public.ementas_chunks   enable row level security;
alter table public.glossario_termos enable row level security;

-- 4. Leitura pública via política.
create policy "leitura publica chunks"
  on public.ementas_chunks for select to anon, authenticated using (true);
create policy "leitura publica glossario"
  on public.glossario_termos for select to anon, authenticated using (true);

commit;

-- ============================================================================
-- Depois de rodar, o esperado:
--   DELETE /ementas_chunks  (anon) → 403 Forbidden
--   DELETE /glossario_termos(anon) → 403 Forbidden
--   INSERT /glossario_termos(anon) → 401 (RLS)
--   GET (leitura)                  → 200
-- ============================================================================
