# Relatório — Análise cirúrgica do Eng. Prompt RAG

**Projeto:** `C:\Users\PMSC\Desktop\release\eng-prompt-rag-final-main` · **Data:** 17/09/2026
**Método:** 4 agentes (Auditor, Verificador, Estrategista, Juiz) em 5 ciclos, com críticas cruzadas e réplicas.
**Foco pedido:** correções de bug, melhorias e sugestões de features.

Cada afirmação aqui aponta para o ID de origem, e a conversa completa está nos arquivos `00` a `06` desta pasta. Nada foi alterado no projeto durante a análise, e a produção não foi chamada em nenhum momento.

---

## 1. Resumo executivo

O projeto está funcional e mais bem cuidado que a média: 145 testes Python e 35 JS passam, o lint e a checagem de tipos não apontam nada, o build sai limpo e a revisão de 10/09/2026 fechou falhas reais de segurança e de perda de dados.

Abaixo dessa superfície, os agentes encontraram e **reproduziram** 3 defeitos que quebram no uso normal, 12 de gravidade média e vários menores. Dois têm efeito visível para o aluno todo dia: o "Resolver Questão" manda para a IA só um pedaço do enunciado, e o Gerador de Apostilas em PDF falha com caracteres que o próprio app gera. Um terceiro é de custo: uma única requisição de resumo dispara até 41 chamadas de IA ao mesmo tempo, o que passa do limite por minuto das contas gratuitas e pode deixar todos os alunos sem IA.

A ressalva mais importante é que **quase toda a gravidade é condicional a informações que ninguém tem**: quem usa o app, quantos são, qual o plano das chaves de IA e se o endereço é público. Cinco perguntas de poucos minutos mudam a ordem do plano inteiro (seção 14).

**Onde há mais risco de errar:** os agentes mediram código, não pessoas. Se o app tem pouquíssimos usuários e a URL não é divulgada, metade do plano vira precaução cara (seção 15).

## 2. Objetivo real

Permitir que o aluno estude o material do curso conversando com uma IA que responde a partir das apostilas indexadas e cita fonte e página, em vez de responder com conhecimento genérico.

Esse objetivo não está escrito em lugar nenhum do repositório: foi inferido dos prompts, que tratam o usuário como "aluno do curso de Engenharia de Prompt", e da arquitetura (`00-dossie.md`). Não há documento de produto, público definido, critério de sucesso nem métrica. Isso é a causa de quase toda a incerteza deste relatório.

Há ainda uma contradição de produto: o prompt principal manda a IA **complementar com conhecimento geral**, mas a auditoria rotula frases sem apoio no material como "provável invenção" (N5, A2-82).

## 3. Diagnóstico

### O que sabemos (sustentado por evidência)

- **A qualidade de engenharia é alta e verificável.** 145 testes Python (3,65 s) e 35 JS passam; ruff, eslint, tsc e build sem erros (`00-execucao.md`).
- **Três defeitos quebram no caminho normal**, todos reproduzidos: enunciado truncado (R2), PDF que falha (R3), erro do provedor exibido como resposta completa (R5).
- **Uma requisição custa muito mais que uma unidade de cota.** Resumir = 41 chamadas de IA; auditar = 25 embeddings e 200 buscas para 200 frases; tudo com 1 unidade de cota (A2-01, reproduzido duas vezes).
- **As contas gratuitas são pequenas.** Groq Free: 30 requisições por minuto e 250 por dia no modelo padrão. OpenRouter gratuito: 20 por minuto e 50 por dia sem crédito (A2-94, reconferido pelo Juiz no HTML da documentação).
- **O fluxo de envio de material anuncia sucesso onde houve bloqueio ou perda** (R6, três reproduções independentes).
- **As heurísticas de confiança têm viés medido**: a auditoria ignora acentos (cobertura 0,782 contra 1,0; 3,5% das frases mudam de classificação) e não percebe negação; o Comparar acusa divergência quando um modelo escreve "5" e o outro "cinco" (R7).
- **O ambiente não é reproduzível**: dependências sem versão fixada, três versões de Python em jogo (R10).

