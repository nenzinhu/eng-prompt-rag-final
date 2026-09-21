# Onde paramos — 21/09/2026

Registro de trabalho para retomar sem reler a conversa. O estado geral do projeto está em
[PROJECT.md](PROJECT.md); a análise mais recente em
`.analise-4-agentes/2026-09-20_2149/RELATORIO.md` (média 7,0/10, **aprovado**; as
anteriores continuam na pasta).

## Feito em 21/09/2026 (tarde) — OCR das imagens, limpeza da extração, índice refeito

- **Diagnóstico:** `Logica_Programacao_Python.pdf` e `Empreendedorismo_Inovacao_Tecnologia.pdf`
  com 1 trecho NÃO eram falha: são ementas de 1 página. O problema real era texto/código
  em IMAGEM: exemplos de Python da apostila de algoritmos (prints), 12 páginas inteiras em
  imagem no livro de Node, tabelas do artigo de práticas gerenciais, exemplos do Playbook.
- **OCR:** `scripts/ocr_imagens.py` lê as imagens (largura >= 600, sem as repetidas em 3+
  páginas) com o `ministral-8b` (visão, plano gratuito; a API de OCR do Mistral dá limite
  0/min) e grava `ementas/ocr/<nome>.json`. A ingestão junta à página (`mesclar_ocr`,
  `baixar_ocr`, `paginas_do_documento`). Documento novo com imagem: rodar o script ANTES
  de indexar. Rodado nos 7 PDFs com imagem (65 trechos vindos de OCR).
- **Limpeza na extração** (`limpar_texto_extraido`): tira linhas repetidas em >= 50% das
  páginas (rodapé "Voltar ao Sumário", "Alcance Revista", "leaders.tec.br") e junta
  "tornar -se" -> "tornar-se". Aplica também ao resumo de apostila.
- **Empreendedorismo:** o PDF do Storage (123 páginas) estava indexado só até a página 46
  (ingestão interrompida: 4 lotes de 24). Reindexado inteiro; a versão órfã
  `_completo` (384 trechos, sem arquivo, restaurada de dump) foi APAGADA — há cópia em
  `supabase-backup/dumps/` e `supabase-backup/reconstruido/`.
- PDF do MCP, que estava no Storage sem índice, foi indexado (26 trechos).
- `scripts/indexar.py` roda a rota /api/ingerir localmente (sem 60 s nem sessão de admin).
- Índice: 994 trechos, 13 documentos, todos com arquivo e vetor Mistral.
- Calibração depois (amostra NOVA, não comparável): mistral recall@1 55%, recall@6 75%.
  Afirmações verdadeiras p25 0,863 < limiar "apoiada" 0,88 — vale rever com mais amostra.
- `scripts/dados/` fora do git (texto dos livros).

## Feito em 21/09/2026 — mistral-embed + busca híbrida ligada

- **Busca híbrida ligada ao código.** `match_ementas_hibrido` (vetor + full-text
  `portuguese`, RRF) já existia no banco de produção, sem cópia no repositório e sem
  ninguém chamando. Registrada em `supabase-backup/migracoes/2026-09-19-busca-hibrida.sql`.
  `buscar_chunks(emb, n, texto=...)` usa a híbrida quando recebe o texto (todas as rotas,
  menos `/api/auditar`, que mede apoio semântico frase a frase) e cai na vetorial pura se a
  RPC falhar. `BUSCA_HIBRIDA=0` desliga. **Padrão: ligada.**
- **mistral-embed (1024) ao lado do gte-small (384).** Migração
  `2026-09-21-embedding-mistral.sql` **aplicada em produção em 21/09** (coluna
  `embedding_mistral`, índice HNSW, `match_ementas_mistral`, `match_ementas_hibrido_mistral`;
  só acréscimos). A busca usa o Mistral com `EMBEDDINGS_BUSCA=mistral` e cai no gte se ele
  falhar; o tamanho do vetor escolhe a função. A ingestão grava os dois vetores quando há
  `MISTRAL_API_KEY`.
- **Em produção desde 21/09 (commits a960864, b17f4f9, 9af8fd5):** os 894 trechos têm
  vetor Mistral e `EMBEDDINGS_BUSCA=mistral` está na Vercel (projeto `eng-prompt-rag-final`;
  o projeto duplicado `nenzinhu-eng-prompt-rag-final` NÃO tem a variável).
- Calibração (`scripts/calibrar_embeddings.py`, 40 trechos): recall@6 gte 55% → mistral 88%,
  recall@1 20% → 38%. `LIMIARES_FIDELIDADE` mistral = (0.88, 0.80).
- **Aviso "pouco embasado" não tem sinal confiável.** Com perguntas curtas reais, nem a
  média do contexto nem o top-1 separam material x fora do tema (o 0.80 calibrado com
  perguntas longas avisava 17 de 20 perguntas reais). `LIMIAR_CONFIANCA` mistral = 0.65,
  que só dispara em casos extremos — igual ao 0.35 do gte, que nunca disparava. Para um
  aviso útil, usar outro sinal (ex.: apoio textual da resposta).
- `.env` local tem SUPABASE_URL, ANON, SERVICE_ROLE e MISTRAL (fora do git). As variáveis
  do Supabase na Vercel são *Sensitive*: `vercel env pull` não traz o valor.

## Feito nesta sessão (20/09 noite, orquestrador + correções)

