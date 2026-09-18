# 01 — Auditor (Agente 1), Ciclo 3

Raiz do projeto: `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main`

**O que foi executado.** Li o código do backend, do frontend, do SQL e da configuração de deploy. Rodei só funções puras (`rag_core`, `_markdown_para_pdf`, `secrets.compare_digest`) e leituras do dump. Usei o venv descartável do orquestrador (`scratchpad\venv-rag`, Python 3.14) com `-B`, para não gravar bytecode, e o Python 3.11.15 do uv só para compilar em memória. Nada foi gravado no projeto: `find -newer` e `find __pycache__` voltaram vazios. Não chamei a produção.

---

## 1. Compreensão (Ciclo 1)

| Item | Situação |
|---|---|
| Objetivo | Estudar as apostilas com uma IA que responde a partir do material indexado e cita fonte e página (`PROJECT.md` §1). Não existe documento formal de produto: **AUSENTE** |
| Problema | IA genérica inventa; o RAG prende a resposta ao contexto recuperado. Isso é inferido dos prompts, não declarado |
| Público | "Aluno do curso de Engenharia de Prompt", inferido de `api\_app\prompts.py`. Número de usuários **AUSENTE**. Motivo das abas Perfis, Elenco e Suporte UEFI **AUSENTE** |
| Contexto | Backup recuperado em 09/09, correções em 10/09, migração de cota em 16/09. Estado de produção **NÃO VERIFICÁVEL** |
| Restrições | 60 s por função (`vercel.json`), corpo de 4,5 MB na Vercel, lote de 8 textos por chamada à Edge Function. LGPD e restrições institucionais **AUSENTE** |
| Recursos | Cerca de 12 mil linhas e 526 chunks. Equipe **AUSENTE** |
| Prazo / Orçamento | **AUSENTE** / **AUSENTE** (plano Vercel, plano Supabase e gasto com IA) |
| Critérios de sucesso e métricas | **AUSENTE** |
| Premissas implícitas | (a) ids de chunk sempre crescentes; (b) cada requisição custa cerca de 1 chamada de LLM; (c) a resposta cabe em 60 s; (d) o aluno tem IP próprio; (e) a saída do modelo cabe em Latin-1 no PDF; (f) a service_role e as migrações estão aplicadas |

## 2. Decomposição (Ciclo 2)

| Camada | Diagnóstico |
|---|---|
| OBJETIVO | Implícito. Não dá para medir se é atingido |
| PROBLEMA | Plausível, mas a "detecção de alucinação" usada como prova tem viés (A1-09) |
| PREMISSAS | Várias são falsas ou frágeis: ids crescentes (A1-02), 60 s por requisição (A1-05, A1-13), 1 chamada por requisição (A1-01) |
| PROCESSOS | Ingestão e upload têm caminhos que deixam o índice inconsistente e anunciam sucesso (A1-06, A1-07, A1-08) |
| RECURSOS | Não há como avaliar: equipe e orçamento ausentes |
| TECNOLOGIA | Heurísticas centrais com defeito demonstrado (A1-03, A1-09, A1-10) e PDF limitado a Latin-1 (A1-04) |
| OPERAÇÃO | Dependências Python sem versão fixada e três versões de Python em uso (A1-15). Observabilidade é só `print` |
| CUSTOS | Cota contada por requisição, não por chamada de IA; teto global esgotável por terceiros (A1-01) |
| RISCOS | Perda de dados após restauração (A1-02); força bruta no login de admin (A1-14) |
| RESULTADOS | Veredito do Comparar e da Auditoria enviesados (A1-09, A1-10) |
| MÉTRICAS | Ausentes. Não há registro de 429, 500, 504 ou de truncamentos |

---

## 3. Achados (ordenados por severidade)

### A1-01 — API pública de IA sem limite de tamanho, com amplificação por requisição e teto global que terceiros podem esgotar
- **SEVERIDADE:** ALTO
- **PROBLEMA:** O limite de uso conta 1 unidade por requisição HTTP, mas:
  - `/api/resumir-apostila` dispara até 41 chamadas de LLM (40 na fase map, 1 na reduce);
  - `/api/comparar` dispara até 4;
  - `/api/auditar` faz 1 chamada à Edge Function a cada 8 frases mais 1 RPC por frase, sem teto de frases e com `n_por_frase` sem limite.

  Nenhum modelo Pydantic limita tamanho de texto e nenhuma chamada envia `max_tokens`. O teto global diário (5000) é compartilhado: qualquer cliente o consome, inclusive por `/api/buscar`, que nem usa LLM. Quando esgota, todos os alunos ficam bloqueados até 00:00 UTC (21:00 em Brasília), enquanto a mensagem diz "Volte amanhã".
- **LOCAL:**
  - `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\api\index.py:1124,1141,1165-1181` (resumir)
  - `...\api\index.py:1578,1593-1636` (comparar)
  - `...\api\index.py:1359,1375,1380-1391` (auditar)
  - `...\api\index.py:798-800` (buscar consome a cota de LLM)
  - `...\api\index.py:418-422` (cotas)
  - `...\api\_app\provedores.py:180-187,245-253` (corpo sem `max_tokens`)
  - `...\supabase-backup\migracoes\2026-09-16-cota-de-uso.sql:36` (janela em UTC)
