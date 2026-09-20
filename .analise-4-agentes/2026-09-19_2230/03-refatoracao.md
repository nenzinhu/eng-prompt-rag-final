# 03 — Refatoração (duplicação, funções grandes, nomes, eficiência, legibilidade)

Agente REFATORAÇÃO · 2026-09-19 · somente leitura, nada do projeto foi alterado.
Escopo: só estrutura e qualidade do código. Bugs e segurança ficam com os outros agentes; aqui só aparecem como "risco de refatorar".

Método: leitura integral de `api/index.py` (2269 linhas), leitura de `api/_app/http_util.py`, `provedores.py` (linhas 150-384), `documentos.py` (40-579), de `lib/api.ts`, `lib/useRequisicao.ts`, `lib/useProviderModel.ts`, `app/page.tsx`, `components/TabPanel.tsx` e das abas Perfis, Elenco, Perguntar (1-200), Pdfs (28-357), Resolver (92-175), Suporte (60-200), Fale (60-140). Contagens com grep. `ruff --select F,E741` rodado em `api/`. Não rodei testes nem o build.

Uma nota antes: a base é coerente e bem comentada, `ruff F` não achou import morto, e há 141 testes. Os achados abaixo são de tamanho e repetição, não de descuido.

---

## 1. Resumo por prioridade

| # | Achado | Ganho | Risco | Onde |
|---|--------|-------|-------|------|
| R1 | Quebrar `api/index.py` (2269 linhas) em módulos + `APIRouter` | legibilidade alta | médio (testes fazem monkeypatch em `index`) | seção 2 |
| R2 | Helper único "embedding + busca + 400 se vazio" e "evidência → dict" | -60 linhas, 1 lugar p/ mudar | baixo | seção 3.1 |
| R3 | Base `LlmReq` e função única para as 4 rotas de persona | -80 linhas | baixo | seção 3.2 |
| R4 | Front: extrair componentes das abas de persona (Elenco/Perfis/Fale/Suporte) | -500 linhas | baixo/médio | seção 4.1 |
| R5 | Front: `lib/api.ts` repete o parse de erro 3 vezes | -25 linhas | baixo | seção 4.3 |
| R6 | Eficiência: `_limitar_llm` faz até 3 chamadas em série; `auditar` faz N buscas em série | latência | médio | seção 6 |
| R7 | `_markdown_para_pdf` tem 226 linhas com 5 funções aninhadas | legibilidade | baixo | seção 5 |
| R8 | Helpers de localStorage repetidos em 6 arquivos | -60 linhas | baixo | seção 4.4 |

---

## 2. `api/index.py` — o monólito (R1)

O arquivo mistura 6 responsabilidades. Mapa por faixa de linhas:

| Faixa | Conteúdo | Linhas aprox. |
|-------|----------|---------------|
| 19-200 | imports, env, limites de upload, `app` + CORS | 180 |
| 203-243 | `falha_inesperada` (handler global) | 40 |
| 249-378 | config do Supabase, cabeçalhos, sessão HMAC, `exigir_admin` | 130 |
| 385-471 | limite de uso (memória + `consumir_cota`) | 90 |
| 476-750 | cliente Supabase: embeddings, chunks, Storage, glossário | 275 |
| 758-1810 | rotas de estudo/IA (13 rotas + 12 modelos Pydantic) | ~1050 |
| 1815-2269 | ingestão, upload, envio direto, duplicatas, pdfs | ~455 |

Proposta de layout (tudo dentro de `api/_app/`, ver risco 2 abaixo):

```
api/index.py            app + CORS + exception handler + include_router   (~60 linhas)
api/_app/config.py      env e limites (hoje index.py:112-190)
api/_app/auth.py        sessão e exigir_admin (294-378) + rotas /api/admin/*
api/_app/limites.py     _ip_cliente, _limitar_llm, _limitar_em_memoria (393-471)
api/_app/supabase.py    headers + embeddings/chunks/storage/glossário (249-291, 476-750)
api/_app/rotas/estudo.py     buscar, perguntar(+stream), simplificar, verificar, aprender, auditar, resolver, comparar, glossario
api/_app/rotas/personas.py   perfil-comportamental, elenco, fale, suporte
api/_app/rotas/apostila.py   gerar-apostila, resumir-apostila
api/_app/rotas/admin.py      ingerir, upload, envio direto, duplicatas, pdfs
```

