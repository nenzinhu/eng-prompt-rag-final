# Relatório de Refatoração — eng-prompt-rag-final

Agente: REFATORAÇÃO (duplicação, funções grandes, nomenclatura, eficiência/legibilidade)
Escopo lido: `api/index.py` (integral, 2756 linhas), `api/rag_core.py` (integral), `api/_app/documentos.py` (integral), `api/_app/provedores.py` (integral), `api/_app/prompts.py` (parcial — dados puros), `api/_app/http_util.py`, `lib/api.ts`, `lib/useRequisicao.ts`, `lib/useHistorico.ts`, `components/tabs/PerfisComportamentaisTab.tsx`, `ElencoTab.tsx`, `SuporteTab.tsx`, `FaleOQuePensaTab.tsx`, `PerguntarTab.tsx`, `ResolverTab.tsx`, `PdfsTab.tsx`, `ComprimirTab.tsx`, `Conta.tsx`, `AnexoImagem.tsx`.

---

## 1. `api/index.py` é um monólito de 2756 linhas (CRÍTICO — estrutural)

**Onde:** `api/index.py`, arquivo inteiro.

O arquivo mistura, sem nenhuma separação de módulo:
- configuração/inicialização do app e CORS
- autenticação admin e rate limiting (`_limitar_llm`, sessão)
- helpers de I/O do Supabase Storage
- ~20+ handlers de rota cobrindo features completamente distintas: pergunta, resolver questão, comparar modelos, glossário, apostila, ingestão de PDF, upload direto, admin, config, buscar, elenco, suporte, perfis comportamentais, fale-o-que-pensa, professor, resumo de apostila.

Já existe o padrão de módulos em `api/_app/` (`documentos.py`, `provedores.py`, `prompts.py`), mas as rotas continuam centralizadas em `index.py`. Isso torna o arquivo custoso de navegar, aumenta o risco de colisão em merges e mistura responsabilidades de infraestrutura (auth, limite de taxa) com lógica de produto (cada feature).

**Sugestão:** extrair os grupos de rota para `api/_app/routes_*.py` (ex.: `routes_pergunta.py`, `routes_admin.py`, `routes_personas.py`, `routes_ingestao.py`), mantendo em `index.py` apenas a criação do `app`, middlewares e `include_router`. Não é uma mudança pontual — é o item de maior impacto em manutenibilidade do projeto.

---

## 2. Dict de "contexto/resultado" de chunk duplicado 5x em `api/index.py`

**Onde:**
- `api/index.py:1096-1103` (`/api/buscar`)
- `api/index.py:1531-1534` (`_meta_pergunta`)
- `api/index.py:1859-1862` (rota de comparação, dentro do bloco ~1840-1900)
- `api/index.py:2146` (rota de resumo/apostila — variante sem `relevancia`)
- `api/index.py:2257-2260` (rota de comparar modelos)

O mesmo dict-comprehension aparece com pequenas variações:
```python
{"conteudo": c["content"], "fonte": c["source"], "pagina": c["page"], "relevancia": round(c["similarity"], 3)}
```
repetido quatro vezes ao pé da letra, e uma quinta vez sem a chave `relevancia` (linha 2146).

**Sugestão:** extrair uma função única em `rag_core.py` ou `index.py`, ex. `chunks_para_contexto(chunks: list[dict], com_relevancia: bool = True) -> list[dict]`, e substituir as 5 ocorrências.

---

## 3. Boilerplate `resolver_modelo` + `chamar_llm` + `limpar_resposta` repetido nas rotas de persona simples

**Onde:** rotas de `perfil-comportamental`, `elenco-conversa`, `fale-o-que-pensa`, `suporte-atendimento` em `api/index.py` (mesma faixa ~1750-1900 onde aparecem `contexto: list[EvidenciaIn] = []` seguido de `contexto_para_texto(...)`, linhas 1774/1782, 1797/1805, 1872/1888).

