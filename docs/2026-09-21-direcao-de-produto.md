# Direção de produto — onde paramos (21/09/2026)

Brainstorming em andamento. Nada daqui foi implementado ainda; cada item passa por
aprovação de desenho antes do código.

## Escolhas do usuário

Das listas de ideias (estilo Tesla e estilo Steve Jobs, no fim deste documento), foram
escolhidas duas frentes:

| Frente | Ideias | Classificação | Estado |
|---|---|---|---|
| **Nunca falhar e nunca inventar** | Jobs 13 + 20 | Delimitada (fluxos já existem: `api/_app/provedores.py`, `api/_app/prompts.py`) | **Em perguntas** — ver abaixo |
| **Três abas + tela "o que eu estudo agora?"** | Jobs 2 + 22 | Arquitetura (reorganiza as 14 abas; precisa de dados de progresso que o app não tem) | Não iniciada — processo completo com especificação escrita |

Ordem combinada: primeiro "nunca falhar e nunca inventar" (é a promessa central, é menor e
prepara a base), depois a tela nova.

## Frente 1 — nunca falhar e nunca inventar

### Decidido

**Quando a apostila não cobre a pergunta: opção B, transparente.** A resposta usa o
material e, se completar com conhecimento geral, separa essa parte visivelmente (bloco
"fora da apostila", sem citação). O aluno nunca confunde o que é do curso com o que é da IA.

Motivo: hoje os prompts de Perguntar, Professor e Resolver mandam **"complemente com seu
conhecimento geral"** e misturam as duas coisas — isso contradiz "nunca inventar".
Descartadas: A (rigoroso: só o material, "não está na sua apostila") e C (como hoje).

### Pergunta em aberto (retomar daqui)

**Quando o app trocar de modelo por causa de uma falha (429, 502, timeout), o aluno deve
saber?**

- **A) Aviso discreto — recomendado.** Resposta normal, com uma linha pequena: "respondido
  por Groq · gpt-oss-120b — o modelo escolhido não respondeu".
- B) Totalmente silencioso.
- C) Perguntar antes de trocar ("o modelo X não respondeu, tentar com Y?").

Já definido, qualquer que seja a resposta: nas abas **Comparar modelos** e **Laboratório** o
modelo escolhido é o objeto do exercício — lá não há troca; mostra-se que aquele modelo falhou.

### A tratar no desenho (ainda não apresentado)

- Troca de modelo só antes do primeiro pedaço do streaming; falha no meio da resposta pede
  outra estratégia (recomeçar com outro modelo e substituir o texto, ou avisar).
- Ordem de reserva: modelos gratuitos por velocidade medida (listas em `provedores.py`).
- Formato do bloco "fora da apostila" no prompt e como a interface o destaca.
- Onde aplicar: todas as rotas com RAG (Perguntar, Professor, Aprender, Resolver, Glossário,
  Gerar apostila).
- Testes: falha do provedor principal → resposta do reserva; bloco "fora da apostila"
  separado e sem citação.

## Frente 2 — três abas e "o que eu estudo agora?"

Ainda não começou. Pontos já levantados:

- Proposta das três abas: **Estudar, Praticar, Meu material**. Perfis Comportamentais,
  Elenco e Suporte de TI saem do app de estudo (viram outro produto, se valerem).
- A tela inicial precisa saber o que o aluno já estudou e errou. Hoje: a conta é opcional
  (`lib/conta.ts`), nenhuma rota exige login e o histórico fica só no navegador, por aba
  (`lib/useHistorico.ts`). Decidir onde guardar o progresso é a primeira pergunta.

## Contexto técnico (estado em 21/09/2026)

- Busca: híbrida (vetor + full-text, RRF) com `mistral-embed`; `gte-small` de reserva.
- Índice: 994 trechos, 13 documentos, com OCR das imagens e limpeza de rodapés.
- Reranker (Voyage/Jina): adiado pelo usuário; desenho registrado em `MEMORY.md`.
- Pendência de segurança: trocar a chave `service_role` do Supabase (ficou exposta numa
  conversa).

---

## Apêndice A — 80 ideias, estilo Tesla (princípios de engenharia da empresa)

★ = prioridade sugerida.

