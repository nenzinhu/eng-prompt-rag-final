# Onde paramos — 20/09/2026

Registro de trabalho para retomar sem reler a conversa. O estado geral do projeto está em
[PROJECT.md](PROJECT.md); a análise mais recente em
`.analise-4-agentes/2026-09-19_2230/RELATORIO.md` (a anterior, de 17/09, continua na pasta).

## Feito nesta sessão (19/09 noite → 20/09)

Análise dos 4 agentes (média 6,5/10, sem bug crítico) e depois os itens 1 a 3 dos próximos
passos daquele relatório e, depois, TODOS os demais bugs e suspeitas do relatório. Tudo
conferido: 300 testes pytest, 75 testes JS, `ruff`, `tsc`, `eslint` e `next build` passando.

### Bugs corrigidos

- **B-01 — a lista de trechos nunca abria** (`components/EvidenceList.tsx`). O efeito saía
  cedo no `wrapRef` nulo, e o `setRendered(true)` que montaria o painel vinha depois desse
  `return`. Agora são dois efeitos: um monta, o outro anima. **Conferido no navegador**,
  não só no código — era o botão que provava a citação da resposta, em 4 abas.
- **B-02 — senha/token de admin com acento dava 500** (`api/index.py`). `compare_digest`
  com `str` não-ASCII levanta `TypeError`. Novo `iguais_em_tempo_constante` compara os
  bytes em UTF-8; usado nos 3 pontos (login, sessão, `exigir_admin`). Com acento no
  `ADMIN_PASS`, o admin não entrava nem digitando certo.
- **B-05 — `/api/gerar-apostila` caía com o Supabase fora.** A rota promete seguir só com
  conhecimento geral, mas só capturava `HTTPException`; erro do httpx escapava.
- **B-06 — resumo de apostila.** 200 sem `choices` (formato de erro do OpenRouter) virava
  `KeyError` e derrubava o documento inteiro: novo `_conteudo_da_resposta` em
  `api/_app/provedores.py` trata `error`, `choices` ausente e `content` nulo, tudo como 502
  legível. E as falhas parciais deixaram de ser silenciosas: `chunks_usados` agora é o que
  realmente entrou, com `chunks_enviados` e `falhas` novos, e um aviso na tela.
- **B-13 — reenviar PDF sem trechos dizia "já indexado".** `_gravar_documento` agora olha o
  índice (`medir_indice_atual`), não só o Storage: com 0 trechos, o arquivo entra na fila de
  ingestão. **É o caso das 2 apostilas pendentes da lista de operação abaixo.**
- **B-03 — Comparar apagava quase todo o corpo da resposta.**
  `remover_linha_resposta_direta` cortava na PRIMEIRA menção a "resposta direta"
  (com `DOTALL`, até o fim), enquanto `extrair_resposta_direta` lia a última: sobrava
  "A" no card. Agora os dois usam a última ocorrência, via `_RE_ROTULO_RESPOSTA_DIRETA`.
- **B-04 — Resolver em lote juntava dois prints numa questão só.** A tela pedia "linha em
  branco", o divisor exigia duas, e o anexo juntava com uma — o backend usa a ÚLTIMA lista
  de alternativas, então a primeira questão sumia sem aviso. Agora `AnexoImagem` recebe um
  `separador` e o modo lote passa `SEPARADOR_QUESTAO`; a divisão virou `dividirQuestoes` em
  `lib/texto.ts` (função pura, testada em `tests-js/questoes-lote.test.ts`), e o texto da
  tela diz "duas linhas em branco", que é o que o código faz. `removerBloco` deixou de
  achatar o separador ao tirar um anexo.
- **B-09 — um termo repetido perdia o lote inteiro do Glossário.** O `ON CONFLICT DO UPDATE`
  recusa o INSERT quando duas linhas têm a mesma chave (`lower(termo)`), e "API" + "api"
  zeravam a gravação. Deduplicação em `extrair_termos_glossario` e também em
  `salvar_termos_glossario`, que é quem fala com o banco. Junto, o B-09b: `{"termos": null}`
  levantava `TypeError` porque o padrão do `.get` só vale quando a chave não existe.

### Bugs corrigidos na segunda rodada ("corrija tudo")

Todo o resto do relatório de 19/09 — sobrou só o que está na tabela de pendências abaixo.

