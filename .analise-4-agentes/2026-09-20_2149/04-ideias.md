# 04 · Geração de ideias — novas features (2026-09-20, 21:49)

Escopo: só leitura, foco em inovação (não é análise de produto tradicional, bug ou
refatoração). Nenhuma ideia repete I-001 a I-006 (`IDEIAS.md`), N-01 a N-12
(`.analise-4-agentes/2026-09-19_2230/04-ideias.md`) nem A-01 a A-11
(`.analise-4-agentes/2026-09-20_0342/04-ideias.md`) — todas lidas antes de propor.
Esforço: P = dias, M = 1–2 semanas, G = mais que isso.

## Ponto de partida

As três rodadas anteriores de ideias miraram sobretudo o **produto de RAG/estudo em
geral** (histórico, cota, cache, busca híbrida, telemetria, offline, etc.). Mas o curso
por trás do projeto é especificamente **Engenharia de Prompt** — e hoje nenhuma aba
deixa o aluno *praticar o próprio ofício de escrever prompts*. `PerguntarTab`,
`ProfessorTab`, `AprenderTab`, `ResolverTab` e `CompararTab` sempre partem de uma
pergunta pronta e mostram a resposta da IA; ninguém corrige ou treina o prompt que o
aluno mesmo escreveria. É o espaço em branco que este lote de ideias ocupa.

---

### 1 · Laboratório de Prompts (playground dentro do curso)

- **Valor:** o curso ensina a escrever prompts, mas a plataforma nunca deixa o aluno
  escrever um prompt livre e ver a resposta crua — hoje toda pergunta passa por um
  `SYSTEM_PROMPT_*` fixo (`api/_app/prompts.py`) que já embute a persona e o RAG. Um
  playground onde o aluno digita o *system* e o *user* prompt, escolhe o provedor/modelo
  (o seletor já existe em `useProviderModel.ts`) e vê a saída sem filtro é a forma mais
  direta de "aprender fazendo" o próprio assunto da matéria.
- **Esforço:** M — aba nova reaproveitando `chamar_llm`/`chamar_llm_stream` sem os
  prompts de persona; cuidado para não vazar as chaves de provedor nem burlar a cota
  (mesmo limite de `_limitar_llm`).
- **Diferença das ideias anteriores:** todas as abas de IA hoje escondem o prompt do
  aluno atrás de um prompt de sistema pronto; aqui o prompt é o produto final do aluno,
  não uma pergunta de conteúdo.

### 2 · Corretor de prompts com rubrica (tarefa de verdade da disciplina)