### O que acreditamos (hipótese ou inferência razoável)

- O app roda em produção na Vercel com Python 3.12, porque é o padrão quando nada é declarado (A2-48).
- O PDF em produção falha com frequência, porque 4 dos 44 termos reais gerados pelo app contêm um caractere que quebra a geração (A1-04, réplica C4). Isso veio do glossário, não de uma apostila.
- O público é pequeno e provavelmente ligado ao próprio dono. Nenhum agente achou evidência de turma, e o app não tem conta de aluno.

### O que não sabemos

Plano e limites das chaves de IA; se o endereço é público; quantas pessoas usam e se compartilham o mesmo IP; se a chave de serviço do Supabase e as migrações de RLS e de cota estão aplicadas; se alguma restauração de banco já foi feita; qualquer número de uso real (erros, tempos, volume).

### O que está errado

A tabela completa está na seção 4. Em uma frase: **o app é generoso com quem pede muito** (sem limite de tamanho, sem teto de chamadas por requisição), **otimista com o tempo** (orçamento por chamada e não por requisição) e **silencioso quando falha** (sucesso anunciado, trechos perdidos, erros engolidos).

### O que precisa ser mudado

Separar enunciado e alternativas de forma confiável; gerar PDF com fonte Unicode; limitar chamadas por requisição e por minuto; preservar o texto parcial e distinguir erro de fim; tratar 4xx como pendência no envio de material; corrigir a sequência de ids no roteiro de restauração; normalizar acentos na auditoria.

### O que pode ser melhorado

Curadoria da lista de modelos, contadores de erro, histórico local nas abas principais, conferência das citações, rótulo honesto na auditoria, ambiente reproduzível.

### O que precisa ser testado

Seção 12. As quatro primeiras perguntas custam minutos e decidem a prioridade de tudo.

## 4. Problemas encontrados

Severidade final segundo o veredito do Juiz (`06-veredito.md` §7.1), depois das réplicas.