**Riscos de refatorar (verificados):**

1. Os testes fazem `monkeypatch.setattr(index, "<nome>", ...)` em 11 arquivos, por exemplo `tests/test_envio_direto.py:60-66` (`listar_arquivos_storage`, `baixar_documento_storage`, `upload_documento_storage`, `_risco_de_perda`...), `tests/test_aprender.py:38-40` (`chamar_llm`, `gerar_embeddings`, `buscar_chunks`), `tests/test_admin_auth.py:22-24` (`ADMIN_USER`, `ADMIN_PASS`, `ADMIN_TOKEN`). Um `re-export` em `index` NÃO faz o patch valer, porque o código que roda passa a ler o nome do outro módulo. Cada teste precisa apontar para o módulo novo. É mecânico, mas é a maior parte do esforço. Fazer em etapas, um módulo por vez, rodando `pytest` a cada passo.
2. `vercel.json` empacota só `api/{rag_core.py,_app/**}` (`includeFiles`). Módulo novo fora de `api/_app/` não entra no bundle e quebra em produção sem quebrar local. Por isso o layout acima fica todo em `_app/`.
3. `api/index.py:43` faz `sys.path.insert` para importar `rag_core` e `_app.*`; os módulos novos herdam isso sem mudança. Só cuidar para que subpasta nova (`_app/rotas/`) tenha `__init__.py`, como `_app/__init__.py` (existe, vazio).
4. Estado global de módulo que hoje mora no arquivo: `_uso_por_ip` (385), `_cache_status` (755). Devem ficar cada um em um único módulo dono (limites.py e a rota de status).

---

## 3. Duplicação no backend

### 3.1 Recuperação de contexto e serialização de evidência (R2)

Sequência "gerar embedding da pergunta → `buscar_chunks` → `400 Banco vetorial vazio`" repetida em 6 rotas: `index.py:869-872` (buscar), `1134-1137` (`_preparar_pergunta`), `1430-1433` (aprender/explicar), `1583-1589` (glossário), `1653-1656` (resolver), `1740-1743` (comparar). A mensagem `"Banco vetorial vazio — ingira os PDFs primeiro."` existe 6 vezes. A `gerar_apostila` (1245-1250) usa a mesma sequência mas tolera vazio de propósito.

Sugestão: `async def recuperar(texto: str, n: int, *, exigir: bool = True) -> list[dict]` em `supabase.py`. Cada rota vira uma linha.

O dict `{"conteudo": c["content"], "fonte": c["source"], "pagina": c["page"], "relevancia": round(c["similarity"], 3)}` aparece escrito à mão em `875-880`, `1146`, `1442`, `1809`, e uma variante sem `relevancia` em `1702`. Sugestão: `_evidencia(c, com_relevancia=True)`. Também `contexto_para_texto([e.model_dump() for e in req.contexto])` está em `1364`, `1387`, `1470`.

### 3.2 Rotas de persona e modelos de request (R3)

`perfil_comportamental` (908-931), `elenco_conversa` (960-983), `fale_o_que_pensa` (1015-1045) e `suporte_atendimento` (1081-1113) têm o mesmo esqueleto: limitar, validar entrada, buscar persona no dicionário (400 se não existe), `resolver_modelo`, montar `system_prompt = BASE + "\n\nPERSONA ATIVA — ...:\n" + prompt_modifier`, montar `user_prompt`, `chamar_llm`, devolver `{resposta, persona_id, provider, modelo}`. Só mudam o rótulo e o `user_prompt`. Os 4 endpoints de listagem (`886-897`, `934-949`, `986-998`, `1048-1065`) são compreensões de dicionário quase iguais.