- **CAUSA PROVÁVEL:** Limite desenhado por requisição, não por custo. Validação de entrada ausente.
- **EVIDÊNCIA:**
  - FATO: um único `await _limitar_llm(request)` antecede `asyncio.gather(*(extrair_pontos(c) for c in chunks))` com `MAX_CHUNKS_RESUMO = 40` e a chamada reduce.
  - FATO: `chunks = await buscar_chunks(emb, n=max(req.n_por_frase, 3))` roda dentro do laço por frase.
  - FATO: grep por `max_length|constr|Field(` em `api\` deu 0 ocorrências; grep por `max_tokens` em `api`, `lib` e `components` deu 0.
  - Aritmética sobre o código: com os tetos padrão, 5000 requisições/dia de resumir autorizam até 205.000 chamadas de LLM/dia.
  - INFERÊNCIA: o custo em dinheiro depende de quais chaves são pagas. `provedores.py` anota como pagos llama-3.1-8b, nova-micro e mistral-nemo no Nous.
  - HIPÓTESE: que haja abuso de fato.
- **IMPACTO:** Gasto nas chaves pagas; cotas gratuitas dos provedores esgotadas (429 para todos); negação de serviço barata pelo teto global; uso excessivo de invocações da Edge Function.
- **COMO VERIFICAR:** Localmente, com chaves de teste:
  1. enviar a `/api/resumir-apostila` um .txt de cerca de 40.000 caracteres e contar as requisições de saída ao provedor (esperado: 41 para 1 chamada a `consumir_cota`);
  2. enviar a `/api/auditar` uma `resposta` com 200 frases de 40 caracteres ou mais e contar as chamadas a `/functions/v1/embeddings` e `/rpc/match_ementas`.
- **CORREÇÃO:**
  - `max_length` nos campos de texto e em `contexto`;
  - teto em `n_por_frase` (3) e no número de frases auditadas;
  - `max_tokens` por rota;
  - consumo de cota proporcional às chamadas (resumir consome N unidades);
  - cota separada para `/api/buscar`.
- **ALTERNATIVA:** Sessão simples de aluno nas rotas caras, ou rate limit na borda (Vercel Firewall).
- **VALIDAÇÃO:** Testes que enviem entradas acima do limite e esperem 413 ou 422, e um teste que conte as chamadas de cota por rota.

### A1-02 — A restauração documentada não ajusta a sequência de id; a primeira reindexação depois dela apaga os chunks novos
- **SEVERIDADE:** ALTO
- **PROBLEMA:** A troca de chunks "sem janela vazia" apaga `id <= corte` e assume que os chunks novos terão id maior que os antigos. A restauração documentada importa `ementas_chunks` com `id` explícito numa coluna `generated by default as identity`, o que não avança a sequência.
  - Depois disso, os chunks novos nascem com id 1, 2, 3… (o dump vai de 942 a 1768).
  - O último lote apaga antigos **e** novos: o documento fica com zero chunks e a interface registra "✓".
  - Mesmo problema em `glossario_termos` (ids 1 a 44 no dump): as primeiras gravações colidem na chave primária.
- **LOCAL:**
  - `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\supabase-backup\recriar-banco.sql:18,76,116-121` (sem `setval`)
  - `...\README-BACKUP.md:71-74`
  - `...\api\index.py:541-555,1850,1863-1864`
- **CAUSA PROVÁVEL:** Premissa de "identity sempre crescente" não garantida pelo script de recriação.
- **EVIDÊNCIA:**
  - FATO: `id bigint generated by default as identity primary key` e `\copy public.ementas_chunks (id, content, embedding, source, page, created_at)`.
  - FATO: grep por `setval|sequence|restart|identity` só encontra a definição e o docstring.
  - FATO medido: `dumps\ementas_chunks-2026-09-10.jsonl` tem 526 linhas, id mínimo 942 e máximo 1768; `glossario_termos` tem ids de 1 a 44.
  - FATO de semântica do PostgreSQL: valor explícito em identity BY DEFAULT não chama `nextval`.
  - INFERÊNCIA: que a restauração siga esse caminho. É o que o projeto descreve. `scripts\reimportar_chunks.py` não envia id e não tem o problema.
- **IMPACTO:** Perda do índice de cada documento reindexado após uma restauração, justamente no cenário de recuperação que o projeto documenta.
- **COMO VERIFICAR:** Em Postgres com pgvector (Supabase local):
  1. rodar `recriar-banco.sql` e importar o CSV com id;
  2. `select nextval(pg_get_serial_sequence('public.ementas_chunks','id'))` → esperado 1;
  3. inserir sem id e rodar `delete ... where source=X and id <= 1768`;
  4. contar as linhas da fonte → esperado 0.
- **CORREÇÃO:** Após a importação, `select setval(pg_get_serial_sequence('public.ementas_chunks','id'), (select max(id) from public.ementas_chunks));`, e o mesmo para `glossario_termos`. No backend, pedir `Prefer: return=representation` no insert e abortar se algum id novo for ≤ corte.
- **ALTERNATIVA:** Apagar por identificador de lote de ingestão em vez de por faixa de id.
- **VALIDAÇÃO:** Restaurar num banco local, reindexar um documento e conferir que a contagem de chunks da fonte é maior que 0 e igual à de `chunks_novos`.

### A1-03 — `/api/resolver` corta o enunciado da questão no primeiro "a.", "e-" ou "(IA)"
- **SEVERIDADE:** ALTO
- **PROBLEMA:** `_RE_INICIO_ALTERNATIVA` não está presa a início de linha nem a limite de palavra. Qualquer letra de a a e seguida de `.`, `)` ou `-` em qualquer ponto do enunciado vira "início das alternativas". O enunciado truncado alimenta o embedding da busca e o prompt (`QUESTÃO:`).
- **LOCAL:** `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\api\rag_core.py:124,136-137`; uso em `...\api\index.py:1496,1501,1513`
- **CAUSA PROVÁVEL:** Regex `r"\n?\s*[A-Ea-e]\s*[).\-]"`, em que `\n?` e `\s*` são opcionais. Os testes só usam enunciados que terminam em `?`.
- **EVIDÊNCIA:** FATO, executado com a função real e as alternativas "A) um / B) dois / C) tres / D) quatro":

  | Enunciado | Resultado de `extrair_alternativas` |
  |---|---|
  | `Sobre a Inteligência Artificial (IA), assinale a alternativa correta:` | `'Sobre a Inteligência Artificial (I'` |
  | `Uma empresa usa e-mail marketing. Qual a principal métrica?` | `'Uma empresa usa'` |
  | `Leia o trecho da apostila. Em seguida, responda: o que é RAG?` | `'Leia o trecho da apostil'` |
  | `Qual é a principal vantagem do few-shot prompting?` (caso do teste) | intacto |

  As alternativas saem certas em todos os casos, e por isso os testes passam (`tests\test_rag_core.py:107-129`).
- **IMPACTO:** A função "Resolver Questão" busca contexto e raciocina sobre um fragmento do enunciado. Os três exemplos realistas que não terminam só em `?` saíram truncados.
- **COMO VERIFICAR:** `python -B -c "import rag_core as r; print(r.extrair_alternativas('Uma empresa usa e-mail marketing. Qual a métrica?\n\nA) x\nB) y'))"` a partir de `api\`.
- **CORREÇÃO:** Ancorar em início de linha: `re.compile(r"(?m)^\s*[A-Ea-e]\s*[).\-]\s")`, exigindo espaço depois do marcador.
- **ALTERNATIVA:** Usar a posição do primeiro match de `_RE_ALTERNATIVA`, que já é ancorado, como fim do enunciado.
- **VALIDAÇÃO:** Adicionar os exemplos acima como testes de regressão.

### A1-04 — O PDF do Gerador de Apostilas quebra com travessão, aspas curvas, marcadores, reticências, setas ou emoji
- **SEVERIDADE:** ALTO
- **PROBLEMA:** `_markdown_para_pdf` usa a fonte embutida Helvetica do fpdf2, que só aceita Latin-1. Qualquer caractere fora dele, no texto gerado **ou no tema digitado**, levanta exceção. A rota responde 500 **depois** de pagar a chamada ao LLM. PDF é o formato padrão da aba.
- **LOCAL:**
  - `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\api\_app\documentos.py:104-135` (linhas 115 e 118)
  - `...\api\index.py:1107,1113-1115`
  - `...\components\tabs\ApostilaTab.tsx:14` (padrão `'pdf'`)
- **CAUSA PROVÁVEL:** Fonte sem Unicode e ausência de normalização do texto.
- **EVIDÊNCIA:**
  - FATO, executado com fpdf2 2.8.8: `'Texto com acentuação: ção, é, ã.'` gera o PDF. `'Inovação — conceito'`, `'Aspas “curvas”'`, `'Lista • item'`, `'Reticências…'`, `'Seta → x'`, `'Emoji 🚀'` e o título `'Tema — IA'` levantam `FPDFUnicodeEncodingException: Character "—" ... outside the range of characters supported by the font used: "helvetica"`.
  - Nenhum teste cobre `_markdown_para_pdf` (grep em `tests\` sem resultado).
  - INFERÊNCIA: a frequência é alta, porque saídas de LLM em português usam travessão e aspas curvas com frequência, e os próprios prompts do projeto usam "—" dezenas de vezes.
- **IMPACTO:** Falha recorrente do Gerador em PDF, com custo de IA desperdiçado.
- **COMO VERIFICAR:** A partir de `api\`: `python -B -c "from _app.documentos import _markdown_para_pdf; _markdown_para_pdf('a — b','t')"`.
- **CORREÇÃO:** Registrar uma fonte TTF Unicode (ex.: DejaVuSans) com `pdf.add_font` e usá-la. Como mínimo, substituir os caracteres comuns (— – “ ” ‘ ’ • … →) por equivalentes em Latin-1 antes de escrever.
- **ALTERNATIVA:** Gerar o PDF a partir do DOCX, ou trocar de biblioteca.
- **VALIDAÇÃO:** Teste com os 7 casos acima esperando bytes de PDF válidos.

### A1-05 — Streaming da aba Perguntar: sem teto de tempo total, texto parcial descartado, `finish_reason` ignorado e `<think>` exibido
- **SEVERIDADE:** ALTO
- **PROBLEMA:**
  1. `httpx.Timeout(limite)` é timeout de leitura **entre pedaços**, não de duração total. Um modelo que gera devagar e continuamente passa dos 60 s e é cortado pela plataforma. O tempo gasto antes do stream (3 RPCs de cota, embedding com até 2 tentativas de 60 s, busca) também não é descontado.
  2. No front, stream cortado leva a `ApiError` e depois a `setResultado(null)`: o texto que o aluno já estava lendo some.
  3. Se o corte cai no meio de uma linha, `tratar(pendente)` chama `JSON.parse` numa linha incompleta, e a mensagem vira um `SyntaxError` cru.
  4. `finish_reason` nunca é lido (nem no stream nem em `chamar_llm`). Resposta truncada por `length` ou `error` aparece como completa.
  5. `limpar_resposta` não é aplicado no stream. O react-markdown 9.1.0 converte HTML cru em texto (`node_modules\react-markdown\lib\index.js:355-360`), então o `<think>…` aparece literal. Esse texto também vai para auditar, simplificar e exportar.
- **LOCAL:**
  - `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\api\_app\provedores.py:238-275` (240, 264-269)
  - `...\api\index.py:1036-1067`
  - `...\lib\api.ts:167-196` (169, 192, 194-196)
  - `...\components\tabs\PerguntarTab.tsx:96-99`
  - `...\vercel.json` (`maxDuration: 60`)
- **CAUSA PROVÁVEL:** Orçamento de tempo tratado por chamada; parser SSE mínimo; tratamento de erro que descarta o parcial.
- **EVIDÊNCIA:**
  - FATO (código): `async with _http(httpx.Timeout(limite, connect=10.0))`; `delta = json.loads(dado)["choices"][0].get("delta")`, sem ler `finish_reason`; `catch (e) { setErro(...); setResultado(null) }`.
  - FATO da semântica do httpx: `read` é o tempo máximo de espera por um pedaço.
  - INFERÊNCIA: que a Vercel encerre o stream no `maxDuration`.
  - INFERÊNCIA: que `qwen/qwen3.6-27b` emita `<think>` também em stream. O comentário em `provedores.py:38` afirma que emite.
  - A lista curada inclui modelos anotados com 16,6 s e 47,7 s em pergunta trivial, e "~90 s" no OpenRouter.
- **IMPACTO:** Respostas longas ou de modelos lentos falham por inteiro na rota principal, com o texto parcial apagado; respostas cortadas passam como completas.
- **COMO VERIFICAR:** Teste em `tests-js\api-stream.test.ts` com corpo `META\n{"tipo":"texto","t":"metade"}\n{"tipo":"te` (linha incompleta): a mensagem obtida não é "A conexão caiu". Localmente, um provedor falso que emita um token por segundo durante 70 s.
- **CORREÇÃO:**
  - prazo total no gerador (`asyncio.timeout` com o restante do orçamento) e evento `erro` com `parcial: true`;
  - manter o texto parcial na tela com aviso;
  - `try/catch` no `JSON.parse` final;
  - ler `finish_reason` e sinalizar `length` ou `error`;
  - filtrar `<think>` no stream.
- **ALTERNATIVA:** Limitar `max_tokens` para caber no orçamento.
- **VALIDAÇÃO:** Testes JS para linha incompleta e resposta parcial preservada; teste Python com SSE que termine com `finish_reason: "length"`.

### A1-06 — Ingestão em lotes não é idempotente: a retentativa duplica chunks, o abandono deixa o índice misto e a interface anuncia "Concluído"
- **SEVERIDADE:** MÉDIO
- **PROBLEMA:**
  1. `runIngest` repete na hora (sem espera, até 5 vezes) o mesmo `offset` em qualquer erro que não seja 409.
  2. O backend insere (`inserir_chunks`) **antes** de apagar os antigos. Se `apagar_chunks_ate_id` falhar, ou a resposta se perder, a retentativa insere o lote de novo, com ids maiores que o corte, que nunca são apagados.
  3. Depois de 5 falhas, chunks novos parciais e antigos convivem sem rollback, a mensagem diz só que "o conteúdo antigo continua no índice", e a linha 205 ainda registra "✓ Concluído".
  4. Retentativa no offset 0 depois de inserção parcial mede um índice inflado e pode gerar um 409 falso (ver A1-07).
  5. Nos lotes com offset maior que 0, o servidor confia no `corte_id` enviado pelo cliente, que pula a guarda (exige admin).
- **LOCAL:**
  - `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\components\tabs\PdfsTab.tsx:163-214` (183-197, 205)
  - `...\api\index.py:1818-1829,1850-1873`
- **CAUSA PROVÁVEL:** Operações sem chave de idempotência e laço de retentativa cego.
- **EVIDÊNCIA:** FATO (código): `tentativas++; if (tentativas > 5) {...break}` sem `await` de espera; no backend, `await inserir_chunks(rows)` na linha 1859 vem antes de `await apagar_chunks_ate_id(...)` na 1864. INFERÊNCIA: a frequência depende de falhas transitórias do Supabase.
- **IMPACTO:** Chunks duplicados reduzem a diversidade dos 6 trechos de contexto; o administrador acredita que a indexação terminou.
- **COMO VERIFICAR:** Pytest no molde de `tests\test_ingerir_lotes.py`: fazer `_apagar_ate` levantar na primeira chamada e chamar `ingerir(offset=48, corte_id=500)` duas vezes para 50 chunks. `chamadas["inseridos"]` fica 4 (lote de 2 inserido duas vezes).
- **CORREÇÃO:** Antes de reinserir, apagar os chunks da fonte com `id > corte` que vierem de tentativa anterior. Espera exponencial no front. Não registrar "Concluído" quando algum arquivo falhou. Registrar o `corte` no servidor em vez de confiar no cliente.
- **ALTERNATIVA:** Gravar numa tabela de preparação e trocar numa transação (RPC).
- **VALIDAÇÃO:** O teste acima passa a contar 2; teste de front que simule falha e verifique ausência de "✓ Concluído".

### A1-07 — Substituição confirmada no upload nunca é indexada, e a interface registra sucesso
- **SEVERIDADE:** MÉDIO
- **PROBLEMA:**
  - Ao confirmar um upload bloqueado (`enviar(true)`), o arquivo novo sobrescreve o Storage, mas `runIngest(mudou)` roda **sem** `forcar`. A ingestão aplica o mesmo critério da guarda e responde 409.
  - No 409, o código faz `done = true; break`, cai em `if (done)` e registra `✓ nome: 0 chunks`, depois `✓ Concluído` e `setBloqueado(false)`. O botão de confirmação da reindexação não aparece, porque `analises` está vazio.
  - O índice continua com a versão antiga. Reenviar o mesmo arquivo retorna "conteúdo idêntico já indexado", já que o MD5 é comparado com o Storage e não com o índice.
  - Variante: um 409 no meio de um upload com vários arquivos deixa os arquivos anteriores no Storage sem indexação.
- **LOCAL:**
  - `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\components\tabs\PdfsTab.tsx:184-192,200-208,241,378-383`
  - `...\api\index.py:1918-1933` (409 no meio do laço), `1923-1926` (dedupe pelo Storage)
- **CAUSA PROVÁVEL:** `forcar` não é propagado do upload para a ingestão; o 409 é tratado como `done`.
- **EVIDÊNCIA:** FATO (código): `await runIngest(mudou)` sem segundo argumento; o bloco de 409 atribui `done = true` antes do `break`; as linhas 200-203 registram "✓". Os critérios de `_risco_de_perda` (1766-1776) e de `_analisar_ingestao` (1707-1720) são os mesmos, então o bloqueio na ingestão é determinístico sempre que o upload precisou de `forcar`.
- **IMPACTO:** Índice e Storage divergentes, sucesso falso e um reenvio que não conserta nada.
- **COMO VERIFICAR:** Supabase local: indexar A.pdf, enviar A.pdf com muito menos texto, confirmar e ler o log (sequência "⛔ … ✓ A.pdf: 0 chunks … ✓ Concluído").
- **CORREÇÃO:** `runIngest(mudou, forcar)` quando o upload foi forçado; no 409, `done = false`, preencher `analises` e manter `bloqueado`; dedupe do upload também pelo estado do índice.
- **ALTERNATIVA:** O upload devolve a análise e a UI exige passar pela prévia.
- **VALIDAÇÃO:** O teste acima termina com os chunks da versão nova e sem "✓" para arquivo bloqueado.

### A1-08 — Upload "mesmo conteúdo, nome diferente" sobre um nome já indexado mistura documentos e escapa da guarda
- **SEVERIDADE:** MÉDIO
- **PROBLEMA:** Cenário: Storage com A.pdf (conteúdo X) e B.pdf (conteúdo Y), ambos indexados; o admin envia um arquivo chamado B.pdf com conteúdo X.
  - `igual` = A.pdf, então `fonte_afetada` = A.pdf e a guarda compara X com X e libera.
  - O código então sobrescreve B.pdf no Storage (`x-upsert`), renomeia os chunks de A para B (B passa a ter chunks de X **e** de Y) e remove A.pdf.
  - A guarda nunca olhou B. Na reindexação seguinte, se Y for até cerca de 66% de X, os chunks de Y são apagados sem aviso. O arquivo Y já foi sobrescrito.
- **LOCAL:** `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\api\index.py:1923-1949,590`
- **CAUSA PROVÁVEL:** `fonte_afetada` considera só uma das duas fontes afetadas.
- **EVIDÊNCIA:** FATO (código): `fonte_afetada = igual["nome"] if igual else (...)`; dentro de `if igual:` vêm `upload_documento_storage(nome, ...)`, `renomear_fonte_chunks(igual["nome"], nome)` e `remover_documento_storage(igual["nome"])`, sem checar `nome in por_nome`.
- **IMPACTO:** Perda do documento B, justamente a classe de perda que `CORRECOES §2` diz ter fechado.
- **COMO VERIFICAR:** Pytest com monkeypatch de `listar_arquivos_storage` (A com md5 X, B com md5 Y), `_risco_de_perda`, `upload_documento_storage`, `renomear_fonte_chunks` e `remover_documento_storage`. Enviar B.pdf com os bytes de X e verificar que `_risco_de_perda` só foi chamado com "A.pdf" e que houve renomeação A→B.
- **CORREÇÃO:** Se `igual` existir e `nome in por_nome` com MD5 diferente, rodar a guarda também para `nome`, ou recusar com 409 explícito.
- **ALTERNATIVA:** Recusar renomeação sobre nome existente.
- **VALIDAÇÃO:** O teste acima espera 409 ou guarda aplicada às duas fontes.

### A1-09 — A auditoria de fidelidade ("detecção de alucinação") compara palavras sem acento com trechos acentuados
- **SEVERIDADE:** MÉDIO
- **PROBLEMA:** `_nucleo_palavras` remove acentos da frase, mas `frase_tem_apoio_textual` procura as palavras em `content.lower()`, que mantém os acentos. Palavras como "inovacao", "gestao" ou "negocios" nunca casam com "inovação", "gestão" ou "negócios". Frases fiéis são rebaixadas para "parcial" ou "não apoiada — a IA pode ter inventado".
- **LOCAL:** `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\api\rag_core.py:221-223,244-245`; uso em `...\api\index.py:1399-1403`
- **CAUSA PROVÁVEL:** Normalização aplicada só de um lado.
- **EVIDÊNCIA:** FATO, medido no dump real (`dumps\ementas_chunks-2026-09-10.jsonl`, 1.547 frases copiadas **literalmente** do próprio chunk):
  - cobertura média de palavras-chave de 0,782 hoje, contra 1,0 com o chunk normalizado;
  - a classificação muda em 54 frases (3,5%);
  - exemplo sintético: `'A inovação na gestão de negócios exige análise estratégica do público.'` contra um chunk que a contém dá `nenhum`.
  - O teste `tests\test_rag_core.py:409-416` ("2 de 6 palavras = parcial") só passa por causa do defeito: com normalização, "negocios" casa e o resultado vira 3/6, ou seja "total".
  - INFERÊNCIA: em paráfrases o efeito é maior, porque a cobertura já fica perto dos limiares de 0,5 e 0,3.
- **IMPACTO:** Falsos alarmes de "provável invenção" (a auditoria é automática por padrão) e perda de confiança no recurso.
- **COMO VERIFICAR:** `python -B -c "import rag_core as r; print(r.frase_tem_apoio_textual('A inovação na gestão de negócios exige análise estratégica do público.', [{'content':'A inovação na gestão de negócios exige análise estratégica do público.'}]))"` → `nenhum`.
- **CORREÇÃO:** `texto_chunk = _sem_acento_minusculo(c.get("content") or "")`.
- **ALTERNATIVA:** Comparar conjuntos de tokens normalizados dos dois lados.
- **VALIDAÇÃO:** Com o mesmo script, cobertura média de 1,0 nas frases literais; revisar o teste das linhas 409-416.

### A1-10 — Comparar Modelos declara divergência quando um modelo escreve um número e o outro não
- **SEVERIDADE:** MÉDIO
- **PROBLEMA:** `divergencia_numerica = bool(numeros_exclusivos)` marca nível "baixa" (título "Os modelos divergem") sempre que um número aparece em só uma conclusão: "5" contra "cinco", um ano citado por um só modelo, ou páginas diferentes na citação, que a conclusão de reserva costuma capturar. Número exclusivo não é número conflitante.
- **LOCAL:** `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\api\rag_core.py:483-488,267-281`
- **CAUSA PROVÁVEL:** A regra foi calibrada só para o caso "26 milhões contra 450 mil" (`tests\test_rag_core.py:269-281`).
- **EVIDÊNCIA:** FATO (executado):
  - `'O método NEOSA tem 5 pilares: ...'` contra `'O método NEOSA possui cinco pilares: ...'` dá `baixa`, `[{'fato': '5', ...}]`, com similaridade 0,8;
  - conclusões idênticas que só diferem em "página 12" e "página 14" dão `baixa`;
  - `conclusao_fallback` devolve a linha `'Isso aparece na apostila [Fonte: Praticas.pdf, página 12].'`.
- **IMPACTO:** O veredito, que orienta "onde vale estudar", aponta divergências inexistentes.
- **COMO VERIFICAR:** Rodar `calcular_concordancia` com os pares acima.
- **CORREÇÃO:** Considerar divergência numérica só quando **ambos** os modelos citam números e os conjuntos diferem; remover citações `[Fonte: …, página N]` antes de extrair números.
- **ALTERNATIVA:** Normalizar numerais por extenso (um a dez).
- **VALIDAÇÃO:** Os dois pares acima passam a dar "alta"; o teste existente de 26 contra 450 continua dando "baixa".

### A1-11 — Aba Perguntar: nova pergunta liberada durante o stream e auditoria atrasada sobrescrevem o resultado
- **SEVERIDADE:** MÉDIO
- **PROBLEMA:**
  1. `onMeta` faz `setLoading(false)`, e o botão "Perguntar" depende só de `loading`. Ele volta a ficar ativo enquanto o texto ainda chega. Um segundo envio deixa dois streams escrevendo em `setResultado`; o `finally` do primeiro desliga `recebendo` do segundo; o resultado final depende de qual termina por último.
  2. A auditoria automática da resposta N pode terminar depois do envio N+1 e chamar `setAuditoria(a)` com frases da resposta anterior.
  3. "Explicar mais simples", "Testar entendimento" e "Exportar" usam o texto atual da caixa (`pergunta`), não a pergunta que gerou a resposta.

  Não há `AbortController`.
- **LOCAL:** `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\components\tabs\PerguntarTab.tsx:84-95,105-116,122,135,166,221`
- **CAUSA PROVÁVEL:** Estado sem identificador de rodada e sem cancelamento.
- **EVIDÊNCIA:** FATO (código): `disabled={loading || ocrLoading || !pronto}` e `setLoading(false)` dentro de `onMeta`; `auditar()` não confere se ainda é a rodada atual. INFERÊNCIA: a frequência depende de o usuário reenviar durante o stream ou perguntar em sequência rápida.
- **IMPACTO:** Resposta, fontes e auditoria de perguntas diferentes misturadas na mesma tela.
- **COMO VERIFICAR:** Navegador com rede em "Slow 3G": clicar Perguntar, esperar o primeiro texto e clicar de novo com outra pergunta.
- **CORREÇÃO:** Desabilitar o envio com `recebendo`; guardar um `rodadaRef` e ignorar callbacks e auditorias de rodadas antigas; `AbortController` no `fetch`; gravar a pergunta junto do resultado.
- **ALTERNATIVA:** Enfileirar ou cancelar a requisição anterior.
- **VALIDAÇÃO:** Teste de componente, ou manual, com dois envios: só a última rodada altera o estado.

### A1-12 — "Extrair termos técnicos desta questão" não gera o glossário na primeira navegação
- **SEVERIDADE:** MÉDIO
- **PROBLEMA:** O `TabPanel` só monta a aba Glossário na primeira ativação. Na montagem, `useProviderModel` começa com `provider = ''`, então `pronto` é `false` nesse render. O efeito do `seed` roda com essa closure e `gerar()` sai em `if (!pronto) return`. O tema aparece na caixa, nenhuma requisição é feita e nenhuma mensagem é exibida. Funciona só se o Glossário já tiver sido aberto antes.
- **LOCAL:**
  - `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\components\tabs\GlossarioTab.tsx:64-65,82-87`
  - `...\lib\useProviderModel.ts:57,109`
  - `...\components\TabPanel.tsx:19-20,57`
  - `...\components\tabs\ResolverTab.tsx:325-327`
  - `...\app\page.tsx:60-63`
- **CAUSA PROVÁVEL:** Efeito disparado antes de o estado do provedor ser resolvido.
- **EVIDÊNCIA:** FATO pela semântica do React: os efeitos do primeiro commit enxergam o estado do primeiro render, e `useState('')` não é atualizado até o render seguinte.
- **IMPACTO:** O fluxo Resolver → Glossário falha em silêncio na primeira vez de cada sessão.
- **COMO VERIFICAR:** Carregar a página sem abrir o Glossário, resolver uma questão, clicar "Extrair termos…" e observar no DevTools que não sai nenhuma requisição a `/api/glossario`.
- **CORREÇÃO:** Guardar o seed pendente e disparar `gerar` num efeito que dependa de `[seed?.tick, pronto]`.
- **ALTERNATIVA:** Passar provedor e modelo do Resolver junto com o seed.
- **VALIDAÇÃO:** O teste manual acima gera a requisição na primeira vez.

### A1-13 — O orçamento de 60 s vale por chamada, não por requisição (resumir-apostila, glossário, download do Storage)
- **SEVERIDADE:** MÉDIO
- **PROBLEMA:** `.env.example` promete "nunca estourar o limite da plataforma", mas:
  1. `/api/resumir-apostila` roda a fase map (até 40 chamadas de até 52 s cada) e depois a reduce (mais até 52 s). Pode passar de 100 s e ser cortada depois de pagar todas as chamadas map.
  2. `extrair_pontos` só captura `HTTPException`. Um corpo 200 malformado (`r.json()["choices"][0]["message"]["content"]`) derruba o `gather` inteiro.
  3. Trechos que falharam somem em silêncio e `chunks_usados` reporta `len(chunks)`, não os que deram certo.
  4. No glossário, `inicio` é marcado **depois** do limite de uso, do embedding e da busca.
  5. `baixar_documento_storage` usa timeout de 120 s, contrariando o comentário da função vizinha, e roda a cada lote de ingestão.
  6. Em todas as rotas, o tempo gasto antes do LLM não é descontado de `TIMEOUT_LLM`.
- **LOCAL:**
  - `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\api\index.py:1165-1188,1428-1457,583-586,634-638,1831`
  - `...\api\_app\http_util.py:15-20`
  - `...\api\_app\provedores.py:211`
  - `...\.env.example:29-31`
- **CAUSA PROVÁVEL:** `TIMEOUT_LLM` é constante e não existe prazo por requisição.
- **EVIDÊNCIA:** FATO (código): `TIMEOUT_LLM = TEMPO_MAX_FUNCAO - MARGEM_SEGURANCA`, aplicado a cada chamada; `inicio = time.perf_counter()` na linha 1450, depois das linhas 1428-1435; `httpx.Timeout(120.0, connect=10.0)`. INFERÊNCIA: corte pela plataforma; provedores gratuitos devolvendo 429 com 40 chamadas simultâneas.
- **IMPACTO:** 504 depois do gasto; resumos incompletos apresentados como completos.
- **COMO VERIFICAR:** Pytest com monkeypatch de `chamar_llm` usando `asyncio.sleep` controlado e tempo simulado. Para o item 2, `chamar_llm` falso que levante `KeyError` para um trecho: a rota responde 500.
- **CORREÇÃO:** Prazo por requisição (`inicio` no começo da rota e passado adiante); a reduce usa o restante; capturar `Exception` em `extrair_pontos`; devolver `chunks_ok`; timeout de download dentro do orçamento; limitar a concorrência (semáforo).
- **ALTERNATIVA:** Rodar o resumo em etapas chamadas pelo cliente, como a ingestão em lotes.
- **VALIDAÇÃO:** Teste com tempos simulados em que a soma nunca passe de `TEMPO_MAX_FUNCAO`.

### A1-14 — Login de admin sem limite de tentativas e com erro 500 para credenciais acentuadas
- **SEVERIDADE:** MÉDIO
- **PROBLEMA:**
  1. `/api/admin/login` não chama nenhum limitador: tentativas de senha ilimitadas. A sessão emitida vale 8 h e libera upload, ingestão e troca de índice.
  2. `secrets.compare_digest` com `str` levanta `TypeError` se qualquer lado tiver caractere não ASCII. Se `ADMIN_PASS` tiver "ç" ou "ã", o login **sempre** dá 500, mesmo com a senha certa. Um cabeçalho `X-Admin-Token` com byte acima de 0x7F também dá 500.
- **LOCAL:** `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\api\index.py:756-773` (770), `357`
- **CAUSA PROVÁVEL:** Comparação de `str` em vez de `bytes`; ausência de limitador.
- **EVIDÊNCIA:** FATO (executado): `compare_digest('senhação','senhação')` → `TypeError comparing strings with non-ASCII characters is not supported`; com `.encode()` → `True`. FATO: `admin_login` não contém `_limitar_llm` nem outro controle.
- **IMPACTO:** Força bruta viável contra senha fraca; administrador preso fora com senha acentuada.
- **COMO VERIFICAR:** Script acima; TestClient com `ADMIN_PASS="senhação"` e login correto → 500.
- **CORREÇÃO:** `compare_digest(a.encode(), b.encode())`; limite por IP no login (ex.: 5 por minuto via `consumir_cota`) com atraso progressivo.
- **ALTERNATIVA:** Supabase Auth para o admin.
- **VALIDAÇÃO:** Testes de login acentuado (200) e da sexta tentativa em um minuto (429).

### A1-15 — Dependências Python sem versão fixada e três versões de Python em uso
- **SEVERIDADE:** MÉDIO
- **PROBLEMA:** `requirements.txt` só usa `>=`, sem lockfile. Cada deploy e cada CI instala o que for mais recente. Local usa 3.11, CI e ruff miram 3.12, a execução de hoje foi em 3.14, e a versão de Python na Vercel não está declarada. A guarda de 60% depende do volume de texto que o pypdf extrai (pypdf `>=4.0.0` resolveu 6.19.0).
- **LOCAL:**
  - `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\requirements.txt`
  - `...\iniciar-tudo.bat:59`
  - `...\.github\workflows\ci.yml` (`python-version: "3.12"`)
  - `...\ruff.toml` (`target-version = "py312"`)
- **CAUSA PROVÁVEL:** Ausência de política de versões.
- **EVIDÊNCIA:**
  - FATO (`00-execucao.md`): fastapi 0.141.1, starlette 1.6.0, pypdf 6.19.0, com `StarletteDeprecationWarning: Using httpx with starlette.testclient is deprecated`.
  - FATO: compilei em memória os 25 .py com Python 3.11.15 e não houve erro de sintaxe hoje. O risco é latente, não atual.
  - INFERÊNCIA: uma atualização de pypdf ou starlette pode mudar a contagem de caracteres (guarda) ou quebrar os testes e o runtime sem mudança de código.
- **IMPACTO:** Deploys não reproduzíveis; regressões silenciosas.
- **COMO VERIFICAR:** `pip install -r requirements.txt` em dois dias diferentes e comparar `pip freeze`; rodar pytest em 3.11 e em 3.12.
- **CORREÇÃO:** Lockfile (`pip-compile` ou `uv lock`) com versões exatas; declarar a versão de Python; CI em matriz 3.11/3.12, ou unificar numa só.
- **ALTERNATIVA:** Limites superiores de major (`fastapi<0.142`, `pypdf<7`).
- **VALIDAÇÃO:** `pip freeze` idêntico entre CI e deploy.

### A1-16 — O limite por IP consome em dobro com a auditoria automática e pode travar turmas atrás do mesmo IP
- **SEVERIDADE:** MÉDIO
- **PROBLEMA:**
  - Cada pergunta consome 2 unidades (stream mais `/api/auditar`, ligado por padrão), e 3 ou mais se o aluno usar simplificar ou verificar.
  - O limite efetivo cai para 10 perguntas por minuto e 150 por dia **por IP**.
  - `/api/buscar`, que não usa LLM, consome a mesma cota.
  - Cada chamada faz até 3 RPCs sequenciais de cota antes de começar.
- **LOCAL:**
  - `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\components\tabs\PerguntarTab.tsx:41,93-95`
  - `...\api\index.py:173-176,418-439,800,1375`
- **CAUSA PROVÁVEL:** Unidade de cota igual a requisição, sem distinguir o tipo de requisição.
- **EVIDÊNCIA:** FATO: `auditarAuto` começa `true` e `auditar` chama `_limitar_llm`. HIPÓTESE: alunos em rede de escola ou empresa compartilham IP público (NAT); não há informação sobre o público.
- **IMPACTO:** Uma turma de cerca de 30 alunos atrás de um mesmo IP recebe 429 constante e esgota 300 unidades por dia em poucos minutos de aula.
- **COMO VERIFICAR:** Em ambiente local com a migração aplicada, contar as chamadas a `consumir_cota` por pergunta; confirmar com o dono o perfil de rede dos alunos.
- **CORREÇÃO:** Auditoria e busca fora da cota de LLM, ou com cota própria; RPC única que consuma as 3 chaves numa só ida.
- **ALTERNATIVA:** Cota por sessão anônima (cookie assinado) somada ao IP.
- **VALIDAÇÃO:** Uma pergunta resulta em exatamente 1 consumo de cota de LLM.

### A1-17 — O Gerador de apostilas bloqueia quando a busca falha, ao contrário do documentado (V17)
- **SEVERIDADE:** BAIXO
- **PROBLEMA:** O docstring diz "segue só com conhecimento geral quando a base estiver vazia ou indisponível — nunca bloqueia". Mas `gerar_embeddings` e `buscar_chunks` levantam `httpx.HTTPStatusError` ou `TransportError`, e o `except` só captura `HTTPException`. Base indisponível resulta em 500.
- **LOCAL:** `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\api\index.py:1080-1099,475-484,495`
- **CAUSA PROVÁVEL:** Tipo de exceção errado.
- **EVIDÊNCIA:** FATO (código): `except HTTPException: pass`; `r.raise_for_status()` em `gerar_embeddings` e `buscar_chunks`. Só `_checar_config_supabase` levanta `HTTPException`.
- **IMPACTO:** Apostila não gerada durante instabilidade da Edge Function, que o próprio código reconhece como frequente (546, cold start).
- **COMO VERIFICAR:** Pytest: monkeypatch de `gerar_embeddings` levantando `httpx.HTTPStatusError`; a rota não chega a chamar `chamar_llm`.
- **CORREÇÃO:** `except (HTTPException, httpx.HTTPError):`.
- **ALTERNATIVA:** Timeout curto específico para essa busca opcional.
- **VALIDAÇÃO:** O teste acima chega ao LLM e devolve o arquivo.

### A1-18 — Glossário: termo repetido derruba o salvamento do lote inteiro, e a busca quebra com vírgula ou parênteses
- **SEVERIDADE:** BAIXO
- **PROBLEMA:**
  1. `extrair_termos_glossario` não remove duplicatas por `lower(termo)`. Um upsert em lote com duas linhas de mesma `termo_normalizado` falha inteiro no PostgreSQL (ON CONFLICT DO UPDATE não pode afetar a mesma linha duas vezes), o que vira `aviso_salvamento` e nenhum termo é salvo.
  2. A busca interpola `q` sem aspas no filtro `or=(...)` do PostgREST. Vírgula ou parênteses no termo levam a 400, depois 500, e o front mostra "Nenhum termo salvo encontrado".
- **LOCAL:**
  - `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\api\rag_core.py:584-597`
  - `...\api\index.py:660-671,682-684`
  - `...\components\tabs\GlossarioTab.tsx:47-49,108-111`
- **CAUSA PROVÁVEL:** Falta de deduplicação e de escape.
- **EVIDÊNCIA:** FATO (código). INFERÊNCIA: códigos de erro do PostgreSQL e do PostgREST para esses casos (erro 21000 e parse do `or`), não executados contra o banco.
- **IMPACTO:** Glossário não persiste em algumas gerações; busca falha em silêncio.
- **COMO VERIFICAR:** Supabase local: POST com `[{"termo":"LGPD",...},{"termo":"lgpd",...}]` e `on_conflict=termo_normalizado`; GET com `q=a,b`.
- **CORREÇÃO:** Deduplicar por `termo.lower()` antes de gravar; colocar o valor entre aspas duplas no filtro, ou usar uma RPC.
- **ALTERNATIVA:** Gravar termo a termo.
- **VALIDAÇÃO:** Os dois casos acima passam.

### A1-19 — Falhas silenciosas na interface e em `/api/status`
- **SEVERIDADE:** BAIXO
- **PROBLEMA:**
  1. `/api/status` não chama `raise_for_status` no HEAD: um 401 ou 5xx do Supabase vira `total=0`, `status="empty"`, fica em cache por 30 s, e o cabeçalho mostra "sem dados" em vez de "offline".
  2. Se `/api/providers` falhar uma vez, `setProviders({})` fica para sempre: todos os botões desabilitados, sem aviso, porque `nenhumConfigurado` exige `chaves.length > 0`, e sem nova tentativa.
  3. As listas de personas e perfis e a auditoria usam `.catch(() => undefined)` ou `setAuditoria(null)` sem mensagem.
- **LOCAL:**
  - `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\api\index.py:713-726`
  - `...\app\page.tsx:65-70`
  - `...\lib\useProviderModel.ts:110`
  - `...\components\tabs\PerguntarTab.tsx:110-113`
  - `...\components\tabs\ElencoTab.tsx:49`, `SuporteTab.tsx:74`, `PerfisComportamentaisTab.tsx:49`
- **CAUSA PROVÁVEL:** Tratamento de erro por omissão.
- **EVIDÊNCIA:** FATO (código).
- **IMPACTO:** Diagnóstico errado ("sem dados" ou "botão travado") e reclamações sem pista do motivo.
- **COMO VERIFICAR:** Front local com o backend desligado no carregamento e religado depois: os botões continuam desabilitados sem mensagem.
- **CORREÇÃO:** `r.raise_for_status()` no status; nova tentativa com mensagem ao falhar em providers; mensagem de "auditoria indisponível".
- **ALTERNATIVA:** Banner global de "backend indisponível".
- **VALIDAÇÃO:** Mesmo teste mostra mensagem e recupera ao religar.

### A1-20 — Verificação de RLS por status 204 não prova nada; o script de recriação não tem REVOKE nem a cota
- **SEVERIDADE:** BAIXO
- **PROBLEMA:**
  - A migração de 10/09 espera que DELETE com a chave anon devolva 401/403 depois de ligar o RLS. Com RLS ligado e sem política, o PostgreSQL filtra as linhas em silêncio e o PostgREST responde 204 sem apagar nada.
  - A migração "fechar-dml-definitivo" diz que "os DELETE continuam com 204", o que é compatível com esse filtro silencioso e não com apagamento real.
  - O critério usado em `CORRECOES §1` ("204 — apagava") e o planejado para verificar V19 não distinguem os dois casos.
  - `recriar-banco.sql` não traz o `REVOKE` nem `cota_uso`/`consumir_cota`. Um banco restaurado fica sem tetos diários, e o código cai para o limite só em memória, sem aviso na interface.
- **LOCAL:**
  - `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\supabase-backup\migracoes\2026-09-10-rls-e-glossario.sql:115-117`
  - `...\supabase-backup\migracoes\2026-09-10-rls-fechar-dml-definitivo.sql:6-8,32-33`
  - `...\supabase-backup\recriar-banco.sql:88-98`
  - `...\CORRECOES-2026-09-10.md:17`
- **CAUSA PROVÁVEL:** Status HTTP usado como prova de efeito.
- **EVIDÊNCIA:** FATO (textos citados). INFERÊNCIA: semântica de RLS e PostgREST, não executada aqui.
- **IMPACTO:** Conclusões erradas sobre o estado de segurança da produção; banco restaurado sem cota.
- **COMO VERIFICAR:** Supabase local: ligar RLS sem REVOKE e fazer DELETE com anon e `Prefer: return=representation`. Esperado: 200 com `[]` (ou 204 sem o Prefer) e contagem inalterada.
- **CORREÇÃO:** Verificar pela contagem antes e depois, ou por `return=representation`; incluir REVOKE e a migração de cota no `recriar-banco.sql`.
- **ALTERNATIVA:** Script de verificação único que imprima a contagem.
- **VALIDAÇÃO:** Documentação e scripts usam contagem, não status.

### A1-21 — Documentação divergente do código
- **SEVERIDADE:** BAIXO
- **PROBLEMA:**
  - `CORRECOES` fala em "50" e "58" testes; hoje são 145 em Python e 35 em JS.
  - `README-BACKUP` lista 3 rotas protegidas; o código protege também `/api/ingerir/previa` e `/api/pdfs`.
  - `CORRECOES §6` fala em "25 MB por upload"; na Vercel são 4 MB.
  - `.env.example` não tem `ANYAPI_API_KEY`, `ORCAROUTER_API_KEY`, `MAX_UPLOAD_MB` nem `BACKEND_URL`.
  - A mensagem do `ProviderSelect` cita só NOUS, GROQ, OPENROUTER e NVIDIA.
  - `README-BACKUP` cita AIHubMix, que não existe no código.
  - `.env.example` promete "nunca estourar" o limite (ver A1-05 e A1-13).
- **LOCAL:**
  - `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\CORRECOES-2026-09-10.md:6,106,200`
  - `...\README-BACKUP.md:48,63-64`
  - `...\.env.example:31-38`
  - `...\components\ProviderSelect.tsx:58-60`
- **CAUSA PROVÁVEL:** Documentos não atualizados junto com o código.
- **EVIDÊNCIA:** FATO (arquivos e `00-execucao.md`).
- **IMPACTO:** Configuração incompleta em novo ambiente (provedores AnyAPI e Orca Router ficam sem chave) e confiança indevida nos documentos.
- **COMO VERIFICAR:** Comparar os trechos citados com `api\index.py` e `api\_app\provedores.py`.
- **CORREÇÃO:** Atualizar os documentos e o `.env.example`; gerar a lista de variáveis a partir de `PROVIDERS`.
- **ALTERNATIVA:** Teste que falhe se alguma `env_key` de `PROVIDERS` faltar no `.env.example`.
- **VALIDAÇÃO:** O teste acima passa.

### A1-22 — npm audit: postcss vulnerável aninhado no next
- **SEVERIDADE:** BAIXO
- **PROBLEMA:** `npm audit --omit=dev` aponta 1 vulnerabilidade high (`postcss <=8.5.22` em `node_modules/next/node_modules/postcss`) e 1 moderate (`next`). A correção sugerida é next 16, com mudança incompatível.
- **LOCAL:** `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\package.json` (`next 15.5.25`); `00-execucao.md`
- **CAUSA PROVÁVEL:** Dependência transitiva fixada pelo next.
- **EVIDÊNCIA:** FATO (execução). INFERÊNCIA: o postcss roda no build sobre o CSS do próprio projeto, então a exploração por usuário final é improvável. Não avaliado em profundidade.
- **IMPACTO:** Baixo, e alerta recorrente no CI e na auditoria.
- **COMO VERIFICAR:** `npm ls postcss` e `npm audit`.
- **CORREÇÃO:** Acompanhar uma versão 15.x do next com a postcss corrigida; `overrides` para postcss ≥ 8.5.23, se compatível.
- **ALTERNATIVA:** Aceitar o risco documentado até migrar para o next 16.
- **VALIDAÇÃO:** `npm audit --omit=dev` sem high.

---

## 4. Informações que faltam para uma decisão segura

1. **Estado da produção (V19):** `SUPABASE_SERVICE_ROLE_KEY` definida? RLS e REVOKE aplicados (verificados por contagem, não por status)? Migração de 16/09 aplicada? `/api/config` público responde `inseguro`?
2. **Quais chaves de IA são pagas** e se há teto de gasto no painel de cada provedor.
3. **Plano da Vercel** (limite real de `maxDuration`, suporte a streaming na função Python, Firewall ou Deployment Protection ativos) e versão de Python usada no build.
4. **Plano do Supabase** e cotas de invocação da Edge Function.
5. **Perfil de acesso dos alunos:** quantos são e se compartilham IP (NAT de escola ou empresa).
6. **Se alguma restauração com `recriar-banco.sql` e `\copy` já foi feita** em algum ambiente.
7. **Logs de produção:** taxa de 429, 500 e 504 e de streams sem evento `fim`.
8. **Formato real das mensagens SSE de erro** de cada provedor e se `qwen/qwen3.6-27b` emite `<think>` no stream.

## 5. O que não consegui verificar

- **Qualquer comportamento em produção:** sem `.env` e com chamadas proibidas.
- **Se a Vercel sobrescreve** `x-vercel-forwarded-for`, `x-real-ip` e `x-forwarded-for` enviados pelo cliente, como afirma o comentário em `api\index.py:385-386`. Fora da Vercel (uvicorn local) esses cabeçalhos são falsificáveis, e o teste `test_ip_usa_x_forwarded_for_quando_ha_proxy` confirma que são aceitos.
- **Limite padrão de 100 itens** em `POST /storage/v1/object/list` sem `limit` (`api\index.py:599-603`). É uma inferência sobre a API do Supabase: com mais de 100 arquivos, dedupe, prévia e ingestão deixariam arquivos de fora. Hoje são 4.
- **Se o HNSW** (`ef_search` padrão) limita o `match_count` alto de `/api/auditar`.
- **UI rodando no navegador:** não executei. Os achados de React (A1-11, A1-12, A1-19) são de leitura de código.
- **Revisão profunda** de `lib\compress\*`, `ComprimirTab.tsx`, `SuporteTab.tsx`, `ElencoTab.tsx`, `PerfisComportamentaisTab.tsx` e dos scripts em `scripts\`: só li por cima. Vi mas não detalhei dois problemas menores:
  - em `AnexoImagem.tsx`, remover um anexo durante a leitura ainda insere o texto no campo;
  - em `lib\ocr.ts`, o temporizador de ociosidade não é cancelado quando começa um novo reconhecimento, o que pode encerrar o worker no meio de uma leitura longa.
- **Testes em Python 3.11 e 3.12:** só compilei em 3.11.
- **Comportamento do fpdf2** em versões anteriores a 2.8.8.

## 6. Autocrítica (3 achados mais graves)

**A1-01 (custo e disponibilidade)**
- *Em que circunstância estaria errado?* Se a produção tiver proteção fora do repositório: Vercel Firewall com rate limit, Deployment Protection ou URL não divulgada. Ou se todas as chaves forem de planos gratuitos com teto rígido no provedor, e aí o risco vira só de disponibilidade.
- *Que evidência me faria mudar?* Configuração da Vercel mostrando regras de firewall ou proteção; painéis dos provedores com teto de gasto; logs sem tráfego anômalo; confirmação de que o app é de uso interno restrito.

**A1-02 (perda após restauração)**
- *Em que circunstância estaria errado?* Se nenhuma restauração usar o caminho `\copy` com `id`: por exemplo, usando só `reimportar_chunks.py`, que não envia id, ou backups nativos do Supabase, que restauram as sequências. Ou se a ferramenta de importação usada ajustar a sequência sozinha.
- *Que evidência me faria mudar?* Rodar a restauração documentada num Postgres local e obter `nextval` maior que 1768 sem `setval` manual.

**A1-03 (enunciado truncado)**
- *Em que circunstância estaria errado?* Se as questões reais do curso raramente contiverem letra de a a e seguida de `.`, `)` ou `-` antes das alternativas, ou se o LLM compensar o fragmento só com as alternativas. A truncagem é fato; o dano à resposta é inferência.
- *Que evidência me faria mudar?* Um conjunto de questões reais passado por `extrair_alternativas` sem truncamentos relevantes, ou uma comparação de acerto entre enunciado completo e truncado mostrando diferença desprezível.
