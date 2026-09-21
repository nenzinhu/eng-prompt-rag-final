# Verificação de bugs — 2026-09-20 21:49

Agente: VERIFICAÇÃO DE BUGS (apenas leitura). Base: `00-dossie.md` + `MEMORY.md` +
leitura completa de `api/index.py`, `api/rag_core.py`, `api/_app/documentos.py`,
`api/_app/provedores.py`, `api/_app/http_util.py`, `lib/api.ts`, `lib/ocr.ts`,
`lib/texto.ts`, `lib/documento.ts`, `lib/ingestao.ts`, `lib/admin.ts`, e dos
componentes `AnexoImagem.tsx`, `EvidenceList.tsx`, `TrechoNoContexto.tsx`,
`AdminToken.tsx`, `TabPanel.tsx`, `PdfsTab.tsx`, `PerguntarTab.tsx`, `ResolverTab.tsx`,
`AprenderTab.tsx`.

**Estado da suíte no momento desta análise:**
- `python -m pytest -q` → **309 passed**, 0 falhas.
- `npm run test:js` (node --test) → **82/82 passed**.
- `ruff check .` → **limpo** ("All checks passed!").
- `npx tsc --noEmit` → **sem erros**.

Nenhum dos achados abaixo é pego pelos testes automatizados atuais.

---

## 1. Conferência das 3 regressões que o MEMORY.md alega ter corrigido (20/09)

Todas as três foram **verificadas linha a linha no código atual e estão CORRIGIDAS**:

1. **`GET /api/trecho` sem limite** — `api/index.py:1137-1150`: a rota recebe
   `request: Request` e chama `await _limitar_leitura(request)` logo no início, com
   balde próprio (`_leituras_por_ip`, `LIMITE_LEITURA_POR_MINUTO`,
   `LIMITE_LEITURA_POR_DIA_IP`). **Confirmado corrigido.**
2. **`.pptx` podendo cair com 500** — `api/_app/documentos.py:84-115`
   (`_texto_da_forma`): o teste de grupo agora é `hasattr(forma, "shapes")` (não
   toca em `shape_type`), e cada ramo está dentro de um `try/except Exception` que
   devolve lista vazia em vez de propagar. **Confirmado corrigido** — testado
   também via `tests/test_extrair_paginas_formatos.py`, que passa.
3. **Tabelas do `.docx` indo para a última página** —
   `api/_app/documentos.py:19-49` (`_extrair_paginas_docx` + `_blocos_do_corpo`):
   percorre `documento.element.body` na ordem real (`w:p` e `w:tbl` intercalados) e
   anexa cada tabela à página (`paginas[-1]`) que está aberta *naquele ponto* do
   documento, não ao final. **Confirmado corrigido.**

---

## 2. Bugs confirmados (ainda presentes / novos)

Nenhum é CRÍTICO. Os mais graves são MÉDIO.

### B1 — MÉDIO — Desmontar um `AnexoImagem` mata o OCR de outro que está lendo
**Onde:** `components/AnexoImagem.tsx:106-111` + `lib/ocr.ts:34,100-114,138-146`.
O worker do tesseract é **global do módulo** (`workerPromessa`, `leiturasEmAndamento`
em `lib/ocr.ts`). `encerrarWorker()` chama `worker.terminate()` **sem checar**
`leiturasEmAndamento` — só o agendamento por ociosidade respeita o contador; o
`useEffect` de desmonte em `AnexoImagem.tsx:106-111` chama `encerrarWorker()`
incondicionalmente. Como `TabPanel.tsx` mantém abas já visitadas montadas (só
`AprenderTab` já tem **dois** `AnexoImagem` simultâneos — linhas 164 e 269, e o
segundo desmonta ao clicar "Recomeçar" ou pedir nova explicação), desmontar
qualquer instância em qualquer aba já visitada derruba o OCR que outra esteja
processando, sem mensagem de erro clara para quem estava lendo.
**Reprodução:** aba Aprender → gerar explicação (monta o 2º AnexoImagem) → anexar
foto no campo de "explique com suas palavras" → enquanto lê, clicar "Recomeçar".
O anexo em leitura vira `status: 'erro'` sem causa aparente na tela.