Sugestão: `executar_persona(req, catalogo, base, rotulo, montar_user_prompt)`. Só o `user_prompt` e os campos extras (`usou_historico`, `separar_secoes_fale`) ficam em cada rota.

O par `provider: str = "nous"` + `modelo: Optional[str] = None` está copiado em 12 modelos Pydantic (grep de `provider: str = "nous"`). Uma `class LlmReq(BaseModel)` base elimina isso e deixa o "nous" como padrão num lugar só.

### 3.3 Outros

- `provedores.py`: `chamar_llm` (225-232) e `chamar_llm_stream` (297-305) montam o mesmo corpo `{model, messages, temperature: 0.3}` e os mesmos cabeçalhos; a mensagem de 504 "não respondeu em Ns" está duplicada em `245-249` e `342-346`. `_MOTIVOS_DE_CORTE` é definido em `353`, DEPOIS da função que o usa (`340`): funciona em runtime, mas atrapalha a leitura. Mover para cima.
- `index.py:266-287`: `_h_leitura`, `_h_escrita`, `_h_documentos` montam o mesmo dicionário `{"Authorization": f"Bearer {chave}", "apikey": chave}`; só muda qual chave. Uma `_cabecalhos(chave)` cobre as três.
- `index.py:1858` e `1917-1918` calculam `chars_novos = sum(len(l["texto"]) for l in linhas)` e a "perda %" (`1871`, `1887`, `1929-1930`, `1948`) com a mesma conta. Uma função `perda_percentual(novos, existentes)` e uma `chars_das_linhas(linhas)`.
- Regra dos "60%/40%": `QUEDA_MAXIMA_TEXTO` é comparada com a mesma expressão em `1870` e `1928`. Extrair `_perdeu_muito(novos, existentes)`.

---

## 4. Frontend

### 4.1 Abas de persona: quatro cópias do mesmo componente (R4)

`components/tabs/ElencoTab.tsx` (233 linhas) e `PerfisComportamentaisTab.tsx` (228 linhas) são praticamente o mesmo arquivo. Diferem em: ícone, textos, qual método de `api.*` chamam e o rótulo do botão. `FaleOQuePensaTab.tsx` (288) e `SuporteTab.tsx` (332) seguem a mesma estrutura com mais campos.

Blocos idênticos, com onde estão:

| Bloco | Ocorrências |
|-------|-------------|
| Grade de cartões de persona (`aria-pressed`, classes `border-violet/40 bg-violet/[0.08]`) | Elenco 83-101, Perfis 80-98, Fale 93-116, Suporte 168-196 |
| `copiar()` com `navigator.clipboard` + timeout de 2 s | Elenco 63-72, Perfis 61-70, Fale 75-85, Suporte 132-141 |
| Efeito que busca personas, cai no padrão e corrige o id | Elenco 38-51, Perfis 38-51, Suporte 86-97, Fale 52-63 (formato equivalente) |
| Bloco loading → erro → resposta → vazio (spinner, caixa rosa, cabeçalho "pronta para envio" com botão Copiar) | Elenco 163-201, Perfis 158-196 |
| "Histórico recente" com botão Limpar | Elenco 203-230, Perfis 198-225 |
| Botão "Limpar" com os mesmos 5 resets | Elenco 149-160, Perfis 144-155 |

Componentes e hooks sugeridos (em `components/` e `lib/`):

- `useCopiar()` → `{ copiado, copiar(texto) }`.
- `<SeletorPersona itens icone ativo onEscolher />` (o Suporte precisa aceitar `nome`/`exemplo`; um `renderItem` opcional resolve).
- `usePersonas(carregar, padrao)` → cuida do fetch, do fallback e da correção do id selecionado.
- `<PainelResposta carregando erro resposta vazioIcone textoCarregando titulo />`.
- `<HistoricoRecente itens onEscolher onLimpar />`.

