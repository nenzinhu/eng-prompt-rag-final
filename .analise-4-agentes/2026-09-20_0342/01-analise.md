# 01 — Análise de Projeto (requisitos, escopo, lacunas e melhorias de produto/arquitetura)

Data: 2026-09-20 (03:42). Somente leitura — nenhum arquivo do projeto foi alterado.
Cada afirmação cita arquivo (e linha quando couber). Bugs, refatoração e ideias soltas ficam com os outros agentes.

Base: dossiê `00-dossie.md` desta pasta e a análise anterior `.analise-4-agentes/2026-09-19_2230/01-analise.md`
(lacunas L1–L10, arquitetura M1–M6). Não repito o que lá está; a seção 2 diz o que mudou e a seção 5 marca,
em uma linha cada, o que continua aberto.

---

## 1. Escopo verificado hoje (só o que mudou de leitura)

- 13 abas, 5 grupos (`app/page.tsx:37-53`). "Resumir apostila" não é aba própria: é o segundo modo de
  Professor Sabe Tudo (`components/tabs/ProfessorTab.tsx:184-230`).
- Professor Sabe Tudo **reaproveita PerguntarTab inteiro** (`ProfessorTab.tsx:219-226`), com `persona`
  diferente. Isso corrige uma leitura da análise de 19/09 (item L3, "Professor não guarda histórico"):
  Professor herda tudo o que Perguntar tem — streaming, conversa contínua, "ver no contexto" —
  e herda também tudo o que falta.
- Backend: 34 rotas em `api/index.py`, agora com 2700 linhas (eram ~2270).

## 2. O que mudou desde a análise de 19/09 (conferido no código)

**Entregue (confere com o dossiê):**

| Item | Onde | Situação |
|---|---|---|
| N-01 Conversa contínua | `api/index.py:1413-1442` (`_texto_para_busca`, `_bloco_conversa`), `1445-1470` (`_preparar_pergunta`) | Feito, inclusive a parte difícil: a pergunta anterior entra no texto do embedding (`:1413-1424`) |
| N-05 "Ver no contexto" | `api/index.py:1086-1143`, `components/TrechoNoContexto.tsx` | Feito |
| Limite de login de admin | `api/index.py:989-996` | Feito |

**Correções à análise anterior (ela estava errada nestes pontos, não o código):**

1. **`/api/perguntar/stream` já existia em 19/09** e não foi mencionado na análise anterior
   (`api/index.py:1499-1531`; consumido em `components/tabs/PerguntarTab.tsx:109`). A afirmação de que
   "cada feature nova precisa ser dividida em lotes ou rodar em streaming" ignorava que a infraestrutura
   de streaming já estava pronta (`api/_app/provedores.py:297`, `chamar_llm_stream`). Ver G4.
2. **Ingestão por envio direto já existia** (`/api/upload/url` e `/api/upload/confirmar`,
   `api/index.py:2633-2678`), com teto de 50 MB. A L8 ("ingestão só aceita arquivo") continua válida quanto a
   OCR/URL/exclusão, mas o gargalo de tamanho do upload já não é o que era.
3. **M5 piorou, não melhorou:** o par "busca + montar contexto" agora está em **8** pontos
   (`api/index.py:1041, 1462, 1585, 1793, 1924, 1968, 2042, 2129`), com `n` em 6/6/6/8/8/12/20/variável.
   Cada feature nova de RAG (filtro por apostila, cache, híbrida) precisa tocar oito lugares.

**Não mudou nada** em L2 (filtro por apostila), L3 (persistência), L5 (glossário sem fonte), L6 (feedback),
L7 (papéis), L9 (resumo efêmero), L10 (visibilidade de cota) e M1–M4, M6. Evidência na seção 5.

---

## 3. Lacunas NOVAS (não estão na análise de 19/09, no dossiê nem no `IDEIAS.md`)

Prioridade: A = trata do ativo central do produto / B = médio / C = baixo.

### G1 (A) `/api/trecho` publica o acervo inteiro, sem cota e sem limite de enumeração

- A rota é pública e **não chama `_limitar_llm` nem `_consumir_cota`** — é a única rota de leitura do material
  sem nenhum freio (`api/index.py:1086`; compare com `/api/buscar`, que chama `_limitar_llm` na linha 1036).
  A justificativa está na própria docstring (`:1093-1094`: "não gasta cota de IA"), e é verdadeira quanto a
  custo de IA — mas a cota também serve para proteger o **conteúdo**, não só a fatura.
- `pagina` é opcional (`:1086`): sem ela, a rota devolve os 60 primeiros chunks daquela fonte
  (`:1107`, `limit 60`), até 12.000 caracteres por resposta (`MAX_CHARS_TRECHO`, `api/index.py:1056`).
  Com `pagina` variando de 1 a N, um laço trivial reconstrói a apostila inteira em texto limpo — o
  `_juntar_sem_repetir` (`:1060-1082`) inclusive remove a sobreposição dos chunks, entregando texto contínuo.
