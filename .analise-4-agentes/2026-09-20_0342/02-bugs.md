# Verificação de bugs — 2026-09-20

Base: dossiê `00-dossie.md`. Os bugs B-01..B-27 / S-1..S-3 da rodada de 19/09 foram
conferidos no código e **não** são repetidos aqui. Foco no código novo das duas últimas
rodadas: `/api/trecho`, `_juntar_sem_repetir`, `historico`/`_turnos_recentes`/
`_texto_para_busca`, `tempo_restante_llm` + middleware, `_consumir_cota`/`_hash_ip`/
`_limitar_login`, `_conteudo_da_resposta`, `lib/texto.ts`, `TrechoNoContexto.tsx`,
`EvidenceList.tsx`, `AnexoImagem.tsx`, `lib/ocr.ts`, tabelas DOCX/PPTX.

**Estado da suíte:** `pytest` 304/304 passando, `ruff check` limpo, `npm run test:js`
75/75 passando. Nenhum bug abaixo é pego pelos testes atuais.

**Bug crítico confirmado: NENHUM.** O achado mais grave é ALTO (N-01).

---

## O que foi conferido e está CORRETO (não reportar)

- `tempo_restante_llm` + middleware `marcar_inicio` (api/index.py:210-233): verificado em
  execução — o `request.state.inicio` do `BaseHTTPMiddleware` chega ao handler
  (`scope["state"]`), e `tempo_restante_llm` devolveu 52 s numa requisição limpa. Ordem de
  middleware correta (o `@app.middleware` fica por fora do CORS).
- `iguais_em_tempo_constante` (api/index.py:327): compara bytes UTF-8, tempo constante, sem
  TypeError com acento. OK.
- `_hash_ip` (api/index.py:462): as três variáveis do sal têm default `""`, nunca `None`;
  e a função só é alcançada com `escrita_via_service_role()` verdadeiro. Sem bug.
- `_consumir_cota` / `_limitar_llm` / `_limitar_login` (api/index.py:471-563): o `None` da
  camada compartilhada cai no limite local (falha aberta em `_limitar_llm`, falha aberta no
  login) — é o comportamento documentado e coerente. `MENSAGEM_LIMITE_LOGIN` definida depois
  da função não é bug (uso em tempo de execução).
- `_conteudo_da_resposta` (api/_app/provedores.py:216): cobre corpo não-JSON, `error` em 200,
  `choices` ausente/torto e `content` nulo. Laço de retentativa de `chamar_llm` trata
  `r is None` corretamente (linha 291). OK.
- `_texto_para_busca` / `_turnos_recentes` / `_bloco_conversa` (api/index.py:1397-1443):
  cortes de quantidade e de tamanho aplicados, histórico entra como DADO. OK.
- `nomeParaStorage` (lib/texto.ts:135) × `nome_para_storage` (api/_app/documentos.py:160):
  conferidos caso a caso (nome 100% não-ASCII, base vazia, `.` solto) — resultados idênticos.
- `_juntar_sem_repetir` (api/index.py:1060) × `chunk_texto` (api/rag_core.py:103-107): a
  cauda de sobreposição é colada literalmente (`f"{cauda} {seguinte}"`), então a comparação
  por sufixo/prefixo casa de verdade. Ver ressalva em N-10.
- `semRaciocinio`, `limparTextoOcr`, `SEPARADOR_QUESTAO` vs `\n\n` das alternativas,
  `removerBloco` (regex `\n{separador.length+1,}`): conferidos, coerentes.

---

## Bugs confirmados

### N-01 — ALTO — Ingestão de .pptx quebra com `NotImplementedError` em forma não reconhecida
**Arquivo:** `api/_app/documentos.py:80`
```python
if getattr(forma, "shape_type", None) is not None and hasattr(forma, "shapes"):
```
**Causa:** `getattr(obj, attr, default)` só engole `AttributeError`. `shape_type` é uma
*property*; em `pptx.shapes.autoshape.Shape` ela termina com
`raise NotImplementedError("Shape instance of unrecognized shape type")` quando a forma não é
placeholder, freeform, autoshape nem textbox (e `BaseShape.shape_type` também levanta).
A exceção **propaga** pelo `getattr`, sobe por `_texto_da_forma` →
`_extrair_paginas_pptx` → `extrair_paginas` → `/api/ingerir`, e o arquivo inteiro não é
indexado. Verificado nesta máquina:
- `inspect.getsource(BaseShape.shape_type.fget)` → `raise NotImplementedError(...)`
- `inspect.getsource(Shape.shape_type.fget)` → `raise NotImplementedError("Shape instance of unrecognized shape type")`
- teste com property que levanta `NotImplementedError`: `getattr(A(),'shape_type',None)` → **PROPAGOU**

