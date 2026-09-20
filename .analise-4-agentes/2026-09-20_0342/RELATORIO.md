# Relatório — Orquestrador de 4 agentes (2026-09-20, 03:42)

Rodada sobre o código já corrigido e publicado (`a96f87d` e `998cd34`), que fechou todos os
bugs da análise de 19/09.

| Agente | Nota | Relatório |
|---|---|---|
| Análise de Projeto | 7/10 | [01-analise.md](01-analise.md) |
| Verificação de Bugs | 7/10 | [02-bugs.md](02-bugs.md) |
| Refatoração | 6/10 | [03-refatoracao.md](03-refatoracao.md) |
| Geração de Ideias | 7/10 | [04-ideias.md](04-ideias.md) |
| **Média** | **6,75/10** | |

## Veredito: REPROVADO

Motivo: média 6,75 < 7. **Não houve bloqueio** — o agente de bugs não confirmou nenhum bug
crítico (304 pytest, 75 testes JS e ruff passando). O que puxa a nota para baixo é a dívida
estrutural intocada (refatoração 6/10) somada a defeitos novos introduzidos pelas correções.

A leitura honesta: a rodada anterior consertou bem o que estava quebrado, mas **o código novo
entrou com problemas próprios** e nenhuma lacuna estrutural — de produto ou de arquitetura —
foi tocada.

## 5 achados mais importantes

1. **`GET /api/trecho` não tem limite nenhum** — `api/index.py:1086`. Apontado
   independentemente pelos dois agentes (G1 na [análise](01-analise.md), N-02 nos
   [bugs](02-bugs.md)). É rota pública, sem `_limitar_llm`, com `pagina` opcional e 60
   chunks por resposta: iterando as páginas dá para reconstruir a apostila inteira e martelar
   o Supabase sem nunca ver 429. **Foi introduzida na rodada anterior** (feature N-05).
2. **Ingestão de .pptx pode cair inteira com 500** — `api/_app/documentos.py:80`. O
   `getattr(forma, "shape_type", None)` não segura `NotImplementedError`, que é exatamente o
   que o python-pptx levanta numa forma não reconhecida. Também introduzido na rodada
   anterior (B-23). Junto: o docstring afirma que SmartArt entra no índice, e não entra.
3. **Tabelas do .docx vão todas para a ÚLTIMA página** — `api/_app/documentos.py:34`. A
   citação aponta o capítulo errado, o que atinge a promessa central do app (citar fonte e
   página). Mesma origem: a correção do B-23.
4. **A dívida estrutural não foi tocada** — dos 8 itens prioritários de 19/09, **nenhum** foi
   atacado; `api/index.py` cresceu 430 linhas, concentradas nas funções que já eram as
   maiores. Ver [refatoração](03-refatoracao.md). O `tempo_restante_llm` só chegou a 5 das 14
   chamadas ao modelo.
5. **Acesso ao acervo não é uma decisão tomada** — `/api/config` publica a chave anon e o RLS
   dá `select` em `ementas_chunks` para `anon`: o índice sai direto pelo Supabase,
   independentemente do item 1. Ver G2 na [análise](01-analise.md).

## Próximos passos, por prioridade

1. **Limitar `/api/trecho`** (item 1). Correção pequena e é regressão nossa.
2. **Consertar a extração de .pptx/.docx** (itens 2 e 3): `try/except NotImplementedError`,
   tabelas na página certa, e corrigir o docstring sobre SmartArt.
3. **Tetos de tamanho em `pergunta`, `historico` e `query`** — rotas públicas sem limite
   (`api/index.py:1387` e `:1035`), fora da lista de pendências conhecida.
4. **Rever a cota por chamada, não por requisição**: Resumo gasta 41 chamadas ao provedor por
   1 unidade de cota; Comparar, 4. É o mesmo assunto do semáforo do resumo, que já era o item
   1 da fila do `MEMORY.md`.
5. **Corrigir `PROJECT.md:236`**, que ainda manda NÃO reenviar arquivo — é justamente a
   instrução que o dono vai seguir nos 2 PDFs pendentes, e o B-13 já mudou isso.
6. **Começar a dividir o monólito** por `config.py` e `limites.py`, um commit cada, ciente de
   que 13 arquivos de teste fazem `monkeypatch.setattr(index, ...)` sobre 31 nomes e de que
   `vercel.json` só empacota `api/{rag_core.py,_app/**}`.

## Ideias novas

11 propostas (A-01 a A-11) em [04-ideias.md](04-ideias.md), sem repetir I-001..I-006 nem
N-01..N-12. As três melhores: **A-01** citação clicável dentro da resposta (aproveita o
`/api/trecho` recém-criado, sem backend novo); **A-03** título de seção como metadado do
chunk (melhora busca e citação em todas as abas de uma vez, e casa com a reindexação já
pendente); **A-04** queda automática para outro provedor quando um cai.
