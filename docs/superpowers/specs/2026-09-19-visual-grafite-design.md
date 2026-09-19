# Visual grafite: tirar a "cara de IA" do app

- **Data:** 2026-09-19
- **Branch:** `visual-grafite`
- **Escopo escolhido:** pele + navegação (opção B). Página inicial com vitrine de cartões fica fora.
- **Referência de estilo:** instant-gaming.com/pt — fundo grafite neutro, um único destaque
  sólido, fonte Barlow, cartões chapados, botões em pílula, títulos de seção simples.

## Problema

O app usa os sinais visuais típicos de interface gerada por IA:

| Sinal | Uso hoje |
|---|---|
| Botões com degradê roxo → ciano (`from-violet to-cyan`) | 26 usos em 19 arquivos |
| Vidro fosco (`.glass`, `backdrop-blur`) | 56 + 4 usos em 18 arquivos |
| Borda e texto em degradê (`.grad-border`, `.grad-text`) | 10 usos |
| Rótulos em fonte de código maiúscula (`font-mono … uppercase tracking-wider`) | 53 usos; `font-mono` em 133 lugares de 26 arquivos |
| Fundo quase preto com brilhos neon (violet, cyan, lime, hotpink) | tema global |
| Logo com estrela de brilho ✦ em degradê com glow; subtítulo "RAG CLOUD · VERCEL + SUPABASE"; selo "526 chunks" | `Header.tsx` |
| Animações de entrada e "pulo" (GSAP) | 7 arquivos |

## Parte 1 — Cores e fonte

**Fundo da página:** degradê vertical fixo (`background-attachment: fixed`) de `#0A0A0A`
(topo) a `#1C1C1C` (base). Sem brilhos radiais.

**Tokens** (em `tailwind.config.ts`, nomes semânticos):

| Token | Valor | Uso |
|---|---|---|
| `topo` | `#0A0A0A` | cabeçalho e barra de abas |
| `cartao` | `#242424` | cartões, caixas de resposta |
| `cartao-hover` | `#2C2C2C` | cartão com o mouse em cima / selecionado |
| `campo` | `#161616` | textarea, input, select |
| `borda` | `#333333` | contornos padrão |
| `borda-forte` | `#474747` | contorno de botão secundário |
| `texto` | `#F2F2F2` | texto principal |
| `texto-suave` | `#A3A3A3` | descrições, rótulos |
| `texto-apagado` | `#949494` (medido: ≥ 4,6:1 em todos os fundos) | dicas, contadores, placeholders |
| `destaque` | `#FFFFFF` | aba ativa, seleção, foco |
| `destaque-fim` | `#D6D6D6` | fim do degradê do botão primário |
| `erro` / `ok` / `atencao` | `#F87171` / `#22C55E` / `#F59E0B` (erro clareado: `#EF4444` dava 4,1:1 no cartão) | somente mensagens de estado |

`bg` passa a valer `#0A0A0A` para não quebrar usos restantes durante a troca; `violet`,
`cyan`, `lime`, `hotpink`, `surface`, `surface-2` e `muted` são **removidos** na limpeza
(Parte 4, passo 5).

**Fonte:** Barlow via `next/font/google` (pesos 400, 500, 600, 700), variável
`--font-barlow`, aplicada como `font-sans`. Sai Fraunces e Inter. `font-mono` só em blocos
de código dentro do Markdown.

**Cantos:** botões em pílula (`rounded-full`), cartões 12px, campos 10px.

**Contraste mínimo:** 4,5:1 para todo texto sobre fundo. Pares a medir: `texto`, `texto-suave`
e `texto-apagado` sobre `topo`, `cartao`, `cartao-hover`, `campo` e o fim do degradê
(`#1C1C1C`); preto `#0A0A0A` sobre `destaque-fim`. `texto-apagado` só pode ser usado onde
atingir 4,5:1; se não atingir sobre algum fundo, clarear o token até atingir.

## Parte 2 — Peças reaproveitáveis

