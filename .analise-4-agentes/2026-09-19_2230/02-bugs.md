# 02 — Verificação de bugs (2026-09-19)

Escopo: `api/index.py`, `api/rag_core.py`, `api/_app/*`, `lib/*`, `components/`. Somente leitura.
Nada do projeto foi editado. Só escrevi este arquivo e um HTML de teste na pasta temporária (fora do projeto).

## Como verifiquei
- Li por inteiro: `api/index.py`, `api/rag_core.py`, `api/_app/{provedores,http_util,documentos}.py`, `lib/*` (inclui `lib/compress/*`), `components/*` e as abas principais (Perguntar, Resolver, Glossário, Resumo, Apostila, Buscar, Comparar, Aprender, Comprimir, PDFs; Suporte, Elenco, Perfis, Fale e Professor em leitura parcial).
- `pytest -p no:cacheprovider`: **251 testes passam**. `ruff check --no-cache api tests scripts`: limpo. (O dossiê fala em ~141 testes; hoje são 251.)
- Reproduzi por execução (Python, TestClient com funções trocadas por simulações, sem rede e sem gravar no projeto): B-02, B-03, B-05, B-06, B-09b, B-20. Reproduzi em Node: B-04 e B-22.
- **Não consegui rodar** `tsc`, `eslint`, `test:js` nem abrir o app: não há `node_modules` e instalar seria baixar pacotes. Os bugs do front abaixo são de leitura de código. Marquei o grau de certeza em cada um.
- Aviso: existe `.ruff_cache` na raiz, criado às 22:38 (antes das minhas execuções; usei `--no-cache`). Provavelmente é de outro agente. Não mexi.

## Resultado

**Bug CRÍTICO confirmado: nenhum.** Não achei perda de dados, bypass de autenticação nem vazamento de segredo por bug de lógica.
O mais grave é **ALTO**: B-01 (botão "Mostrar trechos da apostila" nunca abre a lista, por leitura de código, não executado).

---

## ALTO

### B-01 — `EvidenceList`: a lista de trechos nunca abre (confirmado por leitura; não executado no navegador)
- **Onde:** `components/EvidenceList.tsx:16-20` e `:59-60`.
- **Causa:** o efeito de `[open]` começa com `const el = wrapRef.current; if (!el) return` (linha 17). Só que o `<div ref={wrapRef}>` aparece dentro de `{rendered && (...)}` (linha 59), e `setRendered(true)` (linha 19) só roda depois desse `return`. Com `rendered = false` o ref é `null`, o efeito sai, e nada muda `rendered` para `true`. O clique só troca o texto do botão para "Ocultar trechos".
- **Como reproduzir:** fazer uma pergunta em Perguntar, Resolver, Comparar ou Aprender e clicar em "Mostrar trechos da apostila". A lista não aparece.
- **Impacto:** o aluno não consegue conferir de onde veio a resposta. Isso é o ponto central do produto (RAG com fonte citada). Afeta 4 abas.
- **Certeza:** alta. Tentei reproduzir com uma cópia da lógica em HTML, mas o painel do navegador só mostra arquivo local como imagem estática e não executa script. Falta uma execução real.

---

## MÉDIO

### B-02 — Comparação de segredo em `str` com acento dá HTTP 500 (reproduzido)
- **Onde:** `api/index.py:376` (`secrets.compare_digest(x_admin_token, ADMIN_TOKEN)`), `:340` (`hmac.compare_digest(assinatura, esperada)` em `validar_sessao`) e `:833` (login).
- **Causa:** `compare_digest` com `str` levanta `TypeError` se houver caractere não-ASCII. Ninguém captura, então o handler global devolve 500.
- **Como reproduzir:** com `ADMIN_USER=adm ADMIN_PASS=senha`, `POST /api/admin/login` com `senha: "sénha"` dá 500. `GET /api/admin/verificar` com `X-Admin-Token: é` (latin-1) também dá 500.
- **Impacto:** se `ADMIN_PASS`, `ADMIN_USER` ou `ADMIN_TOKEN` tiverem acento, o admin **nunca consegue entrar**, mesmo digitando certo (testei `compare_digest("senhá","senhá")`: também quebra). Além disso, o corpo do 500 mostra o nome da exceção. Já era pendência conhecida; confirmada e com causa exata.
- **Correção óbvia:** comparar `.encode("utf-8")`.

