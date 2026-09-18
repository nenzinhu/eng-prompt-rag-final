# 06 — Veredito final (Agente 4, Juiz), Ciclo 5a

**Projeto:** `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main` · **Data:** 17/09/2026

**O que reabri neste ciclo** (só onde a réplica trouxe algo que muda severidade; scripts em `...\scratchpad\a4\r3.py`, nada gravado no projeto):
1. **U+2011 no dump real** `supabase-backup\dumps\glossario_termos-2026-09-10.jsonl`: **44 termos, 4 com caractere fora do Latin-1, todos U+2011**, em 7.374 caracteres. `_markdown_para_pdf('Retrieval‑Augmented Generation','RAG')` e `('UTF‑8')` levantam `FPDFUnicodeEncodingException`. `NFKD(U+2011) = U+2010`, também fora do Latin-1; `latin-1/replace` produz `UTF?8`. **Confirmo o A1 (C4) por execução própria.**
2. **Variante do "último A"** (E1 do A3 / A2-69), implementada e rodada por mim em 7 casos: corrige `E. coli`, `A. Smith`, afirmativas `a) b)`, `(IA)` e mantém o caso do teste atual. **Regressão confirmada** com duas questões coladas (o enunciado engole a questão 1). Detalhe que ninguém notou: nesse caso o **código de hoje é pior** — devolve o enunciado da questão 1 com as alternativas da questão 2 (o dicionário sobrescreve as letras).
3. **Limites públicos, conferidos por mim nos HTML salvos:** Groq "Free Plan Limits" → `groq/compound-mini` **30 RPM, 250 RPD, 70K TPM**; `openai/gpt-oss-120b` **30 RPM, 1K RPD, 8K TPM**. OpenRouter → `FREE_MODEL_RATE_LIMIT_RPM=20; FREE_MODEL_NO_CREDITS_RPD=50; FREE_MODEL_HAS_CREDITS_RPD=1e3; FREE_MODEL_CREDITS_THRESHOLD=10`. **As constantes estão no HTML**, nas duas cópias baixadas (A1 e A2): a afirmação do A2-94 de que "os números são injetados via JavaScript e não aparecem no HTML" está **errada**; o A1 está certo.

---

## 1. Conclusões robustas

Sobreviveram à contestação, com a cadeia de IDs.

**R1 — Amplificação sem limite: um único IP esgota a cota do provedor para todos.** `A1-01 → A2-01 → A4-01/A4-62 → C1 (A1) → A2-94 → A4 (reconferido)`
Fatos: 1 requisição de `/api/resumir-apostila` = 41 chamadas de LLM e 1 unidade de cota (reproduzido 2×); 40 chamadas **simultâneas** (`index.py:1171`); 20 requisições/min por IP. Limites publicados: 20–30 RPM. Um só resumo já estoura o RPM; no OpenRouter sem créditos, 41 de 50 chamadas diárias. **Severidade ALTO, condicional** a as chaves estarem em plano gratuito e a URL ser alcançável — nenhuma das duas verificada. O valor em dólar foi retirado pelo A2 e **não** faz parte da conclusão.

**R2 — O enunciado do Resolver é truncado antes do embedding e do prompt.** `A1-03 → A2-03 → A4-03 → C3 → A2-69 (variante) → A4 (reconferido)`
O texto truncado é o único que chega ao modelo (`index.py:1501,1513`). Reproduzido em 6 enunciados realistas. A **frequência em questões reais não foi demonstrada** (a única questão real achada, no campo `origem` do dump, não trunca). ALTO pelo caráter determinístico e silencioso numa função central; cai para MÉDIO com 10 ou mais questões reais abaixo de 10% de truncamento.

**R3 — O Gerador de Apostilas em PDF quebra com saída real deste app.** `A1-04 → A2-04/A2-42 → A4-04 → C4 → A2-70/A2-92 → A4 (reconferido)`
Saiu do campo da inferência: **4 de 44 termos gerados em produção contêm U+2011**, e o fpdf2 falha com ele. O formato padrão da aba é PDF e a falha ocorre **depois** de pagar a chamada de IA. ALTO. Corolário verificado: a tabela fixa de tradução do A3 original produziria `UTF?8`; a DejaVu (1,46 MB, licença permissiva, já coberta pelo glob `api/_app/**`) resolve sem isso.

**R4 — A restauração documentada faz a primeira reindexação apagar os chunks novos, em silêncio.** `A1-02 → A2-02/A2-43 → A4-02 → C2 → A2-77`
Mecânica confirmada por código e documentação; **não executada em Postgres**. MÉDIO (condicional à restauração), com prioridade AGORA: a correção é uma linha (`setval`) e o único sinal visível da perda é o contador do cabeçalho. O argumento atenuante "recuperável pelos dumps" foi **retirado pelos dois agentes**.

**R5 — O stream declara "fim" quando o provedor errou no meio.** `A4-61 (novo) → A2-73/Contestação 3 → C5 → A3-05`
Reproduzido por mim e pelo A2 em três formatos, um deles o **formato documentado do OpenRouter** (`finish_reason: "error"` com HTTP 200). Some-se o texto parcial apagado (`PerguntarTab.tsx:96-99`) e o `SyntaxError` cru em linha incompleta. A1-05 em **MÉDIO** por falta de dado de frequência.

