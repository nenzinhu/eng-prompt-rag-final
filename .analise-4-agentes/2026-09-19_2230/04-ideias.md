# 04 · Geração de ideias — novas features (2026-09-19)

Escopo: só leitura. Nenhuma ideia repete I-001 a I-006 do `IDEIAS.md`. Esforço: P = dias, M = 1-2 semanas, G = mais que isso.
O que embasa cada proposta (lido no código) vem citado em "Onde encaixa".

## Fatos do código que sustentam as ideias

- `PerguntaReq` (`api/index.py`) só tem `pergunta`, `provider`, `modelo`, `persona`: cada pergunta é independente, sem memória da conversa. `PerguntarTab.tsx` guarda um único `resultado` por vez.
- `PerguntarTab.tsx` não usa `useHistorico` (as abas Aprender, Elenco, Fale, Perfis e Suporte usam).
- `buscar_chunks` chama só `match_ementas(query_embedding, match_count)`: busca puramente vetorial, sem filtro por fonte e sem busca por palavra. A tabela `ementas_chunks` tem `source`, `page`, `content`, `embedding` (`supabase-backup/recriar-banco.sql`).
- `EvidenceList.tsx` mostra cada trecho com `line-clamp-3`, sem como ver o contexto em volta. O Storage é privado e `/api/pdfs` exige admin.
- `lib/accuracy.ts` guarda só `{acertos, total}` do Resolver: a questão errada não é guardada.
- `Markdown.tsx` usa `react-markdown` + `remark-gfm`; não há Mermaid, síntese de voz nem reconhecimento de voz no projeto (busquei `speechSynthesis`, `SpeechRecognition`, `mermaid`, `katex`).
- `/api/resumir-apostila` já processa um arquivo avulso em memória (map-reduce); isso pode ser reaproveitado.
- `consumir_cota` (300/dia/IP, 5000/dia global) e o limite de 60 s da função são as restrições que mais pesam em qualquer ideia com IA.

---

## N-01 · Conversa contínua com pergunta de acompanhamento

- **Valor:** hoje "e no caso de X?" não funciona, porque a IA não sabe a pergunta anterior. É o comportamento que o aluno espera de qualquer chat de IA, e a base já tem streaming.
- **Esforço:** M
- **Onde encaixa:** `PerguntaReq` e `_preparar_pergunta` em `api/index.py` (campo opcional `historico`, teto de turnos e de caracteres, no mesmo molde de `MAX_HISTORICO_SUPORTE` e `MAX_CHARS_HISTORICO` da rota de suporte); `PerguntarTab.tsx` (lista de turnos no lugar do `resultado` único); `lib/api.ts` (`perguntarStream`).
- **Ponto de atenção:** a busca vetorial de "e no caso de X?" sozinha volta lixo. Reformular a pergunta com o histórico antes de gerar o embedding (uma chamada curta ao modelo) ou concatenar a última pergunta ao texto da busca.
- **Primeiro passo:** só o backend: aceitar `historico` (últimos 3 turnos, cada um cortado em 600 caracteres, tratados como dado) e concatenar a pergunta anterior ao texto usado no embedding. Teste pytest com a busca simulada.

## N-02 · Cache semântico de respostas (economiza cota e responde mais rápido)

- **Valor:** perguntas muito parecidas se repetem numa turma. Reaproveitar a resposta poupa a cota de 300/dia/IP e 5000/dia global e responde em milissegundos. O embedding da pergunta já é gerado em `_preparar_pergunta`, então a consulta ao cache custa quase nada.
- **Esforço:** M
- **Onde encaixa:** migração nova em `supabase-backup/migracoes/` (tabela `respostas_cache` com `embedding vector(384)`, `persona`, `provider`, `resposta`, `versao_indice`); consulta em `_preparar_pergunta` antes de `chamar_llm`; a rota de stream emitiria `meta` com `"reaproveitada": true`.
- **Riscos:** resposta velha depois de reindexar (guardar uma versão do índice e invalidar), limiar de similaridade muito alto (>= 0.95), e não cachear resposta com `pouco_embasado`. Definir se a consulta ao cache conta na cota do aluno.
- **Primeiro passo:** medir, com as perguntas reais (se houver registro) ou com 30 perguntas parecidas escritas à mão, a distribuição de similaridade entre perguntas equivalentes e diferentes, para escolher o limiar antes de criar a tabela.

