# 02: Verificador (Agente 2), Ciclo 3b

**Projeto:** `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main`
**Data de todas as verificações e acessos web:** 17/09/2026

**O que rodei.** Usei o venv descartável do orquestrador (Python 3.14.7, fastapi 0.141.1, httpx 0.28.1, fpdf2 2.8.8, pypdf 6.19.0), sempre com `-B`, `PYTHONDONTWRITEBYTECODE=1` e `-p no:cacheprovider`. Usei também a cópia do frontend (node 24, react-markdown 9.1.0).
- Os scripts de reprodução ficaram só em `C:\Users\PMSC\AppData\Local\Temp\claude\C--Users-PMSC\618d3caa-4ffc-41e6-aab9-291f4b420df8\scratchpad\a2\` (`test_a2_part1.py`, `test_a2_part2.py`, `test_a2_part3.py`, `a109.py`, `v13.py`, `httpx_trickle.py`).
- O teste JS temporário ficou na cópia `scratchpad\rag-js` e foi apagado depois.
- No fim, `find` no projeto não achou `__pycache__` nem `.pytest_cache`. Nada foi gravado no projeto e a produção não foi chamada.
- Fiz apenas leituras públicas sem chave: documentação oficial, registro npm e as listas públicas `/v1/models` de OpenRouter, Nous, NVIDIA e Orca Router.

---

## 1. Premissas do projeto

| Premissa | Status | Evidência | Como validar |
|---|---|---|---|
| A função termina em até 60 s | **CONTRADITÓRIA** como garantia; o `maxDuration: 60` está configurado | O orçamento vale por chamada, não por requisição (A2-13). O `read` do httpx conta entre pedaços (A2-49). O embedding repete após timeout, até cerca de 120 s (A2-63). Segundo a Vercel, o limite inclui o tempo de streaming (A2-47) | Logs de 504 `FUNCTION_INVOCATION_TIMEOUT` na Vercel |
| Upload limitado a 4 MB por causa dos 4,5 MB da Vercel | **VERIFICADA** para 1 arquivo; **CONTRADITÓRIA** para vários | Doc da Vercel: 4,5 MB por corpo de requisição. O front manda todos os arquivos numa única requisição e só confere o tamanho de cada um (A2-61) | Enviar 2 arquivos de 3 MB num deploy de teste |
| A Edge Function aguenta lotes de até cerca de 8 textos | **NÃO VERIFICADA** | O fonte (`embeddings_source.ts`) não tem limite explícito e processa em laço sequencial. O limite real depende do runtime em produção | Teste de carga na Edge Function de um projeto de teste |
| Ids de chunk sempre crescentes | **PARCIALMENTE VERIFICADA** | Vale em operação normal. Deixa de valer depois da restauração documentada com `\copy` e `id` (A2-02) | Restaurar num Postgres local e rodar `nextval` |
| Cada requisição custa cerca de 1 chamada de IA | **CONTRADITÓRIA** | Medido: resumir faz 41 chamadas para 1 consumo de cota. Auditar com 200 frases faz 25 chamadas de embedding e 200 RPCs (A2-01) | Contadores por rota em teste |
| O IP do cliente não é falsificável na Vercel | **VERIFICADA** (doc) | A doc da Vercel diz que sobrescreve `X-Forwarded-For` e que `x-real-ip` e `x-vercel-forwarded-for` são idênticos (A2-46). Fora da Vercel (uvicorn local) os cabeçalhos são falsificáveis | Requisição com cabeçalho forjado num deploy de preview |
| O aluno tem IP próprio | **HIPÓTESE** | Não há dado sobre o público | Perguntar ao dono do projeto; logs de IP com hash |
| A saída do modelo cabe em Latin-1 no PDF | **CONTRADITÓRIA** | Reproduzido: travessão, aspas curvas, "•", "…", "→", "€", "≥" e emoji quebram o PDF (A2-04) | — |
| service_role, RLS, REVOKE e migração de 16/09 aplicados | **NÃO VERIFICADA** | Não tenho acesso à produção | `/api/config` (`inseguro`), SQL `pg_policies` e `has_table_privilege`, contagem antes e depois de um DELETE |
| Por padrão o aluno usa modelo gratuito | **PARCIALMENTE VERIFICADA** | O 1º modelo do Nous (`poolside/laguna-xs-2.1:free`) tem preço 0 no catálogo público do Nous. Mas 7 dos 12 modelos do Nous são pagos e só 3 estão anotados como pagos (A2-65) | — |
| Python da Vercel | **INFERÊNCIA**: 3.12 | Doc da Vercel: sem versão declarada, usa 3.12. O projeto não tem `.python-version` nem `pyproject.toml` (A2-48) | Log de build da Vercel |
| As latências anotadas ordenam a lista de modelos | **NÃO VERIFICADA** | Medir exige chaves pagas ou com cota | `scripts/medir_latencia.sh` com chaves |

---

## 2. Verificação dos achados do Agente 1

### A2-01 — A1-01: API pública sem limite de tamanho, com amplificação e teto global esgotável
- **ORIGEM:** A1-01
- **AFIRMAÇÃO:** A cota conta 1 unidade por requisição, mas resumir faz até 41 chamadas de LLM, comparar até 4, e auditar faz embeddings e RPCs por frase sem teto. Não há `max_length` nem `max_tokens`. O teto global pode ser esgotado por terceiros.
- **STATUS:** VERIFICADA (mecânica). O impacto financeiro está NECESSITA DE MAIS DADOS.
- **TIPO:** FATO (mecânica); ESTIMATIVA (custo)
- **COMO VERIFIQUEI:**
  - `test_a2_part3.py::test_a113_keyerror_e_contagem` com um .txt de 110 KB → 125 chunks → **41 chamadas de LLM e 1 chamada de `_limitar_llm`** (`chunks_usados=40`, `amostrado=True`).
  - `test_a101_auditar_contagem` com 200 frases e `n_por_frase=100000` → **25 chamadas de embedding, 200 buscas, `match_count` repassado como 100000**, 1 consumo de cota.
  - grep em `api\` por `max_length|constr|Field(|conint|Annotated` = 0; `max_tokens` = 0.
  - Janela da cota: `migracoes\2026-09-16-cota-de-uso.sql:36` (`floor(epoch/janela)`, virada à 00:00 UTC).
  - Catálogo público do Nous, `GET https://inference-api.nousresearch.com/v1/models`: preço e `context_length`.
- **RESULTADO:**
  - Mecânica confirmada. O comentário de `index.py:1384` ("1 chamada ao gte-small") está errado: são 1 chamada a cada 8 frases.
  - Ajuste 1: na Vercel, **um cliente sozinho não esgota o teto global**. O limite por IP é de 300 por dia, então são necessários pelo menos 17 IPs para chegar a 5000.
  - Ajuste 2: se a service_role **não** estiver configurada (pendente em 10/09), a camada 2 não roda. Nesse caso não existe teto diário, só 20 por minuto por instância, e a amplificação fica **maior**.
  - ESTIMATIVA (precisa ser validada), pior caso de custo:
    - `/api/simplificar` com corpo perto de 4,5 MB em `qwen/qwen3.7-flash` no Nous (contexto de 1 milhão de tokens; preço de US$ 0,2 por 1 milhão de tokens de entrada acima de 256 mil, e US$ 0,8 por 1 milhão de saída) daria cerca de US$ 0,25 por chamada;
    - com 300 chamadas por IP por dia, cerca de US$ 75 por IP por dia;
    - isso supõe que o provedor cobre chamadas abortadas pelo corte de 52 a 60 s, o que é **NÃO VERIFICADO**;
    - com os modelos curtos o custo por chamada fica perto de zero; o risco dominante é de disponibilidade.
- **CONFIANÇA:** alta na mecânica; baixa no valor em dinheiro, porque depende de cobrança, saldo da chave e plano.
- **IMPLICAÇÃO:** Mantenho **ALTO**. O argumento mais forte é disponibilidade (teto global e cotas gratuitas). O custo depende de a chave do Nous estar ativa e com saldo.
- **O QUE FALTA:** Quais chaves são pagas e com saldo; teto de gasto nos painéis; regras de Firewall da Vercel; logs de tráfego.

### A2-02 — A1-02: restauração sem `setval` faz a reindexação seguinte apagar os chunks novos
- **ORIGEM:** A1-02
- **AFIRMAÇÃO:** O `\copy` com `id` explícito não avança a identity. Os chunks novos nascem com id menor que o corte e `delete id <= corte` apaga tudo.
- **STATUS:** PARCIALMENTE VERIFICADA
- **TIPO:** FATO (código e dados); INFERÊNCIA (execução no Postgres)
- **COMO VERIFIQUEI:**
  - Li `recriar-banco.sql:18,76,116-121` (sem `setval`).
  - `ementas_chunks.csv` tem cabeçalho `id,...` e 526 linhas, ids de 942 a 1602. O dump de 10/09 vai de 942 a 1768. `glossario_termos` vai de 1 a 44.
  - `index.py:541-555,1850,1863-1864`.
  - `scripts\reimportar_chunks.py:118-126` não envia `id`.
  - Doc do PostgreSQL, CREATE TABLE: "in newly-inserted rows the column will automatically have values from the sequence assigned… If BY DEFAULT is selected, then the user-specified value takes precedence… (In the COPY command, user-specified values are always used regardless of this setting.)".
  - Não há Postgres local, então não executei.
- **RESULTADO:**
  - A lógica procede. A doc oficial diz que a sequência só fornece valor quando o valor é omitido. Ela não diz com todas as palavras que "a sequência não avança"; isso é afirmado por fontes secundárias.
  - A colisão em `glossario_termos` é **transitória**: some quando a sequência passa de 44.
  - A perda em `ementas_chunks` é silenciosa.
- **CONFIANÇA:** média-alta. Falta a execução.
- **IMPLICAÇÃO:** O problema procede. **Proponho MÉDIO** (OPINIÃO), porque:
  1. só acontece depois de uma restauração por esse caminho, e não há registro de que ela tenha ocorrido;
  2. o conteúdo pode ser recuperado dos dumps com `reimportar_chunks.py`;
  3. a correção é uma linha.

  Se a restauração estiver planejada, ALTO se justifica.
- **O QUE FALTA:** Rodar a restauração num Postgres com pgvector e conferir `nextval`; saber se alguma restauração já foi feita.

### A2-03 — A1-03: `/api/resolver` corta o enunciado
- **ORIGEM:** A1-03
- **AFIRMAÇÃO:** `_RE_INICIO_ALTERNATIVA` não está ancorada e corta o enunciado em "a.", "e-" ou "(IA)".
- **STATUS:** VERIFICADA
- **TIPO:** FATO; ESTIMATIVA (frequência)
- **COMO VERIFIQUEI:**
  - Rodei `rag_core.extrair_alternativas` com 11 enunciados. Os 3 exemplos do A1 saíram idênticos.
  - Casos extras: `'Assinale a correta sobre a LGPD.'` → `'Assinale a correta sobre a LGP'`; `'Analise a frase: a) primeira parte'` → `'Analise a frase:'`.
  - Proxy: apliquei a regex a 1.550 frases do dump do curso.
  - grep em `ResolverTab.tsx`: a interface **não mostra** o `questao` devolvido.
- **RESULTADO:**
  - Os cortes se confirmam e as alternativas continuam corretas, por isso os testes passam.
  - ESTIMATIVA: **27,5%** das frases do material contêm o gatilho. Quando ele dispara, cerca de 29% da frase se perde em média; 15,7% das frases terminam em a–e seguido de ponto.
  - Enunciados com várias frases devem disparar com mais frequência (INFERÊNCIA).
  - O corte é invisível para o aluno.
- **CONFIANÇA:** alta no defeito; média na estimativa, porque o proxy não são questões reais.
- **IMPLICAÇÃO:** Mantenho **ALTO**: função central, falha silenciosa e frequente. O quanto a resposta piora continua sendo INFERÊNCIA.
- **O QUE FALTA:** Um conjunto de questões reais; comparar a taxa de acerto com enunciado completo e truncado.

### A2-04 — A1-04: o PDF do Gerador quebra fora do Latin-1
- **ORIGEM:** A1-04
- **AFIRMAÇÃO:** A Helvetica embutida só aceita Latin-1. Travessão, aspas curvas, "•", "…", "→", emoji ou um tema com esses caracteres geram 500 depois de pagar o LLM.
- **STATUS:** VERIFICADA
- **TIPO:** FATO; INFERÊNCIA (frequência)
- **COMO VERIFIQUEI:**
  - Chamei `_markdown_para_pdf` com fpdf2 2.8.8 em 17 casos. Falharam `— “ • … → 🚀 – ’ € ≥ ✓` e o título `'Tema — IA'`. Passaram acentos, `ª º ° § ½`, tabela e listas numeradas.
  - Doc do fpdf2 (py-pdf.github.io/fpdf2/Unicode.html): as fontes padrão "only support latin characters"; para Unicode é preciso `add_font()`.
  - grep em `tests\`: não há teste de `_markdown_para_pdf`.
  - `ApostilaTab.tsx:14` usa `'pdf'` como padrão.
- **RESULTADO:** Confirmado. Achado a mais: o markdown de ênfase (`**negrito**`) sai com os asteriscos no PDF, um defeito de qualidade sem quebra. Não verifiquei fpdf2 abaixo de 2.8.8, mas o `>=2.7.0` sempre instala a mais recente.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** Mantenho **ALTO** (quebra determinística no formato padrão). A frequência real depende das saídas dos modelos (INFERÊNCIA).
- **O QUE FALTA:** Amostra de apostilas geradas em produção.

### A2-05 — A1-05: streaming da aba Perguntar
- **ORIGEM:** A1-05
- **AFIRMAÇÃO:** (1) Não há teto de tempo total. (2) O texto parcial é descartado. (3) Uma linha incompleta gera `SyntaxError` cru. (4) `finish_reason` é ignorado. (5) `<think>` é exibido.
- **STATUS:** VERIFICADA (itens 1 a 5 como mecânica). A frequência está NECESSITA DE MAIS DADOS.
- **TIPO:** FATO; INFERÊNCIA (frequência)
- **COMO VERIFIQUEI:**
  1. Servidor local que manda 8 eventos SSE a cada 0,5 s. Com `httpx.Timeout(1.0)` o stream terminou em **4,12 s sem timeout**. A doc do httpx define `read` como "maximum duration to wait for a chunk". A doc da Vercel diz que o `maxDuration` "includes… streamed responses".
  2. `PerguntarTab.tsx:96-99` e 246-252: com `erro` preenchido o card não é renderizado.
  3. Teste temporário em `rag-js`: corpo terminando em `{"tipo":"te` → **`SyntaxError`, não é `ApiError`**, mensagem "Unterminated string in JSON at position 11…", depois de já ter recebido "metade".
  4. grep `finish_reason` = 0.
  5. Renderizei com react-markdown 9.1.0 e remark-gfm: `<think>…</think>` aparece como texto literal (`&lt;think&gt;`). A doc da Groq (console.groq.com/docs/reasoning) diz que o `reasoning_format` padrão é "raw", "Includes reasoning within `<think>` tags", inclusive em streaming, e lista `qwen/qwen3.6-27b`.
- **RESULTADO:**
  - Tudo confirmado.
  - Acréscimo: `/api/perguntar`, sem stream (`index.py:1033`), também não aplica `limpar_resposta` (A2-58).
  - O item 3 só acontece se a conexão cair no meio de uma linha. O caso mais comum (corte entre eventos) já é tratado com a mensagem "A conexão caiu".
  - O `<think>` só aparece com `qwen/qwen3.6-27b` (6º modelo da Groq, não é o padrão).
- **CONFIANÇA:** alta na mecânica; baixa na frequência.
- **IMPLICAÇÃO:** Problema confirmado. **Proponho MÉDIO** até haver evidência de 504 ou de streams sem `fim` na rota principal. Os modelos padrão são rápidos e o `<think>` afeta um modelo que não é o padrão (OPINIÃO).
- **O QUE FALTA:** Logs da Vercel com 504 e duração dos streams; tempo real de resposta longa nos modelos gratuitos do Nous.

### A2-06 — A1-06: ingestão em lotes não é idempotente
- **ORIGEM:** A1-06
- **AFIRMAÇÃO:** A retentativa duplica chunks, o abandono deixa o índice misto e a interface anuncia "Concluído".
- **STATUS:** VERIFICADA
- **TIPO:** FATO
- **COMO VERIFIQUEI:**
  - `test_a2_part2.py::test_a106_retentativa_duplica`: `apagar_chunks_ate_id` falha na 1ª chamada; `ingerir(offset=48, corte_id=500)` duas vezes para 50 chunks → **4 inseridos** (o lote de 2 entrou duas vezes).
  - `corte_id=10**12` foi aceito.
  - Li `PdfsTab.tsx:174-207`.
- **RESULTADO:**
  - Confirmado. Detalhe: `tentativas > 5` significa 6 tentativas no total, sem espera.
  - O cenário mais provável na prática é INFERÊNCIA: a função passa do tempo depois do insert, o cliente recebe 504 e repete o mesmo offset.
  - No offset 0 a retentativa se corrige sozinha (recalcula o corte), exceto em documentos de até 24 chunks, em que a medição inflada pode dar 409 falso.
  - O item 5 exige admin.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** Mantenho **MÉDIO**.
- **O QUE FALTA:** Frequência de 504 e 5xx na ingestão.

### A2-07 — A1-07: substituição confirmada no upload nunca é indexada e registra sucesso
- **ORIGEM:** A1-07
- **AFIRMAÇÃO:** `enviar(true)` chama `runIngest(mudou)` sem `forcar`. O 409 vira `done = true` e o log mostra "✓ 0 chunks" e "✓ Concluído".
- **STATUS:** VERIFICADA
- **TIPO:** FATO
- **COMO VERIFIQUEI:** Li `PdfsTab.tsx:184-207,241,378-383,398-452`; `index.py:1675-1736,1747-1795,1818-1827`.
- **RESULTADO:** Confirmado, com três acréscimos:
  1. Existe caminho de recuperação manual: "Verificar antes de reindexar" leva a "Confirmar reindexação mesmo assim" (`PdfsTab.tsx:398-452`). Reenviar o arquivo não conserta, como disse o A1, mas a prévia conserta.
  2. **Assimetria entre as guardas.** Se o upload foi bloqueado porque o arquivo não pôde ser lido, a ingestão responde **422**, não 409. O front repete 6 vezes (baixando o arquivo a cada vez) e termina em "✓ Concluído".
  3. Um arquivo **novo**, que não estava indexado e não rende texto, passa pelo upload sem `forcar` (`_risco_de_perda` devolve `None` quando `chars_existentes == 0`) e recebe 409 na ingestão. O resultado é "⛔ … ✓ 0 chunks … ✓ Concluído" (A2-60).
- **CONFIANÇA:** alta (código); não executei no navegador.
- **IMPLICAÇÃO:** Mantenho **MÉDIO**. O log mostra "⛔" antes do "✓", o que atenua.
- **O QUE FALTA:** Teste de interface.

### A2-08 — A1-08: "mesmo conteúdo, nome diferente" sobre um nome já indexado
- **ORIGEM:** A1-08
- **AFIRMAÇÃO:** A guarda só olha A.pdf. B.pdf é sobrescrito e recebe os chunks de A.
- **STATUS:** VERIFICADA
- **TIPO:** FATO
- **COMO VERIFIQUEI:** `test_a2_part2.py::test_a108_mesmo_conteudo_nome_existente` com TestClient: A (md5 X), B (md5 Y), envio de B.pdf com bytes de X → 200, `substituidos=[B substituiu A]`. Log: `risco(A.pdf)`, `upload(B.pdf)`, `renomear(A→B)`, `remover(A.pdf)`. **Não houve `risco(B.pdf)`**.
- **RESULTADO:** Confirmado. O arquivo Y é perdido no Storage (`x-upsert`) e o índice de B fica misto.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** Mantenho **MÉDIO**: só admin e cenário raro, mas a perda é real.
- **O QUE FALTA:** —

### A2-09 — A1-09: auditoria compara palavras sem acento com trecho acentuado
- **ORIGEM:** A1-09
- **AFIRMAÇÃO:** Cobertura média de 0,782 contra 1,0; a classificação muda em 54 frases (3,5%); o teste das linhas 409-416 só passa por causa do defeito.
- **STATUS:** VERIFICADA
- **TIPO:** FATO
- **COMO VERIFIQUEI:**
  - `a109.py`: para cada chunk do dump de 10/09, cada frase de `quebrar_frases` com pelo menos 3 palavras, cobertura contra o chunk cru e contra o normalizado, com `assert` batendo com `frase_tem_apoio_textual`.
  - Resultado: **1.547 frases, 0,782 contra 1,0, 54 mudam (3,5%)**; 10 frases literais saem "nenhum" e 44 saem "parcial".
  - Conferi à mão o teste de `tests\test_rag_core.py:409-416`: com normalização, "negocios" casa, a conta vai a 3/6 e o resultado vira "total".
- **RESULTADO:** Números reproduzidos exatamente.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** Mantenho **MÉDIO**. Veja também o ponto cego com negação (A2-62).
- **O QUE FALTA:** Medição com paráfrases reais de resposta de modelo.

### A2-10 — A1-10: Comparar declara divergência com número exclusivo
- **ORIGEM:** A1-10
- **STATUS:** VERIFICADA
- **TIPO:** FATO
- **AFIRMAÇÃO:** "5" contra "cinco" e "página 12" contra "página 14" resultam em nível "baixa".
- **COMO VERIFIQUEI:** Rodei `calcular_concordancia`:
  - "5 pilares" contra "cinco pilares" → `baixa`, similaridade 0,778;
  - página 12 contra 14 → `baixa`, similaridade 1,0;
  - ano citado por um modelo só → `baixa`.

  Controle: 3 modelos, dois com "4" e um com "quatro" → `alta`, porque o 4 é comum a dois. O `SYSTEM_PROMPT_COMPARAR` pede "Cite a fonte e a página".
- **RESULTADO:** Confirmado. Com 3 ou mais modelos o efeito diminui quando pelo menos 2 citam o mesmo número.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** Mantenho **MÉDIO**.
- **O QUE FALTA:** Amostra de conclusões reais.

### A2-11 — A1-11: nova pergunta liberada durante o stream; auditoria atrasada
- **ORIGEM:** A1-11
- **STATUS:** VERIFICADA (código); comportamento em tempo de execução NÃO VERIFICADO
- **TIPO:** FATO (código); INFERÊNCIA (frequência)
- **AFIRMAÇÃO:** `onMeta` faz `setLoading(false)`, o botão depende só de `loading`, a auditoria antiga sobrescreve e não há `AbortController`.
- **COMO VERIFIQUEI:** Li `PerguntarTab.tsx:67-116,122,135,161-185,221,324-327`.
- **RESULTADO:**
  - Confirmado. O `onTexto` do 1º stream usa `setResultado(r => r ? {...} : r)` e passa a sobrescrever a resposta do 2º assim que o 2º chama `onMeta`.
  - A auditoria N termina com `setAuditoria(a)` sem checar a rodada, e `RespostaAuditada` recebe o texto N+1 com as frases de N.
- **CONFIANÇA:** alta no código; não rodei no navegador.
- **IMPLICAÇÃO:** Mantenho **MÉDIO**, com a frequência a confirmar.
- **O QUE FALTA:** Teste de interface ou manual.

### A2-12 — A1-12: "Extrair termos" não gera o glossário na 1ª navegação
- **ORIGEM:** A1-12
- **STATUS:** VERIFICADA (código e semântica do React)
- **TIPO:** FATO
- **AFIRMAÇÃO:** A aba monta com `provider=''`, `pronto=false`, `gerar()` sai cedo e o efeito depende só de `seed?.tick`.
- **COMO VERIFIQUEI:** Li `GlossarioTab.tsx:64-87`, `useProviderModel.ts:57-58,109`, `TabPanel.tsx:19-20,57` e `page.tsx:58-63,99-101`. `enviarParaGlossario` faz `setGlossarioSeed` e `setActive` no mesmo evento, então a aba monta já com `tick ≥ 1` e `pronto` é `false` no primeiro render. É certo, porque `useState('')` inicial não muda dentro do mesmo commit.
- **RESULTADO:** Confirmado.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** Mantenho **MÉDIO**.
- **O QUE FALTA:** Confirmação manual no navegador.

### A2-13 — A1-13: orçamento de 60 s por chamada, não por requisição
- **ORIGEM:** A1-13
- **STATUS:** VERIFICADA
- **TIPO:** FATO; INFERÊNCIA (corte pela plataforma, confirmado pela doc)
- **AFIRMAÇÃO:** Resumir pode passar de 100 s; `extrair_pontos` só captura `HTTPException`; `chunks_usados` engana; o glossário marca `inicio` tarde; download com 120 s; tempo anterior ao LLM não descontado.
- **COMO VERIFIQUEI:**
  - `test_a113_keyerror_e_contagem`: `chamar_llm` falso que levanta `KeyError` no 3º trecho → **500** `KeyError: 'choices'`.
  - Li `index.py:1165-1191,1428-1457,634-638,1831` e `http_util.py:15-20`.
  - Checagem nova: `issubclass(httpx.TimeoutException, httpx.TransportError)` → **True**. Logo, `gerar_embeddings` (`index.py:468-479`) **repete depois de um timeout de 60 s**, até cerca de 120,5 s só no embedding (A2-63).
  - A doc da Vercel confirma o 504 `FUNCTION_INVOCATION_TIMEOUT` no `maxDuration`.
- **RESULTADO:** Confirmado e agravado:
  - o embedding sozinho pode estourar o orçamento;
  - o 1º lote da ingestão baixa o arquivo **duas vezes**, dentro de `_analisar_ingestao` e na linha 1831 (A2-68).
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** Mantenho **MÉDIO**.
- **O QUE FALTA:** Logs de duração por rota.

### A2-14 — A1-14: login sem limite de tentativas e 500 com caractere não ASCII
- **ORIGEM:** A1-14
- **STATUS:** VERIFICADA (e mais ampla do que o A1 descreveu)
- **TIPO:** FATO
- **AFIRMAÇÃO:** Tentativas ilimitadas; `compare_digest` com `str` não ASCII levanta `TypeError`.
- **COMO VERIFIQUEI:** `test_a2_part1.py` com TestClient:
  - senha do servidor acentuada e login correto → **500**;
  - senha do servidor ASCII e **tentativa** com "é" (usuário correto) → **500**;
  - usuário errado com "é" → 401 (o `and` curto-circuita);
  - `X-Admin-Token` com byte 0xE9 → **500**;
  - 30 tentativas → todas **401**, nenhum 429.

  Doc do Python (hmac): "either str (ASCII only…) or a bytes-like object".
- **RESULTADO:** Confirmado. Além do cenário de senha acentuada, **qualquer tentativa** com caractere não ASCII e o usuário certo gera 500 e expõe o nome da exceção. Força bruta sem limite confirmada.
- **CONFIANÇA:** alta, localmente. Não verifiquei se o proxy da Vercel repassa bytes acima de 0x7F em cabeçalhos.
- **IMPLICAÇÃO:** Mantenho **MÉDIO**. O impacto da força bruta depende da força da senha, que é desconhecida. Veja o risco de senha exposta em A2-59.
- **O QUE FALTA:** Força e origem da senha real; regras de Firewall.

### A2-15 — A1-15: dependências sem versão fixada e três Pythons
- **ORIGEM:** A1-15
- **STATUS:** PARCIALMENTE VERIFICADA
- **TIPO:** FATO; INFERÊNCIA
- **AFIRMAÇÃO:** `>=` sem lockfile; 3.11 local, 3.12 no CI, 3.14 hoje; Python da Vercel não declarado.
- **COMO VERIFIQUEI:**
  - Li `requirements.txt`, `ci.yml` (3.12) e `iniciar-tudo.bat:59` (`py -3.11`).
  - Doc da Vercel (Python runtime): "If the required Python version is not defined… Vercel uses the default version… **3.12** (default)".
  - Medição: `Praticas_Gerenciais_Inovacao_Empresarial.pdf` com pypdf 6.19.0 e fonttools 4.65.0 → **75 chunks e 59.229 caracteres**, contra **74 e 60.076** documentados em `CORRECOES §2`. Nous (4 e 2.206) e Empreendedorismo (1 e 699) bateram.
- **RESULTADO:**
  - Sem declaração, a Vercel usa 3.12, igual ao CI. A divergência de versão de Python é **só local (3.11)**.
  - A extração do mesmo PDF mudou −1,4% em relação ao documentado. É FATO medido; atribuir a diferença à versão do pypdf é INFERÊNCIA.
- **CONFIANÇA:** média-alta.
- **IMPLICAÇÃO:** Mantenho **MÉDIO**, pela reprodutibilidade e pela variação medida na guarda de 60%.
- **O QUE FALTA:** `pip freeze` do build da Vercel; pytest em 3.11.

### A2-16 — A1-16: consumo em dobro com a auditoria automática; NAT
- **ORIGEM:** A1-16
- **STATUS:** VERIFICADA (consumo); HIPÓTESE (NAT)
- **TIPO:** FATO; HIPÓTESE
- **AFIRMAÇÃO:** Cada pergunta consome 2 unidades; limite efetivo de 10 por minuto e 150 por dia por IP; buscar consome a mesma cota.
- **COMO VERIFIQUEI:** Li `PerguntarTab.tsx:41,93-95` (`auditarAuto=true`), `index.py:1375,800,418-439`. `responderVerificacao` chama `api.perguntar` e consome mais uma unidade.
- **RESULTADO:** Consumo confirmado. O impacto em turmas depende da HIPÓTESE de NAT compartilhado.
- **CONFIANÇA:** alta no consumo; nenhuma sobre o público.
- **IMPLICAÇÃO:** **MÉDIO se as turmas compartilham IP; BAIXO caso contrário.** NECESSITA DE MAIS DADOS.
- **O QUE FALTA:** Perfil de acesso dos alunos.

### A2-17 — A1-17: o Gerador bloqueia quando a busca falha (V17)
- **ORIGEM:** A1-17
- **STATUS:** VERIFICADA
- **TIPO:** FATO
- **AFIRMAÇÃO:** `except HTTPException` não captura `httpx.HTTPStatusError` nem `TransportError`, então a rota dá 500.
- **COMO VERIFIQUEI:** `test_a117_apostila_base_indisponivel`: `gerar_embeddings` levanta `HTTPStatusError(546)` → **500**, e `chamar_llm` foi chamado **0 vezes**.
- **RESULTADO:** Confirmado. Ressalva sobre a correção proposta: `except (HTTPException, httpx.HTTPError)` resolve o 5xx rápido, mas se a Edge Function travar, `gerar_embeddings` espera até cerca de 120 s (A2-63) e a função morre antes do fallback.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** Mantenho **BAIXO**. A correção precisa de timeout curto nessa busca opcional.
- **O QUE FALTA:** —

### A2-18 — A1-18: glossário com termo duplicado; busca com vírgula
- **ORIGEM:** A1-18
- **STATUS:** PARCIALMENTE VERIFICADA
- **TIPO:** FATO (código e doc); INFERÊNCIA (resposta do banco)
- **AFIRMAÇÃO:** Duplicata por `lower(termo)` derruba o upsert em lote; vírgula ou parênteses em `q` quebram o `or=(...)`.
- **COMO VERIFIQUEI:**
  - `extrair_termos_glossario` com "LGPD" e "lgpd" → os dois mantidos.
  - A URL gerada é `or=(termo.ilike.*a,b*,explicacao.ilike.*a,b*)`, sem aspas.
  - Doc do PostgreSQL (INSERT): "Rows proposed for insertion should not duplicate each other in terms of attributes constrained by an arbiter index… a cardinality violation error will be raised".
  - Doc do PostgREST (URL grammar): caracteres reservados `, . : * ( )` precisam de aspas duplas.
- **RESULTADO:** Mecânica confirmada por código e doc. Não executei contra um banco.
- **CONFIANÇA:** média-alta.
- **IMPLICAÇÃO:** Mantenho **BAIXO**.
- **O QUE FALTA:** Execução num Supabase local.

### A2-19 — A1-19: falhas silenciosas
- **ORIGEM:** A1-19
- **STATUS:** VERIFICADA
- **TIPO:** FATO
- **AFIRMAÇÃO:** `/api/status` sem `raise_for_status`; providers vazio para sempre; `catch` silenciosos.
- **COMO VERIFIQUEI:**
  - `test_a119_status_401_vira_empty`: HEAD 401 → `200 {'status': 'empty', 'total': 0}`, que fica em cache por 30 s.
  - `page.tsx:65-70` (`.catch(() => setProviders({}))`, sem nova tentativa).
  - `useProviderModel.ts:110` (`nenhumConfigurado` exige `chaves.length > 0`).
  - grep: `.catch(() => undefined)` em `ElencoTab.tsx:49`, `SuporteTab.tsx:74` e `PerfisComportamentaisTab.tsx:49`.
- **RESULTADO:** Confirmado.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** Mantenho **BAIXO**.
- **O QUE FALTA:** —

### A2-20 — A1-20: verificar RLS por status 204 não prova nada
- **ORIGEM:** A1-20
- **STATUS:** PARCIALMENTE VERIFICADA
- **TIPO:** FATO (textos e doc); INFERÊNCIA (status exato do PostgREST)
- **AFIRMAÇÃO:** DELETE com anon, RLS ligado e nenhuma política afeta 0 linhas e responde 204. O `recriar-banco.sql` não traz REVOKE nem a cota.
- **COMO VERIFIQUEI:**
  - Doc do PostgreSQL (Row Security): "If no policy exists… default-deny… no rows are visible or can be modified" e "RLS silently prevents updating other rows".
  - Doc do PostgREST (errors): 42501 → "if authenticated 403, else 401".
  - Li as três migrações de 10/09 e o `recriar-banco.sql:88-98`.
- **RESULTADO:**
  - O filtro silencioso está confirmado na doc do Postgres; com REVOKE, o esperado passa a ser 401 para anon.
  - A doc do PostgREST não diz com todas as palavras que um DELETE de 0 linhas responde 204.
  - A falta de REVOKE e de `cota_uso` no `recriar-banco.sql` está confirmada. O RLS sem política já nega DELETE, então o REVOKE é defesa em profundidade.
- **CONFIANÇA:** média.
- **IMPLICAÇÃO:** Mantenho **BAIXO**. Para verificar V19, use contagem ou `return=representation`.
- **O QUE FALTA:** Execução num Supabase local.

### A2-21 — A1-21: documentação divergente
- **ORIGEM:** A1-21
- **STATUS:** VERIFICADA
- **TIPO:** FATO
- **COMO VERIFIQUEI:** grep:
  - `.env.example` não tem `ANYAPI_API_KEY`, `ORCAROUTER_API_KEY` nem `MAX_UPLOAD_MB`;
  - `BACKEND_URL` só aparece em `next.config.mjs` (dev) e `PROJECT.md`;
  - `ProviderSelect.tsx:58-59` cita só NOUS, GROQ, OPENROUTER e NVIDIA;
  - `README-BACKUP.md:9,48` cita AIHubMix;
  - `CORRECOES:106` fala em 25 MB;
  - rodei pytest de novo: **145 passed** em 2,50 s.
- **AFIRMAÇÃO:** Lista de divergências do A1.
- **RESULTADO:** Todas confirmadas. `BACKEND_URL` é usado só em desenvolvimento, então a falta dele no `.env.example` pesa pouco.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** Mantenho **BAIXO**.
- **O QUE FALTA:** —

### A2-22 — A1-22: postcss vulnerável aninhado no next
- **ORIGEM:** A1-22
- **STATUS:** VERIFICADA
- **TIPO:** FATO; INFERÊNCIA (inaplicabilidade)
- **COMO VERIFIQUEI:**
  - `node_modules/next/node_modules/postcss` = 8.4.31; o da raiz = 8.5.28.
  - grep em `next/dist`: `require('postcss')` só em `build/webpack/...` e em ferramentas `compiled/*`.
  - Registro npm: `next` 15.5.25 = tag `backport` (último 15.x, de 31/08/2026) e **todos os 15.5.22 a 15.5.25 fixam postcss 8.4.31**; `next@16.3.5` usa 8.5.23; postcss mais recente 8.5.28.
  - GHSA-qx2v-qp2m-jg93 (<8.5.10, moderate 6.1) exige "user-supplied CSS… embedding within HTML style tags".
  - GHSA-r28c-9q8g-f849 (<=8.5.17, high 7.5) exige "Untrusted CSS input processed via postcss()".
  - Não abri os outros dois GHSA; o npm audit os descreve como da mesma família (sourceMappingURL).
- **AFIRMAÇÃO:** 1 high e 1 moderate; correção só com o next 16.
- **RESULTADO:** O app não aceita CSS do usuário e o postcss do next só roda no build, sobre o CSS do próprio projeto. A exploração é inaplicável neste uso (INFERÊNCIA forte). Não existe 15.x corrigido.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** Mantenho **BAIXO** (na prática, informativo).
- **O QUE FALTA:** Testar se `overrides` para postcss ≥ 8.5.23 é compatível com next 15.5.25 (não testado).

---

## 3. Afirmações V1–V19 do dossiê

### A2-23 — V1: "50 testes passando" e "58 testes, sem rede"
- **ORIGEM:** `CORRECOES-2026-09-10.md:6,200`
- **STATUS:** CONTRADITÓRIA (com o estado atual); a data histórica está NÃO VERIFICADA
- **TIPO:** FATO
- **COMO VERIFIQUEI:** pytest de novo: **145 passed**. Por arquivo: rag_core 59, erros_e_limites 18, professor_auxiliar 18, ingestao_guard 10, admin_auth 7, aprender 6, ingerir_lotes 6, retentativa_e_stream 6, suporte 6, limite_e_sessao 5, extrair_paginas 4. JS: 35 (`00-execucao.md`).
- **AFIRMAÇÃO:** A contagem citada no documento.
- **RESULTADO:** Os números estão desatualizados e o próprio documento se contradiz (50 contra 58). Os testes rodam sem rede.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** Só documentação.
- **O QUE FALTA:** Histórico git (ausente nesta cópia).

### A2-24 — V2: rotas de escrita exigem `X-Admin-Token` e dão 503 sem `ADMIN_TOKEN`
- **ORIGEM:** `CORRECOES §6`
- **STATUS:** VERIFICADA
- **TIPO:** FATO
- **COMO VERIFIQUEI:** `Depends(exigir_admin)` em `/api/upload`, `/api/ingerir`, `/api/ingerir/previa`, `/api/duplicatas`, `/api/pdfs` e `/api/admin/verificar`. `exigir_admin` levanta 503 sem `ADMIN_TOKEN` (`index.py:349-354`). Testes `test_pdfs_sem_token_e_recusado` e `test_pdfs_sem_admin_configurado_falha_fechada`.
- **RESULTADO:** Confirmado. Cobre mais rotas do que a documentação lista. Ressalva: o 500 com token não ASCII (A2-14).
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** —
- **O QUE FALTA:** Confirmar em produção que `ADMIN_TOKEN` está definido.

### A2-25 — V3: guarda de 60% responde 409 e exige `forcar`
- **ORIGEM:** `CORRECOES §2`
- **STATUS:** PARCIALMENTE VERIFICADA
- **TIPO:** FATO
- **COMO VERIFIQUEI:** `QUEDA_MAXIMA_TEXTO = 0.4` (`index.py:1663`); `_risco_de_perda` e `_analisar_ingestao`; 10 testes em `test_ingestao_guard.py`.
- **RESULTADO:** Vale para os caminhos diretos. Tem três furos:
  1. o upload "mesmo conteúdo sobre nome existente" escapa (A2-08);
  2. a ingestão de arquivo ilegível dá 422, não 409 (A2-07);
  3. arquivo novo sem texto passa pelo upload (A2-60).
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** A promessa de ter "fechado" a classe de perda é parcial.
- **O QUE FALTA:** —

### A2-26 — V4: chunker de ~900 caracteres, sobreposição de 120, corte em parágrafo/frase, descarte de fragmento curto
- **ORIGEM:** `CORRECOES §3`, `rag_core.py:20-118`
- **STATUS:** VERIFICADA
- **TIPO:** FATO
- **COMO VERIFIQUEI:** `chunk_texto` nos 4 PDFs do backup. Praticas: 75 chunks, mínimo 107, máximo 1.005, mediana 890. Nenhum passa de 1.020. `chunk_texto('#SAIBA MAIS#')` → `[]`.
- **RESULTADO:** Confirmado. Com a sobreposição, os chunks chegam a cerca de 1.020 caracteres, compatível com "~900".
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** —
- **O QUE FALTA:** —

### A2-27 — V5: siglas em caixa alta capturadas, com lista de exclusão
- **ORIGEM:** `CORRECOES §3`
- **STATUS:** VERIFICADA
- **TIPO:** FATO
- **COMO VERIFIQUEI:** `extrair_nomes('A LGPD e o método NEOSA. RESUMO: ATENÇÃO ao PDF.')` → `{'lgpd','neosa'}`.
- **RESULTADO:** Confirmado.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** —
- **O QUE FALTA:** —

### A2-28 — V6: seletor de provedor não trava mais em vazio
- **ORIGEM:** `CORRECOES §4`, `lib/useProviderModel.ts`
- **STATUS:** PARCIALMENTE VERIFICADA
- **TIPO:** FATO
- **COMO VERIFIQUEI:** Li o hook (efeitos que sincronizam quando a lista chega) e `page.tsx:65-70`.
- **RESULTADO:** Resolve o caso "lista chega depois". Não resolve "lista falhou uma vez": fica `{}` para sempre, sem aviso (A2-19).
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** —
- **O QUE FALTA:** —

### A2-29 — V7: falha ao salvar o glossário devolve `aviso_salvamento`
- **ORIGEM:** `CORRECOES §5`
- **STATUS:** VERIFICADA (código); **sem teste**
- **TIPO:** FATO
- **COMO VERIFIQUEI:** `index.py:660-677,1464-1476`; `GlossarioTab.tsx:72`; grep `aviso_salvamento` em `tests\` = 0.
- **RESULTADO:** Confirmado no código, sem cobertura de teste.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** Lacuna de teste.
- **O QUE FALTA:** —

### A2-30 — V8: CORS por `ALLOWED_ORIGINS`, `n` entre 1 e 20, cache de 30 s
- **ORIGEM:** `CORRECOES §6`, `index.py:701`
- **STATUS:** PARCIALMENTE VERIFICADA
- **TIPO:** FATO
- **COMO VERIFIQUEI:** `index.py:121-123,182-187,803,706`.
- **RESULTADO:**
  - O limite de `n` só vale em `/api/buscar`; `/api/auditar` repassa `n_por_frase` sem teto (A2-01).
  - O cache de `/api/status` é por instância.
  - CORS não é controle de acesso para clientes fora do navegador (OPINIÃO técnica).
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** Reforça A1-01.
- **O QUE FALTA:** —

### A2-31 — V9: timeouts derivados do orçamento, "para nunca estourar"
- **ORIGEM:** `.env.example:29-31`, `http_util.py`
- **STATUS:** CONTRADITÓRIA
- **TIPO:** FATO
- **COMO VERIFIQUEI:** Veja A2-05 e A2-13: `read` entre pedaços (teste local de 4,12 s com timeout de 1 s), embedding com retentativa depois de timeout, download de 120 s, orçamento por chamada.
- **RESULTADO:** A garantia "nunca" não se sustenta.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** Documentação e código precisam de prazo por requisição.
- **O QUE FALTA:** —

### A2-32 — V10: limite em duas camadas; se o banco falhar, segue só com memória
- **ORIGEM:** `index.py:398-455`
- **STATUS:** VERIFICADA
- **TIPO:** FATO
- **COMO VERIFIQUEI:** Código e testes `test_banco_fora_do_ar_nao_derruba_o_app` e `test_sem_service_role_so_limite_local` (145 passaram).
- **RESULTADO:** Confirmado. Ressalvas: a camada 2 só roda com service_role; cada requisição faz até 3 RPCs em sequência, com timeout de 5 s cada.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** —
- **O QUE FALTA:** Estado da service_role em produção.

### A2-33 — V11: sessão de admin assinada, 8 h, comparação em tempo constante
- **ORIGEM:** `index.py:756-775`
- **STATUS:** PARCIALMENTE VERIFICADA
- **TIPO:** FATO
- **COMO VERIFIQUEI:** `SESSAO_ADMIN_SEGUNDOS = 8*60*60`; HMAC-SHA256; `hmac.compare_digest`; doc do Python (tempo constante só para `str` ASCII ou bytes).
- **RESULTADO:** Assinatura e expiração confirmadas. A comparação quebra com texto não ASCII (A2-14). Não há revogação individual, só troca de `SESSION_SECRET`.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** —
- **O QUE FALTA:** —

### A2-34 — V12: IP gravado como hash HMAC, nunca em claro
- **ORIGEM:** `index.py:414-417`
- **STATUS:** VERIFICADA (no banco)
- **TIPO:** FATO
- **COMO VERIFIQUEI:** Código (HMAC com o segredo, 32 hex) e teste `test_ip_nao_vai_em_claro_para_o_banco`. Os `print` de `_limitar_llm` e de `falha_inesperada` não incluem o IP.
- **RESULTADO:** Confirmado para o banco e os logs do app. Não sei se os logs de acesso da própria Vercel registram IP.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** —
- **O QUE FALTA:** —

### A2-35 — V13: reconstrução com fidelidade média de 0,9994 e pior caso de 0,987 em 113 páginas
- **ORIGEM:** `CORRECOES §7`
- **STATUS:** VERIFICADA (com métrica reconstruída por mim)
- **TIPO:** FATO
- **COMO VERIFIQUEI:** `v13.py`:
  - `montar_paginas` do próprio script sobre o dump de 10/09;
  - pypdf relendo `reconstruido\*.pdf`, com o marcador `[página N]` removido;
  - `difflib.SequenceMatcher.ratio` após normalizar espaços.
- **RESULTADO:** `…_completo.pdf`: **113 páginas originais (1 a 113, contíguas), 113 páginas físicas, 0 desalinhamentos, média de 0,9994, pior de 0,9873**. As outras fontes deram 1,0. O script não traz a métrica original; a minha coincide nos números. A fidelidade é medida contra os chunks, não contra o PDF perdido, como o próprio documento admite. O marcador `[página N]` vai entrar no texto indexado (ruído pequeno).
- **CONFIANÇA:** média-alta, porque a métrica é reconstruída.
- **IMPLICAÇÃO:** A afirmação se sustenta.
- **O QUE FALTA:** A métrica original usada em 10/09.

### A2-36 — V14: latências e disponibilidade dos modelos
- **ORIGEM:** `api/_app/provedores.py`
- **STATUS:** PARCIALMENTE VERIFICADA (existência); NÃO VERIFICADA (latência e funcionamento)
- **TIPO:** FATO; NÃO VERIFICADA
- **COMO VERIFIQUEI:** Listas públicas sem chave, em 17/09/2026:
  - OpenRouter: 11 de 11 IDs existem, todos com preço 0;
  - Nous: 12 de 12;
  - NVIDIA: 2 de 2;
  - Orca Router: 3 de 3, preço por requisição 0;
  - AnyAPI: `/v1/models` respondeu 401;
  - Groq (HTML das docs): `groq/compound`, `groq/compound-mini`, `openai/gpt-oss-120b` e `openai/gpt-oss-20b` estão na página de modelos; `qwen/qwen3.6-27b` aparece no enum da API e como substituto recomendado nas depreciações de junho e julho de 2026; **`allam-2-7b` não aparece** na página de modelos nem na de depreciações.
- **RESULTADO:** Os IDs existem nos catálogos, exceto AnyAPI (não verificável) e `allam-2-7b` (não encontrado). Estar no catálogo não prova que a chave do projeto consegue chamar, nem as latências.
- **CONFIANÇA:** alta na existência; nenhuma na latência.
- **IMPLICAÇÃO:** `allam-2-7b` pode estar indisponível; conferir.
- **O QUE FALTA:** Chaves de teste e `scripts/medir_latencia.sh`.

### A2-37 — V15: versões do `package.json` existem e sem vulnerabilidades relevantes
- **ORIGEM:** `package.json`
- **STATUS:** PARCIALMENTE VERIFICADA
- **TIPO:** FATO
- **COMO VERIFIQUEI:** `npm ci` com exit 0 (`00-execucao.md`); registro npm (next 15.5.25 = `backport`); A2-22.
- **RESULTADO:** As versões existem. Há 2 alertas de audit sem impacto em tempo de execução; `eslint@9.39.5` está marcado como descontinuado.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** —
- **O QUE FALTA:** —

### A2-38 — V16: OCR no navegador, custo zero, modelo de ~15 MB baixado uma vez
- **ORIGEM:** `lib/ocr.ts:11`, `AnexoImagem.tsx:275`
- **STATUS:** PARCIALMENTE VERIFICADA
- **TIPO:** FATO; ESTIMATIVA
- **COMO VERIFIQUEI:**
  - `ocr.ts:77-90`: `createWorker(['por','eng'], 1)`.
  - `tesseract.js@7.0.0/src/worker-script/index.js:130`: com OEM 1 os dados vêm de `cdn.jsdelivr.net/.../4.0.0_best_int`; linha 179 mostra que o cache é gravado por padrão.
  - HEAD público: `por.traineddata.gz` = 1.392.239 bytes, `eng.traineddata.gz` = 2.952.873 bytes.
  - O core local `tesseract-core-*-lstm.wasm.js` tem cerca de 3,9 MB.
- **RESULTADO:**
  - Roda no navegador e não usa API paga: confirmado.
  - Depende de um CDN de terceiros (jsdelivr).
  - O download total estimado é de cerca de 8 MB comprimidos (ESTIMATIVA), e não "~15 MB".
  - Os dados de idioma ficam em cache.
  - Confirmei por leitura o problema do temporizador de ociosidade citado pelo A1 (A2-66).
- **CONFIANÇA:** média.
- **IMPLICAÇÃO:** Texto de interface impreciso; baixo impacto.
- **O QUE FALTA:** Medir no DevTools.

### A2-39 — V17: o Gerador "nunca bloqueia por falta de material"
- **ORIGEM:** `index.py:1077-1100`
- **STATUS:** CONTRADITÓRIA
- **TIPO:** FATO
- **COMO VERIFIQUEI:** A2-17 (500 com a Edge Function em 546; o LLM nunca é chamado).
- **RESULTADO:** Bloqueia quando a base está indisponível. Com a base vazia (`chunks` vazio), segue: confirmado no código.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** —
- **O QUE FALTA:** —

### A2-40 — V18: `/api/auditar` "verifica frase por frase… (detecção de alucinação)"
- **ORIGEM:** `index.py:1364`
- **STATUS:** PARCIALMENTE VERIFICADA
- **TIPO:** FATO; OPINIÃO (adequação do nome)
- **COMO VERIFIQUEI:** Código; A2-09; teste de negação: `frase_tem_apoio_textual('A inovação não exige análise estratégica do público.', [chunk "a inovacao exige analise estrategica do publico"])` → **`total`**, porque `"nao"` está em `STOPWORDS`.
- **RESULTADO:** A auditoria é frase por frase, com similaridade vetorial e cobertura lexical. **Não detecta contradição** (negação, número trocado), e rebaixa frases fiéis por causa do acento.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** "Detecção de alucinação" promete mais do que entrega (OPINIÃO).
- **O QUE FALTA:** Conjunto rotulado de frases fiéis e inventadas.

### A2-41 — V19: estado de produção
- **ORIGEM:** `CORRECOES`, `supabase-backup/migracoes/`
- **STATUS:** NÃO VERIFICADA
- **TIPO:** —
- **COMO VERIFIQUEI:** Não verifiquei; a produção está proibida nesta análise.
- **RESULTADO:** INSUFICIENTE PARA CONCLUIR.
- **CONFIANÇA:** —
- **IMPLICAÇÃO:** A1-01, A1-16 e A1-20 dependem disso.
- **O QUE FALTA:** `/api/config`, políticas e privilégios no SQL, contagem antes e depois de um DELETE com anon, existência de `consumir_cota`.

---

## 4. Premissas técnicas externas

### A2-42 — fpdf2: fontes padrão só Latin-1; Unicode exige `add_font`
- **ORIGEM:** A1-04
- **STATUS:** VERIFICADA
- **TIPO:** FATO
- **COMO VERIFIQUEI:** https://py-pdf.github.io/fpdf2/Unicode.html ("Those fonts only support latin characters"; "Before using a Unicode font, you need to load it from a font file… `add_font()`") e a execução em A2-04.
- **RESULTADO:** Confirmado.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** A correção do A1 procede. A TTF precisa ser empacotada: o `includeFiles` do `vercel.json` hoje só inclui `api/{rag_core.py,_app/**}`, então a fonte precisa ficar em `api/_app/` ou o `includeFiles` precisa mudar (INFERÊNCIA).
- **O QUE FALTA:** —

### A2-43 — PostgreSQL: valor explícito em identity BY DEFAULT / COPY
- **ORIGEM:** A1-02
- **STATUS:** PARCIALMENTE VERIFICADA
- **TIPO:** FATO (doc); INFERÊNCIA (sequência não avança)
- **COMO VERIFIQUEI:** https://www.postgresql.org/docs/current/sql-createtable.html (citação em A2-02). A página https://www.postgresql.org/docs/current/ddl-identity-columns.html não trata do avanço da sequência. Fontes secundárias da busca afirmam que não avança.
- **RESULTADO:** Veja A2-02.
- **CONFIANÇA:** média-alta.
- **IMPLICAÇÃO:** —
- **O QUE FALTA:** Execução.

### A2-44 — RLS sem política e mapeamento de erros no PostgREST
- **ORIGEM:** A1-20
- **STATUS:** PARCIALMENTE VERIFICADA
- **TIPO:** FATO (doc)
- **COMO VERIFIQUEI:** https://www.postgresql.org/docs/current/ddl-rowsecurity.html, https://docs.postgrest.org/en/stable/references/errors.html e https://supabase.com/docs/guides/database/postgres/row-level-security ("no data is accessible through the API when using a publishable key, until you create policies").
- **RESULTADO:** Veja A2-20. Não achei na doc o status HTTP de um DELETE com 0 linhas afetadas.
- **CONFIANÇA:** média.
- **IMPLICAÇÃO:** —
- **O QUE FALTA:** Execução.

### A2-45 — Supabase Storage: limite padrão de `object/list`
- **ORIGEM:** A1 §5
- **STATUS:** PARCIALMENTE VERIFICADA
- **TIPO:** FATO (fonte do servidor); INFERÊNCIA (versão atual)
- **COMO VERIFIQUEI:**
  - https://github.com/supabase/storage/blob/master/migrations/tenant/0002-storage-schema.sql: `storage.search(prefix text, bucketname text, limits int DEFAULT 100, …)`.
  - https://raw.githubusercontent.com/supabase/storage/master/src/http/routes/object/listObjects.ts: o schema HTTP não define padrão para `limit`.
  - https://github.com/supabase/supabase-py/issues/699: relato de corte em 100.
- **RESULTADO:** O padrão de 100 é provável. Não confirmei o caminho completo na versão atual do servidor. Hoje são 4 arquivos.
- **CONFIANÇA:** média.
- **IMPLICAÇÃO:** Risco latente, BAIXO.
- **O QUE FALTA:** Teste com mais de 100 objetos num projeto de teste.

### A2-46 — Vercel sobrescreve cabeçalhos de IP
- **ORIGEM:** comentário em `index.py:385-386`; A1 §5
- **STATUS:** VERIFICADA (doc)
- **TIPO:** FATO
- **COMO VERIFIQUEI:** https://vercel.com/docs/headers/request-headers: "we currently overwrite the `X-Forwarded-For` header and do not forward external IPs. This restriction is in place to prevent IP spoofing". `x-vercel-forwarded-for` e `x-real-ip` são "identical to the x-forwarded-for header". Exceção: proxy confiável no plano Enterprise.
- **RESULTADO:** O comentário do código procede na Vercel. Fora dela (uvicorn local) os cabeçalhos são falsificáveis, como o teste mostra.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** Enfraquece a parte "qualquer cliente esgota o teto global" de A1-01: são necessários pelo menos 17 IPs.
- **O QUE FALTA:** Confirmação empírica num deploy de preview.

### A2-47 — Vercel: `maxDuration`, streaming e 4,5 MB
- **ORIGEM:** A1-05, A1-13, `vercel.json`
- **STATUS:** VERIFICADA (doc)
- **TIPO:** FATO
- **COMO VERIFIQUEI:** https://vercel.com/docs/functions/limitations (última atualização 24/08/2026):
  - "includes time spent processing the request and sending the response, including streamed responses";
  - 504 `FUNCTION_INVOCATION_TIMEOUT`;
  - com fluid compute: Hobby 300 s de padrão e máximo; Pro 300 s de padrão e 800 s de máximo;
  - "maximum payload size for the request body or the response body… 4.5 MB".

  https://vercel.com/docs/functions/runtimes/python: "Vercel Functions support streaming responses when using the Python runtime".
- **RESULTADO:** Confirmado. O `maxDuration: 60` é escolha do projeto. Com fluid compute poderia ser até 300 s mesmo no Hobby.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** Dado útil para o Agente 3: aumentar o orçamento é uma opção de configuração, se o projeto usar fluid compute.
- **O QUE FALTA:** Plano da Vercel e se o fluid compute está ativo neste projeto.

### A2-48 — Vercel: versão de Python
- **ORIGEM:** A1-15
- **STATUS:** VERIFICADA (doc)
- **TIPO:** FATO; INFERÊNCIA (aplicação ao projeto)
- **COMO VERIFIQUEI:** https://vercel.com/docs/functions/runtimes/python: versões 3.12 (padrão), 3.13 e 3.14; definida por `pyproject.toml`, `.python-version` ou `Pipfile.lock`. O projeto não tem nenhum desses arquivos.
- **RESULTADO:** O deploy deve usar 3.12.
- **CONFIANÇA:** média-alta.
- **IMPLICAÇÃO:** Veja A2-15.
- **O QUE FALTA:** Log de build.

### A2-49 — httpx: `read` entre pedaços; timeout é TransportError
- **ORIGEM:** A1-05
- **STATUS:** VERIFICADA
- **TIPO:** FATO
- **COMO VERIFIQUEI:** https://www.python-httpx.org/advanced/timeouts/ ("maximum duration to wait for a chunk of data to be received"); `httpx_trickle.py` (4,12 s com `Timeout(1.0)`); `issubclass` → True.
- **RESULTADO:** Confirmado.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** Veja A2-05 e A2-63.
- **O QUE FALTA:** —

### A2-50 — react-markdown 9.1.0 converte HTML cru em texto
- **ORIGEM:** A1-05
- **STATUS:** VERIFICADA
- **TIPO:** FATO
- **COMO VERIFIQUEI:** `rag-js\node_modules\react-markdown\lib\index.js:112` (`allowDangerousHtml: true` interno), linhas 354-360 (`raw` → `{type:'text'}` sem `skipHtml`) e renderização real (A2-05).
- **RESULTADO:** `<think>` aparece literal na tela. Não há risco de XSS por esse caminho.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** —
- **O QUE FALTA:** —

### A2-51 — `secrets.compare_digest` com `str` não ASCII
- **ORIGEM:** A1-14
- **STATUS:** VERIFICADA
- **TIPO:** FATO
- **COMO VERIFIQUEI:** https://docs.python.org/3/library/hmac.html e execução em 3.14.7: `TypeError: comparing strings with non-ASCII characters is not supported`, inclusive quando só um dos lados é não ASCII. `secrets.compare_digest is hmac.compare_digest` → True.
- **RESULTADO:** Confirmado.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** —
- **O QUE FALTA:** —

### A2-52 — Advisories do postcss e uso em tempo de execução
- **ORIGEM:** A1-22
- **STATUS:** VERIFICADA
- **TIPO:** FATO; INFERÊNCIA
- **COMO VERIFIQUEI:** https://github.com/advisories/GHSA-qx2v-qp2m-jg93 e https://github.com/advisories/GHSA-r28c-9q8g-f849; o grep em `next/dist` e o registro npm citados em A2-22.
- **RESULTADO:** As duas falhas exigem CSS não confiável; aqui o postcss só roda no build.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** BAIXO.
- **O QUE FALTA:** —

### A2-53 — Groq: `reasoning_format` padrão e `<think>` no stream
- **ORIGEM:** A1-05 (comentário em `provedores.py:38`)
- **STATUS:** VERIFICADA (doc)
- **TIPO:** FATO
- **COMO VERIFIQUEI:** https://console.groq.com/docs/reasoning: "raw: Includes reasoning within `<think>` tags in the main text content"; padrão `raw`, ou `parsed` em JSON mode; menciona `qwen/qwen3.6-27b`; em streaming com `raw`, as tags vêm no conteúdo.
- **RESULTADO:** A INFERÊNCIA do A1 passa a ser apoiada pela doc oficial.
- **CONFIANÇA:** média-alta. Veio de resumo do WebFetch, que não conferi no HTML bruto como fiz com a página de modelos.
- **IMPLICAÇÃO:** Mandar `reasoning_format: "parsed"` ou `"hidden"` para modelos Qwen na Groq pode ser uma alternativa à filtragem (INFERÊNCIA para o Agente 3).
- **O QUE FALTA:** Uma chamada real.

### A2-54 — pgvector: `ef_search` e `match_count` alto
- **ORIGEM:** A1 §5 e A1-01
- **STATUS:** PARCIALMENTE VERIFICADA
- **TIPO:** FATO (doc); INFERÊNCIA (plano de execução)
- **COMO VERIFIQUEI:** https://github.com/pgvector/pgvector/blob/master/README.md: `hnsw.ef_search` com padrão de 40; "Results are limited by the size of the dynamic candidate list".
- **RESULTADO:** Com o índice HNSW em uso, `match_count` acima de 40 tende a devolver no máximo 40 linhas. Com 526 linhas, o planejador pode preferir varredura sequencial e devolver a tabela inteira.
- **CONFIANÇA:** média.
- **IMPLICAÇÃO:** O tamanho da resposta das 200 RPCs de A1-01 é incerto.
- **O QUE FALTA:** `EXPLAIN` no banco.

---

## 5. O que o Agente 1 não viu ou viu só em parte

### A2-58 — `/api/perguntar` (sem stream) também não limpa `<think>`
- **ORIGEM:** `api\index.py:1033`
- **AFIRMAÇÃO:** Só as outras rotas aplicam `limpar_resposta`.
- **STATUS:** VERIFICADA
- **TIPO:** FATO
- **COMO VERIFIQUEI:** Leitura do código: `return {"resposta": resposta, ...}`, sem `limpar_resposta`. A rota é usada por `responderVerificacao` (`PerguntarTab.tsx:149`).
- **RESULTADO:** Mesmo defeito do item 5 de A1-05, numa segunda rota.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** Soma-se a A1-05.
- **O QUE FALTA:** —

### A2-59 — Teste com valor literal de senha com aparência de real
- **ORIGEM:** `tests\test_admin_auth.py:23` e `:63`
- **AFIRMAÇÃO:** O teste usa um usuário igual ao identificador da conta GitHub citada no projeto e um `ADMIN_PASS` com formato de senha pessoal (letras, símbolo e 7 dígitos).
- **STATUS:** HIPÓTESE (que seja a senha real)
- **TIPO:** HIPÓTESE
- **COMO VERIFIQUEI:** grep com o valor mascarado. **Não copio o valor.** `scripts\verificar-guarda-upload.sh:9` lê o token do `.env`: falso positivo.
- **RESULTADO:** INSUFICIENTE PARA CONCLUIR se é a credencial de produção.
- **CONFIANÇA:** baixa quanto a ser real.
- **IMPLICAÇÃO:** Se for real, A1-14 (força bruta) vira acesso direto para quem tiver o repositório (privado, segundo `CORRECOES`). Recomendo que o dono confirme e troque a senha se ela coincidir.
- **O QUE FALTA:** Confirmação do dono.

### A2-60 — Arquivo novo sem texto passa pelo upload e leva a "✓ 0 chunks"
- **ORIGEM:** `index.py:1754-1756` contra `1707-1714,1820-1827`
- **AFIRMAÇÃO:** `_risco_de_perda` libera quando `chars_existentes == 0`; `_analisar_ingestao` bloqueia quando não há linhas.
- **STATUS:** VERIFICADA (código)
- **TIPO:** FATO
- **COMO VERIFIQUEI:** Leitura do código de backend e de `PdfsTab.tsx:184-205`.
- **RESULTADO:** PDF escaneado novo → upload "✓ novo arquivo salvo" → ingestão 409 → "⛔ … ⚠ OCR … ✓ nome: 0 chunks … ✓ Concluído". O arquivo fica no Storage sem índice.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** Variante de A1-07, BAIXO a MÉDIO.
- **O QUE FALTA:** Teste de interface.

### A2-61 — Upload de vários arquivos: 4 MB por arquivo, mas 4,5 MB por requisição
- **ORIGEM:** `lib\api.ts:298-307`, `PdfsTab.tsx:81`, `index.py:1918`
- **AFIRMAÇÃO:** O teto é aplicado por arquivo.
- **STATUS:** VERIFICADA (código e doc da Vercel); NÃO executada na Vercel
- **TIPO:** FATO; INFERÊNCIA
- **COMO VERIFIQUEI:** `form.append('files', f)` para todos os arquivos numa única requisição; doc da Vercel com 4,5 MB por corpo (A2-47).
- **RESULTADO:** Dois arquivos de 3 MB geram 413. O front traduz como "envie um arquivo menor", o que engana.
- **CONFIANÇA:** média-alta.
- **IMPLICAÇÃO:** BAIXO (só admin).
- **O QUE FALTA:** Teste num deploy de preview.

### A2-62 — Auditoria não percebe negação
- **ORIGEM:** `rag_core.py:286-293` (`"nao"` em `STOPWORDS`)
- **STATUS:** VERIFICADA
- **TIPO:** FATO
- **COMO VERIFIQUEI:** Execução descrita em A2-40.
- **AFIRMAÇÃO:** Frase negada contra trecho afirmativo.
- **RESULTADO:** `total`: a frase que inverte o sentido recebe apoio lexical total. Se a similaridade vetorial também for alta, sai "apoiada" (INFERÊNCIA).
- **CONFIANÇA:** alta na parte lexical.
- **IMPLICAÇÃO:** Limitação de desenho de V18.
- **O QUE FALTA:** Teste com embeddings reais.

### A2-63 — `gerar_embeddings` repete depois de timeout: até ~120 s
- **ORIGEM:** `index.py:462-483`, `http_util.py:20`
- **STATUS:** VERIFICADA
- **TIPO:** FATO
- **COMO VERIFIQUEI:** `_TIMEOUT = Timeout(60, connect=10)`; `except httpx.TransportError` inclui `TimeoutException` (A2-49).
- **AFIRMAÇÃO:** —
- **RESULTADO:** Uma Edge Function travada consome cerca de 120,5 s antes de qualquer LLM.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** Agrava A1-05 e A1-13; torna insuficiente a correção proposta em A1-17.
- **O QUE FALTA:** —

### A2-64 — Extração de Praticas mudou em relação ao documento
- **ORIGEM:** `CORRECOES §2`
- **STATUS:** CONTRADITÓRIA (com o ambiente atual)
- **TIPO:** FATO; INFERÊNCIA (causa)
- **COMO VERIFIQUEI:** Execução descrita em A2-15.
- **AFIRMAÇÃO:** "74 chunks, 60.076 caracteres".
- **RESULTADO:** Hoje dá 75 chunks e 59.229 caracteres.
- **CONFIANÇA:** alta na medição.
- **IMPLICAÇÃO:** Evidência para A1-15.
- **O QUE FALTA:** Versão do pypdf usada em 10/09.

### A2-65 — Nous: 7 dos 12 modelos são pagos, só 3 anotados
- **ORIGEM:** `provedores.py:46-64`
- **AFIRMAÇÃO:** "Gratuitos primeiro… depois os pagos baratos"; só llama-8b, nova-micro e mistral-nemo estão marcados como pagos.
- **STATUS:** PARCIALMENTE VERIFICADA
- **TIPO:** FATO
- **COMO VERIFIQUEI:** Catálogo público do Nous, preços por token:

  | Modelo | Entrada (US$/1 M) | Saída (US$/1 M) | Anotação no código |
  |---|---|---|---|
  | llama-3.1-8b | 0,02 | 0,04 | "~$0.04" |
  | nova-micro | 0,035 | 0,14 | "~$0.03" |
  | mistral-nemo | 0,018 | 0,03 | "~$0.02" |
  | gpt-oss-20b | 0,02 | 0,10 | nenhuma |
  | qwen3.7-flash | 0,03 | 0,13 (faixas maiores acima de 32 mil e 256 mil tokens; contexto de 1 M) | nenhuma |
  | gpt-oss-120b | 0,03 | 0,17 | nenhuma |
  | deepseek-v4-flash-0731 | 0,04 | 0,10 (contexto de ~1 M) | nenhuma |

- **RESULTADO:** As 3 anotações batem aproximadamente. Faltam 4 modelos pagos sem anotação, dois deles com contexto de 1 milhão de tokens.
- **CONFIANÇA:** alta (catálogo de 17/09; o preço cobrado da conta do projeto não foi verificado).
- **IMPLICAÇÃO:** Amplia a superfície de custo de A1-01.
- **O QUE FALTA:** Faturamento real da conta.

### A2-66 — OCR: temporizador de ociosidade pode encerrar leitura em curso
- **ORIGEM:** `lib\ocr.ts:92-95,115-131` (citado de passagem pelo A1)
- **STATUS:** VERIFICADA (código)
- **TIPO:** FATO; INFERÊNCIA (frequência)
- **COMO VERIFIQUEI:** `reconhecerImagem` só chama `agendarEncerramento` no `finally` e não cancela o temporizador ao começar.
- **AFIRMAÇÃO:** —
- **RESULTADO:** Uma 2ª leitura iniciada menos de 60 s depois da 1ª, e que dure além do restante do temporizador, é encerrada no meio.
- **CONFIANÇA:** média-alta (não rodei no navegador).
- **IMPLICAÇÃO:** BAIXO.
- **O QUE FALTA:** Teste no navegador.

### A2-67 — Comentário errado em `/api/auditar`
- **ORIGEM:** `index.py:1384` ("1 chamada ao gte-small")
- **STATUS:** CONTRADITÓRIA
- **TIPO:** FATO
- **COMO VERIFIQUEI:** 200 frases geraram 25 chamadas (A2-01).
- **AFIRMAÇÃO:** —
- **RESULTADO:** O correto é 1 chamada a cada 8 frases.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** Documentação.
- **O QUE FALTA:** —

### A2-68 — O 1º lote da ingestão baixa o arquivo duas vezes
- **ORIGEM:** `index.py:1688` (em `_analisar_ingestao`) e `1831`
- **STATUS:** VERIFICADA (código)
- **TIPO:** FATO
- **COMO VERIFIQUEI:** Leitura do código.
- **AFIRMAÇÃO:** —
- **RESULTADO:** O offset 0 faz 2 downloads com timeout de 120 s cada, mais 2 extrações.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** Agrava A1-13 para PDFs grandes.
- **O QUE FALTA:** —

---

## 6. Propostas do Agente 3

**Ainda não disponíveis neste ciclo.** Deixo verificadas premissas que o Agente 3 provavelmente vai usar:
- é possível elevar o `maxDuration` com fluid compute (A2-47);
- a Groq aceita `reasoning_format` (A2-53);
- fpdf2 com `add_font` e a necessidade de empacotar a fonte em `api/_app/` (A2-42);
- o IP não é falsificável na Vercel (A2-46);
- não existe next 15.x com postcss corrigido (A2-22);
- a correção de A1-17 sozinha é insuficiente (A2-63).

## 7. Afirmações que ninguém consegue verificar agora

| Afirmação | Por que não | O que seria necessário |
|---|---|---|
| Estado de produção (service_role, RLS, REVOKE, cota de 16/09) | Acesso proibido | `/api/config`, SQL de políticas e privilégios, contagem antes e depois de DELETE com anon num momento autorizado |
| Plano da Vercel, fluid compute, Firewall e Deployment Protection | Sem acesso ao painel | Configuração do projeto na Vercel |
| Chaves pagas, saldo, teto de gasto e cobrança de chamadas abortadas | Sem acesso | Painéis Nous, Groq, NVIDIA, AnyAPI, Orca e OpenRouter |
| Latências e funcionamento real dos modelos; AnyAPI; `allam-2-7b` | Exige chave | `scripts/medir_latencia.sh` com chaves de teste |
| Limite real de lote e frequência de 546 na Edge Function | Sem acesso | Logs da Edge Function e teste de carga em projeto de teste |
| Perfil dos alunos (quantidade, NAT) | Não documentado | Informação do dono; logs agregados |
| Se alguma restauração com `\copy` já foi feita | Não documentado | Informação do dono |
| Frequência de 504 e de streams sem `fim` | Sem logs | Logs da Vercel |
| Se o valor em `test_admin_auth.py` é a senha real | Não posso comparar com o segredo | Confirmação do dono |
| Comportamento em Python 3.11 e 3.12 | Não instalo nada | Rodar a CI (3.12) e um venv 3.11 |
| DELETE de 0 linhas e 204 no PostgREST do Supabase; padrão de 100 no Storage; plano do pgvector com `match_count` alto | Sem banco local | Supabase local (`supabase start`) |

## 8. Autocrítica

**Em que circunstância minhas verificações estariam erradas?**
1. **Ambiente diferente da produção.** Reproduzi em Python 3.14 com dependências de 17/09, usando TestClient e monkeypatch. A Vercel usa (por inferência) 3.12, com as versões resolvidas no dia do deploy e o adaptador ASGI dela. Decodificação de cabeçalhos não ASCII (A2-14), bufferização do stream (A2-05) e limites de corpo (A2-61) podem se comportar de outro jeito lá.
2. **Resumo automático de páginas web.** O WebFetch resume com um modelo menor e **errou pelo menos uma vez nesta sessão**: disse que 5 IDs não existiam no OpenRouter, e o JSON baixado direto mostrou os 11. Chequei as listas de modelos pela fonte bruta, mas as citações das docs de PostgreSQL, PostgREST, Vercel, Groq (reasoning), pgvector e dos GHSA vieram desse resumo. Podem ter imprecisão de redação, embora as conclusões batam com o código e com o que medi.
3. **Métricas reconstruídas.** V13 e A1-09 usam métricas que eu montei. Coincidiram com as do projeto e do A1, mas a coincidência pode esconder um método diferente. As frases literais de A1-09 são o melhor caso; paráfrases não foram medidas.
4. **Estimativas por proxy.** A de A1-03 (27,5%) usa frases de apostila, não questões de prova. A de custo de A2-01 depende de cobrança de chamadas abortadas e de saldo, ambos desconhecidos.
5. **Ajustes de severidade são OPINIÃO.** A1-02 para MÉDIO e A1-05 para MÉDIO ponderam probabilidade sem dados de uso. Com logs, podem voltar a ALTO.

**Que evidência me faria mudar de opinião?**
- Um Postgres restaurado pelo caminho documentado com `nextval` maior que 1768 sem `setval`: A2-02 seria retirado.
- Logs da Vercel com 504 frequentes em `/api/perguntar/stream`: A2-05 voltaria a ALTO. Logs limpos com volume real: A1-05 poderia cair para BAIXO.
- Chamada real à Groq com `qwen/qwen3.6-27b` em stream sem `<think>`: revejo o item 5 de A2-05 e A2-53.
- Configuração da Vercel com Firewall e rate limit, ou painéis dos provedores com teto de gasto baixo: A2-01 cairia para MÉDIO.
- Questões reais do curso sem gatilho da regex: revejo a severidade de A2-03.
- Confirmação de que o valor do teste não é, nem foi, a senha de produção: A2-59 é retirado.
- Teste na Vercel mostrando que 2 arquivos de 3 MB passam: A2-61 é retirado.

---

**Fontes consultadas** (todas acessadas em 17/09/2026):
- [fpdf2 — Unicode](https://py-pdf.github.io/fpdf2/Unicode.html)
- [PostgreSQL — CREATE TABLE](https://www.postgresql.org/docs/current/sql-createtable.html)
- [PostgreSQL — Identity Columns](https://www.postgresql.org/docs/current/ddl-identity-columns.html)
- [PostgreSQL — Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [PostgreSQL — INSERT](https://www.postgresql.org/docs/current/sql-insert.html)
- [PostgREST — Tables and Views](https://docs.postgrest.org/en/stable/references/api/tables_views.html)
- [PostgREST — URL Grammar](https://docs.postgrest.org/en/stable/references/api/url_grammar.html)
- [PostgREST — Errors](https://docs.postgrest.org/en/stable/references/errors.html)
- [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [supabase/storage — 0002-storage-schema.sql](https://github.com/supabase/storage/blob/master/migrations/tenant/0002-storage-schema.sql)
- [supabase/storage — listObjects.ts](https://raw.githubusercontent.com/supabase/storage/master/src/http/routes/object/listObjects.ts)
- [supabase/storage — object.ts](https://github.com/supabase/storage/blob/master/src/storage/object.ts)
- [supabase-py issue #699](https://github.com/supabase/supabase-py/issues/699)
- [Vercel — Request headers](https://vercel.com/docs/headers/request-headers)
- [Vercel — Functions Limits](https://vercel.com/docs/functions/limitations)
- [Vercel — Python runtime](https://vercel.com/docs/functions/runtimes/python)
- [HTTPX — Timeouts](https://www.python-httpx.org/advanced/timeouts/)
- [Python — hmac](https://docs.python.org/3/library/hmac.html)
- [Groq — Reasoning](https://console.groq.com/docs/reasoning)
- [Groq — Models](https://console.groq.com/docs/models)
- [Groq — Deprecations](https://console.groq.com/docs/deprecations)
- [pgvector README](https://github.com/pgvector/pgvector/blob/master/README.md)
- [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93)
- [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849)
- [npm registry — next](https://registry.npmjs.org/next)
- [npm registry — postcss](https://registry.npmjs.org/postcss/latest)
- [OpenRouter models](https://openrouter.ai/api/v1/models)
- [Nous models](https://inference-api.nousresearch.com/v1/models)
- [NVIDIA models](https://integrate.api.nvidia.com/v1/models)
- [Orca Router models](https://api.orcarouter.ai/v1/models)
- [jsdelivr — por.traineddata.gz](https://cdn.jsdelivr.net/npm/@tesseract.js-data/por/4.0.0_best_int/por.traineddata.gz)
- [jsdelivr — eng.traineddata.gz](https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz)
- Fontes secundárias sobre identity e `setval`, que apareceram na busca e **não** sustentam nenhuma conclusão sozinhas: [oneuptime](https://oneuptime.com/blog/post/2026-01-25-postgresql-reset-primary-key-sequence/view) e [bytebase](https://www.bytebase.com/reference/postgres/how-to/how-to-use-identity-column-postgres/)
