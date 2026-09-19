# Ideias do projeto

Registro de ideias inovadoras. Mantido pela skill `ideias-novas`.

## Caixa de entrada

### I-001 · Histórico de respostas salvo na conta
- **Data:** 2026-09-18
- **Status:** nova
- **Problema:** o histórico fica só no navegador (`lib/useHistorico.ts`, 10 itens por aba no
  localStorage): some ao trocar de aparelho ou limpar o navegador.
- **Proposta:** para aluno logado, gravar as respostas numa tabela do Supabase com RLS por
  usuário e mostrar o mesmo histórico em qualquer aparelho. Sem login, continua como hoje.
- **Impacto:** alto — é a primeira vantagem concreta de criar conta.
- **Esforço:** médio — tabela + políticas RLS (migração), rotas no backend validando o JWT do
  Supabase, e trocar a fonte do `useHistorico`.
- **Riscos/dúvidas:** respostas podem conter texto pessoal colado pelo aluno; definir prazo de
  guarda e botão de apagar.
- **Próximo passo:** migração da tabela `historico` com RLS `auth.uid() = usuario_id`.

### I-002 · Cota de uso por aluno logado
- **Data:** 2026-09-18
- **Status:** nova
- **Problema:** o limite diário é por IP (`LIMITE_LLM_POR_DIA_IP` = 300, `api/index.py`); numa
  escola ou wi-fi compartilhado, todos gastam a mesma cota.
- **Proposta:** com login, a chave da cota passa a ser o id do usuário (`usr-dia:<id>`), com
  limite próprio; anônimo segue por IP.
- **Impacto:** alto — destrava uso em sala de aula.
- **Esforço:** médio — validar o JWT do Supabase no backend e acrescentar a chave em
  `_limitar_llm`; `consumir_cota` já aceita chaves arbitrárias (a confirmar).
- **Riscos/dúvidas:** criação de contas em massa para burlar a cota — manter o teto global e a
  confirmação de e-mail.
- **Próximo passo:** função de validação do JWT com teste, antes de mexer na cota.

### I-003 · Revisão espaçada dos termos do Glossário
- **Data:** 2026-09-18
- **Status:** nova
- **Problema:** os termos gerados ficam salvos (`glossario_termos`), mas não há nada que ajude o
  aluno a memorizá-los.
- **Proposta:** modo "revisar" com cartões (termo → explicação) e agenda simples de repetição
  espaçada (1, 3, 7, 14 dias).
- **Impacto:** médio — reforça o estudo sem chamar IA (custo zero por revisão).
- **Esforço:** baixo — só front, agenda no localStorage; na conta depois de I-001.
- **Riscos/dúvidas:** sem dado de quantos alunos usam o Glossário hoje.
- **Próximo passo:** protótipo na aba Glossário com os termos já salvos.

### I-004 · Simulado com correção citando as fontes
- **Data:** 2026-09-18
- **Status:** nova
- **Problema:** o aluno só pratica questões que ele mesmo traz (aba Resolver) ou 1–2 perguntas
  de verificação por resposta.
- **Proposta:** escolher uma apostila indexada e gerar um simulado de N questões de múltipla
  escolha; na correção, cada gabarito cita fonte e página.
- **Impacto:** alto — é o uso mais próximo da prova real.
- **Esforço:** médio — rota nova reaproveitando busca + prompts de Resolver/Verificar; cuidado
  com o limite de 60 s da função (gerar em lotes).
- **Riscos/dúvidas:** qualidade das alternativas erradas; auditar se o gabarito tem apoio no
  material antes de mostrar.
- **Próximo passo:** prompt que gera 5 questões de um trecho e teste manual com uma apostila.

### I-005 · Painel de lacunas do material
- **Data:** 2026-09-18
- **Status:** nova
- **Problema:** quando o material não cobre uma pergunta, ninguém fica sabendo; o professor
  não sabe o que falta no acervo.
- **Proposta:** registrar (sem dados pessoais) as perguntas cuja busca voltou sem trechos
  próximos e mostrar na aba PDFs, para o admin, agrupadas por tema.
- **Impacto:** médio — orienta que material enviar em seguida.
- **Esforço:** baixo — tabela nova + gravação no caminho da pergunta + lista na área restrita.
- **Riscos/dúvidas:** definir o critério de "sem resposta" (similaridade mínima) a partir de
  dados reais; perguntas podem conter texto pessoal — guardar só por prazo curto.
- **Próximo passo:** medir a similaridade das perguntas atuais para escolher o limiar.
## Avaliando
## Aprovadas / em andamento

### I-006 · Analogias do seu mundo nas apostilas geradas
- **Data:** 2026-09-18
- **Status:** feita (aguardando publicação)
- **Problema:** a apostila explica todo tema do mesmo jeito, com exemplos genéricos que não
  conversam com o aluno.
- **Proposta:** no Gerador de Apostilas, o aluno diz do que gosta (futebol, games, cozinha…) e
  cada seção ganha uma caixa **Analogia** tirada desse universo, depois da explicação correta.
- **Impacto:** médio — torna a apostila mais memorável sem mudar o conteúdo.
- **Esforço:** baixo — campo opcional em `ApostilaTab.tsx` (lembrado no navegador), campo
  `interesses` em `/api/gerar-apostila` (até 120 caracteres, entra no prompt como dado).
- **Riscos/dúvidas:** analogia forçada ou que distorce o conceito — o prompt manda não forçar e
  explicar o conceito antes.
- **Próximo passo:** publicar e gerar apostilas reais com e sem interesses para comparar.
- **Histórico:** 2026-09-18 nova → feita, junto com o PDF novo da apostila (capa, sumário,
  seções numeradas, caixas de destaque, tabelas).
## Feitas
## Descartadas
