"""Testes do "professor auxiliar": exemplos na questão e no glossário.

O aluno pediu duas coisas: em cada questão, explicar POR QUE a correta é correta
com 1-2 exemplos; e no glossário, explicar cada palavra/frase com 2 exemplos.
Estas funções são puras (vivem no `rag_core`) e cobrem o que pode dar errado sem
rede: modelo devolvendo o formato antigo, string em vez de lista, lista longa
demais e leitura do que foi gravado no banco.

    .venv/Scripts/python.exe -m pytest tests/ -v
"""
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "api"))

from rag_core import (  # noqa: E402
    MAX_EXEMPLOS,
    extrair_resolucao,
    extrair_termos_glossario,
    formatar_exemplos_para_banco,
    normalizar_exemplos,
    separar_exemplos,
)


# ── Exemplos: normalizar, gravar, recuperar ─────────────────────────────────


def test_normalizar_aceita_lista_e_corta_no_limite():
    assert normalizar_exemplos(["um", "dois", "três"]) == ["um", "dois"][:MAX_EXEMPLOS]
    assert MAX_EXEMPLOS == 2


def test_normalizar_aceita_string_unica():
    """Alguns modelos devolvem `exemplos` como texto, não como lista."""
    assert normalizar_exemplos("só um exemplo") == ["só um exemplo"]


def test_normalizar_quebra_item_com_varias_linhas():
    """Modelo que enfia dois exemplos numa string só: viram dois itens."""
    assert normalizar_exemplos(["primeiro\ndepois"]) == ["primeiro", "depois"]
    assert normalizar_exemplos(["a\nb\nc"]) == ["a", "b"]  # e respeita o limite


def test_normalizar_ignora_vazio_e_nulo():
    assert normalizar_exemplos(None) == []
    assert normalizar_exemplos("") == []
    assert normalizar_exemplos("   ") == []
    assert normalizar_exemplos([None, "", "   "]) == []
    assert normalizar_exemplos(42) == []


def test_gravar_e_ler_dois_exemplos():
    """O que vai para a coluna de texto tem de voltar como lista de 2."""
    texto = formatar_exemplos_para_banco(["usar A) no curso", "no dia a dia, é como B"])
    assert texto is not None
    assert texto.splitlines()[0].startswith("1) ")
    assert texto.splitlines()[1].startswith("2) ")
    assert separar_exemplos(texto) == ["usar A) no curso", "no dia a dia, é como B"]


def test_gravar_um_exemplo_fica_texto_simples():
    assert formatar_exemplos_para_banco(["exemplo único"]) == "exemplo único"
    assert separar_exemplos("exemplo único") == ["exemplo único"]


def test_sem_exemplos_nao_grava_nada():
    assert formatar_exemplos_para_banco([]) is None
    assert formatar_exemplos_para_banco(None) is None
    assert separar_exemplos(None) == []


def test_separar_aceita_texto_antigo():
    """Os termos gravados antes desta mudança têm um exemplo em texto corrido."""
    antigo = "Um algoritmo para ordenar uma lista de números."
    assert separar_exemplos(antigo) == [antigo]


# ── Glossário ───────────────────────────────────────────────────────────────


def test_glossario_le_exemplos_novos():
    bruto = (
        '{"termos": [{"termo": "Embedding", "explicacao": "É o texto virado números.", '
        '"exemplos": ["buscar por sentido, não por palavra", "recomendação de filme parecido"]}]}'
    )
    termos = extrair_termos_glossario(bruto)
    assert len(termos) == 1
    assert termos[0]["termo"] == "Embedding"
    assert termos[0]["exemplos"] == [
        "buscar por sentido, não por palavra",
        "recomendação de filme parecido",
    ]


def test_glossario_aceita_formato_antigo_com_um_exemplo():
    bruto = '{"termos": [{"termo": "Bit", "explicacao": "0 ou 1.", "exemplo": "8 bits = 1 byte"}]}'
    termos = extrair_termos_glossario(bruto)
    assert termos[0]["exemplos"] == ["8 bits = 1 byte"]


def test_glossario_descarta_termo_sem_explicacao():
    bruto = '{"termos": [{"termo": "Ruído"}, {"termo": "Ok", "explicacao": "vale"}]}'
    assert [t["termo"] for t in extrair_termos_glossario(bruto)] == ["Ok"]