Depois disso, `ElencoTab` e `PerfisComportamentaisTab` viram dois arquivos de ~80 linhas, ou um só componente parametrizado por configuração.

Repetição de estilo, medida por grep:
- caixa de erro rosa (`border-rose-400/25`) escrita à mão em 12 arquivos de aba;
- spinner (`animate-spin`) em 14 arquivos (4 vezes só em `PerguntarTab`);
- `<textarea className="glass ... font-mono text-[0.82rem] ...">` em 9 abas.
Um `<ErroBox>`, um `<Spinner>` e um `<CaixaTexto>` reduzem isso e deixam o visual mudar em um lugar.

### 4.2 `useRequisicao` existe mas quase ninguém usa

`lib/useRequisicao.ts:5-12` diz que "as abas repetiam o mesmo bloco" e que o hook o concentra. Só 4 arquivos o usam (`BuscarTab`, `ElencoTab`, `FaleOQuePensaTab`, `PerfisComportamentaisTab`). `PerguntarTab`, `ResolverTab`, `SuporteTab`, `AprenderTab` e `GlossarioTab` mantêm `loading`/`erro`/`resultado` como `useState` separados (contagem de `useState(`: Perguntar 13, Resolver 11, Pdfs 11, Suporte 10, Aprender 9, Glossário 8). Exemplo direto: `SuporteTab.tsx:109-130` reimplementa `setLoading(true) → setErro('') → try/catch → finally` que o hook faz. Migrar as abas simples (Suporte, Glossário, Aprender, Resolver `analisar`) ao hook remove ~15 linhas por aba.

### 4.3 `lib/api.ts`

- O trecho "ler corpo como texto → tentar `JSON.parse` → montar `ApiError(mensagemDe(...))`" aparece 3 vezes: `pedir` (75-86), `baixarArquivo` (109-117), `perguntarStream` (162-170). Extrair `lerErro(r): Promise<ApiError>`.
- `perguntarStream` (146-227, ~80 linhas) mistura leitura de NDJSON com regras de erro, usando 5 variáveis mutáveis capturadas por uma closure (`meta`, `bruto`, `pendente`, `terminou`, `erro`). Separar em `lerNdjson(body, aoEvento)` (puro, fácil de testar em `tests-js/api-stream.test.ts`, que já existe) e uma função pequena que decide o resultado final.
- A lista de parâmetros posicionais cresce: `ingerir(arquivo, offset, token, forcar, corteId, ultimoId)` (334) e `suporteAtendimento(ambiente, problema, personaId, historico, provider, modelo)` (294) já têm 6 argumentos posicionais do mesmo tipo (`string`), fácil de trocar a ordem sem o compilador avisar. Objeto de opções nomeado.

### 4.4 Helpers de `localStorage` repetidos (R8)

O `try { localStorage... } catch { /* indisponível */ }` está escrito em 6 lugares: `lib/accuracy.ts:11-34`, `lib/admin.ts:7-23`, `lib/conta.ts:196-213`, `lib/useHistorico.ts:24-52`, `lib/useProviderModel.ts:26-42` (já tem `lerStorage`/`gravarStorage` prontos) e `components/tabs/ApostilaTab.tsx:30-40`. Promover o par de `useProviderModel.ts` a `lib/armazenamento.ts` (`ler`, `gravar`, `remover`, com JSON opcional) e reutilizar.

### 4.5 Abas grandes

