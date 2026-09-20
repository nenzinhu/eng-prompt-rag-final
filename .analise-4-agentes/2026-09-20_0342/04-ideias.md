# 04 · Geração de ideias — features novas (2026-09-20, 03:42)

Escopo: só leitura. Nenhuma ideia repete I-001 a I-006 do `IDEIAS.md` nem N-01 a N-12 da análise de
19/09. Esforço: P = dias, M = 1–2 semanas, G = mais que isso.

## Fatos do código que sustentam as propostas

- `ementas_chunks` guarda só `source`, `page`, `content`, `embedding`: o chunk não carrega título de
  seção nem capítulo (`api/rag_core.py::chunk_texto`, `api/_app/documentos.py`).
- `buscar_chunks(emb, n=6)` devolve direto o que `match_ementas` ordenou por similaridade — não há
  nenhuma etapa de reordenação depois da busca (`api/index.py:624`).
- `GET /api/trecho` (novo) já entrega a página indexada e as vizinhas, mas quem a chama é o
  `TrechoNoContexto` acionado pelo `EvidenceList`; as citações `[Fonte: arquivo, pág. N]` dentro do
  texto da resposta são renderizadas como texto comum por `Markdown.tsx`.
- `chamar_llm`/`chamar_llm_stream` (`api/_app/provedores.py`) retentam até 3 vezes **no mesmo**
  provedor (`STATUS_TRANSITORIOS`); não há queda para outro provedor configurado.
- Não existe nenhuma tabela de eventos/telemetria: as únicas tabelas são `ementas_chunks`,
  `glossario_termos` e `cota_uso` (migrações em `supabase-backup/migracoes/`).
- `app/manifest.ts` + `InstalarApp.tsx` dão o app instalável, mas não há service worker em `public/`
  — instalado, o app abre em branco sem internet.
- Todas as rotas pesadas terminam dentro da mesma requisição (limite de 60 s, daí
  `tempo_restante_llm` e `MAX_CHUNKS_RESUMO = 40`); não há job assíncrono nem retomada.
- `scripts/saude_dos_pdfs.py`, `scripts/comparar_com_indice.py` e `GET /api/duplicatas` já medem a
  integridade do acervo, mas isso só existe na linha de comando — a `PdfsTab.tsx` não mostra.
- A conta do aluno é só front (`lib/conta.ts`); nenhuma rota lê o `Authorization` do Supabase Auth.

---

## A-01 · Citação clicável dentro da resposta

- **Valor:** a promessa do projeto é "resposta com fonte". O aluno já consegue abrir a página pelo
  `EvidenceList`, mas a citação que ele lê no meio da frase — `[Fonte: apostila.pdf, pág. 12]` — é
  texto morto. Torná-la um botão que abre o `TrechoNoContexto` na página certa fecha o ciclo
  exatamente no ponto da dúvida, sem gastar IA nem cota.
- **Esforço:** P
- **Onde encaixa:** `components/Markdown.tsx` (um `remark`/regex que troca o padrão de citação por um
  componente), `components/TrechoNoContexto.tsx` (já recebe fonte e página), `components/EvidenceList.tsx`
  (reaproveitar o mesmo estado de painel). Backend intocado: `GET /api/trecho` já atende.
- **Riscos:** o modelo escreve a citação em formatos variados (com/sem colchetes, "p." vs "pág.");
  começar por um regex tolerante e, quando não casar, deixar o texto como está. O nome citado pode
  não existir mais no índice — a rota já devolve 404 com mensagem própria.
- **Primeiro passo:** função pura em `lib/texto.ts` que extrai `{fonte, pagina}` de uma citação, com
  teste em `tests-js/` cobrindo as variações que as apostilas reais produzem.

## A-02 · Reordenar os trechos depois da busca (rerank sem custo de IA)

- **Valor:** hoje os 6 trechos que vão ao prompt são os 6 primeiros do cosseno de um modelo de 384
  dimensões. Buscar 20 e reordenar com sinais que já existem no projeto (sobreposição de termos,
  números e siglas via `palavras_conteudo`/`jaccard`/`extrair_numeros`/`extrair_siglas` de
  `rag_core.py`) melhora o contexto de todas as rotas de uma vez, sem chamada extra e sem consumir
  cota. Diferente de N-04: aqui não muda a recuperação no banco, só a escolha final.
- **Esforço:** M
- **Onde encaixa:** função nova e pura em `api/rag_core.py` (`reordenar_chunks(pergunta, chunks, n)`),
  chamada em `buscar_chunks`/`_preparar_pergunta` (`api/index.py:624` e `:1450`); `confianca_media`
  passa a ser calculada sobre os escolhidos.
