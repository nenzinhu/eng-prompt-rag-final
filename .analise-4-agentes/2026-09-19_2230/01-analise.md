# 01 — Análise de Projeto (requisitos, escopo, lacunas e melhorias de produto/arquitetura)

Data: 2026-09-19. Somente leitura. Cada afirmação cita arquivo:linha. Não repete I-001..I-006 (IDEIAS.md);
onde uma lacuna toca uma ideia existente, isso é dito. Bugs, refatoração e ideias soltas ficam com os outros agentes.

## 1. Resumo do escopo real

O que o produto entrega hoje (app/page.tsx:38-52; PROJECT.md seções 2-3): 13 abas em 5 grupos, todas sem login
(nenhuma rota exige conta; lib/api.ts não envia token de aluno, o `Bearer` de lib/conta.ts:124 só fala com o Supabase Auth).
Núcleo: pergunta -> embedding -> `match_ementas` (top-N) -> LLM com citação (api/index.py:1123-1140).

Achado estrutural: o produto tem duas identidades misturadas.
- "Estudar/Produzir/Arquivos" é uma plataforma de estudo por RAG.
- "Comunicar" (Perfis, Elenco, Fale o que pensa) e "Suporte TI" (api/index.py:886-1113) são assistentes de
  redação/atendimento que não usam o acervo nem citam fonte. Não fazem RAG, mas consomem a mesma cota de IA
  (`_limitar_llm`, api/index.py:417) que as abas de estudo. Os prompts declaram "curso de Engenharia de Prompt"
  (api/_app/prompts.py:5,14,24), enquanto o acervo real é Empreendedorismo, Práticas Gerenciais, Python e uma
  tabela de preços do Nous Portal (PROJECT.md:130-140). Ou seja, público e conteúdo não casam.

## 2. Requisitos implícitos não atendidos (lacunas de produto)

Cada item traz evidência no código e o que viraria feature. Prioridade: A = maior valor para o aluno / B = médio / C = baixo.

### L1 (A) A conversa com a apostila não tem memória (sem multi-turno)
- `PerguntaReq` só tem `pergunta`, `provider`, `modelo`, `persona` (api/index.py:1116-1120); o prompt é sempre
  `CONTEXTO + PERGUNTA` de uma rodada (api/index.py:1160,1174). Perguntas como "e no caso de X?" perdem o assunto.
- O suporte TI já tem o padrão (`historico` limitado a 600 caracteres, api/index.py:1069,1100), mas só nessa aba.
- Feature: modo conversa em Perguntar/Professor: enviar as últimas 2-3 trocas, e reescrever a pergunta com o contexto
  antes de buscar no índice (senão a busca vetorial continua cega ao histórico). Custo: 1 chamada extra curta.

### L2 (A) Não dá para escolher em qual apostila perguntar (busca sem filtro por documento)
- `match_ementas(query_embedding, match_count)` não tem parâmetro de fonte (supabase-backup/recriar-banco.sql:31-54);
  `buscar_chunks` só passa embedding e n (api/index.py:516-524).