## N-03 · Perguntar dentro de uma apostila (filtro por fonte)

- **Valor:** com várias apostilas, o aluno estudando uma matéria recebe trechos de outra. Um seletor "só nesta apostila" torna a resposta mais focada e a citação mais confiável.
- **Esforço:** M
- **Onde encaixa:** função SQL `match_ementas` (novo parâmetro opcional `fonte text default null`, com `where`); `buscar_chunks` em `api/index.py`; uma rota pública que liste as fontes (hoje só `/api/pdfs`, que exige admin; `/api/status` só dá o total); um seletor em `PerguntarTab.tsx`, `BuscarTab.tsx` e `AprenderTab.tsx`.
- **Ponto de atenção:** listar nomes de arquivo publicamente é uma decisão de exposição. Alternativa: `select distinct source` na função SQL, sem tocar no Storage.
- **Primeiro passo:** migração com `match_ementas_por_fonte` (função nova, sem mexer na existente) e um teste manual no SQL editor com um `source` real.

## N-04 · Busca híbrida (vetorial + palavra-chave)

- **Valor:** siglas, nomes de ferramentas e termos exatos ("RAG", "few-shot", um número de artigo) costumam escapar de um modelo pequeno de embedding (gte-small, 384 dimensões). A busca por palavra recupera o que a semântica perde; a fusão (RRF) dá o melhor dos dois.
- **Esforço:** M
- **Onde encaixa:** migração nova (coluna `tsv tsvector generated always as (to_tsvector('portuguese', content)) stored` + índice GIN em `ementas_chunks`; função `match_ementas_hibrido` que combina as duas listas); `buscar_chunks` e `/api/buscar`; `BuscarTab.tsx` (mostrar por qual via cada trecho veio).
- **Riscos:** custo do GIN em tabela pequena é desprezível, mas confirme o plano no Supabase; testar acentos e a configuração de dicionário.
- **Primeiro passo:** rodar no SQL editor uma consulta `tsvector` para 10 termos-problema (siglas) e comparar com o que `match_ementas` devolve para os mesmos termos. Só criar a função se a diferença for visível.

## N-05 · "Ver no contexto": trecho ampliado com páginas vizinhas

- **Valor:** hoje a fonte aparece como `arquivo · pág. N` e um trecho cortado em 3 linhas; o aluno não consegue conferir a citação. Clicar na fonte (ou numa frase da auditoria) e ver a página inteira reforça a confiança, que é a promessa do projeto.
- **Esforço:** P
- **Onde encaixa:** rota nova `GET /api/trecho?fonte=&pagina=` em `api/index.py` (lê `ementas_chunks` por `source` e `page`, ordena por `id`, pode incluir a página anterior e a seguinte); `EvidenceList.tsx` (botão "ver página" que abre um painel); `RespostaAuditada.tsx` (frase auditada já tem `fonte` e `pagina` na resposta de `/api/auditar`).
- **Riscos:** os chunks têm sobreposição de 120 caracteres (`SOBREPOSICAO_CHUNK`), então juntar chunks repete um pedaço; limpar a repetição ou mostrar chunk a chunk. Limitar o tamanho da resposta.
- **Primeiro passo:** a rota, com teste, e o painel simples em `EvidenceList`.

## N-06 · Voz: ouvir a resposta e ditar a pergunta

- **Valor:** custo zero de IA e de cota (roda no navegador), com ganho real de acessibilidade (baixa visão, dislexia, estudo no celular andando). Combina com o app instalável (`InstalarApp.tsx`, `app/manifest.ts`).
- **Esforço:** P
- **Onde encaixa:** um hook novo `lib/useVoz.ts` (`speechSynthesis` para ler o Markdown já sem símbolos, `SpeechRecognition` com `lang='pt-BR'`); botões em `PerguntarTab.tsx` e `AprenderTab.tsx`. Sem mudança no backend.
- **Riscos:** suporte varia por navegador (`SpeechRecognition` no Chrome/Edge; no Firefox não existe), então o botão só aparece quando há suporte; a leitura precisa tirar `[Fonte: ...]`, código e tabelas.
- **Primeiro passo:** botão "Ouvir" na resposta do `PerguntarTab`, com função que limpa o Markdown para fala e teste em `tests-js/`.