- `PdfsTab.tsx` (547 linhas, 11 `useState`): mistura sessão de admin, configuração do servidor, fila de upload, log e ingestão. `enviar()` (245-299) tem 55 linhas e dentro dela o trecho de `260-273` só traduz a resposta do upload em linhas de log. Sugestões: `useAdminSessao()` para `token/valido/verificando/erroToken/entrar/sair` (linhas 41-44, 70-80, 119-140); `registrarResultadoUpload(d, logLine)` como função pura em `lib/`.
- `PerguntarTab.tsx` (443 linhas, 13 `useState`): a checagem `rodadaAtualRef.current === minha` aparece 13 vezes (5 funções, linhas 153-196 e adiante). Um helper `const naRodada = () => ...` criado em cada handler, ou um hook `useRodada()` que devolve `{ iniciar, vale }`, deixa cada handler com uma linha a menos por checagem. Os 4 estados de "verificação" (47-49) e os 2 de "simplificar" são candidatos a um hook `useAcoesSobreResposta`.
- `ResolverTab.tsx` (511 linhas): a regra de dividir texto em questões (`analisarLote`, linhas 109-116, duas regex) é lógica pura dentro de um handler; mover para `lib/texto.ts` permite testar em `tests-js/`.
- `SuporteTab.tsx:168`: `{[areaAtiva].map((bloco) => (` é um laço sobre um array de 1 elemento, ou seja, um `.map` usado como variável local. Trocar por um bloco direto.
- `PdfsTab.tsx:96,222,259` e `ComprimirTab.tsx:31,193,200` e `AnexoImagem.tsx:26,179`: `1024 * 1024` e `(n/1024/1024).toFixed(...)` escritos à mão; `mb()` já existe em `ComprimirTab.tsx:31`. Mover para `lib/texto.ts`.
- `lib/useProviderModel.ts:72`: dependências `[chaves.join(','), providers]`; `providers` sozinho já dispara o efeito, então o `join` é redundante (o `eslint-disable` na linha 71 esconde isso). Há 11 `eslint-disable` no front (Compare, Elenco, Glossário, Perfis, Perguntar, Suporte, AnexoImagem, EvidenceList, TabNav, useProviderModel, useRequisicao): vale rever se alguns viram dependência correta.

---

## 5. Funções grandes (backend)

Medido pelas linhas de início e fim que li:

| Função | Linhas | Tam. | Sugestão |
|--------|--------|------|----------|
| `_markdown_para_pdf` (`documentos.py:342-567`) | 226 | grande | Vira classe `ApostilaPdf` com métodos `capa()`, `sumario()`, `caixa()`, `lista()`, `tabela()`, `secao()`. Hoje são 5 funções aninhadas que capturam `pdf`, `familia`, `preparar`, `corpo_tam`; a classe `Apostila(FPDF)` (355) lê `familia` e `preparar` que só são atribuídas em `381`, depois da definição da classe. Funciona, mas a ordem confunde. |
| `comparar` (`index.py:1724-1812`) | 89 | grande | Extrair `responder` (1748-1788, 41 linhas) como função de módulo `_consultar_modelo(item, user_prompt)` e o bloco final de resposta (1800-1812) numa função. O `dict` de erro em `1752-1760` e o de sucesso em `1780-1788` têm as mesmas 7 chaves. |
| `ingerir` (`1961-2039`) | 79 | grande | 3 fases sem nome: análise (1975-1986), preparação/limpeza de sobras (1988-2015), lote e fechamento (2017-2039). Extrair `_fase_analise`, `_limpar_sobras`, `_gravar_lote`. |
| `_gravar_documento` (`2065-2130`) | 66 | médio | `if igual: ... return` seguido de `elif`/`else` (2108-2126): o `return` torna o `elif` desnecessário e o fluxo difícil de seguir. Separar em `_renomear_por_conteudo` e `_gravar_novo_ou_versao`. |
| `resumir_apostila` (`1279-1343`) | 65 | médio | Extrair `_amostrar(chunks, teto)` (1309-1313, pura) e `_mapear_pontos` (1317-1326). |
| `resolver` (`1644-1705`) | 62 | médio | Os 6 `resolucao["..."]` copiados um a um para variáveis (1669-1683) são só para aplicar o fallback do texto bruto; `extrair_resolucao` (`rag_core.py:697`) podia devolver já com o fallback. |
| `auditar` (`1514-1569`) | 56 | médio | Extrair o rebaixamento de nível (1545-1555) para `rag_core` como `nivel_da_frase(similaridade, apoio)`: é regra pura, hoje sem teste direto. |
| `glossario` (`1578-1629`) | 52 | médio | Loop de retentativa com orçamento de tempo (1602-1614) merece função própria `_extrair_termos_com_retentativa`. |
| `falha_inesperada` (`203-243`) | 41 | ok | Quebrar em `_descrever_falha(exc) -> (detalhe, dica)` para poder testar sem subir o app. |

