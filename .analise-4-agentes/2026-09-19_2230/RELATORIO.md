# Relatório — Orquestrador de 4 agentes (2026-09-19)

Foco do pedido: analisar o código e propor novas features.

| Agente | Nota | Relatório |
|---|---|---|
| Análise de Projeto | 7/10 | [01-analise.md](01-analise.md) |
| Verificação de Bugs | 6/10 | [02-bugs.md](02-bugs.md) |
| Refatoração | 6/10 | [03-refatoracao.md](03-refatoracao.md) |
| Geração de Ideias | 7/10 | [04-ideias.md](04-ideias.md) |
| **Média** | **6,5/10** | |

## Veredito: REPROVADO

Motivo: média 6,5 < 7. Não houve bloqueio: o agente de bugs não confirmou nenhum bug crítico
(251 testes pytest passam, ruff limpo). O maior problema é um bug ALTO (B-01).

## 5 achados mais importantes

1. **B-01 (alto):** botão "Mostrar trechos da apostila" nunca abre a lista — `components/EvidenceList.tsx:17-19`; afeta 4 abas. Ver [02-bugs.md](02-bugs.md).
2. **B-02 (médio):** senha/token de admin com acento dá 500 (`compare_digest` com str não-ASCII) — `api/index.py:340,376,833`.
3. **Sem memória de conversa** (`PerguntaReq`, `api/index.py:1116-1120`) e sem escolha de apostila no RAG — maior lacuna de produto. Ver [01-analise.md](01-analise.md).
4. **Monólito `api/index.py` (2269 linhas)** com duplicação (embedding+busca em 6 rotas) — ver [03-refatoracao.md](03-refatoracao.md).
5. **B-11:** reenviar PDF idêntico sem chunks diz "já indexado" e não reindexa (caso dos 2 PDFs pendentes).

## Novas features propostas (12 em [04-ideias.md](04-ideias.md), fora I-001..I-006)

Top 3: N-01 conversa contínua com follow-up; N-05 "Ver no contexto" (trecho ampliado da fonte);
N-02 cache semântico de respostas. Demais: filtro por apostila, busca híbrida, voz, mapa mental,
caderno de erros, plano de estudos, perguntar sobre o próprio arquivo, feedback da resposta,
painel de domínio por tema. A análise de produto ainda sugere: Biblioteca de apostilas,
"Meu progresso", flashcards exportáveis.

## Próximos passos (prioridade)

1. Corrigir B-01 (EvidenceList) e B-02 (comparação de senha em bytes) — pequenos, alto retorno.
2. Corrigir B-11 (reindexar PDF sem chunks) e B-05/B-06 (500 em gerar/resumir apostila).
3. Implementar N-05 (esforço P) e N-01 (conversa contínua).
4. Filtro por apostila (N-03) + cache semântico (N-02).
5. Refatorar `api/index.py` em `APIRouter`s dentro de `api/_app/` e extrair helper "embedding+busca".
