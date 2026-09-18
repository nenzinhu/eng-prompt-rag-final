# Onde paramos — 18/09/2026

Registro de trabalho para retomar sem reler a conversa. O estado geral do projeto está em
[PROJECT.md](PROJECT.md); a análise completa em `.analise-4-agentes/2026-09-17_0817/RELATORIO.md`.

## Feito nesta sessão (18/09, noite)

- **Criar conta (opcional)** — e-mail e senha pelo Supabase Auth, só para identificar o
  aluno; nenhuma rota exige login. O navegador fala direto com o Supabase Auth; o backend
  só expõe `auth_url` e `auth_chave` (anon) em `/api/config`. Arquivos: `lib/conta.ts`,
  `components/Conta.tsx` (botão no `Header`), testes em `tests-js/conta.test.ts` e
  `tests/test_envio_direto.py`. Fluxos: entrar, criar conta (com confirmação por e-mail),
  reenviar confirmação, esqueci a senha, trocar senha, sair.
- **Pendente no painel do Supabase** (Authentication → URL Configuration): Site URL =
  produção e Redirect URLs com a produção e `http://localhost:3000`. O SMTP padrão manda
  poucos e-mails por hora — configurar SMTP próprio antes de divulgar.

## Feito na sessão anterior

- **Embeddings com erro 546 (`WORKER_RESOURCE_LIMIT`)** — a ingestão de
  `EMPREENDEDORISMO_ INOVACAO E TECNOLOGIA.pdf` falhava porque a Edge Function
  `embeddings` estourava recurso com 8 trechos de ~900 caracteres por chamada.
  Commit `86e9b4d`: lote de 8 → 4 e, no 546, o lote se divide ao meio na hora (até 1
  texto), mantendo a ordem dos vetores. Teste em `tests/test_retentativa_e_stream.py`.
  Publicado na Vercel e **confirmado funcionando** pelo dono.

## Já estava feito antes (commit `94d65cf` e seguintes)

Versão mínima da análise de 17/09: Resolver (enunciado), PDF com DejaVu, streaming com
aviso de resposta incompleta, auditoria sem acento e rótulo honesto, Comparar numérico,
fluxo de envio de material (pendências reais, retentativa idempotente, 409), `setval` no
roteiro de restauração, curadoria da lista de modelos, credenciais falsas no teste.

## Próximos passos

### Operação (aba PDFs, sem código)

1. Reindexar `Praticas_Gerenciais_Inovacao_Empresarial.pdf` — está no Storage com 0
   trechos no índice (reindexação falhou ~13/09, provavelmente o mesmo 546).
2. Reindexar `Playbook do Curso de Prompt Engineering no ChatGPT - DataWay - v1.3.pdf` —
   nunca indexado.
3. Enviar `supabase-backup/reconstruido/Empreendedorismo_Inovacao_Tecnologia_completo.pdf`,
   se ainda não foi (recupera 73% do acervo).
4. Conferir `Logica_Programacao_Python.pdf` — rendeu só 1 trecho; provável PDF escaneado.

Usar "Verificar antes de reindexar". Reenviar o mesmo arquivo não resolve: o upload
responde "conteúdo idêntico".

### Código (itens do relatório ainda não feitos)

| Prioridade | Item | Ref. |
|---|---|---|
| 1 | Limite de falhas por IP no login de admin; comparação em bytes (senha com acento dá 500) | A3-03 / A1-14 |
| 2 | Resumo: semáforo e nº de trechos limitado pelo limite por minuto do provedor (hoje ~40 chamadas simultâneas), informar trechos que entraram | A3-06 / A1-13 |
| 3 | Limites de tamanho nos campos de texto; teto de frases auditadas | A3-03 |
| 4 | Cota própria para busca e auditoria; teto diário de resumos por IP | A3-11a |
| 5 | Contadores de erro (504, 429, truncadas) na tabela de cota | A3-10 |

## Notas de ambiente

- Deploy: push na `main` de `nenzinhu/eng-prompt-rag-final` publica na Vercel
  (`eng-prompt-rag-final-nenzinhus-projects.vercel.app`). O projeto não aparece na conta
  Vercel "GridTECH" ligada ao Claude, então o status do build é conferido no painel.
- Clonar no Windows com `git -c core.longpaths=true clone ...` (a pasta
  `.analise-4-agentes` estoura o limite de caminho).
- CI roda `ruff check`, não `ruff format`; 18 arquivos já estão fora do formato.