**R6 — Fluxo de upload e ingestão anuncia sucesso onde houve bloqueio ou perda.** `A1-06/A1-07/A1-08 → A2-06/07/08/60 → A4-06/07/08 → C6`
Três reproduções independentes (retentativa insere 2×; B.pdf com conteúdo de A não passa pela guarda; 409 e 422 viram "✓ Concluído"). Correção de narrativa aceita: a perda é **imediata**, no mesmo fluxo do upload. MÉDIO cada.

**R7 — Heurísticas de confiança com defeito demonstrado.** `A1-09/A1-10 → A2-09/10/62 → A4-09/10`
Auditoria sem acento (cobertura 0,782 contra 1,0; 3,5% de mudança de classificação), cegueira a negação (causa correta: regex `[a-z0-9]{4,}`), divergência numérica falsa com "5 × cinco" e com páginas diferentes. MÉDIO cada.

**R8 — Orçamento de tempo por chamada, não por requisição.** `A1-13 → A2-13/63/68 → A4-13/A4-62 → C8 → A2-74`
`gerar_embeddings` pode gastar cerca de 120 s (reproduzido); o lote 0 baixa o arquivo 2×; `extrair_pontos` engole falhas e a resposta informa `chunks_usados=40` mesmo perdendo trechos (reproduzido com provedor simulado). MÉDIO.

**R9 — Login e sessão.** `A1-14 → A2-14/33/51 → A4-14 → Contestação 8`
`compare_digest` com texto não ASCII dá 500 **pelo corpo JSON**, sem depender do proxy; 30 tentativas, nenhum 429. MÉDIO — **CRÍTICO se A2-59 se confirmar**.

**R10 — Ambiente não reproduzível.** `A1-15 → A2-15/48/64 → A4-15 → C9 → A2-76`
`fastapi>=0.111` resolveu para starlette 1.6.0 com avisos de descontinuação já visíveis; Vercel usa 3.12 por padrão; a máquina local não tem 3.12. MÉDIO, com o argumento da guarda de 60% **retirado**.

**R11 — Os planos precisam de um passo 0.** `A2-59/N1 → A4-19/A4-64 → Contestação 10 → A3-08 passo 0`
Que o valor **exista** é fato; que seja a senha real é **hipótese**. Conferi sem exibir: 11 caracteres, aparece **só** em `tests\test_admin_auth.py` e **não** vazou para nenhum documento desta análise. A ação de confirmação custa minutos e todos os agentes convergiram nela.

**R12 — Correções de menor custo com efeito imediato:** `setval` (A3-09), curadoria da lista de modelos (A3-25, ex-A4-40), rótulo da auditoria (A3-18a), `raise_for_status` no `/api/status` (A3-07).

---

## 2. Conclusões frágeis ou retiradas

| Conclusão | Situação | Motivo |
|---|---|---|
| "Terceiros esgotam o teto global"; "205.000 chamadas/dia" (A1-01) | **Retirada pelo A1** | Precisa de 17 ou mais IPs; por IP são 12.300/dia |
| Custo de US$ 0,25 por chamada e US$ 75 por IP/dia (A2-01) | **Retirada pelo A2** | Corpo de 4,5 MB fica perto ou acima do contexto de 1 M tokens; cobrança de chamada abortada desconhecida |
| "`<think>` no stream do qwen é confirmado pela doc" (A2-05/A2-53) | **Rebaixada a inferência** | O A2 admite que **o resumo do WebFetch inventou a frase**. Sustenta-se só no comentário do próprio projeto |
| "Números do OpenRouter injetados via JS, não verificáveis" (A2-94) | **Refutada por mim** | As constantes estão no HTML nas duas cópias; 20 RPM, 50 RPD sem crédito |
| "Recuperável pelos dumps" como atenuante de A1-02 | **Retirada pelos dois** | Perda silenciosa |
| A1-12 e A1-16 em MÉDIO | **Rebaixadas a BAIXO** | Contorno imediato; NAT é hipótese sem dado |
| "Semáforo só alonga o tempo" (A3) | **Retirada pelo A3** | Taxa e tempo são limites diferentes |
| "TTF exige mudar `includeFiles`" (A3-02) | **Retirada pelo A3** | Glob `_app/**` já cobre; licença verificada |
| Troca de `. :` na busca do glossário (A3-01) | **Retirada pelo A3** | Quebraria "Node.js"; aspas são o caminho documentado |
| Limites de 4.000 e 12.000 caracteres (A3-03) | **Retirados pelo A3** | Sem dado; substituídos por limites folgados e teto de frases |
| `MAX_CHUNKS_RESUMO` 40 → 20 (A3-06) | **Retirada pelo A3** — e eu **discordo da retirada** | Ver Discordância 1 |
| A3-21 (flashcards) e A3-23 (simulado) | **Retiradas pelo A3** | Sem demanda e com risco pedagógico |
| A3-12 com migração | **Retirada pelo A3** | Substituída pela versão sem migração |
| A2-43 (identity/COPY), A2-44 (RLS/PostgREST), A2-52 (advisories) | **Frágeis** | Dependem do resumidor que errou 2×; não reconferidas no bruto |
| Frequência de A1-03, A1-04, A1-05 e A1-11 | **Não demonstrada** | Sem questões reais, sem apostilas reais, sem logs, sem teste de interface |
| Estado de produção (V19) | **Não verificável** | Nenhuma conclusão deve depender dele sem aviso |