def test_glossario_corta_exemplos_extras():
    """Insistir em 2 é proposital: lista longa não ensina."""
    bruto = (
        '{"termos": [{"termo": "T", "explicacao": "e", '
        '"exemplos": ["a", "b", "c", "d"]}]}'
    )
    assert extrair_termos_glossario(bruto)[0]["exemplos"] == ["a", "b"]


def test_glossario_tolera_texto_fora_do_json():
    bruto = 'Claro! Aqui está:\n```json\n{"termos": [{"termo": "X", "explicacao": "y"}]}\n```'
    assert extrair_termos_glossario(bruto)[0]["termo"] == "X"


def test_glossario_com_json_invalido_nao_quebra():
    assert extrair_termos_glossario("sem json aqui") == []
    assert extrair_termos_glossario("") == []


# ── Bug B-09: repetição no lote perdia TODOS os termos ─────────────────────


def test_glossario_descarta_repetido_ignorando_maiusculas():
    """O banco compara por `lower(termo)`.

    Duas linhas com a mesma chave no mesmo INSERT fazem o Postgres recusar o
    comando inteiro (21000) — e nenhum termo do lote era salvo.
    """
    bruto = (
        '{"termos": ['
        '{"termo": "API", "explicacao": "primeira"},'
        '{"termo": "api", "explicacao": "segunda"},'
        '{"termo": " Api ", "explicacao": "terceira"},'
        '{"termo": "RAG", "explicacao": "outra"}'
        "]}"
    )
    termos = extrair_termos_glossario(bruto)
    assert [t["termo"] for t in termos] == ["API", "RAG"]
    # Fica o primeiro, que é o que o merge-duplicates guardaria.
    assert termos[0]["explicacao"] == "primeira"


def test_glossario_com_termos_nulo_nao_quebra():
    """`.get("termos", [])` só usa o padrão quando a chave NÃO existe."""
    assert extrair_termos_glossario('{"termos": null}') == []
    assert extrair_termos_glossario('{"termos": "texto"}') == []
    assert extrair_termos_glossario('{"outra_chave": 1}') == []


# ── Resolver (questão) ──────────────────────────────────────────────────────


def test_resolucao_le_por_que_correta_e_exemplos():
    bruto = (
        '{"letra": "b", "explicacao_rapida": "Few-shot dá exemplos.", '
        '"por_que_correta": "Porque mostrar exemplos guia o modelo.", '
        '"exemplos": ["dar 3 exemplos de tradução", "mostrar o formato da resposta"], '
        '"explicacao_detalhada": "Detalhe.", '
        '"alternativas_erradas": {"A": "não reduz tokens", "B": "é a correta"}}'
    )
    r = extrair_resolucao(bruto)
    assert r["letra"] == "B"
    assert r["por_que_correta"] == "Porque mostrar exemplos guia o modelo."
    assert len(r["exemplos"]) == 2
    # A letra correta nunca entra nos distratores.
    assert "B" not in r["alternativas_erradas"]
    assert r["alternativas_erradas"] == {"A": "não reduz tokens"}


def test_resolucao_sem_os_campos_novos_devolve_vazio():
    """Modelo que ignora o formato novo não pode quebrar a rota."""
    r = extrair_resolucao('{"letra": "A", "explicacao": "só isso"}')
    assert r["letra"] == "A"
    assert r["por_que_correta"] == ""
    assert r["exemplos"] == []


def test_resolucao_detalhada_nao_vaza_para_a_rapida():
    r = extrair_resolucao('{"explicacao_detalhada": "longa", "explicacao_rapida": "curta"}')
    assert r["explicacao_rapida"] == "curta"
    assert r["explicacao_detalhada"] == "longa"


def test_resolucao_com_lixo_devolve_estrutura_vazia():
    """Resposta sem JSON: quem chama decide o que exibir (nada quebra aqui)."""
    r = extrair_resolucao("desculpe, não consegui responder")
    assert r["letra"] is None
    assert r["explicacao_rapida"] == ""
    assert r["exemplos"] == []
    assert r["alternativas_erradas"] == {}