- **Riscos:** piorar em perguntas conceituais, onde a semântica acerta e a palavra não; manter o peso
  configurável e o vetorial como base. Buscar 20 em vez de 6 aumenta um pouco a latência da chamada
  ao Supabase (medir contra o orçamento de `tempo_restante_llm`).
- **Primeiro passo:** montar 15 perguntas reais com a fonte/página "certa" conhecida, rodar com n=6 e
  com n=20+rerank, e comparar quantas vezes o trecho certo entra nos 6 finais. Só implementar se ganhar.

## A-03 · Título de seção no chunk (metadado estrutural na ingestão)

- **Valor:** um chunk hoje é um retângulo de ~900 caracteres sem saber de que capítulo veio. Guardar
  o cabeçalho da seção e prefixá-lo no texto que vira embedding dá contexto à busca (o trecho do meio
  de uma seção passa a "saber" o tema) e permite citar `apostila.pdf · 3.2 Few-shot · pág. 12` em vez
  de só a página. Melhora simultaneamente Perguntar, Buscar, Aprender, Resolver e Resumir.
- **Esforço:** M
- **Onde encaixa:** `api/_app/documentos.py` (extração já lê estilos de DOCX/PPTX — dá para capturar
  heading; em PDF, heurística de linha curta/maiúscula), `api/rag_core.py::chunk_texto` (propagar o
  título corrente por chunk), migração nova com coluna `titulo text`, `inserir_chunks` e
  `montar_contexto` em `api/index.py`.
- **Riscos:** exige reindexar o acervo, e o dossiê registra que o acervo já está com pendências (2
  apostilas sem trechos, 73% perdido) — fazer só depois de reconstruir, e com `QUEDA_MAXIMA_TEXTO`
  protegendo. Heurística de heading em PDF erra; coluna opcional, nunca bloqueante.
- **Primeiro passo:** rodar a extração de uma apostila e imprimir os headings candidatos, sem tocar em
  banco nenhum, para ver se a heurística tem acerto suficiente.

## A-04 · Queda automática para outro provedor quando um cai

- **Valor:** em sala, um 429 ou 503 do provedor derruba a aula inteira. O projeto já tem vários
  provedores OpenAI-compatíveis configurados e `/api/providers` sabe quais têm chave. Cair para o
  próximo depois das retentativas transforma uma falha visível em um atraso de 2 s.
- **Esforço:** P
- **Onde encaixa:** `api/_app/provedores.py` (`chamar_llm` e `chamar_llm_stream`, depois de esgotar
  `STATUS_TRANSITORIOS`, com uma ordem de reserva e respeitando o `timeout` que sobra); o `meta` das
  rotas de stream já carrega `provider`/`modelo`, então basta informar a troca ao aluno.
- **Riscos:** não cair no stream depois que o primeiro pedaço já foi enviado (o aluno veria duas
  respostas emendadas) — só trocar antes do primeiro token; a aba Comparar precisa manter o provedor
  pedido, sem substituição silenciosa; o orçamento de tempo tem de sobrar para a segunda tentativa.
- **Primeiro passo:** teste pytest simulando 503 no primeiro provedor e 200 no segundo, com a troca só
  na rota não-stream.

## A-05 · Trabalhos longos em segundo plano, com retomada

- **Valor:** o limite de 60 s da função é o teto que hoje limita apostila, resumo (`MAX_CHUNKS_RESUMO`
  corta em 40) e qualquer ideia maior (simulado, plano de estudos). Um job gravado no banco, com o
  front fazendo polling, tira esse teto e ainda deixa o aluno fechar a aba e voltar depois.
- **Esforço:** G
- **Onde encaixa:** migração nova (`tarefas` com `id`, `tipo`, `estado`, `entrada`, `parcial`,
  `resultado`, `expira_em`, RLS fechada como `cota_uso`); rotas `POST /api/tarefas` e
  `GET /api/tarefas/{id}` em `api/index.py`; cada passo do map-reduce de `/api/resumir-apostila` vira
  uma fatia que cabe nos 60 s; `ResumoApostilaTab.tsx` e `ApostilaTab.tsx` passam a mostrar progresso.
- **Riscos:** sem worker de verdade, quem move a fila é o próprio polling do navegador — se o aluno
  fecha, o job para no meio (guardar o parcial e retomar). Cota: cobrar na criação do job, não por
  fatia. Prazo de guarda e faxina, como já se faz em `consumir_cota`.
- **Primeiro passo:** migração da tabela e a máquina de estados como função pura testada, antes de
  qualquer rota.

## A-06 · Conjunto de perguntas-padrão para medir o RAG no CI

