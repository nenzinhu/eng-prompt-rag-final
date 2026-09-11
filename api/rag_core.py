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

import json
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


def quebrar_frases(texto: str, tamanho_minimo: int = 40) -> list[str]:
    """Divide um texto em frases completas, descartando fragmentos curtos.

    Usado pela auditoria de fidelidade (frase por frase): a resposta do modelo é
    quebrada em frases, e cada uma é verificada contra o material. Cortes no meio
    de palavra e fragmentos de formatação (negrito, listas, tabelas) ficam de fora
    para não poluir a verificação.

    Regras:
    - A quebra só acontece após pontuação final (.!?) ou fim de parágrafo.
    - Quebras de linha soltas (`\n` sem parágrafo) NÃO separam frases: itens de
      lista e linhas de tabela ("- Item", "| coluna |") são juntados no resto do
      texto, senão virariam fragmentos-lixo.
    - Frases mais curtas que `tamanho_minimo` são descartadas.
    """
    if not texto:
        return []
    # Marca quebras de linha que NÃO são de parágrafo (não-finais) como espaço,
    # para não partir listas/tabelas. Parágrafo (duas quebras) continua separando.
    paragrafos = re.split(r"\n\s*\n", texto)
    frases: list[str] = []
    for paragrafo in paragrafos:
        # Dentro do parágrafo, troca quebras simples por espaço e quebra só por pontuação.
        paragrafo = re.sub(r"\n", " ", paragrafo)
        for frase in re.split(r"(?<=[.!?])\s+", paragrafo):
            frase = re.sub(r"[*_`>#]+", " ", frase)
            frase = re.sub(r"\s+", " ", frase).strip()
            if len(frase) >= tamanho_minimo:
                frases.append(frase)
    return frases


