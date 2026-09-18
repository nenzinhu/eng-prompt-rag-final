# 03 — Estrategista / Arquiteto de Soluções (Agente 3), Ciclo 3b

Raiz do projeto: `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main`. Dentro das propostas, os caminhos são relativos a essa raiz. A lista com caminhos absolutos está no fim.

**Estado das dependências.** O Agente 2 ainda não verificou nenhum achado do Agente 1. Por isso toda proposta de correção traz "Depende de A1-NN, ainda não verificado".

**O que executei.** Tudo foi somente leitura e nada foi gravado no projeto.
- Rodei testes em memória com o venv descartável (`-B`, diretório de trabalho no scratchpad):
  - a regex nova de alternativas;
  - a regra nova de divergência numérica;
  - geração de PDF com fpdf2 2.8.8 por dois caminhos;
  - limites do Pydantic devolvendo 422;
  - `limpar_resposta` com `<thinking>`.
- Consultei a documentação oficial:
  - Vercel: runtime Python, duração, limites e WAF;
  - PostgREST: caracteres reservados;
  - Groq: `max_completion_tokens`.
- Não chamei a produção nem li valores de segredos.

---

## 1. Objetivo real

**O que o projeto tenta resolver:** permitir que o aluno estude o material do curso com respostas **presas às apostilas e com citação de fonte e página**. Isso vem de `PROJECT.md` §1 e dos prompts, porque não existe documento de produto.

**A construção atual serve a esse objetivo? Em parte.** O caminho principal existe e está coberto por 145 testes Python e 35 JS. Seis coisas, porém, minam justamente o que o diferencia de uma IA genérica:

1. **Acervo frágil e misturado.**
   - 73% dos trechos vêm de um arquivo que não está no Storage.
   - Uma lista de preços de modelos disputa o contexto com as apostilas.
   - Uma apostila rendeu só 1 trecho.
   - Fonte: `PROJECT.md` §5 e §10.
2. **O prompt principal manda completar com conhecimento geral** (`api\_app\prompts.py:4-11`). Ao mesmo tempo, a auditoria marca frase sem apoio como "a IA pode ter inventado" (`components\RespostaAuditada.tsx:22`). O aluno não consegue distinguir complemento legítimo de invenção.
3. **Os sinais de confiança têm heurísticas com defeito:** auditoria sem acento (A1-09), divergência numérica falsa (A1-10) e enunciado truncado (A1-03).
4. **A rota principal falha sob o limite de tempo e apaga o texto parcial** (A1-05). Admin e aluno recebem sucesso falso ou erro sem explicação (A1-06, A1-07, A1-19).
5. **Nenhuma métrica** diz se o objetivo é atingido: não há taxa de erro, qualidade de resposta nem uso.
6. **Três das 13 abas estão fora do estudo** (Perfis, Elenco, Suporte TI) e usam a mesma cota e as mesmas chaves de IA. O motivo delas é AUSENTE.

**Lacunas que mudam a recomendação:**

| Item | Situação | Efeito |
|---|---|---|
| Público e rede dos alunos | AUSENTE | Muda a prioridade dos limites por IP (NAT) e da proteção contra abuso (§2.6) |
| Equipe | AUSENTE. Inferência pelos documentos e caminhos pessoais em `README-BACKUP.md`: um mantenedor | Priorizo mudanças pequenas e sem serviço novo; a divisão de `index.py` fica para DEPOIS |
| Orçamento | AUSENTE | Nenhuma proposta depende de serviço pago; as que ficam melhores com plano pago dizem isso |
| LGPD e regras institucionais | AUSENTE | Retorno do aluno (feedback), logs e histórico no servidor ficam condicionados |

---

## 2. Propostas

### 2.1 Correções (parte A), agrupadas por causa raiz

| Causa raiz | Achados | Proposta |
|---|---|---|
| Heurísticas de texto com defeito | A1-03, A1-09, A1-10, A1-18 | A3-01 |
| Saída de arquivo sem normalização e exceção errada | A1-04, A1-17 | A3-02 |
| Entrada sem limite e login sem limitador | A1-01 (parte), A1-14, A1-16 (parte) | A3-03 |
| Fluxo de upload e ingestão que trata bloqueio como sucesso | A1-07, A1-08, A1-06 (parte), A1-02 (defesa) | A3-04, depois A3-12 |
| Stream e estado da aba Perguntar | A1-05 (itens 2 a 5), A1-11 | A3-05 |
| Não existe prazo por requisição | A1-05 (item 1), A1-13 | A3-06 |
| Erro tratado por omissão | A1-12, A1-19 | A3-07 |
| Falta de política de versões e documentos | A1-15, A1-21, A1-22 | A3-08 |
| Restauração e verificação de segurança | A1-02, A1-20 | A3-09 |
| Unidade de cota igual a requisição | A1-01, A1-16 | A3-11 |

### A3-01 — Corrigir as quatro heurísticas puras que distorcem Resolver, Auditoria, Comparar e Glossário
- **RESOLVE:** A1-03, A1-09, A1-10, A1-18 e o achado novo N2 (Anexo A). Depende de A1-03, A1-09, A1-10 e A1-18, ainda não verificados.
- **ANTES:**
  - `api\rag_core.py:124`: `_RE_INICIO_ALTERNATIVA` sem âncora corta o enunciado.
  - `api\rag_core.py:123`: uma linha que começa com "E-commerce" vira a alternativa E.
  - `api\rag_core.py:244`: palavras sem acento são procuradas em `content.lower()`, que mantém os acentos.
  - `api\rag_core.py:483`: qualquer número exclusivo de um modelo vira divergência.
  - `api\rag_core.py:569-597`: não remove termos repetidos.
  - `api\index.py:683-684`: `q` entra sem escape no `or=(...)`.