- **B-07 · OCR encerrado no meio da leitura.** O temporizador de ociosidade era limpo só
  quando outra leitura TERMINAVA. Agora é cancelado ao começar, e há contador de leituras
  em andamento (`lib/ocr.ts`).
- **B-08 · Remover anexo durante a leitura devolvia o texto ao campo.** Conjunto de ids
  descartados em `AnexoImagem`; o resultado de uma leitura cancelada é ignorado.
- **B-10 · Busca do glossário com vírgula ou parêntese.** O texto ia cru no filtro `or=(...)`
  do PostgREST e mudava a estrutura do filtro; agora vai entre aspas e escapado
  (`_valor_para_filtro`). A tela também deixou de mostrar erro como "nenhum resultado".
- **B-11 · `/api/auditar` sem teto.** Rota pública que faz uma busca vetorial POR FRASE:
  agora tem teto de caracteres e de frases, clamp no `n_por_frase`, e devolve `truncada`
  para a tela avisar que só parte foi conferida.
- **B-12 · Orçamento de tempo não descontava o já gasto.** Middleware marca o início da
  requisição e `tempo_restante_llm` dá ao modelo só o que ainda cabe nos 60 s da função
  (usado em perguntar, stream, apostila, comparar e glossário).
- **B-16 · Comprimir baixava com a extensão errada.** A saída PNG vinda de um `.jpg` baixava
  como `.jpg`; agora o formato real vai no item (`formatoSaida`). O aviso de tamanho passou a
  usar o teto do envio direto (~50 MB), não os 4,5 MB do corpo da requisição.
- **B-17 · PDF com `/Mask` perdia transparência**, e PDF protegido era regravado em silêncio
  (agora recusa com explicação). Também saiu uma tela de canvas alocada e nunca usada.
- **B-18 · Comparar** montava os slots com provedores sem chave configurada, e a chave React
  repetia quando o mesmo modelo entrava duas vezes.
- **B-19 · `/api/status` transformava erro do banco em "sem dados".** Agora responde
  `offline` (o cabeçalho já sabia pintar esse estado) em vez de `empty` com 30 s de cache.
- **B-20 · Nomes não latinos colidiam.** `日本語.pdf` e `中文.pdf` viravam `documento.pdf`, e o
  segundo substituía o primeiro. Entra uma marca estável do nome original (FNV-1a), com a
  mesma implementação no Python e no TypeScript (a aba PDFs mostra o nome antes do envio).
- **B-21 · Busca do glossário sem ordem.** A resposta mais lenta sobrescrevia a mais nova;
  e havia duas buscas iguais na montagem.
- **B-22 · `formatarAlternativas` cortava o enunciado.** "Sobre a fase A) do projeto" virava
  duas linhas. Agora só quebra numa sequência que começa em "A)" e segue em ordem.
- **B-23 · Tabelas de DOCX/PPTX ficavam fora do índice** (mais grupos e notas do slide) —
  material de curso põe comparações justamente em tabela.
- **B-24 · Sessão de admin.** Qualquer falha de rede apagava o token; agora só 401/403
  descarta, e a expiração das 8 h encerra a sessão em vez de deixar a tela dizendo
  "autenticado".
- **B-25 · Erro 422 aparecia como JSON cru** na tela.
- **B-26 · `revokeObjectURL` logo após o `click()`** podia cancelar o download. Centralizado
  em `baixarBlob` (`lib/api.ts`).
- **B-27 · Auditoria sem frases não mostrava nada**; agora diz que não havia o que auditar.
- **S-1 · Guarda na ingestão:** se os trechos novos não recebem id acima do corte (sequência
  do banco atrasada), a ingestão para com 409 em vez de apagar tudo e exibir "✓ Concluído".
- **S-2 · `listar_arquivos_storage` sem `limit`** (o padrão do Storage é 100 itens).
- **S-3 · Glossário compartilhado:** teto de 25 verbetes gravados por requisição.

### Features novas

- **N-05 · "Ver no contexto"** — rota `GET /api/trecho?fonte=&pagina=&vizinhas=` devolve a
  página indexada inteira mais a anterior e a seguinte, emendando os chunks sem repetir a
  sobreposição de 120 caracteres (`_juntar_sem_repetir`). Lê só o índice: sem embedding, sem
  modelo, sem cota de IA. No front, `components/TrechoNoContexto.tsx`, dentro de cada
  evidência. Testes: `tests/test_trecho_no_contexto.py`.