## N-07 · Mapa mental / diagrama do tema (Mermaid)

- **Valor:** aluno visual entende mais rápido um esquema do que um texto. A persona "Visual" hoje já pede diagramas em texto (`SYSTEM_PROMPT_VISUAL`), que vira ASCII no Markdown; um render de verdade é um salto de qualidade.
- **Esforço:** M
- **Onde encaixa:** botão "Gerar mapa" em `PerguntarTab.tsx` e `AprenderTab.tsx`; rota `POST /api/mapa-mental` (busca + prompt novo que devolve só código Mermaid, validado); `Markdown.tsx` ou componente novo com `mermaid` carregado por `import()` dinâmico (não pesa no carregamento inicial).
- **Riscos:** dependência nova e pesada; saída do modelo com sintaxe inválida (validar com `mermaid.parse` e cair no texto se falhar); `securityLevel: 'strict'` por causa do conteúdo vindo da IA.
- **Primeiro passo:** protótipo só no front: colar um bloco ```mermaid``` dentro do `Markdown.tsx` e renderizar, antes de qualquer rota.

## N-08 · Caderno de erros do Resolver

- **Valor:** o Resolver hoje só conta acertos e total (`lib/accuracy.ts`); a questão errada some. Guardar as erradas e reapresentá-las é a forma mais direta de estudar pelo erro. Diferente do I-003 (cartões do Glossário) e do I-004 (simulado gerado).
- **Esforço:** P
- **Onde encaixa:** `ResolverTab.tsx` (no ponto onde chama `registrarResultado`, guardar enunciado, alternativas, letra marcada, letra correta e fontes); módulo novo `lib/cadernoErros.ts` com o mesmo padrão de `useHistorico` (localStorage com try/catch); seção "Meus erros" com botão "refazer" que devolve a questão à caixa do Resolver e "marcar como dominada".
- **Riscos:** limite de espaço do localStorage (teto de 50 itens). Migração para a conta só depois de I-001.
- **Primeiro passo:** gravar a questão errada quando o aluno marcar que errou, e listar as últimas 20.

## N-09 · Plano de estudos até a prova

- **Valor:** o aluno diz a data da prova e quantas horas por dia tem; o app monta um cronograma sobre o que existe no acervo e exporta para o calendário (.ics). Transforma o projeto de "responde quando pergunto" em "me conduz".
- **Esforço:** M
- **Onde encaixa:** aba nova no grupo "Estudar" (`app/page.tsx`, lista `TABS`); rota `POST /api/plano-estudos` (recebe temas ou apostila, data, horas/dia; usa a busca para listar tópicos reais do material, com o mesmo padrão map-reduce do resumo); prompt novo em `api/_app/prompts.py`; agenda guardada no localStorage; geração do .ics no front.
- **Riscos:** o modelo inventar tópicos fora do material (pedir só o que aparece nos trechos e citar página); limite de 60 s (gerar por semana, não tudo de uma vez).
- **Primeiro passo:** prompt que, a partir de 12 trechos de uma apostila, devolve 5 tópicos em ordem de estudo, testado à mão. O calendário vem depois.

## N-10 · Perguntar sobre o meu arquivo (RAG efêmero)

- **Valor:** o aluno tem a própria apostila ou um artigo e quer tirar dúvidas dele, não só do acervo do professor. `/api/resumir-apostila` já lê um arquivo avulso em memória; falta poder perguntar sobre ele. Nada é gravado no banco (privacidade).
- **Esforço:** G
- **Onde encaixa:** `ResumoApostilaTab.tsx` (dentro da aba Professor) e uma rota nova que reaproveita `extrair_paginas` e `chunk_texto`; a busca por similaridade seria feita na própria função (em memória) com os embeddings de `gerar_embeddings`.
- **Riscos:** `gerar_embeddings` manda 4 trechos por vez (`EMBEDDINGS_LOTE`) para a Edge Function, e o limite da plataforma é 4 MB de upload (`LIMITE_UPLOAD_PLATAFORMA_MB`): um arquivo de 100 páginas não cabe nos 60 s. Alternativas: limitar a ~15 páginas, ou embutir com um modelo no navegador (transformers.js com gte-small), o que tira a carga do servidor. Cada pergunta ainda gasta cota de LLM.
- **Primeiro passo:** teste de viabilidade medindo quantos segundos leva embutir 20 trechos hoje (`gerar_embeddings`). Se passar de 20 s, o caminho é o navegador.

