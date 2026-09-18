# 05 — Contra-argumentação do Estrategista (Agente 3), Ciclo 4

Mudei boa parte do plano. Dos 14 itens contestados, retirei 2 features (flashcards e simulado) e uma versão do A3-12, dividi A3-11 e A3-18 em duas partes cada, e criei duas propostas novas (A3-25 e A3-26). O primeiro passo agora é o dono confirmar se a senha que aparece no teste é real.

Fiz tudo em modo leitura: testes em memória no venv descartável (`-B`) e consultas à documentação pública. Nada foi gravado no projeto, a produção não foi chamada e nenhum segredo foi lido.

**Evidências novas deste ciclo:**

| # | Evidência | Tipo |
|---|---|---|
| E1 | Testei uma nova forma de separar enunciado e alternativas: procurar a **última sequência de marcadores de linha A, B, C… em ordem**. Com ela, `E. coli`, `A. Smith`, `E-commerce`, `(IA)`, `e-mail`, `A)um`, `A. um`, `a - um`, alternativa em várias linhas e o caso do teste atual saíram corretos. Hoje, `E. coli` vira a alternativa E e `A. Smith` corta o enunciado. | FATO executado |
| E2 | **Retenção dos logs de runtime da Vercel:** 1 hora no Hobby, 1 dia no Pro e 30 dias só com Observability Plus. Máximo de 256 linhas por requisição. | FATO, documentação |
| E3 | **Groq, página de reasoning (HTML bruto via curl):** `reasoning_format` aceita `parsed`, `raw` ou `hidden`; o padrão é `raw`; `hidden` devolve só a resposta final. A lista de modelos inclui `qwen/qwen3.6-27b`. `include_reasoning` não pode ser usado junto com `reasoning_format`. | FATO, documentação bruta |
| E4 | **Python 3.12 local:** esta máquina tem uv 0.12.5. `uv python list` mostra `cpython-3.12.14` disponível para download. `uv pip compile` aceita `--python-version` e `--python-platform linux`. | FATO |
| E5 | **Licença DejaVu:** as fontes podem ser distribuídas junto de outro software, desde que o aviso de copyright e a licença acompanhem. Não podem ser vendidas sozinhas. | FATO, documentação |
| E6 | `scripts\verificar-guarda-upload.sh:21-23` envia **um arquivo por requisição** e lê o corpo do 409. | FATO |
| E7 | `api\_app\provedores.py:114-116` registra que a cota gratuita do OpenRouter é de **50 chamadas por dia**. Um único resumo faz até 41. | FATO de código |
| E8 | `vercel.json` tem **uma única** entrada de função (`api/index.py`). Um `maxDuration` maior valeria para todas as rotas. | FATO |
| E9 | O PDF reconstruído leva o marcador `[página N]` no próprio texto (A2-35). | FATO do A2 |

---

## 1. Respostas às contestações do Agente 4

