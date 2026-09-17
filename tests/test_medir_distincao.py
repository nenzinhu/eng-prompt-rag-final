"""Métricas de `scripts/medir_distincao.py` (sem rede).

Se a métrica errar, o script diz que as personas estão distintas quando não
estão — ou manda reescrever uma ficha que está boa.

    .venv/Scripts/python.exe -m pytest tests/ -v
"""
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "scripts"))

from medir_distincao import aderencia_estrutura, similaridade  # noqa: E402

TITULOS = ["Antes", "O que está errado", "Depois", "Por que funciona"]


def test_estrutura_completa_na_ordem():
    texto = "### Antes\nx\n### O que está errado\ny\n### Depois\nz\n### Por que funciona\nw"
    assert aderencia_estrutura(texto, TITULOS) == 1.0


def test_estrutura_ignora_acento_caixa_e_complemento():
    texto = "## ANTES: o prompt original\n### O que esta errado\n#### Depois\n### Por que funciona?"
    assert aderencia_estrutura(texto, TITULOS) == 1.0


def test_estrutura_aceita_linha_inteira_em_negrito():
    texto = "**Antes**\n**O que está errado:**\n**Depois**\n**Por que funciona**"
    assert aderencia_estrutura(texto, TITULOS) == 1.0


def test_estrutura_fora_de_ordem_conta_so_a_sequencia():
    texto = "### Depois\n### Antes\n### O que está errado\n### Por que funciona"
    # Antes → O que está errado → Por que funciona seguem a ordem; Depois ficou para trás.
    assert aderencia_estrutura(texto, TITULOS) == 0.75


def test_titulo_citado_no_meio_do_texto_nao_conta():
    texto = "Antes de tudo, o que está errado aqui é o formato. Depois disso, por que funciona?"
    assert aderencia_estrutura(texto, TITULOS) == 0.0


def test_prefixo_de_outra_palavra_nao_conta():
    assert aderencia_estrutura("### Antessala", ["Antes"]) == 0.0


def test_similaridade_extremos():
    texto = "few-shot é dar exemplos resolvidos dentro do prompt"
    assert similaridade(texto, texto) == 1.0
    assert similaridade(texto, "a banca adora trocar os dois conceitos na prova") == 0.0
    assert similaridade("", texto) == 0.0


def test_similaridade_nao_depende_de_markdown_nem_acento():
    a = "### Exemplo\nFew-shot é **dar exemplos** no prompt."
    b = "exemplo few shot e dar exemplos no prompt"
    assert similaridade(a, b) == 1.0
