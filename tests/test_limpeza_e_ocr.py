"""Limpeza do texto extraído e junção da transcrição das imagens (OCR).

Rodapés repetidos em toda página ("Voltar ao Sumário | v1.3 DataWay 8") entravam
em quase todo trecho: a busca por palavra achava o documento inteiro em qualquer
pergunta com "engenharia de prompt". E o pypdf separa o pronome do verbo
("tornar -se"), o que quebra a busca exata.

    .venv/Scripts/python.exe -m pytest tests/test_limpeza_e_ocr.py -v
"""
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "api"))

from _app.documentos import limpar_texto_extraido, mesclar_ocr  # noqa: E402

RODAPE = "DataWay – Engenharia de Prompt no ChatGPT Voltar ao Sumário | v1.3 DataWay {n}"


ASSUNTOS = ["zero-shot", "few-shot", "persona", "cadeia de raciocínio", "formato de saída", "exemplos", "contexto"]


def _paginas_com_rodape(n: int) -> list[tuple[int, str]]:
    return [(i, f"Esta página explica {ASSUNTOS[i - 1]}.\n" + RODAPE.format(n=i)) for i in range(1, n + 1)]


def test_remove_linha_repetida_em_toda_pagina_mesmo_com_numero_diferente():
    limpas = limpar_texto_extraido(_paginas_com_rodape(6))
    assert all("Voltar ao Sumário" not in t for _, t in limpas)
    assert limpas[2] == (3, "Esta página explica persona.")


def test_linha_que_aparece_pouco_fica():
    paginas = _paginas_com_rodape(6)
    paginas.append((7, "Voltar ao Sumário é citado aqui como exemplo."))
    paginas.append((8, "Resumo: veja o Quadro 1."))
    paginas.append((9, "Resumo: veja o Quadro 2."))  # repete em 2 de 9 páginas: fica
    limpas = dict(limpar_texto_extraido(paginas))
    assert limpas[7] == "Voltar ao Sumário é citado aqui como exemplo."
    assert limpas[8] == "Resumo: veja o Quadro 1."


def test_documento_curto_nao_perde_linhas():
    """Com menos de 3 páginas não há como distinguir rodapé de conteúdo."""
    paginas = [(1, "Título\nTexto um."), (2, "Título\nTexto dois.")]
    assert limpar_texto_extraido(paginas) == paginas


def test_linhas_curtas_repetidas_nao_sao_rodape():
    """Um "1" ou "•" em toda página é número/marcador, não rodapé com conteúdo."""
    paginas = [(i, f"•\nItem {i}") for i in range(1, 6)]
    assert limpar_texto_extraido(paginas) == paginas


def test_junta_pronome_separado_do_verbo():
    paginas = [(1, "As empresas começaram a diferenciar -se. Pode -se ajudá -lo e explorá -las.")]
    assert limpar_texto_extraido(paginas) == [
        (1, "As empresas começaram a diferenciar-se. Pode-se ajudá-lo e explorá-las.")
    ]


def test_hifen_de_lista_e_travessao_ficam():
    paginas = [(1, "Itens:\n- se aplicar\nvalor - se houver")]
    # "- se" no início da linha (lista) e " - " com espaço dos dois lados ficam.
    assert limpar_texto_extraido(paginas) == paginas


def test_mesclar_ocr_acrescenta_na_pagina_e_cria_pagina_sem_texto():
    paginas = [(1, "Texto da página 1."), (3, "Texto da página 3.")]
    ocr = {"1": ["for c in texto:\n    print(c)"], "2": ["CORMEN, T. H. Desmistificando algoritmos."]}
    mescladas = mesclar_ocr(paginas, ocr)
    assert mescladas[0] == (1, "Texto da página 1.\n\n[Imagem da página 1]\nfor c in texto:\n    print(c)")
    assert mescladas[1] == (2, "[Imagem da página 2]\nCORMEN, T. H. Desmistificando algoritmos.")
    assert mescladas[2] == (3, "Texto da página 3.")


def test_mesclar_ocr_vazio_ou_invalido_nao_muda_nada():
    paginas = [(1, "Texto.")]
    assert mesclar_ocr(paginas, {}) == paginas
    assert mesclar_ocr(paginas, None) == paginas
    assert mesclar_ocr(paginas, {"x": ["a"], "2": "não é lista", "3": ["", "  "]}) == paginas