**1. A3-01 — REVEJO**
- **Busca do glossário:** trocar `. :` por espaço estava errado. "Node.js" e "Web 2.0" deixariam de ser encontrados. Passo a usar **aspas duplas**, como manda a documentação do PostgREST, com escape de `"` e `\`.
  - Ainda não sei se o `*` continua funcionando como curinga dentro das aspas. Isso precisa de um teste num PostgREST local.
  - Se falhar, faço duas consultas `ilike` separadas (termo e explicação) e junto os resultados em Python. Fora do `or=()`, a vírgula não separa nada.
- **Resíduo `E. coli` / `A. Smith`:** trato com o novo método (E1): o enunciado é tudo o que vem antes da última sequência A, B, C… em ordem.
- **Teste `tests\test_rag_core.py:409-416`:** reescrevo com uma frase em que 2 de 6 palavras-chave faltem de verdade, sem depender de acento.

**2. A3-02 — REVEJO**
- **Fonte TTF:** meu argumento de que exigiria mudar `includeFiles` estava errado. O glob `_app/**` já inclui a pasta, e a licença permite empacotar (E5). Passo a usar a **DejaVu** (Sans e Bold) em `api\_app\fonts\`, com a licença junto.
  - Ciclo anterior (executado): com fonte TTF, um glifo ausente (emoji, CJK) só gera aviso e o PDF sai.
  - A tradução para Latin-1 fica só como plano B, caso a fonte não carregue.
- **Busca opcional:** adiciono timeout curto e **sem nova tentativa**. Sem isso, o A2-63 mostra espera de cerca de 120 s antes de o fallback agir.

**3. A3-03 — REVEJO**
- **Limites de 4.000 e 12.000:** não tenho dado que os sustente. **Retiro.** Adoto a proposta do A4: limites folgados que só barram corpos absurdos (50.000 e 100.000 caracteres; Estimativa — precisa ser validada), mais contadores de "perto do limite" (A3-10).
- **Custo da auditoria:** passa a ser controlado por frases. `n_por_frase` é ajustado para ficar entre 1 e 3, sem devolver 422. O teto é de 60 frases (Estimativa), com `frases_ignoradas`.
- **Mensagem verde (A4-63):** "Todas as frases têm apoio" só aparece se `frases_ignoradas == 0`. Caso contrário: "N frases não verificadas".
- **N8** entra no mesmo PR.
- **`X-Admin-Token` (A4-65):** as falhas dessa rota contam no mesmo limitador de falhas do login. Recomendo que `ADMIN_TOKEN` tenha 32 caracteres aleatórios ou mais.
- **Sem service_role:** o limitador volta a valer só por instância, como já acontece com a cota. Isso fica documentado.

**4. A3-04 — REVEJO**
- **Qualquer 4xx** (menos 408 e 429) vira pendência e não é repetido. Isso cobre o 422 da ingestão (A2-07) e a variante A2-60.
- **Retiro a mudança de contrato 409 → 200.** Em vez disso, o front **envia um arquivo por requisição**:
  - o arquivo bloqueado não interfere nos outros;
  - o limite de 4,5 MB passa a valer por arquivo (A2-61);
  - o contrato HTTP não muda, então `scripts\verificar-guarda-upload.sh` continua funcionando (E6).

**5. A3-05 — REVEJO**
- **Erro no stream:** um JSON com `error` no meio do SSE passa a gerar evento `erro` com `parcial: true` (A4-61). Um `[DONE]` sem `finish_reason` fica marcado como `motivo: "desconhecido"`, sem declarar a resposta completa.
- **Testar as rodadas sem teste de componente:** a lógica sai para `lib\rodadas.ts`, uma função pura (criar rodada, verificar se ainda é a atual, abortar a anterior), e é testada com `node:test`. O componente só consome essa função. A ligação com a tela continua sendo conferida à mão, e digo isso na proposta.
- **Raciocínio do modelo (E3):** acrescento `reasoning_format: "hidden"` como parâmetro por modelo da Groq, a validar com uma chamada real. O filtro `<think>`/`<thinking>` continua, porque o dots-studio (AnyAPI e OpenRouter) não é da Groq.

**6. A3-06 — REVEJO**
- **Semáforo:** retiro a rejeição. O semáforo controla a taxa de chamadas e o prazo controla o tempo; os dois são necessários. Evidências: A4-62, os 429 em `provedores.py:83` e a cota de 50 por dia do OpenRouter (E7), que um só resumo quase esgota.
- **Redução de 40 para 20 trechos:** **retiro**, não tinha dado. Fica em 40, com semáforo configurável por ambiente (padrão 4; Estimativa) e corte por tempo.
- **OpenRouter:** o resumo é limitado a 10 trechos (Estimativa) ou desativado nesse provedor.
- **Embeddings:** deixam de repetir depois de timeout.
- **Ingestão:** o lote 0 aproveita o arquivo já baixado (A2-68).

**7. A3-08 — REVEJO**
- **Python local:** `iniciar-tudo.bat` passa a usar `uv venv --python 3.12`; o uv baixa o 3.12.14 na primeira execução (E4). Se o uv não existir, cai para `py -3.11` com aviso.
- **Versões fixadas:** geradas com `uv pip compile requirements.in --python-version 3.12 --python-platform linux -o requirements.txt`, sem precisar do interpretador local. A validação real é o CI, que roda em 3.12.
- **Credencial:** se o literal coincidir com a senha real:
  - trocar `ADMIN_PASS` **e** `SESSION_SECRET` (se ele não existir, o `ADMIN_TOKEN`, o que também invalida scripts);
  - trocar a senha em todo lugar onde tenha sido reutilizada;
  - tratar como comprometida.
  - Depois da troca, o literal no histórico do git perde valor. Reescrever o histórico só se houve reutilização ou se o repositório for compartilhado. Esta cópia não tem `.git`.
  - Essa confirmação passa a ser o **passo 0**.

**8. A3-10 — REVEJO (a crítica procede e agora está verificada)**
- Com 1 h de retenção no Hobby e 1 dia no Pro (E2), a calibração "por semanas" em cima dos logs não funciona.
- **Plano B:** contadores de evento **reaproveitando `consumir_cota` sem migração**, com chave `m:{evento}:{rota}:{provider}/{modelo}`, janela de 86.400 s e limite `2147483647`.
  - Eventos: 504, 502, 429 por provedor, stream interrompido, `length`, trechos perdidos no resumo, `frases_ignoradas`, "perto do limite".
  - Só eventos são gravados, não toda requisição. O `global-dia` que já existe serve de denominador.
- **Retenção dos contadores:** a limpeza atual apaga depois de 2 dias (A4-44). Uma migração de uma linha exclui o prefixo `m:` dessa limpeza, ou o admin exporta diariamente.
- O log estruturado continua, só para diagnóstico ao vivo.
- Depende da service_role.

**9. A3-11 — REVEJO (divido em duas)**
- **Globa incrementado com IP já negado:** sim, no desenho anterior. A correção:
  - checar todas as chaves primeiro, com `pg_advisory_xact_lock` em ordem fixa;
  - incrementar só se todas passarem.
- **Custo 21 contra limite de 20 por minuto:** o custo passa a ser **por chave**. A chave por minuto conta requisições (custo 1); as chaves diária e global contam chamadas.
- Isso vira o **A3-11b**, para DEPOIS.
- **A3-11a (AGORA, sem migração):** busca e auditoria saem da cota de LLM e vão para uma chave própria. O resumo ganha um teto diário por IP (padrão 10; Estimativa). É a "correção de duas linhas" que o A4 sugeriu, mais o limite que ataca o mecanismo do A4-01.

**10. A3-12 — REVEJO (retiro a versão com migração)**
- A alternativa do A4 é melhor: em caso de falha, apagar os chunks daquela fonte com `id > corte` e recomeçar do offset 0.
  - Funciona inclusive quando o último `apagar_chunks_ate_id` falha.
  - É idempotente e não precisa de migração.
  - O preço é refazer o documento inteiro.
- Não é trabalho duplicado com o A3-04: a **verificação de ids alinhados** do A3-04 é a pré-condição de que este rollback precisa.
- Prioridade: **PRÓXIMO**. Divergência com o A4, que prefere DEPOIS, registrada no §6.

**11. A3-13 — MANTENHO, com ordem e acréscimo**
- Fica explícito que o PDF reconstruído **não passa pela guarda do upload**: o arquivo não está no Storage, então `fonte_afetada` é `None` (`index.py:1929`). Só a guarda da ingestão o protege, e um 409 ali hoje vira o "✓" falso. Por isso A3-04 e A3-12 vêm antes.
- Acréscimo: gerar o PDF de novo **sem o marcador `[página N]`** (E9, A2-35), para o marcador não entrar nos trechos indexados.

**12. A3-17 e A3-18 — REVEJO**
- **Formato das citações:** não há amostra no repositório. O único `[Fonte: x, página 3]` está num comentário de `scripts\reconstruir_material.py:12`.
  - A3-17 passa a ter um **passo 0 sem código**: o dono exporta 20 respostas pelo botão ".md" (`PerguntarTab.tsx:161-185`).
  - Só construo se o formato aparecer em pelo menos metade delas (Estimativa), ou depois de exigir o formato no prompt.
- **A3-18 dividida:**
  - **18a (AGORA, cerca de 30 min):** trocar o rótulo e a legenda (`RespostaAuditada.tsx:22,79`) para "não encontrada no material (pode ser conhecimento geral)" e avisar que a auditoria não detecta negação (A2-62).
  - **18b (DEPOIS de A3-14):** modo estrito.

**13. A3-21 e A3-23 — RETIRO**
- Não tenho evidência de demanda. O modo lote do Resolver mostra que alunos praticam com questões próprias, não que querem flashcards ou simulados gerados.
- Os dois criam risco pedagógico (conteúdo errado memorizado; gabarito errado).

**14. Omissão da lista curada (A4-40) — ACEITO**
- Foi falha minha. A evidência estava no arquivo que li: `provedores.py:72` (47,7 s), `:129` (~90 s), `:55` (16,6 s), `:114-116` (cota esgotada).
- Tratei a lista como dado a medir e não como defeito a corrigir. Criei **A3-25**.

---

## 2. Efeito das verificações do A2 e do A4 sobre as propostas

| Verificação | Efeito |
|---|---|
| A2-02 e A4-02: A1-02 rebaixado para MÉDIO | A3-09 continua AGORA: a correção é uma linha e a perda é silenciosa |
| A2-05 e A4-05: A1-05 rebaixado para MÉDIO | A3-05 e A3-06 continuam AGORA por A4-61 e A4-62 (reproduzidos); A3-25 reduz a frequência |
| A2-46: IP não é falsificável na Vercel | Limites por IP valem na Vercel. O risco dominante é um único IP esgotando o provedor (A4-01), por isso A3-11a e o semáforo |
| A2-47: fluid compute permite até 300 s | Continua opção condicional (§3.1 do ciclo anterior). Pelo E8, subir o limite afeta todas as rotas; o prazo por rota continua necessário |
| A2-53 e E3: `reasoning_format` | Incorporado ao A3-05 |
| A2-63: embedding espera cerca de 120 s | Incorporado ao A3-02 e ao A3-06 |
| A2-58, A2-60, A2-61, A2-62, A2-64, A2-65, A2-68 | Entraram em A3-05, A3-04, A3-04, A3-18a, A3-08, A3-25 e A3-06, nessa ordem |
| A2-66: temporizador do OCR | Proposta nova **A3-26** |
| A2-67: comentário errado | Corrigido dentro do PR do A3-06 |
| A4-44: `cota_uso` guarda só 2 dias | A3-19 vai para DEPOIS; A3-10 tira o prefixo `m:` da limpeza |
| A4-45, A4-47, A4-49 | A3-20 e A3-22 ficam em DEPOIS; A3-24 passo 1 fica em PRÓXIMO |
| A4-12, A4-16: A1-12 e A1-16 rebaixados para BAIXO | A3-07 passa para PRÓXIMO; A3-11a continua AGORA por custo quase zero |

---

## 3. Propostas revisadas (só os campos que mudaram)

### A3-01 (revisada)
- **MUDANÇA:**
  1. Separar enunciado e alternativas pela última sequência A, B, C… em ordem (E1). Marcador aceito: `[A-Ea-e][ \t]*(?:[).]|-(?=[ \t]))`.
  2. Normalizar o acento dos dois lados na auditoria.
  3. Divergência numérica só quando duas ou mais conclusões citam números, depois de remover as citações.
  4. Remover termos repetidos. Na busca: aspas duplas com escape; se o curinga falhar, duas consultas `ilike`.
- **RISCO QUE CRIA:** uma alternativa cujo conteúdo tenha uma linha começando com "A." seguida de "B." pode confundir a sequência (raro). As aspas dependem de teste no PostgREST.
- **COMO IMPLEMENTAR:** `api\rag_core.py:123-137,244,483,569-597`; `api\index.py:680-684`. Testes com os 11 casos de E1, frase acentuada, 3 pares numéricos, busca por "Node.js" e por "a,b". Reescrever `test_rag_core.py:409-416`.
- **COMO MEDIR:** os 11 casos passam; uma consulta com `q="Node.js"` e outra com `q="a,b"` num PostgREST local devolvem resultados.

### A3-02 (revisada)
- **MUDANÇA:**
  - DejaVuSans e DejaVuSans-Bold em `api\_app\fonts\`, com o arquivo de licença, carregadas com `add_font`.
  - Se a fonte não carregar, cair na tradução para Latin-1.
  - Remover `**` e `__` das linhas.
  - Na busca opcional: `gerar_embeddings(..., timeout=Timeout(10, connect=3), tentativas=1)` e `buscar_chunks(timeout=5)` (valores são Estimativa — precisa ser validada), com `except (HTTPException, httpx.HTTPError)`.
- **RISCO QUE CRIA:** cerca de 1,46 MB a mais no pacote (limite de 500 MB, verificado). Emoji aparece sem glifo. Com o timeout curto, uma Edge Function lenta gera apostila sem contexto.
- **COMO MEDIR:** 17 casos do A2-04 geram `%PDF`; um teste confirma que a fonte existe no caminho empacotado; com a Edge Function simulada lenta, `chamar_llm` é chamado em menos de 15 s.
- **PRIORIDADE:** AGORA

### A3-03 (revisada)
- **MUDANÇA:**
  - `compare_digest` em bytes.
  - Limitador **só de falhas** por IP (5 por minuto; Estimativa), cobrindo o login e o `X-Admin-Token`.
  - `n_por_frase` ajustado para ficar entre 1 e 3.
  - Teto de 60 frases, com `frases_ignoradas` e a mensagem verde condicionada.
  - Limites folgados de texto (50.000 e 100.000; Estimativa).
  - N8 tratado; `LIMITE_LLM_POR_MINUTO` lido do ambiente; mensagem do teto global com o horário de virada.
- **RISCO QUE CRIA:** sem service_role, o limite fica por instância. Respostas com mais de 60 frases ficam parcialmente sem verificação, mas isso aparece na tela.
- **COMO MEDIR:** sexta falha em 60 s dá 429 no login e no token; senha acentuada dá 200; 200 frases resultam em no máximo 60 buscas e a mensagem "140 frases não verificadas".

### A3-04 (revisada)
- **MUDANÇA:**
  1. Propagar `forcar` para a ingestão.
  2. Qualquer 4xx (menos 408 e 429) vira pendência, e 409/422 vão para `analises`.
  3. 429, 5xx e erro de rede: espera de 1, 2, 4, 8 e 16 s.
  4. "Concluído" só sem pendência, sem desfazer `bloqueado`.
  5. **Um arquivo por requisição de upload.**
  6. 409 explícito para "mesmo conteúdo sobre um nome existente com conteúdo diferente".
  7. Insert com `return=representation` e verificação de ids alinhados antes de apagar.
- **RISCO QUE CRIA:** N requisições por lote de upload. Cada uma lista o Storage de novo: com 4 arquivos, desprezível.
- **COMO IMPLEMENTAR:** `components\tabs\PdfsTab.tsx:163-255`, `lib\api.ts:296-307`, `api\index.py:499-506,1908-1961`. `scripts\verificar-guarda-upload.sh` fica igual.
- **COMO MEDIR:**
  - Testes de ingestão com 422 e com 409 terminam sem linha de sucesso.
  - O teste A1-08 dá 409.
  - O script de guarda continua respondendo 409.
  - Num deploy de preview, dois arquivos de 3 MB passam.

### A3-05 (revisada)
- **MUDANÇA (acréscimos):**
  - `error` no JSON do SSE lança exceção e gera `erro` com `parcial: true`.
  - `[DONE]` sem `finish_reason` resulta em `motivo: "desconhecido"`.
  - `lib\rodadas.ts` como função pura.
  - `PROVIDERS[...]` aceita `extra_body` por modelo (`{"reasoning_format":"hidden"}` para `qwen/qwen3.6-27b`), a validar com uma chamada.
- **COMO IMPLEMENTAR:** `api\_app\provedores.py:224-275`, `lib\rodadas.ts`, `tests-js\rodadas.test.ts`, `tests-js\api-stream.test.ts`.
- **COMO MEDIR:**
  - O teste `test_stream_erro_do_provedor_no_meio_vira_fim` (A4) termina em `erro`.
  - `rodadas.test.ts` mostra que o callback de rodada antiga é ignorado.
  - Uma chamada real à Groq com `hidden` não traz `<think>`.

### A3-06 (revisada)
- **MUDANÇA:**
  - Prazo por requisição criado em middleware.
  - `asyncio.Semaphore(CONCORRENCIA_RESUMO)` (padrão 4; Estimativa) e corte da fase map por tempo.
  - `MAX_CHUNKS_RESUMO` continua em 40.
  - Limite por provedor em `PROVIDERS` (`max_chunks_resumo`; OpenRouter 10 ou desativado).
  - `extrair_pontos` captura `Exception` e a resposta traz `chunks_ok` e `chunks_falhos`.
  - `gerar_embeddings` repete só em erro de conexão ou 5xx, nunca depois de timeout, com timeout limitado pelo prazo.
  - `_analisar_ingestao` devolve os bytes e as linhas para o lote 0.
  - Comentário de `index.py:1384` corrigido.
- **RISCO QUE CRIA:** com o semáforo, menos trechos cabem no prazo. `chunks_ok` mostra isso ao aluno.
- **COMO MEDIR:** com o mock do A4-62 (10 simultâneas): 0 respostas 429 e `chunks_ok` igual aos trechos com sucesso. Com embedding em `ReadTimeout`: uma única tentativa. Contador `m:504:*` (A3-10) perto de zero.

### A3-07 (revisada)
- **MUDANÇA (acréscimo):** zerar o `ref` do seed logo depois de disparar `gerar`.
- **PRIORIDADE:** PRÓXIMO (origem BAIXO)

### A3-08 (revisada)
- **MUDANÇA:**
  - `.python-version` com 3.12.
  - `iniciar-tudo.bat` usa `uv venv --python 3.12`, com fallback para `py -3.11` e aviso.
  - `requirements.in` com as faixas atuais e `requirements.txt` gerado com `uv pip compile --python-version 3.12 --python-platform linux`.
  - `.env.example` completo, com teste.
  - Credencial: passo 0 com confirmação do dono; se coincidir, rotação de `ADMIN_PASS` e `SESSION_SECRET`, troca onde a senha foi reutilizada, e valor falso no teste de qualquer forma.
  - `overrides` da postcss testado.
- **RISCO QUE CRIA:** o primeiro `iniciar-tudo.bat` baixa o Python (precisa de rede). A resolução para Linux não é testada no Windows, só no CI.
- **COMO MEDIR:** CI verde com as versões fixadas; o log de build da Vercel mostra as mesmas versões; o `.bat` sobe com 3.12 nesta máquina.
- **PRIORIDADE:** passo 0 antes de tudo; o resto AGORA.

### A3-10 (revisada)
- **MUDANÇA:**
  - Contadores de evento via `consumir_cota` (chave `m:...`, limite `2147483647`), gravados só em eventos.
  - Rota de admin `GET /api/admin/metricas` para ler os contadores de hoje e ontem.
  - Migração de uma linha para excluir o prefixo `m:` da limpeza.
  - Log estruturado só para diagnóstico ao vivo.
- **RISCO QUE CRIA:** sem service_role não há contadores. Sem a migração, só 2 dias de histórico. Cada evento custa uma RPC.
- **COMO MEDIR:** em teste, um 504 simulado incrementa `m:504:perguntar:...`; a rota de admin devolve a contagem.
- **PRIORIDADE:** AGORA (antes de calibrar qualquer limite)

### A3-11a (nova divisão)
- **MUDANÇA:** `_limitar(request, prefixo, limites)`:
  - buscar e auditar usam `busca-ip-min`, `busca-ip-dia` e `busca-global-dia` (limites por ambiente);
  - resumir consome a cota `llm` e também `resumo-ip-dia` (padrão 10; Estimativa);
  - contador em memória separado por prefixo.
- **RISCO QUE CRIA:** um limite de resumo baixo demais bloqueia um uso legítimo intenso.
- **COMO IMPLEMENTAR:** `api\index.py:398-453` e as chamadas nas rotas de buscar, auditar e resumir. Sem migração.
- **COMO MEDIR:** uma pergunta com auditoria automática consome 1 unidade `llm`; o 11º resumo do dia no mesmo IP dá 429.
- **PRIORIDADE:** AGORA · **IMPACTO x ESFORÇO:** alto x baixo

### A3-11b (antigo A3-11, corrigido)
- **MUDANÇA:** `consumir_cotas(p_itens)`:
  - `pg_advisory_xact_lock` por chave, em ordem;
  - lê todas as contagens;
  - incrementa só se **todas** passarem;
  - custo por chave (minuto = 1; dia e global = chamadas).
- **PRIORIDADE:** DEPOIS, com duas condições: URL pública confirmada e dados de A3-10.

### A3-12 (revisada, sem migração)
- **MUDANÇA:**
  - Rota de admin `POST /api/ingerir/desfazer {arquivo, corte_id}` que apaga `source=X and id > corte`.
  - O front chama essa rota depois de uma falha 5xx ou de rede já com chunks inseridos, e recomeça do offset 0.
  - Se o corte do lote 0 se perdeu, repete o offset 0 (o A2-06 mostra que isso se corrige sozinho, com 409 falso possível em documentos de até 24 chunks, visível como pendência).
- **RISCO QUE CRIA:**
  - Refaz o documento inteiro a cada falha.
  - Um `corte_id` forjado pode apagar mais; exige admin.
  - Depende da verificação de ids alinhados (A3-04 item 7) e do A3-09.
- **COMO MEDIR:** o teste A2-06 (`apagar` falha e há retentativa) termina com 50 chunks novos e 0 duplicados; com um 504 simulado no último lote, o índice termina íntegro.
- **PRIORIDADE:** PRÓXIMO

### A3-13 (revisada)
- **MUDANÇA (acréscimo):**
  - Ordem obrigatória: A3-04, depois A3-12, depois o envio.
  - Gerar o PDF de novo sem `[página N]`.
  - Deixar registrado que o upload do reconstruído não passa pela guarda.

### A3-17 (revisada)
- **MUDANÇA:** passo 0 com 20 respostas exportadas pelo botão ".md". Construir só se o formato aparecer em pelo menos metade delas, ou depois de fixar o formato no prompt.
- **PRIORIDADE:** PRÓXIMO, condicional à amostra

### A3-18a (nova divisão)
- **MUDANÇA:**
  - Rótulo "Não encontrada no material (pode ser conhecimento geral)".
  - Legenda sem "provável invenção".
  - Nota: "a auditoria não percebe frases que contradizem o material".
- **COMO IMPLEMENTAR:** `components\RespostaAuditada.tsx:22,79`.
- **PRIORIDADE:** AGORA · **IMPACTO x ESFORÇO:** médio x baixo

### A3-18b
- **PRIORIDADE:** DEPOIS de A3-14 (modo estrito com limiar calibrado)

### A3-21 — RETIRADA · A3-23 — RETIRADA
Sem evidência de demanda e com risco pedagógico (A4-46, A4-48).

### A3-25 — Curadoria da lista de modelos (NOVA)
- **RESOLVE:** A4-40, A2-36, A2-65; reduz a frequência de A1-05 e A1-13.
- **ANTES:**
  - `provedores.py:72` nemotron-3.5-lightning (47,7 s);
  - `:129` nemotron lightning no OpenRouter (~90 s);
  - `:55` longcat (16,6 s);
  - `:36` `allam-2-7b`, não encontrado na documentação da Groq;
  - `:114-116` OpenRouter com 50 chamadas gratuitas por dia;
  - 4 modelos pagos do Nous sem anotação (A2-65).
- **MUDANÇA:**
  - Tirar os dois nemotron lightning, que pela medição do próprio projeto não cabem nos 52 s.
  - Metadados por modelo (`pago`, `lento`) mostrados no dropdown.
  - Anotar os 4 pagos do Nous.
  - Rodar `scripts\medir_latencia.sh` e tirar `allam-2-7b` se falhar.
  - Marcar o OpenRouter como "cota diária baixa".
- **POR QUE:** é a mitigação mais barata para tempo esgotado e custo.
- **DEPOIS:** a lista só oferece modelos que cabem no orçamento, com pagos e lentos identificados.
- **BENEFÍCIO:** menos 504 e menos gasto involuntário.
- **CUSTO/CONSEQUÊNCIA:** 1 a 2 h de código, mais uma medição com chaves feita pelo dono (Estimativa — precisa ser validada).
- **RISCO QUE CRIA:** retirar um modelo que alguém usa. O último escolhido fica salvo em localStorage, mas `useProviderModel` já cai no primeiro modelo válido.
- **COMO IMPLEMENTAR:** `api\_app\provedores.py`, `components\ProviderSelect.tsx`, `lib\types.ts`.
- **COMO MEDIR:** nova medição sem nenhum modelo acima de cerca de 15 s em pergunta trivial (Estimativa); contador `m:504` por modelo.
- **ALTERNATIVAS CONSIDERADAS:** só avisar no dropdown (mantém a armadilha); prazo curto (não evita a espera).
- **PRIORIDADE:** AGORA · **IMPACTO x ESFORÇO:** alto x baixo

### A3-26 — Temporizador do OCR encerra leitura em curso (NOVA)
- **RESOLVE:** A2-66.
- **ANTES:** `lib\ocr.ts:92-95,115-131`: o temporizador de ociosidade não é cancelado quando uma leitura começa.
- **MUDANÇA:** cancelar o temporizador no início de `reconhecerImagem` e agendar de novo no `finally`.
- **POR QUE:** uma segunda leitura longa, iniciada menos de 60 s depois da primeira, é interrompida no meio.
- **DEPOIS:** o worker só é encerrado depois de 60 s sem nenhuma leitura.
- **BENEFÍCIO:** fim de leituras cortadas de forma aleatória.
- **CUSTO/CONSEQUÊNCIA:** cerca de 1 h (Estimativa — precisa ser validada).
- **RISCO QUE CRIA:** o worker fica mais tempo na memória do navegador.
- **COMO IMPLEMENTAR:** `lib\ocr.ts`.
- **COMO MEDIR:** duas leituras em sequência rápida terminam; teste manual.
- **ALTERNATIVAS CONSIDERADAS:** não encerrar o worker (mais memória).
- **PRIORIDADE:** PRÓXIMO · **IMPACTO x ESFORÇO:** baixo x baixo

---

## 4. Lista final priorizada

Todos os esforços são Estimativa — precisa ser validada.

**Passo 0 (minutos, antes de tudo):** o dono confirma se o literal em `tests\test_admin_auth.py` é ou foi a senha real (A2-59). Se for, rotação conforme A3-08.

### 4.1 Correções de bug

**AGORA**

| ID | Descrição | Esforço | Dependências |
|---|---|---|---|
| A3-25 | Tirar modelos lentos ou mortos e marcar pagos e lentos | 1–2 h + medição | chaves para medir |
| A3-01 | Enunciado por sequência A..N, auditoria com acento, divergência numérica, glossário com aspas | 4–6 h | PostgREST local para testar as aspas |
| A3-02 | PDF com DejaVu e plano B em Latin-1; busca opcional com timeout curto | 2–4 h | licença no repositório |
| A3-03 | Login e token com comparação em bytes e limite de falhas; teto de frases com aviso; limites folgados; N8 | 3–5 h | service_role para o limite compartilhado |
| A3-18a | Rótulo e legenda da auditoria | 0,5 h | — |
| A3-11a | Busca e auditoria fora da cota de LLM; teto diário de resumos por IP | 1–2 h | service_role |
| A3-04 | Fluxo de upload e ingestão: 4xx como pendência, espera entre tentativas, um arquivo por requisição, ids alinhados | 5–7 h | — |
| A3-06 | Prazo por requisição, semáforo, embeddings sem repetir após timeout, download único | 6–10 h | — |
| A3-05 | Stream: erro do provedor, parcial preservado, `<think>`, rodadas em `lib`, `reasoning_format` | 6–10 h | A3-06 (evento parcial) |
| A3-09 | `setval` no roteiro de restauração; verificação de RLS só de leitura | 2–3 h | — |

**PRÓXIMO**

| ID | Descrição | Esforço | Dependências |
|---|---|---|---|
| A3-12 | Desfazer ingestão com falha (`id > corte`) sem migração | 3–5 h | A3-04, A3-09 |
| A3-07 | Glossário na 1ª navegação, status, provedores, auditoria sem silêncio | 2–4 h | — |
| A3-26 | Temporizador do OCR | 1 h | — |

**DEPOIS**

| ID | Descrição | Esforço | Dependências |
|---|---|---|---|
| A3-11b | Cota ponderada com a função SQL corrigida | 8–12 h | URL pública confirmada; dados de A3-10 |

### 4.2 Melhorias

| ID | Prioridade | Descrição | Esforço | Dependências |
|---|---|---|---|---|
| A3-08 | AGORA | `.python-version`, venv com uv em 3.12, versões fixadas, `.env.example`, credencial | 2–4 h | uv; CI |
| A3-10 | AGORA | Contadores de evento em `cota_uso` e log ao vivo | 4–6 h | service_role; migração de 1 linha (opcional) |
| A3-13 | PRÓXIMO | Higiene do acervo e PDF reconstruído sem marcador | 2–4 h do dono | A3-04, A3-12 |
| A3-14 | PRÓXIMO | Perguntas de referência para medir a recuperação | 4–6 h + tempo do dono | — |
| A3-15 | DEPOIS | Dividir `index.py` | 12–20 h | tudo acima estável; mais de um mantenedor |

### 4.3 Features

**Alto valor e baixo custo**

| ID | Prioridade | Descrição | Esforço | Dependências |
|---|---|---|---|---|
| A3-16 | PRÓXIMO | Histórico local em Perguntar e Professor | 2–4 h | — |
| A3-24 (passo 1) | PRÓXIMO | "Ver trecho completo" nas evidências | ~1 h | — |
| A3-17 | PRÓXIMO, condicional | Conferência de citações | 3–5 h | amostra de 20 respostas exportadas |

**Especulativas / não fazer agora**

| ID | Situação | Motivo | Dependências |
|---|---|---|---|
| A3-18b | DEPOIS | Modo estrito precisa de limiar calibrado | A3-14 |
| A3-19 | DEPOIS | Painel do admin | A3-10; 2 dias de retenção |
| A3-20 | DEPOIS | Filtro por apostila; valor depende do acervo limpo e da medição | A3-13, A3-14 |
| A3-22 | DEPOIS | Retorno do aluno; LGPD ausente | decisão do dono |
| A3-24 (passo 2) | Não fazer agora | Expõe o bucket privado; 73% de links quebrados | direitos autorais |
| A3-21 | Retirada | Sem demanda; risco pedagógico | — |
| A3-23 | Retirada | Sem demanda; risco de gabarito errado | — |

---

## 5. Autocrítica das 3 propostas principais

**A3-06 (prazo por requisição e semáforo)**
- **Em que circunstância estaria errada?**
  - Se o projeto usar fluid compute e o dono aceitar subir o `maxDuration`, os cortes da plataforma ficam raros.
  - Se o limite de concorrência real das chaves for alto, o semáforo só atrasa os resumos.
  - Nos dois casos, A3-05 e A3-25 dariam quase todo o ganho.
- **Que evidência me faria mudar?**
  - Contadores `m:504` e `m:429` perto de zero por algumas semanas com uso real.
  - Documentação ou painel dos provedores com limite de concorrência folgado.

**A3-04 com A3-12 (integridade do upload e da ingestão)**
- **Em que circunstância estaria errada?**
  - Se a ingestão acontece uma vez por semestre, sempre com backup antes e conferência manual. Aí o esforço de 8 a 12 h não se paga.
- **Que evidência me faria mudar?**
  - O dono confirmar que a indexação é rara e conferida.
  - Um teste de interface mostrar que o "⛔" anterior já leva o admin a agir.

**A3-10 (medição por contadores no banco)**
- **Em que circunstância estaria errada?**
  - Se o projeto estiver no Pro com Observability Plus (30 dias de logs, E2): os logs bastam e os contadores são redundantes.
  - Se a service_role não estiver configurada: os contadores não funcionam.
- **Que evidência me faria mudar?**
  - O plano real da Vercel.
  - `/api/config` mostrando `escrita_via: anon`. Nesse caso, a prioridade passa a ser configurar a service_role antes de medir.

---

## 6. Discordâncias que permanecem

**DISCORDÂNCIA 1**
- **Agente:** Agente 4 (A4-51 e §4, D11)
- **Posição:** o A4 coloca A3-12 em DEPOIS; eu mantenho **PRÓXIMO** para a versão sem migração.
- **Argumento:**
  - A versão revisada custa 3 a 5 h e não mexe no schema.
  - O defeito é verificado e silencioso: o A2-06 inseriu 4 chunks em vez de 2.
  - A3-13 (reenviar 384 trechos) vai exercitar justamente esse caminho em breve.
- **Evidência:** A2-06 (`test_a106`); A4-52 (a ordem exige integridade antes do reenvio); a pendência de 10/09 de reenviar o PDF reconstruído.
- **O que falta para resolver:** frequência real de 5xx ou 504 na ingestão, e se o reenvio do reconstruído vai acontecer logo.

**DISCORDÂNCIA 2**
- **Agente:** Agente 2 (A2-20 e A2-41: "contagem antes e depois de um DELETE com anon")
- **Posição:** eu defendo verificar só por catálogo (`pg_class.relrowsecurity`, `pg_policies`, `role_table_grants`); o A4 concorda (D7).
- **Argumento:** um DELETE com a chave anon contra a produção só "prova" alguma coisa se apagar dados, justamente quando a proteção falta. O catálogo responde a mesma pergunta sem escrever.
- **Evidência:** `CORRECOES-2026-09-10.md:184-188`; semântica de RLS citada pelo próprio A2-20.
- **O que falta para resolver:** o A2 aceitar a verificação só de leitura, ou mostrar um caso em que o catálogo não baste (por exemplo, uma função `security definer` que ignora o RLS).

**DISCORDÂNCIA 3**
- **Agente:** Agente 4 (A4-35, sobre padrão de concorrência)
- **Posição:** concordo com o semáforo, mas o valor padrão (4) é arbitrário. O A4 também não tem o número.
- **Argumento:** nenhum dos dois conhece o limite de concorrência das chaves. O mock de 10 simultâneas é hipótese.
- **Evidência:** A4-62 (limite simulado); `provedores.py:83,114-116`.
- **O que falta para resolver:** limite documentado de cada provedor e plano da chave, ou os contadores `m:429` por provedor depois do A3-10.

---

**Fontes novas deste ciclo:**
- [Vercel — Runtime Logs (retenção por plano)](https://vercel.com/docs/logs/runtime)
- [Groq — Reasoning (HTML bruto via curl)](https://console.groq.com/docs/reasoning)
- [DejaVu Fonts — License](https://dejavu-fonts.github.io/License.html)

**Arquivos principais (caminhos absolutos):**
- `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\api\rag_core.py`
- `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\api\index.py`
- `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\api\_app\provedores.py`
- `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\api\_app\documentos.py`
- `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\components\tabs\PdfsTab.tsx`
- `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\components\tabs\PerguntarTab.tsx`
- `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\components\RespostaAuditada.tsx`
- `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\lib\api.ts`
- `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\lib\ocr.ts`
- `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\scripts\verificar-guarda-upload.sh`
- `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\tests\test_admin_auth.py`
- `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\iniciar-tudo.bat`
