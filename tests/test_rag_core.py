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
    classificar_fidelidade,
    conclusao_fallback,
    dividir_fatos,
    extrair_alternativas,
    varias_listas_de_alternativas,
    extrair_bloco_json,
    extrair_nomes,
    extrair_numeros,
    extrair_resposta_direta,
    formatar_alternativas,
    frase_tem_apoio_textual,
    jaccard,
    limpar_resposta,
    normalizar_numero,
    palavras_conteudo,
    quebrar_frases,
    remover_linha_resposta_direta,
    rotulos_unicos,
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


_ALTERNATIVAS_PADRAO = "\n\nA) um\nB) dois\nC) tres\nD) quatro"


@pytest.mark.parametrize(
    "enunciado",
    [
        # Casos reproduzidos na análise de 17/09/2026 (A1-03): o enunciado era
        # cortado no primeiro "a." / "e-" / "(IA)" de qualquer ponto do texto.
        "Sobre a Inteligência Artificial (IA), assinale a alternativa correta:",
        "Uma empresa usa e-mail marketing. Qual a principal métrica?",
        "Leia o trecho da apostila. Em seguida, responda: o que é RAG?",
        "Considere o cenário:\nE-commerce cresce no Brasil.\nQual o motivo?",
        "Considere a bactéria:\nE. coli é usada em pesquisa.\nPor quê?",
        "Segundo o autor:\nA. Smith defende a divisão do trabalho.\nO que isso significa?",
    ],
)
def test_extrair_alternativas_nao_corta_enunciado(enunciado):
    questao, alternativas = extrair_alternativas(enunciado + _ALTERNATIVAS_PADRAO)
    assert questao == enunciado
    assert alternativas == {"A": "um", "B": "dois", "C": "tres", "D": "quatro"}
    assert not varias_listas_de_alternativas(enunciado + _ALTERNATIVAS_PADRAO)


def test_extrair_alternativas_afirmativas_minusculas_ficam_no_enunciado():
    enunciado = "Analise as afirmativas:\na) RAG usa busca.\nb) RAG dispensa contexto.\nQuais estão corretas?"
    questao, alternativas = extrair_alternativas(enunciado + _ALTERNATIVAS_PADRAO)
    assert questao == enunciado
    assert list(alternativas) == ["A", "B", "C", "D"]
    assert varias_listas_de_alternativas(enunciado + _ALTERNATIVAS_PADRAO)


@pytest.mark.parametrize("modelo", ["{}. ", "({}) ", "{} - ", "{}) "])
@pytest.mark.parametrize("letras", ["ABC", "abc"])
def test_extrair_alternativas_formatos_de_marcador(modelo, letras):
    linhas = [modelo.format(letra) + f"opção {letra}" for letra in letras]
    questao, alternativas = extrair_alternativas("Pergunta?\n" + "\n".join(linhas))
    assert questao == "Pergunta?"
    assert alternativas == {letra.upper(): f"opção {letra}" for letra in letras}


def test_extrair_alternativas_parentese_solto_da_formatacao():
    # O navegador transforma "(A) x (B) y" em "(\n\nA) x (\n\nB) y".
    questao, alternativas = extrair_alternativas("Pergunta? (\n\nA) um (\n\nB) dois")
    assert questao == "Pergunta?"
    assert alternativas == {"A": "um", "B": "dois"}


def test_extrair_alternativas_duas_questoes_usa_a_ultima_e_avisa():
    texto = "Primeira?\nA) um\nB) dois\n\nSegunda?\nA) tres\nB) quatro"
    questao, alternativas = extrair_alternativas(texto)
    assert questao.endswith("Segunda?")
    assert alternativas == {"A": "tres", "B": "quatro"}
    assert varias_listas_de_alternativas(texto)


def test_extrair_alternativas_marcador_fora_de_ordem_fica_no_conteudo():
    questao, alternativas = extrair_alternativas("Pergunta?\nA) bactéria\nE. coli\nB) vírus")
    assert alternativas == {"A": "bactéria\nE. coli", "B": "vírus"}


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