Classes em `app/globals.css`, dentro de `@layer components`, montadas com os tokens:

| Classe | Substitui | Aparência |
|---|---|---|
| `.btn-primario` | botões com `bg-gradient-to-r from-violet to-cyan` | pílula, degradê `destaque` → `destaque-fim`, texto `#0A0A0A` 600; desabilitado com opacidade 40% |
| `.btn-secundario` | `rounded-lg border border-white/10 bg-white/[0.03] …` | pílula, borda `borda-forte`, texto `texto`, fundo `cartao` no hover |
| `.btn-icone` | botões quadrados só com ícone | 36×36px, raio 10px, borda `borda`, ícone `texto-suave` → `texto` no hover |
| `.cartao` | `.glass` + `.grad-border` em caixas de conteúdo | fundo `cartao`, borda `borda`, raio 12px |
| `.cartao-opcao` | cartões de persona/perfil selecionáveis | como `.cartao`; `[aria-pressed=true]` → borda `destaque` e fundo `cartao-hover` |
| `.campo` | `glass … rounded-xl` em textarea/input/select | fundo `campo`, borda `borda`, raio 10px; `:focus` → borda `destaque` |
| `.rotulo` | `font-mono text-[0.7rem] uppercase tracking-wider text-muted` | Barlow 600, 0.8rem, `texto-suave`, sem caixa alta forçada |
| `.titulo-secao` | cabeçalhos de bloco e a frase de abertura de cada aba | Barlow 700, 1.25rem, `texto` |
| `.aviso-erro` / `.aviso-ok` / `.aviso-atencao` | caixas rose/verde/âmbar | fundo `cartao`, borda esquerda de 3px na cor do estado, texto `texto` |
| `.carregando` | spinner `border-violet/30 border-t-violet` | spinner `borda-forte` com topo `texto` |

Ajustes pontuais continuam possíveis com utilitários Tailwind por cima das classes.
`.glass`, `.grad-border` e `.grad-text` são apagadas na limpeza.

## Parte 3 — Topo e navegação

**Cabeçalho** (`components/Header.tsx`), faixa `topo` de ~56px, fixa (`sticky top-0`):

- **Esquerda:** logo = quadrado branco 32px, raio 8px, com o glifo `>_` em `#0A0A0A` (sem
  estrela, sem degradê, sem glow). Ao lado, "Engenharia de Prompt" em Barlow 700 1.1rem.
  Sem subtítulo.
- **Centro (≥ 768px):** grupos (Estudar · Produzir · Arquivos · Comunicar · Suporte) como
  menu de texto em linha. Ativo: `texto` 600 com traço inferior de 2px `destaque`. Inativo:
  `texto-suave`, `texto` no hover.
- **Direita:** selo de status com ponto colorido + palavra ("online", "sem material",
  "offline", "conectando…"); o total de trechos vai no atributo `title`. Depois
  `InstalarApp` e `Conta` com `.btn-secundario`.
- **< 768px:** o menu de grupos vira uma linha própria abaixo do cabeçalho, com rolagem
  horizontal.

Para isso, `Header` passa a receber os grupos, o grupo ativo e o callback de troca; a lógica de
grupos sai de `TabNav` para `app/page.tsx` (ou um hook pequeno), mantendo o comportamento
"voltar ao grupo reabre a última aba usada nele".

**Barra de abas** (`components/TabNav.tsx`), segunda faixa `topo`, fixa logo abaixo do
cabeçalho (mantém a medição da altura real do cabeçalho via `ResizeObserver`):

- Mostra as abas do grupo ativo: ícone + rótulo (`label` no desktop, `labelShort` no celular).
- Ativa: `texto` com traço inferior de 2px `destaque`. Inativa: `texto-suave`.
- O traço é um único elemento posicionado por CSS (`transform` + `width` com `transition`),
  calculado a partir do botão ativo; sai o GSAP e a animação em cascata.

**Topo de cada aba:** a linha `font-mono … uppercase` vira `.titulo-secao` com o nome da aba e,
abaixo, uma frase curta em `texto-suave` (o mesmo conteúdo de hoje, sem caixa alta).

