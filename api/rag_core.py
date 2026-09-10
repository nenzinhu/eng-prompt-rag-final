"""Núcleo de texto do RAG — funções puras, sem rede e sem Supabase.

Extraído de `api/index.py` para poder ser testado sem credenciais. Nada aqui
faz I/O: recebe texto e devolve texto/estruturas. `index.py` importa daqui.

O que vive aqui:
- `chunk_texto`          divisão do material em trechos indexáveis
- `extrair_alternativas` leitura de questões de múltipla escolha coladas
- heurísticas de comparação entre modelos (números, nomes, concordância)
- limpeza de respostas (blocos `<think>`, linha `RESPOSTA DIRETA:`)
"""
from __future__ import annotations

import re
import unicodedata

# ── Chunking ────────────────────────────────────────────────────────────────

TAMANHO_CHUNK = 900
SOBREPOSICAO_CHUNK = 120
MINIMO_CHUNK = 80


def _dividir_em_unidades(texto: str, tamanho: int) -> list[str]:
    """Quebra o texto em parágrafos/frases que caibam em `tamanho`.

    A versão anterior cortava a cada N caracteres sem olhar onde estava
    cortando, o que produzia fragmentos começando no meio de uma palavra e
    trechos-lixo de 2 caracteres. Aqui o corte respeita fim de parágrafo e,
    quando o parágrafo é maior que o limite, fim de frase.
    """
    unidades: list[str] = []
    for paragrafo in re.split(r"\n\s*\n", texto):
        paragrafo = re.sub(r"[ \t]+", " ", paragrafo).strip()
        if not paragrafo:
            continue
        if len(paragrafo) <= tamanho:
            unidades.append(paragrafo)
            continue
        # Parágrafo maior que o limite: quebra por frase.
        for frase in re.split(r"(?<=[.!?])\s+", paragrafo):
            frase = frase.strip()
            if not frase:
                continue
            if len(frase) <= tamanho:
                unidades.append(frase)
                continue
            # Frase maior que o limite (texto corrido sem pontuação): corte seco,
            # mas sempre no espaço mais próximo à esquerda para não partir palavra.
            resto = frase
            while len(resto) > tamanho:
                corte = resto.rfind(" ", 0, tamanho)
                if corte <= 0:  # palavra sozinha maior que o limite — corta mesmo
                    corte = tamanho
                unidades.append(resto[:corte].strip())
                resto = resto[corte:].strip()
            if resto:
                unidades.append(resto)
    return unidades


def _cauda_em_palavra(texto: str, tamanho: int) -> str:
    """Últimos `tamanho` caracteres do texto, começando numa palavra inteira."""
    if tamanho <= 0:
        return ""
    cauda = texto[-tamanho:]
    espaco = cauda.find(" ")
    if espaco > 0:
        cauda = cauda[espaco + 1 :]
    return cauda.strip()


def chunk_texto(
    texto: str,
    tamanho: int = TAMANHO_CHUNK,
    sobreposicao: int = SOBREPOSICAO_CHUNK,
    minimo: int = MINIMO_CHUNK,
) -> list[str]:
    """Divide o texto em trechos de ~`tamanho` caracteres, com sobreposição.

    Trechos menores que `minimo` são absorvidos pelo vizinho; se sobrar um
    fragmento curto isolado (página só com "#SAIBA MAIS#"), ele é descartado —
    era esse tipo de ruído que poluía a busca vetorial.
    """
    texto = (texto or "").strip()
    if not texto:
        return []

    chunks: list[str] = []
    atual = ""
    for unidade in _dividir_em_unidades(texto, tamanho):
        candidato = f"{atual} {unidade}".strip() if atual else unidade
        if len(candidato) <= tamanho:
            atual = candidato
            continue
        if atual:
            chunks.append(atual)
        atual = unidade
    if atual:
        chunks.append(atual)

    if sobreposicao > 0 and len(chunks) > 1:
        com_sobreposicao = [chunks[0]]
        for anterior, seguinte in zip(chunks, chunks[1:]):
            cauda = _cauda_em_palavra(anterior, sobreposicao)
            com_sobreposicao.append(f"{cauda} {seguinte}".strip() if cauda else seguinte)
        chunks = com_sobreposicao

    # Absorve fragmentos curtos no vizinho anterior (preserva o conteúdo).
    fundidos: list[str] = []
    for chunk in chunks:
        if fundidos and len(chunk) < minimo and len(fundidos[-1]) + 1 + len(chunk) <= tamanho + sobreposicao:
            fundidos[-1] = f"{fundidos[-1]} {chunk}".strip()
        else:
            fundidos.append(chunk)

    return [c for c in fundidos if len(c) >= minimo]


