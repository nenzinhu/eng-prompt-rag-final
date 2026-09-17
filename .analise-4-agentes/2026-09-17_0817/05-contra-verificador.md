# 05: Contra-verificação (Agente 2), Ciclo 4

**Data:** 17/09/2026. Todos os acessos web foram feitos nesta data.

**Como trabalhei:**
- **Projeto:** somente leitura. No fim, `find` não achou `__pycache__` nem `.pytest_cache`. Não chamei a produção.
- **Scripts e cópias** (só no scratchpad): `...\scratchpad\a2\c4t\` (`test_c4_stream.py`, `a301.py`, `pdf_ttf.py`, `mw.py`) e as fontes brutas baixadas em `...\scratchpad\a2\c4\`.
- **Teste JS temporário:** rodado na cópia `rag-js` e apagado depois.
- **Fontes externas:** conferi o HTML ou markdown **bruto**, não o resumo do WebFetch, sempre que o Agente 4 pediu ou a conclusão dependia disso.

**Aviso de integridade:** o HTML bruto mostrou que **o resumo do WebFetch inventou uma frase** que eu citei em A2-53 (detalhe na Contestação 7). É o segundo erro desse resumidor nesta análise.

---

## 1. Respostas às contestações do Agente 4

### Contestação 1: A2-02, "recuperável pelos dumps" diante de uma perda silenciosa
**REVEJO o argumento. MANTENHO MÉDIO**, com prioridade AGORA.

- **Evidência nova:**
  - O log da ingestão mostra `✓ ${nome}: ${ultimoTotal} chunks` (`PdfsTab.tsx:200-202`), e `ultimoTotal` é o total de trechos **novos** calculados, não o que ficou gravado. O log diz sucesso mesmo quando tudo foi apagado.
  - O único sinal visível é o contador do cabeçalho (`Header.tsx:121`, "N chunks", vindo de `/api/status`, com cache de 30 s). Depois da perda, ele cairia pelo número de trechos do documento: no caso do `_completo`, de 526 para 142.
  - O admin só descobriria olhando esse número, rodando "Verificar antes de reindexar" (que mostraria "0 chunks hoje") ou por reclamação de aluno.
  - Colisão de chave primária (A4-02): com a sequência em 1, o **941º `nextval` ainda passa e o 942º colide**. O dump tem ids de 942 a 1768 com 301 lacunas, então as colisões são intermitentes. Doc do PostgreSQL ([functions-sequence](https://www.postgresql.org/docs/current/functions-sequence.html)): "the value obtained by nextval is not reclaimed for re-use if the calling transaction later aborts". Cada lote que falha consome valores, e a ingestão alterna 500 e sucesso até a sequência passar de 1768.
- **Conclusão:** "recuperável" só vale se alguém perceber, então retiro esse argumento como atenuante. MÉDIO continua pelo motivo que sobra: a perda depende de uma restauração por esse caminho, sem evidência de que tenha ocorrido ou esteja planejada.

### Contestação 2: A2-01, custo de US$ 0,25 e o mecanismo de um IP só
**RETIRO os valores de US$ 0,25 por chamada e US$ 75 por IP por dia. REVEJO a justificativa de ALTO. MANTENHO ALTO.**

**Custo.**
- O teto de contexto (1 M tokens no `qwen3.7-flash`) e a proporção caracteres/token do português, que é NÃO VERIFICADA, fazem 4,5 MB de texto ficarem perto ou acima do limite. O provedor tende a recusar.
- Mesmo com a entrada no tamanho máximo aceito, processar cerca de 800 mil tokens em menos de 52 s e ser cobrado por uma chamada abortada são coisas NÃO VERIFICADAS.
- Valor em dinheiro: **INSUFICIENTE PARA CONCLUIR**. Ordem de grandeza possível: de centavos a cerca de US$ 0,2 por chamada, **se** a chamada for aceita e cobrada. Isso é uma estimativa e precisa ser validada.

**Mecanismo de um IP só: agora há evidência de documentação** (A2-94).
- A Groq publica os limites do **Free Plan** ([rate-limits](https://console.groq.com/docs/rate-limits), HTML bruto):
  - `openai/gpt-oss-120b`: 30 requisições/min, 1 mil/dia, **8 mil tokens/min**;
  - `groq/compound-mini`: 30 requisições/min e **250 requisições/dia**.
- Um único `/api/resumir-apostila` dispara 40 chamadas simultâneas. Só isso já passa de 30 por minuto.
- ESTIMATIVA: no `compound-mini`, 6 resumos (41 × 6 = 246) consomem a cota diária gratuita da chave inteira, que todos os alunos dividem.
- Condição: a chave do projeto estar no Free Plan, o que é NÃO VERIFICADO.
- Com essa condição, ALTO se sustenta com **um IP**, sem o teto global.

### Contestação 3: A2-05, SSE com erro sem `choices`; "o caso mais comum já é tratado"
**REVEJO: a frase era incompleta. O achado fica mais forte.**

- **Reprodução nova** (`test_c4_stream.py`, TestClient na rota real `/api/perguntar/stream`, provedor simulado):
  1. **Formato oficial do OpenRouter**, que tem `choices` com `finish_reason: "error"`, seguido de `[DONE]` → eventos `['meta','texto','fim']`;
  2. o mesmo formato, **sem `[DONE]`** e com a conexão fechando → `['meta','texto','fim']`;
  3. `{"error":...}` sem `choices` → `['meta','texto','fim']`.
- **Fonte:** [OpenRouter, Errors](https://openrouter.ai/docs/api-reference/errors), HTML bruto, seção "Mid-stream errors": "A choices array is included with finish_reason: "error"… The HTTP status remains 200 OK".
- **Conclusão:**
  - O defeito de A4-61 não depende de formato exótico: é o formato **documentado** de um provedor da lista.
  - Um provedor que fecha a conexão sem `[DONE]` também vira `fim`.
  - Quanto ao "caso mais comum": a mensagem "A conexão caiu" está correta, mas o texto parcial é apagado do mesmo jeito (`PerguntarTab.tsx:96-99`).

### Contestação 4: A2-40 e A2-62, causa da cegueira à negação
**RETIRO a atribuição de causa. MANTENHO a conclusão.**

Executei o seguinte: removi `"nao"` de `STOPWORDS` em memória. `'nao' in _nucleo_palavras('A inovação não exige análise')` continua `False`, e a frase negada continua `total`. A causa é a regex `[a-z0-9]{4,}` (`rag_core.py:223`): "nao" tem 3 letras. `STOPWORDS` é redundante nesse ponto.

### Contestação 5: numeração (A2-55 a A2-57)
**Nenhum item se perdeu.** Os três números planejados foram fundidos em outros itens antes de eu entregar:
- caracteres reservados do PostgREST e `ON CONFLICT` com cardinalidade entraram em A2-18;
- IDs dos catálogos e preços entraram em A2-36 e A2-65;
- pgvector virou A2-54.

Conferido por `grep "^### A2-5"` em `02-verificador.md`: vai de A2-54 para A2-58. A falha foi só de numeração.

### Contestação 6: A2-36, `allam-2-7b` no enum da API da Groq
**MANTENHO NÃO VERIFICADA. REVEJO o peso da evidência: ela é fraca nos dois sentidos.**

Contagem no HTML bruto de 5 páginas da Groq:

| Página | `allam-2-7b` | `qwen3.6-27b` | `groq/compound-mini` |
|---|---|---|---|
| models | 0 | 1 | 7 |
| deprecations | 0 | 9 | 0 |
| api-reference | 0 | 1 | 0 |
| rate-limits | 0 | 1 | 3 |
| reasoning | 0 | 27 | 0 |

- O enum da referência da API está **desatualizado**: traz `compound-beta`, `gemma2-9b-it` e `llama-3.1-8b-instant` (este já com desligamento anunciado), e **não traz** `groq/compound-mini`, que é modelo de produção.
- A tabela de limites **não traz** `qwen3.6-27b`, embora ele esteja na página de reasoning.
- A ausência numa página da Groq não prova indisponibilidade. O que resolve é `GET /openai/v1/models` com chave.

### Contestação 7: A2-53, doc de reasoning da Groq no HTML bruto
**REVEJO para PARCIALMENTE VERIFICADA e RETIRO uma citação.**

- **Está no HTML bruto** ([reasoning](https://console.groq.com/docs/reasoning)):
  - "raw: Includes reasoning within `<think>` tags in the main text content";
  - "Note: The format defaults to raw or parsed when JSON mode or tool use are enabled".
- **Não está no HTML bruto:** a frase que citei em A2-05 e A2-53, "When streaming with raw format on non-GPT-OSS models, the `<think>` tags appear within the content stream". `grep "non-GPT"` = 0 e `grep "content stream"` = 0. **Foi inventada pelo resumo do WebFetch.**
- **Ambiguidade na própria doc:** a seção `include_reasoning` diz "true: Includes the reasoning in a dedicated message.reasoning field. This is the default behavior." Não fica claro qual padrão vale para o Qwen quando nenhum parâmetro é enviado.
- **Conclusão:** "`<think>` aparece no stream do `qwen3.6-27b`" passa a ser INFERÊNCIA. Ela se apoia no comentário do próprio projeto (`provedores.py:38`, medição do dono), não na doc. O defeito de código (stream sem limpeza) continua sendo FATO.

### Contestação 8: A2-14, 500 do login acentuado pelo corpo JSON
**MANTENHO. O 500 não depende do proxy.**

- Rodei `test_a2_part1.py` de novo: o login usa `json={"usuario":"admin","senha":"\u00e9"}` → **500**.
- Com o corpo serializado com escape `\u00e9`, os bytes na rede são ASCII. Mesmo um proxy que rejeitasse bytes acima de 0x7F repassaria o corpo. O `TypeError` nasce depois do parse do JSON, em `index.py:770`.
- Só o caso do `X-Admin-Token` Latin-1 depende de como o proxy trata cabeçalhos.

### Contestação 9: propostas do A3 apontadas pelo A4
Respondidas em A2-69 (A3-01), A2-70 (A3-02), A2-71 (A3-03), A2-79 (A3-11) e A2-76 (A3-08), abaixo.

### Contestação 10: A2-59, em que se baseia "aparência de senha pessoal"
**MANTENHO HIPÓTESE.** Não revelo o valor nem detalho a estrutura além do que o A4 já publicou.

- **Bases:**
  1. O valor mistura um trecho alfabético, um símbolo e uma sequência numérica longa, padrão típico de senha criada por pessoa, não de valor de teste.
  2. O mesmo fixture usa um `ADMIN_TOKEN` obviamente falso (`"segredo-de-teste"`). O contraste sugere cópia de uma configuração real (INFERÊNCIA).
  3. O `ADMIN_USER` é igual ao identificador do dono do repositório.

  Nenhuma dessas bases prova nada.
- **Histórico git:** NÃO VERIFICÁVEL, porque esta cópia não tem `.git`.
- **Recomendação completa, se o dono confirmar que o valor é ou foi real:**
  1. trocar `ADMIN_PASS` **e** `SESSION_SECRET` (ou `ADMIN_TOKEN`, se `SESSION_SECRET` não estiver definido): as sessões são assinadas com `SESSION_SECRET or ADMIN_TOKEN` (`index.py:288`) e valem 8 h;
  2. tratar o valor como exposto no histórico git: editar o teste não apaga commits anteriores;
  3. trocar em qualquer outro serviço onde a senha tenha sido reutilizada;
  4. em qualquer caso, usar valor obviamente falso no teste.

---

## 2. Verificação das propostas do Agente 3

### A2-69 — A3-01: quatro heurísticas
- **ORIGEM:** A3-01; A4-30; A4-54
- **AFIRMAÇÃO:** (1) A regex nova com o enunciado antes do 1º `_RE_ALTERNATIVA` resolve o corte. (2) Normalizar o chunk resolve a auditoria. (3) Regra numérica nova. (4) Trocar `, ( ) . : * " \` por espaço na busca do glossário.
- **STATUS:** PARCIALMENTE VERIFICADA
- **TIPO:** FATO (executado); INFERÊNCIA (PostgREST)
- **COMO VERIFIQUEI:**
  - `a301.py`: comparei a regex atual, a proposta do A3 e uma variante minha, em 7 enunciados e 6 formatos.
  - Doc bruta do PostgREST ([url_grammar.rst](https://raw.githubusercontent.com/PostgREST/postgrest-docs/main/docs/references/api/url_grammar.rst)): "surround them in percent encoded double quotes", exemplo com `in.(%22Hebdon,John%22,...)`, escape `\"`.
- **RESULTADO:**
  - Item 1 da proposta:
    - corrige os 3 casos do A1-03 e o N2 ("E-commerce");
    - **não corrige** "E. coli" nem "A. Smith" no início de linha, nem afirmativas "a) … b) …" antes das alternativas. Nesses casos o enunciado continua cortado e a linha, ou as afirmativas, somem **em silêncio**, porque a alternativa A é sobrescrita pela real (atual e proposta dão `'Segundo o autor:'`);
    - `A -um` deixa de ser reconhecido, como o A3 já admitiu;
    - `(A) um` não é reconhecido nem hoje nem na proposta (400).
  - **Variante verificada** (FATO executado): usar como início das alternativas o **último** marcador "A" e cortar o enunciado ali. Resolveu os 7 enunciados e manteve os 3 testes atuais. Custo novo: vários enunciados colados no modo individual deixam só a última questão.
  - Item 4: trocar `.` e `:` por espaço transforma "Node.js" no padrão `*Node js*`, que não casa com "Node.js" (regressão lógica, FATO). As aspas são o caminho documentado. **NÃO VERIFICADO:** se `*` continua funcionando como curinga do `ilike` dentro de aspas, porque a doc só dá exemplo com `in`.
- **CONFIANÇA:** alta nos itens 1 a 3; média no item 4.
- **IMPLICAÇÃO:** **Viável com ajustes.**
  - Adotar a variante do "último A", ou somá-la à regex do A3.
  - No glossário, aspas mais escape de `"` e `\`, com teste num PostgREST local antes do deploy.
  - Reescrever `test_rag_core.py:409-416` com um critério explícito.
- **O QUE FALTA:** PostgREST local; questões reais (A4-03).

### A2-70 — A3-02: PDF que não quebra; busca opcional
- **ORIGEM:** A3-02; A4-31; Discordância 5
- **AFIRMAÇÃO:** Traduzir para Latin-1 com `replace` elimina a exceção. A TTF custa cerca de 1,46 MB, uma licença e `includeFiles`. `except (HTTPException, httpx.HTTPError)` cumpre o "nunca bloqueia".
- **STATUS:** PARCIALMENTE VERIFICADA
- **TIPO:** FATO
- **COMO VERIFIQUEI:**
  1. Tradução mais `latin-1/replace` → `_markdown_para_pdf` gerou PDF de 1.152 bytes com `— “ • … → ≥ 🚀 中文`. `€` e `✓` viram `?`.
  2. Baixei `dejavu-fonts-ttf@2.37.3` do jsDelivr para o scratchpad: `DejaVuSans.ttf` com **757.076 bytes** e `DejaVuSans-Bold.ttf` com **705.684 bytes**, soma de 1,46 MB. `add_font` com fpdf2 2.8.8 → PDF de 13.914 bytes com todos os símbolos; só o emoji ficou sem glifo, com aviso e sem exceção.
  3. Licença ([LICENSE](https://raw.githubusercontent.com/dejavu-fonts/dejavu-fonts/master/LICENSE)): Bitstream Vera, "Permission is hereby granted… to reproduce and distribute"; "DejaVu changes are in public domain". Exige manter o aviso.
  4. Glob `api/{rag_core.py,_app/**}` testado com picomatch, minimatch e micromatch: `api/_app/fonts/DejaVuSans.ttf` = **true** nos três. Que a Vercel use semântica equivalente é INFERÊNCIA forte.
  5. `gerar_embeddings` pode esperar cerca de 120 s (A2-63), mais que o `maxDuration` de 60 s.
- **RESULTADO:**
  - Os dois caminhos geram PDF.
  - O custo de `includeFiles` alegado pelo A3 **não existe**.
  - A licença permite distribuir.
  - O item 2 **não** garante "nunca bloqueia": a função morre antes do fallback.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** **Viável com ajustes.** Precisa de timeout curto (poucos segundos) na busca opcional. Latin-1 contra TTF virou decisão de produto ("?" no PDF contra 1,46 MB no pacote, que é desprezível perto dos 500 MB do runtime Python).
- **O QUE FALTA:** Preferência do dono.

### A2-71 — A3-03: limites de entrada, teto de frases, login
- **ORIGEM:** A3-03; A4-32; A4-63; N8
- **AFIRMAÇÃO:** 4.000 caracteres para pergunta e tema, 12.000 para resposta, 30 frases e `n_por_frase ≤ 3`, limitador de login via `consumir_cota`, `mensagemDe` para `detail` em lista.
- **STATUS:** PARCIALMENTE VERIFICADA
- **TIPO:** FATO; ESTIMATIVA
- **COMO VERIFIQUEI:**
  - **N8**, teste JS: um 422 do FastAPI com `detail` em lista mostra **"Erro 422: {"detail":[{"type":"string_too_long",…}]}"** (JSON cru).
  - **Mensagem verde:** `RespostaAuditada.tsx`: `naoApoiadas = auditadas.filter(a => a.nivel !== 'apoiada')`; se for vazio, mostra "Todas as frases desta resposta têm apoio no material". Com teto de 30, frases não auditadas deixam a mensagem falsa. Hoje ela já é imprecisa: `quebrar_frases` descarta frases com menos de 40 caracteres.
  - **Tamanho de página do material** (proxy para OCR de página inteira): 139 páginas reconstruídas, mediana de 1.466 caracteres, p90 de 2.846, **máximo de 3.572, zero acima de 4.000**. Uma página cabe; vários anexos somados podem passar.
  - **Tamanho das respostas:** não existe amostra real no repositório (grep em `tests`, `scripts` e `dumps`). Os prompts não limitam tamanho e nenhuma chamada envia `max_tokens`.
  - **Login:** `_limitar_llm` retorna sem a camada distribuída quando não há service_role (`index.py:413-414`).
- **RESULTADO:**
  - O limite de 12.000 está **NÃO DEMONSTRADO**.
  - O limite de 4.000 cabe numa página do curso, mas não em anexos somados.
  - Teto de frases e `le=3` são seguros.
  - Sem service_role, o login fica protegido só por instância.
- **CONFIANÇA:** alta nos fatos; baixa nos valores.
- **IMPLICAÇÃO:** **Viável com ajustes.**
  - Limites folgados em caracteres, por exemplo 20 mil e 50 mil (ESTIMATIVA), mais o teto de frases, que é o que controla custo.
  - `frases_ignoradas` com mensagem própria na interface.
  - N8 no mesmo PR.
  - Fallback em memória para o login.
- **O QUE FALTA:** Tamanho real das respostas (log de tamanho, sem conteúdo).

### A2-72 — A3-04: upload e ingestão
- **ORIGEM:** A3-04; A4-33
- **AFIRMAÇÃO:** Os itens 1 a 4 fecham o sucesso falso e a mistura. O item 4 usa `Prefer: return=representation` com `select=id`.
- **STATUS:** VERIFICADA (premissas), com lacunas
- **TIPO:** FATO
- **COMO VERIFIQUEI:**
  - Doc bruta do PostgREST ([preferences.rst](https://raw.githubusercontent.com/PostgREST/postgrest-docs/main/docs/references/api/preferences.rst)): POST com `Prefer: return=representation` devolve o objeto, e "You can also apply the standard vertical filtering".
  - `scripts\verificar-guarda-upload.sh:20-22`: só imprime a resposta, com o comentário "esperado 409", sem conferência automática.
  - `index.py:1695`: a ingestão responde 422 para arquivo ilegível.
- **RESULTADO:**
  - O item 4 é viável pela doc.
  - O item 3 **não quebra a execução** do script (não há asserção), mas torna errada a expectativa documentada nele.
  - Falta tratar 422 e 4xx como erros não repetíveis (A2-07 e A2-60).
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** **Viável com ajustes:** 4xx não repetível e atualizar o script no mesmo PR. O item 4 é redundante com A3-12. Se A3-12 for adiado, o item 4 basta.
- **O QUE FALTA:** Execução num Supabase local.

### A2-73 — A3-05: stream e estado da aba Perguntar
- **ORIGEM:** A3-05; A4-34; A4-61
- **AFIRMAÇÃO:** Ler `finish_reason`, emitir `motivo`, limpar `<thinking>`, `AbortController`, rodada, preservar o parcial.
- **STATUS:** PARCIALMENTE VERIFICADA
- **TIPO:** FATO
- **COMO VERIFIQUEI:**
  - Schema bruto da Groq (`CreateChatCompletionStreamResponse`): `finish_reason` com enum `stop`, `length`, `tool_calls`, `function_call`.
  - OpenRouter: `finish_reason: "error"` no erro no meio do stream.
  - `test_c4_stream.py` (Contestação 3).
  - N9 reproduzido pelo A4.
- **RESULTADO:** Ler `finish_reason` cobre o OpenRouter **se** `"error"` for mapeado para erro. **Não cobre** `error` sem `choices`, nem conexão fechada sem `[DONE]`: os dois viram `fim` hoje.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** **Viável com ajustes:**
  - detectar `error` de forma explícita;
  - emitir `fim` só com `finish_reason` em `stop` ou `length`; qualquer outro final vira `interrompida`;
  - extrair a lógica de rodada para função pura testável com `node:test`, porque não há teste de componente.
- **O QUE FALTA:** Formato de erro no meio do stream na Groq, no Nous, na NVIDIA, no AnyAPI e no Orca (NÃO VERIFICADO).

### A2-74 — A3-06: prazo único por requisição; semáforo rejeitado
- **ORIGEM:** A3-06; A4-35; Discordância 4
- **AFIRMAÇÃO:** O middleware cria `request.state.prazo`; `asyncio.timeout` no stream; `asyncio.wait` no resumir; o semáforo "só alonga o tempo"; `MAX_CHUNKS_RESUMO` de 40 para 20.
- **STATUS:** PARCIALMENTE VERIFICADA
- **TIPO:** FATO; INFERÊNCIA
- **COMO VERIFIQUEI:**
  - `mw.py` (FastAPI 0.141.1, Starlette 1.6.0): `@app.middleware("http")` com `StreamingResponse` → o gerador lê `request.state.prazo` normalmente. **O middleware retorna em 0,0 s, antes do fim do stream**.
  - `asyncio.timeout` existe em 3.11.15 (uv) e em 3.14.
  - Limites públicos da Groq (A2-94).
- **RESULTADO:**
  - O desenho do prazo funciona.
  - O semáforo é controle de **concorrência**, não de tempo, e nenhum dos dois resolve limite por **minuto**. No Free da Groq (30 requisições/min; 8 mil tokens/min no `gpt-oss-120b`), 40 trechos num resumo estouram o limite com ou sem semáforo.
  - ESTIMATIVA com cerca de 500 tokens por chamada map: no máximo cerca de 16 trechos por minuto no `gpt-oss-120b` Free. O corte de 40 para 20 ganha **base parcial**, só se a chave for Free.
- **CONFIANÇA:** média.
- **IMPLICAÇÃO:** **Viável com ajustes:** prazo, mais semáforo (N pequeno), mais número de trechos ajustado ao limite do provedor, mais `chunks_ok`.
- **O QUE FALTA:** Plano e limites reais de cada chave.

### A2-75 — A3-07: falhas silenciosas
- **ORIGEM:** A3-07; A4-36
- **AFIRMAÇÃO:** `ref` do seed, `raise_for_status` no status, novas tentativas em providers, mensagens.
- **STATUS:** VERIFICADA (premissas)
- **TIPO:** FATO
- **COMO VERIFIQUEI:** A2-12 e A2-19 (reproduzidos); `GlossarioTab.tsx:82-87`.
- **RESULTADO:** Premissas corretas. O `ref` precisa ser zerado depois de disparar (A4).
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** **Viável.**
- **O QUE FALTA:** Teste manual no navegador.

### A2-76 — A3-08: ambiente reproduzível, 3.12, credencial
- **ORIGEM:** A3-08; A4-37; Discordância 6
- **AFIRMAÇÃO:** `.python-version` 3.12 é reconhecido pela Vercel; `iniciar-tudo.bat` em 3.12; `pip freeze` em 3.12; `overrides` da postcss.
- **STATUS:** PARCIALMENTE VERIFICADA
- **TIPO:** FATO
- **COMO VERIFIQUEI:**
  - Markdown bruto da Vercel ([python-version](https://vercel.com/docs/functions/runtimes/python/python-version)): "`pyproject.toml`, `.python-version`, or `Pipfile.lock`"; 3.12 (padrão), 3.13, 3.14.
  - `py -0p`: só 3.14 e 3.11.15.
  - `uv 0.12.5` instalado; `uv python list --all-versions` mostra `cpython-3.12.14 <download available>`. Não baixei nem testei.
  - `ci.yml` já roda 3.12.
- **RESULTADO:**
  - O `.python-version` é reconhecido.
  - `py -3.12` no `.bat` **falha nesta máquina**.
  - O uv pode obter 3.12 (disponibilidade listada, instalação NÃO TESTADA).
  - O `pip freeze` em 3.12 é viável **no CI**, como artefato.
  - `overrides` da postcss: NÃO VERIFICADO (exigiria instalar pacotes).
  - O item 6 está incompleto (Contestação 10).
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** **Viável com ajustes:** `.bat` usando `uv venv --python 3.12` (não testado) ou mantendo 3.11 localmente com aviso; lock gerado no CI; rotação completa da credencial.
- **O QUE FALTA:** Como o dono roda localmente.

### A2-77 — A3-09: `setval` e verificação de RLS só por leitura
- **ORIGEM:** A3-09; A4-38
- **AFIRMAÇÃO:** `setval(pg_get_serial_sequence(...), coalesce(max(id),1))` corrige a sequência de colunas identity; as consultas ao catálogo verificam o RLS sem escrever.
- **STATUS:** VERIFICADA (doc); sintaxe NÃO EXECUTADA
- **TIPO:** FATO
- **COMO VERIFIQUEI:** Doc bruta do PostgreSQL ([functions-info](https://www.postgresql.org/docs/current/functions-info.html)): "If the column is an identity column, the associated sequence is the sequence internally created for that column".
- **RESULTADO:** A premissa central é válida. Com tabela vazia o próximo id é 2, o que é inofensivo.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** **Viável.** É a correção de menor custo de toda a análise.
- **O QUE FALTA:** Ensaio num Postgres com pgvector.

### A2-78 — A3-10: log estruturado e calibração "por semanas"
- **ORIGEM:** A3-10; A4-39
- **AFIRMAÇÃO:** Filtrar os logs de runtime por `evt=req` dá base para calibrar limites e prazos; a autocrítica do A3 fala em "504 perto de zero por semanas".
- **STATUS:** CONTRADITÓRIA (quanto à retenção)
- **TIPO:** FATO
- **COMO VERIFIQUEI:**
  - Markdown bruto da Vercel ([Runtime Logs](https://vercel.com/docs/logs/runtime), atualizado em 28/08/2026): retenção **Hobby 1 hora**, **Pro 1 dia**, Pro com Observability Plus 30 dias; "256 individual log lines per request".
  - [Drains](https://vercel.com/docs/drains): "available to all users on the Pro and Enterprise plans… Hobby… need to upgrade".
  - `2026-09-16-cota-de-uso.sql:44-47`: faxina de janelas com mais de 2 dias.
- **RESULTADO:**
  - O log por requisição é viável.
  - Calibrar "por semanas" **não é viável** no Hobby nem no Pro sem Observability Plus ou Drains.
  - O plano B do A4 (contadores no `cota_uso`) perde tudo com mais de 2 dias por causa da faxina. Precisa de chaves ou tabela com retenção própria.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** **Viável como log, inviável como base de calibração sem outra solução.** Opções: contadores diários agregados só de erro numa tabela sem faxina, Observability Plus ou Drain (pagos, preço NÃO VERIFICADO).
- **O QUE FALTA:** Plano da Vercel do projeto.

### A2-79 — A3-11: `consumir_cotas` e custo 21 contra o limite de 20
- **ORIGEM:** A3-11; A4-50
- **AFIRMAÇÃO:** A função soma o custo em cada chave e devolve a primeira estourada; resumir custa 1 + número de trechos.
- **STATUS:** VERIFICADA (os dois defeitos, dados os parâmetros propostos)
- **TIPO:** FATO (SQL e código); INFERÊNCIA (semântica ambígua da proposta)
- **COMO VERIFIQUEI:** `cota-de-uso.sql:38-49`: incrementa **antes** de comparar e devolve `v_contagem <= p_limite`. `index.py:423-439`: hoje a RPC para na primeira negação. `LIMITE_LLM_POR_MINUTO = 20` (`index.py:173`).
- **RESULTADO:**
  1. Custo de 21 numa janela de 20 → a contagem já nasce em 21, acima de 20 → **429 em toda chamada de resumir**. Aritmética determinística.
  2. Se a função somar em **todas** as chaves antes de negar, um IP negado continua somando `global-dia`: 1 requisição por segundo dá 86.400 por dia, acima dos 5.000 → **um IP esgota o teto global**. Hoje isso não acontece. A proposta não define a ordem, por isso isso é INFERÊNCIA sobre a implementação.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** **Viável só com ajustes:**
  - checar tudo e só então incrementar, em transação, ou parar na primeira negação;
  - custo do resumo limitado pelo teto da janela, ou limite por minuto em unidades de custo;
  - prioridade PRÓXIMO, depois de A3-10.
- **O QUE FALTA:** —

### A2-80 — A3-16: histórico local em Perguntar e Professor
- **ORIGEM:** A3-16
- **AFIRMAÇÃO:** `useHistorico` já existe e não é usado nas abas Perguntar e Professor.
- **STATUS:** VERIFICADA
- **TIPO:** FATO
- **COMO VERIFIQUEI:** grep: usado em Aprender, Elenco, Perfis e Suporte. `lib\useHistorico.ts`: `ItemHistorico {id, resposta, resumo, criadoEm}`, `LIMITE = 10`, chave `epi:historico:${namespace}`, `localStorage`.
- **RESULTADO:** Premissa correta. Guardar só `{fonte, pagina}` mantém o tamanho pequeno.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** **Viável.**
- **O QUE FALTA:** —

### A2-81 — A3-17: conferência de citações
- **ORIGEM:** A3-17; A4-42
- **AFIRMAÇÃO:** As citações têm formato fixo `[Fonte: X, página N]`, conferível sem IA.
- **STATUS:** PARCIALMENTE VERIFICADA
- **TIPO:** FATO; HIPÓTESE (formato da saída)
- **COMO VERIFIQUEI:** `documentos.py:64`: o formato é fixo **no contexto**. `prompts.py:9-10,18-19,76` e outros: só pedem "cite a fonte e a página quando possível", **sem especificar formato**. grep em `tests`, `tests-js` e `scripts`: nenhuma amostra real de resposta com citação.
- **RESULTADO:** O formato da **resposta** não é garantido pelo prompt.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** **Viável com ajuste:** fixar o formato no prompt **e** coletar amostras antes, ou aceitar variações ("p.", "pág.", parênteses).
- **O QUE FALTA:** 20 ou mais respostas reais.

### A2-82 — A3-18: modo "só o material" e rótulo
- **ORIGEM:** A3-18; A4-43
- **AFIRMAÇÃO:** Há conflito entre o prompt principal e o rótulo da auditoria.
- **STATUS:** VERIFICADA
- **TIPO:** FATO
- **COMO VERIFIQUEI:** `prompts.py:4-11` ("complemente com seu conhecimento geral"); `RespostaAuditada.tsx`: título "a IA pode ter inventado" e legenda "vermelho = provável invenção".
- **RESULTADO:** Conflito confirmado.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** **Trocar o rótulo é viável já.** O modo estrito com limiar depende de calibração (A3-14).
- **O QUE FALTA:** —

### A2-83 — A3-19: painel do administrador
- **ORIGEM:** A3-19; A4-44
- **STATUS:** PARCIALMENTE VERIFICADA
- **TIPO:** FATO
- **AFIRMAÇÃO:** `cota_uso` já tem os dados de uso.
- **COMO VERIFIQUEI:** Faxina de 2 dias (A2-78); limite de 100 itens na listagem do Storage (A2-45).
- **RESULTADO:** O painel só enxerga 2 dias de uso e precisa paginar o Storage.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** **Viável**, com escopo de uso limitado a 2 dias.
- **O QUE FALTA:** —

### A2-84 — A3-20: filtro por apostila
- **ORIGEM:** A3-20; A4-45
- **AFIRMAÇÃO:** `match_ementas_fontes` com filtro; com HNSW pode devolver menos linhas que o pedido.
- **STATUS:** PARCIALMENTE VERIFICADA
- **TIPO:** FATO (doc); NÃO VERIFICADA (versão no Supabase)
- **COMO VERIFIQUEI:** README bruto do pgvector: "with HNSW and the default hnsw.ef_search of 40, only 4 rows will match on average… enable iterative index scans (`SET hnsw.iterative_scan = strict_order`)".
- **RESULTADO:** O risco existe. A mitigação existe nas versões com varredura iterativa; a versão do pgvector no projeto é desconhecida.
- **CONFIANÇA:** média.
- **IMPLICAÇÃO:** **Viável com ajuste:** `SET LOCAL hnsw.iterative_scan` ou consulta exata (526 linhas).
- **O QUE FALTA:** `select extversion from pg_extension where extname='vector'`.

### A2-85 — A3-21: flashcards
- **ORIGEM:** A3-21; A4-46
- **STATUS:** VERIFICADA (técnica); valor NÃO DEMONSTRADO
- **TIPO:** FATO; OPINIÃO
- **AFIRMAÇÃO:** Dá para usar `/api/glossario/termos`.
- **COMO VERIFIQUEI:** `index.py:680-693`: rota pública com limite de 200, ordem alfabética.
- **RESULTADO:** Tecnicamente trivial. Com mais de 200 termos, só os primeiros 200 aparecem.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** Viável; sem evidência de demanda.
- **O QUE FALTA:** Demanda.

### A2-86 — A3-22: retorno do aluno
- **ORIGEM:** A3-22; A4-47
- **STATUS:** NÃO VERIFICADA (sem premissa externa verificável)
- **TIPO:** OPINIÃO
- **AFIRMAÇÃO:** Tabela nova com RLS e escrita pela service_role.
- **COMO VERIFIQUEI:** Leitura; o padrão é o mesmo de `cota_uso`.
- **RESULTADO:** Tecnicamente viável. LGPD está AUSENTE.
- **CONFIANÇA:** média.
- **IMPLICAÇÃO:** Viável; DEPOIS.
- **O QUE FALTA:** Base legal.

### A2-87 — A3-23: simulado
- **ORIGEM:** A3-23; A4-48
- **STATUS:** NÃO VERIFICADA
- **TIPO:** OPINIÃO
- **AFIRMAÇÃO:** 1 chamada em JSON com até 5 questões cabe no orçamento.
- **COMO VERIFIQUEI:** Sem dado de latência de JSON longo; a lista anota modelos de 16,6 s e 47,7 s em pergunta trivial.
- **RESULTADO:** INSUFICIENTE PARA CONCLUIR.
- **CONFIANÇA:** baixa.
- **IMPLICAÇÃO:** Depende de A3-06 e A3-17; concordo com "não fazer agora".
- **O QUE FALTA:** Medição.

### A2-88 — A3-24: abrir a página citada
- **ORIGEM:** A3-24; A4-49
- **AFIRMAÇÃO:** Passo 1 é tirar o corte de linhas; passo 2 é URL assinada do bucket privado.
- **STATUS:** VERIFICADA (passo 1); PARCIALMENTE VERIFICADA (passo 2)
- **TIPO:** FATO
- **COMO VERIFIQUEI:** `EvidenceList.tsx:69` (`line-clamp-3`). Doc bruta do Supabase ([downloads](https://supabase.com/docs/guides/storage/serving/downloads)): `createSignedUrl(path, 3600)`; "Signed URLs remain valid until their expiry time regardless of any Auth key changes. If you need to revoke signed URLs, contact Supabase support".
- **RESULTADO:**
  - Passo 1 trivial.
  - Passo 2: o recurso existe, mas **um link vazado não pode ser revogado** pelo próprio projeto.
  - Abrir na página N via `#page=N` depende do visualizador do navegador (NÃO VERIFICADO).
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** Passo 1 viável já. Passo 2 só com expiração curta e decisão sobre direitos autorais.
- **O QUE FALTA:** —

### A2-89 — WAF da Vercel no Hobby e no Pro
- **ORIGEM:** A3 §2.6, §3.2 e §5.2
- **AFIRMAÇÃO:** Hobby: 1 regra, chaves IP e JA4, janela de 10 s a 10 min, 1.000.000 de requisições permitidas incluídas, contadores por região. Pro: 40 regras.
- **STATUS:** VERIFICADA
- **TIPO:** FATO
- **COMO VERIFIQUEI:** Markdown bruto ([rate-limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting), atualizado em 28/08/2026): tabela "Number of rules: 1 per project | 40 per project"; "Minimum: 10s, Maximum: 10mins"; "1,000,000 Allowed requests"; "counters are tracked on a per-region basis".
- **RESULTADO:** Tudo confere com o que o A3 escreveu.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** A alternativa §3.2b é viável sem código, mas conta requisições, não custo.
- **O QUE FALTA:** —

### A2-90 — Vercel: duração, fluid compute e cobrança
- **ORIGEM:** A3 §3.1 e N3
- **AFIRMAÇÃO:** Hobby com fluid compute: 300 s de padrão e máximo. Pro: 800 s. No Pro há cobrança por memória provisionada.
- **STATUS:** VERIFICADA (limites); preço NÃO VERIFICADO
- **TIPO:** FATO
- **COMO VERIFIQUEI:** Markdown bruto ([fluid-compute](https://vercel.com/docs/fluid-compute)): "Default / Max duration: 300s / 300s (Hobby); 300s / 800s (Pro)"; "**As of April 23, 2025, fluid compute is enabled by default for new projects**". [duration](https://vercel.com/docs/functions/configuring-functions/duration): "Provisioned memory is billed for running instances".
- **RESULTADO:** Confirmado. Se o projeto foi criado depois de 23/04/2025, o fluid compute provavelmente está ligado (INFERÊNCIA).
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** A alternativa §3.1b é plausível; confirmar no painel.
- **O QUE FALTA:** Data de criação do projeto e painel.

### A2-91 — Groq: `max_tokens` depreciado
- **ORIGEM:** A3 §5.8 e Anexo B
- **AFIRMAÇÃO:** `max_tokens` está depreciado em favor de `max_completion_tokens`.
- **STATUS:** VERIFICADA
- **TIPO:** FATO
- **COMO VERIFIQUEI:** HTML bruto ([api-reference](https://console.groq.com/docs/api-reference)): `"max_tokens":{"deprecated":true,"description":"Deprecated in favor of max_completion_tokens…"}`.
- **RESULTADO:** Confirmado. Depreciado não é removido: `max_tokens` provavelmente ainda funciona (INFERÊNCIA).
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** A cautela do A3 (parâmetro por provedor) se justifica.
- **O QUE FALTA:** Doc dos outros provedores.

### A2-92 — Fonte DejaVu: tamanho e licença
- **ORIGEM:** A3-02
- **STATUS:** VERIFICADA
- **TIPO:** FATO
- **AFIRMAÇÃO:** Cerca de 1,46 MB; licença a registrar.
- **COMO VERIFIQUEI:** A2-70, itens 2 e 3.
- **RESULTADO:** 1.462.760 bytes; licença permissiva que exige manter o aviso.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** A TTF é viável.
- **O QUE FALTA:** —

### A2-93 — Retenção de logs e Drains na Vercel
- **ORIGEM:** A3-10; A4-39
- **STATUS:** VERIFICADA
- **TIPO:** FATO
- **AFIRMAÇÃO:** A retenção dos logs era NÃO VERIFICADA.
- **COMO VERIFIQUEI:** A2-78.
- **RESULTADO:** Hobby 1 h, Pro 1 dia; Drains só no Pro ou Enterprise.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** Veja A2-78.
- **O QUE FALTA:** Plano do projeto.

### A2-94 — Limites públicos dos provedores
- **ORIGEM:** A4-01; A4-62; Discordância 4
- **AFIRMAÇÃO:** Um IP esgota a cota do provedor.
- **STATUS:** PARCIALMENTE VERIFICADA
- **TIPO:** FATO (doc); NÃO VERIFICADA (plano da chave)
- **COMO VERIFIQUEI:**
  - HTML bruto ([Groq rate-limits](https://console.groq.com/docs/rate-limits)), tabela "Free Plan Limits": `groq/compound` e `groq/compound-mini` com 30 requisições/min, 250/dia, 70 mil tokens/min; `openai/gpt-oss-120b` e `-20b` com 30/min, 1 mil/dia, 8 mil tokens/min, 200 mil tokens/dia.
  - [OpenRouter limits](https://openrouter.ai/docs/api-reference/limits): existe limite por minuto e por dia para modelos `:free`, mas **os números são injetados via JavaScript** e não aparecem no HTML (NÃO VERIFICADO). O projeto anota 50 por dia (`provedores.py:114-116`).
- **RESULTADO:** No Free da Groq, um único resumo de 40 trechos passa do limite por minuto e 6 resumos esgotam a cota diária do `compound-mini`.
- **CONFIANÇA:** alta sobre a doc; nenhuma sobre o plano.
- **IMPLICAÇÃO:** Sustenta A4-01, A4-62 e o semáforo com ajuste de trechos.
- **O QUE FALTA:** Plano das chaves (painel da Groq).

### A2-95 — A4-52: PDF reconstruído escapa da guarda do upload
- **ORIGEM:** A4-52 (sobre A3-13)
- **STATUS:** VERIFICADA (código)
- **TIPO:** FATO
- **AFIRMAÇÃO:** O arquivo não está no Storage, então `fonte_afetada=None`.
- **COMO VERIFIQUEI:** `index.py:1923-1929`: MD5 novo não bate e o nome não está em `por_nome`, então `fonte_afetada = None` e a guarda do upload não roda. A guarda da ingestão mede a mesma fonte (384 trechos) contra a extração nova.
- **RESULTADO:** Só a guarda da ingestão protege, e um 409 ali cai no "✓" falso de A1-07.
- **CONFIANÇA:** alta.
- **IMPLICAÇÃO:** A3-13 precisa vir depois de A3-04.
- **O QUE FALTA:** —

---

## 3. Autocrítica das conclusões principais

**A1-01 continua ALTO pelo limite do provedor (A2-94)**
- *Em que circunstância estaria errada?* Se as chaves estiverem no plano Developer ou pago, com limites muito maiores, ou se a URL só for conhecida pela turma.
- *Que evidência me faria mudar?* Painel da Groq e dos outros provedores mostrando plano pago com limites folgados, mais a confirmação de que a URL é restrita. Aí cai para MÉDIO.

**A2-73 e A4-61: o erro no meio do stream vira `fim`**
- *Em que circunstância estaria errada?* Se o adaptador ASGI da Vercel ou algum proxy encerrasse a resposta com erro, ou se os provedores usados nunca mandassem erro depois do primeiro pedaço. Reproduzi com TestClient e provedor simulado, não com um provedor real.
- *Que evidência me faria mudar?* Logs reais sem erro no meio do stream, ou a doc de cada provedor em uso mostrando outro formato de fim.

**A2-78: A3-10 não serve de base de calibração**
- *Em que circunstância estaria errada?* Se o projeto tiver Observability Plus ou Drain, ou se o dono ler os logs todo dia e anotar à mão.
- *Que evidência me faria mudar?* Plano da Vercel com retenção de 30 dias ou Drain configurado.

**A2-69: a variante do "último A"**
- *Em que circunstância estaria errada?* Em questões cujas alternativas não começam em "A", em texto com duas questões coladas, ou numa alternativa real que contenha uma linha "A. …".
- *Que evidência me faria mudar?* Um conjunto real de questões do curso com regressões na variante.

**Confiabilidade das minhas fontes**
- *Em que circunstância estaria errada?* O resumo do WebFetch já errou duas vezes: os modelos do OpenRouter e a frase sobre streaming da Groq. Toda afirmação minha de Ciclo 3 que dependeu só desse resumo continua vulnerável. Isso vale especialmente para A2-43 (identity e COPY) e A2-44 (RLS e PostgREST), que não reconferi no bruto neste ciclo. A2-52 (advisories) e as consultas de catálogo de A2-77 também não foram reabertas.
- *Que evidência me faria mudar?* O texto bruto dessas páginas divergindo do resumo.

---

## 4. Discordâncias

**DISCORDÂNCIA A — Semáforo no resumo (A3-06)**
- **Agente:** A3 (rejeita o semáforo; 40 → 20 sem dado)
- **Posição:** o semáforo é necessário, mas não basta. O número de trechos precisa caber no limite por minuto do provedor. O corte para 20 ganha base parcial.
- **Argumento:** concorrência e taxa por minuto são limites diferentes. No Free da Groq, 40 chamadas passam de 30 por minuto com ou sem semáforo.
- **Evidência:** A2-94 (Groq rate-limits, HTML bruto); A4-62.
- **O que falta para resolver:** plano e limites reais das chaves.

**DISCORDÂNCIA B — Busca do glossário (A3-01, item 4)**
- **Agente:** A3
- **Posição:** usar aspas mais escape, não trocar caracteres.
- **Argumento:** trocar `.` e `:` quebra "Node.js" e "Web 2.0"; as aspas são o caminho documentado.
- **Evidência:** `url_grammar.rst` (reserved chars e escape); A2-69.
- **O que falta para resolver:** testar `ilike` com `*` dentro de aspas num PostgREST local.

**DISCORDÂNCIA C — Enunciado do Resolver (A3-01, item 1)**
- **Agente:** A3; A4 (aceitou o resíduo "E. coli" como limitação)
- **Posição:** a variante do "último marcador A" resolve os resíduos sem perder os casos atuais.
- **Argumento:** a regex do A3 ainda descarta em silêncio linhas "A. Smith" e afirmativas "a) b)".
- **Evidência:** `a301.py` (7 enunciados, 6 formatos).
- **O que falta para resolver:** questões reais.

**DISCORDÂNCIA D — Calibração por logs (A3-10) e plano B do A4**
- **Agente:** A3 ("semanas de logs"); A4 (contadores de erro no `cota_uso`)
- **Posição:** nenhuma das duas funciona como descrita.
- **Argumento:** retenção de 1 h no Hobby e 1 dia no Pro; faxina de 2 dias no `cota_uso`.
- **Evidência:** A2-78 (Runtime Logs e Drains da Vercel; `cota-de-uso.sql:44-47`).
- **O que falta para resolver:** plano do projeto; tabela de agregados diários sem faxina ou Observability Plus.

**DISCORDÂNCIA E — Custo da TTF (A3-02)**
- **Agente:** A3
- **Posição:** o argumento do `includeFiles` é falso; a licença foi verificada. As duas soluções são viáveis e a escolha é de produto.
- **Argumento:** o glob já cobre `_app/**`; a licença permite distribuir.
- **Evidência:** A2-70 (picomatch, minimatch e micromatch; LICENSE; fpdf2 executado).
- **O que falta para resolver:** preferência do dono.

**DISCORDÂNCIA F — Premissa de A3-17**
- **Agente:** A3
- **Posição:** o formato `[Fonte: X, página N]` é fixo no **contexto**, não na **resposta**.
- **Argumento:** os prompts pedem citação sem definir formato.
- **Evidência:** `prompts.py:9-10,18-19,76`; `documentos.py:64`.
- **O que falta para resolver:** amostra de respostas reais.

**DISCORDÂNCIA G — Severidade de A1-02**
- **Agente:** A1 (ALTO)
- **Posição:** MÉDIO com prioridade AGORA, sem o argumento "recuperável" (retirado na Contestação 1).
- **Argumento:** a perda depende de uma restauração por esse caminho, sem evidência de que tenha ocorrido.
- **Evidência:** `recriar-banco.sql:116-121`; o contador do cabeçalho é o único sinal visível.
- **O que falta para resolver:** ensaio num Postgres; informação sobre restauração planejada.

---

## 5. Tabela final

### 5.1 Severidades que defendo (A1-01 a A1-16)

| Achado | Severidade | Mudança neste ciclo | Motivo principal |
|---|---|---|---|
| A1-01 | **ALTO** | justificativa trocada; valor em dólar retirado | Um IP esgota a cota do provedor (limites do Free da Groq, se a chave for Free), mais amplificação medida |
| A1-02 | **MÉDIO** (AGORA) | argumento "recuperável" retirado | Perda silenciosa condicionada a restauração; correção de uma linha |
| A1-03 | **ALTO** | — | Corte determinístico; resíduos "A. Smith" e afirmativas também perdem texto |
| A1-04 | **ALTO** | — | Quebra determinística no formato padrão; frequência não demonstrada |
| A1-05 | **MÉDIO** | reforçado (formato documentado do OpenRouter vira `fim`) | Sem logs; sobe para ALTO se houver 504 ou truncamentos frequentes |
| A1-06 | **MÉDIO** | — | Reproduzido; só admin |
| A1-07 | **MÉDIO** | — | Sucesso falso; 422 repetido e variante A2-60 |
| A1-08 | **MÉDIO** | — | Reproduzido; perda imediata (A4-08) |
| A1-09 | **MÉDIO** | causa da negação corrigida (regex `{4,}`) | Números reproduzidos |
| A1-10 | **MÉDIO** | — | Reproduzido |
| A1-11 | **MÉDIO** | — | Código; frequência desconhecida |
| A1-12 | **BAIXO** | **revejo** (era MÉDIO) | Há contorno imediato (A4-12) |
| A1-13 | **MÉDIO** | — | Agravado por A2-63 e A4-62 |
| A1-14 | **MÉDIO** (CRÍTICO se A2-59 se confirmar) | — | 500 pelo corpo JSON, independente do proxy |
| A1-15 | **MÉDIO** | argumento trocado para a deriva do starlette e do fastapi (A4-15) | Deploy não reproduzível |
| A1-16 | **BAIXO** (MÉDIO se houver NAT) | — | Consumo em dobro é fato; NAT é hipótese |

### 5.2 Viabilidade das propostas AGORA do Agente 3

| Proposta | Veredito | Condição para ser viável como descrita |
|---|---|---|
| A3-01 | **Viável com ajustes** | Variante do "último A"; aspas no `or=()`, não troca de caracteres; reescrever o teste 409-416 |
| A3-02 | **Viável com ajustes** | Timeout curto na busca opcional; TTF igualmente viável (1,46 MB, licença OK, glob já cobre) |
| A3-03 | **Viável com ajustes** | Limites de caracteres folgados até haver dado; `frases_ignoradas` na interface; N8 no mesmo PR; login com fallback sem service_role |
| A3-04 | **Viável com ajustes** | 4xx (inclusive 422) não repetível; atualizar `verificar-guarda-upload.sh`; item 4 ou A3-12, não os dois |
| A3-05 | **Viável com ajustes** | Detectar `error`; `fim` só com `stop` ou `length`; lógica de rodada em função pura testável |
| A3-06 | **Viável com ajustes** | Somar semáforo e número de trechos ajustado ao limite por minuto do provedor; `chunks_ok` |
| A3-07 | **Viável** | Zerar o `ref` do seed |
| A3-08 | **Viável com ajustes** | 3.12 local via uv (não testado) ou manter 3.11 com aviso; lock gerado no CI; rotação com `SESSION_SECRET`, histórico git e reutilização |
| A3-09 | **Viável** | Ensaio num Postgres antes de documentar |
| A3-10 | **Viável como log; inviável como base de calibração** | Retenção de 1 h (Hobby) ou 1 dia (Pro); precisa de tabela de agregados sem faxina, Observability Plus ou Drain |

**Fontes (acessadas em 17/09/2026, conferidas no conteúdo bruto):**
- [Groq — Reasoning](https://console.groq.com/docs/reasoning)
- [Groq — API Reference](https://console.groq.com/docs/api-reference)
- [Groq — Rate Limits](https://console.groq.com/docs/rate-limits)
- [OpenRouter — Errors](https://openrouter.ai/docs/api-reference/errors)
- [OpenRouter — Limits](https://openrouter.ai/docs/api-reference/limits)
- [Vercel — WAF Rate Limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)
- [Vercel — Runtime Logs](https://vercel.com/docs/logs/runtime)
- [Vercel — Drains](https://vercel.com/docs/drains)
- [Vercel — Fluid compute](https://vercel.com/docs/fluid-compute)
- [Vercel — Duration](https://vercel.com/docs/functions/configuring-functions/duration)
- [Vercel — Python version](https://vercel.com/docs/functions/runtimes/python/python-version)
- [PostgreSQL — Sequence Functions](https://www.postgresql.org/docs/current/functions-sequence.html)
- [PostgreSQL — System Information Functions](https://www.postgresql.org/docs/current/functions-info.html)
- [PostgREST — url_grammar.rst](https://raw.githubusercontent.com/PostgREST/postgrest-docs/main/docs/references/api/url_grammar.rst)
- [PostgREST — preferences.rst](https://raw.githubusercontent.com/PostgREST/postgrest-docs/main/docs/references/api/preferences.rst)
- [PostgREST — tables_views.rst](https://raw.githubusercontent.com/PostgREST/postgrest-docs/main/docs/references/api/tables_views.rst)
- [pgvector README](https://raw.githubusercontent.com/pgvector/pgvector/master/README.md)
- [Supabase — Storage downloads](https://supabase.com/docs/guides/storage/serving/downloads)
- [DejaVu LICENSE](https://raw.githubusercontent.com/dejavu-fonts/dejavu-fonts/master/LICENSE)
- [jsDelivr — dejavu-fonts-ttf@2.37.3](https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans.ttf)
