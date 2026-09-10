# Correções de 10/09/2026

Revisão completa do projeto, feita a partir do backup do deploy e validada contra
o projeto Supabase vivo (`eng-prompt-rag`, ref `kbdblnbkasxrkctfkoua`).

Resumo: **50 testes automatizados passando**, backend e frontend reescritos nos
pontos problemáticos, e três falhas reais de perda de dados fechadas.

---

## 1. O banco estava apagável com a chave pública (crítico)

Medido antes de corrigir, com a chave *publishable* que o backend usa:

| Teste com a chave anon | Resultado |
|---|---|
| `DELETE /ementas_chunks` | **204** — apagava |
| `INSERT /glossario_termos` | passava a autorização |
| `DELETE /glossario_termos` | **204** — apagava |

O RLS estava desligado/permissivo, então qualquer pessoa podia apagar o acervo
sem passar pela API.

**Correção:** `supabase-backup/migracoes/2026-09-10-rls-e-glossario.sql` liga o
RLS nas duas tabelas, remove políticas antigas, cria leitura pública e deixa a
escrita exclusiva para a `service_role`. O backend passou a separar as chaves:
leitura (busca vetorial, glossário) com a anon; escrita e Storage com a
service_role (`_h_escrita`, `_h_documentos`).

## 2. Reindexar podia apagar o material (crítico)

O índice tem 384 dos 526 chunks (73%) vindos de
`Empreendedorismo_Inovacao_Tecnologia_completo.pdf`, cujo arquivo não existe no
Storage. Dois caminhos destruíam esse conteúdo sem aviso:

- **`/api/upload`** com o mesmo nome de uma fonte indexada executava
  `apagar_chunks_por_fonte` na hora, sem comparar nada. Subir um PDF que não
  extrai texto no lugar de um indexado apagava o material e não punha nada no lugar.
- **`/api/ingerir`** apagava os chunks antes de saber se a extração produzia algo.

**Correção:** nós dois caminhos, antes de apagar, o backend compara **quanto
texto** o arquivo novo cobre com o que está indexado hoje. Se cobrir menos de
60%, responde `409` com os números e exige confirmação explícita (`forcar`).

A comparação é sobre **caracteres**, não sobre quantidade de chunks. O chunker
novo gera trechos de ~900 caracteres (antes: cortes de 500), então uma
reindexação sadia produz *menos* chunks com o mesmo conteúdo — comparar contagem
acusaria perda falsa e ensinaria a confirmar sem ler. Medido nos PDFs reais:

| Documento | Chunks | Texto |
|---|---|---|
| `Praticas_Gerenciais_Inovacao_Empresarial.pdf` | 132 → 74 | 59.626 → 60.076 chars (sem perda) |
| `Nous_Portal_Model_Prices - Summary.pdf` | 7 → 4 | 2.247 → 2.206 chars |
| `Empreendedorismo_Inovacao_Tecnologia.pdf` | 2 → 1 | 749 → 699 chars |

Rota nova `POST /api/ingerir/previa` (dry-run) mostra o que a reindexação faria
sem gravar nada. Na interface, "Reindexar" agora exige passar pela prévia.

## 3. Núcleo de texto sem testes

As heurísticas de comparação (números, nomes, concordância) e o chunker estavam
misturados ao I/O num arquivo de 1.026 linhas. Foram para `api/rag_core.py`,
sem rede, cobertas por `tests/`.

- **Chunker:** cortava a cada 500 caracteres sem olhar fronteira de palavra —
  havia 19 chunks abaixo de 60 caracteres e 2 duplicados no índice. Agora corta
  em fim de parágrafo/frase, ~900 caracteres com 120 de sobreposição, e descarta
  fragmento curto isolado.
- **Siglas em caixa alta não eram capturadas.** A regra exigia maiúscula
  seguida de minúsculas, então `NEOSA`, `ASCII` e `LGPD` — justamente os termos
  mais técnicos — nunca entravam na comparação entre modelos. Corrigido, com
  lista de exclusão para caixa alta de formatação (`ATENÇÃO`, `RESUMO`).