- Efeito real: o acervo é misto (PROJECT.md:240, "resumo de preços de modelos do Nous Portal indexado junto com as
  apostilas"); uma pergunta de Python pode trazer trecho de empreendedorismo e a resposta sai "pouco embasada".
- O aluno nem consegue ver quais apostilas existem: `/api/status` devolve só o total (api/index.py:758-789) e
  `/api/pdfs` é só admin (api/index.py:2261-2269).
- Feature: lista pública de apostilas ("Biblioteca") + seletor "perguntar só em: [todas | apostila X]" + botão
  "buscar só nesta apostila" nos resultados. Exige nova versão da RPC `match_ementas` com filtro opcional de `source`
  (migração SQL) e um endpoint público que devolva fontes distintas (só nome e nº de páginas, sem expor o Storage).
- Ainda mais estrutural: não existe conceito de "curso/coleção" (a tabela é uma só, `ementas_chunks`, sem coluna de
  coleção, recriar-banco.sql:17-24). Suportar mais de uma turma/curso exigiria essa coluna.

### L3 (A) Nada do que o aluno produz persiste fora do navegador, nem se soma
- `useHistorico` guarda 10 itens por aba no localStorage (lib/useHistorico.ts:12,39) e só 5 abas o usam: Suporte,
  Fale, Aprender, Elenco, Perfis (grep de `useHistorico(`). Perguntar, Professor, Resolver, Glossário, Apostila e
  Buscar não guardam histórico nenhum. O aluno de estudo, público-alvo do produto, é o único sem histórico.
- O placar do Resolver é um contador acertos/total no localStorage (lib/accuracy.ts:1-39), sem tema, data ou
  questão. Não há "onde erro mais".
- A nota do Feynman (0-100, api/index.py:1496-1498) e as `lacunas`/`confusoes` (1499-1500) são devolvidas e
  mostradas, mas nenhuma rota as grava. É o dado pedagógico mais valioso do app e some ao fechar a aba.
- I-001 propõe histórico na conta; esta lacuna é anterior e menor: primeiro decidir o QUE guardar (respostas de
  Perguntar/Professor, resultados do Resolver por tema, notas e lacunas do Feynman) e só depois ONDE.
- Feature: "Meu progresso" (local primeiro): histórico em Perguntar/Professor/Resolver; painel com acerto por tema,
  evolução das notas do Feynman e "temas para revisar" (lacunas e questões erradas). Sem custo de IA.

### L4 (A) Sem loop de aprendizado ativo: o app responde, mas não treina
- O que existe: `/api/verificar` gera 1-2 perguntas de checagem (api/index.py:1384-1407); `/api/resolver` só resolve
  questão que o aluno traz (1644); Feynman avalia uma explicação (1465).
- Falta gerar prática a partir do material. (I-004 cobre "simulado"; ficam de fora dele e são lacunas distintas:
  flashcards a partir de um trecho/apostila e "plano de estudo para uma prova em X dias" montado sobre as apostilas
  disponíveis.) Os flashcards reaproveitam o Glossário; ver L5.

### L5 (B) O Glossário é um depósito global sem fonte, sem dono e sem uso posterior
- Tabela única e compartilhada: `termo, explicacao, exemplo, origem` (recriar-banco.sql:75-83), com índice único
  por `lower(termo)`. Não guarda fonte nem página do termo, apesar de o produto vender "citando fonte".
- Como o índice é único global, o termo gerado por um aluno vale para todos e o primeiro a gerar "vence": não há
  como refazer uma definição ruim (`on_conflict` ver api/index.py:698-735). Busca por `ilike` (index.py:737-750);
  sem paginação além de 200 (index.py:737).
- Feature: guardar `fonte`/`pagina` no termo, permitir "regenerar", exportar CSV/Anki do glossário, e o modo de
  revisão de I-003 (que já existe como ideia; esta lacuna é o pré-requisito de dados).

### L6 (B) Sem canal de retorno sobre a qualidade das respostas
- Nenhum botão de "útil / não útil / errou" em nenhuma aba (grep de feedback/curtir nos componentes: só há
  `marcarResultado` do Resolver, ResolverTab.tsx:74). O dono não tem como saber quais respostas falham.
- Também não há registro de métricas de uso (quais abas, quais perguntas ficaram "pouco embasadas"). O sinal
  `pouco_embasado` já existe na resposta (api/index.py:1149, 1445, 1700) e é descartado depois de mostrado.
- I-005 propõe um painel de lacunas; esta lacuna é o mecanismo de coleta (evento mínimo por resposta:
  aba, fonte principal, confiança, feedback) que I-005 e qualquer painel do professor precisariam.

### L7 (B) Sem papel de professor/turma; o admin é uma senha única
- O único papel além do aluno anônimo é o admin por env (`ADMIN_USER/PASS/TOKEN`, api/index.py:819-841), usado só
  para upload. Não há "professor" que veja o uso da turma, nem "turma" que agrupe alunos.
- Conta de aluno: só identifica (MEMORY.md:8-13). Como nenhuma rota lê o JWT, criar conta hoje não dá nenhuma
  vantagem (I-001/I-002 já apontam isso). Antes de qualquer uma delas, falta o requisito de base: validar o JWT
  do Supabase no backend.

### L8 (B) Ingestão só aceita arquivo; não há outras fontes nem gestão do acervo
- Formatos: PDF, TXT, MD, DOCX, PPTX (api/_app/documentos.py:62-75). PDF escaneado sem texto não é indexado
  (mensagem em api/index.py:1307; `Logica_Programacao_Python.pdf` rendeu 1 trecho, PROJECT.md:239). O OCR
  (tesseract.js) existe só no navegador para imagem colada em Resolver/Perguntar (lib/ocr.ts), não na ingestão.
- Sem endpoint para APAGAR ou RENOMEAR um documento; a aba PDFs lista, envia e reindexa (api/index.py:1955-2269).
  Buscar nas rotas `/api/*` por `delete` só dá o helper interno `remover_documento_storage` (index.py:2240).
- Sem ingestão por URL/YouTube (transcrição), o que amplia o acervo sem exigir PDF.
- Feature: OCR na ingestão para escaneados (pré-requisito para "Lógica de Programação"), excluir documento, e
  "adicionar por link".

### L9 (B) Resumo de apostila é efêmero e não conversa com o acervo
- `/api/resumir-apostila` processa em memória e "não escreve nada" (docstring, api/index.py:1286-1290). O resumo
  não pode ser salvo, nem virar Glossário, nem ser consultado depois. Quando o arquivo passa de 40 trechos, amostra
  uniformemente (1310-1313) e devolve `amostrado`/`chunks_usados`, o que já cobre a transparência.
- Feature: a partir do resumo, "gerar flashcards", "gerar apostila", "perguntar sobre este arquivo" (RAG sobre um
  arquivo temporário do próprio aluno, sem indexar no acervo público).

### L10 (C) Modelo de custo e limites sem visibilidade para o aluno
- Só o backend sabe da cota (`consumir_cota`, api/index.py:417-470; migração 2026-09-16-cota-de-uso.sql). O aluno
  só descobre o teto quando recebe a mensagem de erro. Não há "você já usou X de 300 hoje" nem estimativa de custo
  por rota (Comparar dispara até 4 modelos em uma chamada, index.py:1737). O painel de "consumo" ajudaria a
  antecipar o bloqueio, mas só faz sentido junto de I-002.

## 3. Requisitos não funcionais que limitam as features novas

- Teto de 60 s por função (vercel.json:4-8, `maxDuration`). Qualquer feature que encadeia chamadas (simulado,
  plano de estudo, multi-turno com reescrita de pergunta, flashcards de apostila inteira) precisa ser dividida em
  lotes ou rodar em streaming. Já há precedente: Glossário mede o tempo restante (api/index.py:1602-1607) e o
  Resumo amostra 40 trechos.
- Cota por IP e global compartilhada (index.py:438-440): cada chamada extra de IA (reescrita de pergunta, auditoria
  automática) consome a cota; `auditar` roda 1 busca por frase em SEQUÊNCIA (index.py:1540-1543), e cada rota nova
  deve decidir se conta na cota. A prioridade 4 da MEMORY.md (cota própria para busca/auditoria) é pré-requisito de
  features que multipliquem chamadas.
- Um único arquivo de backend de ~2270 linhas (api/index.py) concentra 34 rotas (`@app.get/post`), acesso ao
  Supabase, limites e ingestão. Cada feature nova entra nesse arquivo; para features de conta e de progresso
  vale criar um módulo de rotas separado (`api/_app/`) já como parte do trabalho, não depois (o registro em
  `vercel.json:3-8` inclui `api/_app/**`).
- Não há testes de front além de 6 arquivos `node --test` (PROJECT.md:219) e nenhum teste de componente das abas;
  features de progresso local (localStorage) precisam de uma camada testável (padrão de `lib/accuracy.ts`).

## 4. Melhorias de arquitetura que destravam features

| # | Melhoria | Destrava | Evidência |
|---|---|---|---|
| M1 | Validar JWT do Supabase no backend (dependência `usuario_opcional`) | I-001, I-002, progresso na conta, papéis | Nenhuma rota lê o token de aluno; `auth_url/auth_chave` só vão ao navegador (index.py:809-810) |
| M2 | RPC `match_ementas` com filtro opcional por fonte/coleção (+ endpoint público de fontes) | L2, resumo->perguntar, "curso" | recriar-banco.sql:31-54; index.py:516 |
| M3 | Tabela `eventos` (aba, fonte, confiança, feedback, sem texto pessoal) | L6, I-005, painel do professor | `pouco_embasado` calculado e descartado (index.py:1149) |
| M4 | Prompt de sistema parametrizado pelo nome do curso/acervo, em vez de "Engenharia de Prompt" fixo | Reuso para outras turmas/cursos | prompts.py:5,14,24,45,52,59,75 |
| M5 | Helper único "buscar+montar contexto" (hoje repetido em 6 rotas com `n` diferente: 6, 6, 8, 8, 12, 6) | Multi-turno, filtro por fonte, cache de embedding | index.py:1135, 1431, 1587, 1654, 1246, 1741 |
| M6 | Saída de exportação genérica (o exportar .md só existe na aba Perguntar, PerguntarTab.tsx:216-238) | Exportar histórico, glossário, flashcards | PerguntarTab.tsx:216-238 |

## 5. Candidatas a feature, priorizadas (sem repetir I-001..I-006)

Prioridade = valor para o aluno / esforço, respeitando dependências.

| Ordem | Feature | Lacuna | Esforço | Dependências | Por que agora |
|---|---|---|---|---|---|
| 1 | Conversa com memória (últimas 2-3 trocas + reescrita da pergunta para a busca) | L1 | Médio | nenhuma | Maior ganho de experiência; o suporte TI já tem o padrão (index.py:1100) |
| 2 | Biblioteca de apostilas + perguntar "só nesta apostila" | L2 | Médio | M2 (migração da RPC) | Resolve o acervo misto sem reindexar nada |
| 3 | "Meu progresso" local: histórico em Perguntar/Professor/Resolver + placar por tema + lacunas do Feynman | L3 | Baixo | nenhuma (localStorage) | Sem custo de IA; base de dados de I-001, I-003 |
| 4 | Botão "útil / não útil" + registro de eventos mínimo | L6 | Baixo | M3 | Dá dados reais para escolher limiar de I-005 |
| 5 | Flashcards (de um trecho, de um resumo ou do glossário) exportáveis (CSV/Anki) | L4/L5/L9 | Baixo-médio | L5 (fonte/página no termo) | Fecha o ciclo estudar -> treinar |
| 6 | Plano de estudo por prova (data + temas -> cronograma sobre as apostilas) | L4 | Médio | L2 ajuda | Alto valor percebido; pouca IA (1 chamada) |
| 7 | OCR na ingestão para PDFs escaneados + excluir documento | L8 | Médio | admin | Recupera `Logica_Programacao_Python.pdf` |
| 8 | "Perguntar sobre este arquivo" (RAG efêmero sobre o upload do aluno) | L9 | Médio-alto | limite de 4 MB na Vercel | Complementa o Resumo |
| 9 | Painel do professor (uso, lacunas, feedback) | L7 | Alto | M1, M3 | Só depois de haver dados |
| 10 | Medidor de cota do aluno ("usou X de 300") | L10 | Baixo | I-002 | Só faz sentido com cota por usuário |

## 6. Melhorias de escopo (decisões de produto a tomar)

1. Definir o foco: a plataforma de estudo (Estudar/Produzir/Arquivos) e os assistentes de comunicação/suporte
   (index.py:886-1113) atendem públicos diferentes, dividem a mesma cota e não usam o RAG. Decidir se ficam,
   se viram um "modo extra" com cota própria, ou se saem para outro projeto.
2. Decidir o curso-alvo: o texto dos prompts fala em Engenharia de Prompt (prompts.py:5), o acervo é de outros temas
   e o nome do projeto é "eng-prompt-rag". Ou se reindexa o material do curso (o `Playbook do Curso de Prompt
   Engineering`, PROJECT.md:236, está no Storage sem trechos), ou se ajusta o texto (M4).
3. Definir o que é "aluno": a conta de aluno existe sem função (MEMORY.md:8-13). Cada feature nova de L3/L6 deve
   nascer "local primeiro, conta depois" para não depender de M1.

## 7. Documentação e requisitos rastreáveis

- Não existe um documento de requisitos: PROJECT.md descreve o que há, MEMORY.md as pendências, IDEIAS.md as
  ideias. Sem critérios de aceite, por exemplo "resposta com fonte citada em 100% dos casos com `pouco_embasado`
  falso" não é medido em lugar nenhum.
- Divergências que afetam o produto (não só a documentação): `.env.example` sem `ANYAPI_API_KEY` e
  `ORCAROUTER_API_KEY`; `README-BACKUP.md` cita AIHubMix (PROJECT.md:241-245).

## 8. Limites desta análise

- Não executei o app nem consultei o Supabase de produção; o estado do acervo vem de PROJECT.md (conferido em
  18/09 segundo o próprio documento) e não foi reverificado.
- Não li o corpo de todos os componentes de aba (só PerguntarTab, useHistorico, accuracy, page.tsx e partes de
  api/index.py). A afirmação "Perguntar/Professor/Resolver/Glossário/Apostila/Buscar não usam `useHistorico`"
  vem de busca por `useHistorico(` em `components/`, `lib/` e `app/`; outros mecanismos de persistência local
  nessas abas só apareceriam por `localStorage.getItem/setItem` (encontrei apenas os de accuracy, admin, conta,
  useProviderModel e ApostilaTab).
- Prioridades e esforços são estimativas minhas, não medidas.

## Nota

NOTA: 7/10. Produto amplo e bem coberto, mas com lacunas claras de aprendizagem contínua (memória de conversa,
progresso, feedback, escolha de apostila) e sem documento de requisitos; escopo misturado entre estudo e comunicação.
