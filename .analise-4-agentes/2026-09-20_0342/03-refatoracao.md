# 03 — Refatoração (duplicação, funções grandes, nomes, eficiência, legibilidade)

Agente REFATORAÇÃO · 2026-09-20 03:42 · **somente leitura** — nada do projeto foi alterado.
Escopo: estrutura e qualidade do código. Bugs, segurança e ideias ficam com os outros agentes.

**Método.** Leitura de `api/index.py` (2700 linhas, por faixas), `api/_app/provedores.py` (180-412),
`api/_app/documentos.py` (411-460 + mapa de funções), `api/rag_core.py` (mapa + trechos),
`vercel.json`, `tests/` (19 arquivos, 304 testes coletados por `pytest --collect-only`) e do front
por grep + leitura pontual. Tamanhos de função medidos com `ast` (não por estimativa).
`ruff --select F,E741` rodado em `api/`. Não rodei `pytest`, `tsc` nem o build.

Base: relatório `.analise-4-agentes/2026-09-19_2230/03-refatoracao.md`. Cada item abaixo foi
**reconferido no código de hoje**; a seção 1 diz o que saiu e o que ficou.

---

## 1. Placar do relatório de 19/09 — o que foi resolvido

### Resolvido (verificado)

| Item de 19/09 | Situação hoje |
|---|---|
| `provedores.py`: validação de provedor/chave/timeout repetida em `chamar_llm` e `chamar_llm_stream` | **Resolvido.** Extraída para `_preparar_chamada` (`provedores.py:189-203`), usada nas duas (`244`, `316`). Também nasceram `_espera_retentativa` (206) e `_conteudo_da_resposta` (216). |
| `ResolverTab`: regra de dividir texto em questões dentro do handler | **Resolvido.** Virou `dividirQuestoes` + `SEPARADOR_QUESTAO` em `lib/texto.ts:67-92`, importados em `ResolverTab.tsx:15`. |
| `EvidenceList` com `eslint-disable` | **Resolvido** (some da lista; restam 10 arquivos, antes 11). |
| Hash de IP / consumo de cota repetidos | **Resolvido** (fora do meu escopo original, mas confirmo): `_hash_ip` (`index.py:462`) e `_consumir_cota` (`471`) são únicos e servem `_limitar_llm` (492) e `_limitar_login` (529). |

### Não resolvido — continua igual (com as linhas de hoje)