- O nome da fonte não é segredo: vem em toda resposta do RAG (`api/index.py:1474`, campo `fonte`).
- **É um requisito de produto que nunca foi escrito:** o valor do produto é o acervo, e não existe nenhuma
  definição de quem pode lê-lo por inteiro. O RAG entrega recortes com citação; esta rota entrega o original.
  Decisão a tomar: (a) o material é público e isso não importa, ou (b) `/api/trecho` passa a exigir
  `pagina`, a contar cota própria e a devolver apenas a janela de ±1 página que a interface usa.

### G2 (A) O acervo também é legível direto no Supabase, sem passar pelo backend

- `/api/config` devolve `auth_url` e `auth_chave` (a chave anon) ao navegador, para as contas de aluno
  (`api/index.py:971-973`). A chave anon é pública por definição — a docstring diz isso.
- A política de RLS dá `select` em `ementas_chunks` para `anon` (`supabase-backup/recriar-banco.sql:93-95`:
  "leitura publica chunks" ... `to anon, authenticated using (true)`).
- Somadas, as duas coisas significam que qualquer pessoa com a chave que o próprio app entrega pode fazer
  `GET /rest/v1/ementas_chunks?select=content,source,page` e baixar o índice todo, fora de qualquer cota do
  app. A mesma política vale para `glossario_termos` (`:96-98`).
- Isto não é novidade do código (a política é de 10/09), mas virou lacuna de produto quando a chave anon
  passou a ser publicada em `/api/config` pela feature de conta de aluno. G1 e G2 são o mesmo requisito
  ausente por dois caminhos; a severidade técnica é assunto do agente de bugs/segurança, o que anoto aqui é
  que **não existe decisão de produto sobre o nível de acesso ao material** — nem em `PROJECT.md §10`,
  nem em `MEMORY.md`.

### G3 (A) A conversa contínua recém-criada não sobrevive a um F5 nem à troca de persona

- Os turnos vivem só em estado React: `const [conversa, setConversa] = useState<TurnoConversa[]>([])`
  (`components/tabs/PerguntarTab.tsx:71`), com teto de `MAX_TURNOS` (`:17`). Nenhuma chamada a
  `useHistorico` na aba (`lib/useHistorico.ts` é usado em 5 abas: Aprender, Elenco, Fale o que pensa,
  Perfis e Suporte — nenhuma delas de estudo).
- Recarregar a página zera a conversa. Nada é gravado no navegador nem no servidor: o `historico` viaja do
  cliente para o backend a cada pergunta (`lib/api.ts:188,193`) e volta a morar só na memória da aba.
- Pior: em Professor Sabe Tudo, o PerguntarTab é montado com `key={persona.id}`
  (`ProfessorTab.tsx:220`). **Trocar de professor desmonta o componente e apaga a conversa.** O fluxo
  natural ("não entendi com o Acadêmico, vou tentar com o Showman") é exatamente o que perde o contexto.
- Isto agrava a L3 em vez de resolvê-la: a feature nova produz o dado pedagógico mais rico do app
  (a linha de raciocínio do aluno) e é a que menos persiste.
- Feature mínima, sem custo de IA: `useHistorico('perguntar')` para os turnos + "continuar conversa
  anterior", e passar a conversa como `prop` no Professor em vez de remontar por `key`.

### G4 (B) O streaming existe e é usado por uma rota só

- `chamar_llm_stream` (`api/_app/provedores.py:297`) tem **um único ponto de uso** em todo o backend:
  `api/index.py:1519`, dentro de `/api/perguntar/stream`.
- As rotas que mais demoram continuam bloqueando até o teto de 60 s (`vercel.json`, `maxDuration`):
  `/api/comparar` roda até 4 modelos em paralelo e só responde no fim (`api/index.py:2184`),
  `/api/resumir-apostila` faz map-reduce de até 41 chamadas (`:1678` + `:1686`), `/api/gerar-apostila`,
  `/api/aprender/*` e `/api/glossario` idem.
- Como requisito: "o aluno vê a resposta nascer" só vale numa aba de treze. É a lacuna de produto mais
  barata de fechar, porque o transporte (NDJSON com eventos `meta`/`texto`/`fim`/`erro`,
  `api/index.py:1512-1528`) e o leitor no front (`lib/api.ts:161-190`) já estão escritos e testados
  (`tests-js/api-stream.test.ts`).

### G5 (B) A cota conta requisições, não custo — e as rotas caras custam 40x