Essas quatro rotas seguem exatamente o mesmo esqueleto: resolver provider/modelo → montar system prompt fixo da persona → chamar LLM → limpar resposta → devolver `{"resposta": ...}`. A única variação real é qual `SYSTEM_PROMPT_*` e quais campos de entrada.

**Sugestão:** fatorar um helper comum, ex. `async def _rota_persona_simples(req, system_prompt: str, ...) -> str`, reduzindo cada handler a poucas linhas de montagem de prompt específico.

---

## 4. `_markdown_para_pdf` — função de ~225 linhas com closures aninhadas

**Onde:** `api/_app/documentos.py:433-658`.

A função concentra parsing de markdown, paginação manual, desenho de texto e funções internas (closures) para quebra de linha e numeração de página. Difícil de testar unitariamente porque a lógica de layout está acoplada à extração de estrutura do markdown.

**Sugestão:** separar em ao menos duas funções puras: (a) `_markdown_para_blocos(texto) -> list[Bloco]` (parsing), e (b) `_blocos_para_pdf(blocos, titulo) -> bytes` (renderização/paginação). Isso também facilitaria testar o parsing sem depender da biblioteca de PDF.

---

## 5. Padrão de "aba de persona" duplicado quase byte-a-byte em 4 componentes

**Onde:** `components/tabs/PerfisComportamentaisTab.tsx`, `ElencoTab.tsx`, `SuporteTab.tsx`, `FaleOQuePensaTab.tsx` — comparação direta feita entre os dois primeiros (linhas indicadas):

- Função `copiar()` idêntica em `PerfisComportamentaisTab.tsx:61-70`, `ElencoTab.tsx:63-72`, e repetida (confirmado por grep) em `SuporteTab.tsx:132-139` e `FaleOQuePensaTab.tsx:75-82`.
- Grid de seleção de persona/perfil (`PerfisComportamentaisTab.tsx:79-98` vs `ElencoTab.tsx:82-101`) — mesma estrutura de `button` com `aria-pressed`, mesmas classes de destaque condicional, só troca o ícone e os campos de texto exibidos.
- Bloco de histórico (`PerfisComportamentaisTab.tsx:198-225` vs `ElencoTab.tsx:203-230`) — JSX idêntico linha a linha (título, botão "Limpar", lista de itens clicáveis).
- Bloco de exibição de resultado com header "Resposta/Mensagem pronta" + botão copiar (`PerfisComportamentaisTab.tsx:171-189` vs `ElencoTab.tsx:176-194`) — estrutura idêntica.
- `useEffect` de carregar lista de personas do backend (`PerfisComportamentaisTab.tsx:38-51` vs `ElencoTab.tsx:38-51`) — mesmo formato (fetch, fallback padrão, ajusta seleção se o item corrente sumiu).

Os hooks `useRequisicao`/`useHistorico` já removeram parte da duplicação de estado, mas a **camada de apresentação** (picker de persona, botão copiar+estado "copiado", card de resultado, lista de histórico) continua copiada em 4 arquivos.

**Sugestão:** extrair componentes compartilhados, por exemplo:
- `<CopyButton texto={resposta} />` (encapsula estado `copiado`/timeout/try-catch do clipboard)
- `<PersonaPicker itens={personas} selecionado={id} onSelect={...} campo="persona_id|temperament_id" icon={...} />`
- `<HistoricoLista itens={historico} onSelecionar={...} onLimpar={...} />`
- `<ResultadoCard titulo="..." resposta={...} />`

Isso reduziria cada uma das 4 abas em ~60-80 linhas e centralizaria qualquer ajuste futuro (ex. mudar o comportamento de copiar) num único lugar.

---

## 6. Nomenclatura inconsistente `personaId` vs `temperamentId` para o mesmo conceito

**Onde:** `PerfisComportamentaisTab.tsx:24` (`temperamentId`) vs `ElencoTab.tsx:28` (`personaId`) vs provavelmente `SuporteTab`/`FaleOQuePensaTab` com nomes próprios também.