Rodada de 4 agentes (`.analise-4-agentes/2026-09-20_2149/`) e, em seguida, os itens 1 e 2
dos achados mais importantes, mais uma feature nova pedida (item "abas organizadas, igual
Aprender"):

- **Bug do OCR (worker global do tesseract).** `encerrarWorker()` (`lib/ocr.ts`) agora
  respeita `leiturasEmAndamento`: antes, desmontar QUALQUER `AnexoImagem` (trocar de aba,
  "Recomeçar") derrubava o worker global mesmo com outro anexo ainda lendo — a leitura em
  andamento virava "erro" sem causa aparente. A aba Aprender tem 2 instâncias simultâneas,
  era o caso mais fácil de reproduzir.
- **Tetos de tamanho ausentes.** `MAX_CHARS_PERGUNTA` (4000) em `/api/perguntar` e
  `MAX_CHARS_BUSCA` (2000) em `/api/buscar` — mesmo padrão já usado em
  `/api/fale-o-que-pensa` e `/api/auditar`. Testes novos em `tests/test_tetos_e_tempo.py`.
- **Feature nova: Laboratório de Prompts.** Aba nova (`components/tabs/LaboratorioTab.tsx`,
  rota `/api/laboratorio`) onde o aluno escreve o próprio prompt (system + user) e vê a
  resposta CRUA do modelo — sem persona fixa, sem RAG, sem `limpar_resposta` (o `<think>`
  fica visível de propósito: é para o aluno aprender a diagnosticar o próprio prompt). É o
  item 1 do relatório de ideias de 19/09 e 20/09 (lacuna: nenhuma aba deixava o aluno
  praticar o próprio ofício do curso). Tetos próprios (`MAX_CHARS_LAB_SYSTEM`=2000,
  `MAX_CHARS_LAB_USER`=4000), mesma cota de qualquer chamada de IA (`_limitar_llm`).
  Testes em `tests/test_laboratorio.py`. Registrada no grupo "Aprender" da navegação,
  logo depois de Aprender.
- Conferido: 319 testes pytest, 82 testes JS, `ruff`, `tsc`, `eslint` e `next build`
  passando. **Não conferido no navegador** — só testes automatizados.

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

### Depois do push (20/09)

- **Limite de tentativas no login de admin** (era o item 1 da lista abaixo). 8 tentativas por
  IP a cada 15 min, ajustável por `LIMITE_LOGIN_ADMIN`. Duas camadas, como o limite da IA: a
  memória da instância e, com a `service_role`, o `consumir_cota` compartilhado. Conta
  TENTATIVAS, não falhas — `consumir_cota` não devolve a unidade num login bem-sucedido, e 8
  em 15 min sobram para uso legítimo. O bloqueio vale inclusive para a senha certa, senão não
  freia nada. De quebra saiu a duplicação do `consumir_cota`, agora em `_consumir_cota`, e o
  hash do IP virou `_hash_ip`. Testes em `tests/test_admin_auth.py`.

### Regressões da própria rodada (20/09, análise `2026-09-20_0342`)

O time de 4 agentes rodou de novo sobre o código já publicado: média 6,75/10, **reprovado**,
sem bug crítico. Os três achados mais graves eram regressões introduzidas pelas correções
anteriores — todas já consertadas:

- **`GET /api/trecho` não tinha limite nenhum.** Rota pública, sem `_limitar_llm`: iterando
  `pagina` dava para reconstruir a apostila inteira e martelar o Supabase. Agora tem
  `_limitar_leitura`, com balde PRÓPRIO (40/min por IP e `LIMITE_LEITURA_POR_DIA_IP`=600) —
  separado da IA de propósito, porque conferir citação é o que o app quer estimular e não
  pode gastar o orçamento de perguntas do aluno.
- **`.pptx` podia cair inteiro com 500.** O `getattr(forma, "shape_type", None)` da correção
  do B-23 não protegia nada: `NotImplementedError` vem de DENTRO da property, e `getattr` não
  segura isso. Agora o teste de grupo é `hasattr(forma, "shapes")` e cada forma vai num
  try/except — perder uma forma exótica é aceitável, perder o arquivo não. O docstring que
  afirmava indexar SmartArt foi corrigido: não indexa.
- **Tabelas do `.docx` iam TODAS para a última página**, então a citação apontava o capítulo
  errado. `_blocos_do_corpo` agora percorre o corpo na ordem real do documento
  (`w:p` e `w:tbl`), e cada tabela fica na página do seu capítulo.

Também: `_marcar_no_balde` unificou os três contadores por IP (IA, login e leitura), e
`PROJECT.md` deixou de mandar NÃO reenviar arquivo — o B-13 mudou isso e era justamente a
instrução a seguir nos 2 PDFs pendentes.

Achados ainda ABERTOS dessa análise: `/api/config` publica a chave anon e o RLS dá `select`
em `ementas_chunks` para `anon` (o índice sai direto pelo Supabase, independentemente do
limite acima — falta decisão de produto); `pergunta`/`historico`/`query` sem teto de tamanho;
a conversa contínua some no F5 e ao trocar de professor; cota conta requisição e não chamada
(Resumo gasta 41 chamadas por 1 unidade). Detalhe em `.analise-4-agentes/2026-09-20_0342/`.

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
| 1 | Resumo: semáforo e nº de trechos limitado pelo limite por minuto do provedor (dispara até 40 chamadas juntas) | A3-06 / A1-13 |
| 2 | Limites de tamanho nos demais campos de texto (`resolver`, `simplificar`, `verificar`, `aprender/*`, personas) | A3-03 |
| 3 | Cota própria para busca e auditoria; teto diário de resumos por IP | A3-11a |
| 4 | Contadores de erro (504, 429, truncadas) na tabela de cota | A3-10 |
| 5 | `REVOKE` dos privilégios de INSERT/UPDATE/DELETE da chave pública (o RLS já nega) | PROJECT.md §10 |

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