---

## 3. Discordâncias que permanecem

```
DISCORDÂNCIA 1 — Número de trechos do resumo
- Agente: Agente 3 (A3-06 revisada: volta a 40, com semáforo 4)
- Posição (A4, com o A2 em A2-74): o número de trechos precisa caber no limite por MINUTO do provedor, não só no semáforo.
- Argumento: semáforo controla simultaneidade; prazo controla duração; nenhum dos dois controla RPM. Com 30 RPM e um orçamento de 52 s, cabem no máximo ~26 chamadas; com 20 RPM (OpenRouter), ~17. Um resumo de 40 trechos estoura por aritmética, com ou sem semáforo. A regra deve ser: trechos ≤ RPM × (prazo/60), menos a reduce.
- Evidência: Groq Free 30 RPM / 8K TPM (HTML bruto, reconferido por mim); OpenRouter 20 RPM e 50 RPD (idem); A4-62 (50 respostas 429 com provedor simulado); A2-74 (estimativa de ~16 trechos/min no gpt-oss-120b).
- O que falta para resolver: plano real de cada chave. Enquanto não houver, o valor deve vir de uma constante por provedor, calculada a partir do RPM publicado.
```

```
DISCORDÂNCIA 2 — Regressão da variante "último A"
- Agente: Agente 3 (E1) e Agente 2 (A2-69), que a adotam sem tratar o caso
- Posição (A4): adotar, mas com guarda explícita para várias questões coladas.
- Argumento: com duas questões no mesmo campo, a variante devolve um enunciado que contém a questão 1 inteira. O código de hoje é pior (mistura enunciado da 1 com alternativas da 2), então a variante avança — mas o modo individual aceita colagem múltipla e ninguém trata isso.
- Evidência: execução própria (r3.py), caso "duas questoes"; ResolverTab.tsx:89-104 (o modo lote divide por linhas em branco, o individual não).
- O que falta: decidir entre recusar com mensagem ("parece haver mais de uma questão; use o modo lote") ou dividir automaticamente. Precisa de questões reais para escolher.
```

```
DISCORDÂNCIA 3 — Valor do semáforo e do teto de resumos por IP
- Agente: Agente 3 (Discordância 3 dele: padrão 4; resumo-ip-dia 10)
- Posição (A4): concordo que ninguém tem o número; por isso ambos devem ser variáveis de ambiente com valor inicial derivado do RPM publicado, não constantes escolhidas à mão.
- Argumento: um número arbitrário no código vira dívida invisível, como o LIMITE_LLM_POR_MINUTO = 20 de hoje (N7).
- Evidência: index.py:173; A2-94.
- O que falta: medição com as chaves reais.
```

```
DISCORDÂNCIA 4 — Base de calibração (A3-10)
- Agente: Agente 3 (contadores via consumir_cota, AGORA) × Agente 2 (A2-78: só funciona com migração e service_role)
- Posição (A4): a proposta é aceitável, mas é AGORA CONDICIONAL. Sem service_role configurada, os contadores não existem — e o estado da service_role é justamente o que ninguém verificou.
- Argumento: A3-03, A3-06, A3-11 e A3-25 dependem desses números; se a dependência falhar em silêncio (index.py:435-437 já engole a falha), calibra-se no escuro.
- Evidência: index.py:413-414 e 435-437; A2-78 (retenção 1 h Hobby / 1 dia Pro); cota-de-uso.sql:44-47 (faxina de 2 dias).
- O que falta: /api/config mostrando escrita_via=service_role. Se for anon, o passo anterior é configurar a service_role.
```

```
DISCORDÂNCIA 5 — Prioridade de A3-12 (resolvida a favor do Agente 3, com condição)
- Agente: Agente 3 (PRÓXIMO) × Agente 4 no Ciclo 3 (DEPOIS)
- Posição final (A4): aceito PRÓXIMO. A versão revisada não tem migração, custa 3 a 5 h e é pré-requisito prático de A3-13.
- Argumento: minha objeção era à migração e à rota de cancelamento, que o A3 retirou.
- Evidência: A2-06 (4 chunks inseridos onde deviam ser 2); A4-52/A2-95 (o reenvio do reconstruído exercita esse caminho).
- Condição: se o dono não for reenviar o material nos próximos ciclos, volta a DEPOIS.
```

---

## 4. Registros de decisão

