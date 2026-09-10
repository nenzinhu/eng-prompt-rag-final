"""Testes do núcleo puro do RAG (`api/rag_core.py`).

Rodar sem credenciais:
    .venv/Scripts/python.exe -m pytest tests/ -v

Os dados usados aqui vêm de casos reais encontrados no índice de produção
(526 chunks em 10/09/2026): fragmentos-lixo como "#SAIBA MAIS#" e respostas
divergentes entre modelos ("26 milhões" vs "450 mil habitantes").
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from api.rag_core import (  # noqa: E402
    MINIMO_CHUNK,
    TAMANHO_CHUNK,
    calcular_concordancia,
    chunk_texto,
    dividir_fatos,
    extrair_alternativas,
    extrair_bloco_json,
    extrair_nomes,
    extrair_numeros,
    extrair_resposta_direta,
    formatar_alternativas,
    jaccard,
    limpar_resposta,
    normalizar_numero,
    palavras_conteudo,
    remover_linha_resposta_direta,
)

# ── chunk_texto ─────────────────────────────────────────────────────────────


def test_chunk_texto_vazio():
    assert chunk_texto("") == []
    assert chunk_texto("   \n\n  ") == []


def test_chunk_texto_descarta_ruido_curto():
    """'#SAIBA MAIS#' existe no índice de produção como chunk de 12 caracteres."""
    assert chunk_texto("#SAIBA MAIS#") == []
    assert chunk_texto("SAIBA MAIS") == []


def test_chunk_texto_mantem_texto_util_curto():
    texto = "A menor unidade conceitual de armazenamento de dados é o bit, que pode valer 0 ou 1."
    assert chunk_texto(texto) == [texto]


def test_chunk_texto_respeita_tamanho_e_minimo():
    texto = " ".join(f"Palavra{i}" for i in range(400))
    chunks = chunk_texto(texto)
    assert len(chunks) > 1
    for c in chunks:
        assert len(c) <= TAMANHO_CHUNK + 200, f"chunk acima do limite: {len(c)}"
        assert len(c) >= MINIMO_CHUNK, f"chunk abaixo do mínimo: {len(c)} ({c[:40]!r})"


def test_chunk_texto_nao_parte_palavras():
    """Corte no meio de palavra era o defeito do chunker antigo (corte a cada 500 chars)."""
    texto = " ".join(f"Palavra{i}" for i in range(400))
    vocabulario = set(texto.split())
    for c in chunk_texto(texto):
        assert set(c.split()) <= vocabulario, f"palavra partida em {c[:60]!r}"


def test_chunk_texto_corta_em_fim_de_paragrafo():
    p1 = "Primeiro parágrafo sobre embeddings e busca vetorial no material do curso de engenharia de prompt."
    p2 = "Segundo parágrafo sobre chunking de documentos e ingestão das apostilas em trechos indexáveis."
    assert len(p1) >= MINIMO_CHUNK and len(p2) >= MINIMO_CHUNK
    chunks = chunk_texto(f"{p1}\n\n{p2}", tamanho=150, sobreposicao=0)
    assert len(chunks) == 2
    assert chunks[0].startswith("Primeiro")
    assert chunks[1].startswith("Segundo")


def test_chunk_texto_tem_sobreposicao():
    """A sobreposição preserva contexto entre trechos vizinhos."""
    texto = " ".join(f"palavra{i}" for i in range(400))
    com = chunk_texto(texto, sobreposicao=120)
    sem = chunk_texto(texto, sobreposicao=0)
    assert len(com) == len(sem)
    ultima_palavra_do_anterior = sem[0].split()[-1]
    assert ultima_palavra_do_anterior in com[1], "não houve sobreposição entre chunks vizinhos"


def test_chunk_texto_absorve_fragmento_final():
    """Um resto curto no fim do texto é absorvido, não perdido."""
    corpo = " ".join(f"conteudo{i}" for i in range(120))
    chunks = chunk_texto(f"{corpo} fim.", tamanho=300, sobreposicao=0)
    assert "fim." in chunks[-1]


# ── alternativas ────────────────────────────────────────────────────────────


def test_extrair_alternativas_formato_padrao():
    texto = (
        "Qual é a principal vantagem do few-shot prompting?\n\n"
        "A) Reduz drasticamente o número de tokens\n"
        "B) Melhora a consistência sem necessidade de fine-tuning\n"
        "C) Aumenta a velocidade de inferência do modelo\n"
        "D) Elimina alucinações por completo"
    )
    enunciado, alternativas = extrair_alternativas(texto)
    assert enunciado == "Qual é a principal vantagem do few-shot prompting?"
    assert list(alternativas) == ["A", "B", "C", "D"]
    assert alternativas["B"].startswith("Melhora a consistência")
    assert alternativas["D"] == "Elimina alucinações por completo"


def test_extrair_alternativas_minusculas_e_travessao():
    enunciado, alternativas = extrair_alternativas("Pergunta?\na) um\nb) dois")
    assert enunciado == "Pergunta?"
    assert alternativas == {"A": "um", "B": "dois"}


def test_extrair_alternativas_sem_alternativas():
    assert extrair_alternativas("Só uma pergunta, sem opções.") == ("Só uma pergunta, sem opções.", {})


def test_formatar_alternativas():
    assert formatar_alternativas({"A": "um", "B": "dois"}) == "A) um\nB) dois"


# ── números e nomes ─────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "entrada,esperado",
    [("1.000", "1000"), ("1,000", "1000"), ("26,3", "26.3"), ("450", "450"), ("3.5", "3.5")],
)
def test_normalizar_numero(entrada, esperado):
    assert normalizar_numero(entrada) == esperado


def test_extrair_numeros_equipara_milhar():
    assert extrair_numeros("cerca de 1.000 unidades") == extrair_numeros("cerca de 1000 unidades")


def test_extrair_nomes_descarta_rotulo_de_marcacao():
    nomes = extrair_nomes("**Conecta:** com o banco. Defina: o escopo.")
    assert "conecta" not in nomes
    assert "defina" not in nomes


def test_extrair_nomes_descarta_inicio_de_frase():
    nomes = extrair_nomes("Portanto o modelo erra. Método descrito adiante.")
    assert "portanto" not in nomes


def test_extrair_nomes_captura_nome_proprio_no_meio_da_frase():
    nomes = extrair_nomes("O método Neosa ajuda na gestão.")
    assert "neosa" in nomes


def test_extrair_nomes_captura_sigla_em_caixa_alta():
    """Regressão: a regra antiga exigia maiúscula + minúsculas e não via NEOSA."""
    nomes = extrair_nomes("O METODO NEOSA tem quatro pilares.")
    assert "neosa" in nomes


def test_extrair_nomes_equipara_sigla_e_palavra_capitalizada():
    assert extrair_nomes("O método NEOSA é citado.") == extrair_nomes("O método Neosa é citado.") == {"neosa"}


def test_extrair_nomes_ignora_caixa_alta_de_formatacao():
    nomes = extrair_nomes("ATENÇÃO: leia o RESUMO antes da PROVA.")
    assert nomes == set(), f"caixa alta de formatação não é nome próprio: {nomes}"


def test_dividir_fatos():
    comuns, exclusivos = dividir_fatos({"m1": {"26"}, "m2": {"26", "450"}})
    assert comuns == ["26"]
    assert exclusivos == [{"fato": "450", "modelo": "m2"}]


def test_jaccard():
    assert jaccard(set(), {"a"}) == 0.0
    assert jaccard({"a", "b"}, {"a", "b"}) == 1.0
    assert jaccard({"a", "b"}, {"b", "c"}) == pytest.approx(1 / 3)


def test_palavras_conteudo_remove_stopwords():
    palavras = palavras_conteudo("O modelo que gera texto sobre embeddings")
    assert "embeddings" in palavras
    assert "que" not in palavras
    assert "modelo" in palavras


# ── limpeza de resposta ─────────────────────────────────────────────────────


def test_limpar_resposta_remove_bloco_think():
    bruto = "<think>vou pensar...\npasso 1</think>A resposta é B."
    assert limpar_resposta(bruto) == "A resposta é B."


def test_limpar_resposta_remove_tag_orfa():
    assert limpar_resposta("</think>Texto final") == "Texto final"


def test_extrair_resposta_direta():
    texto = "Explicação longa.\n\nRESPOSTA DIRETA: O método tem 4 pilares"
    assert extrair_resposta_direta(texto) == "O método tem 4 pilares"


def test_extrair_resposta_direta_pega_a_ultima():
    texto = "RESPOSTA DIRETA: primeira\nremais\n**RESPOSTA DIRETA:** segunda"
    assert extrair_resposta_direta(texto) == "segunda"


def test_extrair_resposta_direta_ausente():
    assert extrair_resposta_direta("sem a linha obrigatória") == ""


def test_remover_linha_resposta_direta():
    texto = "Conteúdo.\n\nRESPOSTA DIRETA: curta"
    assert remover_linha_resposta_direta(texto) == "Conteúdo."


def test_extrair_bloco_json():
    assert extrair_bloco_json('bla {"letra": "A"} tchau') == '{"letra": "A"}'
    assert extrair_bloco_json("sem json") is None


# ── concordância entre modelos ──────────────────────────────────────────────


def test_concordancia_um_modelo_e_indefinida():
    r = calcular_concordancia({"a/x": "O método NEOSA tem quatro pilares."})
    assert r["nivel_concordancia"] == "indefinida"


def test_divergencia_numerica_rebaixa_para_baixa():
    """O caso que motivou a métrica: números conflitantes na conclusão.

    Vocabulário parecido ('habitantes', 'cidade') NÃO pode contar como acordo
    quando os números divergem.
    """
    r = calcular_concordancia({
        "groq/x": "A cidade tem 26 milhões de habitantes.",
        "nous/y": "A cidade tem 450 mil habitantes.",
    })
    assert r["divergencia_numerica"] is True
    assert r["nivel_concordancia"] == "baixa"
    assert "26" in r["numeros_exclusivos"][0]["fato"] or "450" in r["numeros_exclusivos"][0]["fato"]


def test_numeros_comuns_nao_geram_divergencia():
    r = calcular_concordancia({
        "a/x": "O material cita 4 pilares e 12 etapas.",
        "b/y": "São 4 pilares e 12 etapas segundo a apostila.",
    })
    assert r["divergencia_numerica"] is False
    assert set(r["numeros_comuns"]) >= {"4", "12"}


def test_conclusoes_iguais_sao_alta():
    r = calcular_concordancia({"a/x": "Sim, o bit é a menor unidade.", "b/y": "Sim, o bit é a menor unidade."})
    assert r["nivel_concordancia"] == "alta"
    assert r["similaridade_conclusoes"] == 1.0


def test_concordancia_sem_fatos():
    r = calcular_concordancia({"a/x": "Depende do contexto de uso.", "b/y": "Varia conforme aplicação."})
    assert r["sem_fatos"] is True


def test_concordancia_nomes_comuns_reforcam_acordo():
    r = calcular_concordancia({
        "a/x": "O método NEOSA é descrito com foco em liderança.",
        "b/y": "NEOSA enfatiza liderança e gestão segundo a apostila.",
    })
    assert "neosa" in r["nomes_comuns"]