def test_remover_corta_na_ultima_e_preserva_o_corpo():
    """Bug B-03: com a menção em prosa, o card do modelo ficava só com "A".

    O corte usava a PRIMEIRA ocorrência e o DOTALL apagava até o fim, enquanto
    `extrair_resposta_direta` já lia a última. Os dois discordavam.
    """
    texto = (
        "A resposta direta é citada abaixo.\n\n"
        "Explicação longa do modelo.\n\n"
        "RESPOSTA DIRETA: 42"
    )
    corpo = remover_linha_resposta_direta(texto)
    assert corpo == "A resposta direta é citada abaixo.\n\nExplicação longa do modelo."
    # O campo próprio continua com a conclusão de verdade.
    assert extrair_resposta_direta(texto) == "42"


def test_remover_sem_a_linha_devolve_o_texto_inteiro():
    assert remover_linha_resposta_direta("Só o corpo.") == "Só o corpo."
    assert remover_linha_resposta_direta("") == ""


def test_remover_tira_os_asteriscos_do_rotulo():
    assert remover_linha_resposta_direta("Corpo.\n\n**RESPOSTA DIRETA:** x") == "Corpo."


def test_extrair_bloco_json():
    assert extrair_bloco_json('bla {"letra": "A"} tchau') == '{"letra": "A"}'
    assert extrair_bloco_json("sem json") is None


# ── conclusão de reserva (modelos que ignoram a linha RESPOSTA DIRETA) ───────

def test_conclusao_fallback_usa_ultima_linha():
    """Caso real: o modelo respondeu bem mas não emitiu 'RESPOSTA DIRETA:'."""
    texto = "O few-shot prompting usa exemplos.\n\nEle melhora a consistência sem fine-tuning."
    assert conclusao_fallback(texto) == "Ele melhora a consistência sem fine-tuning."


def test_conclusao_fallback_limpa_marcacao():
    texto = "Explicação longa aqui.\n\n**Conclusão:** o bit é a menor unidade de armazenamento."
    assert conclusao_fallback(texto) == "Conclusão: o bit é a menor unidade de armazenamento."


def test_conclusao_fallback_pula_linha_curta():
    texto = "A resposta essencial é que o método tem quatro pilares.\nFim."
    assert conclusao_fallback(texto).startswith("A resposta essencial")


def test_conclusao_fallback_texto_vazio():
    assert conclusao_fallback("") == ""
    assert conclusao_fallback("   \n  ") == ""
    assert conclusao_fallback("curto") == ""


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


def test_numero_por_extenso_nao_e_divergencia():
    # Análise de 17/09/2026 (A1-10): "5" contra "cinco" era acusado de conflito.
    r = calcular_concordancia({
        "a/x": "O método tem 5 etapas.",
        "b/y": "O método tem cinco etapas.",
    })
    assert r["divergencia_numerica"] is False


def test_paginas_citadas_diferentes_nao_sao_divergencia():
    r = calcular_concordancia({
        "a/x": "O método tem 4 pilares [Fonte: apostila.pdf, página 3].",
        "b/y": "São 4 pilares no método (pág. 12).",
    })
    assert r["divergencia_numerica"] is False
    assert r["numeros_comuns"] == ["4"]


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


# ── rótulos repetidos (mesmo modelo comparado consigo mesmo) ────────────────


def test_rotulos_unicos_desambigua_repetidos():
    """Regressão: o mesmo modelo em dois slots zerava a comparação em produção."""
    assert rotulos_unicos(["a/b", "a/b", "c/d"]) == ["a/b", "a/b #2", "c/d"]


def test_rotulos_unicos_preserva_ordem_e_nao_altera_unicos():
    assert rotulos_unicos(["x", "y", "z"]) == ["x", "y", "z"]
    assert rotulos_unicos([]) == []


def test_rotulos_unicos_tres_iguais():
    assert rotulos_unicos(["a", "a", "a"]) == ["a", "a #2", "a #3"]


def test_mesmo_modelo_duas_vezes_ainda_compara():
    """O caso real: duas respostas do mesmo modelo não podem virar 'indefinida'."""
    respostas = ["O bit é a menor unidade de armazenamento.", "O bit é a menor unidade de armazenamento."]
    diretas = dict(zip(rotulos_unicos(["nous/x:free", "nous/x:free"]), respostas))
    r = calcular_concordancia(diretas)
    assert len(diretas) == 2, "as duas respostas precisam sobreviver"
    assert r["nivel_concordancia"] == "alta"


# ── auditoria de fidelidade (frase por frase) ────────────────────────────────