## N-11 · Avaliação da resposta (👍 / 👎 / "a IA errou") com painel de qualidade

- **Valor:** hoje ninguém sabe se as respostas estão boas. O sinal do aluno, cruzado com `confianca_media` e o resultado da auditoria, dá o dado real para calibrar `LIMIAR_CONFIANCA = 0.35` (valor fixo no código) e achar as apostilas com trechos ruins. Alimenta também o I-005 (painel de lacunas).
- **Esforço:** P
- **Onde encaixa:** tabela nova `feedback_respostas` (migração; RLS fechada, escrita só pela `service_role`, como `glossario_termos`); rota `POST /api/feedback` com limite por minuto; botões em `PerguntarTab.tsx`; leitura para o admin na `PdfsTab.tsx`.
- **Riscos:** o texto livre pode conter dado pessoal (guardar só pergunta, nota, `confianca_media`, fontes e provedor; prazo curto); abuso por robô (a cota por minuto já existe em `_limitar_llm`; usar limite próprio, sem gastar LLM).
- **Primeiro passo:** migração da tabela e rota com teste; botões só no `PerguntarTab`.

## N-12 · Painel "o que eu domino" por tema

- **Valor:** junta o que o aluno já produz (notas do Feynman com `lacunas` e `confusoes`, acertos do Resolver) num mapa por tema/apostila: "domino", "revisar", "não vi". Dá sentido de progresso, que hoje não existe em nenhuma aba.
- **Esforço:** M
- **Onde encaixa:** `AprenderTab.tsx` (guardar `{tema, nota, fontes do contexto}` a cada avaliação, junto do `adicionarHistorico` que já existe) e `ResolverTab.tsx` (idem, usando as `fontes` da resposta); módulo novo `lib/dominio.ts` (localStorage); componente novo com barras por fonte, mostrado no topo do grupo "Estudar".
- **Riscos:** agrupar por fonte é grosseiro; agrupar por tema exige normalizar o texto livre do aluno (comparar embeddings de tema seria caro; começar por fonte e página).
- **Primeiro passo:** registrar, a cada avaliação do Feynman, `{fonte, pagina, nota}` a partir de `explicacao.contexto`, e listar as 3 fontes com pior média. Sem interface nova ainda.

---

## As 3 melhores (ordem)

1. **N-01 · Conversa contínua com pergunta de acompanhamento.** É a maior lacuna de uso do produto principal (Perguntar), a base já tem streaming e o molde de histórico do Suporte, e o risco está isolado (a busca do follow-up).
2. **N-05 · "Ver no contexto" (trecho ampliado com páginas vizinhas).** Esforço pequeno, reforça a proposta central de "citar a fonte" e fecha o ciclo com a auditoria de frases. Melhor relação valor/custo da lista.
3. **N-02 · Cache semântico de respostas.** Ataca o gargalo real (cota diária e latência), o embedding já é gerado, e é pré-requisito de qualquer plano de uso em sala. A ressalva (invalidação após reindexar) tem solução simples.

Menções: N-06 (voz) e N-08 (caderno de erros) são as melhores entregas de fim de semana, sem tocar no backend.

Ligações entre ideias: N-03 + N-04 melhoram a qualidade da busca que todas as outras rotas usam; N-11 dá o dado que o I-005 precisa para escolher o limiar; N-08 e N-12 ganham valor extra quando o I-001 (histórico na conta) existir.

## Nota

7/10 para receber inovação. Pontos fortes: backend com funções puras testadas (`rag_core.py`), rotas pequenas e parecidas (fácil de copiar o molde), streaming, RLS e cota já resolvidos, front em abas independentes. Ressalvas: `api/index.py` tem ~2270 linhas num arquivo só, o limite de 60 s da função e a cota diária restringem qualquer ideia com IA, a busca é só vetorial e sem filtro, e o acervo indexado tem pendências (2 PDFs sem trechos, parte do Storage perdida), o que limita quanto as features sobre o conteúdo entregam de valor hoje.