def _nucleo_palavras(texto: str) -> set[str]:
    """Conjunto de palavras significativas (>=4 letras), sem acento nem stopwords.

    Usado para conferir se uma frase realmente aparece no chunk que ela casou.
    Palavras curtas e stopwords não distinguem conteúdo, então ficam de fora.
    """
    t = unicodedata.normalize("NFKD", (texto or "").lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    return {p for p in re.findall(r"[a-z0-9]{4,}", t) if p not in STOPWORDS}


def frase_tem_apoio_textual(frase: str, chunks: list[dict]) -> str:
    """Quanto do conteúdo da frase realmente aparece nos chunks.

    A similaridade vetorial sozinha dá falso-positivo: uma frase inventada curta
    (ex.: "a capital é um canguru azul") acha um chunk semanticamente próximo e
    é marcada como apoiada. Aqui conferimos se PALAVRAS significativas da frase
    aparecem de fato no chunk mais parecido.

    Devolve um nível:
    - "total"    se o chunk cobre a maioria das palavras-chave
    - "parcial"  se cobre algumas, mas não a maioria
    - "nenhum"   se mal toca no conteúdo
    """
    palavras = _nucleo_palavras(frase)
    if len(palavras) < 3:
        return "total"  # frase curta demais para conferir — não acusa sem prova
    melhor = 0
    for c in chunks:
        texto_chunk = (c.get("content") or "").lower()
        melhor = max(melhor, sum(1 for p in palavras if p in texto_chunk))
    fracao = melhor / len(palavras)
    if fracao >= 0.5:
        return "total"
    if fracao >= 0.3:
        return "parcial"
    return "nenhum"


def classificar_fidelidade(similaridade: float) -> str:
    """Converte a similaridade de uma frase com o material em um nível.

    Limiares calibrados para o gte-small (cosine). Acima de 0.6 a frase está
    claramente apoiada no material; abaixo de 0.4 provavelmente foi inventada.
    """
    if similaridade >= 0.60:
        return "apoiada"
    if similaridade >= 0.40:
        return "parcial"
    return "nao_apoiada"


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


def rotulos_unicos(rotulos: list[str]) -> list[str]:
    """Desambigua rótulos repetidos, preservando a ordem.

    O rótulo é "provider/modelo". Quando o usuário compara o MESMO modelo duas
    vezes (checagem de autoconsistência), os rótulos colidem e um dicionário
    indexado por eles perderia uma das respostas — era o que fazia o veredito
    sair "indefinida" mesmo com as duas respostas válidas.

    >>> rotulos_unicos(["a/b", "a/b", "c/d"])
    ['a/b', 'a/b #2', 'c/d']
    """
    vistos: dict[str, int] = {}
    saida: list[str] = []
    for rotulo in rotulos:
        vistos[rotulo] = vistos.get(rotulo, 0) + 1
        n = vistos[rotulo]
        saida.append(rotulo if n == 1 else f"{rotulo} #{n}")
    return saida


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


# ── Exemplos do "professor auxiliar" (questões e glossário) ──────────────────
#
# O aluno pediu explicação de professor: por que a alternativa está correta, com
# 1-2 exemplos concretos, e no glossário cada palavra/frase explicada com 2
# exemplos. Limitar a 2 é proposital: lista longa de exemplo não ensina, só
# aumenta a leitura antes da prova.

MAX_EXEMPLOS = 2


def normalizar_exemplos(valor) -> list[str]:
    """Aceita lista, texto único ou vazio e devolve no máximo `MAX_EXEMPLOS`.

    Modelos às vezes devolvem `exemplos` como string única em vez de lista —
    tratar os dois casos evita perder a explicação por detalhe de formato.
    """
    if valor is None:
        return []
    if isinstance(valor, str):
        itens = [valor.strip()] if valor.strip() else []
    elif isinstance(valor, (list, tuple)):
        itens = []
        for item in valor:
            texto = str(item or "").strip()
            # Um item com quebra de linha vira vários exemplos curtos.
            itens.extend(p.strip() for p in texto.splitlines() if p.strip())
    else:
        return []
    return itens[:MAX_EXEMPLOS]


def formatar_exemplos_para_banco(exemplos) -> str | None:
    """Grava os exemplos como texto numerado, legível no banco.

    A tabela `glossario_termos` tem uma coluna de texto para UM exemplo, e mudar
    o schema exigiria SQL manual no Supabase. Em vez disso, os exemplos são
    gravados numerados ("1) ...\\n2) ...") e `separar_exemplos` os recupera — o
    dado continua legível para quem abrir a tabela.
    """
    itens = normalizar_exemplos(exemplos)
    if not itens:
        return None
    if len(itens) == 1:
        return itens[0]
    return "\n".join(f"{i}) {texto}" for i, texto in enumerate(itens, 1))


def separar_exemplos(texto: str | None) -> list[str]:
    """Recupera os exemplos gravados numerados (ou um texto antigo, sem número)."""
    if not texto or not texto.strip():
        return []
    linhas = [l.strip() for l in texto.strip().splitlines() if l.strip()]
    numeradas = [l for l in linhas if re.match(r"^\d+\)", l)]
    if numeradas and len(numeradas) == len(linhas):
        return [re.sub(r"^\d+\)\s*", "", l).strip() for l in numeradas][:MAX_EXEMPLOS]
    return [texto.strip()]


# ── Leitura das respostas do modelo (antes vivia dentro das rotas) ──────────


def extrair_termos_glossario(bruto: str) -> list[dict]:
    """Lê a resposta do glossário: `{"termos": [{"termo", "explicacao", "exemplos"}]}`.

    Aceita `exemplo` (string, formato antigo) como apelido de `exemplos`, para não
    descartar a explicação de um modelo que ignorou o formato novo.
    """
    bloco = extrair_bloco_json(bruto)
    if not bloco:
        return []
    try:
        parsed = json.loads(bloco)
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, dict):
        return []
    termos: list[dict] = []
    for item in parsed.get("termos", []):
        if not isinstance(item, dict):
            continue
        termo = str(item.get("termo") or "").strip()
        explicacao = str(item.get("explicacao") or "").strip()
        if not termo or not explicacao:
            continue
        termos.append({
            "termo": termo,
            "explicacao": explicacao,
            "exemplos": normalizar_exemplos(item.get("exemplos") or item.get("exemplo")),
        })
    return termos


def extrair_resolucao(bruto: str) -> dict:
    """Lê a resposta do resolver: letra, explicações, exemplos e distratores.

    Devolve sempre as mesmas chaves; `explicacao_rapida` vazia significa que o
    modelo não seguiu o formato, e quem chama decide o que mostrar no lugar.
    """
    resultado = {
        "letra": None,
        "explicacao_rapida": "",
        "explicacao_detalhada": "",
        "por_que_correta": "",
        "exemplos": [],
        "alternativas_erradas": {},
    }
    bloco = extrair_bloco_json(bruto)
    if not bloco:
        return resultado
    try:
        parsed = json.loads(bloco)
    except json.JSONDecodeError:
        return resultado
    if not isinstance(parsed, dict):
        return resultado

    resultado["letra"] = str(parsed.get("letra") or "").strip().upper() or None
    resultado["explicacao_rapida"] = str(
        parsed.get("explicacao_rapida") or parsed.get("explicacao") or ""
    ).strip()
    resultado["explicacao_detalhada"] = str(parsed.get("explicacao_detalhada") or "").strip()
    resultado["por_que_correta"] = str(parsed.get("por_que_correta") or "").strip()
    resultado["exemplos"] = normalizar_exemplos(parsed.get("exemplos") or parsed.get("exemplo"))

    letra = resultado["letra"]
    erradas = parsed.get("alternativas_erradas") or {}
    if isinstance(erradas, dict):
        resultado["alternativas_erradas"] = {
            str(k).strip().upper(): v.strip()
            for k, v in erradas.items()
            if isinstance(v, str) and v.strip() and str(k).strip().upper() != letra
        }
    return resultado