- **Valor:** cada mudança em chunking, busca ou prompt hoje é aceita no olho. Um arquivo com ~30
  perguntas e a fonte/página esperada, rodando contra o índice, dá um número ("acertou a fonte em 24
  de 30") que diz se a mudança melhorou. É o que permite ousar nas ideias A-02 e A-03 sem medo.
- **Esforço:** M
- **Onde encaixa:** `tests/` (um teste marcado, fora do CI padrão, que exige as variáveis do Supabase)
  e `scripts/` (comando para rodar à mão e imprimir a tabela); `.github/workflows/ci.yml` só ganharia
  um job manual, já que o CI não tem segredos de banco.
- **Riscos:** o gabarito envelhece a cada reindexação (guardar fonte + trecho esperado, não o id);
  montar as 30 perguntas dá trabalho manual — começar com 10 de uma apostila só.
- **Primeiro passo:** escrever 10 pares pergunta→(fonte, página) à mão a partir de uma apostila real e
  medir a taxa de acerto de hoje. Esse número vira a linha de base.

## A-07 · Painel de saúde do acervo na aba PDFs

- **Valor:** o próprio dossiê registra "2 apostilas no Storage sem trechos no índice" — um problema
  que só aparece quando alguém roda um script. Mostrar na área do admin o cruzamento Storage × índice
  (arquivos sem trechos, trechos órfãos, duplicatas, caracteres indexados por arquivo) transforma um
  achado de auditoria em algo que o professor vê sozinho, e sem gastar IA.
- **Esforço:** P
- **Onde encaixa:** rota `GET /api/acervo/saude` em `api/index.py` reaproveitando `listar_storage`,
  `medir_indice_atual` e a lógica de `GET /api/duplicatas`; a lógica de comparação existe em
  `scripts/saude_dos_pdfs.py` e `scripts/comparar_com_indice.py` (mover a parte pura para um módulo
  compartilhado); exibição em `components/tabs/PdfsTab.tsx`.
- **Riscos:** a rota varre o índice arquivo a arquivo — cachear como `/api/status` faz (30 s) e exigir
  sessão de admin; acervo grande pode estourar o tempo (paginar).
- **Primeiro passo:** extrair de `saude_dos_pdfs.py` a função pura que compara as duas listas e cobri-la
  com teste; a rota vem depois.

## A-08 · Registro operacional de uso (latência, rota, provedor, falha)

- **Valor:** hoje não há como responder "qual provedor está mais lento?", "quantas perguntas por dia?",
  "quantas vezes batemos na cota?" — `cota_uso` só guarda contagem por janela. Uma linha por chamada,
  sem nada pessoal (IP já vem em hash por `_hash_ip`), orienta a escolha de provedor, o ajuste de
  `LIMITE_LLM_POR_DIA_IP` e a decisão sobre todas as outras ideias desta lista. Diferente de N-11, que
  mede a qualidade percebida pelo aluno; aqui é o lado operacional.
- **Esforço:** M
- **Onde encaixa:** migração nova (`eventos_uso`: `em`, `rota`, `provider`, `modelo`, `ms`, `status`,
  `chunks`, `confianca_media`, `ip_hash`; RLS fechada, escrita pela `service_role`); gravação num
  único ponto — o middleware de início de requisição que já existe para `tempo_restante_llm`; leitura
  agregada na `PdfsTab.tsx`.
- **Riscos:** nunca gravar a pergunta nem a resposta (evita o problema de dado pessoal); a gravação
  não pode atrasar nem derrubar a resposta (disparar sem esperar, com try/except); prazo de guarda
  curto e faxina como a de `consumir_cota`.
- **Primeiro passo:** migração da tabela e gravação só em `/api/perguntar`, com o tempo já medido.

## A-09 · Salvar a conversa como caderno em PDF

- **Valor:** agora que a conversa é contínua (`historico` em `PerguntaReq`), o aluno termina uma sessão
  de estudo com 5 ou 6 turnos bem apurados — e perde tudo ao fechar a aba (o histórico local guarda 10
  itens por aba e o `PerguntarTab` nem usa `useHistorico`). Exportar em PDF, com as perguntas, as
  respostas e as fontes citadas, entrega algo que ele leva para a prova. Reaproveita o gerador de PDF
  bonito que o I-006 já deixou pronto na apostila, sem nenhuma chamada nova de IA.
- **Esforço:** P
- **Onde encaixa:** a montagem de PDF de `/api/gerar-apostila` (`api/index.py:1567` e `api/_app/fonts`)
  vira função reaproveitável; rota `POST /api/conversa/pdf` que só formata o que o cliente manda
  (tratado como dado, com tetos por turno como em `MAX_CHARS_HISTORICO`); botão em `PerguntarTab.tsx`
  usando o `baixarBlob` que já está em `lib/api.ts`.
- **Riscos:** a rota recebe texto do cliente e devolve arquivo — aplicar teto de tamanho, escapar tudo
  e limitar por minuto, mesmo sem gastar LLM. Nada é gravado no servidor.
- **Primeiro passo:** extrair a montagem do PDF da apostila para uma função que recebe uma lista de
  seções, com teste que confere que o PDF sai válido.

## A-10 · Funcionar sem internet (service worker)

- **Valor:** o app já é instalável (`app/manifest.ts`, `InstalarApp.tsx`), mas sem rede abre em branco.
  Com um service worker cacheando a casca e as últimas respostas do `useHistorico`, o aluno relê no
  ônibus o que estudou. Custo zero de IA e de cota, e é a maior diferença prática do "instale o app".
- **Esforço:** M
- **Onde encaixa:** arquivo novo em `public/` registrado no `app/layout.tsx`; `lib/useHistorico.ts`
  como fonte do que fica disponível offline; uma faixa de aviso reaproveitando `WarnBanner.tsx`
  quando a rede cai, e desabilitar os botões que dependem do backend.
- **Riscos:** service worker mal versionado serve build antigo depois do deploy (estratégia
  network-first para o HTML e versão no nome do cache); não cachear nada de `/api/` que dependa de
  sessão de admin.
- **Primeiro passo:** service worker mínimo, só com a casca e os ícones, e um teste manual em modo
  avião com a aba já visitada.

## A-11 · Link para compartilhar uma resposta com as fontes

- **Valor:** o professor acha uma resposta boa e quer mandar para a turma; o aluno quer mostrar a
  dúvida ao colega. Hoje só existe copiar e colar, que perde as fontes e a auditoria. Um link curto,
  de leitura, com pergunta, resposta, trechos citados e confiança, faz o conteúdo circular — e cada
  link é uma porta de entrada para o app.
- **Esforço:** M
- **Onde encaixa:** migração nova (`respostas_publicas` com id aleatório, prazo de expiração, RLS
  fechada); `POST /api/compartilhar` (com limite próprio por minuto, sem gastar LLM) e
  `GET /api/compartilhado/{id}`; rota de página nova em `app/` que renderiza com o `Markdown.tsx` e o
  `EvidenceList.tsx` já existentes, em modo somente leitura.
- **Riscos:** o aluno pode ter colado dado pessoal na pergunta — pedir confirmação explícita antes de
  publicar, dar prazo de expiração e botão de apagar; id imprevisível (sem sequência); trecho de
  apostila fica público por esse link, o que é uma decisão do professor, não do código.
- **Primeiro passo:** decidir com o dono do acervo se trecho de apostila pode sair em link público.
  Se sim, migração + as duas rotas com teste.

---

## As 3 melhores (ordem)

1. **A-01 · Citação clicável dentro da resposta.** Esforço de dias, zero backend novo, zero cota, e
   ataca a promessa central do produto exatamente onde a dúvida nasce. É o melhor uso possível do
   `GET /api/trecho` que acabou de entrar.
2. **A-03 · Título de seção no chunk.** É a única ideia que melhora ao mesmo tempo a busca, a citação
   e todas as sete abas que consomem o índice. Depende de reindexar, então casa bem com a
   reconstrução do acervo que já está pendente — fazer as duas coisas na mesma passada.
3. **A-04 · Queda automática para outro provedor.** Esforço pequeno num arquivo pequeno
   (`provedores.py`), e é o que separa "funciona na minha máquina" de "aguenta uma sala de aula".

Menções: **A-06** (conjunto de perguntas-padrão) não entrega nada ao aluno, mas é o que torna A-02 e
A-03 decidíveis por número em vez de opinião — vale antes das duas. **A-07** é a entrega de um fim de
semana que resolve uma dor operacional real já documentada.

Ligações: A-06 mede A-02 e A-03; A-08 dá o dado que A-04 precisa para escolher a ordem dos provedores
de reserva; A-05 é pré-requisito de qualquer coisa longa (inclusive o I-004, simulado); A-09 e A-11
só existem porque a conversa contínua entrou.

## Nota

7/10. A favor: núcleo de funções puras testado (`rag_core.py`, 304 pytest + 75 em JS), rotas curtas e
muito parecidas entre si (copiar o molde é barato), streaming, RLS, cota compartilhada e orçamento de
tempo já resolvidos, front em abas independentes, e duas features recém-entregues (`/api/trecho`,
conversa contínua) que abrem espaço direto para A-01 e A-09. Contra: `api/index.py` com ~2700 linhas
num arquivo só, o teto de 60 s e a cota diária limitando tudo que usa IA, busca ainda puramente
vetorial e sem nenhuma etapa de reordenação, chunk sem metadado estrutural, ausência total de
telemetria (qualquer decisão sobre ideia nova é no palpite), a conta de aluno parada no front sem
nenhuma rota validando o JWT, e o acervo indexado com pendências conhecidas — o que reduz o valor
real de qualquer feature construída sobre o conteúdo antes da reconstrução.