### B-03 — Comparar: o texto da resposta some quase inteiro quando o modelo escreve "resposta direta" no meio (reproduzido)
- **Onde:** `api/rag_core.py:246-247` (`remover_linha_resposta_direta`), usado em `api/index.py:1775`.
- **Causa:** o regex `\**\s*RESPOSTA\s*DIRETA\s*:?\**.*$` tem `IGNORECASE|DOTALL`, então casa na **primeira** menção (mesmo em prosa) e apaga até o fim. Já `extrair_resposta_direta` usa a **última** ocorrência. Os dois discordam.
- **Como reproduzir:** `remover_linha_resposta_direta("A resposta direta é citada abaixo.\n\nExplicação longa...\n\nRESPOSTA DIRETA: 42")` devolve `'A'`.
- **Impacto:** o card daquele modelo mostra só "A" no corpo. A conclusão continua no campo próprio.

### B-04 — Resolver, modo lote: anexos e questões separados por uma linha em branco viram uma questão só (reproduzido em Node)
- **Onde:** `components/tabs/ResolverTab.tsx:111` (separador `\n\s*\n\s*\n|\n{3,}`, ou seja, exige **duas** linhas em branco) e `components/AnexoImagem.tsx:33-36` (`inserir` junta blocos com `\n\n`, uma linha em branco).
- **Causa:** a tela diz "Um print por questão" e "separadas por linha em branco", mas o texto de cada print entra separado por só uma linha em branco. Como `formatarAlternativas` também usa `\n\n` entre alternativas, o separador não pode ser afrouxado sem quebrar isso. O plano B (`QUESTÃO N`) só vale se o texto tiver esse rótulo.
- **Como reproduzir:** modo lote, anexar dois prints de questões diferentes e clicar em "Analisar todas". Node mostra 1 bloco. O backend usa a **última** lista A, B, C…, então a primeira questão é descartada em silêncio, e o enunciado enviado é uma mistura das duas.

### B-05 — `gerar_apostila`: promete seguir sem o RAG, mas só captura `HTTPException` (reproduzido)
- **Onde:** `api/index.py:1243-1250` (docstring em `:1232-1234`).
- **Causa:** `gerar_embeddings` e `buscar_chunks` levantam `httpx.HTTPStatusError`/`TimeoutException` quando o Supabase falha, e o `except HTTPException` não pega.
- **Como reproduzir:** simular `gerar_embeddings` com `httpx.ConnectTimeout`: `POST /api/gerar-apostila` devolve 500 (na própria mensagem do handler). O texto da rota diz "nunca bloqueia a geração".

### B-06 — `resumir_apostila`: uma exceção comum do provedor derruba tudo, e falhas parciais passam sem aviso (reproduzido para o KeyError)
- **Onde:** `api/_app/provedores.py:256` (`r.json()["choices"][0]["message"]["content"]`), `api/index.py:1317-1323` e `:1340`.
- **Causa 1:** se o provedor responde 200 sem `choices` (por exemplo `{"error": ...}`, formato do OpenRouter que o streaming trata mas o não-streaming não), sai `KeyError`. `extrair_pontos` só captura `HTTPException`, e o `gather` propaga. O resumo inteiro vira 500 "KeyError: 'choices'".
- **Causa 2:** os chunks que falham viram `None` e são descartados. A resposta devolve `chunks_usados: len(chunks)` (os **enviados**, não os que deram certo), e `amostrado` só marca amostragem. Se 35 de 40 chunks falharem por 429 (o resumo dispara até 40 chamadas juntas), sai um resumo de 5 trechos sem aviso.
- **Extra:** `content` pode ser `None` no 200 (modelo só com raciocínio). `limpar_resposta` trata, mas `/api/perguntar` devolve `null`.