# ── Questões de múltipla escolha ────────────────────────────────────────────

_RE_ALTERNATIVA = re.compile(r"(?:^|\n)\s*([A-Ea-e])\s*[).\-]\s*(.+?)(?=(?:\n\s*[A-Ea-e]\s*[).\-])|\Z)", re.DOTALL)
_RE_INICIO_ALTERNATIVA = re.compile(r"\n?\s*[A-Ea-e]\s*[).\-]")


def extrair_alternativas(texto: str) -> tuple[str, dict[str, str]]:
    """Separa o enunciado das alternativas de uma questão colada.

    Devolve `(enunciado, {"A": "texto", ...})`. O dicionário vem vazio quando
    nenhuma alternativa é reconhecida — quem chama decide o que fazer.
    """
    texto = texto or ""
    achadas = _RE_ALTERNATIVA.findall(texto)
    alternativas = {letra.upper(): conteudo.strip() for letra, conteudo in achadas}
    inicio = _RE_INICIO_ALTERNATIVA.search(texto)
    enunciado = texto[: inicio.start()].strip() if inicio else texto.strip()
    return enunciado, alternativas


def formatar_alternativas(alternativas: dict[str, str]) -> str:
    return "\n".join(f"{letra}) {conteudo}" for letra, conteudo in alternativas.items())


# ── Limpeza de resposta do modelo ───────────────────────────────────────────

_RE_THINK = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)
_RE_TAG_THINK = re.compile(r"</?think>", re.IGNORECASE)
_RE_RESPOSTA_DIRETA = re.compile(r"RESPOSTA\s*DIRETA\s*:?\**\s*(.+)", re.IGNORECASE)


def limpar_resposta(texto: str) -> str:
    """Remove blocos de raciocínio (`<think>...</think>`) que alguns modelos emitem."""
    if not texto:
        return ""
    limpo = _RE_THINK.sub("", texto)
    limpo = _RE_TAG_THINK.sub("", limpo)
    return limpo.strip()


def extrair_resposta_direta(texto: str) -> str:
    """Pega a linha `RESPOSTA DIRETA: ...` que o modelo é instruído a emitir."""
    achadas = _RE_RESPOSTA_DIRETA.findall(texto or "")
    if not achadas:
        return ""
    linha = achadas[-1].replace("*", "").strip()
    return linha[:400]


def remover_linha_resposta_direta(texto: str) -> str:
    return re.sub(r"\**\s*RESPOSTA\s*DIRETA\s*:?\**.*$", "", texto, flags=re.IGNORECASE | re.DOTALL).strip()


_RE_BLOCO_JSON = re.compile(r"\{.*\}", re.DOTALL)


def extrair_bloco_json(bruto: str) -> str | None:
    """Isola o primeiro objeto JSON de uma resposta que pode vir com texto em volta."""
    achado = _RE_BLOCO_JSON.search(bruto or "")
    return achado.group(0) if achado else None


def conclusao_fallback(texto: str) -> str:
    """Última linha útil da resposta — para modelos que ignoram a linha RESPOSTA DIRETA.

    Nem todo modelo segue a instrução de terminar com "RESPOSTA DIRETA: ...". Sem
    uma conclusão, a comparação entre modelos caía em "indefinida" mesmo com
    respostas válidas (observado em produção, 10/09/2026). A última linha não
    vazia costuma ser a conclusão.
    """
    linhas = [linha.strip() for linha in (texto or "").splitlines() if linha.strip()]
    for linha in reversed(linhas):
        limpa = re.sub(r"^[#>*•\-\d.)\s]+", "", linha).replace("**", "").strip()
        limpa = re.sub(r"\s+", " ", limpa)
        if len(limpa) >= 12:
            return limpa[:200]
    return ""


# ── Comparação de fatos entre modelos ───────────────────────────────────────

STOPWORDS = {
    "que", "qual", "quais", "para", "por", "com", "uma", "dos", "das", "the", "and",
    "sao", "ser", "esta", "estao", "como", "mais", "menos", "seu", "sua", "seus",
    "suas", "nao", "sim", "tambem", "onde", "quando", "porque", "pode", "podem",
    "deve", "devem", "esse", "essa", "isso", "este", "aquele", "aquela",
    "um", "uma", "uns", "umas", "de", "do", "da", "em", "no", "na", "nos", "nas",
    "ao", "aos", "as", "os", "e", "ou", "se", "ele", "ela", "eles", "elas",
}