| Problema | Severidade | Evidência | Impacto | Correção | IDs |
|---|---|---|---|---|---|
| Uma requisição dispara até 41 chamadas de IA simultâneas; sem limite de tamanho; um IP esgota a cota do provedor | **ALTO** (condicional) | Reproduzido 2×; limites publicados de 20–30 por minuto | Todos os alunos ficam sem IA; gasto em chave paga | Cota separada por tipo de rota, teto de resumos por IP, semáforo, limites de tamanho | A1-01 → A2-01 → A4-01 → C1 → A2-94 |
| "Resolver Questão" trunca o enunciado antes de buscar e de perguntar | **ALTO** | Reproduzido em 6 enunciados realistas | A IA analisa um fragmento; o aluno não vê o corte | Separar pelo último bloco de alternativas em ordem | A1-03 → A2-03 → A4-03 → A2-69 |
| PDF da apostila quebra com travessão, aspas curvas, "•" ou hífen inseparável | **ALTO** | 4 de 44 termos reais do app contêm o caractere que quebra | Erro 500 depois de pagar a chamada de IA, no formato padrão | Fonte DejaVu embutida; tradução como plano B | A1-04 → A2-04 → A4-04 → C4 |
| Restaurar o banco pelo roteiro documentado faz a primeira reindexação apagar os trechos novos | **MÉDIO**, corrigir já | Código e documentação; não executado em Postgres | Perda silenciosa do índice, com "✓" na tela | Uma linha (`setval`) no roteiro | A1-02 → A2-02 → A4-02 → C2 |
| Erro do provedor no meio da resposta vira "resposta completa"; texto parcial é apagado | **MÉDIO** | Reproduzido em 3 formatos, um deles o oficial do OpenRouter | Aluno lê resposta truncada como se estivesse inteira | Detectar `error`, preservar o parcial, ler `finish_reason` | A1-05 → A4-61 → A2-73 |
| Reindexar não é idempotente: a retentativa duplica trechos | **MÉDIO** | Teste reproduziu 4 inserções onde deviam ser 2 | Índice inflado e misturado | Desfazer por faixa de id e recomeçar | A1-06 → A2-06 → A4-06 |
| Envio bloqueado é registrado como "✓ Concluído" | **MÉDIO** | Código; 409 e 422 caem no mesmo caminho | Admin acredita que indexou, e não indexou | 4xx vira pendência; propagar a confirmação | A1-07 → A2-07/A2-60 → A4-07 |
| Enviar o mesmo conteúdo com outro nome mistura documentos e apaga o outro | **MÉDIO** | Reproduzido com TestClient | Perda imediata de um documento | Aplicar a guarda às duas fontes; 409 explícito | A1-08 → A2-08 → A4-08 |
| Auditoria de alucinação ignora acentos e não percebe negação | **MÉDIO** | Medido no dump: 3,5% das frases mudam de classificação | Alarme falso de invenção; contradição não detectada | Normalizar os dois lados; rótulo honesto | A1-09 → A2-09/A2-62 → A4-09 |
| Comparar Modelos acusa divergência com "5" contra "cinco" ou páginas diferentes | **MÉDIO** | Reproduzido | O veredito que orienta o estudo aponta divergência inexistente | Exigir números nos dois lados; ignorar citações | A1-10 → A2-10 → A4-10 |
| Perguntas em sequência se misturam na tela | **MÉDIO** | Código (sem cancelamento nem controle de rodada) | Resposta, fontes e auditoria de perguntas diferentes juntas | Uma rodada por vez, em função testável | A1-11 → A2-11 → A4-11 |
| Orçamento de 60 s vale por chamada; trechos se perdem em silêncio | **MÉDIO** | Embedding pode gastar ~120 s; resumo informa 40 trechos mesmo perdendo metade | Erro 504 depois do gasto; resumo incompleto apresentado como completo | Prazo por requisição, semáforo, `chunks_ok` | A1-13 → A2-13/63/68 → A4-62 |
| Login de admin sem limite de tentativas; erro 500 com caractere acentuado | **MÉDIO** (CRÍTICO se a senha do teste for real) | Reproduzido: senha acentuada dá 500; 30 tentativas, nenhuma bloqueada | Força bruta viável; admin preso fora | Comparação em bytes; limite de falhas por IP | A1-14 → A2-14 → A4-14 |
| Dependências sem versão fixada; três versões de Python | **MÉDIO** | `fastapi>=0.111` resolveu para starlette 1.6.0, com avisos de descontinuação | Deploy não reproduzível; quebra sem mudança de código | Versões fixadas e `.python-version` | A1-15 → A2-15 → A4-15 |
| Senha com aparência real no arquivo de teste | **CRÍTICO se confirmado**, senão baixo | O valor existe (fato); ser a senha real é hipótese | Acesso de administrador a quem tiver o repositório | Confirmar e, se for, trocar senha **e** segredo de sessão | A2-59 / N1 → A4-19/A4-64 |
| Falhas silenciosas: status, lista de provedores, auditoria | **BAIXO** | Reproduzido: 401 do banco vira "sem dados" | Diagnóstico errado; botões travados sem aviso | Tratar e mostrar erro | A1-19 → A2-19 → A4-36 |
| Glossário não gera na primeira navegação; OCR interrompido; anexo removido ainda insere texto; documentação divergente; postcss | **BAIXO** | Código; auditoria de dependências | Pequenos atritos e ruído | A3-07, A3-26, A3-08 | A1-12, A1-23, A2-66, A1-21, A1-22 |

## 5. Premissas