- **N-01 · Conversa contínua** — `PerguntaReq.historico` aceita turnos anteriores (teto de 3
  turnos e 600 caracteres cada, mesmo molde do Suporte), entram no prompt como DADO. A
  pergunta anterior também entra no texto do embedding: sem isso, "e no caso de X?" gera o
  vetor de uma frase sem assunto e o RAG devolve trecho aleatório. Na aba Perguntar, um
  painel mostra a conversa em andamento e tem "nova conversa". Testes:
  `tests/test_conversa_continua.py`. De quebra, `/api/perguntar` (não-stream) passou a usar
  `limpar_resposta` — era o B-14, o raciocínio do modelo vazava no "testar meu entendimento".

## Feito na sessão de 18/09 (noite)

- **Criar conta (opcional)** — e-mail e senha pelo Supabase Auth, só para identificar o
  aluno; nenhuma rota exige login. O navegador fala direto com o Supabase Auth; o backend
  só expõe `auth_url` e `auth_chave` (anon) em `/api/config`. Arquivos: `lib/conta.ts`,
  `components/Conta.tsx` (botão no `Header`), testes em `tests-js/conta.test.ts` e
  `tests/test_envio_direto.py`. Fluxos: entrar, criar conta (com confirmação por e-mail),
  reenviar confirmação, esqueci a senha, trocar senha, sair.
- **Pendente no painel do Supabase** (Authentication → URL Configuration): Site URL =
  produção e Redirect URLs com a produção e `http://localhost:3000`. O SMTP padrão manda
  poucos e-mails por hora — configurar SMTP próprio antes de divulgar.

## Feito na sessão de 17/09

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

Continua valendo "Verificar antes de reindexar". **Mudou em 19/09:** reenviar o mesmo
arquivo agora FUNCIONA quando ele está no Storage com 0 trechos (correção do B-13) — antes
o app respondia "conteúdo idêntico já indexado" e não fazia nada. Ainda não testado contra
o Supabase de produção, só com o índice simulado nos testes.

### Código (itens ainda não feitos)

Todos os bugs do relatório de 19/09 foram corrigidos. O que sobrou são decisões de
produto/infra, não defeitos:

| Prioridade | Item | Ref. |
|---|---|---|
| 1 | Limite de falhas por IP no login de admin (hoje não há) | A3-03 |
| 2 | Resumo: semáforo e nº de trechos limitado pelo limite por minuto do provedor (dispara até 40 chamadas juntas) | A3-06 / A1-13 |
| 3 | Limites de tamanho nos demais campos de texto (`resolver`, `simplificar`, `verificar`, `aprender/*`, personas) | A3-03 |
| 4 | Cota própria para busca e auditoria; teto diário de resumos por IP | A3-11a |
| 5 | Contadores de erro (504, 429, truncadas) na tabela de cota | A3-10 |
| 6 | `REVOKE` dos privilégios de INSERT/UPDATE/DELETE da chave pública (o RLS já nega) | PROJECT.md §10 |

Ideias novas ainda não implementadas (N-02 a N-04, N-06 a N-12) em
`.analise-4-agentes/2026-09-19_2230/04-ideias.md` — não estão no `IDEIAS.md`.

**Não conferido no navegador:** só o B-01 e o painel "ver no contexto" foram executados de
verdade. Os demais têm teste automatizado, mas os caminhos que dependem de OCR, de arquivo
grande e do Supabase de produção (B-07, B-08, B-13, B-16, B-17, B-24) ainda pedem um passe
manual na interface.

## Notas de ambiente

- Deploy: push na `main` de `nenzinhu/eng-prompt-rag-final` publica na Vercel
  (`eng-prompt-rag-final-nenzinhus-projects.vercel.app`). O projeto não aparece na conta
  Vercel "GridTECH" ligada ao Claude, então o status do build é conferido no painel.
- Clonar no Windows com `git -c core.longpaths=true clone ...` (a pasta
  `.analise-4-agentes` estoura o limite de caminho).
- CI roda `ruff check`, não `ruff format`; 18 arquivos já estão fora do formato.