# Palavras capitalizadas por início de frase / uso comum — não são nomes próprios.
NAO_SAO_NOMES = {
    "essa", "esse", "este", "esta", "isso", "aquilo", "aquele", "aquela", "alem",
    "portanto", "entao", "assim", "quando", "onde", "qual", "quais", "para", "com",
    "nao", "sim", "tambem", "porem", "contudo", "logo", "segundo", "durante",
    "apos", "antes", "depois", "aqui", "ali", "exemplo", "fonte", "pagina",
    "nota", "observacao", "resposta", "resumo", "conclusao", "introducao",
    "de", "da", "do", "das", "dos", "em", "no", "na", "nos", "nas", "ao", "aos",
    "um", "uma", "uns", "umas", "se", "ou", "e", "mas", "que", "como", "quando",
}

_RE_NUMERO = re.compile(r"\d[\d.,]*")
_RE_NOME = re.compile(r"\b[A-ZÀ-Ý][a-zà-ÿ]{2,}\b")
# Siglas em caixa alta (NEOSA, ASCII, LGPD). A regra antiga de "Palavra"
# (maiúscula + minúsculas) não pegava nenhuma delas, então o detector de
# concordância ficava cego justamente nos termos mais técnicos do curso.
_RE_SIGLA = re.compile(r"\b[A-ZÀ-Ý]{2,10}\b")

# Caixa alta que é formatação/rótulo, não nome de coisa alguma.
SIGLAS_IGNORADAS = {
    "ok", "id", "pdf", "pdfs", "txt", "json", "xml", "html", "css", "url", "urls",
    "http", "https", "api", "obs", "nota", "exemplo", "exemplos", "resposta",
    "pergunta", "questao", "questoes", "contexto", "fonte", "fontes", "pagina",
    "resumo", "total", "sim", "nao", "voce", "aluno", "alunos", "professor",
    "texto", "gabarito", "alternativa", "alternativas", "correta", "correto",
    "errada", "errado", "incorreta", "verdadeiro", "falso", "certo", "atencao",
    "importante", "observacao", "conclusao", "introducao", "apresentacao",
    "definicao", "defina", "explique", "liste", "cite", "calcule", "marque",
    "assinale", "dados", "tabela", "figura", "quadro", "parte", "item", "itens",
    "topico", "topicos", "fim", "inicio", "meio", "acima", "abaixo", "antes",
    "leia", "prova", "avaliacao", "licao", "material", "apostila", "apostilas",
    "depois", "durante", "apos", "primeiro", "segundo", "terceiro", "quarto",
    "quinto", "melhor", "pior", "muito", "pouco", "todo", "todos", "toda",
    "todas", "outro", "outra", "mesmo", "mesma", "igual", "diferente", "novo",
    "nova", "grande", "pequeno", "facil", "dificil", "sempre", "nunca",
    "apenas", "somente", "entre", "sobre", "para", "como", "quando", "onde",
    "porque", "tambem", "pois", "logo", "entao", "assim", "porem", "contudo",
    "portanto", "segundo", "conforme", "exceto", "salvo",
}


def _sem_acento_minusculo(texto: str) -> str:
    norm = unicodedata.normalize("NFKD", texto.lower())
    return "".join(c for c in norm if not unicodedata.combining(c))


def normalizar_numero(tok: str) -> str:
    """'1.000' e '1000' viram o mesmo fato; '26,3' vira '26.3'."""
    t = tok.strip().rstrip(".,")
    if re.fullmatch(r"\d{1,3}(\.\d{3})+", t):  # separador de milhar brasileiro
        t = t.replace(".", "")
    elif re.fullmatch(r"\d{1,3}(,\d{3})+", t):  # separador de milhar americano
        t = t.replace(",", "")
    else:
        t = t.replace(",", ".")
    return t


def extrair_numeros(texto: str) -> set[str]:
    """Números citados no texto, normalizados ('1.000' == '1000', '26,3' == '26.3')."""
    numeros = set()
    for tok in _RE_NUMERO.findall(texto or ""):
        n = normalizar_numero(tok)
        if n and re.search(r"\d", n):
            numeros.add(n)
    return numeros