| Premissa | Status | Evidência | Como validar | IDs |
|---|---|---|---|---|
| A função termina em até 60 s | **CONTRADITÓRIA** como garantia | O orçamento vale por chamada; o embedding sozinho pode gastar ~120 s | Logs de 504 na Vercel | A2-13, A2-63 |
| Cada requisição custa cerca de 1 chamada de IA | **CONTRADITÓRIA** | Resumir = 41; auditar = 25 embeddings + 200 buscas | Contadores por rota | A2-01 |
| Os ids dos trechos são sempre crescentes | **PARCIAL** | Deixa de valer após a restauração documentada | Ensaio em Postgres | A2-02 |
| A saída do modelo cabe em Latin-1 | **CONTRADITÓRIA** | 4 de 44 termos reais quebram o PDF | — | A1-04, C4 |
| O IP do cliente não é falsificável | **VERIFICADA** na Vercel | A plataforma sobrescreve o cabeçalho | Requisição forjada em preview | A2-46 |
| Por padrão o aluno usa modelo gratuito | **PARCIAL** | 7 dos 12 modelos do Nous são pagos; só 3 estão anotados | Catálogo do provedor | A2-65 |
| Chave de serviço, RLS e migração de cota aplicadas | **NÃO VERIFICADA** | Sem acesso à produção | `/api/config` e consultas de catálogo | A2-41 |
| O aluno tem IP próprio | **HIPÓTESE** | Nenhum dado sobre o público | Perguntar ao dono | A2-16 |
| A verificação de RLS por status 204 prova algo | **CONTRADITÓRIA** | Sem política, o banco filtra em silêncio | Consultas de catálogo | A1-20, A2-20 |

## 6. Riscos

Probabilidades são estimativas dos agentes, não medições.

| Risco | Probabilidade | Impacto | Mitigação | IDs |
|---|---|---|---|---|
| Um aluno esgota a cota gratuita e derruba a IA para todos | Média se a URL for pública; estimativa | Alto: app sem IA até o dia seguinte | Cota por tipo de rota, teto de resumos, semáforo | A1-01, A2-94 |
| Senha de admin exposta no repositório | Desconhecida; decidida em minutos | Crítico: controle do acervo | Confirmar e rotacionar senha e segredo de sessão | A2-59, A4-64 |
| Perda silenciosa do índice ao reenviar o material reconstruído | Média, porque a pendência está aberta desde 10/09 | Alto: 73% do acervo | Corrigir o fluxo antes de reenviar | A4-52, A2-95 |
| Perda do índice após restaurar o banco | Baixa, condicional | Alto | `setval` no roteiro | A1-02 |
| Deploy quebrar sozinho por dependência nova | Média em alguns meses; estimativa | Médio | Versões fixadas | A1-15 |
| Aluno estudar por resposta truncada sem perceber | Alta no Resolver; frequência não medida | Médio | Corrigir a separação e exibir o enunciado usado | A1-03 |
| As próprias correções introduzirem defeito novo | Média: não há nenhum teste de interface | Alto | Fazer por partes, com teste de regressão a cada item | §15 |

## 7. Oportunidades

1. **Medir de graça o que hoje é palpite:** a tabela de cota já grava uso; dá para contar erros (504, 429, respostas truncadas) sem serviço novo (A3-10).
2. **Curadoria da lista de modelos:** o próprio código anota modelos de 16,6 s, 47,7 s e ~90 s, e um provedor com cota diária esgotada. Tirar ou marcar isso reduz falhas sem mexer no fluxo (A3-25).
3. **Funcionalidades pela metade que dá para completar barato:** histórico local existe e não é usado nas duas abas principais; o trecho da evidência é cortado em 3 linhas; a acurácia do Resolver é guardada sem separar por modelo (A3-16, A3-24, oportunidade 7 do Agente 3).
4. **Citação conferível sem IA:** o contexto usa formato fixo, então dá para marcar citações que não batem — desde que os modelos sigam o formato, o que precisa de amostra (A3-17, A2-81).
5. **Proteção de borda sem código:** o plano gratuito da Vercel inclui uma regra de limite por IP (A2-89).
6. **Roteiro de restauração seguro já existe:** o script que reinsere os trechos não envia id e não sofre o problema da sequência (A3-09).