| Item | Evidência hoje |
|---|---|
| **R1** monólito `api/index.py` | 2269 → **2700 linhas**; 35 decoradores `@app.get/@app.post`; 22 `class ...(BaseModel)`. Piorou. |
| **R2** `"Banco vetorial vazio — ingira os PDFs primeiro."` | 6 cópias: `index.py:1043, 1464, 1795, 1970, 2044, 2131`. |
| **R2** dict de evidência escrito à mão | `index.py:1050, 1476, 1804, 2202` (+ variante sem `relevancia` em `2091`). |
| **R2** `contexto_para_texto([e.model_dump() for e in req.contexto])` | `1726, 1749, 1832`. |
| **R3** 4 rotas de persona com o mesmo esqueleto | `perfil_comportamental` 1172-1194, `elenco_conversa` 1224-1246, `fale_o_que_pensa` 1279-1308, `suporte_atendimento` 1345-1379. |
| **R3** `provider: str = "nous"` + `modelo: Optional[str]` | **12 modelos Pydantic**, número idêntico ao de ontem. |
| `_h_leitura`/`_h_escrita`/`_h_documentos` montam o mesmo dict | `index.py:299-320` (`_h_escrita` e `_h_documentos` diferem só na escolha da chave). |
| **R5** parse de erro 3× em `lib/api.ts` | `api.ts:95-99` (`pedir`), `150-154` (`baixarArquivo`), `200-204` (`perguntarStream`). |
| **R4** abas de persona duplicadas | `ElencoTab.tsx` (233) vs `PerfisComportamentaisTab.tsx` (228): `diff` das 240 primeiras linhas devolve só 140 linhas de diferença somando os dois lados. `navigator.clipboard` copiado em 4 arquivos. |
| **R4** caixa de erro rosa / spinner à mão | `border-rose-400/25` em **12** abas; `animate-spin` em **14** arquivos. |
| **R4/4.2** `useRequisicao` subusado | ainda só 4 arquivos (`Buscar`, `Elenco`, `Fale`, `Perfis`). `PerguntarTab` 13 `useState`, `PdfsTab` 12, `ResolverTab` 11, `Suporte` 10, `Glossário` 9, `Aprender` 9. |
| **R8** `localStorage` em try/catch solto | 6 arquivos: `lib/accuracy.ts`, `lib/admin.ts`, `lib/conta.ts`, `lib/useHistorico.ts`, `lib/useProviderModel.ts`, `components/tabs/ApostilaTab.tsx`. |
| **R6** `_limitar_llm` em série | `index.py:509-524`: `for chave, limite, janela, mensagem in cotas:` com `await _consumir_cota` dentro — 3 idas ao Supabase por requisição de IA. |
| **R6** `auditar` busca por frase em série | `index.py:1920-1923`: `for frase, emb in zip(...)` com `await buscar_chunks` dentro. |
| **R6** `EMBEDDINGS_LOTE = 4` em série | `index.py:584` + laço em `gerar_embeddings` (615). |
| **R6** `ingerir` rebaixa o documento a cada lote | `index.py:2381-2382`: `baixar_documento_storage` + `preparar_linhas(extrair_paginas(...))` fora do `if req.offset == 0`. |
| **R6** `medir_indice_atual` pagina `content` só para somar `len()` | `index.py:645-676` (`Range: n-n+999`). |
| **R7** `_markdown_para_pdf` | 226 linhas exatas (`documentos.py:411-636`); `class Apostila(FPDF)` (423) continua lendo `familia`/`preparar` atribuídos só em `453`. |
| `_MOTIVOS_DE_CORTE` definido depois do uso | uso em `provedores.py:367-368`, definição em `381`. |
| 504 "não respondeu em Ns" duplicado | `provedores.py:275` e `372`. |
| corpo `{model, messages, temperature: 0.3}` duplicado | `provedores.py:255-260` e `326-333`. |
| conta de perda de texto duplicada | `index.py:2251` vs `2311` (`sum(len(l["texto"]) for l in linhas)`); `2264` vs `2322`; `2279-2280` vs `2341-2342` — mesma expressão de percentual, 4 vezes. |
| `ruff E741` (`l`) | **8 ocorrências, as mesmas 8**: `index.py:1768, 2251, 2311, 2412, 2415`; `rag_core.py:668, 669, 671`. |
| `preparar_linhas` devolve trechos, não linhas | `index.py:2214`. |
| `_cache_status["em"]` | `index.py:901, 909`. |
| `[areaAtiva].map(...)` sobre array de 1 item | `SuporteTab.tsx:168`. |
| `[chaves.join(','), providers]` | `lib/useProviderModel.ts:72`. |
| `1024 * 1024` à mão | `AnexoImagem.tsx:26,197`, `ComprimirTab.tsx:34,207,214`, `PdfsTab.tsx:105,106,255,292`. |

Resumo honesto: das 8 linhas do quadro de prioridades de ontem (R1-R8), **nenhuma foi atacada**.
O que saiu foi um subitem de 3.3 (provedores) e um de 4.5 (`dividirQuestoes`) — ambos como efeito
colateral de correções de bug, não de refatoração. `ruff F` continua limpo.

---

## 2. Achados novos (do código que cresceu nas últimas correções)

### N1 — `tempo_restante_llm` foi adicionado e aplicado em 5 de 14 chamadas ao modelo

`tempo_restante_llm` (`index.py:225-233`) existe para o modelo não estourar o orçamento da função.
Mas só 5 dos 14 pontos que chamam o provedor o usam: `1492` (perguntar), `1511` (stream), `1608`
(gerar_apostila), `1988` (glossário), `2137` (comparar). Ficaram com o `TIMEOUT_LLM` fixo:
as 4 rotas de persona (`1188`, `1240`, `1302`, `1369`), `simplificar` (`1728`), `verificar`
(`1752`), `aprender/explicar` (`1799`), `aprender/avaliar` (`1835`), `resolver` (`2049`) e as duas
chamadas de `resumir_apostila` (`1670`, `1685`).

Isto não é "esqueceram um": é o sintoma de um parâmetro opcional que precisa ser lembrado em cada
sítio. Refatoração que resolve de vez: um helper único no `index.py` —
`async def chamar(request, provider, modelo, system, user)` que já injeta
`timeout=tempo_restante_llm(request)` — e trocar as 14 chamadas por ele. Efeito colateral bom: com
o helper, mudar a política de orçamento passa a ser uma edição só.
Risco: `tests/test_tetos_e_tempo.py` e outros fazem `monkeypatch.setattr(index, "chamar_llm", ...)`
(10 ocorrências no total) — o patch continua valendo se o helper chamar `chamar_llm` pelo nome do
módulo `index`, mas **não** se ele importar a função para dentro de si.