def test_quebrar_frases_separa_por_pontuacao():
    texto = "O few-shot usa exemplos. Ele melhora a consistência sem fine-tuning."
    frases = quebrar_frases(texto, tamanho_minimo=5)
    assert len(frases) == 2
    assert frases[0].startswith("O few-shot")
    assert frases[1].startswith("Ele melhora")


def test_quebrar_frases_descarta_fragmentos_curtos():
    texto = "Frase longa e completa sobre o tema. Curta."
    assert quebrar_frases(texto, tamanho_minimo=20) == ["Frase longa e completa sobre o tema."]


def test_quebrar_frases_limpa_formatacao():
    texto = "**Negrito** e `codigo` na resposta."
    frases = quebrar_frases(texto, tamanho_minimo=5)
    assert frases and "*" not in frases[0] and "`" not in frases[0]


def test_quebrar_frases_ignora_vazio():
    assert quebrar_frases("") == []
    assert quebrar_frases("  \n  ") == []


def test_quebrar_frases_nao_parte_lista_ou_tabela():
    """Regressão: quebras de linha em listas/tabelas viravam frases-lixo."""
    # Tabela markdown: quebras por \n sem pontuação final não devem separar.
    texto = "| Objetivo | Avaliar a viabilidade do negocio |\n| Quem | Empreendedores |\n\nDepois vem um paragrafo novo que tambem explica."
    frases = quebrar_frases(texto, tamanho_minimo=20)
    assert any("Objetivo" in f and "Empreendedores" in f for f in frases), f"tabela deveria estar junta: {frases}"
    assert any(f.startswith("Depois vem") for f in frases)


def test_classificar_fidelidade_niveis():
    assert classificar_fidelidade(0.8) == "apoiada"
    assert classificar_fidelidade(0.6) == "apoiada"
    assert classificar_fidelidade(0.5) == "parcial"
    assert classificar_fidelidade(0.4) == "parcial"
    assert classificar_fidelidade(0.3) == "nao_apoiada"


# ── apoio textual (falso-positivo da similaridade) ──────────────────────────


def test_apoio_textual_confirma_quando_palavras_estao_no_chunk():
    frase = "O few-shot prompting fornece exemplos ao modelo antes da instrução final."
    chunk = {"content": "o few-shot prompting fornece exemplos ao modelo antes da instrução final e melhora a consistência"}
    assert frase_tem_apoio_textual(frase, [chunk]) == "total"


def test_apoio_textual_pega_frase_inventada():
    """Regressão: a frase inventada marcava 'apoiada' (84%) mesmo sem estar no chunk."""
    frase = "A capital da Australia e um canguru azul que danca samba."
    chunk = {"content": "o direito autoral juntamente com os direitos de propriedade intelectual no brasil"}
    assert frase_tem_apoio_textual(frase, [chunk]) == "nenhum"


def test_apoio_textual_aceita_frase_curta():
    # Frase curta demais para conferir palavra por palavra não acusa sem prova.
    assert frase_tem_apoio_textual("É importante.", [{"content": "texto totalmente diferente aqui"}]) == "total"


def test_apoio_textual_com_sobreposicao_parcial():
    frase = "O fine-tuning ajusta os parâmetros do modelo com dados rotulados."
    chunk = {"content": "o fine-tuning ajusta os parâmetros do modelo para tarefas específicas"}
    assert frase_tem_apoio_textual(frase, [chunk]) == "total"


def test_apoio_textual_parcial_quando_cobre_parte():
    """2 de 6 palavras-chave no chunk = apoio parcial, não total."""
    frase = "O empreendedor deve elaborar um plano de negócios para reduzir riscos."
    chunks = [
        {"content": "passo a passo da abertura da empresa e formalização"},
        {"content": "o plano descreve a estrutura e os riscos do empreendimento"},
    ]
    assert frase_tem_apoio_textual(frase, chunks) == "parcial"


def test_apoio_textual_ignora_acento_nos_dois_lados():
    # Análise de 17/09/2026 (A1-09): só a frase perdia o acento, então uma frase
    # copiada do material era acusada de invenção.
    frase = "A inovação tecnológica exige gestão estratégica e colaboração."
    chunk = {"content": "Na apostila: a inovação tecnológica exige gestão estratégica e colaboração entre áreas."}
    assert frase_tem_apoio_textual(frase, [chunk]) == "total"