**Como reproduzir:** subir um .pptx com uma forma de tipo não reconhecido pelo python-pptx
(formas de versões antigas do PowerPoint, OLE/ink, algumas conversões do Google Slides) e
chamar `POST /api/ingerir`. Resposta: 500 com `NotImplementedError`, nenhuma página indexada.
A condição roda para **toda** forma de **todo** slide, então uma única forma estranha derruba
a apostila inteira.

**Observação:** a checagem `shape_type is not None` é redundante para o objetivo declarado —
o que distingue grupo é o `hasattr(forma, "shapes")`.

---

### N-02 — ALTO — `GET /api/trecho` sem cota, sem autenticação e sem teto agregado
**Arquivo:** `api/index.py:1086-1145`
```python
@app.get("/api/trecho")
async def trecho_no_contexto(fonte: str, pagina: Optional[int] = None, vizinhas: bool = True):
```
**Causa:** a assinatura não recebe `request: Request` e não chama `_limitar_llm` (nem
qualquer outro limitador); `/api/buscar`, logo acima (linha 1035), chama. A rota é pública.
Cada chamada faz um `GET` no PostgREST com `limit=60` e devolve até
`MAX_CHARS_TRECHO` **por página** (ver N-10).

**Duas consequências reais:**
1. **Extração do acervo.** Com `fonte` (que qualquer resposta do RAG já revela na citação) e
   `pagina` iterando de 1 a N, dá para baixar o texto indexado inteiro da apostila. Sem
   `pagina`, um único GET devolve os 60 primeiros chunks do documento (~50 mil caracteres).
2. **Custo/DoS no Supabase.** Um laço simples gera leituras ilimitadas no banco; as camadas
   de cota (memória + `consumir_cota`) não são acionadas.

**Como reproduzir:**
`for p in $(seq 1 200); do curl "https://<app>/api/trecho?fonte=<nome.pdf>&pagina=$p"; done`
— nenhum 429 em momento nenhum.

**Nota:** a rota de fato não gasta cota de IA (o docstring está certo nisso); o problema é a
ausência de *qualquer* limite.

---

### N-03 — MÉDIO — `/api/perguntar`, `/api/perguntar/stream` e `/api/buscar` sem teto de tamanho
**Arquivos:** `api/index.py:1387-1394` (`PerguntaReq`), `api/index.py:1029-1038` (`BuscarReq`)
```python
class PerguntaReq(BaseModel):
    pergunta: str                       # sem max_length, sem corte
    historico: list[TurnoConversa] = [] # lista sem teto de itens
```
**Causa:** `req.pergunta` vai direto para `gerar_embeddings([...])` (api/index.py:1461) e para
o prompt do modelo sem nenhum corte. O mesmo com `req.query` em `/api/buscar` (linha 1040).
`_turnos_recentes` corta o que **entra no prompt**, mas não impede o corpo gigante de ser
recebido e validado pelo Pydantic.

**Como reproduzir:** `POST /api/perguntar` com `pergunta` de 500 kB. A Edge Function de
embeddings responde 546 (`WORKER_RESOURCE_LIMIT`); `_embeddings_lote` só divide o lote quando
`len(lote) > 1` — com um texto só ele cai no `raise_for_status()` e vira um 502 genérico.
Com `historico` de 500 turnos, o custo é CPU de parsing no serverless.

**Contexto:** o dossiê lista limites pendentes para `resolver`, `simplificar`, `verificar`,
`aprender/*` e personas. `/api/perguntar` e `/api/buscar` **não** estão nessa lista, e
`/api/fale-o-que-pensa` (linha 1283) mostra que o padrão existe no projeto.

---