### N2 — `_limitar_llm` chamado à mão em 16 rotas, em vez de `Depends`

`await _limitar_llm(request)` é a primeira linha de 16 rotas (`index.py:1036, 1173, 1225, 1292,
1346, 1456, 1575, 1644, 1725, 1748, 1791, 1831, 1896, 1961, 2034, 2121`), enquanto as rotas de admin
já usam `Depends(exigir_admin)` (`2349, 2355, 2568, 2634, 2657, 2681, 2693`). `Depends(_limitar_llm)`
tiraria a linha repetida e, mais importante, tornaria impossível esquecer numa rota nova.

**Ressalva que impede a troca cega:** em 2 rotas o limite vem DEPOIS da validação de propósito —
`fale_o_que_pensa` valida rascunho e tamanho em `1280-1291` e só então limita (`1292`), e
`aprender_avaliar` valida em `1829` antes de limitar (`1831`). Isso evita queimar cota com entrada
inválida. `Depends` roda antes do corpo, então essas duas mudariam de comportamento. Ou se aceita a
mudança (é defensável: o pedido inválido também custa uma requisição) ou essas duas ficam manuais e
documentadas. Decidir antes de mexer.

### N3 — `extrair_bloco_json` + `json.loads` + `except JSONDecodeError` repetido 4 vezes

`index.py:1760-1765` (verificar) e `1851-1855` (aprender/avaliar) repetem o mesmo bloco que
`rag_core.py:690` e `739` já fazem. Um `def carregar_json(bruto) -> dict | None` em `rag_core`
(puro, testável em `tests/test_rag_core.py`) cobre os quatro.

Na mesma linha, a normalização da avaliação Feynman (`index.py:1843-1874`, 32 linhas de
`isinstance` em cascata + `_lista_de_textos` em `1821`) é lógica pura dentro de uma rota — é o
gêmeo exato de `extrair_resolucao`, que já mora em `rag_core.py:725`. Uma
`extrair_avaliacao_feynman(bruto)` em `rag_core` encurta a rota para ~12 linhas e ganha teste
direto. Idem o rebaixamento de nível de `auditar` (`index.py:1926-1934`): regra pura
`nivel_da_frase(similaridade, apoio)`, hoje sem teste próprio. Este item já estava em 19/09 e
continua o melhor custo/benefício do backend.

### N4 — funções grandes: medidas de hoje (via `ast`, não estimadas)

| Função | Linhas | Δ vs 19/09 | Onde |
|---|---|---|---|
| `_markdown_para_pdf` | **226** | = | `documentos.py:411-636` |
| `ingerir` | **101** | +22 | `index.py:2355-2455` |
| `comparar` | **93** | +4 | `index.py:2113-2205` |
| `chamar_llm_stream` | **82** | — | `provedores.py:297-378` |
| `_gravar_documento` | **81** | +15 | `index.py:2481-2561` |
| `_blocos_markdown` | **76** | — | `documentos.py:200-275` |
| `resumir_apostila` | **75** | +10 | `index.py:1631-1705` |
| `auditar` | **67** | +11 | `index.py:1884-1950` |
| `_analisar_ingestao` | **62** | — | `index.py:2223-2284` |
| `resolver` | **61** | ≈ | `index.py:2033-2093` |
| `trecho_no_contexto` | **60** | novo | `index.py:1087-1146` |
| `glossario` | **58** | +6 | `index.py:1960-2017` |
| `gerar_apostila` | **57** | — | `index.py:1568-1624` |

As correções engordaram justamente as funções que já eram as maiores. `ingerir` hoje tem 5 fases sem
nome no mesmo corpo: análise condicional (2368-2381), download/extração (2381-2394), corte e
limpeza idempotente (2400-2410), lote (2411-2419), verificação de ids + limpeza final (2421-2444).
`comparar` mantém dois dicts de 7 chaves idênticas (`2140-2148` de erro, `2172-2180` de sucesso) —
um construtor `_resultado_modelo(...)` resolve.

`_gravar_documento` (2481-2561) cresceu 15 linhas mantendo o padrão apontado ontem: `if igual: ...
return` seguido de `elif`/`else`, o que torna o `elif` desnecessário e o fluxo difícil de seguir.

### N5 — `trecho_no_contexto` (novo) já nasceu com duas responsabilidades