Lógica pura que está em `index.py` e combina com `rag_core.py` (o próprio `index.py:16-17` diz que `rag_core` é o lugar da parte testável, sem I/O; `extrair_termos_glossario` e `extrair_resolucao` já foram para lá):
- `_lista_de_textos` (`1459-1462`), `_bloco_interesses` (`1211-1225`), `preparar_linhas` (`1821-1827`);
- o parse do JSON de `verificar` (`1397-1406`) e a normalização da avaliação Feynman (`1480-1505`, 26 linhas com `isinstance` em cascata). Este último é o mais próximo do padrão de `extrair_resolucao`: uma `extrair_avaliacao_feynman(bruto)` em `rag_core` com testes.

---

## 6. Ganhos de eficiência (só o que o código mostra)

Todos são sugestões; nenhum foi medido por mim.

1. **`_limitar_llm` em série** (`index.py:442-458`): para cada requisição de IA, até 3 chamadas HTTP seguidas ao Supabase (`ip-min`, `ip-dia`, `global-dia`), cada uma com timeout de 5 s. Isso soma latência antes de qualquer trabalho útil, em 16 rotas. Duas saídas: uma função SQL que receba as 3 chaves e devolva o veredito numa ida só, ou `asyncio.gather`. Atenção: em série, um `ip-min` negado NÃO consome a cota global (o `raise` na 458 sai antes); em paralelo consumiria. Isso é regra de negócio, decidir antes.
2. **`auditar` em série** (`index.py:1540-1543`): `buscar_chunks` por frase, uma após a outra. Numa resposta de 15 frases são 15 idas ao Supabase em fila. `asyncio.gather` com `asyncio.Semaphore(4)` corta o tempo total sem estourar o limite do banco. A mesma ideia vale para `gerar_embeddings` (`507-513`): lotes de 4 (`EMBEDDINGS_LOTE`, 476) em série, então um lote de ingestão de 24 trechos são 6 chamadas seguidas. O comentário em `476` registra que a Edge Function já estourou recurso com 8 trechos, então paralelizar com no máximo 2-3 e medir.
3. **`ingerir` refaz trabalho a cada lote** (`index.py:1988-1989`): baixa o documento inteiro do Storage e reextrai todas as páginas a cada chamada, para usar só `linhas[offset:offset+24]`. O comentário `1970-1974` já corta a ANÁLISE nos lotes seguintes, mas o download e a extração continuam. Em 123 páginas são ~6 repetições. Opções: cachear `linhas` por (arquivo, md5) em memória da instância (serverless: ajuda só quando a mesma instância atende os lotes seguidos, então é ganho oportunista), ou devolver ao cliente um marcador. Também `maior_id_da_fonte` roda depois de cada lote não final (`2038`).
4. **`medir_indice_atual`** (`537-566`): baixa a coluna `content` inteira (páginas de 1000) só para somar `len()`. Uma função SQL que devolva `count(*)` e `sum(length(content))` transfere 2 números. É usada em `_analisar_ingestao` (1856) e `_risco_de_perda` (1911). Exige migração SQL nova, então é médio esforço.
5. **`_analisar_ingestao`** (`1839`) lista o bucket inteiro (`listar_documentos_storage`) só para checar se um arquivo existe, e o front chama a prévia arquivo por arquivo em sequência (`PdfsTab.tsx:154-163`), cada uma com lista + download + extração + medição. Com N documentos, N listagens iguais.
6. **Front**: `useProviderModel` grava no `localStorage` em 2 efeitos separados (`89-95`) a cada mudança e é instanciado em cada aba montada; custo baixo, mas o `[chaves.join(','), providers]` (72) recalcula uma `join` por render. Sem ganho relevante, só ruído.