```
DECISÃO 1: Confirmar e, se for o caso, rotacionar a credencial de admin antes de qualquer outro trabalho.
CONTEXTO: tests\test_admin_auth.py define um ADMIN_PASS literal com forma de senha pessoal, ao lado de um ADMIN_TOKEN obviamente falso; o ADMIN_USER é o identificador do dono. Conferido sem exibir o valor: 11 caracteres, presente só nesse arquivo, não vazou para os documentos da análise.
OPÇÕES: (a) o dono confirma e, se coincidir, troca ADMIN_PASS e SESSION_SECRET, troca onde houve reutilização e põe valor falso no teste; (b) só trocar o valor do teste; (c) não fazer nada.
EVIDÊNCIAS: A2-59, N1, A4-19, A4-64, Contestação 10 do A2, A3-08 passo 0. index.py:288 (a sessão é assinada com SESSION_SECRET or ADMIN_TOKEN, 8 h, sem revogação). A1-14 (login sem limite de tentativas).
RISCOS: se for real e ficar como está, quem tiver o repositório ou este pacote "release" tem acesso de admin — upload, troca e apagamento do índice. Trocar só a senha deixa sessões vivas por 8 h. O histórico do git mantém o valor.
TRADE-OFFS: custo de minutos contra risco de comprometimento total do acervo. Não há trade-off real.
INFORMAÇÕES AUSENTES: se o valor é ou foi real; se houve reutilização; se o repositório já foi compartilhado; esta cópia não tem .git.
TESTE: o dono compara com o valor em uso na Vercel. Depois da troca, um login com a senha antiga deve dar 401 e um token antigo deve ser recusado.
PRÓXIMO PASSO: passo 0 do plano. Em qualquer resultado, o teste passa a usar valor obviamente falso.
```

```
DECISÃO 2: Como o Gerador de Apostilas escreve PDF.
CONTEXTO: a Helvetica embutida só aceita Latin-1 e a rota responde 500 depois de pagar a chamada de IA; PDF é o formato padrão.
OPÇÕES: (a) fonte DejaVu (Sans + Bold) empacotada em api\_app\fonts\; (b) tradução fixa para Latin-1 com replace; (c) as duas, com a tradução como plano B (posição final do A3).
EVIDÊNCIAS: A1-04, A2-04, A4-04 (17 casos falham); 4 de 44 termos reais com U+2011 e NFKD(U+2011)=U+2010, medido por mim; com replace, "UTF‑8" vira "UTF?8"; DejaVu = 1.462.760 bytes, licença Bitstream Vera permissiva (A2-92); o glob api/{rag_core.py,_app/**} cobre a pasta (testado com picomatch, minimatch e micromatch em A2-70).
RISCOS: 1,46 MB a mais no pacote (desprezível perto do limite do runtime); emoji sem glifo, só com aviso; se a fonte não for empacotada no deploy, a rota quebra em produção e não no teste local.
TRADE-OFFS: (a) preserva os símbolos e custa peso; (b) é mais leve e degrada o texto; (c) custa um caminho de código a mais e elimina os dois modos de falha.
INFORMAÇÕES AUSENTES: preferência do dono quanto a "?" no PDF.
TESTE: os 17 casos do A2-04 mais 'Retrieval‑Augmented' e 'UTF‑8' devolvendo bytes que começam com %PDF; um teste que falhe se o arquivo da fonte não existir no caminho empacotado; uma geração real no deploy de preview.
PRÓXIMO PASSO: A3-02 revisada, na fase AGORA, com o teste do arquivo da fonte obrigatório.
```

```
DECISÃO 3: Como caber o resumo map-reduce dentro do orçamento e dos limites do provedor.
CONTEXTO: 40 chamadas simultâneas numa chave com 20 a 30 RPM, num orçamento de 52 s, com falhas descartadas em silêncio e chunks_usados enganoso.
OPÇÕES: (a) só prazo (A3 original); (b) prazo + semáforo, mantendo 40 trechos (A3 revisada); (c) prazo + semáforo + trechos limitados pelo RPM publicado + chunks_ok (A4 e A2-74); (d) subir maxDuration com fluid compute e manter 40.
EVIDÊNCIAS: A1-13, A4-62 (reproduzido: 50 respostas 429 e chunks_usados=40), A2-94 e minha reconferência (Groq Free 30 RPM/8K TPM; OpenRouter 20 RPM, 50 RPD sem crédito), provedores.py:83,114-116, A2-90 (fluid compute permite 300 s, ligado por padrão em projetos novos).
RISCOS: (b) continua estourando o RPM por aritmética; (c) entrega resumos com menos trechos, o que precisa aparecer na tela; (d) vale para todas as rotas (uma única entrada em vercel.json) e faz o aluno esperar minutos por um erro.
TRADE-OFFS: cobertura do resumo contra disponibilidade da chave compartilhada. Hoje o app troca cobertura aparente por falhas invisíveis.
INFORMAÇÕES AUSENTES: plano de cada chave; se o fluid compute está ligado.
TESTE: com o mock do A4-62, zero respostas 429 e chunks_ok igual aos trechos bem-sucedidos; um teste de aritmética garantindo trechos ≤ RPM × (prazo/60) − 1.
PRÓXIMO PASSO: A3-06 revisada com o teto por RPM como constante por provedor; (d) só depois de confirmar fluid compute no painel.
```