### B-07 — OCR: o worker pode ser encerrado no meio de uma leitura (leitura de código)
- **Onde:** `lib/ocr.ts:92-95` (timer de 60 s) e `:121-135` (`reconhecerImagem` não cancela o timer ao começar).
- **Causa:** o timer é armado no `finally` da leitura anterior e só é limpo quando outra leitura **termina**. Se uma nova leitura começa a, por exemplo, 55 s do fim da anterior e leva mais de 5 s, o timer dispara no meio e `encerrarWorker()` chama `terminate()` com `recognize` em andamento. O aluno vê erro no anexo. Vale também para uma página de PDF escaneado que passe de 60 s.
- **Certeza:** alta pelo código; depende de tempo, não reproduzi.

### B-08 — `AnexoImagem`: remover ou limpar durante a leitura devolve o texto ao campo (leitura de código)
- **Onde:** `components/AnexoImagem.tsx:116-131` (`ler` sempre chama `setTexto(inserir(...))` no fim), `:199-206` (`remover`) e `:105-110` (efeito de `resetToken`, usado pelo "Limpar" das abas).
- **Causa:** não há cancelamento. O item em leitura já saiu da fila (`fila.current`), então `remover` só tira da lista. Quando a leitura acaba, o texto é inserido no campo, e como o anexo não existe mais, não dá para removê-lo pela interface.
- **Como reproduzir:** anexar uma imagem grande e clicar no X (ou em "Limpar" da aba) durante "lendo…".

### B-09 — Glossário: termos repetidos no mesmo lote fazem o salvamento inteiro falhar (código confirmado; efeito no Postgres com alta confiança, não executado)
- **Onde:** `api/rag_core.py:666-694` (`extrair_termos_glossario`, sem deduplicação) e `api/index.py:698-734` (`salvar_termos_glossario`, `resolution=merge-duplicates` com `on_conflict=termo_normalizado`). No banco, `termo_normalizado = lower(termo)` (`supabase-backup/recriar-banco.sql:78`).
- **Causa:** se o modelo devolve "API" e "api" (ou o mesmo termo duas vezes), o `INSERT ... ON CONFLICT DO UPDATE` recebe duas linhas para a mesma chave e o Postgres recusa o comando inteiro (21000). O código captura e mostra `aviso_salvamento`, mas **nenhum termo do lote é salvo**.
- **B-09b (reproduzido, baixo):** `extrair_termos_glossario('{"termos": null}')` levanta `TypeError` (linha 682: `for item in parsed.get("termos", [])`) e vira 500. O `.get` só usa o padrão se a chave não existir.

### B-11 — `/api/auditar` sem teto de tamanho e com `n_por_frase` livre (leitura de código; a checagem por `inspect` confirma que não há `min(`)
- **Onde:** `api/index.py:1509-1511` (`n_por_frase: int = 1`), `:1540-1543` e `api/rag_core.py:259-288` (`quebrar_frases` sem limite).
- **Causa:** `buscar_chunks(emb, n=max(req.n_por_frase, 3))` repassa o valor ao `match_count` do banco sem clamp (a `/api/buscar` clampa em 20). E há uma busca vetorial **em sequência** por frase, sem teto de frases nem de tamanho de `resposta`. Rota pública.
- **Impacto:** um texto grande ou `n_por_frase` enorme estoura os 60 s da função (resposta 504 crua) e gasta banco/embeddings. Uma requisição consome só 1 unidade de cota.

### B-13 — Reenviar um PDF idêntico que ficou sem chunks diz "já indexado" e não reindexa (leitura de código)
- **Onde:** `api/index.py:2074-2078` (mensagem "conteúdo idêntico já indexado" baseada só no Storage, sem olhar o índice) e `components/tabs/PdfsTab.tsx:293-294` ("Nada a reindexar — nenhum arquivo mudou").
- **Impacto:** é justamente o caso das 2 PDFs "sem trechos indexados" do dossiê: subir de novo não resolve, e a mensagem é falsa. O caminho certo é "Verificar antes de reindexar", que a tela não sugere nesse momento.

### B-12 — Orçamento de tempo não desconta o que já passou (leitura de código; suspeita de estouro)
- **Onde:** `api/index.py:1583-1605` (`glossario`: `inicio = time.perf_counter()` só **depois** de embedding e busca), `api/_app/provedores.py:202` (limite fixo de 52 s por chamada) e `api/_app/http_util.py:20` (`_TIMEOUT` de 60 s para Supabase).
- **Causa:** `perguntar`, `resolver`, `comparar` e afins somam embedding + busca + LLM sem abater o tempo gasto antes. Um embedding lento (cold start da Edge Function) mais um modelo lento passam de 60 s e a plataforma corta com 504 em texto puro (o front tem dica para 504, mas a causa fica escondida). O ajuste feito no glossário (`restante = TEMPO_MAX_FUNCAO - ...`) tem o mesmo furo.
- **Certeza:** o código é claro; a frequência real depende de latência, não medi.