### B2 — MÉDIO — `pergunta`/`historico` (`/api/perguntar`) e `query` (`/api/buscar`) sem teto de tamanho
**Onde:** `api/index.py:1443-1450` (`PerguntaReq`) e `api/index.py:1080-1082`
(`BuscarReq`). Nenhum `max_length` no Pydantic, nenhuma checagem manual antes de
`gerar_embeddings`. `_turnos_recentes` corta o que entra no PROMPT, mas não impede
o corpo de ser recebido/validado por inteiro. Diferente de outras rotas do projeto
(ex.: `/api/fale-o-que-pensa`), que já aplicam teto — o padrão existe no código mas
não foi replicado aqui.
**Reprodução:** `POST /api/perguntar` com `pergunta` de várias centenas de KB —
consome CPU/memória de parsing e pode estourar o provedor de embeddings sem que o
teto por minuto/dia barre isso (é 1 requisição só).

### B3 — BAIXO — `MAX_CHARS_TRECHO` é aplicado por página, não por requisição
**Onde:** `api/index.py:1108` (comentário: `# teto do que a rota devolve, por
requisição`) vs `api/index.py:1199`, onde o corte `[:MAX_CHARS_TRECHO]` está dentro
de uma list-comprehension por página. Com `vizinhas=True` (padrão) são até 3
páginas → até 36.000 caracteres por chamada, não 12.000 como o comentário diz.
Não é mais uma falha de segurança grave (a rota já tem `_limitar_leitura`), mas o
comentário está errado e o volume por chamada é 3x o anunciado.

### B4 — BAIXO — Página duplicada em `/api/trecho` gera `key` React repetida
**Onde:** `api/index.py:1187-1193` agrupa comparando só com a **última** página
vista (`paginas[-1]["pagina"] == numero`). Se os chunks de uma mesma página não
forem contíguos em `id.asc` (acontece após reingestão parcial, quando trechos
novos ganham ids acima dos antigos), a mesma página aparece duas vezes na lista
devolvida. `components/TrechoNoContexto.tsx:65` usa
`key={p.pagina ?? 'unica'}` — chave duplicada, warning do React e possível
reconciliação errada na tela "ver no contexto".

### B5 — BAIXO — `formatarAlternativas` não separa alternativas sem texto
**Onde:** `lib/texto.ts:24` — a regex consome o espaço logo após `)`, então em
"Qual? A) B) C)" o "B)" perde o espaço que o precederia e não casa mais no ponto
certo. Verificado em execução: `formatarAlternativas("Qual? A) B) C)")` devolve o
texto **intacto**, sem separar as alternativas. Caso de borda (gabarito colado sem
texto nas alternativas), impacto baixo.

### B6 — BAIXO — Linha tripla em branco no meio do enunciado colado parte a questão em duas (modo lote)
**Onde:** `lib/texto.ts:47-57` (`formatarAlternativas`) + `lib/texto.ts:79-84`
(`dividirQuestoes`). Verificado em execução:
`formatarAlternativas("Enunciado\n\n\ncontinua A) x B) y")` →
`"Enunciado\n\n\ncontinua\n\nA) x\n\nB) y"`; `dividirQuestoes` (que corta em
`/\n[ \t]*\n[ \t]*\n+/`) separa isso em `["Enunciado", "continua\n\nA) x\n\nB) y"]`.
Só afeta texto **colado** (o de OCR/documento já normaliza `\n{3,}`→`\n\n` em
`AnexoImagem.tsx:137`), mas colar é o caminho mais usado do modo lote em
`ResolverTab.tsx`.

### B7 — BAIXO — `analisarLote` (Resolver, modo lote) sem teto de questões e sem cancelamento
**Onde:** `components/tabs/ResolverTab.tsx:109-128`. O laço processa
`dividirQuestoes(textoLote)` inteiro, uma chamada `api.resolver` por questão, sem
limite de quantidade e sem `AbortController` (diferente de `PerguntarTab.tsx`, que
tem `cancelarRef`/`rodadaAtualRef`). Colar dezenas de questões dispara todas as
chamadas em sequência sem forma de interromper pela UI — o único recurso é
recarregar a página. Ao bater no limite por minuto do backend, a tela acumula uma
sequência de erros 429 sem parar o laço.