`index.py:1087-1146`: monta filtros do PostgREST, faz o HTTP, trata 400/404 **e** agrupa linhas por
página. As duas últimas metades (`1124-1146`) são transformação pura de `list[dict]` → páginas, sem
I/O: cabem em `rag_core` como `agrupar_por_pagina(linhas)` com teste próprio.
`_juntar_sem_repetir` (`1060-1084`), ao contrário, está bem: é puro, tem nome e comentário claros —
só está no arquivo errado (é primo de `chunk_texto`, que mora em `rag_core`).

### N6 — front: `PerguntarTab` piorou

482 linhas (era 443), 13 `useState`, e `rodadaAtualRef` aparece **19 vezes** (eram 13). A cada
funcionalidade nova o mesmo guarda-corpo é recopiado. Um hook `useRodada()` devolvendo
`{ iniciar, vale }` transforma cada checagem numa chamada e concentra a regra.
`PdfsTab` está em 587 linhas (era 547) e `ComprimirTab` em 473.

---

## 3. Dividir o monólito — a proposta de ontem continua válida, com os riscos recontados

Layout proposto (inalterado, tudo dentro de `api/_app/`): `config.py`, `auth.py`, `limites.py`,
`supabase.py`, `rotas/{estudo,personas,apostila,admin}.py`, com `api/index.py` reduzido a app +
CORS + exception handler + `include_router`.

**Riscos, com os números de hoje:**

1. **Os testes acoplam ao módulo `index`.** Agora são **13 arquivos** de teste (eram 11) com
   `monkeypatch.setattr(index, ...)`, sobre **31 nomes distintos**. Os mais patchados:
   `chamar_llm` (10×), `gerar_embeddings` (7×), `_limitar_llm` (6×), `ADMIN_TOKEN` (6×),
   `extrair_paginas` (5×), `buscar_chunks` (5×), `baixar_documento_storage` (4×), `SUPABASE_URL`
   (4×). Um re-export em `index` **não** salva o patch: o código que roda passa a ler o nome do
   módulo novo. Cada teste precisa apontar para o módulo de destino — mecânico, mas é a maior parte
   do custo, e a superfície cresceu ~18% desde ontem. Quanto mais se adia, mais caro fica.
2. **`vercel.json`** (lido hoje) empacota `"includeFiles": "api/{rag_core.py,_app/**}"`. Qualquer
   módulo criado fora de `api/_app/` **não entra no bundle**: passa local e quebra em produção, sem
   erro de import na CI. É por isso que todo o layout fica em `_app/`. Se alguém propuser
   `api/rotas/`, é preciso alterar `includeFiles` no mesmo commit.
3. Subpasta nova (`_app/rotas/`) precisa de `__init__.py`, como o `_app/__init__.py` (existe, vazio).
   `api/index.py:43` faz `sys.path.insert` para achar `rag_core` e `_app.*`; os módulos novos herdam.
4. Estado global de módulo: `_uso_por_ip` (`430`), `_logins_por_ip` (`526`), `_cache_status` (`901`).
   Cada um precisa de um único módulo dono, senão dois módulos passam a ter contadores separados —
   que é exatamente o bug que a camada compartilhada de cota existe para evitar.

**Minha recomendação:** dado o tamanho da dívida de teste, o corte grande não é o próximo passo.
Comece pelos módulos de acoplamento mínimo com os `monkeypatch` — `config.py` (env e limites de
upload, `index.py:153-190`) e `limites.py` (`430-583`) — e faça um por commit com `pytest` a cada
passo. As rotas de estudo, que concentram `chamar_llm`/`gerar_embeddings`/`buscar_chunks`, ficam por
último e só depois de N1 e N3 reduzirem o corpo delas.

---

## 4. Eficiência (leitura de código; nada medido por mim)

Repito os 5 itens de ontem porque **todos continuam no código**, com as linhas de hoje, e acrescento
um comentário sobre o que já estava listado como pendência conhecida:

1. **`_limitar_llm` serial** (`509-524`): até 3 POSTs seguidos ao Supabase, timeout de 5 s cada,
   antes de qualquer trabalho útil, em 16 rotas. Saídas: função SQL que recebe as 3 chaves e devolve
   o veredito numa ida, ou `asyncio.gather`. **Atenção (regra de negócio):** em série, um `ip-min`
   negado NÃO consome a cota global (o `raise` em `524` sai antes); em paralelo consumiria. Decidir
   antes de paralelizar.