## 8. Melhorias propostas

As dez primeiras estão em "AGORA" no plano. Formato: ANTES → MUDANÇA → DEPOIS → BENEFÍCIO → RISCO → VALIDAÇÃO.

**M1 — Credencial de administrador (passo 0)**
Um valor com cara de senha real está no arquivo de teste → o dono compara com a senha em uso e, se coincidir, troca a senha **e** o segredo de sessão, além de trocar onde houver reuso → o teste passa a usar valor obviamente falso → elimina o pior risco da análise → nenhum → login com a senha antiga deve falhar, e sessões antigas devem ser recusadas. (Decisão 1)

**M2 — Corrigir a sequência de ids no roteiro de restauração (A3-09)**
O roteiro importa os trechos com id e não ajusta a sequência → acrescentar o `setval` e trocar a verificação de RLS por consultas de leitura → restaurar deixa de armar uma perda silenciosa → risco eliminado com uma linha → nenhum → ensaio num Postgres local.

**M3 — PDF com fonte Unicode (A3-02)**
A fonte embutida só aceita Latin-1 → embutir a DejaVu, com tradução para Latin-1 como plano B, e timeout curto na busca opcional → a apostila sai com qualquer caractere → fim de uma falha que já ocorre → +1,46 MB no pacote; emoji fica sem desenho → gerar PDF com os 17 casos de teste, e um teste que falhe se a fonte não estiver no pacote.

**M4 — Separação de enunciado e alternativas (A3-01)**
Qualquer letra de a–e com ponto corta o enunciado → usar o último bloco de marcadores em ordem, avisar quando houver mais de uma questão e mostrar o enunciado reconhecido → a IA recebe a questão inteira → menos erro de estudo → duas questões coladas viram um caso novo, agora visível → os 11 casos de teste mais o caso "duas questões".

**M5 — Auditoria e comparação honestas (A3-01, A3-18a)**
Compara palavra sem acento com texto acentuado e chama de "provável invenção" → normalizar os dois lados, exigir números em ambos os modelos, trocar o rótulo para "não encontrada no material" e avisar que a auditoria não detecta contradição → menos alarme falso → nenhum relevante → a cobertura das frases literais sobe para 1,0.

**M6 — Limites de entrada e de tentativas (A3-03)**
Nenhum campo tem tamanho máximo e o login aceita tentativas infinitas → limites folgados, teto de frases auditadas com aviso na tela, comparação em bytes e limite de falhas por IP → fecha força bruta e o erro 500 com acento → sem a chave de serviço, o limite fica por instância → sexta tentativa em um minuto deve ser bloqueada; senha acentuada deve funcionar.

**M7 — Cota por tipo de rota (A3-11a)**
Buscar e auditar gastam a mesma cota da IA, e a auditoria automática dobra o consumo → cota própria para busca e auditoria, e teto diário de resumos por IP → o limite passa a refletir custo real → um teto baixo demais atrapalha uso legítimo → uma pergunta deve consumir exatamente uma unidade.

**M8 — Prazo, semáforo e número de trechos (A3-06)**
40 chamadas simultâneas num orçamento de 60 s → prazo por requisição, semáforo, número de trechos limitado pelo limite por minuto do provedor, e informar quantos trechos realmente entraram → sem 429 em cascata e sem resumo incompleto disfarçado → resumos com menos trechos, o que passa a aparecer na tela → com provedor simulado, zero respostas 429.