**Animações (opção B), todas em CSS e desligadas por `prefers-reduced-motion`** (a regra global
que já existe em `globals.css` continua):

- transições de cor/fundo/borda de 150ms em botões, abas e cartões;
- traço da aba ativa desliza até a aba clicada (200ms, `ease-out`);
- conteúdo da aba aparece com fade de 180ms ao trocar (`TabPanel`);
- `.cartao-opcao` sobe 2px (`translateY(-2px)`) e clareia no hover;
- a resposta da IA entra com fade leve (classe `.surgir`, 200ms).

Saem: entrada animada do cabeçalho (logo girando, título deslizando), cascata dos botões da
barra, `scale` no hover e no clique, "pop" do selo.

## Parte 4 — Aplicação e verificação

**Branch:** `visual-grafite`. A Vercel gera URL de pré-visualização para a branch; a `main`
só recebe a mudança depois da aprovação do dono.

**Ordem:**

1. **Base:** `tailwind.config.ts`, `app/globals.css`, `app/layout.tsx` (Barlow),
   `app/manifest.ts` (`background_color`/`theme_color` = `#0A0A0A`), `public/icon.svg`
   (logo `>_`).
2. **Moldura:** `components/Header.tsx`, `components/TabNav.tsx`, `components/TabPanel.tsx`,
   `app/page.tsx`.
3. **Compartilhados:** `ProviderSelect`, `AnexoImagem`, `EvidenceList`, `RespostaAuditada`,
   `Markdown`, `Conta`, `InstalarApp`, `AdminToken`, `WarnBanner`, `Exemplos`.
4. **Abas (16 componentes: as 13 abas do menu + os modos internos):** Perguntar, Professor,
   Resumo da Apostila (modo do Professor), Aprender, Buscar, Resolver, Glossário, Comparar,
   Apostila, Comprimir, PDFs, Perfis Comportamentais, Elenco (principal), Fale o que pensa
   e Puxar assunto (modos do Elenco), Suporte.
5. **Limpeza:** remover GSAP de `EvidenceList`, `WarnBanner`, `PerguntarTab`,
   `ResumoApostilaTab` (e `Header`, `TabNav`, `TabPanel` já no passo 2); desinstalar `gsap`
   se não houver mais uso; apagar `.glass`, `.grad-border`, `.grad-text` e os tokens antigos.

**Verificação (antes de declarar pronto):**

- Busca sem resultados em `app/` e `components/` por: `violet`, `cyan`, `lime`, `hotpink`,
  `glass`, `grad-`, `from-violet`, `uppercase tracking-wider`, `gsap`; `font-mono` apenas em
  `Markdown.tsx` (blocos de código).
- Script de contraste com os pares da Parte 1, todos ≥ 4,5:1.
- `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:js` e
  `python -m pytest tests -q`, todos passando.
- No navegador (preview local): as 13 abas do menu e os 3 modos internos, em 1280px e em 375px, sem elemento sem
  estilo, sem rolagem horizontal da página; teste com `prefers-reduced-motion`.
- Prints de antes e depois de Perguntar, Elenco, PDFs e do topo.
- Só então push da branch e envio do link de pré-visualização.

**Fora do escopo:** textos e funcionamento das abas, rotas, backend, PDF gerado pela
apostila, página inicial com vitrine de cartões (opção C), tema claro.

## Riscos

- **Classe esquecida numa aba pouco usada** (ex.: PDFs, restrita ao admin) ficar sem estilo
  depois de apagar `.glass` → mitigado pela busca automática e pela checagem aba a aba.
- **Barlow sem acentos ou pesos faltando** → carregar com `subsets: ['latin', 'latin-ext']`
  e conferir "ção", "ê", "ú" nos títulos.
- **Mover a lógica de grupos para o cabeçalho** pode quebrar a lembrança da última aba por
  grupo → manter a mesma estrutura (`ultimaPorGrupo`) e testar trocando de grupo e voltando.