- `_limitar_llm` é chamado **uma vez por requisição** (`api/index.py:1645` no resumo, `:2120` em comparar).
- `/api/resumir-apostila` dispara até `MAX_CHUNKS_RESUMO` = 40 chamadas ao provedor de uma vez
  (`:1627, 1661-1678`) mais a de redução (`:1686`): 41 chamadas por 1 unidade de cota.
  `/api/comparar` gasta 4 por 1 (`:2184`).
- Efeito de produto: os 300/dia/IP e 5000/dia globais (dossiê) não descrevem consumo real; um único IP
  pode custar 40x o que a contabilidade registra, e o teto global não protege do que deveria proteger.
- O `MEMORY.md` já prevê "semáforo no resumo" (pendência 1) e "teto diário de resumos por IP"
  (pendência 3). O que acrescento é o requisito por trás delas: **a unidade de cota precisa ser
  "chamada ao provedor", não "requisição HTTP"**, senão cada rota nova repete o problema.

### G6 (B) A documentação operacional está desatualizada justamente onde o dono age

- `PROJECT.md:236` instrui: "Reenviar o mesmo arquivo não resolve: o upload compara com o Storage e responde
  'conteúdo idêntico'". O código já **não** se comporta assim desde o B-13: `_gravar_documento` consulta
  `medir_indice_atual` e só ignora o arquivo quando há trechos no índice (`api/index.py:2496-2504`).
  É a instrução que o dono vai seguir para os 2 PDFs pendentes — e ela manda não fazer o que agora funciona.
- `PROJECT.md:208` diz "12 arquivos de teste do backend"; há 18 (`tests/*.py`). Diz "6 arquivos" em
  `npm run test:js` (`:210`); há 8 (`tests-js/*.test.ts`).
- `PROJECT.md:246` ainda lista como divergência "`.env.example` não lista `ANYAPI_API_KEY` nem
  `ORCAROUTER_API_KEY`" — já listados em `.env.example:43-44`. A lista de divergências divergiu.
- `README-BACKUP.md:9,48` continua citando AIHubMix, provedor que não existe em
  `api/_app/provedores.py` (lá estão Groq, Nous, NVIDIA, Mistral, AnyAPI, Orca Router, OpenRouter).
- Requisito ausente: nada obriga `PROJECT.md` a acompanhar o código. Um item mínimo no CI
  (`.github/workflows/ci.yml`) que confira as contagens de testes e a lista de provedores já evitaria três
  dos quatro pontos acima.

### G7 (C) "Ver no contexto" não chegou à aba Buscar

- `EvidenceList` (e, dentro dele, `TrechoNoContexto`) aparece em 4 lugares: Aprender (`AprenderTab.tsx:254`),
  Comparar (`CompararTab.tsx:324`), Perguntar/Professor (`PerguntarTab.tsx:469`) e Resolver
  (`ResolverTab.tsx:383`).
- `components/tabs/BuscarTab.tsx` não importa nenhum dos dois: a aba cuja única função é mostrar trechos do
  material é a única sem o botão que abre a página inteira. São 96 linhas; a `/api/buscar` já devolve
  `fonte` e `pagina` (`api/index.py:1046-1052`), que é tudo o que `/api/trecho` precisa.

---

## 4. Melhorias de arquitetura (novas ou reavaliadas)

| # | Melhoria | Destrava | Evidência |
|---|---|---|---|
| M7 | Unidade de cota = chamada ao provedor (contador incremental em vez de 1 por requisição) | Resumo, Comparar, simulado, plano de estudo, qualquer feature multi-chamada | `api/index.py:1645` vs `:1678,1686`; `:2120` vs `:2184` |
| M8 | Política de acesso ao acervo (cota em `/api/trecho`, `pagina` obrigatória, revisão da política `anon` de `select`) | Decidir se o material é público antes de divulgar o app | `api/index.py:1086`; `recriar-banco.sql:93-95`; `api/index.py:971-973` |
| M9 | Estender o padrão NDJSON já existente às rotas longas, em vez de inventar lotes | Comparar, resumo, apostila, Feynman dentro dos 60 s | `api/_app/provedores.py:297` com uso único em `api/index.py:1519` |
| M5′ | (reavaliação) O helper "buscar + montar contexto" ficou mais urgente: 8 pontos, não 6 | L2, cache, busca híbrida | `api/index.py:1041,1462,1585,1793,1924,1968,2042,2129` |

M1 (validar JWT), M2 (filtro na `match_ementas`), M3 (tabela de eventos), M4 (prompt parametrizado) e
M6 (exportação genérica) seguem válidos e intocados — ver seção 5.

---

## 5. Lacunas anteriores ainda abertas (uma linha cada, com a evidência reconferida hoje)