def extrair_nomes(texto: str) -> set[str]:
    """Nomes próprios citados no texto (informativo — mais ruidoso que números).

    Descarta palavras capitalizadas que abrem frase/linha/item de lista ou que
    são rótulos seguidos de dois-pontos ("**Conecta:**", "Defina:") — são verbos
    que os modelos capitalizam por formatação, não nomes de coisa alguma.
    """
    nomes = set()
    texto = texto or ""
    terminadores = ".!?:\n"
    for m in _RE_NOME.finditer(texto):
        # é rótulo? ("Palavra:" ou "**Palavra:**")
        j = m.end()
        while j < len(texto) and texto[j] in "*_` \t":
            j += 1
        if j < len(texto) and texto[j] == ":":
            continue

        # abre frase/linha/item de lista?
        i = m.start() - 1
        while i >= 0 and texto[i] in " \t*_`-–—>#•|\"'([{":
            i -= 1
        if i < 0 or texto[i] in terminadores:
            continue

        norm = _sem_acento_minusculo(m.group(0))
        if norm in NAO_SAO_NOMES or len(norm) < 3:
            continue
        nomes.add(norm)

    # Siglas em caixa alta. Capturadas mesmo abrindo a frase — são o nome de
    # algo, não capitalização de formatação — e guardadas em minúsculas, para
    # que "NEOSA" e "Neosa" contem como o mesmo fato entre modelos diferentes.
    for m in _RE_SIGLA.finditer(texto):
        norm = _sem_acento_minusculo(m.group(0))
        if norm in SIGLAS_IGNORADAS or norm in NAO_SAO_NOMES or len(norm) < 2:
            continue
        nomes.add(norm)

    return nomes


def palavras_conteudo(texto: str) -> set[str]:
    """Vocabulário significativo — métrica AUXILIAR de semelhança de texto."""
    t = unicodedata.normalize("NFKD", (texto or "").lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    return {p for p in re.findall(r"[a-z0-9]{4,}", t) if p not in STOPWORDS}


def jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def dividir_fatos(por_modelo: dict[str, set[str]]) -> tuple[list[str], list[dict]]:
    """Separa fatos citados por 2+ modelos (comuns) dos citados por só um (exclusivos)."""
    onde: dict[str, list[str]] = {}
    for rotulo, itens in por_modelo.items():
        for item in itens:
            onde.setdefault(item, []).append(rotulo)
    comuns = sorted(i for i, modelos in onde.items() if len(modelos) >= 2)
    exclusivos = sorted(
        ({"fato": i, "modelo": modelos[0]} for i, modelos in onde.items() if len(modelos) == 1),
        key=lambda d: d["fato"],
    )
    return comuns, exclusivos


# Calibrado com medições reais: conclusões equivalentes escritas por modelos
# diferentes ficam em ~0,28-0,36 de Jaccard (a redação difere), então o limiar
# de "alta" não pode ser alto. Nomes compartilhados reforçam o acordo.
LIMIAR_ALTA = 0.30
LIMIAR_MEDIA = 0.20


def calcular_concordancia(diretas: dict[str, str]) -> dict:
    """Compara as conclusões curtas de vários modelos.

    Recebe `{rotulo: resposta_direta}`. Compara FATOS concretos (números e nomes
    próprios) em vez de vocabulário: similaridade de vocabulário não mede
    concordância — respostas divergentes ("26 milhões" vs "450 mil habitantes")
    pontuavam MAIS que respostas concordantes, porque falar do mesmo assunto já
    compartilha vocabulário.
    """
    numeros_por_modelo = {rot: extrair_numeros(d) for rot, d in diretas.items()}
    nomes_por_modelo = {rot: extrair_nomes(d) for rot, d in diretas.items()}

    numeros_comuns, numeros_exclusivos = dividir_fatos(numeros_por_modelo)
    nomes_comuns, nomes_exclusivos = dividir_fatos(nomes_por_modelo)

    conjuntos = [palavras_conteudo(d) for d in diretas.values()]
    similaridades = [
        jaccard(conjuntos[i], conjuntos[j])
        for i in range(len(conjuntos))
        for j in range(i + 1, len(conjuntos))
    ]
    similaridade = round(sum(similaridades) / len(similaridades), 3) if similaridades else 0.0

    # Divergência de número na conclusão = conflito concreto (26 mi vs 460 mil).
    divergencia_numerica = len(diretas) >= 2 and bool(numeros_exclusivos)

    if len(diretas) < 2:
        nivel = "indefinida"
    elif divergencia_numerica:
        nivel = "baixa"  # conflito verificável
    elif len(nomes_comuns) >= 2 or similaridade >= LIMIAR_ALTA:
        nivel = "alta"
    elif similaridade >= LIMIAR_MEDIA:
        nivel = "media"
    else:
        nivel = "baixa"

    return {
        "nivel_concordancia": nivel,
        "divergencia_numerica": divergencia_numerica,
        "similaridade_conclusoes": similaridade,
        "numeros_comuns": numeros_comuns,
        "numeros_exclusivos": numeros_exclusivos,
        "nomes_comuns": nomes_comuns,
        "nomes_exclusivos": nomes_exclusivos,
        "sem_fatos": not any(numeros_por_modelo.values()) and not any(nomes_por_modelo.values()),
    }