- **MUDANÇA:**
  1. O enunciado passa a ser o texto antes do primeiro casamento de `_RE_ALTERNATIVA`, e `_RE_INICIO_ALTERNATIVA` sai. O marcador `-` só vale seguido de espaço: `[A-Ea-e][ \t]*(?:[).]|-(?=[ \t]))`, usado nas duas regexes.
  2. `texto_chunk = _sem_acento_minusculo(c.get("content") or "")`.
  3. Antes de extrair números, remover `[Fonte: ...]` e "página N" / "pág. N". `divergencia_numerica` só vale quando duas ou mais conclusões citam números e os conjuntos diferem.
  4. Remover termos repetidos por `termo.strip().lower()` em `extrair_termos_glossario`. Em `buscar_termos_glossario`, trocar `, ( ) . : * " \` por espaço em `q`. A documentação do PostgREST lista `, . : * ( )` como reservados em filtros.
- **POR QUE:** são as funções que dão ao aluno os sinais de confiança: enunciado certo, "a IA inventou?", "os modelos divergem?". Não fazem I/O e já têm testes.
- **DEPOIS:** o Resolver busca contexto com o enunciado inteiro. A auditoria compara os dois lados normalizados. Comparar só acusa conflito real. O glossário grava o lote mesmo com termo repetido e a busca aceita vírgula.
- **BENEFÍCIO:** menos falsos alarmes de "provável invenção" e de "modelos divergem", e melhor contexto no Resolver.
- **CUSTO/CONSEQUÊNCIA:** 3 a 5 h com testes (Estimativa — precisa ser validada). Custo recorrente zero.
- **RISCO QUE CRIA:**
  - A auditoria passa a aprovar mais frases, inclusive algumas invenções que por acaso compartilham palavras.
  - O teste `tests\test_rag_core.py:409-416` precisa mudar, porque ele depende do defeito.
  - Formatos raros de alternativa, como "A -um", deixam de ser reconhecidos.
- **COMO IMPLEMENTAR:** `api\rag_core.py` (regex, `frase_tem_apoio_textual`, `calcular_concordancia`, `extrair_termos_glossario`), `api\index.py:680-684` e novos casos em `tests\test_rag_core.py`.
- **COMO MEDIR:**
  - FATO executado em memória:
    - A regex nova devolveu o enunciado inteiro nos três exemplos do A1-03 e no caso "Considere o cenário:\nE-commerce cresce..." (hoje vira a alternativa E).
    - Ela manteve `A)um`, `A. um`, `a - um`, `a) um` e o caso do teste atual.
    - A regra numérica nova deu "sem divergência" para "5 pilares × cinco pilares" e para "página 12 × página 14", e manteve a divergência em "26 milhões × 450 mil".
  - Critério: os testes novos passam e o script do A1-09 sobre o dump dá cobertura média de 1,0 nas frases literais.
- **ALTERNATIVAS CONSIDERADAS:**
  - Exigir espaço depois de qualquer marcador: testei, e ele quebra `A)um`, comum em OCR.
  - Normalizar numerais por extenso: é uma lista a mais e não resolve as citações.
  - RPC para a busca do glossário: é uma migração desnecessária.
- **PRIORIDADE:** AGORA
- **IMPACTO x ESFORÇO:** alto x baixo

### A3-02 — Gerador de Apostilas: PDF que nunca quebra e busca opcional de fato
- **RESOLVE:** A1-04, A1-17. Depende de A1-04 e A1-17, ainda não verificados.
- **ANTES:**
  - `api\_app\documentos.py:115` usa a Helvetica embutida, que só aceita Latin-1.
  - `api\index.py:1107-1115` monta o arquivo depois de pagar o LLM.
  - `api\index.py:1098` captura só `HTTPException`.
- **MUDANÇA:**
  1. Criar `_texto_latin1(s)` em `documentos.py`. Ela traduz — e – para "-", aspas curvas para retas, • para "-", … para "...", → para "->", e depois aplica `.encode("latin-1", "replace").decode("latin-1")`. Usar no título e em cada linha de `linha_pdf`.
  2. Trocar para `except (HTTPException, httpx.HTTPError)` com `print` do motivo.
- **POR QUE:** é a menor mudança que elimina a exceção para qualquer entrada, sem arquivo novo no pacote da função.
- **DEPOIS:** o PDF sempre sai. Símbolos sem equivalente viram "?". O DOCX continua fiel.
- **BENEFÍCIO:** o formato padrão da aba deixa de devolver 500 depois de gastar uma chamada de IA, e a apostila sai mesmo com a Edge Function instável.
- **CUSTO/CONSEQUÊNCIA:** 1 a 2 h (Estimativa — precisa ser validada). Custo recorrente zero.
- **RISCO QUE CRIA:** ≥, ≠, emoji e escrita não latina viram "?" no PDF.
- **COMO IMPLEMENTAR:** `api\_app\documentos.py:104-135`, `api\index.py:1098`. Testes novos:
  - `tests\test_documentos_pdf.py` com 9 casos esperando bytes começando com `%PDF`;
  - teste de rota com `gerar_embeddings` levantando `httpx.HTTPStatusError` e esperando que `chamar_llm` seja chamado.
- **COMO MEDIR:**
  - FATO executado em memória com fpdf2 2.8.8: a tradução com `replace` gerou PDF para travessão, aspas curvas, marcador, reticências, seta, emoji e CJK.
  - A fonte DejaVuSans também gerou, só com aviso de glifo ausente para emoji e CJK.
  - Em produção: zero `FPDFUnicodeEncodingException` nos logs (A3-10).
- **ALTERNATIVAS CONSIDERADAS:**
  - Fonte TTF DejaVu (Sans + Bold): preserva os símbolos. Custo: cerca de 1,46 MB (medido nas cópias desta máquina), licença a registrar e `includeFiles` no `vercel.json`. O fpdf2 não traz TTF no pacote (verificado no venv). Fica como evolução se houver reclamação de "?".
  - PDF a partir do DOCX: exige um conversor externo na função, inviável.
  - Tirar a opção PDF: piora a experiência.
- **PRIORIDADE:** AGORA
- **IMPACTO x ESFORÇO:** alto x baixo

### A3-03 — Limites de entrada, auditoria com teto e login protegido
- **RESOLVE:** A1-01 (validação de entrada), A1-14 e A1-16 (ajuste por ambiente). Depende de A1-01, A1-14 e A1-16, ainda não verificados.
- **ANTES:**
  - Nenhum `Field(` em `api\`.
  - `api\index.py:1359,1391`: `n_por_frase` sem teto e número de frases sem limite.
  - `api\index.py:756-773`: login sem limitador.
  - `api\index.py:770` e `:357`: `compare_digest` com `str`.
  - `api\index.py:173`: `LIMITE_LLM_POR_MINUTO = 20` fixo no código, sem leitura do ambiente.
  - `lib\api.ts:52-69`: `mensagemDe` não trata `detail` em lista, então um 422 apareceria como JSON cru.
- **MUDANÇA:**
  1. `Field(max_length=...)` nos modelos Pydantic (valores são Estimativa — calibrar com A3-10):
     - pergunta, tema e mensagem: cerca de 4.000 caracteres;
     - `resposta` em simplificar, verificar e auditar: cerca de 12.000;
     - `contexto: list[EvidenciaIn] = Field(default_factory=list, max_length=8)`, com `conteudo` até cerca de 2.000.
  2. Auditoria: `n_por_frase: int = Field(1, ge=1, le=3)`. Auditar no máximo 30 frases e devolver `frases_ignoradas`.
  3. Login: limitador por IP usando `consumir_cota` com chave `login-ip:{hash}` e 5 tentativas por 60 s. Sem teto global, para um atacante não conseguir trancar o admin. `compare_digest(a.encode(), b.encode())` nas duas comparações.
  4. `LIMITE_LLM_POR_MINUTO` lido do ambiente.
  5. Mensagem do teto global: "o limite reinicia às 21:00 (horário de Brasília)", porque a janela é em UTC (`2026-09-16-cota-de-uso.sql:36`).
  6. `mensagemDe`: quando `detail` for lista, montar "campo X: texto longo demais (máx. N)".
- **POR QUE:** fecha a amplificação por tamanho e a força bruta sem migração nem SQL novo.
- **DEPOIS:** entrada grande recebe 422 com mensagem legível. Uma auditoria custa no máximo 4 chamadas à Edge Function e 30 RPCs. A sexta tentativa de login no minuto recebe 429. Senha acentuada funciona.
- **BENEFÍCIO:** limite de custo por requisição e admin protegido.
- **CUSTO/CONSEQUÊNCIA:** 2 a 4 h (Estimativa — precisa ser validada). Custo recorrente: nenhum, fora 1 RPC por tentativa de login.
- **RISCO QUE CRIA:**
  - Questão legítima com texto-base longo recebe 422.
  - Um limite mal calibrado bloqueia uso real.
  - Um atacante com muitos IPs ainda tenta devagar. Mitigação: senha longa e aleatória.
- **COMO IMPLEMENTAR:** modelos em `api\index.py` (PerguntaReq, SimplificarReq, VerificarReq, AuditarReq, GlossarioReq, ResolverReq, CompararReq, ApostilaReq, AprenderReq, PerfilComportamentalReq, ElencoConversaReq, SuporteReq), `admin_login`, `exigir_admin` e `lib\api.ts`. Testes em `tests\test_erros_e_limites.py` e `tests\test_admin_auth.py`.
- **COMO MEDIR:**
  - FATO executado em memória (FastAPI 0.141.1, Pydantic 2.13.5): 422 para string acima de `max_length`, lista acima de `max_length` e inteiro acima de `le`.
  - Critérios: login com senha acentuada dá 200; sexta tentativa no minuto dá 429; auditoria com 200 frases faz no máximo 30 buscas.
- **ALTERNATIVAS CONSIDERADAS:**
  - Truncar em silêncio: o aluno não sabe o que foi ignorado.
  - Supabase Auth para o admin: fluxo novo sem ganho proporcional para um único administrador.
- **PRIORIDADE:** AGORA
- **IMPACTO x ESFORÇO:** alto x baixo

### A3-04 — Upload e ingestão: parar de anunciar sucesso falso e impedir a mistura de documentos
- **RESOLVE:** A1-07, A1-08, A1-06 (itens 1 e 3) e A1-02 (defesa enquanto o servidor roda). Depende de A1-02, A1-06, A1-07 e A1-08, ainda não verificados.
- **ANTES:**
  - `components\tabs\PdfsTab.tsx:241`: `runIngest(mudou)` sem `forcar`.
  - `components\tabs\PdfsTab.tsx:184-192`: o 409 vira `done = true`.
  - `components\tabs\PdfsTab.tsx:193-197`: retentativa imediata.
  - `components\tabs\PdfsTab.tsx:205`: a linha de "Concluído" sai sempre.
  - `api\index.py:1929`: a guarda olha só `igual`.
  - `api\index.py:1933`: o 409 no meio do laço abandona os arquivos já enviados.
  - `api\index.py:499-506`: insert com `return=minimal`.
  - `api\index.py:1859-1864`: insere e depois apaga `id <= corte`.
- **MUDANÇA:**
  1. **Front:**
     - chamar `runIngest(mudou, forcar)`;
     - no 409: `done = false`, adicionar o detalhe a `analises`, `setBloqueado(true)` e registrar a pendência;
     - esperar 1, 2, 4, 8 e 16 s entre tentativas;
     - "Concluído" só sem pendência; senão "Concluído com pendências: X, Y".
  2. **Upload:** se `igual` existe e `nome in por_nome` com MD5 diferente, responder 409 explícito: "já existe outro documento com este nome e conteúdo diferente; renomeie".
  3. **Upload com vários arquivos:** acumular `bloqueados` e continuar o laço, respondendo 200 com `salvos`, `substituidos` e `bloqueados`, em vez de um 409 que abandona o resto. O front indexa o que mudou e mostra o bloqueio do restante.
  4. **Ingestão:** `inserir_chunks` com `Prefer: return=representation` e `select=id`. Se `min(ids) <= corte`, apagar os ids recém-inseridos (`id=in.(...)`) e responder erro "sequência de ids desalinhada — rode o setval (A3-09)" antes de qualquer apagamento por faixa.
- **POR QUE:** correções de fluxo em poucas linhas, que fecham os caminhos em que o admin acredita ter indexado e não indexou, ou perdeu conteúdo.
- **DEPOIS:** substituição confirmada chega ao índice. Bloqueio aparece como bloqueio. Com ids desalinhados, nada é apagado.
- **BENEFÍCIO:** índice e Storage deixam de divergir em silêncio.
- **CUSTO/CONSEQUÊNCIA:** 4 a 6 h (Estimativa — precisa ser validada). Custo recorrente: a resposta do insert passa a trazer 24 ids por lote, desprezível.
- **RISCO QUE CRIA:**
  - A mudança de contrato do upload (409 para 200 com `bloqueados`) exige que front e função subam no mesmo deploy. O `vercel.json` já põe os dois no mesmo projeto.
  - A duplicação na retentativa (A1-06 item 2) continua possível até A3-12.
- **COMO IMPLEMENTAR:** `components\tabs\PdfsTab.tsx:163-255`, `api\index.py:499-506,1850-1873,1908-1961`. Testes em `tests\test_ingerir_lotes.py` e `tests\test_ingestao_guard.py`:
  - insert devolvendo ids menores ou iguais ao corte não apaga por faixa;
  - B.pdf com o conteúdo de A dá 409;
  - lote com um arquivo bloqueado ainda devolve os salvos.
- **COMO MEDIR:** o roteiro do A1-07 num Supabase local termina com os chunks da versão nova. Nenhuma linha de sucesso aparece para arquivo bloqueado.
- **ALTERNATIVAS CONSIDERADAS:**
  - Ir direto para A3-12: resolve a causa raiz, mas exige migração.
  - Tabela de preparação com troca numa RPC transacional: mais forte, mais SQL.
  - Obrigar o upload a passar pela prévia: mais cliques, não cobre a retentativa.
- **PRIORIDADE:** AGORA
- **IMPACTO x ESFORÇO:** alto x médio

### A3-05 — Aba Perguntar: texto parcial preservado, corte sinalizado e uma rodada por vez
- **RESOLVE:** A1-05 (itens 2 a 5), A1-11 e os achados novos N6 e N9. Depende de A1-05 e A1-11, ainda não verificados.
- **ANTES:**
  - `lib\api.ts:169`: `JSON.parse` sem `try`.
  - `lib\api.ts:177-178`: o evento de erro lança exceção.
  - `lib\api.ts:192`: `tratar(pendente)` recebe linha incompleta.
  - `components\tabs\PerguntarTab.tsx:87`: `setLoading(false)` durante o stream.
  - `components\tabs\PerguntarTab.tsx:221`: o botão depende só de `loading`.
  - `components\tabs\PerguntarTab.tsx:96-99`: `setResultado(null)` apaga o parcial.
  - `components\tabs\PerguntarTab.tsx:105-116`: a auditoria não confere a rodada.
  - `components\tabs\PerguntarTab.tsx:122,135,166`: usam a `pergunta` que está na caixa agora.
  - `api\_app\provedores.py:265-269`: `finish_reason` é ignorado.
  - `api\index.py:1033`: `/api/perguntar` devolve a resposta sem `limpar_resposta`.
  - `api\rag_core.py:146-158`: não remove `<thinking>` nem `<think>` sem fechamento.
- **MUDANÇA:**
  1. Stream no backend: ler `choices[0].finish_reason` e emitir `{"tipo":"fim","motivo":"length"|"stop"|...}`.
  2. `/api/perguntar`: aplicar `limpar_resposta`.
  3. `limpar_resposta`: tratar `<think>` e `<thinking>`; um bloco aberto sem fechamento é removido até o fim.
  4. Em `lib\texto.ts`, criar `removerRaciocinio(texto)` com a mesma regra, aplicada em `onTexto` e no resultado final (exibição, auditoria, simplificar, exportar).
  5. `perguntarStream`:
     - `try/catch` no `JSON.parse`;
     - parâmetro `signal: AbortSignal`;
     - evento `erro` depois de texto recebido resolve com `{..., resposta, interrompida: true, aviso}` em vez de lançar;
     - `fim` com `motivo === "length"` marca `truncada: true`.
  6. `PerguntarTab`:
     - `disabled` inclui `recebendo`;
     - `rodadaRef` e `AbortController` (aborta a rodada anterior e no desmonte);
     - callbacks e `auditar` ignoram rodada antiga;
     - a pergunta fica guardada junto do resultado;
     - aviso "resposta interrompida/cortada — o texto acima está incompleto";
     - sem auditoria automática para resposta interrompida.
- **POR QUE:** a aba principal hoje apaga o que o aluno já leu e mistura rodadas. O conserto é local e testável, e já existe `tests-js\api-stream.test.ts`.
- **DEPOIS:** um corte mantém o texto com aviso. Uma resposta truncada pelo modelo é sinalizada. `<think>` e `<thinking>` não aparecem. Só a última pergunta altera a tela.
- **BENEFÍCIO:** confiabilidade da rota mais usada, sem custo de IA.
- **CUSTO/CONSEQUÊNCIA:** 6 a 10 h (Estimativa — precisa ser validada). Custo recorrente zero.
- **RISCO QUE CRIA:**
  - Campos novos no NDJSON: são compatíveis para trás, mas uma aba aberta com a versão antiga os ignora.
  - O filtro de bloco sem fechamento pode esconder texto legítimo que contenha a string literal "<think>" (raro).
  - O aluno pode estudar a partir de resposta incompleta. O aviso precisa ser visível.
- **COMO IMPLEMENTAR:** `api\_app\provedores.py:224-275`, `api\index.py:1027-1067`, `api\rag_core.py:146-158`, `lib\api.ts:137-198`, `lib\texto.ts`, `components\tabs\PerguntarTab.tsx`. Testes JS novos em `tests-js\api-stream.test.ts`: linha incompleta, erro depois de texto, `motivo=length`, `<thinking>`, abort. Teste Python de `limpar_resposta` com `<thinking>`.
- **COMO MEDIR:** os testes acima passam. Com logs (A3-10): proporção de streams com `motivo=length` e com erro parcial, por modelo.
- **ALTERNATIVAS CONSIDERADAS:**
  - Filtrar `<think>` no servidor durante o stream: exige estado entre pedaços e é mais difícil de testar.
  - Desligar o streaming: perde o primeiro texto em cerca de 1 s (`api\index.py:1041-1042`).
- **PRIORIDADE:** AGORA
- **IMPACTO x ESFORÇO:** alto x médio

### A3-06 — Prazo único por requisição no backend
- **RESOLVE:** A1-05 (item 1) e A1-13. Depende de A1-05 e A1-13, ainda não verificados. A documentação da Vercel diz que a duração máxima "inclui o tempo de envio da resposta, inclusive respostas em streaming". Isso confirma a premissa do A1-05, que era inferência.
- **ANTES:**
  - `api\_app\http_util.py:15-17`: `TIMEOUT_LLM` constante.
  - `api\_app\provedores.py:157`: piso de 5 s.
  - `api\_app\provedores.py:240`: timeout de leitura entre pedaços no stream.
  - `api\index.py:1165-1188`: até 40 chamadas map e depois a reduce.
  - `api\index.py:1450`: `inicio` só depois da busca.
  - `api\index.py:634-638`: download com 120 s.
  - Embeddings e busca usam `_TIMEOUT` de 60 s.
- **MUDANÇA:**
  1. Classe `Prazo` em `http_util.py`: `fim = monotonic() + TEMPO_MAX_FUNCAO - MARGEM_SEGURANCA`, com método `restante()`. Um middleware HTTP a cria em `request.state.prazo`, então a leitura do corpo e as RPCs de cota entram na conta.
  2. `chamar_llm`, `chamar_llm_stream`, `gerar_embeddings`, `buscar_chunks` e `baixar_documento_storage` recebem `timeout=prazo.restante()`. Se sobrar menos de 5 s, responder 504 claro em vez de esperar o piso.
  3. Stream: `async with asyncio.timeout(prazo.restante())` em volta do laço (Python 3.11 ou mais). No estouro, emitir `erro` com `parcial: true`, que A3-05 consome.
  4. Resumir:
     - `asyncio.wait(tarefas, timeout=prazo.restante() - RESERVA_REDUCE)` e cancelar as pendentes;
     - `extrair_pontos` captura `Exception`;
     - devolver `chunks_ok`;
     - `MAX_CHUNKS_RESUMO` de 40 para 20 (Estimativa — calibrar com A3-10).
  5. Glossário usa o prazo da requisição.
- **POR QUE:** A1-05 e A1-13 têm a mesma causa. Um único objeto de prazo resolve todas as rotas.
- **DEPOIS:** nenhuma rota passa do orçamento sem aviso. O resumo entrega o que coube e diz quantos trechos entraram.
- **BENEFÍCIO:** fim dos 504 da plataforma que chegam depois de pagar as chamadas.
- **CUSTO/CONSEQUÊNCIA:** 6 a 10 h (Estimativa — precisa ser validada). Custo recorrente: menos chamadas desperdiçadas.
- **RISCO QUE CRIA:**
  - Modelos lentos passam a receber "sem tempo" explícito com mais frequência.
  - Resumos com menos trechos.
  - `RESERVA_REDUCE` mal calibrada corta a reduce.
- **COMO IMPLEMENTAR:** `api\_app\http_util.py`, `api\_app\provedores.py`, `api\index.py` (middleware e rotas de IA, ingestão, resumir, glossário). Pytest com `time.monotonic` falso e `chamar_llm` com `asyncio.sleep`.
- **COMO MEDIR:**
  - Nos testes, a soma nunca passa de `TEMPO_MAX_FUNCAO`.
  - `extrair_pontos` com `KeyError` não derruba a rota.
  - Em produção (A3-10): 504 `FUNCTION_INVOCATION_TIMEOUT` perto de zero.
- **ALTERNATIVAS CONSIDERADAS:** aumentar `maxDuration` e resumo em etapas dirigido pelo cliente (comparados em §3.1). Semáforo na fase map, como sugere o A1-13: com prazo fixo, só aumenta o tempo total.
- **PRIORIDADE:** AGORA
- **IMPACTO x ESFORÇO:** alto x médio

### A3-07 — Acabar com as falhas silenciosas: glossário na primeira navegação, status, provedores e auditoria
- **RESOLVE:** A1-12, A1-19. Depende de A1-12 e A1-19, ainda não verificados.
- **ANTES:**
  - `components\tabs\GlossarioTab.tsx:64-65,82-87` e `lib\useProviderModel.ts:109`.
  - `api\index.py:713-726`: HEAD sem `raise_for_status`.
  - `app\page.tsx:65-70`: `setProviders({})` fica para sempre.
  - `components\tabs\PerguntarTab.tsx:110-113`.
  - `.catch(() => undefined)` nas abas de personas.
- **MUDANÇA:**
  1. Guardar o `seed` pendente num `ref` e disparar `gerar` num efeito com `[pronto, seed?.tick]`.
  2. `r.raise_for_status()` no status, sem guardar falha no cache.
  3. `page.tsx`: estado `erroProviders`, 3 tentativas (2, 5 e 10 s) e botão "tentar de novo" no `ProviderSelect`.
  4. Auditoria que falha mostra "Auditoria indisponível agora — a resposta continua válida".
  5. Listas de personas mostram mensagem de falha.
- **POR QUE:** hoje o sintoma não diz a causa (botão travado, "sem dados", nada acontece).
- **DEPOIS:** toda falha tem mensagem e caminho de recuperação.
- **BENEFÍCIO:** menos reclamações sem pista e diagnóstico mais rápido.
- **CUSTO/CONSEQUÊNCIA:** 2 a 4 h (Estimativa — precisa ser validada). Custo recorrente zero.
- **RISCO QUE CRIA:** as tentativas automáticas atrasam em cerca de 17 s o aviso de backend fora do ar. O cabeçalho passa a mostrar "offline" em falhas do Supabase antes exibidas como "sem dados".
- **COMO IMPLEMENTAR:** os arquivos acima, com teste Python de `/api/status` recebendo 401.
- **COMO MEDIR:** o roteiro manual do A1-12 gera a requisição na primeira vez. Backend desligado e religado se recupera sem recarregar a página.
- **ALTERNATIVAS CONSIDERADAS:** passar provedor e modelo junto do `seed` (acopla as abas); banner global único (menos específico).
- **PRIORIDADE:** AGORA
- **IMPACTO x ESFORÇO:** médio x baixo

### A3-08 — Ambiente reproduzível, documentação alinhada e credencial de teste
- **RESOLVE:** A1-15, A1-21, A1-22 e o achado novo N1. Depende de A1-15, A1-21 e A1-22, ainda não verificados.
- **ANTES:**
  - `requirements.txt` só com `>=`.
  - `iniciar-tudo.bat:59` usa Python 3.11; CI e ruff usam 3.12.
  - Não há `.python-version` nem `pyproject.toml` (FATO, listagem da raiz).
  - `.env.example` incompleto.
  - `components\ProviderSelect.tsx:58-60` lista quatro provedores fixos.
  - `tests\test_admin_auth.py:22-23` define usuário e senha literais (valor não reproduzido aqui).
- **MUDANÇA:**
  1. Criar `.python-version` com `3.12`. Documentação da Vercel (verificada): o arquivo é reconhecido, 3.12 é o padrão quando nada é declarado e as versões disponíveis são 3.12, 3.13 e 3.14. `iniciar-tudo.bat` passa a criar o venv com 3.12. **Sem matriz com 3.11**, porque a produção não pode rodar 3.11.
  2. Rodar pytest em 3.12, gerar `pip freeze` e fixar com `==` em `requirements.txt`.
  3. Completar o `.env.example` e criar um teste que compare com `PROVIDERS[*]["env_key"]`.
  4. A mensagem do `ProviderSelect` passa a sair da lista recebida.
  5. Nota no topo de `CORRECOES-2026-09-10.md` e `README-BACKUP.md`: "documento histórico; estado atual em PROJECT.md".
  6. Se o valor em `tests\test_admin_auth.py:23` for ou tiver sido a senha real, trocar `ADMIN_PASS` na Vercel e usar valor obviamente falso no teste.
  7. `npm audit`: testar `overrides` do npm para a postcss aninhada no next. Se `npm run build` e `npm audit --omit=dev` passarem, manter. Senão, registrar o aceite de risco.
- **POR QUE:** deploys e CI reproduzíveis e sem configuração faltando em ambiente novo.
- **DEPOIS:** a mesma versão de Python e as mesmas dependências no local, no CI e na Vercel.
- **BENEFÍCIO:** fim das regressões silenciosas por atualização de pypdf ou starlette.
- **CUSTO/CONSEQUÊNCIA:** 2 a 3 h (Estimativa — precisa ser validada). Custo recorrente: atualizar as versões de propósito, cerca de 1 h por mês (Estimativa).
- **RISCO QUE CRIA:** versões fixadas congelam correções de segurança se ninguém atualizar. O override da postcss pode quebrar o build.
- **COMO IMPLEMENTAR:** `requirements.txt`, `.python-version`, `iniciar-tudo.bat`, `.env.example`, `components\ProviderSelect.tsx`, `tests\test_admin_auth.py`, `package.json`, teste novo em `tests\`.
- **COMO MEDIR:** `pip freeze` do CI igual ao log de build da Vercel; teste do `.env.example` passa.
- **ALTERNATIVAS CONSIDERADAS:**
  - `pyproject.toml` com `uv.lock`: a Vercel aceita (verificado), e é melhor ferramenta, mas muda o `.bat` e o CI. Fica para quando houver dor.
  - Teto de major (`<0.142`): reprodutibilidade só parcial.
  - Matriz 3.11/3.12 no CI: rejeitada, testa uma versão que a produção não usa.
- **PRIORIDADE:** AGORA (fase 0)
- **IMPACTO x ESFORÇO:** médio x baixo

### A3-09 — Roteiro de restauração seguro e verificação de RLS sem teste destrutivo
- **RESOLVE:** A1-02 (causa no roteiro de restauração) e A1-20. Depende de A1-02 e A1-20, ainda não verificados.
- **ANTES:**
  - `supabase-backup\recriar-banco.sql:116-121`: `\copy` com `id` e sem `setval`; não tem `REVOKE` nem a cota.
  - `README-BACKUP.md:69-74`.
  - `CORRECOES-2026-09-10.md:184-188` e `2026-09-10-rls-e-glossario.sql:115-117`: a verificação manda fazer DELETE com a chave anon.
- **MUDANÇA:**
  1. Depois dos `\copy`: `select setval(pg_get_serial_sequence('public.ementas_chunks','id'), (select coalesce(max(id),1) from public.ementas_chunks));`. O mesmo para `glossario_termos`.
  2. Roteiro numerado no `README-BACKUP.md`: `recriar-banco.sql`, depois as migrações de `migracoes\` em ordem de data, depois `setval`, depois a verificação. Indicar `scripts\reimportar_chunks.py` (não envia id) como caminho preferido.
  3. Verificação **só de leitura**, no SQL Editor:
     - `select relname, relrowsecurity from pg_class where relname in ('ementas_chunks','glossario_termos','cota_uso');`
     - `select * from pg_policies where tablename in (...)`
     - `select grantee, privilege_type from information_schema.role_table_grants where table_name in (...) and grantee in ('anon','authenticated');`
  4. `/api/config` expõe `cota_distribuida: bool` (resultado da última chamada a `consumir_cota`), para a interface avisar quando só o limite em memória vale.
- **POR QUE:** o teste documentado apaga dados exatamente no caso em que a proteção falta. As consultas ao catálogo respondem a mesma pergunta sem risco.
- **DEPOIS:** um banco restaurado nasce com a sequência certa, RLS, `REVOKE` e cota. A segurança é conferida sem escrever nada.
- **BENEFÍCIO:** o cenário de recuperação documentado deixa de perder o índice na primeira reindexação.
- **CUSTO/CONSEQUÊNCIA:** 2 a 3 h, mais cerca de 4 h para ensaiar num Supabase local (Estimativa — precisa ser validada).
- **RISCO QUE CRIA:** o ensaio exige um ambiente separado. O item 4 revela ao público se a cota compartilhada está ativa, o que é informação útil a um abusador. Mostrar só ao admin.
- **COMO IMPLEMENTAR:** `supabase-backup\recriar-banco.sql`, `README-BACKUP.md`, `api\index.py` (`config_publica`, `_limitar_llm`).
- **COMO MEDIR:** no ensaio local, `nextval` fica maior que `max(id)` e reindexar mantém `chunks_novos > 0`. As consultas mostram RLS ligado e nenhum privilégio de escrita para `anon`.
- **ALTERNATIVAS CONSIDERADAS:**
  - Backups nativos do Supabase: dependem do plano, NÃO VERIFICADO.
  - Só as defesas no backend (A3-04, A3-12): deixam `glossario_termos` colidindo na chave primária.
- **PRIORIDADE:** AGORA (antes de qualquer restauração)
- **IMPACTO x ESFORÇO:** alto no cenário de recuperação x baixo

### A3-10 — Uma linha de log estruturado por requisição
- **RESOLVE:** MÉTRICAS AUSENTE (dossiê §2; A1 §2: "não há registro de 429, 500, 504 ou de truncamentos"). Dá a base para medir A3-03, A3-05, A3-06 e A3-11.
- **ANTES:** `print` avulsos (`api\index.py:220,436`). Não há latência, erro, modelo nem truncamento por requisição.
- **MUDANÇA:**
  - Middleware que imprime, no fim de cada requisição, `json.dumps({"evt":"req","rota","status","ms","ip_hash","provider","modelo","motivo_fim","n_chunks","confianca_media","custo","erro_tipo"})`.
  - Campos específicos da rota vão em `request.state.log`.
  - No stream, a linha sai no fim do gerador.
  - Nunca registrar o texto da pergunta ou da resposta, nem o IP em claro (usar o HMAC de `_limitar_llm`).
- **POR QUE:** não exige serviço novo. Os `print` já são o canal de diagnóstico do projeto (inferência, pelo uso atual).
- **DEPOIS:** filtrando os logs de runtime por `"evt":"req"`, o dono sabe qual modelo mais falha, quantos 504 houve e quantas respostas foram cortadas.
- **BENEFÍCIO:** decisões de limite, modelo padrão e prazo passam a ter dado.
- **CUSTO/CONSEQUÊNCIA:** 3 a 5 h (Estimativa — precisa ser validada). Sem custo em dinheiro. Retenção e busca de logs dependem do plano da Vercel (NÃO VERIFICADO).
- **RISCO QUE CRIA:** hash de IP é dado pseudonimizado (inferência sobre LGPD; restrições AUSENTE). Volume de log.
- **COMO IMPLEMENTAR:** `api\index.py` (middleware), `api\_app\provedores.py` (devolver `finish_reason` e `usage` quando o provedor enviar). Teste com `capsys`.
- **COMO MEDIR:** 100% das rotas emitem `evt=req` nos testes.
- **ALTERNATIVAS CONSIDERADAS:**
  - Sentry ou Datadog: fornecedor e custo novos; DEPOIS, se houver orçamento.
  - Tabela de métricas no Supabase: grava a cada requisição e aumenta a latência.
- **PRIORIDADE:** AGORA
- **IMPACTO x ESFORÇO:** médio x baixo

### A3-11 — Cota proporcional ao custo, em baldes separados e numa só ida ao banco
- **RESOLVE:** A1-01 (amplificação e teto global) e A1-16. Depende de A1-01 e A1-16, ainda não verificados.
- **ANTES:**
  - `api\index.py:418-439`: até 3 RPCs em sequência, 1 unidade por requisição.
  - `api\index.py:800`: a busca consome a cota de LLM.
  - `api\index.py:1375`: a auditoria consome a cota de LLM.
  - `api\index.py:1141`: o resumo consome 1 unidade para até 41 chamadas.
  - `supabase-backup\migracoes\2026-09-16-cota-de-uso.sql` soma sempre 1.
  - Há 15 chamadas a `_limitar_llm(request)` (FATO, grep).
- **MUDANÇA:**
  1. Migração com `consumir_cotas(p_itens jsonb)`: para cada `{chave, limite, janela_seg, custo}` soma `custo` e devolve a primeira chave estourada ou `null`. `security definer`, execução só para `service_role`. A função antiga fica, para permitir voltar atrás.
  2. `_limitar(request, balde, custo)` com três baldes:
     - `llm`: por minuto e por dia por IP, mais o teto global;
     - `busca`: buscar e auditar, com limites próprios e maiores;
     - `login`: o de A3-03.
  3. Custos: rota de 1 chamada = 1; comparar = número de modelos; resumir = 1 na entrada mais o número de trechos antes do map; glossário = 2.
  4. `cota_distribuida` exposto ao admin (A3-09).
- **POR QUE:** o limite passa a medir chamadas pagas, não requisições. A auditoria automática deixa de cortar pela metade a cota do aluno.
- **DEPOIS:** o resumo de 20 trechos consome 21 unidades. Uma pergunta com auditoria consome 1 unidade de `llm` e 1 de `busca`, com uma única RPC.
- **BENEFÍCIO:** custo previsível e menos latência antes de cada chamada.
- **CUSTO/CONSEQUÊNCIA:** 8 a 12 h (Estimativa — precisa ser validada). Custo recorrente: 1 RPC por requisição em vez de até 3.
- **RISCO QUE CRIA:**
  - **Ordem de deploy:** a migração vai antes do código. Se o código subir sem a função, `_limitar_llm` cai em silêncio no limite só em memória (`api\index.py:435-437`). Por isso o log de erro alto e o item 4.
  - Limites mal calibrados bloqueiam turmas.
- **COMO IMPLEMENTAR:** `supabase-backup\migracoes\2026-09-XX-cota-por-custo.sql`, `api\index.py`, `tests\test_limite_e_sessao.py` (o cliente falso já intercepta a RPC; adaptar para `p_itens`).
- **COMO MEDIR:** teste de custo por rota. Uma pergunta com auditoria automática consome exatamente 1 unidade de `llm`. Nos logs (A3-10), distribuição de `custo` por IP e por dia.
- **ALTERNATIVAS CONSIDERADAS:**
  - Chamar a RPC atual N vezes: N idas ao banco.
  - Só regra de WAF: conta requisições, não custo; complementa (§3.2).
  - Sessão anônima por cookie: ajuda com NAT, não com custo.
- **PRIORIDADE:** PRÓXIMO (AGORA se o app estiver aberto na internet)
- **IMPACTO x ESFORÇO:** alto x médio

### A3-12 — Ingestão idempotente por execução, no lugar do corte por faixa de id
- **RESOLVE:** A1-06 (causa raiz) e A1-02 (dependência da sequência). Depende de A1-02 e A1-06, ainda não verificados.
- **ANTES:** `api\index.py:1850` calcula o corte por maior id, `:1859` insere, `:1864` apaga `id <= corte`. Nos lotes seguintes, o corte vem do cliente.
- **MUDANÇA:**
  1. Migração aditiva: `alter table public.ementas_chunks add column if not exists execucao uuid, add column if not exists ordem integer;` e índice em `(source, execucao)`. `match_ementas` seleciona colunas explícitas e não muda.
  2. O lote 0 gera `execucao` (uuid4) e a devolve ao cliente, no lugar de `corte_id`.
  3. Cada lote apaga `source=X and execucao=E and ordem >= offset and ordem < offset+24` e depois insere com `execucao` e `ordem`. Repetir um lote não duplica.
  4. O último lote apaga `source=X and (execucao is null or execucao <> E)`.
  5. `POST /api/ingerir/cancelar {arquivo, execucao}` apaga uma execução abandonada. O front chama depois de 5 falhas.
- **POR QUE:** a identidade do lote passa a ser dado gravado, não suposição sobre a ordem dos ids.
- **DEPOIS:** retentativa sem duplicata, restauração sem risco de sequência e nenhuma confiança no corte enviado pelo cliente.
- **BENEFÍCIO:** fecha a classe de perda e duplicação na raiz.
- **CUSTO/CONSEQUÊNCIA:** 8 a 12 h (Estimativa — precisa ser validada). Custo recorrente: um DELETE a mais por lote.
- **RISCO QUE CRIA:**
  - Migração em tabela de produção. É aditiva, mas exige `scripts\backup_dump.py` antes.
  - Duas abas de admin indexando o mesmo documento ao mesmo tempo apagam uma à outra. Avisar ou travar por fonte.
- **COMO IMPLEMENTAR:** migração nova, `api\index.py:1739-1873`, `components\tabs\PdfsTab.tsx`, `lib\api.ts`, `tests\test_ingerir_lotes.py`.
- **COMO MEDIR:**
  - O teste do A1-06 (falha em apagar e lote repetido) conta 2 inserções líquidas.
  - Uma restauração com ids baixos não perde chunks.
  - O painel (A3-19) mostra zero execuções incompletas.
- **ALTERNATIVAS CONSIDERADAS:**
  - Tabela de preparação com troca atômica numa RPC: mais forte, mas embeddings trafegam pela RPC e há mais SQL.
  - Ficar só com A3-04: resolve sintomas.
- **PRIORIDADE:** PRÓXIMO
- **IMPACTO x ESFORÇO:** médio x médio

### 2.2 Ordem de implementação e testes de regressão

| Fase | Propostas | Pré-requisito | Testes de regressão obrigatórios |
|---|---|---|---|
| 0 | A3-08 | nenhum | pytest e ruff em 3.12; `npm run build`; `npm audit --omit=dev` |
| 1 | A3-01, A3-02, A3-03, A3-07 (A3-16 cabe aqui) | fase 0 | `test_rag_core`: 4 enunciados, frase acentuada, 3 pares numéricos, termo repetido, busca com vírgula. PDF com 9 casos. Rota de apostila com `HTTPStatusError`. 422 por tamanho. Login acentuado dá 200 e sexta tentativa dá 429. Roteiro manual do glossário |
| 2 | A3-04, A3-05, A3-06, A3-10 | fase 1 | Ingestão: ids menores que o corte abortam sem apagar por faixa. Upload B com conteúdo de A dá 409. Lote misto devolve os salvos. JS: linha incompleta, erro depois de texto, `length`, `<thinking>`, abort. Pytest com relógio falso. `evt=req` no stdout |
| 3 | A3-09 | em paralelo | ensaio de restauração num Supabase local |
| 4 | A3-11 e A3-12: **migração primeiro, deploy depois** | `backup_dump.py`; A3-10 para calibrar | `test_limite_e_sessao` adaptado; custo por rota; ingestão repetida idempotente |
| 5 | A3-13, A3-14 | A3-04 (reindexar com segurança) | conjunto de referência antes e depois |
| 6 | A3-17, A3-18, depois A3-19 e A3-20, depois A3-21 e A3-22 | A3-01 (auditoria correta), A3-14 (calibração) | testes JS de citação; `match_ementas_fontes` com filtro |
| 7 | A3-15 | tudo acima estável | todos os testes sem rede e sem variáveis de ambiente |

### 2.3 Melhorias (parte B)

### A3-13 — Higiene do acervo antes de qualquer feature de estudo
- **RESOLVE:** objetivo "respostas fundamentadas e citadas"; riscos de `PROJECT.md` §10 (73% sem arquivo, acervo misto, 1 trecho de Lógica).
- **ANTES:**
  - 384 dos 526 trechos vêm de um arquivo ausente do Storage.
  - 7 trechos de `Nous_Portal_Model_Prices - Summary.pdf` disputam os 6 lugares de contexto (`api\index.py:1006`).
  - `Empreendedorismo_Inovacao_Tecnologia.pdf` (2 trechos) cobre o mesmo tema do `_completo`.
  - `Logica_Programacao_Python.pdf` tem 18 KB em `supabase-backup\pdfs` e rendeu 1 trecho.
  - FATO: não há rota para tirar um documento do índice; as rotas de admin são pdfs, upload, prévia, ingerir e duplicatas.
- **MUDANÇA:** são decisões do dono, não código.
  1. Rodar `scripts\backup_dump.py`.
  2. Subir o PDF reconstruído (pendência de 10/09).
  3. Decidir se a lista de preços e o PDF de 2 trechos são material do curso. Se não forem, removê-los por SQL documentado.
  4. Abrir o PDF de Lógica e ver se é só capa. Se for material escaneado, OCR antes de indexar.
- **POR QUE:** a resposta nunca é melhor que o trecho recuperado. Nenhum prompt compensa contexto irrelevante (inferência).
- **DEPOIS:** índice e Storage coincidem e só há material de curso no índice.
- **BENEFÍCIO:** contexto mais relevante em todas as abas de estudo, sem custo de IA.
- **CUSTO/CONSEQUÊNCIA:** 2 a 4 h do dono mais a reindexação (Estimativa — precisa ser validada). Custo recorrente: embeddings da reindexação (1 chamada a cada 8 trechos).
- **RISCO QUE CRIA:** remoção irreversível sem backup. Reindexar agora passa pelos defeitos A1-06 e A1-07, por isso só depois de A3-04.
- **COMO IMPLEMENTAR:** `scripts\backup_dump.py`, aba PDFs, SQL Editor para as remoções. Documentar as remoções no `README-BACKUP.md`.
- **COMO MEDIR:** zero fontes sem arquivo no painel (A3-19). No conjunto de referência (A3-14), hit@6 não piora. Nenhum trecho da lista de preços no contexto das perguntas de curso.
- **ALTERNATIVAS CONSIDERADAS:** filtro por apostila (A3-20) sem remover, que deixa o lixo no índice padrão; não fazer nada, que mantém o risco declarado pelo próprio projeto.
- **PRIORIDADE:** PRÓXIMO (logo depois de A3-04)
- **IMPACTO x ESFORÇO:** alto x baixo

### A3-14 — Conjunto de perguntas de referência para medir a recuperação
- **RESOLVE:** MÉTRICAS AUSENTE; o risco do A1-15 (pypdf muda a extração); a troca do chunker de 500 para 900 caracteres feita sem medir a recuperação (`CORRECOES` §3). Os limiares `LIMIAR_CONFIANCA = 0.35` (`api\index.py:125`) e os de `classificar_fidelidade` não têm dado de calibração no repositório.
- **ANTES:** nenhuma medida de acerto da busca.
- **MUDANÇA:**
  - `tests\referencia\perguntas.jsonl` com 20 a 30 perguntas reais, cada uma com `fonte` e `paginas` esperadas.
  - `scripts\avaliar_recuperacao.py`, somente leitura (embeddings e `match_ementas`), imprime hit@1, hit@6 e MRR.
  - Rodar à mão depois de reindexar, trocar o chunker ou atualizar o pypdf. Não usa LLM.
- **POR QUE:** transforma "a busca está boa?" em número comparável entre versões.
- **DEPOIS:** toda mudança de ingestão vem com antes e depois.
- **BENEFÍCIO:** calibra o modo estrito (A3-18) e o aviso de pouco embasamento com dado.
- **CUSTO/CONSEQUÊNCIA:** 4 a 6 h de código mais o tempo de quem conhece o curso para escrever as perguntas, que é o custo principal (Estimativa — precisa ser validada). Custo recorrente: 1 chamada de embedding por pergunta por rodada.
- **RISCO QUE CRIA:** um conjunto pequeno ou enviesado dá falsa segurança.
- **COMO IMPLEMENTAR:** arquivos novos em `tests\referencia\` e `scripts\`. Fora do CI, porque exige segredos.
- **COMO MEDIR:** o número aparece no PR de cada mudança de ingestão, e o limiar escolhido cita a rodada.
- **ALTERNATIVAS CONSIDERADAS:** LLM como juiz (custo recorrente e viés); avaliação manual ad hoc (não reproduzível).
- **PRIORIDADE:** PRÓXIMO
- **IMPACTO x ESFORÇO:** médio x médio

### A3-15 — Dividir `api\index.py` por domínio, depois das correções
- **RESOLVE:** manutenção. O arquivo tem 1.984 linhas e 30 rotas e mistura configuração, autenticação, cota, Supabase e rotas. A divisão facilita mudanças transversais (A3-06, A3-11) e a flag de abas (§3.5).
- **ANTES:** tudo em `api\index.py`. Os testes têm 50 chamadas de `monkeypatch.setattr`, quase todas sobre `index` (FATO, grep). Mover funções faz esses patches deixarem de interceptar o I/O sem aviso.
- **MUDANÇA:**
  - Módulos `_app\supabase.py`, `_app\limites.py` e `_app\auth.py`.
  - `APIRouter` por grupo: estudo, admin e comunicar.
  - As rotas chamam `supabase.gerar_embeddings(...)` pelo módulo, e os testes passam a apontar para ele.
  - Um módulo por PR, sem mudar comportamento.
- **POR QUE:** só compensa com comportamento corrigido e coberto. Antes disso, aumenta o risco sem resolver defeito.
- **DEPOIS:** `index.py` fica pequeno (montagem da app).
- **BENEFÍCIO:** mudanças localizadas e revisão mais simples.
- **CUSTO/CONSEQUÊNCIA:** 12 a 20 h (Estimativa — precisa ser validada).
- **RISCO QUE CRIA:** um patch que deixa de interceptar faz o teste chamar a rede de verdade; conflito com trabalho em andamento.
- **COMO IMPLEMENTAR:** `api\index.py`, `api\_app\*`, `tests\*.py`.
- **COMO MEDIR:** todos os testes passam num CI sem variáveis de ambiente e sem rede; `index.py` com menos de 300 linhas.
- **ALTERNATIVAS CONSIDERADAS:** não dividir, aceitável com um mantenedor e poucas features novas; reescrever (rejeitado em §4).
- **PRIORIDADE:** DEPOIS. Condição: duas ou mais pessoas mantendo, ou três ou mais features novas no backend.
- **IMPACTO x ESFORÇO:** médio x médio

### 2.4 Novas features (parte C): alto valor e baixo custo

### A3-16 — Histórico local nas abas Perguntar e Professor
- **RESOLVE:** o aluno perde a resposta anterior e as fontes a cada envio ou recarga, e pergunta de novo, gastando cota e IA.
  - FATO: `lib\useHistorico.ts` já é usado em Aprender, Elenco, Perfis e Suporte, mas não em Perguntar nem Professor.
  - FATO: `components\tabs\PerguntarTab.tsx:75` apaga o resultado.
- **ANTES:** `ItemHistorico` tem só `id`, `resposta`, `resumo` e `criadoEm` (`lib\useHistorico.ts:5-10`).
- **MUDANÇA:**
  - Campos opcionais `pergunta`, `fontes: {fonte, pagina}[]` (sem o conteúdo dos trechos), `provider` e `modelo`.
  - `useHistorico('perguntar:' + persona)`.
  - Lista "Últimas perguntas" que restaura a resposta.
- **POR QUE:** reaproveita um componente pronto para um problema observado na aba principal.
- **DEPOIS:** as 10 últimas respostas com fontes sobrevivem a troca de aba e recarga.
- **BENEFÍCIO:** menos perguntas repetidas e revisão rápida.
- **CUSTO/CONSEQUÊNCIA:** 2 a 4 h (Estimativa — precisa ser validada). Custo recorrente zero, tudo no navegador.
- **RISCO QUE CRIA:** em computador compartilhado (laboratório), um aluno vê as perguntas do anterior. O botão de limpar precisa ser visível. Históricos antigos sem os campos novos têm de continuar abrindo.
- **COMO IMPLEMENTAR:** `lib\useHistorico.ts`, `components\tabs\PerguntarTab.tsx` (o Professor reutiliza a aba).
- **COMO MEDIR:** local, sem telemetria, não há medida objetiva de adoção. Proxy possível: botão "restaurar" contado pelo feedback (A3-22), se existir.
- **ALTERNATIVAS CONSIDERADAS:** histórico no servidor, que exige identidade e envolve LGPD.
- **PRIORIDADE:** PRÓXIMO (cabe na fase 1)
- **IMPACTO x ESFORÇO:** alto x baixo

### A3-17 — Conferência automática das citações, sem IA
- **RESOLVE:** uma citação inventada ("página 47" fora do contexto) parece tão confiável quanto a verdadeira. Evidência:
  - os prompts pedem citação (`api\_app\prompts.py`: PERGUNTA, RESOLVER, COMPARAR);
  - `montar_contexto` usa o formato fixo `[Fonte: X, página N]` (`api\_app\documentos.py:64`);
  - FATO: grep por "Fonte:" em `api\rag_core.py`, `components` e `lib` não encontra nenhuma conferência.
- **ANTES:** as citações não são verificadas.
- **MUDANÇA:**
  - `lib\citacoes.ts` com `conferirCitacoes(resposta, contexto)` devolvendo `{validas, fora_do_contexto, sem_citacao}`. Aceita "página" e "pág.".
  - Selo abaixo da resposta: "3 citações conferidas com os trechos usados · 1 não está entre eles".
  - Reaproveitar no Resolver (`por_que_correta`) e no Comparar.
- **POR QUE:** transforma "cita fonte e página" em algo verificável, de graça.
- **DEPOIS:** o aluno sabe qual citação conferir.
- **BENEFÍCIO:** reforça o diferencial do app.
- **CUSTO/CONSEQUÊNCIA:** 3 a 5 h (Estimativa — precisa ser validada). Custo recorrente zero.
- **RISCO QUE CRIA:** citação em formato livre gera "sem citação" falso. O rótulo deve ser neutro ("não encontrei citação no formato padrão"). Uma página correta mas fora dos 6 trechos aparece como "fora do contexto", o que é justamente o que vale conferir.
- **COMO IMPLEMENTAR:** `lib\citacoes.ts`, `components\tabs\PerguntarTab.tsx`, `ResolverTab.tsx`, `CompararTab.tsx`. Teste em `tests-js\citacoes.test.ts`.
- **COMO MEDIR:** testes com respostas reais. O gerador do stream acumula o texto e registra no log (A3-10) a contagem de citações fora do contexto por modelo.
- **ALTERNATIVAS CONSIDERADAS:** pedir ao LLM que verifique (uma chamada a mais); só exigir citação no prompt (sem verificação).
- **PRIORIDADE:** PRÓXIMO
- **IMPACTO x ESFORÇO:** alto x baixo

### A3-18 — Modo "só o material"
- **RESOLVE:** conflito entre `SYSTEM_PROMPT_PERGUNTA`, que manda completar com conhecimento geral (`api\_app\prompts.py:4-11`), e o rótulo da auditoria "a IA pode ter inventado" (`components\RespostaAuditada.tsx:22`).
- **ANTES:** um único comportamento que mistura material e conhecimento geral sem marcar a diferença.
- **MUDANÇA:**
  - Persona ou flag `estrito`: responder só com o CONTEXTO, citar fonte e página por parágrafo e dizer "o material indexado não cobre isto" quando faltar.
  - Opcional: se `confianca_media` ficar abaixo de um limiar calibrado (A3-14), não chamar o LLM e mostrar os trechos mais próximos.
  - Chave liga/desliga lembrada em localStorage.
  - No modo normal, pedir que o modelo marque trechos de conhecimento geral com "(conhecimento geral)".
  - Mudar o rótulo vermelho da auditoria para "não encontrada no material".
- **POR QUE:** o aluno escolhe entre precisão e completude, e a auditoria deixa de acusar complementos legítimos.
- **DEPOIS:** dois modos claros e a auditoria coerente com cada um.
- **BENEFÍCIO:** alinha o produto ao objetivo, sem custo extra.
- **CUSTO/CONSEQUÊNCIA:** 3 a 5 h mais calibração (Estimativa — precisa ser validada). Custo recorrente: zero; economiza 1 chamada quando a busca é fraca.
- **RISCO QUE CRIA:** respostas menos úteis para pedidos práticos (código, exemplos), que o prompt atual atende de propósito. Um limiar mal calibrado recusa perguntas que o material cobre.
- **COMO IMPLEMENTAR:** `api\_app\prompts.py` (`PERSONA_PROMPTS`), `api\index.py:994-1011`, `components\tabs\PerguntarTab.tsx`, `components\RespostaAuditada.tsx`.
- **COMO MEDIR:** com A3-01 aplicada, proporção de frases "apoiadas" no modo estrito contra o normal; taxa de "material não cobre"; uso da chave (campo `estrito` no log).
- **ALTERNATIVAS CONSIDERADAS:** tornar o estrito o padrão (muda o produto sem consultar o dono); só trocar o rótulo (barato, recomendo junto).
- **PRIORIDADE:** PRÓXIMO
- **IMPACTO x ESFORÇO:** alto x baixo

### A3-19 — Painel do administrador: uso do dia e saúde do acervo
- **RESOLVE:** o admin não sabe quanto do teto já foi usado, se há abuso, nem quais fontes não têm arquivo. Evidência:
  - os 73% sem arquivo foram achados por scripts locais (`scripts\comparar_com_indice.py`, `scripts\saude_dos_pdfs.py`);
  - `cota_uso` já guarda contadores;
  - A1-01, A1-16 e A1-20 pedem calibração com dados.
- **ANTES:** não há visão de uso nem de saúde na interface.
- **MUDANÇA:** `GET /api/admin/painel` (exige admin) com:
  - uso: da janela atual de `cota_uso`, o `global-dia`, o número de chaves `ip-dia:*` e quantas passam de 80% do limite;
  - acervo: RPC nova `resumo_acervo()` (fonte, trechos, caracteres, página mínima e máxima) cruzada com `listar_arquivos_storage()`, marcando "sem arquivo", "arquivo sem índice" e "poucos trechos";
  - `cota_distribuida`.
  - Um bloco "Saúde" na aba PDFs.
- **POR QUE:** os dados já existem; falta mostrar.
- **DEPOIS:** limites e limpeza do acervo decididos com números.
- **BENEFÍCIO:** abuso e perda de material aparecem cedo.
- **CUSTO/CONSEQUÊNCIA:** 6 a 10 h (Estimativa — precisa ser validada). Custo recorrente: 2 a 3 leituras no Supabase por abertura; zero IA.
- **RISCO QUE CRIA:** o `list` do Storage sem `limit` pode cortar em 100 itens (A1 §5, NÃO VERIFICADO), então é preciso paginar. Contagens por hash de IP ficam só para o admin.
- **COMO IMPLEMENTAR:** migração com `resumo_acervo`, `api\index.py`, `components\tabs\PdfsTab.tsx`, `lib\api.ts`.
- **COMO MEDIR:** zero fontes sem arquivo depois de A3-13; alterações de limite citando números do painel.
- **ALTERNATIVAS CONSIDERADAS:** continuar com scripts locais (exige `.env` com `service_role` na máquina); painel do Supabase (não cruza com o Storage).
- **PRIORIDADE:** PRÓXIMO
- **IMPACTO x ESFORÇO:** médio x baixo

### A3-20 — Estudar uma apostila por vez (filtro de fonte)
- **RESOLVE:** acervo misto (`PROJECT.md` §10). Três assuntos diferentes (Empreendedorismo, Práticas Gerenciais, Lógica de Programação) disputam os mesmos 6 trechos (`api\index.py:1006`).
- **ANTES:** `match_ementas(query_embedding, match_count)` não aceita filtro (`supabase-backup\recriar-banco.sql:31-53`).
- **MUDANÇA:**
  - Função nova `match_ementas_fontes(query_embedding, match_count, fontes text[] default null)`, mantendo a antiga.
  - Parâmetro opcional `fontes` em Perguntar, Buscar, Aprender, Resolver e Glossário.
  - `GET /api/fontes` público com a lista distinta; os nomes já aparecem em toda resposta.
  - Seletor "Material: todos / X".
- **POR QUE:** o aluno que estuda uma disciplina não recebe trecho de outra.
- **DEPOIS:** contexto de uma única apostila quando o aluno pede.
- **BENEFÍCIO:** relevância maior sem custo de IA.
- **CUSTO/CONSEQUÊNCIA:** 6 a 10 h (Estimativa — precisa ser validada). Custo recorrente zero.
- **RISCO QUE CRIA:** com índice HNSW e filtro, a busca aproximada pode devolver menos que `match_count` linhas (comportamento de filtro depois do índice no pgvector, NÃO VERIFICADO para a versão instalada). Com 526 linhas, a consulta filtrada pode usar busca exata.
- **COMO IMPLEMENTAR:** migração nova, `api\index.py` (`buscar_chunks` e modelos), abas, `lib\api.ts`.
- **COMO MEDIR:** no conjunto de referência por apostila, hit@6 com filtro maior ou igual ao sem filtro; uso do seletor nos logs.
- **ALTERNATIVAS CONSIDERADAS:** só remover documentos alheios (A3-13), que não separa disciplinas legítimas; um índice por curso (mais tabelas, sem ganho nesta escala).
- **PRIORIDADE:** PRÓXIMO
- **IMPACTO x ESFORÇO:** médio x médio

### A3-21 — Revisão com flashcards a partir do glossário salvo
- **RESOLVE:** os termos gerados viram lista parada, sem prática de recuperação. O glossário guarda termo, explicação e exemplos (`glossario_termos`; 44 termos no dump de 10/09, segundo A1-02), mas a aba só lista e busca (`components\tabs\GlossarioTab.tsx:95-134`).
- **ANTES:** não há modo de revisão.
- **MUDANÇA:**
  - Modo "Revisar": cartão com o termo, depois explicação e exemplos, depois "sabia" ou "não sabia".
  - Caixas de Leitner (3 níveis) em localStorage.
  - Dados de `/api/glossario/termos`, que já é público.
- **POR QUE:** reaproveita um dado pronto para uma atividade de estudo.
- **DEPOIS:** o aluno revisa termos com repetição.
- **BENEFÍCIO:** estudo ativo sem custo de IA.
- **CUSTO/CONSEQUÊNCIA:** 4 a 8 h (Estimativa — precisa ser validada). Custo recorrente: 1 leitura do Supabase por sessão.
- **RISCO QUE CRIA:** um termo errado gerado por IA vira memorização errada; mostrar a origem e permitir esconder localmente. O glossário é compartilhado entre todos os alunos.
- **COMO IMPLEMENTAR:** `lib\flashcards.ts`, `components\tabs\GlossarioTab.tsx`, com teste JS da lógica de caixas.
- **COMO MEDIR:** cartões revisados mostrados ao próprio aluno; no servidor, leituras de `/api/glossario/termos` nos logs.
- **ALTERNATIVAS CONSIDERADAS:** simulado gerado por IA (A3-23, com custo recorrente); exportar para Anki (formato de importação NÃO VERIFICADO).
- **PRIORIDADE:** DEPOIS
- **IMPACTO x ESFORÇO:** médio x baixo

### A3-22 — Retorno do aluno sobre a resposta (útil, não útil, citação errada)
- **RESOLVE:** critérios de sucesso AUSENTE.
  - `lib\accuracy.ts` mostra a intenção de medir acerto, mas o dado fica preso em cada navegador.
  - Os modelos são ordenados por latência, e o próprio projeto registra que latência não prevê qualidade (`CORRECOES` §8, "Limite honesto").
- **ANTES:** não há sinal de qualidade no servidor.
- **MUDANÇA:**
  - `POST /api/feedback` com `{rota, provider, modelo, util, motivo, confianca_media, n_nao_apoiadas, n_citacoes_fora}`, sem o texto da pergunta por padrão.
  - Tabela `feedback_respostas` com RLS e sem política; escrita pela `service_role`; balde de cota próprio.
  - Enviar também o "acertou/errou" do Resolver.
- **POR QUE:** permite escolher o modelo padrão e o modo por qualidade observada.
- **DEPOIS:** taxa de "útil" por modelo e por modo.
- **BENEFÍCIO:** a primeira métrica de resultado do produto.
- **CUSTO/CONSEQUÊNCIA:** 6 a 10 h (Estimativa — precisa ser validada). Custo recorrente: 1 insert por clique.
- **RISCO QUE CRIA:** viés (quem clica é quem se irrita); spam; LGPD, porque mesmo sem texto é dado de uso ligado a hash de IP (restrições AUSENTE). Exige aviso na interface.
- **COMO IMPLEMENTAR:** migração nova, `api\index.py`, `components\tabs\PerguntarTab.tsx`, `ResolverTab.tsx`.
- **COMO MEDIR:** número mínimo de avaliações por modelo antes de reordenar a lista.
- **ALTERNATIVAS CONSIDERADAS:** formulário externo (zero código, dado desligado da resposta).
- **PRIORIDADE:** DEPOIS (PRÓXIMO se o app for aberto com muitos alunos)
- **IMPACTO x ESFORÇO:** médio x médio

### 2.5 Features especulativas (valor incerto ou custo/risco alto)

### A3-23 — Simulado gerado a partir do material, com revisão dos erros
- **RESOLVE:** há indício de demanda por prática, mas não medida:
  - o Resolver tem modo lote ("cole várias questões", `components\tabs\ResolverTab.tsx:380-383`) e contador de acurácia;
  - "Testar entendimento" gera 1 ou 2 perguntas abertas (`components\tabs\PerguntarTab.tsx:131-159`);
  - não há questão gerada do material com gabarito e citação.
- **ANTES:** o aluno precisa trazer as próprias questões.
- **MUDANÇA:**
  - `POST /api/simulado {tema, n <= 5, fontes?}`: busca 8 trechos e faz 1 chamada de LLM em JSON (enunciado, alternativas, gabarito, fonte e página por questão).
  - Descartar a questão cuja citação não esteja no contexto (A3-17).
  - O front reaproveita os componentes do Resolver; os erros vão para uma fila local de revisão.
- **POR QUE:** prática ancorada no material.
- **DEPOIS:** simulados curtos por tema.
- **BENEFÍCIO:** estudo ativo com gabarito citado.
- **CUSTO/CONSEQUÊNCIA:** 16 a 30 h (Estimativa — precisa ser validada). Custo recorrente: 1 LLM, 1 embedding e 1 RPC por simulado.
- **RISCO QUE CRIA:** **gabarito errado ensina errado**, o maior risco pedagógico entre as propostas. JSON longo estoura o tempo em modelos lentos (A3-06).
- **COMO IMPLEMENTAR:** `api\index.py`, `api\_app\prompts.py`, componente novo reaproveitando o Resolver.
- **COMO MEDIR:** proporção de questões descartadas pela validação; relatos de gabarito errado (A3-22).
- **ALTERNATIVAS CONSIDERADAS:** flashcards (A3-21); banco de questões escrito pelo professor (mais confiável, custo humano).
- **PRIORIDADE:** DEPOIS
- **IMPACTO x ESFORÇO:** incerto x alto

### A3-24 — Abrir a página citada do PDF
- **RESOLVE:** o aluno vê só 3 linhas do trecho (`components\EvidenceList.tsx:69`, `line-clamp-3`) e não confere a página no original.
- **ANTES:** não há acesso ao documento.
- **MUDANÇA:**
  - Passo 1, custo zero: "ver trecho completo" (tirar o corte de linhas sob demanda).
  - Passo 2: `POST /api/documento/link {fonte}` gera uma URL assinada de curta duração do bucket privado (recurso do Supabase Storage NÃO VERIFICADO nesta análise), aberta com o pdf.js (já é dependência) na página N.
- **POR QUE:** fecha o ciclo "citou, conferi".
- **DEPOIS:** um clique leva à página citada.
- **BENEFÍCIO:** confiança verificável.
- **CUSTO/CONSEQUÊNCIA:** passo 1 em 1 h; passo 2 em 8 a 12 h (Estimativa — precisa ser validada). Custo recorrente: tráfego de saída do Storage por visualização (preço NÃO VERIFICADO).
- **RISCO QUE CRIA:** 73% dos trechos apontam para arquivo ausente (link quebrado até A3-13). Expõe o material a quem tiver a URL do app, e o bucket é privado de propósito (`api\index.py:261-266`). Direitos autorais AUSENTE.
- **COMO IMPLEMENTAR:** `components\EvidenceList.tsx`, rota nova, `lib\api.ts`.
- **COMO MEDIR:** cliques em "ver página" por resposta exibida.
- **ALTERNATIVAS CONSIDERADAS:** só o passo 1, recomendado já.
- **PRIORIDADE:** passo 1 PRÓXIMO; passo 2 DEPOIS
- **IMPACTO x ESFORÇO:** médio x baixo (passo 1) / médio x médio (passo 2)

### 2.6 Como a recomendação muda conforme o cenário (parte E)

| Decisão | Turma pequena, URL só para a turma, sem orçamento, 1 mantenedor | App aberto na internet | Uso institucional (várias turmas, LGPD formal) |
|---|---|---|---|
| A3-03 (limites de entrada) | AGORA | AGORA | AGORA |
| Limite por minuto por IP | **Subir por ambiente**: 30 alunos atrás do mesmo NAT, com auditoria automática, passam de 20/min | Manter ou baixar | Trocar por cota por usuário autenticado |
| A3-11 (cota por custo) | PRÓXIMO | **AGORA** | Substituída por cota por usuário |
| Regra de rate limit no WAF da Vercel | Opcional | **AGORA** (configuração, sem código) | AGORA |
| Código de acesso da turma (§3.2) | Desnecessário | Recomendado | Substituído por autenticação |
| A3-10 (logs) | Sem texto da pergunta | Idem | Política de retenção formal |
| A3-22 (retorno do aluno) | DEPOIS | PRÓXIMO | Só com base legal e termo de uso |
| Abas fora de estudo (§3.5) | Indiferente | Ocultar por flag (menos superfície e gasto) | Tirar do deploy institucional |
| A3-24 passo 2 (abrir PDF) | DEPOIS | Não fazer (expõe apostilas) | Depende de direitos autorais |
| A3-15 (dividir `index.py`) | Não fazer | DEPOIS | PRÓXIMO (mais de uma pessoa mantendo) |

Se houver orçamento para o plano Pro da Vercel, a documentação (verificada) indica 40 regras de rate limit por projeto e duração máxima de 800 s. Isso amplia as alternativas de §3.1 e §3.2, mas não elimina A3-06.

---

## 3. Alternativas estratégicas

### 3.1 Orçamento de tempo

| Caminho | Ganho | Perda | Risco | Custo |
|---|---|---|---|---|
| (a) Prazo por requisição dentro de 60 s (A3-06) | Erros claros; nenhuma chamada paga sem resposta | Modelos lentos e resumos grandes continuam falhando, agora com mensagem | Calibrar `RESERVA_REDUCE` | 6 a 10 h |
| (b) Subir `maxDuration` para até 300 s, com (a) e prazos menores por rota (ex.: 90 s em Perguntar) | Resumos e modelos lentos completam | Aluno espera mais; a promessa de cerca de 1 s no primeiro texto não muda | Documentação (verificada): com Fluid compute, Hobby tem padrão e máximo de 300 s. **Não sei se o projeto usa Fluid compute (NÃO VERIFICADO)**. No Pro há cobrança por memória provisionada (preço NÃO VERIFICADO) | 1 linha no `vercel.json`, mais `MAX_DURACAO_FUNCAO` |
| (c) Resumo em etapas chamadas pelo cliente, como a ingestão | Robusto a qualquer limite | Mais UI e mais requisições | Estado no cliente, como na ingestão hoje | 10 a 16 h |

**Recomendação:** (a) agora. (b) só depois de confirmar Fluid compute no painel e com (a) no lugar, porque sem prazo por requisição o aluno esperaria até 5 minutos. (c) só se os logs mostrarem resumos cortados mesmo com (b).

### 3.2 Acesso e controle de custo

| Caminho | Ganho | Perda | Risco | Custo |
|---|---|---|---|---|
| (a) Limites por custo (A3-03 e A3-11) | Custo proporcional | Não impede muitos IPs | Calibração | 10 a 16 h |
| (b) Rate limit no WAF da Vercel | Barra rajadas antes da função, sem código | Conta requisições, não custo | Hobby (verificado): 1 regra, chaves IP e JA4, janela de 10 s a 10 min, 1.000.000 requisições permitidas incluídas; contadores por região | Configuração |
| (c) Código de acesso da turma (variável de ambiente, pedido uma vez, enviado em header nas rotas de IA) | Fecha o app para quem não é da turma | Código vaza; troca manual | Baixo | 3 a 5 h (Estimativa) |
| (d) Autenticação de alunos (Supabase Auth) | Cota e histórico por pessoa | Cadastro, suporte a senha, LGPD | Alto para 1 mantenedor | Dias (Estimativa) |

**Recomendação:** (a) sempre. Adicionar (b) e (c) no cenário "app aberto". (d) só no institucional.

### 3.3 Consistência da ingestão

| Caminho | Ganho | Perda | Risco | Custo |
|---|---|---|---|---|
| (a) A3-04 agora e A3-12 depois | Incremental, migração aditiva | Troca não atômica | Execuções concorrentes | 12 a 18 h |
| (b) Tabela de preparação e troca numa RPC transacional | Atômico | Mais SQL; embeddings trafegam pela RPC | Tamanho do payload | 16 a 24 h (Estimativa) |
| (c) Ingestão só por script local (`scripts\reimportar_chunks.py`) e interface só de consulta | Menos código em produção | Admin precisa de `.env` e Python local | Segredo na máquina do admin | 4 a 6 h |

**Recomendação:** (a). Com 5 documentos e 1 admin, a atomicidade de (b) não compensa o SQL extra.

### 3.4 PDF do Gerador
Tradução para Latin-1 (A3-02) agora; fonte TTF só se houver reclamação de "?". Detalhes na proposta.

### 3.5 Abas fora do estudo (Perfis, Elenco, Suporte TI)

| Caminho | Ganho | Perda | Custo |
|---|---|---|---|
| (a) Manter | Nada muda | Dividem cota, chaves e superfície de abuso | 0 |
| (b) Variável `ABAS_ATIVAS` lida por `/api/config`; o front esconde e o backend responde 404 | Cada deploy liga só o que o público usa | Um pouco mais de configuração | 2 a 4 h (Estimativa) |
| (c) Remover | Menos código | Perde algo que o dono pode usar por motivo desconhecido | 1 a 2 h |

**Recomendação:** (b), e só depois de o dono confirmar para quem essas abas existem (AUSENTE).

---

## 4. O que NÃO fazer

| Mudança tentadora | Por que rejeito |
|---|---|
| Migrar para o Next 16 agora para zerar o `npm audit` | A1-22 é BAIXO: a postcss roda no build sobre o CSS do próprio projeto (inferência do A1). A correção sugerida pelo npm é uma mudança incompatível. Primeiro testar o `overrides` (A3-08) |
| Reescrever o backend em Node/TypeScript ou trocar o FastAPI | Os defeitos são locais e corrigíveis. Há 145 testes Python que se perderiam. Nenhum achado aponta limite da stack |
| Autenticação completa de alunos | Público, número de usuários e LGPD são AUSENTES. Custo alto para 1 mantenedor. Código de turma (§3.2c) cobre o meio-termo |
| Trocar pgvector por banco vetorial dedicado | 526 trechos. Nenhuma evidência de problema de escala. Adicionaria serviço e custo |
| Trocar o gte-small por embeddings pagos | Não há medida de que a recuperação seja o gargalo. Exigiria reembutir tudo e criaria custo recorrente. Medir antes (A3-14) |
| Reranker com LLM, agentes ou frameworks de orquestração | Chamadas e latência a mais dentro de um orçamento de 60 s que já não fecha (A1-05, A1-13) |
| Fila ou worker para a ingestão | 5 documentos e 1 admin. A ingestão em lotes já contorna o limite |
| Subir `maxDuration` **sem** prazo por requisição | Esconde o defeito e faz o aluno esperar até 5 minutos por um erro |
| "Auditoria com LLM-juiz" | Uma chamada por resposta ou por frase. O problema atual é de normalização (A1-09), não de método |
| Cache de respostas | Poucos usuários (inferido), risco de resposta velha após reindexar, sem dado de repetição |
| Sentry ou Datadog antes dos logs estruturados | Fornecedor e custo novos. A3-10 resolve o básico de graça |
| Dividir `index.py` antes das correções | Os 50 `monkeypatch.setattr` deixariam de interceptar I/O. Risco sem ganho imediato (A3-15) |
| Busca na web ou "conhecimento geral" como fonte extra | Contraria o objetivo de resposta fundamentada no material |
| Tirar as abas Perfis, Elenco e Suporte sem saber por que existem | O motivo é AUSENTE. Uma flag (§3.5b) resolve sem perder nada |
| Matriz de CI com Python 3.11 (A1-15) | A Vercel só oferece 3.12, 3.13 e 3.14 (verificado). Testaria uma versão que a produção não usa |

---

## 5. Oportunidades não consideradas pelo projeto

1. **Métricas de uso de graça.**
   - Evidência: `cota_uso` (`2026-09-16-cota-de-uso.sql`) já conta uso por IP (em hash) e global por janela.
   - Uso: painel do admin (A3-19) e calibração dos limites.
2. **Proteção de borda sem código.**
   - Evidência: a documentação da Vercel (verificada) inclui 1 regra de rate limit no Hobby, com chave por IP ou JA4.
   - Uso: cenário "app aberto" (§3.2b).
3. **Um caminho de restauração que já evita o A1-02.**
   - Evidência: `scripts\reimportar_chunks.py` reinsere sem enviar id e sem reembutir (A1-02 e `CORRECOES` §7).
   - Uso: torná-lo o caminho documentado (A3-09).
4. **Citações conferíveis sem IA.**
   - Evidência: `montar_contexto` usa o formato fixo `[Fonte: X, página N]` (`api\_app\documentos.py:64`).
   - Uso: A3-17.
5. **Menos idas ao banco na auditoria.**
   - Evidência: 1 RPC por frase (`api\index.py:1391`).
   - Uso: uma função SQL que receba vários vetores e devolva tudo numa ida. Só vale se os logs (A3-10) mostrarem a auditoria lenta.
6. **Trecho completo antes de abrir o PDF.**
   - Evidência: `components\EvidenceList.tsx:69` corta o trecho em 3 linhas.
   - Uso: "ver trecho completo" custa cerca de 1 h e ajuda a conferir a citação (A3-24, passo 1).
7. **Acurácia por modelo no Resolver, só no navegador.**
   - Evidência: `lib\accuracy.ts` guarda um contador único (`resolver_acuracia_v1`), sem separar por modelo, e a aba já sabe `provider` e `modelo`.
   - Uso: guardar por modelo e mostrar "este modelo acertou X de Y com você". Ajuda a escolher modelo sem backend. Cerca de 1 a 2 h (Estimativa).
8. **Limitar a saída do modelo do jeito certo em cada provedor.**
   - Evidência: na referência da API da Groq (verificada), `max_tokens` está depreciado a favor de `max_completion_tokens`. Nos outros provedores, NÃO VERIFICADO.
   - Uso: se A1-05 ou A1-01 levarem a limitar a saída, criar um campo por provedor em `PROVIDERS` com o nome do parâmetro e validar com `scripts\medir_latencia.sh`.
9. **Uma versão de Python sem discussão.**
   - Evidência: a Vercel usa 3.12 por padrão e o projeto não declara versão (FATO, listagem da raiz).
   - Uso: inferência de que a produção já roda 3.12; A3-08 só oficializa.

---

## 6. Autocrítica

**A3-06 (prazo único por requisição)**
- **Em que circunstância estaria errada?**
  - Se o projeto usar Fluid compute e o dono aceitar subir `maxDuration` para 300 s. Nesse caso o corte pela plataforma fica raro, e A3-05 (preservar o parcial) daria quase todo o ganho com menos código.
  - Se os modelos usados forem sempre rápidos (a lista anota 1 a 5 s na maioria). A falha seria rara e o ganho, pequeno.
- **Que evidência me faria mudar?**
  - Logs (A3-10) com taxa de 504 `FUNCTION_INVOCATION_TIMEOUT` perto de zero por algumas semanas.
  - Confirmação no painel da Vercel de Fluid compute ativo, com o dono aceitando esperas maiores.

**A3-11 (cota proporcional ao custo)**
- **Em que circunstância estaria errada?**
  - Se todas as chaves forem de planos gratuitos com teto rígido no provedor. O risco vira só de disponibilidade, e um WAF mais uma cota global menor resolveriam com menos esforço.
  - Se o app for usado só por uma turma fechada: o abuso seria improvável e o custo real, desprezível.
- **Que evidência me faria mudar?**
  - Painéis dos provedores mostrando gasto zero ou teto configurado.
  - Logs sem IP perto dos limites.
  - Confirmação de que a URL não é pública.

**A3-12 (ingestão idempotente por execução)**
- **Em que circunstância estaria errada?**
  - Se a ingestão for rara (5 documentos, poucas reindexações por semestre) e o admin sempre conferir o painel depois. As correções de fluxo de A3-04 bastariam, e uma migração na tabela principal seria risco desnecessário.
  - Se a restauração sempre usar `reimportar_chunks.py`: a parte do A1-02 deixa de existir.
- **Que evidência me faria mudar?**
  - Histórico de ingestões sem falha transitória do Supabase.
  - O Agente 2 refutar A1-06 (por exemplo, mostrando que a retentativa não duplica na prática).
  - O dono confirmar que a ingestão é feita uma vez por semestre, com backup antes.

---

## Anexo A — Achados novos durante o desenho das propostas (para o Agente 2 verificar)

| # | Achado | Evidência | Situação |
|---|---|---|---|
| N1 | `tests\test_admin_auth.py:22-23` define `ADMIN_USER` igual ao nome do dono do repositório citado em `PROJECT.md` e um `ADMIN_PASS` com aparência de senha real (valor não reproduzido) | Leitura do arquivo | FATO que o literal existe. INFERÊNCIA que possa ser a credencial real. Se for, trocar na Vercel (A3-08) |
| N2 | `_RE_ALTERNATIVA` trata uma linha do enunciado que começa com "E-commerce" como alternativa E | Executado em memória: `'Considere o cenário:\nE-commerce cresce no Brasil.\nQual o motivo?\nA) um\nB) dois'` virou alternativa E = "commerce cresce no Brasil.\nQual o motivo?" | FATO executado; amplia A1-03 |
| N3 | A documentação da Vercel diz que a duração máxima inclui respostas em streaming; com Fluid compute, Hobby tem padrão e máximo de 300 s | Documentação oficial (Fontes) | FATO de documentação. Confirma a premissa do A1-05. `maxDuration: 60` é escolha do projeto, se ele usar Fluid compute (NÃO VERIFICADO) |
| N4 | A Vercel oferece Python 3.12 (padrão), 3.13 e 3.14. O projeto não declara versão e o script local usa 3.11 | Documentação oficial; listagem da raiz | FATO. INFERÊNCIA: a produção roda 3.12 |
| N5 | O prompt da pergunta manda completar com conhecimento geral, mas a auditoria rotula frase sem apoio como "a IA pode ter inventado" | `api\_app\prompts.py:4-11`; `components\RespostaAuditada.tsx:22` | FATO. É conflito de produto, não defeito de código |
| N6 | `/api/perguntar` (sem stream), usado por "responder verificação", devolve a resposta sem `limpar_resposta` | `api\index.py:1033` | FATO de código |
| N7 | `LIMITE_LLM_POR_MINUTO` não pode ser ajustado por ambiente, ao contrário dos tetos diários | `api\index.py:173-176` | FATO de código. Relevante para turmas atrás de NAT (A1-16) |
| N8 | `mensagemDe` não trata `detail` em lista: um 422 do FastAPI aparece como JSON cru | `lib\api.ts:52-69` | FATO de código. Vira visível com A3-03 |
| N9 | `limpar_resposta` não remove `<thinking>...</thinking>`, embora `api\_app\provedores.py:81` diga que o dots-studio emite `<thinking>` "removido na limpeza". Um `<think>` sem fechamento deixa o raciocínio visível | Executado: `limpar_resposta('<thinking>raciocinio interno</thinking>Resposta final')` devolve o texto inalterado | FATO executado |
| N10 | `scripts\saude_dos_pdfs.py` importa `psutil`, que não está em `requirements-dev.txt` | Leitura dos arquivos | FATO. Menor |
| N11 | A verificação de RLS documentada (DELETE com a chave anon contra produção) apaga dados exatamente quando a proteção está ausente | `CORRECOES-2026-09-10.md:184-188` | INFERÊNCIA de risco de procedimento; a alternativa só de leitura está em A3-09 |

## Anexo B — Pontos em que divirjo da correção sugerida pelo Agente 1

| Achado | Sugestão do A1 | Minha posição | Evidência |
|---|---|---|---|
| A1-15 | CI em matriz 3.11/3.12, ou unificar | Unificar em 3.12, sem matriz | Vercel só oferece 3.12 a 3.14 (verificado) |
| A1-13 | Limitar a concorrência com semáforo | Limitar por tempo (`asyncio.wait` com prazo) e reduzir o número de trechos | Com prazo fixo, semáforo só alonga o tempo total |
| A1-04 | Registrar fonte TTF como correção principal | Tradução para Latin-1 primeiro; TTF opcional | Os dois caminhos geram PDF (executado); TTF soma cerca de 1,46 MB e licença |
| A1-20 | Verificar por contagem antes e depois de um DELETE | Consultas só de leitura ao catálogo | O DELETE apaga dados se a proteção faltar |
| A1-14 (alternativa) | Supabase Auth para o admin | Limitador por IP e comparação em bytes | Um único admin; fluxo novo sem ganho proporcional |
| A1-05 (alternativa) | Limitar `max_tokens` | Só com parâmetro por provedor e testado | Groq deprecia `max_tokens` (verificado); demais NÃO VERIFICADO |

Os pontos concordantes com o A1 (setval, `except httpx.HTTPError`, `compare_digest` em bytes, deduplicação do glossário, âncora da regex) estão incorporados nas propostas.

---

## Arquivos relevantes (caminhos absolutos)

- `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\api\index.py`
- `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\api\rag_core.py`
- `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\api\_app\provedores.py`
- `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\api\_app\http_util.py`
- `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\api\_app\documentos.py`
- `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\api\_app\prompts.py`
- `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\lib\api.ts`
- `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\lib\texto.ts`
- `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\lib\useHistorico.ts`
- `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\lib\useProviderModel.ts`
- `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\lib\accuracy.ts`
- `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\app\page.tsx`
- `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\components\tabs\PerguntarTab.tsx`
- `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\components\tabs\PdfsTab.tsx`
- `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\components\tabs\GlossarioTab.tsx`
- `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\components\tabs\ResolverTab.tsx`
- `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\components\RespostaAuditada.tsx`
- `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\components\EvidenceList.tsx`
- `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\components\ProviderSelect.tsx`
- `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\supabase-backup\recriar-banco.sql`
- `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\supabase-backup\migracoes\2026-09-16-cota-de-uso.sql`
- `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\README-BACKUP.md`
- `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\CORRECOES-2026-09-10.md`
- `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\requirements.txt`
- `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\vercel.json`
- `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\iniciar-tudo.bat`
- `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\.env.example`
- `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\tests\test_rag_core.py`
- `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\tests\test_ingerir_lotes.py`
- `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\tests\test_limite_e_sessao.py`
- `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\tests\test_admin_auth.py`
- `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main\tests-js\api-stream.test.ts`

## Fontes

- [Vercel — Using the Python Runtime with Vercel Functions](https://vercel.com/docs/functions/runtimes/python)
- [Vercel — Configuring Maximum Duration for Vercel Functions](https://vercel.com/docs/functions/configuring-functions/duration)
- [Vercel — Vercel Functions Limits](https://vercel.com/docs/functions/limitations)
- [Vercel — WAF Rate Limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)
- [PostgREST — URL Grammar (caracteres reservados)](https://docs.postgrest.org/en/stable/references/api/url_grammar.html)
- [Groq — API Reference (chat completions)](https://console.groq.com/docs/api-reference)