| Ref. | Estado em 20/09 | Evidência reconferida |
|---|---|---|
| L2 filtro por apostila | Aberta | `match_ementas(query_embedding, match_count)` sem parâmetro de fonte (`recriar-banco.sql:31-54`); `buscar_chunks` manda só os dois (`api/index.py:624-632`) |
| L3 persistência do que o aluno produz | Aberta e agravada | ver G3; `useHistorico` em 5 abas, nenhuma de estudo |
| L5 glossário sem fonte/página | Aberta | `glossario_termos(termo, explicacao, exemplo, origem)` — nenhuma coluna de fonte ou página (`recriar-banco.sql:75-83`) |
| L6 feedback e métricas | Aberta | `pouco_embasado` calculado em 4 rotas (`api/index.py:1479,1807,2088,2199`) e descartado; nenhuma rota `/api/feedback` |
| L7 papéis (professor/turma) | Aberta | nenhuma rota lê o JWT do aluno; só `exigir_admin` |
| L8 gestão do acervo | Parcial | envio direto existe (`:2633-2678`); **não** há rota de excluir nem de renomear documento (lista completa de rotas conferida); OCR só no navegador (`lib/ocr.ts`) |
| L9 resumo efêmero | Aberta | "Não escreve nada no Supabase" (`api/index.py:1639-1640`) |
| L10 cota visível ao aluno | Aberta | cota só no backend; `/api/config` não devolve consumo (`:955-978`) |
| M4 prompt fixo "Engenharia de Prompt" | Aberta | 10+ ocorrências em `api/_app/prompts.py:5,14,24,45,52,59,75,83,93,102` — acervo continua Empreendedorismo/Gerenciais/Python (`PROJECT.md:236-240`) |

O descompasso de escopo apontado em 19/09 (plataforma de estudo x assistentes de comunicação/suporte, que
não usam RAG e dividem a mesma cota) continua igual: `api/index.py:1149-1380` são as rotas de Perfis, Elenco,
Fale o que pensa e Suporte, todas com `_limitar_llm` e nenhuma com `buscar_chunks`.

---

## 6. Prioridade sugerida (só o que é novo desta rodada)

| Ordem | O quê | Lacuna | Esforço | Por que agora |
|---|---|---|---|---|
| 1 | Decidir e aplicar a política de acesso ao acervo (`/api/trecho` com cota e `pagina` obrigatória) | G1/G2 | Baixo | É o ativo do produto, e hoje sai sem freio; a decisão precede qualquer divulgação |
| 2 | Persistir a conversa (`useHistorico('perguntar')`) e parar de remontar por `key` no Professor | G3 | Baixo | A feature nova perde o próprio valor a cada F5 e a cada troca de persona |
| 3 | Cota por chamada ao provedor | G5 | Médio | Pré-requisito das pendências 1 e 3 do `MEMORY.md` e de qualquer feature multi-chamada |
| 4 | Streaming nas rotas longas (padrão NDJSON já pronto) | G4 | Médio | Transporte e leitor já existem e já têm teste |
| 5 | "Ver no contexto" na aba Buscar | G7 | Muito baixo | 96 linhas; a rota já devolve fonte e página |
| 6 | Acertar `PROJECT.md:236` e as contagens antes da próxima sessão de operação | G6 | Muito baixo | A instrução errada é a que o dono vai executar nos 2 PDFs pendentes |

As candidatas de 19/09 que continuam de pé (biblioteca com filtro por apostila, "meu progresso", botão
"útil/não útil", flashcards, plano de estudo, OCR na ingestão, painel do professor, medidor de cota) não são
repetidas aqui — nenhuma delas saiu do papel, e a ordem proposta lá segue válida depois destes seis itens.

## 7. Limites desta análise

- Não executei o app, não abri o navegador e não consultei o Supabase de produção. G1 e G2 são leitura de
  código e de SQL: descrevem o que o código permite, não uma exploração observada. O estado do acervo vem de
  `PROJECT.md` (conferido em 18/09 pelo próprio documento) e não foi reverificado.
- Li por inteiro `app/page.tsx`, `ProfessorTab.tsx`, `TabPanel.tsx`, `supabase-backup/recriar-banco.sql` e as
  seções de `api/index.py` ligadas a busca, trecho, perguntar/stream, resumo, status/config, upload e cota.
  Não li todos os componentes de aba; as afirmações sobre quem usa `EvidenceList`, `useHistorico` e
  `localStorage` vêm de busca em `components/`, `lib/` e `app/`.
- Prioridades e esforços são estimativas minhas, não medidas.

## Nota

NOTA: 7/10. O que foi corrigido de 19/09 está bem feito e bem testado (conversa contínua com o embedding
reescrito é a parte difícil, e está certa), mas a rodada não tocou em nenhuma das lacunas estruturais de
produto — acervo sem política de acesso, nada do que o aluno produz persiste (nem a conversa nova), sem
filtro por apostila, sem feedback, sem documento de requisitos — e a documentação operacional regrediu
para desatualizada no ponto em que o dono vai agir.