### B8 — BAIXO — Cliente HTTP compartilhado trocado sem `aclose()`
**Onde:** `api/_app/http_util.py:39-45`. Quando o event loop muda, um novo
`httpx.AsyncClient` é criado e o anterior é só descartado (sem
`await cliente.aclose()`), deixando conexões do pool antigo penduradas até o GC.
Em produção o loop é estável (impacto baixo); aparece nos testes, que rodam cada
caso em seu próprio `asyncio.run`.

---

## 3. Suspeitas (não confirmadas 100%)

- **S1 — `EvidenceList.tsx:38-53`: fechar e reabrir rápido pode deixar o painel
  "aberto" sem conteúdo visível.** O tween de fechamento agenda
  `onComplete: () => setRendered(false)` para 300 ms à frente; sem
  `gsap.killTweensOf` nem cleanup no efeito, se o usuário reabrir dentro desse
  intervalo o callback antigo ainda dispara e desmonta o painel com `open` já
  `true` de novo. Não cheguei a reproduzir em runtime (só leitura de código), por
  isso fica como suspeita, não bug confirmado.
- **S2 — `lib/api.ts:395-401` (`enviarAoStorage`): `form.append('', file)`.**
  Comparei com o código-fonte publicado do `storage-js` (`uploadToSignedUrl`) e o
  formato bate exatamente (`body.append('cacheControl', ...); body.append('',
  fileBody)`) — **não é bug**, é o formato correto esperado pelo endpoint de
  Storage do Supabase. Mantido aqui só para registrar que foi checado.
- **S3 — `descartados` (`AnexoImagem.tsx:92`) cresce sem poda.** Ids só saem do
  `Set` em `reler`; ao longo de uma sessão longa com muitos anexos removidos, o
  `Set` cresce sem limite — vazamento de memória desprezível na prática (strings
  curtas), mas sem teto.
- **S4 — `_h_documentos()` (`api/index.py:319-326`) cai para `SUPABASE_ANON_KEY`
  quando não há `service_role`.** O comentário diz que o bucket é privado e sem
  política para `anon`; se só a `anon` estiver configurada, chamadas ao Storage
  provavelmente devolvem 401/403 do próprio Supabase (não verificado contra uma
  instância real) — comportamento é "falha visível", não corrupção de dados, por
  isso não confirmo como bug, só como ponto a testar contra o Supabase de
  produção.

---

## 4. Resumo por severidade

| # | Severidade | Onde | O quê |
|---|---|---|---|
| B1 | Médio | `AnexoImagem.tsx:109` / `ocr.ts:100` | desmonte de um anexo encerra o worker de OCR usado por outro em leitura |
| B2 | Médio | `index.py:1443`, `index.py:1080` | `pergunta`/`historico`/`query` sem teto de tamanho |
| B3 | Baixo | `index.py:1108,1199` | teto de caracteres do `/api/trecho` é por página, não por requisição (comentário incorreto) |
| B4 | Baixo | `index.py:1187` | página duplicada em `/api/trecho` → `key` React duplicada |
| B5 | Baixo | `texto.ts:24` | alternativas sem texto ("A) B) C)") não são separadas |
| B6 | Baixo | `texto.ts:47,79` | linha tripla em branco no enunciado colado parte a questão em duas no modo lote |
| B7 | Baixo | `ResolverTab.tsx:109` | lote sem teto de questões e sem cancelamento |
| B8 | Baixo | `http_util.py:39` | cliente HTTP trocado sem `aclose()` ao mudar de event loop |

**Crítico confirmado: nenhum. Alto confirmado: nenhum.**
As 3 regressões que o MEMORY.md alegava ter corrigido (trecho sem limite, .pptx
500, tabelas DOCX na última página) foram conferidas no código atual e **estão
de fato corrigidas**.