**M9 — Streaming confiável (A3-05)**
Erro do provedor vira "fim" e o texto parcial some → detectar `error`, preservar o parcial com aviso, tratar linha incompleta, uma rodada por vez → o aluno não lê resposta truncada como completa → nenhum relevante → os testes de stream terminam em "erro", não em "fim".

**M10 — Curadoria de modelos e ambiente reproduzível (A3-25, A3-08)**
A lista oferece modelos de até ~90 s e um provedor com 50 chamadas por dia; as dependências não têm versão → tirar ou marcar os lentos, anotar pagos, fixar versões e declarar a versão do Python → menos tempo esgotado e deploys previsíveis → retirar um modelo que alguém usa → nova medição de latência e CI verde com as versões fixadas.

## 9. Alternativas

| Decisão | Opção A | Opção B | Posição da análise |
|---|---|---|---|
| PDF | Fonte DejaVu embutida | Traduzir para Latin-1 | Empate técnico. DejaVu preserva símbolos e custa 1,46 MB; a tradução degrada o texto. Recomendado: DejaVu com tradução como plano B (Decisão 2) |
| Tempo da função | Prazo por requisição no código | Subir o limite da plataforma para 300 s | Prazo. O limite é único para todas as rotas, e esperar minutos por um erro é pior (Decisão 3) |
| Medição | Logs da plataforma | Contadores no banco | Contadores: a retenção dos logs é de 1 h no plano gratuito e 1 dia no Pro (Decisão 4) |
| Integridade da ingestão | Desfazer por faixa de id, sem migração | Controle de execução com colunas novas | Sem migração. Menos risco para um acervo de 5 documentos |
| Proteção contra abuso | Cota no código | Regra de limite na borda da Vercel | Complementares. A regra da borda conta requisições; a cota entende custo |

## 10. Pontos de discordância

**D1 — Quantos trechos o resumo deve usar**
Agente 3 defende manter 40 com semáforo; Juiz e Verificador defendem limitar pelo teto por minuto do provedor (cerca de 26 com 30 por minuto). Evidência: limites publicados e a reprodução com 50 respostas recusadas. Falta o plano real das chaves. **A evidência sustenta o limite por minuto.**

**D2 — Questões coladas no mesmo campo**
O novo método de separação melhora quase tudo, mas junta duas questões num enunciado só. Falta um conjunto real de questões para decidir entre recusar com aviso ou dividir sozinho.

**D3 — Valores de semáforo e de teto de resumos**
Ninguém tem o número certo. O Juiz defende que venham de configuração, e não fixos no código, para não repetir o limite fixo que existe hoje.

**D4 — Base de calibração**
O Agente 3 propõe contadores no banco; o Verificador mostra que eles dependem da chave de serviço e são apagados em 2 dias. **Enquanto a chave de serviço não estiver confirmada, medir é impossível.**

**D5 — Gravidade da restauração (A1-02)**
Auditor via ALTO; Verificador e Juiz fixaram MÉDIO, com correção imediata. O argumento "dá para recuperar pelos backups" foi **retirado pelos dois**, porque a perda é silenciosa.

**D6 — Confiabilidade de uma das fontes**
O Verificador admitiu que o resumidor de páginas web **inventou uma frase** que ele havia citado, e já tinha errado antes. As conclusões que dependem só dele (semântica de identidade no PostgreSQL, RLS no PostgREST, alcance das falhas da postcss) ficam marcadas como frágeis.

## 11. Informações que faltam

1. O valor no arquivo de teste é, ou foi, a senha real de administrador?
2. A chave de serviço do Supabase está configurada? (`/api/config` responde isso)
3. Plano da Vercel, retenção de logs, proteção de borda ligada, limite de tempo em uso.
4. Plano e limites de cada chave de IA; existe chave paga com saldo?
5. O endereço é público? Quantas pessoas usam? Compartilham IP?
6. As migrações de RLS (10/09) e de cota (16/09) foram aplicadas?
7. Alguma restauração de banco já foi feita pelo roteiro documentado?
8. Um conjunto de questões reais do curso e uma amostra de apostilas geradas.