## 4. Seletor de provedor travava em vazio

`useState(Object.keys(providers)[0] ?? '')` rodava no primeiro render, quando a
lista ainda era `{}`: o estado ficava `''` e o backend respondia
`400 Provedor desconhecido: `. Só a aba Comparar escapava. Agora um hook
(`lib/useProviderModel.ts`) sincroniza provedor e modelo quando a lista chega,
prefere um provedor com chave configurada e desabilita os botões até estar pronto.

## 5. Glossário quebrava em banco restaurado

`glossario_termos` era usada pelo código mas faltava no `recriar-banco.sql`.
Confirmado no servidor que `termo_normalizado` é coluna **gerada**
(`lower(termo)`, erro 428C9 em insert direto) e que o índice único existe. O SQL
de recriação agora traz a tabela, o índice HNSW da busca vetorial, o
`search_path` da função e as políticas de RLS — um banco restaurado do zero já
nasce fechado.

A gravação também falhava em silêncio (`except httpx.HTTPStatusError: pass`):
agora devolve `aviso_salvamento` na resposta e a interface mostra o aviso.

## 6. Rotas de escrita sem autenticação

`CORSMiddleware(allow_origins=["*"])` e nenhuma rota protegida: qualquer um
podia subir/apagar documentos e queimar as chaves de IA pagas.

**Correção:** `ADMIN_TOKEN` por ambiente + header `X-Admin-Token` em
`/api/upload`, `/api/ingerir`, `/api/ingerir/previa` e `/api/duplicatas`.
Falha fechada: sem `ADMIN_TOKEN` configurado, as rotas respondem `503` em vez de
abrir. A interface ganhou o campo de token (`components/AdminToken.tsx`), e o
cabeçalho mostra **⚠ escrita insegura** enquanto o backend escrever com a anon.

CORS passou a ser restrito por `ALLOWED_ORIGINS`, com limites de `n` na busca
(1–20), 25 MB por upload e cache de 30 s no `/api/status` (era um `count=exact`
a cada 30 s por aba).

> **Limitação honesta do rate limit:** o contador é por instância do serverless,
> então barra abuso trivial mas não substitui autenticação. Para limite
> confiável, usar o Firewall da Vercel ou um contador externo.

## 7. Material perdido — reconstruído

`scripts/reconstruir_material.py` remonta os 384 chunks por página (removendo a
sobreposição de 50 caracteres entre chunks vizinhos) e gera, em
`supabase-backup/reconstruido/`:

- `*.txt` — referência legível, com marcador de página.
- `*.pdf` — **uma página de PDF por página original**, que é o artefato
  reindexável. Um `.txt` viraria tudo "página 1" e destruiria as citações
  ("[Fonte: x, página 3]"), que são o que dá credibilidade às respostas.

Fidelidade medida no round-trip (PDF gerado → reextraído → comparado com o
texto original): **0,9994 de média, 0,987 no pior caso**, em 113 páginas.

Fidelidade não é identidade: o texto vem do que o extrator leu do PDF sumido,
então quebras de linha podem diferir do arquivo original.

Para restauração **sem perda**, `scripts/reimportar_chunks.py` reinsere os
chunks com os embeddings originais — nada é re-embedado.

---

## 8. O que só a verificação em produção revelou

Com o deploy publicado e as chaves reais ativas, o smoke test apontou defeitos que
os testes locais não podiam pegar:

| Achado | Evidência | Correção |
|---|---|---|
| `/api/glossario` respondia **504** | estourava os 60 s da função | timeouts derivados do orçamento da função + contexto de 25 → 12 chunks + retentativa só se houver tempo |
| O modelo **padrão era o mais lento** de todos | `meituan/longcat-2.0:free` 16,6 s contra 1,9 s do mais rápido, numa pergunta trivial | listas reordenadas por latência medida, gratuitos e rápidos primeiro |
| `/api/comparar` dava "indefinida" com respostas válidas | o modelo ignorava a linha `RESPOSTA DIRETA:` exigida pelo prompt | conclusão de reserva (última linha útil) |
| Mesmo modelo em dois slots zerava a comparação | dois rótulos iguais colapsavam num só | rótulos desambiguados (`x #2`) |
| **OpenRouter estava quebrado** | 429 em todos os modelos: cota diária gratuita esgotada (0/50) | não é bug de código — documentado; a mensagem do provedor chega ao usuário |
| Chave do Groq **funciona** | `gpt-oss-120b` 1,2 s, `compound-mini` 1,8 s | provedor reincluído como padrão da interface |
| Qualidade varia muito com contexto grande | glossário: Groq/compound-mini **34 termos em 15,8 s** vs laguna-xs 2 termos em 43,5 s | documentado; Groq é o padrão |

