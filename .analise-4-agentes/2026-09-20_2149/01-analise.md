# Análise de Projeto — requisitos, escopo, arquitetura (2026-09-20_2149)

Agente: ANÁLISE DE PROJETO. Escopo: requisitos, escopo do produto, lacunas
funcionais/arquiteturais, melhorias de produto/arquitetura. Não cobre bugs,
refatoração ou novas ideias (agentes dedicados). Método: leitura de
`PROJECT.md`, `MEMORY.md`, `IDEIAS.md`, `.env.example`, `api/index.py`,
`api/_app/provedores.py`, `app/page.tsx`, `components/**`, `lib/**` e
migrações em `supabase-backup/migracoes/`.

## 1. O produto está bem definido, mas o escopo cresceu para além do RAG

`app/page.tsx:38-52` lista 13 abas em 5 grupos: Aprender (Perguntar,
Professor, Aprender/Feynman, Buscar, Resolver, Glossário, Comparar), Criar
(Apostila), Arquivos (Comprimir, PDFs), Mensagens (Perfis Comportamentais,
Elenco) e Suporte. As três últimas (Perfis Comportamentais, Elenco, Suporte
técnico) não usam RAG — são personas de chat livre (`api/index.py:1219-1432`,
`api/_app/prompts.py`). Isso é uma escolha de produto legítima (mesma stack,
mesmo limite de uso, reaproveita `chamar_llm`), mas dilui o "RAG que cita
fonte e página" que é a proposta central (`PROJECT.md:19-24`) — vale decidir
formalmente se o produto é "plataforma de estudo com IA" (escopo atual) ou
"assistente RAG do curso" e comunicar isso na UI/README, porque hoje metade
das abas (Mensagens/Suporte) nada tem a ver com apostila alguma.

## 2. Requisito de citação de fonte é bem resolvido, com lacuna de verificação real

O fluxo descrito em `PROJECT.md:86-95` (embedding → `match_ementas` →
contexto com fonte/página → citação `[Fonte: arquivo, página N]`) está
implementado em `_preparar_pergunta` (`api/index.py:1502-1526`) e reforçado
pela feature N-05 "Ver no contexto" (`GET /api/trecho`,
`api/index.py:1137-1202`), que devolve a página indexada inteira para o
aluno conferir a citação sem gastar cota de IA. Isso é uma boa resposta ao
requisito "não inventar". Porém o requisito de produto "o aluno confia na
resposta porque ela cita a fonte" depende de o acervo estar completo — e
`PROJECT.md:237` mostra que **73% do índice (384 de 526 trechos) vem de um
arquivo que não está no Storage**, reconstruído por OCR/heurística. Ou seja,
o requisito funcional "citar página real do arquivo original" está
tecnicamente cumprido, mas o dado que sustenta a maior parte das respostas
hoje é uma reconstrução, não o original — risco de produto (citação que
aponta para um arquivo diferente do que o professor entregou), não só um
problema de dados a "consertar depois".

## 3. Conversa contínua (N-01) não persiste — requisito implícito de UX quebrado

`PerguntaReq.historico` aceita até 3 turnos de 600 caracteres
(`api/index.py:1435,1443-1466`) e o prompt monta um bloco "CONVERSA ATÉ
AQUI" (`api/index.py:1484-1499`). No front, `PerguntarTab.tsx:71` guarda a
conversa em `useState<TurnoConversa[]>([])` — estado de componente, não
`localStorage`/`sessionStorage`. Comparando com `lib/useHistorico.ts` (que
sim persiste em `localStorage`, por aba, 10 itens), a conversa contínua usa
um mecanismo diferente e mais frágil: um F5 ou troca de aba de Perguntar
zera o contexto, mesmo que a resposta anterior ainda esteja no histórico
local. Para um recurso cujo propósito é "e no caso de X?" continuar fazendo
sentido, a falta de persistência é uma lacuna de requisito não declarado
(o aluno espera que a conversa sobreviva a uma atualização de página, como
em qualquer chat). MEMORY.md:134-136 já registra isso como aberto.

## 4. Segurança do índice: RLS de leitura pública é decisão de produto, não só técnica

`supabase-backup/migracoes/2026-09-10-rls-e-glossario.sql:93-104` e
`recriar-banco.sql:92-98` concedem `select` a `anon` em `ementas_chunks` e
`glossario_termos`. Combinado com `/api/config` (`api/index.py:1006-1025`)
que expõe `auth_url`/`auth_chave` (a chave anon), qualquer pessoa com a URL
do projeto Supabase e a chave anon pode ler o índice inteiro via REST,
contornando toda a lógica de limite de uso do backend (`_limitar_llm`,
`_limitar_leitura`). Isso é aceitável se o material é considerado público
(apostilas do curso), mas é uma decisão de produto que não está declarada em
lugar nenhum voltado ao usuário/stakeholder — só em `PROJECT.md §10` como
"achado aberto". Recomendação de escopo: decidir e documentar explicitamente
se o acervo é público ou restrito a alunos; se restrito, a arquitetura atual
(RLS `select` para `anon`) não cumpre esse requisito independentemente de
`REVOKE` de DML (que é sobre escrita, não leitura).

## 5. Cota de uso mede requisições, não trabalho — descasamento de requisito de custo

