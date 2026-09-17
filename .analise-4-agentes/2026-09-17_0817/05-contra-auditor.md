# 05 — Contra-argumentação do Auditor (Agente 1), Ciclo 4

Revi 12 achados, mantive 10 e não retirei nenhum. A1-01, A1-03 e A1-04 continuam ALTO. A1-02 e A1-05 caem para MÉDIO; A1-12 e A1-16 caem para BAIXO. O problema do `AnexoImagem` que eu só tinha citado vira o achado A1-23 (BAIXO).

**Como trabalhei.** Nada foi gravado no projeto. Os artefatos novos estão em `...\scratchpad\a1c4\`: `or_limits.html` e `groq_rl.html`, páginas públicas de documentação baixadas com `curl`. As funções reais foram executadas com o venv descartável e `-B`. A produção não foi chamada.

---

## 1. Respostas às 12 contestações do Agente 4

### C1 — A1-01: **REVEJO** o mecanismo e a conta; **MANTENHO ALTO**
- **O que retiro:**
  - A conta "205.000 chamadas/dia" só vale com 17 ou mais IPs. Por IP o teto correto é 300 × 41 = **12.300 chamadas de LLM por dia**, ou 20 × 41 = **820 por minuto**.
  - "Terceiros esgotam o teto global" deixa de ser o argumento principal.
- **Novo argumento:** um único IP, e até uma única requisição, satura a cota que todos os alunos dividem **no provedor**. `/api/resumir-apostila` dispara 40 chamadas simultâneas na mesma chave (`index.py:1171`).
- **Evidência nova (FATO, documentação pública baixada hoje):**
  - **OpenRouter** (`a1c4\or_limits.html`): `FREE_MODEL_RATE_LIMIT_RPM=20`, `FREE_MODEL_NO_CREDITS_RPD=50`, `FREE_MODEL_HAS_CREDITS_RPD=1e3`, `FREE_MODEL_CREDITS_THRESHOLD=10`. Um resumo sozinho (41 chamadas) passa do limite por minuto dos modelos gratuitos. Uma conta sem créditos gasta a cota diária inteira (50) em cerca de 1,2 resumos. Isso bate com o "0/50" registrado em `CORRECOES §8`.
  - **Groq** (`a1c4\groq_rl.html`, colunas MODEL ID / RPM / RPD / TPM / TPD):
    - `groq/compound-mini` (padrão da lista): 30 RPM, 250 RPD, 70K TPM;
    - `openai/gpt-oss-120b`: 30 RPM, 1K RPD, 8K TPM.
  - INFERÊNCIA: que esses números sejam os do *Free Plan*. Aparecem na primeira tabela da página, e não confirmei a qual plano cada tabela pertence.
  - HIPÓTESE: o plano das chaves do projeto.
  - Se a chave da Groq for gratuita, o modelo padrão atende **250 requisições por dia para o app inteiro**, menos que o teto de um único IP (300).
  - ESTIMATIVA, a validar: um resumo manda cerca de 15 mil tokens de entrada ao mesmo tempo (40 × cerca de 1.500 caracteres ÷ 4), o que passa dos 8K TPM do `gpt-oss-120b`.
  - Reprodução com provedor simulado pelo A4 (A4-62): 50 respostas 429 e `chunks_usados=40`.
- **Conclusão:** ALTO se sustenta por disponibilidade: um aluno esgota a cota do provedor para todos. O custo em dinheiro continua dependendo do plano das chaves.

### C2 — A1-02: **REVEJO para MÉDIO**, com prioridade AGORA
- **Evidência de restauração planejada ou já feita: não há.**
  - `CORRECOES` foi "validada contra o projeto Supabase vivo".
  - `README-BACKUP` descreve um backup tirado da produção, não uma restauração.
  - A única restauração planejada é a de chunks por `scripts\reimportar_chunks.py`, que **não envia `id`** (`:120-126`) e por isso é segura.
- **Acréscimo:** o dump tem ids de 942 a 1768 com lacunas.
  1. Com a sequência em 1, as primeiras reindexações apagam os chunks novos em silêncio (a interface registra "✓").
  2. Quando `nextval` chega a 942, o lote que contém um id existente falha: PostgREST 409 (23505), depois `raise_for_status`, depois 500 pelo `falha_inesperada`.
  3. O front repete o lote até 6 vezes e cada falha queima valores da sequência.
  4. O sintoma visível só aparece **depois** das perdas silenciosas.
- **Sobre o argumento "recuperável pelos dumps":** concordo com o A4 que é fraco. Sem sinal na interface, ninguém sabe que precisa recuperar.

### C3 — A1-03: **MANTENHO ALTO**
- **Evidência nova, e honesta sobre o que ela não prova:**
  - O repositório não tem banco de questões. `grep -i "assinale|alternativa correta"` em `supabase-backup\reconstruido`, no dump, em `scripts` e em `tests` não encontra nada além do exemplo sintético de `smoke.py` e dos testes.
  - A **única questão real** encontrada está no campo `origem` do dump de produção do glossário: "QUESTÃO 3 Sobre a representação interna de dados em um computador, o sistema numérico binário opera na base 2 utilizando os dígitos 0 e 1. Como é chamada…", cortada em 200 caracteres. Rodei `extrair_alternativas` sobre ela completada, e **não houve truncamento** (a primeira frase termina em "1.", um dígito).
  - Amostra real: 0 truncadas em 1. Não serve para estimar frequência.
- **O que ainda sustenta ALTO:**
  - o defeito é determinístico e invisível (a interface não mostra `questao`);
  - o proxy do A2 indica gatilho em 27,5% das frases do material do curso;
  - os gatilhos "(IA)", "LGPD." e "e-mail" são típicos deste curso.
- **O que não consigo fazer:** medir se a letra escolhida muda. Isso exige chamadas ao LLM, proibidas nesta rodada, e continua sendo INFERÊNCIA.
- **Condição para cair:** uma amostra de 10 ou mais questões reais com menos de 10% de truncamento leva o achado a MÉDIO.

### C4 — A1-04: **MANTENHO ALTO**, com evidência de frequência vinda de saída real
- **Evidência nova (FATO):** o dump de produção `glossario_termos-2026-09-10.jsonl` tem 44 termos gerados por LLM **por este app**.
  - **4 dos 44 (9,1%)** contêm caractere fora do Latin-1, somando 7.374 caracteres.
  - O caractere é sempre U+2011, o hífen inseparável: "matéria‑prima", "UTF‑8", "auxílio‑doença", "Retrieval‑Augmented".
  - Executado: `_markdown_para_pdf('Retrieval‑Augmented Generation','RAG')` levanta `FPDFUnicodeEncodingException`.
  - Nenhuma das listas de teste do A2 ou do A4 incluía esse caractere.
- **ESTIMATIVA** (Poisson com taxa de 4 em 7.374; amostra pequena, um único modelo desconhecido, estilo de glossário e não de apostila; precisa ser validada): chance de quebra de cerca de 80% em 3 mil caracteres e de 99,6% em 10 mil.
- **Implicação para a correção** (ver o Anexo B abaixo): a tradução fixa do A3 não mapeia U+2011. O `replace` do A3 transformaria esses hífens em "?", ou seja "UTF?8", em cerca de 9% dos itens reais.

### C5 — A1-05: **REVEJO para MÉDIO** e incorporo A4-61
- **Qual item sustentaria ALTO sem logs:** nenhum, quanto à frequência. Os itens 2 (texto parcial apagado) e 4 (`finish_reason` ignorado) são determinísticos depois do gatilho, mas não sei com que frequência o gatilho ocorre.
- **Incorporo A4-61:** um SSE `data: {"error":…}` sem `choices` gera `KeyError`, que cai em `continue` (`provedores.py:264-267`). A rota emite `fim` e o erro vira resposta "completa". Isso amplia meu item 4.
- **O que o faria voltar a ALTO:** logs da Vercel com 504 ou streams sem `fim` na rota principal. A4-40 (limpar a lista de modelos lentos) é a mitigação mais barata.

### C6 — A1-08: **REVEJO** a narrativa; severidade MÉDIO
- **Correção:** a perda não espera "a reindexação seguinte". `PdfsTab.tsx:234` inclui os substituídos em `mudou`, e a linha 241 chama `runIngest(['B.pdf'])` **no mesmo fluxo** do upload.
- **Como a ingestão decide** (`index.py:1715`): mede `chars_existentes = X + Y` e `chars_novos = X`, e bloqueia se X < 0,6 (X + Y), isto é, se Y > ⅔ X. Daí:
  - **se Y ≤ ⅔ X:** os chunks de Y são apagados **na hora**, e o arquivo Y já tinha sido sobrescrito pelo `x-upsert`. A perda é imediata e total;
  - **se Y > ⅔ X:** 409, depois o "✓ 0 chunks" falso de A1-07, e B fica com chunks misturados de X e Y.

### C7 — A1-12: **REVEJO para BAIXO**
O contorno é real: o tema fica na caixa e "Gerar sumário" funciona. Não há dado perdido nem resultado errado. Meu único argumento a favor de MÉDIO era a falta de feedback, o que não basta.

### C8 — A1-13: **MANTENHO o semáforo** (somado ao prazo); severidade MÉDIO
- **Evidência de limite dos provedores:**
  - OpenRouter gratuito: 20 RPM e 50 ou 1.000 RPD;
  - Groq, conforme a tabela da C1: 30 RPM, e TPM de 8K no `gpt-oss-120b`;
  - `provedores.py:83` (AnyAPI com 429) e `:114-116` (OpenRouter 0/50).
- **Argumento:** 40 chamadas simultâneas passam de 20 ou 30 RPM **independentemente do prazo**. O A3 tem razão num ponto: com prazo fixo, o semáforo sozinho alonga o tempo total. A saída não é escolher um dos dois, e sim:
  1. semáforo com teto abaixo do RPM (controla a taxa);
  2. número de trechos compatível com RPM × prazo (40 → cerca de 15 a 20 em modelo de 30 RPM, ESTIMATIVA);
  3. prazo com cancelamento das tarefas pendentes (controla o tempo);
  4. `chunks_ok` na resposta.
- Ver a Discordância 1.

### C9 — A1-15: **REVEJO o impacto**; severidade MÉDIO
- **Retiro** o argumento da guarda de 60%. O A2 mediu variação de −1,4% (74 → 75 chunks, 60.076 → 59.229 caracteres), contra uma margem de 40%.
- **Novo impacto** (evidência em `scratchpad\exec\pip-freeze.log`):
  - `fastapi>=0.111.0` resolveu para `fastapi==0.141.1` e `starlette==1.6.0` (um major novo);
  - `pytest.log` já mostra `StarletteDeprecationWarning: Using httpx with starlette.testclient is deprecated; install httpx2` e `anyio.abc.BlockingPortal alias is deprecated`.
- **Riscos concretos:**
  1. Uma remoção futura desse suporte deixa o CI vermelho (os 145 testes usam `TestClient`) sem nenhum commit do projeto.
  2. Cada deploy da Vercel reinstala o mais recente, então runtime, multipart e tratadores de exceção podem mudar entre dois deploys do mesmo código (INFERÊNCIA).
  3. Local em 3.11, CI em 3.12 e Vercel com padrão próprio (3.12 a 3.14, A2-48): nenhuma dessas combinações é testada contra a de produção.
- **Evidência secundária:** a extração mudou entre 10/09 e hoje (A2-64). A variação é pequena, mas mostra que os resultados não são reproduzíveis.

### C10 — A1-16: **REVEJO para BAIXO** (MÉDIO se o NAT se confirmar)
- `grep -i "turma|escola|sala de aula|laborat|NAT"` no código e nos documentos, fora desta análise, só encontra textos de prompt ("desafia a turma", "ambiente de laboratório"). Não há dado de rede nem de número de alunos.
- O consumo em dobro continua sendo FATO e custa duas linhas para corrigir: tirar `auditar` e `buscar` da cota de LLM.
- Observação: `auditar` não gasta cota do provedor, só a do app. Não soma à C1.

### C11 — A1-20: **REVEJO**; aceito a verificação só de leitura (A3-09)
- **Motivo:** DELETE com `return=representation` ainda apaga se a proteção faltar, e DELETE com filtro impossível (`id=eq.-1`) devolve 204 de qualquer forma. Nenhum dos dois é aceitável ou conclusivo.
- **Consultas sugeridas no SQL Editor, todas de leitura:**
  - `select relname, relrowsecurity from pg_class where relname in ('ementas_chunks','glossario_termos','cota_uso');`
  - `select tablename, policyname, cmd, roles from pg_policies where tablename in (...);`
  - `select has_table_privilege('anon','public.ementas_chunks','DELETE'), has_table_privilege('anon','public.glossario_termos','INSERT');`
  - `select to_regprocedure('public.consumir_cota(text,integer,integer)'), has_function_privilege('anon','public.consumir_cota(text,integer,integer)','EXECUTE');`
- A severidade continua BAIXO. O item "o script de recriação não tem REVOKE nem cota" permanece.

### C12 — §5 do A1 (`AnexoImagem`): **MANTENHO**, formalizado como **A1-23, BAIXO**. Demonstrado por leitura; não executado.
- **Por que não executei:** não há ferramenta de DOM no scratchpad (sem jsdom, happy-dom, react-test-renderer ou @testing-library em `rag-js\node_modules`).
- **Caminho no código** (`components\AnexoImagem.tsx`), passo a passo:
  1. Durante a leitura, `anexo.texto === ''`; o texto só é gravado na linha 131, depois da extração.
  2. O botão X individual (306-314) **não** fica desabilitado quando `lendo`. Só "remover todas" fica (256).
  3. `remover(id)` (199-206) tira o item de `fila.current` e de `anexos`. Como `alvo.texto` está vazio, não mexe no campo. E não cancela o `ler` em andamento.
  4. Quando o `ler` termina, a linha 130 executa `setTexto((atual) => inserir(atual, bloco))` sem conferir se o anexo ainda existe, e `atualizar(id, …)` (131) não faz nada, porque o id sumiu.
  5. O texto entra no campo, sem cartão para removê-lo.
  6. Mesmo efeito com `resetToken` (105-110) durante a leitura: a aba limpa e o texto reaparece.
- **Correção:** um conjunto `cancelados` (ref) consultado antes da linha 130, ou `AbortController` na extração.
- **Validação:** no navegador, anexar um PDF escaneado de várias páginas, clicar X durante "lendo…" e conferir que o campo continua vazio.

---

## 2. Rebaixamentos do Agente 2

| Achado | Posição do A2 | Minha resposta |
|---|---|---|
| A1-02 | MÉDIO | **Aceito** (C2). Discordo só do argumento "recuperável pelos dumps", que depende de alguém perceber a perda |
| A1-05 | MÉDIO | **Aceito** (C5). A frase "o caso mais comum já é tratado" é incompleta: nesse caso o texto parcial também é apagado (`PerguntarTab.tsx:96-99`) |
| A1-16 | Condicional | **Aceito BAIXO**, MÉDIO se houver NAT (C10) |

## 3. Anexo B do Agente 3 (divergências com minhas correções)

| Achado | Posição do A3 | Minha resposta |
|---|---|---|
| A1-04 | Latin-1 primeiro, TTF opcional | **Aceito a ordem, com ressalva.** A tabela fixa precisa mapear também U+2011, U+2010, U+2012 e U+2212 para "-", porque U+2011 é **o** caractere que aparece nas saídas reais (C4); sem isso, o `replace` gera "?" em cerca de 9% dos itens. O custo alegado contra a TTF não se sustenta (`includeFiles` já cobre `_app/**`, A4). Teste de validação: incluir `'Retrieval‑Augmented'` |
| A1-13 | Só prazo e menos trechos | **Discordo em parte** (C8, Discordância 1) |
| A1-14 | Limitador + bytes; sem Supabase Auth | **Aceito.** Era só alternativa |
| A1-15 | Unificar em 3.12, sem matriz | **Aceito.** Resposta à lacuna do A4 sobre como rodar 3.12 localmente: o `uv` já existe na máquina (o Python 3.11.15 veio dele), então `uv python install 3.12` e `uv venv -p 3.12 .venv` no `iniciar-tudo.bat` resolvem. Não executei a instalação, por ser proibido nesta rodada |
| A1-20 | Catálogo, só leitura | **Aceito** (C11) |
| A1-05 (alternativa) | `max_tokens` por provedor | **Aceito.** Usar o parâmetro correto de cada provedor, testado |

Também **amplio a correção de A1-17**, aceitando A4-22 e A2-63: além de `except (HTTPException, httpx.HTTPError)`, a busca opcional precisa de timeout curto próprio (por exemplo 8 s, sem segunda tentativa). Sem isso, a espera de até cerca de 120 s continua.

---

## 4. Autocrítica das 3 conclusões principais que sobreviveram

**A1-01 (ALTO: um IP esgota a cota do provedor)**
- *Em que circunstância estaria errada?* Se as chaves forem de planos pagos com RPM, TPM e concorrência folgados; se a tabela da Groq que li não for a do plano usado; se a URL só for conhecida pela turma e houver firewall ou Deployment Protection.
- *Que evidência me faria mudar?* Painéis dos provedores com o plano e os limites reais de cada chave, mais a configuração da Vercel restringindo o acesso. Com isso, cai para MÉDIO.

**A1-03 (ALTO: enunciado truncado)**
- *Em que circunstância estaria errada?* Se as questões reais raramente tiverem o gatilho (a única real que encontrei não teve), ou se os modelos acertarem a mesma letra só com as alternativas.
- *Que evidência me faria mudar?* 10 ou mais questões reais com menos de 10% de truncamento, ou taxa de acerto igual com enunciado completo e truncado. Com isso, cai para MÉDIO.

**A1-04 (ALTO: PDF quebra)**
- *Em que circunstância estaria errada?* Se o U+2011 do glossário for peculiar a um único modelo ou prompt e as apostilas geradas pelos modelos padrão não tiverem caracteres fora do Latin-1.
- *Que evidência me faria mudar?* 10 ou mais apostilas reais, geradas pelos modelos padrão da lista, sem nenhum caractere acima de U+00FF. Com isso, cai para MÉDIO.

---

## 5. Discordâncias que permanecem

```
DISCORDÂNCIA 1
- Agente: Agente 3 (Anexo B, A1-13 / A3-06)
- Posição: A3 = só prazo (asyncio.wait) e menos trechos; semáforo rejeitado. A1 = semáforo (taxa) + prazo (tempo) + trechos dimensionados + chunks_ok.
- Argumento: prazo não impede 40 requisições simultâneas contra limites de 20–30 RPM; os 429 viram trechos descartados em silêncio. Semáforo sem prazo alonga o tempo; os dois controlam coisas diferentes.
- Evidência: OpenRouter FREE_MODEL_RATE_LIMIT_RPM=20 (a1c4\or_limits.html); Groq 30 RPM e 8K TPM no gpt-oss-120b (a1c4\groq_rl.html); provedores.py:83,114-116; A4-62 (50 respostas 429 com provedor simulado).
- O que falta para resolver: plano e limites reais das chaves do projeto; teste com mock de RPM comparando "só prazo" e "semáforo + prazo" em trechos úteis por resumo.
```

```
DISCORDÂNCIA 2 (parcial)
- Agente: Agente 3 (A3-02, tradução Latin-1)
- Posição: A1 aceita Latin-1 primeiro, mas a tabela proposta omite o caractere mais frequente nas saídas reais.
- Argumento: com replace, U+2011 vira "?" dentro de palavras ("UTF?8").
- Evidência: 4 de 44 termos do dump de produção têm U+2011; fpdf2 falha com ele (executado); NFKD(U+2011) = U+2010, também fora do Latin-1.
- O que falta para resolver: o A3 incluir U+2010, U+2011, U+2012 e U+2212 no mapeamento e um teste com 'Retrieval‑Augmented'.
```

```
DISCORDÂNCIA 3
- Agente: Agente 2 (A2-02)
- Posição: aceito MÉDIO, mas não pelo motivo "recuperável pelos dumps".
- Argumento: a perda é silenciosa ("✓"), e a colisão de chave primária só aparece depois de perdas já ocorridas.
- Evidência: PdfsTab.tsx:200-205; index.py:1850-1864; ids do dump entre 942 e 1768.
- O que falta para resolver: ensaio em Postgres local com pgvector; teria o mesmo peso se o front mostrasse a contagem da fonte antes e depois.
```

---

## 6. Tabela final

| ID | Severidade final que defendo | Status |
|---|---|---|
| A1-01 | ALTO | revisto (mecanismo: cota do provedor; conta por IP corrigida) |
| A1-02 | MÉDIO (prioridade AGORA) | revisto |
| A1-03 | ALTO | mantido |
| A1-04 | ALTO | mantido (correção revista: Latin-1 primeiro, com U+2011) |
| A1-05 | MÉDIO | revisto (incorpora A4-61) |
| A1-06 | MÉDIO | mantido |
| A1-07 | MÉDIO | mantido (junta A2-60 e o 422 repetido) |
| A1-08 | MÉDIO | revisto (perda no mesmo fluxo do upload) |
| A1-09 | MÉDIO | mantido |
| A1-10 | MÉDIO | mantido |
| A1-11 | MÉDIO | mantido |
| A1-12 | BAIXO | revisto |
| A1-13 | MÉDIO | mantido (semáforo e prazo; incorpora A4-62) |
| A1-14 | MÉDIO | mantido (alternativa do A3 aceita) |
| A1-15 | MÉDIO | revisto (impacto reescrito; unificar em 3.12 via uv) |
| A1-16 | BAIXO (MÉDIO se houver NAT) | revisto |
| A1-17 | BAIXO | mantido (correção ampliada: timeout curto) |
| A1-18 | BAIXO | mantido |
| A1-19 | BAIXO | mantido |
| A1-20 | BAIXO | revisto (verificação só de leitura) |
| A1-21 | BAIXO | mantido |
| A1-22 | BAIXO | mantido |
| A1-23 (ex-§5, `AnexoImagem`) | BAIXO | mantido e formalizado (código; não executado) |