2. **`auditar` serial** (`1920-1923`): até `MAX_FRASES_AUDITORIA = 60` buscas em fila. `gather` com
   `Semaphore(4)`. O próprio comentário em `1879-1881` já admite o custo.
3. **`gerar_embeddings` em lotes de 4, em série** (`584`, `615`): 24 trechos de ingestão = 6 idas.
   O comentário de `584` registra que a Edge Function estourou com 8 — então paralelizar com no
   máximo 2-3 lotes simultâneos e medir, não aumentar o lote.
4. **`ingerir` rebaixa o PDF a cada lote** (`2381-2382`): o `if req.offset == 0` (2368) já poupa a
   ANÁLISE, mas download + `extrair_paginas` continuam em todo lote. Cache por `(arquivo, md5)` na
   memória da instância é ganho oportunista em serverless.
5. **`medir_indice_atual`** (`645-676`) e **`_analisar_ingestao`** (`2223`) — paginam `content`
   inteiro / listam o bucket todo para checar um arquivo. Exige migração SQL, esforço médio.
6. O **semáforo do resumo de apostila** (`resumir_apostila:1676`, `asyncio.gather` sobre até
   `MAX_CHUNKS_RESUMO` chunks) **já consta no dossiê como pendência conhecida** — não conto como
   achado novo, só confirmo que o `gather` continua sem limite de concorrência.

---

## 5. Nomes — o que ainda vale

Todos os itens da tabela de 19/09 seguem válidos (conferidos: `l`, `preparar_linhas`,
`_h_*`, `_http`/`_TIMEOUT`, `_cache_status["em"]`, `n2`/`n3` e `dado` em `documentos.py`,
`status`/`upload`/`pdfs`/`buscar`/`resolver` genéricos). Acrescento dois:

| Atual | Onde | Problema | Sugestão |
|---|---|---|---|
| `analise` recebendo `None` | `index.py:2366-2381` | `analise = None` no `else` e depois `(analise or {}).get(...)` em `2394`: o nome promete um dict | devolver `{}` ou separar em `_analisar_se_primeiro_lote()` |
| `linha(evento)` (closure) vs `linhas` (trechos) vs `linhas` (linhas de texto) | `index.py:1505` / `2251` / `2381` | três significados de "linha" no mesmo arquivo | `evento_ndjson`, `trechos`, `linhas` |

---

## 6. Ordem sugerida (revista, dado que nada de ontem foi feito)

1. **Baratos, sem tocar em teste:** N1 (helper `chamar`), N3 (`carregar_json`), R2 (`recuperar` +
   `_evidencia`), R3 (`LlmReq` base), `_cabecalhos(chave)`, `perda_percentual`, `_MOTIVOS_DE_CORTE`
   para cima, os 8 `l`, `[areaAtiva].map`.
2. **Puros para `rag_core` com teste novo:** `extrair_avaliacao_feynman`, `nivel_da_frase`,
   `agrupar_por_pagina`, `_juntar_sem_repetir`.
3. **Front:** R5 (`lerErro`), R8 (`lib/armazenamento.ts`), depois `useCopiar` / `PainelResposta` /
   `HistoricoRecente` / `SeletorPersona` migrando Elenco e Perfis primeiro, conferindo com
   `tests-js/`.
4. **N2** (`Depends(_limitar_llm)`), depois de decidir a ressalva das 2 rotas.
5. **R1** (divisão), um módulo por vez, começando por `config.py` e `limites.py`, atualizando os
   `monkeypatch` no mesmo commit.
6. **Eficiência**, itens 1 e 2, depois de decidir a regra de negócio do item 1.

---

## 7. O que NÃO consegui verificar

- Não rodei `pytest` (só `--collect-only`: 304 testes), nem `tsc`, nem o build. Não sei se alguma das
  refatorações propostas quebra além dos `monkeypatch` que li.
- Não li por inteiro `AprenderTab`, `CompararTab`, `GlossarioTab`, `ApostilaTab`, `ComprimirTab`,
  `Conta.tsx`, `AnexoImagem.tsx`, `ProfessorTab.tsx`, `prompts.py` (965 linhas, dados) nem
  `rag_core.py` (mapa de funções + trechos). Contagens de duplicação no front vêm de grep e de um
  `diff` entre Elenco e Perfis, não de leitura integral das 13 abas.
- Os ganhos da seção 4 vêm de leitura, sem medição de latência.
- `supabase-backup/`, `scripts/` e `tests-js/` estão fora do que li.