`scripts/medir_latencia.sh` refaz a medição de latência de um provedor inteiro
quando as listas de modelos forem atualizadas — a ordenação é dado, não palpite.

> **Limite honesto da reordenação:** a latência foi medida com pergunta trivial.
> Ela **não prevê** o comportamento com contexto grande (o laguna-xs é o mais
> rápido no trivial e o mais lento no glossário). Para o glossário, prefira Groq.

## Como aplicar

### Estado em 10/09/2026

| Item | Situação |
|---|---|
| Código | ✅ publicado — GitHub `nenzinhu/eng-prompt-rag-final` (privado) e Vercel produção |
| `ADMIN_TOKEN` | ✅ configurado na Vercel (produção) |
| `SUPABASE_SERVICE_ROLE_KEY` | ⏳ **pendente** — sem ela o backend escreve com a chave pública |
| Migração de RLS | ⏳ **pendente** — aplicar só depois da service_role |
| Material reconstruído | ⏳ pendente — subir o PDF reconstruído e reindexar |

### 1. Credenciais (`.env`, já no `.gitignore`)

Preencher `SUPABASE_SERVICE_ROLE_KEY` e `NOUS_API_KEY` (ou outro provedor).
O `ADMIN_TOKEN` já foi gerado.

### 2. Deploy do backend

Publicar o código novo **antes** de ligar o RLS — o backend precisa já escrever
com a service_role, senão upload e ingestão param no mesmo instante.

### 3. Migração do banco

Rodar `supabase-backup/migracoes/2026-09-10-rls-e-glossario.sql` no SQL Editor
do Supabase. Depois conferir (esperado):

```
DELETE /ementas_chunks com a chave anon   → 401/403   (antes: 204)
INSERT /glossario_termos com a chave anon → 401/403   (antes: passava)
GET    /ementas_chunks com a chave anon   → 200       (leitura segue pública)
```

### 4. Material reconstruído

Subir `supabase-backup/reconstruido/Empreendedorismo_Inovacao_Tecnologia_completo.pdf`
pelo painel PDFs (passa pelo guarda de perda) e reindexar.

---

## Verificação

```bash
.venv/Scripts/python.exe -m pytest tests/ -q          # 58 testes, sem rede
.venv/Scripts/python.exe -m uvicorn api.index:app --port 8000 --env-file .env
.venv/Scripts/python.exe scripts/smoke.py             # bate nas rotas reais
.venv/Scripts/python.exe scripts/smoke.py --url https://eng-prompt-rag-final-nenzinhus-projects.vercel.app
```

Resultado em produção (10/09/2026, após o deploy): **19 de 20** verificações
passando com o provedor Nous e **16 de 17** com o Groq. A única falha é
`escrita_via=anon`, que é exatamente a service_role pendente — não é defeito de
código.

Cobertura do `smoke.py`: leitura (`status`, `config`, `providers`, `pdfs`),
proteção das rotas de escrita (401 sem token / 503 sem `ADMIN_TOKEN`), prévia de
ingestão sem alterar nada, busca vetorial com limite de `n`, e as quatro rotas de
IA (`perguntar`, `resolver`, `glossario`, `comparar`).

Outros scripts: `backup_dump.py` (dump datado do banco),
`comparar_extracao.py` (efeito do fontTools na extração),
`verificar-guarda-upload.sh` (guarda de upload contra produção),
`medir_latencia.sh` (latência dos modelos de um provedor).