**1. Primeiros princípios — "a melhor peça é nenhuma peça"**
1. ★ Auditoria de abas mortas: medir o uso de cada aba e remover ou juntar as sem uso.
2. Juntar Perguntar, Professor Sabe Tudo e Aprender numa conversa, com o modo como seletor.
3. Apagar o aviso "pouco embasado" (nunca dispara) ou trocá-lo por um sinal real.
4. Uma rota `/api/estudar` no lugar das 8 que repetem "buscar + montar contexto".
5. Remover o projeto duplicado da Vercel e o índice HNSW repetido no banco.
6. Tirar do seletor provedores que falham mais que funcionam.
7. Seletor "Rápido / Caprichado" em vez de lista de modelos.
8. `.env.example` gerado a partir do código.
9. Reduzir o `index.py` a módulos por assunto.
10. Resposta primeiro, fontes depois.

**2. Dados da frota — o app aprende com o uso**
11. ★ 👍/👎 em cada resposta, com a pergunta e os trechos usados.
12. ★ Conjunto fixo de perguntas que cresce com as perguntas mal respondidas.
13. Painel "perguntas sem resposta no material".
14. Registrar o trecho que o aluno clicou para conferir.
15. Cache para perguntas repetidas entre alunos.
16. Ranking dos trechos mais citados ("o que mais cai na prova").
17. Qual modelo acerta mais nas questões com gabarito.
18. Detectar reformulação da pergunta como sinal de falha.
19. Relatório semanal de qualidade (recall, latência, erros por provedor).
20. Recalibrar os limiares da auditoria com perguntas reais anônimas.

**3. Atualizações pelo ar (OTA)**
21. ★ Avaliação automática no CI que bloqueia deploy se o recall cair.
22. Feature flags por variável para toda mudança de busca.
23. Teste A/B de prompts comparando os 👍.
24. Verificação diária dos modelos gratuitos.
25. Reindexação automática quando o extrator melhora.
26. Notas de versão dentro do app.
27. OCR automático no upload.
28. Retomar sozinho a ingestão interrompida.
29. Deploy canário para 10% das requisições.
30. Rollback automático se a taxa de erro subir.

**4. Autopilot — o app estuda junto**
31. ★ Plano de estudos a partir da data da prova.
32. ★ Revisão espaçada do que o aluno errou.
33. Simulado gerado do material, com correção.
34. Caderno de erros automático.
35. Resumo diário de 5 minutos.
36. Modo "me pergunte" (Feynman ao contrário).
37. Detectar lacunas recorrentes e sugerir a aula certa.
38. Mapa mental da apostila.
39. Flashcards do glossário, exportáveis para o Anki.
40. Agente que monta a apostila da semana.

**5. Integração vertical**
41. ★ Ingestão em um clique: upload → OCR → limpeza → índice → teste de busca.
42. Cache semântico no Supabase.
43. Reranker com fallback.
44. Leitor de PDF interno na página citada, com o trecho destacado.
45. Extração de tabelas como tabela.
46. Embeddings gerados localmente.
47. Modelo pequeno ajustado nas perguntas do curso.
48. Transcrição de videoaulas no índice.
49. Glossário ligado às páginas onde cada termo aparece.
50. Agente de manutenção que roda os scripts sozinho.

**6. Interface minimalista**
51. ★ Uma tela com uma caixa central que entende a intenção.
52. Barra de comandos (Ctrl+K).
53. Modo foco.
54. Fontes em chips clicáveis dentro do texto.
55. Modo escuro e tipografia de leitura longa.
56. Atalhos para 👍/👎, copiar e "explicar mais simples".
57. "Continuar de onde parou".
58. Progresso do curso por apostila.
59. Perguntar e ouvir por voz.
60. PWA offline com as últimas respostas e flashcards.

**7. Segurança primeiro**
61. ★ Conferir cada citação contra os trechos reais antes de mostrar.
62. "Não está na apostila" quando a busca não acha nada relevante.
63. Selo de confiança baseado em apoio textual.
64. Teste de injeção de prompt nos PDFs enviados.
65. Limite de custo diário com alerta.
66. Rotação periódica das chaves.
67. Backup semanal automático do índice e do Storage.
68. Monitor de saúde dos provedores com troca automática.
69. Log de auditoria das ações de admin.
70. Testes de ponta a ponta no navegador.

**8. Gigafábrica — escala a custo quase zero**
71. ★ Custo por aluno no painel, com meta de R$ 0.
72. Fila para os modelos gratuitos em vez de 429.
73. Distribuir carga entre provedores grátis por latência.
74. Pré-gerar as 100 respostas mais comuns.
75. Comprimir os trechos antes de mandar à IA.
76. Multi-turma, cada uma com seu índice.
77. Modo professor com as dúvidas da turma.
78. API pública do material do curso.
79. Plano de migração do plano gratuito do Supabase.
80. O projeto como material da aula ("monte seu RAG").