## 12. Testes recomendados

**Minutos, e destravam o resto:** itens 1 a 5 da seção 11.

**Horas, e decidem gravidade:**
6. Passar 10 ou mais questões reais pela separação de alternativas, hoje e com a correção.
7. Contar caracteres fora do Latin-1 em 10 ou mais apostilas geradas.
8. Exportar 20 respostas pelo botão ".md" para medir tamanho e formato de citação.
9. Ensaio de restauração num Postgres com pgvector: conferir a sequência, a colisão a partir do id 942 e o `setval`.
10. Supabase local: busca do glossário com aspas, termo repetido, DELETE sem política, versão do pgvector.
11. Rodar a medição de latência com as chaves: confirmar modelos vivos e testar esconder o raciocínio do modelo Qwen.
12. Num deploy de teste: dois arquivos de 3 MB no envio, um stream longo com modelo lento e a fonte presente no pacote.

## 13. Plano de ação

**AGORA** (estimativa de 30 a 50 h no total; nenhum item depende de informação que falta, exceto onde indicado)

| Ordem | Item | Entrega | Condição |
|---|---|---|---|
| 0 | Passo 0 | Confirmar a credencial e ler `/api/config` | — |
| 1 | A3-09 | `setval` no roteiro; verificação de RLS só de leitura | — |
| 2 | A3-25 | Curadoria da lista de modelos | Tirar um modelo específico só depois de medir |
| 3 | A3-18a | Rótulo honesto na auditoria | — |
| 4 | A3-02 | PDF com DejaVu; busca opcional com timeout curto | — |
| 5 | A3-01 | Enunciado, auditoria com acento, comparação numérica, busca do glossário | Testar a busca num PostgREST local |
| 6 | A3-03 | Limites, teto de frases, login em bytes com limite de falhas | — |
| 7 | A3-11a | Cota por tipo de rota; teto de resumos por IP | Chave de serviço |
| 8 | A3-10 | Contadores de erro | Chave de serviço; senão, configurá-la antes |
| 9 | A3-06 | Prazo, semáforo, trechos pelo limite do provedor | — |
| 10 | A3-05 | Streaming e rodada única | Depende de A3-06 |
| 11 | A3-04 | Fluxo de envio e ingestão | — |
| 12 | A3-08 | Versões fixadas, Python declarado, documentação | — |

**PRÓXIMO:** desfazer ingestão com falha (A3-12) → reenviar o material reconstruído sem o marcador de página (A3-13) → perguntas de referência para medir a busca (A3-14) → correções de interface (A3-07), OCR e anexo (A3-26 + A1-23) → histórico local (A3-16) → trecho completo na evidência (A3-24 passo 1) → conferência de citações (A3-17, se a amostra confirmar o formato).

**DEPOIS:** cota ponderada por custo (A3-11b), modo "só o material" (A3-18b), painel do admin (A3-19), filtro por apostila (A3-20), retorno do aluno (A3-22), divisão do arquivo principal (A3-15).

**NÃO FAZER AGORA:** link direto para o PDF no armazenamento privado, porque o link assinado não pode ser revogado e 73% dos arquivos não existem; flashcards e simulado, retirados pelo próprio Agente 3 por falta de demanda e risco de ensinar conteúdo errado; migrar para o Next 16; subir o limite de tempo sem prazo por requisição.

**VALIDAÇÃO:** cada item AGORA entra com teste de regressão próprio, listado na seção 8. Depois de A3-10, os contadores de erro passam a ser o critério para calibrar limites.

**ESCALA:** só faz sentido falar de escala (filtro por apostila, várias turmas, conta de aluno) depois de existir medição de uso. Hoje não há nenhuma.

## 14. Perguntas que ainda precisam ser respondidas

