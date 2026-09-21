# Relatório do Orquestrador — 2026-09-20_2149

## Notas

| Agente | Nota | Justificativa |
|---|---|---|
| Análise de Projeto | 7/10 | RAG central sólido, mas decisões de escopo/segurança/custo não declaradas formalmente e lacuna real de persistência de UX |
| Verificação de Bugs | 8/10 | Sem crítico/alto; restam médios/baixos bem delimitados, inclusive um bug real de concorrência no OCR |
| Refatoração | 6/10 | Monólito de rotas de 2756 linhas (`api/index.py`) e duplicação de UI/lógica em pelo menos 5 pontos |
| Geração de Ideias | 7/10 | Lacuna real identificada (aluno nunca pratica escrever prompts), boas ideias reaproveitando infra existente |

**Média: 7,0/10**

## Veredito: ✅ APROVADO

Sem bug crítico confirmado (bloqueio não se aplica). Média 7,0 ≥ 7 → aprovado.

## 5 achados mais importantes

1. **[Bugs, Médio]** Desmontar um `AnexoImagem` encerra globalmente o worker do
   tesseract, derrubando o OCR de outro anexo em leitura simultânea (aba Aprender
   tem 2 instâncias). Ver `02-bugs.md`.
2. **[Refatoração, Alto]** `api/index.py` com 2756 linhas mistura auth, rate-limit,
   storage e ~20 rotas — ponto de maior risco para manutenção futura. Ver
   `03-refatoracao.md`.
3. **[Análise, Médio]** Cota de uso conta requisição, não trabalho:
   `/api/resumir-apostila` dispara até 40 chamadas paralelas por 1 unidade de cota
   (mesmo achado do MEMORY.md, aqui tratado como descasamento de requisito de
   custo). Ver `01-analise.md`.
4. **[Bugs, Médio]** `pergunta`/`historico`/`query` sem teto de tamanho em
   `/api/perguntar` e `/api/buscar`. Ver `02-bugs.md`.
5. **[Ideias]** Nenhuma ferramenta deixa o aluno escrever e testar prompts
   próprios — lacuna específica do curso de Engenharia de Prompt, com 6 ideias
   propostas (Laboratório de Prompts, Corretor com rubrica etc.). Ver
   `04-ideias.md`.

## Próximos passos sugeridos (ordem de prioridade)

1. Corrigir o bug de concorrência do OCR (`lib/ocr.ts`) — impacto direto no aluno,
   esforço baixo.
2. Adicionar teto de tamanho em `pergunta`/`historico`/`query` (`/api/perguntar`,
   `/api/buscar`), seguindo o padrão já usado em Auditar/Suporte/Apostila.
3. Decidir e documentar formalmente as decisões de produto/segurança em aberto:
   RLS público em `ementas_chunks`/`glossario_termos`, exposição da chave anon em
   `/api/config`, e o modelo de cota por requisição vs. por chamada de IA.
4. Planejar a quebra de `api/index.py` em módulos por domínio (rotas de
   estudo/produção/comunicação/admin) antes que o arquivo cresça mais.
5. Avaliar a ideia "Laboratório de Prompts" como próxima feature — reaproveita
   infra existente e ataca lacuna central do curso.

Relatórios completos em `.analise-4-agentes/2026-09-20_2149/`.