## Apêndice B — 80 ideias, estilo Steve Jobs (filosofia de produto)

Pela régua de foco, a lista termina com as três que sobreviveriam ao corte.

**1. Foco: dizer não**
1. Uma promessa: "estude a sua apostila com um professor que nunca inventa".
2. De 14 abas para 3: Estudar, Praticar, Meu material. ← **escolhida**
3. Perfis, Elenco e Suporte de TI fora do app de estudo.
4. Esconder o seletor de provedor e modelo.
5. Um público: o aluno na véspera da prova.
6. Nada novo até o atual ser excelente.
7. Remover configurações que existem por indecisão.
8. Uma métrica: "o aluno passou na prova?".
9. Resolver em vez de avisar (sem avisos técnicos na tela).
10. Roadmap de uma página.

**2. "Simplesmente funciona"**
11. Abrir e já estar numa pergunta.
12. Colar, fotografar ou digitar na mesma caixa.
13. Nunca mostrar erro de provedor; trocar de modelo e responder. ← **escolhida**
14. Resposta começando em menos de 1 segundo.
15. Subir apostila é arrastar o PDF; o resto é automático.
16. Lembrar onde o aluno parou.
17. Celular sem versão reduzida.
18. Zero configuração.
19. Erros em português humano, com o próximo passo.
20. Se não souber, diz que não sabe e aponta o que estudar. ← **escolhida**

**3. Começar pela experiência do aluno**
21. Desenhar em cima da véspera da prova, hora a hora.
22. Primeira tela responde "o que eu estudo agora?". ← **escolhida**
23. Toda resposta termina com um próximo passo.
24. Nunca mostrar "RAG", "embedding" ou "chunk".
25. Citação abre a página com o trecho destacado.
26. 10 minutos no ônibus são uma experiência completa.
27. Progresso visível por capítulo.
28. Depois da prova, o aluno conta como foi.
29. Onboarding como uma pergunta de exemplo já respondida.
30. Entrevistar 5 alunos por mês.

**4. Design: tecnologia e artes liberais**
31. Tipografia de livro nas respostas.
32. Uma paleta, uma fonte-base, espaçamento generoso.
33. Animação só onde explica algo.
34. Exemplo concreto antes da definição.
35. Diagramas gerados para conceitos visuais.
36. Tom de voz escrito e aplicado em todos os prompts.
37. Tela desenhada em papel antes do código.
38. Modo escuro pensado.
39. Microtexto revisado como impresso.
40. Apostila gerada com diagramação de editora.

**5. Momentos mágicos**
41. Foto da questão → explicação com a página da apostila.
42. "Explique como se eu tivesse 12 anos" num toque.
43. Sugerir pausa ao perceber cansaço.
44. Resumo de véspera com o que o aluno mais errou.
45. Apostila em áudio.
46. Perguntar e ouvir pelo fone.
47. "Monte uma prova parecida com a do semestre passado."
48. O código da apostila roda dentro da resposta.
49. Marcar um trecho do PDF e perguntar sobre ele.
50. Parabéns de verdade ao dominar um capítulo.

**6. O produto é o herói**
51. Demo de 2 minutos.
52. Página inicial com uma pergunta real sendo respondida.
53. Cada lançamento é uma coisa só.
54. Vídeo de antes e depois.
55. Nomes na linguagem do aluno ("Me testa").
56. Depoimento com nota real.
57. Uma surpresa em cada versão.
58. Divulgação com o mesmo cuidado do app.
59. Uma frase que resume o produto.
60. Só lançar o que se demonstraria ao vivo.

**7. Controlar o todo**
61. Curadoria das apostilas.
62. Padrão de qualidade de PDF aplicado no upload.
63. Glossário oficial do curso.
64. Questões aprovadas pelo professor.
65. Cada prompt com dono e revisão.
66. Modelo escolhido por qualidade medida.
67. Um lugar para ver tudo que o aluno fez.
68. Calendário da turma no plano de estudos.
69. Professor vê as dúvidas da turma.
70. Parceria com os autores das apostilas.

**8. A parte de trás do armário**
71. Código limpo onde ninguém olha.
72. Toda resposta checada contra a fonte.
73. Testes que protegem a experiência.
74. Tempo de resposta com meta.
75. Segredos tratados como cofre.
76. Acessibilidade completa.
77. Nenhum texto quebrado chegando ao aluno.
78. Revisão de cada detalhe antes do lançamento.
79. Documentação interna legível em uma tarde.
80. Código-fonte feito com cuidado.