1. Quem usa este app, quantos são e o endereço é público?
2. As chaves de IA são gratuitas ou pagas, e há teto de gasto?
3. O material reconstruído vai ser reenviado? Quando?
4. A contradição de produto é intencional: a IA deve completar com conhecimento geral, ou responder só com o material?
5. Por que existem as abas Perfis Comportamentais, Elenco e Suporte em TI, fora do objetivo de estudo? Elas seguem no produto?
6. Há exigência de LGPD ou institucional que limite guardar uso, retorno do aluno ou logs?
7. Quem mantém o projeto e com quanto tempo por semana? Isso decide entre o plano completo e o mínimo da seção 15.

## 15. Conclusão técnica

O que está sustentado por evidência reproduzida:

1. **Três defeitos quebram no uso normal** (enunciado truncado, PDF, erro de stream exibido como resposta completa) e devem ser corrigidos independentemente de qualquer informação que falte.
2. **O app não tem defesa proporcional ao custo que uma requisição pode gerar.** Isso é fato de código; o dano depende de o endereço ser alcançável e do plano das chaves, que ninguém verificou.
3. **O fluxo de envio de material anuncia sucesso onde houve bloqueio ou perda**, e a pendência mais antiga do projeto (reenviar 73% do acervo) passa exatamente por esse caminho. Corrigir antes de reenviar.
4. **Falta medição.** Sem ela, todo limite do app é palpite, inclusive os que a análise propõe.
5. **Uma pergunta de minutos pode ser crítica:** se a senha do arquivo de teste for a real, ela vale mais que todo o resto deste relatório.

**Argumento mais forte contra estas conclusões**, apresentado pelo próprio Juiz: quase toda a gravidade aqui é condicional a um contexto que ninguém verificou, e a evidência disponível aponta para um app com pouquíssimos usuários. Se a URL não é divulgada e as chaves são gratuitas de uso pessoal, o risco de abuso é teórico, a restauração nunca vai acontecer e as falhas de frequência desconhecida podem nunca ter atingido um aluno. Nesse cenário, o plano completo é seguro caro, pago com o recurso mais escasso do projeto: uma pessoa. Pior: **o plano é, ele mesmo, o maior risco de regressão identificado** — não há nenhum teste de interface, e as mudanças tocam o caminho principal.

A versão mínima defensável, entre 8 e 14 horas, que o Juiz aceita sem nenhuma informação nova: **passo 0 (credencial), A3-09 (uma linha), A3-25 (curadoria), A3-02 (PDF), A3-01 (enunciado e auditoria) e A3-18a (rótulo)**. O resto deveria esperar as respostas da seção 11.

**Incertezas que este relatório não esconde:** a frequência dos defeitos de A1-03, A1-04, A1-05 e A1-11 não foi demonstrada; o estado de produção é desconhecido; a restauração e o comportamento do banco não foram executados; e três conclusões dependem de uma fonte de documentação que errou duas vezes nesta análise.

---

## Arquivos da análise

| Arquivo | Conteúdo |
|---|---|
| `00-dossie.md` | Dossiê descritivo, camadas, afirmações a verificar, lacunas |
| `00-execucao.md` | Testes, lint, tipos, build e auditoria de dependências executados |
| `01-auditor.md` | Agente 1: 22 achados com evidência e severidade |
| `02-verificador.md` | Agente 2: 65 verificações, com fontes e reproduções |
| `03-estrategista.md` | Agente 3: 24 propostas, alternativas e "o que não fazer" |
| `04-revisor.md` | Agente 4: 65 vereditos, riscos ignorados, contestações |
| `05-contra-auditor.md` | Réplica do Agente 1 |
| `05-contra-verificador.md` | Réplica do Agente 2 e verificação das propostas |
| `05-contra-estrategista.md` | Réplica do Agente 3 e lista final priorizada |
| `06-veredito.md` | Veredito final, registros de decisão e tabela consolidada |