### N-04 — MÉDIO — Desmontar um `AnexoImagem` mata o OCR de outro que está lendo
**Arquivos:** `components/AnexoImagem.tsx:106-111`, `lib/ocr.ts:103-117`
```tsx
useEffect(() => {
  return () => {
    for (const a of anexosRef.current) if (a.url) URL.revokeObjectURL(a.url)
    void encerrarWorker()      // ← incondicional
  }
}, [])
```
**Causa:** o worker do tesseract é **global do módulo** (`lib/ocr.ts:30`) e compartilhado por
todas as instâncias de `AnexoImagem`. `lib/ocr.ts` mantém `leiturasEmAndamento` (linha 35) e o
caminho de ociosidade é guardado por ele (`if (leiturasEmAndamento === 0) agendarEncerramento()`,
linha 147) — mas `encerrarWorker()` **ignora** esse contador e chama `worker.terminate()`
sempre. A guarda foi aplicada só na metade do problema.

**Como reproduzir:** aba *Aprender*. O segundo `AnexoImagem` (AprenderTab.tsx:269) fica dentro
de `{!explicando && explicacao && (...)}` (linha 235) — ou seja, desmonta ao clicar
"Recomeçar" ou ao pedir uma nova explicação. Anexe uma foto no campo do tema
(AprenderTab.tsx:164), e enquanto ela lê clique em "Recomeçar": o worker é encerrado e o anexo
em leitura vira `status: 'erro'` sem motivo visível para o aluno.

---

### N-05 — MÉDIO — Duas instâncias de `AnexoImagem` podem chamar `recognize` ao mesmo tempo
**Arquivos:** `lib/ocr.ts:31,131-148`, `components/AnexoImagem.tsx:88,160-171`
**Causa:** `drenar()` serializa a fila **por componente** (`drenando` é um `useRef` local),
mas o worker e o callback de progresso são globais do módulo:
```ts
let reportarProgresso: ((fracao: number) => void) | null = null
```
Com duas instâncias montadas ao mesmo tempo (AprenderTab tem duas; e todas as abas já
visitadas continuam montadas — ver `TabPanel.tsx`, que só evita a montagem inicial), duas
chamadas a `reconhecerImagem` correm juntas. O próprio comentário em `lib/ocr.ts:118-123`
afirma que "o worker do tesseract não aceita dois `recognize` simultâneos".

**Efeitos:** (a) a segunda leitura sobrescreve `reportarProgresso`, então a barra de progresso
da primeira congela e a da segunda recebe eventos da primeira; (b) o `finally` da leitura que
terminar primeiro zera `reportarProgresso` da outra; (c) risco de falha no worker.

**Como reproduzir:** aba *Aprender* com explicação já gerada (as duas caixas de anexo
visíveis). Anexe uma imagem no campo do tema e, sem esperar, outra no campo da explicação.

---

### N-06 — MÉDIO — Tabelas do DOCX são todas atribuídas à ÚLTIMA página
**Arquivo:** `api/_app/documentos.py:34-36`
```python
for linha in _linhas_de_tabelas_docx(documento):
    paginas[-1][1].append(linha)
```
**Causa:** `documento.tables` é percorrido depois de todos os parágrafos, e o resultado é
anexado a `paginas[-1]` — a última seção "Heading 1". A ordem real da tabela no corpo do
documento (`documento.element.body`) não é consultada.