---

## BAIXO

- **B-10 — Busca no glossário: `q` entra sem escape no filtro PostgREST.** `api/index.py:741` monta `or=(termo.ilike.*{q}*,...)` com o texto do usuário. Vírgula ou parêntese muda a estrutura do filtro. O efeito esperado (400 do PostgREST, que o handler transforma em 500) **não foi executado**. No front, `components/tabs/GlossarioTab.tsx:48-50` engole o erro e mostra "Nenhum termo salvo encontrado", então o aluno acha que não há resultado.
- **B-14 — `/api/perguntar` (não-stream) devolve a resposta sem `limpar_resposta`.** `api/index.py:1162`. O stream limpa no front (`semRaciocinio`), mas "Testar meu entendimento" chama `api.perguntar` (`components/tabs/PerguntarTab.tsx:203-204`) e mostra a resposta em `<Markdown>` sem filtro. Com modelos que emitem `<think>` (ex.: `qwen/qwen3.6-27b`) o raciocínio aparece.
- **B-16 — Comprimir: extensão errada no download e mensagem antiga.** `components/tabs/ComprimirTab.tsx:181`: só passa `'jpeg'` para `nomeSaida` quando a saída é JPEG. Se a saída é PNG (formato "PNG" escolhido, ou "auto" com transparência) a partir de `.jpg` ou `.webp`, o arquivo baixa como `x-comprimido.jpg`/`.webp` com conteúdo PNG. Em `:386-387` o aviso "acima de N MB... indexe pelo app local" usa `max_upload_mb` (4), mas a aba PDFs já aceita até `envio_direto_mb` (50).
- **B-17 — `comprimirPdf` perde máscara `/Mask` e mexe em PDF criptografado (suspeita).** `lib/compress/pdf.ts:192` ignora só `ImageMask` e `SMask`; uma imagem com `/Mask` (máscara por cor ou por stream) é reescrita em `:258-266` sem esse item, e a transparência se perde. Em `:172`, `ignoreEncryption: true` com regravação pode gerar PDF ilegível em arquivo protegido (comportamento do pdf-lib não testado). Também em `lib/compress/canvas.ts:164` cria uma tela cheia por imagem que nunca é usada (`tela` e `void tela`), custo de memória à toa.
- **B-18 — Comparar: modelos padrão sem checar chave e chave React repetida.** `components/tabs/CompararTab.tsx:62-66` pega os 3 primeiros provedores mesmo sem `configurado` (dá erro no slot). `:283` usa `key={r.rotulo}`, mas o servidor aceita o mesmo modelo duas vezes (`respostas` não desambigua o rótulo; só `diretas` usa `rotulos_unicos`), gerando chave duplicada.
- **B-19 — `/api/status` transforma erro do Supabase em "sem dados".** `api/index.py:770-783`: o HEAD não passa por `raise_for_status`; sem `content-range` (401, 5xx) vira `total=0`, status `empty`, e fica em cache por 30 s. O cabeçalho mostra "sem dados" em vez de "offline".
- **B-20 — Nome não latino colide (reproduzido).** `nome_para_storage("日本語.pdf")` devolve `documento.pdf` (`api/_app/documentos.py:97-112`; mesma regra em `lib/texto.ts:66-77`). Dois arquivos assim viram o mesmo nome e o segundo entra como "versão atualizada do mesmo arquivo". Só a guarda de perda de texto (60%) pode segurar.
- **B-21 — Busca do glossário sem controle de ordem.** `GlossarioTab.tsx:43-62`: cada digitação dispara uma busca, e a resposta mais lenta sobrescreve a mais nova. (Também roda duas buscas iguais na montagem.)
- **B-22 — `formatarAlternativas` corta o enunciado (reproduzido).** `lib/texto.ts:17-24`: qualquer `A)`–`E)` com fronteira de palavra vira nova linha. "Sobre a fase A) do projeto" vira `fase` / `A) do projeto`. Vale para colar e OCR no Resolver.
- **B-23 — Indexação ignora tabelas do DOCX e do PPTX.** `api/_app/documentos.py:23` lê só `documento.paragraphs`; `:38-42` só formas com `text_frame` (sem tabelas, grupos ou notas). Conteúdo em tabela não entra no índice.
- **B-24 — Sessão de admin na aba PDFs.** `components/tabs/PdfsTab.tsx:73-79`: qualquer falha do `adminVerificar` (rede, 5xx, 500 do B-02) apaga o token salvo. Ao contrário, depois das 8 h de validade não há saída automática: `valido` continua verdadeiro e só aparece o erro 401 nas ações.
- **B-25 — `mensagemDe` mostra JSON cru em erro de validação.** `lib/api.ts:56-73`: `detail` de 422 é lista, cai no texto cru do corpo (`Erro 422: {"detail":[...`).
- **B-26 — `URL.revokeObjectURL` logo após `a.click()`.** `lib/api.ts:121-126`, `PerguntarTab.tsx:236-240`, `ResumoApostilaTab.tsx:51-56`. Alguns navegadores cancelam o download; navegadores atuais costumam funcionar (suspeita, não testei).
- **B-27 — Auditoria sem retorno quando não há frases.** `components/RespostaAuditada.tsx:39-49`: resposta sem frases de 40+ caracteres não mostra nada, nem "sem o que auditar".