---

## 7. Nomes

Só os que dificultam leitura, com o que eu proporia:

| Atual | Onde | Problema | Sugestão |
|-------|------|----------|----------|
| `l` | `index.py:1406, 1858, 1918, 2019, 2022`; `rag_core.py:656-659` | `ruff E741` confirma 8 ocorrências; `l` parece `1`. Em 2019/2022 `l` é um trecho, não uma linha. | `linha`, `trecho` |
| `preparar_linhas` | `index.py:1821` | devolve trechos (chunks) com página, não "linhas de texto"; no resto do arquivo `linhas` também significa linhas de texto (`1858`) | `preparar_trechos` |
| `_h_leitura/_h_escrita/_h_documentos` | `266-287` | letra solta `h` | `cabecalhos_leitura` etc. |
| `_http`, `_TIMEOUT` | `http_util.py:20,59` | `_http` é uma fábrica de contexto, mas parece um cliente; `_TIMEOUT` é importado de fora do módulo apesar do `_` | `cliente_http(timeout)`, `TIMEOUT_PADRAO` |
| `status`, `upload`, `pdfs`, `buscar`, `glossario`, `resolver` | funções de rota | nomes genéricos (`status` costuma colidir com `fastapi.status`; `resolver` lembra `resolver_modelo`) | prefixo `rota_` ou `api_` |
| `_cache_status["em"]` | `755` | `em` de quê | `atualizado_em` |
| `resposta` (dict de retorno) | `1620` no glossário, contra `resposta` (texto) no resto | mesmo nome, dois tipos | `payload` |
| `n2`, `n3` | `documentos.py:524` | contadores de seção | `contador_h2`, `contador_h3` |
| `dado` | `documentos.py:525` | ora `str`, ora `list`, ora `tuple` (por isso os `# type: ignore` de 559, 561, 566) | `blocos` como `NamedTuple(tipo, conteudo)` ou classes por tipo tiram os `type: ignore` |
| Mistura de idiomas | `Req`/`Resp` (front `types.ts`), `perguntar`/`ingerir` vs `status`/`upload`/`config_publica` | convenção implícita: domínio em português, infraestrutura em inglês | documentar a regra ou uniformizar |

---

## 8. Ordem sugerida de execução

1. Baratos e seguros, sem mexer em teste: R2 (`recuperar`, `_evidencia`), R3 (`LlmReq`), R5, R8, nomes `l`, `_MOTIVOS_DE_CORTE` para cima, `[areaAtiva].map`.
2. Front R4 (`useCopiar`, `PainelResposta`, `HistoricoRecente`, `SeletorPersona`) migrando primeiro Elenco e Perfis (as mais idênticas) e conferindo com `npm test`/`tests-js`.
3. Mover puros de `index.py` para `rag_core.py` com teste novo (`extrair_avaliacao_feynman`, `nivel_da_frase`).
4. R1, um módulo por vez (começar pelos de menor acoplamento com os testes: `limites`, `config`), atualizando os `monkeypatch` do módulo movido no mesmo commit.
5. Eficiência (seção 6): itens 1 e 2 primeiro, depois de decidir a regra do item 1; itens 3 e 4 só com medição.

## 9. O que NÃO consegui verificar

- Não rodei `pytest`, `tsc` nem o build; então não sei se a refatoração proposta quebra algo além do que os `monkeypatch` que li.
- Não li por inteiro `AprenderTab`, `CompararTab`, `GlossarioTab`, `ApostilaTab`, `ComprimirTab`, `Conta.tsx`, `AnexoImagem.tsx`, `rag_core.py` (só a lista de funções) nem `prompts.py` (só a estrutura; 965 linhas de dados, sem lógica). A contagem de "abas que repetem o padrão" vem de grep, não de leitura de todas.
- Os ganhos de eficiência da seção 6 vêm de leitura de código, sem medição de latência.
- `supabase-backup/` e `scripts/` estão fora do que li.
