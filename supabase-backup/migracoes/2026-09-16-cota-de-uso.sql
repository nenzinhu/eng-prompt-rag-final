-- ============================================================
-- Cota de uso compartilhada entre instâncias serverless (16/09/2026)
--
-- O limite por IP em memória vale por instância: com N instâncias, o limite
-- real vira N vezes maior. Esta função guarda o contador no Postgres, e o
-- backend (`_limitar_llm` em api/index.py) consome uma unidade por chamada.
--
-- Segurança: só a service_role executa. A tabela tem RLS ligado e nenhuma
-- política, então a chave pública não lê nem grava nada aqui. As chaves
-- chegam com o IP já transformado em hash (HMAC) pelo backend.
-- ============================================================

create table if not exists public.cota_uso (
  chave         text        not null,
  janela_inicio timestamptz not null,
  contagem      integer     not null default 0,
  primary key (chave, janela_inicio)
);

alter table public.cota_uso enable row level security;

create or replace function public.consumir_cota(
  p_chave text,
  p_limite integer,
  p_janela_seg integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_janela timestamptz;
  v_contagem integer;
begin
  v_janela := to_timestamp(floor(extract(epoch from now()) / p_janela_seg) * p_janela_seg);

  insert into public.cota_uso as c (chave, janela_inicio, contagem)
  values (p_chave, v_janela, 1)
  on conflict (chave, janela_inicio)
  do update set contagem = c.contagem + 1
  returning c.contagem into v_contagem;

  -- Faxina ocasional (~1% das chamadas): janelas com mais de 2 dias.
  if random() < 0.01 then
    delete from public.cota_uso where janela_inicio < now() - interval '2 days';
  end if;

  return v_contagem <= p_limite;
end;
$function$;

revoke all on function public.consumir_cota(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consumir_cota(text, integer, integer) to service_role;