`LIMITE_LLM_POR_DIA_IP`/`LIMITE_LLM_GLOBAL_POR_DIA` (`api/index.py:189-190`)
contam uma unidade por chamada a `_limitar_llm`, mas `/api/resumir-apostila`
dispara até `MAX_CHUNKS_RESUMO = 40` chamadas em paralelo por trás de UMA
única passada por `_limitar_llm` (`api/index.py:1683,1700,1734`, veja o
`asyncio.gather` sem limite de cota por chunk). O requisito de negócio
implícito — "conter o gasto com IA" — não é atendido de forma proporcional:
um Resumo de apostila grande custa até 41x mais chamadas ao provedor do que
uma Pergunta simples, mas consome a mesma "1 unidade" da cota do aluno. Já
está registrado como pendência em `MEMORY.md:205,207` (prioridades 1 e 3),
confirmando que é reconhecido, mas ainda não implementado — vale destacar
aqui como risco de escopo/custo, não só item de backlog.

## 6. Tetos de tamanho de entrada são inconsistentes entre rotas

Rotas com teto explícito: `/api/auditar` (`MAX_CHARS_AUDITORIA = 20000`,
`api/index.py:1930`), histórico do Suporte e da conversa
(`MAX_CHARS_HISTORICO = 600`, `api/index.py:1388`), interesses da apostila
(`MAX_INTERESSES = 120`, `api/index.py:1603`), trecho devolvido
(`MAX_CHARS_TRECHO = 12000`, `api/index.py:1108`). Sem teto encontrado:
`ResolverReq.texto` (`api/index.py:2082-2083`), `PerguntaReq.pergunta`
(`api/index.py:1444`), `GlossarioReq.tema` (`api/index.py:2010`),
`SuporteReq.problema`/`ambiente` (`api/index.py:1391-1393`),
`SimplificarReq`/`VerificarReq.resposta` (que pode vir arbitrariamente
grande do próprio `/api/perguntar`). Não é uma vulnerabilidade crítica (o
provedor de IA e o timeout acabam limitando o dano), mas é uma lacuna de
requisito não uniforme: o app decidiu proteger algumas rotas e não outras,
sem critério documentado. Já apontado como pendência em `MEMORY.md:206`
(prioridade 2).

## 7. Documentação de produto (README-BACKUP, .env.example) já está parcialmente à frente do PROJECT.md

Conferido agora: `.env.example:47-48` já lista `ANYAPI_API_KEY` e
`ORCAROUTER_API_KEY` (a lacuna registrada em `PROJECT.md:243` **não existe
mais** no arquivo atual — está desatualizada). Em contrapartida,
`README-BACKUP.md:9,48` ainda cita "AIHubMix" como provedor de geração de
texto, mas `api/_app/provedores.py:35-156` só define Groq, Nous, NVIDIA,
Mistral, AnyAPI, Orca Router e OpenRouter — não há AIHubMix em lugar nenhum
do código. Isso é uma divergência real de documentação de produto (nome de
provedor errado num doc que orienta restauração/configuração), independente
do que PROJECT.md relata sobre `.env.example`.

## 8. Ideias já registradas cobrem boa parte dos gaps funcionais; poucas lacunas novas a acrescentar

`IDEIAS.md` já tem I-001 (histórico na conta), I-002 (cota por aluno
logado), I-003 (revisão espaçada), I-004 (simulado com citação), I-005
(painel de lacunas do material) — cobrindo exatamente os gaps de produto
mais visíveis (persistência, cota justa, avaliação formativa, cobertura do
acervo). Como instruído no dossiê, não repito essas ideias nem crio novas
aqui (isso é escopo do agente de Ideias). Aponto só a lacuna de
priorização: I-002 (cota por usuário) e a assimetria de custo do item 5
acima são a mesma dor vista por dois ângulos (cota é por IP, deveria ser por
identidade/trabalho); vale tratá-las como uma frente só ao priorizar.

## 9. Observação de arquitetura: função serverless única concentra muita responsabilidade

Toda a API (14 grupos de rotas, ingestão de documentos, autenticação admin,
3 camadas de limite de uso, chamada a 7 provedores de IA) roda num único
`api/index.py` de ~2700+ linhas dentro de uma função Vercel com
`maxDuration=60s` (`vercel.json`, citado em `PROJECT.md:18`). O placar de
qualidade é bom (testes, ruff, tsc passando), mas do ponto de vista de
arquitetura de produto isso significa que rotas de custo/latência muito
diferentes (leitura simples de `/api/trecho` vs. resumo map-reduce de até 40
chamadas) competem pelo mesmo orçamento de tempo e pela mesma escala
horizontal da plataforma. Não é um bug, mas é um limite de arquitetura que
vale ter em mente se o produto crescer (ex.: separar ingestão/administração
— que é rara e pesada — do tráfego de perguntas — frequente e leve — em
funções ou serviços distintos).

## Resumo dos achados (para o veredito)

- Escopo do produto extrapola RAG (3 de 5 grupos de abas são chat livre sem
  citação de fonte) sem essa decisão estar documentada como tal.
- 73% do índice atual vem de um arquivo reconstruído, não do original — a
  citação "cita a fonte real" é hoje parcialmente uma ficção de dados.
- Conversa contínua (N-01) não sobrevive a F5 — usa estado de componente, não
  `localStorage`, diferente do padrão já usado em `useHistorico.ts`.
- RLS deixa o índice (`ementas_chunks`) legível publicamente via Supabase
  direto — decisão de produto (público vs. restrito) não está declarada.
- Cota de uso mede requisição, não trabalho: Resumo custa até 41x mais
  chamadas de IA que 1 unidade de cota gasta.
- Tetos de tamanho de entrada existem só em parte das rotas, sem critério
  documentado (Resolver, Perguntar, Glossário, Suporte sem teto).
- `.env.example` já corrigido (tem AnyAPI/OrcaRouter); `README-BACKUP.md`
  ainda cita provedor "AIHubMix" inexistente no código — achado novo, não
  coberto por PROJECT.md §10.
- Arquitetura de função única mistura tráfego leve (perguntas) e pesado
  (ingestão, resumo map-reduce) no mesmo orçamento de 60s — risco de escala.