**Efeito:** uma tabela do capítulo 1 de um DOCX com 10 headings é indexada como pertencendo ao
capítulo 10. A resposta da IA cita `[Fonte: apostila.docx, página 10]` e o aluno que clicar em
"ver no contexto" (`/api/trecho`) não acha o conteúdo lá. Isso atinge exatamente a promessa
central do app — a citação conferível. O comentário do código assume o desvio ("Vai tudo na
última página aberta"), mas a consequência na citação não é aceitável.

**Como reproduzir:** DOCX com Heading 1 "Capítulo 1", uma tabela logo abaixo, depois Heading 1
"Capítulo 2" com texto. Ingerir e perguntar algo que só está na tabela — a citação vem como
página 2.

---

### N-07 — MÉDIO — Linha dupla em branco no enunciado parte uma questão em duas no modo lote
**Arquivos:** `lib/texto.ts:47-57` (`formatarAlternativas`), `lib/texto.ts:80`
(`dividirQuestoes`), `components/tabs/ResolverTab.tsx:110`
**Causa:** `formatarAlternativas` preserva o espaçamento do enunciado e ainda insere `\n\n`
antes de cada alternativa. Se o texto colado já tem três ou mais quebras de linha no meio do
enunciado, `dividirQuestoes` (que separa em `/\n[ \t]*\n[ \t]*\n+/`) corta ali.

**Verificado em execução:**
```
formatarAlternativas("Enunciado\n\n\ncontinua A) x B) y")
  => "Enunciado\n\n\ncontinua\n\nA) x\n\nB) y"
dividirQuestoes(...) => ["Enunciado", "continua\n\nA) x\n\nB) y"]
```
**Efeito:** `analisarLote` manda "Enunciado" (sem alternativas) ao `/api/resolver` como se
fosse uma questão — gasta uma chamada de IA e devolve um resultado sem sentido; e a questão
verdadeira chega com o enunciado mutilado. Não atinge texto de OCR nem de documento (ambos
são normalizados com `\n{3,}` → `\n\n` em `AnexoImagem.tsx:137`), só texto colado — que é o
caminho mais usado do modo lote.

---

### N-08 — MÉDIO — `analisarLote` sem teto de questões e sem cancelamento
**Arquivo:** `components/tabs/ResolverTab.tsx:109-128`
**Causa:** o laço percorre `dividirQuestoes(textoLote)` inteiro, uma chamada `api.resolver`
por questão, sem limite de quantidade e sem `AbortController` (compare com `PerguntarTab.tsx`,
que tem `cancelarRef` e `rodadaAtualRef`).

**Efeito:** colar 100 questões dispara 100 chamadas. Como `LIMITE_LLM_POR_MINUTO = 20`
(api/index.py:186), a partir da 21ª em um minuto tudo volta 429 e o aluno vê uma parede de
"Muitas requisições em sequência" sem poder parar o laço — o único recurso é recarregar a
página. Também consome rápido a cota diária de 300/IP.

---

### N-09 — BAIXO — SmartArt continua fora do índice, apesar do que o docstring afirma
**Arquivo:** `api/_app/documentos.py:74-78`
> "Antes só se lia `forma.text_frame`: tabela, grupo e SmartArt ficavam fora do índice"

**Causa:** tabela e grupo passaram a ser lidos; SmartArt **não**. Num SmartArt,
`GraphicFrame.shape_type` devolve `None` (confirmado no fonte do python-pptx instalado:
"This value is `None` when none of these four types apply, for example when the shape contains
SmartArt"), `has_table` é falso e `has_text_frame` é falso. O texto do diagrama vive numa part
separada que o python-pptx não expõe por `shapes`. Correção pela metade: o comportamento não
mudou, mas a documentação diz que mudou.

---

### N-10 — BAIXO — `MAX_CHARS_TRECHO` é por página, não por requisição
**Arquivo:** `api/index.py:1057` e `api/index.py:1143`
```python
MAX_CHARS_TRECHO = 12000  # teto do que a rota devolve, por requisição
...
{"pagina": p["pagina"], "texto": _juntar_sem_repetir(p["partes"])[:MAX_CHARS_TRECHO]}
```
O corte é aplicado dentro da list-comprehension, uma vez por página. Com `vizinhas=True` são
até 3 páginas → 36 000 caracteres; sem `pagina`, quantas páginas couberem nos 60 chunks. O
comentário descreve um teto que não existe. Agrava N-02.

---

### N-11 — BAIXO — Páginas repetidas em `/api/trecho` geram chave React duplicada
**Arquivos:** `api/index.py:1131-1136`, `components/TrechoNoContexto.tsx:65`
O agrupamento só compara com a **última** página vista (`paginas[-1]["pagina"] == numero`).
Se os chunks de uma mesma página não forem contíguos em `id.asc` (acontece depois de uma
reingestão parcial, em que chunks novos ganham ids acima dos antigos), a mesma página aparece
duas vezes na lista. O componente usa `key={p.pagina ?? 'unica'}` → chaves duplicadas, aviso do
React e reconciliação errada. Agrupar por número (dict) resolveria os dois lados.

---

### N-12 — BAIXO — `EvidenceList` sem limpeza do tween: alternar rápido esconde o painel aberto
**Arquivo:** `components/EvidenceList.tsx:24-54`
O `useLayoutEffect` não devolve função de limpeza nem chama `gsap.killTweensOf(el)`. No
fechamento, `onComplete: () => setRendered(false)` fica agendado por 300 ms; se o usuário
reabrir dentro desse intervalo, o callback dispara depois e desmonta o painel com `open`
ainda `true` — o botão diz "Ocultar trechos" e não há nada na tela. Só sai do estado clicando
duas vezes.

---

### N-13 — BAIXO — `formatarAlternativas` não separa alternativas sem texto
**Arquivo:** `lib/texto.ts:24-29`
A regex consome `\s*` depois de `)`, então em "Qual? A) B) C)" o espaço que precederia o "B"
já foi consumido e o `B)` não casa (`^` sem flag `m` só vale no índice 0). Verificado:
`formatarAlternativas("Qual? A) B) C)")` devolve o texto intacto. Caso de borda (gabarito
colado sem os textos das alternativas), impacto pequeno.

---

### N-14 — BAIXO — Cliente HTTP trocado sem `aclose()`
**Arquivo:** `api/_app/http_util.py:44-47`
Quando o event loop muda, um `httpx.AsyncClient` novo é criado e o anterior é descartado sem
`await cliente.aclose()` — as conexões do pool antigo ficam abertas até o GC. Em produção o
loop é estável (impacto quase nulo); aparece nos testes, que rodam cada caso em seu próprio
`asyncio.run`.

---

## Suspeitas (não confirmadas)

- **S-A — `source=eq.{fonte}` sem aspas no PostgREST** (`api/index.py:1103`). O projeto tem
  `_valor_para_filtro` (linha 868) exatamente para esse problema no glossário, mas `/api/trecho`
  não o usa. `nome_para_storage` já troca vírgula por `_`, e parênteses não são reservados em
  `eq.`, então não consegui construir um nome real que quebre o filtro. Vale padronizar.
- **S-B — `escolhas[0]` com `choices` não-lista** em `chamar_llm_stream`
  (`api/_app/provedores.py:359-360`): se um provedor mandar `choices` como objeto, o
  `escolhas[0]` levanta `KeyError` e escapa como exceção genérica (o `except Exception` da rota
  de stream a converte num evento `erro`). Não vi provedor real que faça isso.
- **S-C — `descartados` (`AnexoImagem.tsx:92`) cresce sem poda.** Ids só saem em `reler`.
  Vazamento de memória desprezível na prática (um `Set` de strings curtas por sessão), mas é
  crescimento sem limite.

---

## Resumo por severidade

| # | Severidade | Onde | O quê |
|---|---|---|---|
| N-01 | Alto | documentos.py:80 | `getattr` não segura `NotImplementedError` → ingestão de .pptx quebra |
| N-02 | Alto | index.py:1086 | `/api/trecho` sem cota nem auth → dump do acervo, custo no Supabase |
| N-03 | Médio | index.py:1387, 1035 | `pergunta`/`historico`/`query` sem teto de tamanho |
| N-04 | Médio | AnexoImagem.tsx:109 | desmonte encerra worker de OCR em uso |
| N-05 | Médio | ocr.ts:31,131 | `recognize` concorrente entre instâncias; progresso global |
| N-06 | Médio | documentos.py:34 | tabelas DOCX citadas na página errada |
| N-07 | Médio | texto.ts:80 | linha dupla no enunciado parte a questão no modo lote |
| N-08 | Médio | ResolverTab.tsx:109 | lote sem teto e sem cancelar → 429 em cascata |
| N-09 | Baixo | documentos.py:75 | SmartArt ainda fora do índice (docstring diz o contrário) |
| N-10 | Baixo | index.py:1057 | teto de caracteres é por página, não por requisição |
| N-11 | Baixo | index.py:1131 | página duplicada → key React duplicada |
| N-12 | Baixo | EvidenceList.tsx:24 | tween sem limpeza esconde painel aberto |
| N-13 | Baixo | texto.ts:24 | alternativas vazias não são separadas |
| N-14 | Baixo | http_util.py:44 | cliente HTTP trocado sem `aclose()` |

**Crítico confirmado: nenhum.**