---

## Suspeitas (não confirmadas)

- **S-1 — `ingerir` depende de ids crescentes, sem guarda no código.** `api/index.py:2007` (corte = maior id antigo) e `:2029` (`apagar_chunks_ate_id`). Se a sequência do banco ficar atrás do maior id (restauração com id explícito sem `setval`, como `supabase-backup/recriar-banco.sql:127-141` descreve em A1-02), a limpeza final apaga também os chunks recém-inseridos e o documento fica vazio com "✓" na tela. Hoje só há proteção por procedimento. Não verifiquei o estado real do banco. Uma checagem barata: comparar `ultimo_id` com `corte` antes de apagar.
- **S-2 — `listar_arquivos_storage` sem `limit`.** `api/index.py:636-645`. O padrão do endpoint de listagem do Storage é 100 itens (memória minha, não confirmei). Com 4 PDFs hoje não afeta; passaria a valer com mais de 100 arquivos (duplicata e `previa` deixariam de ver os demais).
- **S-3 — Glossário global gravável por qualquer visitante.** `api/index.py:1618` grava termos gerados a partir do texto do usuário numa tabela lida por todos (`/api/glossario/termos`). Um prompt malicioso em `tema` pode semear termos. É mais assunto de segurança; deixo para o agente da área.
- **S-4 — CPU do `pypdf` dentro de `async def`.** `extrair_paginas` é síncrona. Em `/api/ingerir` roda a cada lote (baixa e extrai o PDF de novo por lote de 24 chunks). Sem medida de tempo real para PDFs grandes.
- **S-5 — DOCX com caractere de controle.** `python-docx` recusa texto com caracteres XML inválidos; a saída do modelo raramente tem, mas não há limpeza em `_markdown_para_docx`. Não testei.

## Já conhecidos (só confirmo que continuam no código)
- Login de admin sem limite de tentativas (`api/index.py:819-836`).
- `comparar` (até 4 chamadas) e `resumir_apostila` (até 41) gastam 1 unidade de cota (`_limitar_llm` em `:1733` e `:1293`). Sem limite de tamanho em `perfil-comportamental`, `elenco-conversa`, `suporte-atendimento`, `resolver`, `simplificar`, `verificar`, `aprender/*`.

## Testes: o que falta cobrir para os bugs acima
Busquei nos testes e não achei cobertura para B-01 (não há teste de componente), B-02 (acento), B-05 (Supabase fora em `gerar-apostila`), B-06 (resposta 200 sem `choices` / falha parcial) nem B-09 (termos repetidos, `termos: null`). B-03 tem teste só do caso feliz (`tests/test_rag_core.py:288`), sem a menção "resposta direta" no meio do texto.