```
DECISÃO 4: Com que dado calibrar limites, prazos e cotas.
CONTEXTO: não há métrica nenhuma, e quase toda severidade "condicional" desta análise depende de dado de uso.
OPÇÕES: (a) logs de runtime da Vercel (A3-10 original); (b) contadores de evento em cota_uso via consumir_cota, com migração de uma linha para não serem apagados (A3-10 revisada); (c) Observability Plus ou Drain (pagos); (d) não medir e calibrar por palpite.
EVIDÊNCIAS: A2-78 e A2-93 (retenção 1 h no Hobby, 1 dia no Pro, 30 dias só com Observability Plus; Drains só em Pro ou Enterprise); cota-de-uso.sql:44-47 (faxina de 2 dias); index.py:413-414 e 435-437 (sem service_role a camada distribuída simplesmente não roda, e a falha é engolida).
RISCOS: (b) não funciona sem service_role e custa 1 RPC por evento; sem a migração, guarda só 2 dias; (d) repete o erro já existente das constantes escolhidas à mão.
TRADE-OFFS: (b) é de graça e suficiente para contagem de erros, mas não guarda latência por requisição; (c) resolve e custa dinheiro.
INFORMAÇÕES AUSENTES: plano da Vercel; se a service_role está configurada.
TESTE: /api/config devolvendo escrita_via=service_role; em teste, um 504 simulado incrementa m:504:perguntar:* e a rota de admin lê o contador.
PRÓXIMO PASSO: A3-10 revisada, AGORA e condicional: primeiro confirmar a service_role; se for anon, configurar a service_role vem antes.
```

```
DECISÃO 5: Como separar enunciado e alternativas no Resolver.
CONTEXTO: hoje qualquer letra de a a e seguida de ".", ")" ou "-" corta o enunciado, e o fragmento é o que vai para o embedding e para o prompt.
OPÇÕES: (a) ancorar a regex em início de linha (A3-01 original); (b) usar a última sequência de marcadores A, B, C… em ordem (E1 do A3, A2-69); (c) exigir que o aluno separe as alternativas.
EVIDÊNCIAS: A1-03, A2-03 (27,5% das frases do material com gatilho), A4-03, C3 (a única questão real encontrada não trunca), execução própria em r3.py: (b) corrige E. coli, A. Smith, afirmativas a)/b) e (IA), mantém o teste atual, e regride com duas questões coladas — caso em que o código de hoje já erra de forma pior.
RISCOS: (b) falha em questões cujas alternativas não comecem em A e em texto com várias questões; (a) deixa resíduos que somem em silêncio; (c) piora a experiência.
TRADE-OFFS: (b) cobre mais casos e cria um caso novo, detectável; (a) é menos ambiciosa e menos completa.
INFORMAÇÕES AUSENTES: conjunto real de questões do curso; nenhum agente conseguiu obter mais de uma.
TESTE: os 11 casos de E1 mais os 7 meus, incluindo "duas questões coladas" com o comportamento decidido, e a exibição do enunciado reconhecido na tela (hoje ele é invisível).
PRÓXIMO PASSO: A3-01 revisada com (b), mais aviso de "mais de uma questão detectada" e exibição do enunciado usado.
```

```
DECISÃO 6: Quando reenviar o material reconstruído (pendência de 10/09).
CONTEXTO: 73% do índice vem de um arquivo ausente do Storage; o reenvio é a pendência mais antiga do projeto e passa exatamente pelos caminhos defeituosos.
OPÇÕES: (a) reenviar agora pela aba PDFs; (b) reenviar depois de A3-04 e A3-12; (c) reindexar por script local (scripts\reimportar_chunks.py), fora da interface.
EVIDÊNCIAS: A4-52 e A2-95 (o arquivo não está no Storage, fonte_afetada=None, e a guarda do upload não roda); A1-07 (um 409 na ingestão vira "✓ Concluído"); A1-06 (retentativa duplica); A2-35 e E9 (o PDF reconstruído leva o marcador [página N] no texto); A1-02 (a sequência de ids só importa se houve restauração).
RISCOS: (a) pode terminar com o documento sem índice e com "✓" na tela; (c) exige a service_role na máquina do admin.
TRADE-OFFS: (b) atrasa a pendência em alguns dias e elimina a classe de falha; (a) é imediata e cega.
INFORMAÇÕES AUSENTES: se o dono pretende reenviar em breve — é isso que também decide a prioridade de A3-12.
TESTE: depois do reenvio, medir_indice_atual da fonte com chunks > 0 e igual a chunks_novos; o contador do cabeçalho subir; uma pergunta do tema devolver trechos dessa fonte.
PRÓXIMO PASSO: A3-13 depois de A3-04 e A3-12, com o PDF gerado de novo sem o marcador [página N] e com a conferência da contagem como critério de aceitação.
```

---

## 5. Argumento mais forte contra nossa conclusão

Os quatro agentes convergiram em que o projeto precisa de algo entre 40 e 60 horas de correção, organizadas em dez itens "AGORA". O argumento mais forte contra isso é este:

**Quase toda a severidade desta análise é condicional a um contexto de produção que ninguém verificou, e a evidência disponível aponta para um app de um usuário só.** Não há métrica de uso, nem público documentado, nem registro de incidente. Os agentes mediram **código**, não gente. Se a URL não é divulgada, se quem usa é o próprio dono e mais alguns colegas, e se as chaves gratuitas só servem a esse uso, então:

- **R1 (ALTO)** descreve um abuso que exige alguém querendo abusar;
- **R4** descreve um desastre que exige uma restauração que nunca aconteceu;
- **R5, R8 e R6** descrevem falhas cuja frequência ninguém conseguiu estimar;
- **R2 e R3** são os únicos que quebram no uso normal e cotidiano — e mesmo R2 ficou com **uma** questão real como amostra, sem truncamento.

Nesse cenário, o plano de dez itens AGORA é, em boa parte, seguro contra eventos improváveis, pago com o recurso mais escasso do projeto: um mantenedor. Pior: **o próprio plano é o maior risco de regressão identificado nesta análise**. Não existe nenhum teste de interface, os 145 testes de backend dependem de cerca de 50 `monkeypatch.setattr`, e as mudanças propostas tocam justamente o caminho principal (stream, cota, ingestão, prazo). A probabilidade de introduzir um defeito novo na aba Perguntar ao consertar defeitos que talvez nunca tenham atingido um aluno não é desprezível.

A versão mínima defensável dessa objeção, que eu aceitaria sem dado nenhum: **passo 0 (senha), A3-09 (uma linha), A3-25 (curadoria), A3-02 (PDF), A3-01 (enunciado e auditoria) e A3-18a (rótulo)** — algo entre 8 e 14 horas — resolvem o que quebra no uso normal. Todo o resto deveria esperar a resposta de quatro perguntas: quem usa, quantos são, qual o plano das chaves e se a URL é pública. Se essas respostas vierem "só eu, URL não divulgada, chaves gratuitas, sem plano de restauração", o plano completo está superdimensionado e deve ser reordenado.

Registro também a objeção secundária: o resumidor de páginas web errou **duas vezes** nesta análise (modelos do OpenRouter, frase da Groq). Toda conclusão que ainda dependa só dele — A2-43, A2-44, A2-52 — deve ser lida como frágil.

---

## 6. O que precisa ser testado antes de investir mais

**Custa minutos e destrava o resto:**
1. O literal de `tests\test_admin_auth.py` é, ou foi, a senha real? (Decisão 1)
2. `/api/config` em produção: `escrita_via` é `service_role` ou `anon`? Sem isso, A3-10, A3-11a e metade do limite de uso não existem.
3. Painel da Vercel: plano, fluid compute ligado, Firewall ou Deployment Protection, retenção de logs.
4. Painéis dos provedores: plano e limites reais de cada chave (Groq, Nous, NVIDIA, AnyAPI, Orca, OpenRouter); existe saldo em chave paga?
5. A URL é pública? Quantas pessoas usam? Estão atrás do mesmo IP?

**Custa horas e decide severidade:**
6. 10 ou mais questões reais do curso passadas por `extrair_alternativas`, hoje e com a variante do "último A" (decide R2 entre ALTO e MÉDIO).
7. 10 ou mais apostilas geradas pelos modelos padrão, contando caracteres acima de U+00FF (confirma ou reduz R3).
8. 20 respostas reais exportadas pelo botão ".md": tamanho em caracteres (calibra A3-03) e formato das citações (decide A3-17).
9. Ensaio de restauração num Postgres com pgvector: `nextval` depois do `\copy`, a colisão a partir do id 942 e o `setval` (fecha R4).
10. Supabase local: `or=()` com aspas e curinga `ilike`, upsert com termo repetido, DELETE com 0 linhas, `select extversion from pg_extension where extname='vector'`.
11. `scripts\medir_latencia.sh` com chaves: latência real, `allam-2-7b`, e `reasoning_format: "hidden"` numa chamada à Groq.
12. Um deploy de preview: dois arquivos de 3 MB no upload, um stream longo com modelo lento, e a fonte DejaVu presente no pacote.

---

## 7. Tabela consolidada final

### 7.1 Problemas