Ambos representam "qual variante de persona está selecionada" para o mesmo padrão de UI. Nomes diferentes por aba dificultam a extração do componente genérico do item 5 e obrigam quem lê o código a reconfirmar, aba a aba, se são conceitos equivalentes.

**Sugestão:** ao extrair o `PersonaPicker` genérico (item 5), padronizar o nome do campo de id (ex. sempre `id`/`selecionado`) na prop pública do componente, independente do nome de domínio usado internamente em cada rota da API.

---

## 7. `PdfsTab.tsx` concentra upload, verificação prévia e indexação num único componente de 587 linhas

**Onde:** `components/tabs/PdfsTab.tsx`, arquivo inteiro (funções `verificar` 172-210, `runIngest` 217-246, `enviarDireto` 252-271, `enviar` 278-332, mais ~250 linhas de JSX).

Não há bug, mas o componente acumula 5 responsabilidades: sessão de admin, fila de upload, envio direto ao Storage, verificação de prévia de ingestão e execução da ingestão. É o maior componente do projeto e mistura estado de UI com lógica de orquestração de rede em múltiplos passos.

**Sugestão (baixa prioridade, cosmética):** extrair a lógica de negócio (`verificar`, `runIngest`, `enviarDireto`, `enviar`) para um hook `usePdfsIngestao(token)`, deixando o componente só com o JSX e handlers finos. Não é urgente — o código está correto e bem comentado, é puramente uma questão de tamanho/local único de responsabilidade.

---

## 8. Pequena duplicação de heurística de limite de tamanho em `ComprimirTab.tsx`

**Onde:** `components/tabs/ComprimirTab.tsx:204-217` — `abaixoDoLimite` e `acimaDoLimite` são dois `useMemo` quase idênticos, diferindo só no operador de comparação (`<=` vs `>`).

**Sugestão:** calcular uma vez `pdfsProntos = prontos.filter(i => i.tipo === 'pdf')` e derivar as duas contagens dele, ou combinar em um único `useMemo` que devolve `{abaixo, acima}` — evita iterar `prontos` duas vezes e deixa a relação entre as duas métricas mais explícita.

---

## Pontos positivos (não são achados, mas evitam nota inflada por engano)

- `api/rag_core.py` está bem fatorado, funções pequenas e coesas — não gerou achados de refatoração.
- `lib/useRequisicao.ts` e `lib/useHistorico.ts` já são uma boa extração prévia de padrão repetido de estado (carregando/erro/histórico), reduzindo o que seria uma duplicação ainda maior nas abas de persona.
- `api/_app/http_util.py` é pequeno, comentado e sem duplicação aparente.
- `AnexoImagem.tsx` e `Conta.tsx`, apesar do tamanho (411 e 414 linhas), concentram uma única responsabilidade coesa cada um (não foram tratados como achados de "função grande" porque o tamanho vem de estados de UI legítimos, não de mistura de responsabilidades).

---

## Resumo de prioridade

| # | Achado | Arquivo(s) | Severidade |
|---|--------|-----------|------------|
| 1 | Monólito de rotas | `api/index.py` (2756 linhas) | Alta |
| 2 | Dict de contexto duplicado 5x | `api/index.py:1096,1531,1860,2146,2258` | Média |
| 3 | Boilerplate de rota de persona | `api/index.py` (~1750-1900) | Média |
| 4 | Função de 225 linhas | `api/_app/documentos.py:433-658` | Média |
| 5 | UI de aba de persona duplicada 4x | `components/tabs/{Perfis,Elenco,Suporte,FaleOQuePensa}Tab.tsx` | Média-Alta |
| 6 | Nomenclatura inconsistente (id de persona) | mesmos arquivos do item 5 | Baixa |
| 7 | Componente de 587 linhas com 5 responsabilidades | `components/tabs/PdfsTab.tsx` | Baixa |
| 8 | `useMemo` duplicado | `components/tabs/ComprimirTab.tsx:204-217` | Baixa |