- **Valor:** o professor cadastra um enunciado de exercício ("escreva um prompt que
  faça o modelo resumir um texto em 3 bullets, sem inventar dados, citando a fonte") com
  uma rubrica de critérios (usa few-shot? define formato de saída? limita o escopo?). O
  aluno cola o prompt que escreveu, o sistema executa contra um caso de teste e devolve
  nota + feedback por critério, com apoio do material indexado para explicar o que
  faltou. É avaliação do objetivo real do curso, não da matéria dentro do prompt.
- **Esforço:** G — schema novo (enunciados + rubricas + submissões), execução
  controlada do prompt do aluno (sandboxing de conteúdo, não de código), prompt de
  avaliação novo.
- **Diferença das ideias anteriores:** o Resolver (múltipla escolha) e o Feynman
  avaliam conhecimento de conteúdo; aqui se avalia a *habilidade de escrever prompt*,
  competência central do curso, com rubrica reaproveitável pelo professor.

### 3 · Comparador de variações do mesmo prompt (A/B de fraseado)

- **Valor:** a `CompararTab` já existe, mas compara **modelos diferentes** para a
  **mesma pergunta**. Aqui é o oposto: o **mesmo modelo**, para **duas ou três
  reescritas** do prompt que o aluno propõe (ex.: com e sem exemplo, com e sem
  restrição de formato), lado a lado. É a demonstração mais direta da lição central do
  curso — "a forma como você pergunta muda a resposta" — usando a própria pergunta do
  aluno como material didático.
- **Esforço:** P/M — reaproveita quase tudo de `CompararTab.tsx` e a rota
  `/api/comparar`; muda o eixo de variação (fraseado, não provedor) e o rótulo de cada
  coluna.
- **Diferença das ideias anteriores:** `CompararTab` (já existe) varia o modelo; N-04
  varia a estratégia de busca; nenhuma varia o texto do prompt do próprio aluno.

### 4 · Biblioteca viva de padrões de prompt (executável)

- **Valor:** o Glossário (`GlossarioTab`) explica termos como few-shot e
  chain-of-thought em texto, mas não deixa o aluno *rodar* um exemplo. Uma biblioteca
  com um cartão por padrão (few-shot, CoT, ReAct, self-consistency, RAG, etc.), cada um
  com um template de prompt com `{{variáveis}}` extraído/validado a partir do material
  indexado, que o aluno pode preencher e disparar contra um modelo com um clique,
  transforma teoria em prática sem sair da explicação.
- **Esforço:** M — catálogo inicial pode ser curado à mão a partir dos temas já
  extraídos pelo Glossário; execução reaproveita a mesma rota de chamada de LLM do
  playground (item 1); marcação de qual padrão aparece em qual apostila/página dá a
  citação de fonte que o projeto já valoriza.
- **Diferença das ideias anteriores:** A-03 (título de seção no chunk) e I-003
  (revisão espaçada do glossário) tratam de metadado e memorização; aqui o padrão vira
  um componente **executável**, não um texto para ler ou revisar.

### 5 · Termômetro de prompt em tempo real (heurística local, sem IA)

- **Valor:** enquanto o aluno digita a pergunta em `PerguntarTab`/`ResolverTab`, um
  indicador leve (sem chamar IA, sem gastar cota) aponta problemas clássicos que o
  próprio curso ensina a evitar: pergunta vaga demais, mais de uma pergunta misturada,
  ausência de contexto/formato desejado, uso de negação confusa. É reforço passivo do
  conteúdo da disciplina em toda interação com o produto, de graça.
- **Esforço:** P — função pura no front (parecido com `lib/texto.ts`), regras
  heurísticas simples (comprimento, pontuação, múltiplos "?", ausência de verbo de
  ação), sem mudança de backend.
- **Diferença das ideias anteriores:** nenhuma ideia anterior mexe no *momento de
  digitar* a pergunta — todas atuam depois de enviada (histórico, cache, feedback,
  auditoria).

### 6 · Desafio diário de prompt (prática deliberada gamificada)

- **Valor:** um desafio curto por dia ("escreva um prompt que faça o modelo listar
  exatamente 3 exemplos, sem inventar, e citar a fonte"), avaliado automaticamente
  contra um critério objetivo simples (contagem, presença de citação, ausência de
  termos fora do contexto). Cria hábito de prática deliberada da habilidade central do
  curso, com feedback imediato e baixo custo de IA (um desafio, uma chamada).
- **Esforço:** M — banco de desafios (pode começar como JSON estático versionado no
  repo, sem tabela nova), lógica de avaliação simples no backend, tela de progresso no
  front (pode reaproveitar o padrão de `useHistorico`/localStorage antes de existir
  conta).
- **Diferença das ideias anteriores:** N-12 (painel de domínio) mede o que o aluno já
  demonstrou saber sobre o *conteúdo*; aqui a métrica é sobre a *prática de escrever
  prompt*, com desafios novos e recorrentes, não histórico do que já foi feito.

---

## As 3 mais fortes (ordem)

1. **Laboratório de Prompts (item 1).** Esforço M, reaproveita infraestrutura de
   chamada de IA já pronta, e é a lacuna mais óbvia para uma plataforma que ensina
   Engenharia de Prompt mas nunca deixa o aluno escrever um prompt livre.
2. **Comparador de variações do mesmo prompt (item 3).** Esforço P/M, é quase uma
   cópia de `CompararTab` com o eixo trocado — baixo custo de implementação para uma
   demonstração pedagógica forte da lição central do curso.
3. **Biblioteca viva de padrões de prompt (item 4).** Esforço M, conecta o que o
   Glossário já explica em texto com uma prática executável, sem depender de nenhuma
   feature nova de backend além do que o playground (item 1) já resolveria.

Menções: o Termômetro de prompt (item 5) é a entrega mais barata (só front, sem IA) e
serve de "aquecimento" antes do Laboratório de Prompts.

Ligações entre ideias: o item 1 (playground) é pré-requisito natural de execução para
os itens 3, 4 e 6; o item 2 (corretor com rubrica) pode reaproveitar o motor de
avaliação do item 6 (desafio diário) quando amadurecer.

## Nota

7/10 de potencial de inovação. A favor: o projeto tem toda a infraestrutura de chamada
de IA, streaming, seleção de provedor/modelo e comparação já prontas e reaproveitáveis
— a maior parte destas ideias é composição do que já existe, não infraestrutura nova.
Reflete uma lacuna real e específica deste curso (praticar o próprio prompt, não só
consumir respostas prontas), o que nenhuma das três rodadas anteriores de ideias havia
endereçado. Ressalvas: item 2 (corretor com rubrica) é o único de esforço G e exige
decisões de produto (quem cria rubricas, como evitar execução abusiva do prompt do
aluno); os itens que "rodam o prompt do aluno" (1, 4, 6) precisam de guarda de cota e
de conteúdo tão cuidadosa quanto a que já existe em `_limitar_llm`, para não virar uma
porta lateral de uso irrestrito da IA.