| ID | Título curto | Severidade final | Status | Correção adotada |
|---|---|---|---|---|
| A1-01 | Amplificação: 1 IP esgota a cota do provedor | **ALTO** | condicional (plano da chave; URL alcançável) | A3-11a, A3-06, A3-03, A3-25 |
| A1-03 | Enunciado do Resolver truncado | **ALTO** | confirmado; frequência não demonstrada | A3-01 (variante "último A") |
| A1-04 | PDF da apostila quebra fora do Latin-1 | **ALTO** | confirmado, com saída real (U+2011) | A3-02 (DejaVu + plano B) |
| A1-02 | Restauração sem `setval` apaga o índice | **MÉDIO** (prioridade AGORA) | condicional à restauração | A3-09 (+ A3-04 item 7) |
| A1-05 | Stream: parcial apagado, erro vira "fim" | **MÉDIO** | confirmado; frequência sem dado | A3-05, A3-06, A3-25 |
| A1-06 | Ingestão não idempotente | **MÉDIO** | confirmado (reproduzido) | A3-12, A3-04 |
| A1-07 | Bloqueio anunciado como "✓ Concluído" (+A2-60, 422) | **MÉDIO** | confirmado (código) | A3-04 |
| A1-08 | Upload mistura documentos e apaga o outro | **MÉDIO** | confirmado (reproduzido) | A3-04 item 6 |
| A1-09 | Auditoria sem acento (+cegueira a negação) | **MÉDIO** | confirmado (medido no dump) | A3-01, A3-18a |
| A1-10 | Divergência numérica falsa no Comparar | **MÉDIO** | confirmado | A3-01 |
| A1-11 | Duas rodadas simultâneas na aba Perguntar | **MÉDIO** | confirmado (código) | A3-05 (`lib\rodadas.ts`) |
| A1-13 | Orçamento por chamada; trechos perdidos em silêncio | **MÉDIO** | confirmado (+A2-63, A2-68, A4-62) | A3-06 |
| A1-14 | Login sem limite; 500 com não ASCII | **MÉDIO** (CRÍTICO se A2-59 se confirmar) | confirmado | A3-03, passo 0 |
| A1-15 | Dependências sem versão fixada; 3 Pythons | **MÉDIO** | confirmado | A3-08 |
| A1-12 | Glossário não gera na 1ª navegação | **BAIXO** | confirmado (código) | A3-07 |
| A1-16 | Cota consumida em dobro; NAT | **BAIXO** (MÉDIO com NAT) | consumo confirmado; NAT hipótese | A3-11a |
| A1-17 | Gerador bloqueia com a base indisponível | **BAIXO** | confirmado | A3-02 (com timeout curto) |
| A1-18 | Glossário: termo repetido e busca com vírgula | **BAIXO** | código e doc; sem banco | A3-01 (aspas) |
| A1-19 | Falhas silenciosas (status, providers, auditoria) | **BAIXO** | confirmado | A3-07 |
| A1-20 | Verificação de RLS por status; script sem REVOKE | **BAIXO** | confirmado (texto) | A3-09 |
| A1-21 | Documentação divergente | **BAIXO** | confirmado | A3-08 |
| A1-22 | postcss aninhada no next | **BAIXO** (informativo) | confirmado, sem exploração aplicável | A3-08 (`overrides` a testar) |
| A1-23 | Anexo removido durante a leitura insere texto | **BAIXO** | código; não executado | **sem proposta do A3 — lacuna** (juntar ao A3-26) |
| A2-59 / N1 | Literal com forma de senha no teste | **CRÍTICO se confirmado**, senão BAIXO | hipótese | passo 0 + A3-08 |
| A2-61 | 4 MB por arquivo, 4,5 MB por requisição | **BAIXO** | doc; não testado na Vercel | A3-04 item 5 |
| A2-66 | Temporizador do OCR corta leitura | **BAIXO** | código | A3-26 |
| A2-58 / N9 | `<think>` e `<thinking>` não removidos | **BAIXO** | reproduzido | A3-05 |
| A2-65 / A2-36 | Modelos pagos sem anotação; `allam-2-7b` | **BAIXO** | catálogo conferido; disponibilidade não | A3-25 |
| A2-67 / A2-68 | Comentário errado; download duplicado | **BAIXO** | confirmado | A3-06 |
| A4-61 | Erro do provedor no meio do stream vira "fim" | **MÉDIO** | confirmado (3 formatos, 1 documentado) | A3-05 |
| A4-62 | Resumo perde trechos em silêncio por 429 | **MÉDIO** | confirmado com limite simulado | A3-06 |
| A4-63 | "Todas as frases têm apoio" fica falsa com teto | **MÉDIO** (se A3-03 for aplicado) | confirmado (código) | A3-03 revisada |
| A4-64 / A4-65 | Sessão não revogada; token sem limitador | **BAIXO** | confirmado (código) | A3-03, A3-08 |
| N5 | Prompt manda complementar × rótulo "inventou" | **MÉDIO** (produto) | confirmado | A3-18a, A3-18b |
| N7 / N8 / N10 / N11 | Limite fixo no código; 422 cru; psutil; verificação destrutiva | **BAIXO** | confirmados | A3-03, A3-08, A3-09 |

### 7.2 Plano

**PASSO 0 — antes de tudo (minutos):** confirmar a credencial (Decisão 1) e ler `/api/config` para saber se a service_role está ativa. **Divergência com o A3:** ele põe só a credencial; eu acrescento a service_role, porque A3-10 e A3-11a dependem dela e falham em silêncio.

**AGORA**

| ID | O que entrega | Depende de | Divergência com o A3 |
|---|---|---|---|
| A3-25 | Curadoria da lista de modelos; metadados "pago/lento" | medição com chaves | **Divirjo em parte:** metadados e retirada dos dois nemotron podem ir já; tirar `allam-2-7b` só **depois** de medir |
| A3-09 | `setval` no roteiro; verificação de RLS só de leitura | — | concordo |
| A3-18a | Rótulo e legenda da auditoria | — | concordo |
| A3-02 | PDF com DejaVu, plano B Latin-1, busca opcional com timeout curto | licença no repositório | concordo; **teste obrigatório** de que a fonte existe no pacote |
| A3-01 | Enunciado pelo "último A", auditoria com acento, divergência numérica, glossário com aspas | PostgREST local | concordo, **mais** o caso "duas questões" (Discordância 2) e exibir o enunciado usado |
| A3-03 | Comparação em bytes, limitador de falhas, teto de frases com aviso, limites folgados, N8 | service_role (parcial) | concordo |
| A3-11a | Busca e auditoria fora da cota de LLM; teto diário de resumos por IP | service_role | concordo; **limites por ambiente**, não constantes (Discordância 3) |
| A3-10 | Contadores de evento em `cota_uso`; leitura por rota de admin | service_role; migração de 1 linha | **AGORA condicional:** se `escrita_via=anon`, configurar a service_role vem antes (Discordância 4) |
| A3-06 | Prazo por requisição, semáforo, embeddings sem repetir após timeout, download único, `chunks_ok` | — | **Divirjo:** número de trechos limitado pelo RPM do provedor, não fixo em 40 (Discordância 1) |
| A3-05 | Stream: `error` detectado, parcial preservado, rodadas em `lib`, `<think>` | A3-06 | concordo |
| A3-08 | `.python-version`, venv com uv em 3.12, versões fixadas, `.env.example`, rotação da credencial | uv; CI | concordo |
| A3-07 (parcial) | `raise_for_status` no `/api/status` | — | **Divirjo:** o A3 mandou o A3-07 inteiro para PRÓXIMO; esta parte custa minutos e evita diagnóstico errado |

**PRÓXIMO**

| ID | O que entrega | Depende de | Divergência |
|---|---|---|---|
| A3-12 | Desfazer ingestão falha por `id > corte`, sem migração | A3-04, A3-09 | **Concedo o PRÓXIMO ao A3** (Discordância 5), condicionado a o reenvio do material estar previsto |
| A3-04 | Fluxo de upload e ingestão (4xx como pendência, 1 arquivo por requisição, ids alinhados) | — | concordo; **está listado em AGORA pelo A3 e eu mantenho AGORA** — aparece aqui só como dependência de A3-12 |
| A3-13 | Higiene do acervo e reenvio do reconstruído sem o marcador | A3-04, A3-12 | concordo (Decisão 6), com a contagem de chunks como critério |
| A3-14 | Perguntas de referência (hit@1, hit@6, MRR) | — | concordo; é pré-requisito de A3-18b e A3-20 |
| A3-07 (resto) | Seed do glossário, providers com nova tentativa, mensagens | — | concordo |
| A3-26 (+A1-23) | Temporizador do OCR **e** anexo removido durante a leitura | — | **Divirjo:** o A3 não cobriu A1-23; deve entrar no mesmo PR |
| A3-16 | Histórico local em Perguntar e Professor | — | concordo |
| A3-24 passo 1 | "Ver trecho completo" | — | concordo |
| A3-17 | Conferência de citações | amostra de 20 respostas | concordo (condicional) |

**DEPOIS**

| ID | Motivo | Condição de entrada |
|---|---|---|
| A3-11b | Cota ponderada com SQL novo | URL pública confirmada e dados de A3-10 |
| A3-18b | Modo estrito | A3-14 calibrado |
| A3-19 | Painel do admin | A3-10; aceitar 2 dias de histórico |
| A3-20 | Filtro por apostila | A3-13 e A3-14; versão do pgvector |
| A3-22 | Retorno do aluno | base legal (LGPD AUSENTE) |
| A3-15 | Dividir `index.py` | tudo estável e mais de um mantenedor |

**NÃO FAZER AGORA**

| ID | Motivo |
|---|---|
| A3-24 passo 2 | Expõe o bucket privado; URL assinada não é revogável pelo projeto (A2-88); 73% dos links quebrados |
| A3-21, A3-23 | Retiradas pelo próprio A3: sem demanda e com risco pedagógico |
| Subir `maxDuration` sem prazo por requisição | Vale para todas as rotas (uma entrada em `vercel.json`) e faz o aluno esperar minutos por um erro |
| Next 16, banco vetorial novo, embeddings pagos, reranker, autenticação de alunos, reescrita | Nenhum achado sustenta; A1-22 é informativo |

---

**Autocrítica final.** *Em que circunstância meu veredito estaria errado?* Se a produção estiver protegida e com chaves pagas folgadas, R1 cai para MÉDIO e metade do plano AGORA vira seguro caro. Se as questões reais do curso raramente tiverem o gatilho, R2 cai para MÉDIO. Se as apostilas geradas pelos modelos padrão não usarem travessão nem hífen inseparável, R3 cai para MÉDIO — o U+2011 veio do glossário, não de uma apostila. Se nunca houver restauração, R4 é irrelevante. E se o app tiver um usuário só, o argumento da seção 5 vale mais que a soma das minhas conclusões.

*Que evidência me faria mudar de opinião?* Painéis dos provedores e da Vercel; 10 questões reais e 10 apostilas reais; logs ou contadores com uso real por algumas semanas; e um ensaio de restauração num Postgres local. As quatro primeiras perguntas do item 6 custam minutos e mudam mais coisas do que qualquer hora adicional de leitura de código.
