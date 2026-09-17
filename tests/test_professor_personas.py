"""Personalidades do "Professor Sabe Tudo".

O problema que motivou as fichas: trocar de personalidade mudava pouco o texto.
Cada persona agora é uma ficha com estrutura obrigatória, lista do que nunca
faz, trecho de voz e temperatura; o prompt junta a base de qualidade comum com
a ficha e repete um lembrete DEPOIS do contexto. O modelo é substituído por
dublê — o que se verifica é o que chega até ele.

    .venv/Scripts/python.exe -m pytest tests/ -v
"""
import asyncio
import sys
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "api"))

import index  # noqa: E402
from _app import provedores  # noqa: E402
from _app.prompts import (  # noqa: E402
    PERSONA_ALIASES,
    PROFESSOR_PERSONAS,
    SYSTEM_PROMPT_PERGUNTA,
    montar_prompt_professor,
    resolver_persona_professor,
)

cliente = TestClient(index.app, raise_server_exceptions=False)

IDS_ESPERADOS = [
    "professor",
    "tres_camadas",
    "antes_depois",
    "pratico",
    "socratico",
    "visual",
    "academico",
    "preparatorio",
    "desafio",
    "ironista",
    "showman",
    "dogmatico",
    "enciclopedico",
]


# ── Fichas ──────────────────────────────────────────────────────────────────


def test_treze_personas_com_didatico_primeiro():
    assert list(PROFESSOR_PERSONAS) == IDS_ESPERADOS


def test_toda_ficha_esta_completa():
    for pid, p in PROFESSOR_PERSONAS.items():
        for campo in ("nome", "descricao", "exemplo", "papel", "voz"):
            assert isinstance(p[campo], str) and p[campo].strip(), f"{pid}.{campo}"
        assert len(p["estrutura"]) >= 3, pid
        for titulo, instrucao in p["estrutura"]:
            assert titulo.strip() and instrucao.strip(), pid
        assert p["nunca"], pid
        assert 0.0 <= p["temperatura"] <= 1.0, pid


def test_nenhuma_persona_abre_com_a_mesma_secao():
    """Duas personas com a mesma primeira seção voltariam a soar iguais."""
    primeiras = [p["estrutura"][0][0].lower() for p in PROFESSOR_PERSONAS.values()]
    assert len(primeiras) == len(set(primeiras))


def test_titulos_nao_se_repetem_dentro_da_ficha():
    for pid, p in PROFESSOR_PERSONAS.items():
        titulos = [t.lower() for t, _ in p["estrutura"]]
        assert len(titulos) == len(set(titulos)), pid


# ── IDs antigos ─────────────────────────────────────────────────────────────


def test_ids_antigos_redirecionam_para_as_fundidas():
    assert resolver_persona_professor("reforco") == "professor"
    assert resolver_persona_professor("nivel_inicial") == "tres_camadas"
    assert resolver_persona_professor("nivel_intermediario") == "tres_camadas"
    assert resolver_persona_professor("nivel_avancado") == "desafio"


def test_todo_alias_aponta_para_ficha_existente():
    for antigo, novo in PERSONA_ALIASES.items():
        assert antigo not in PROFESSOR_PERSONAS
        assert novo in PROFESSOR_PERSONAS


def test_id_desconhecido_nao_resolve():
    assert resolver_persona_professor("pirata") is None
    assert resolver_persona_professor("") is None
    assert resolver_persona_professor("padrao") is None  # padrão é da aba Perguntar, não ficha


# ── Montagem do prompt ──────────────────────────────────────────────────────


def test_system_traz_base_papel_estrutura_nunca_e_voz():
    p = PROFESSOR_PERSONAS["antes_depois"]
    system, _user, temperatura = montar_prompt_professor("antes_depois", "trecho", "o que é few-shot?")

    assert "(fora da apostila)" in system  # regra de lacuna da base de qualidade
    assert "[Fonte:" in system  # formato de citação
    assert p["papel"] in system
    assert p["voz"] in system
    for proibicao in p["nunca"]:
        assert proibicao in system
    # Os títulos aparecem como seções, na ordem da ficha.
    posicoes = [system.index(f"### {titulo}") for titulo, _ in p["estrutura"]]
    assert posicoes == sorted(posicoes)
    assert temperatura == p["temperatura"]


def test_lembrete_vem_depois_do_contexto():
    """Com contexto longo, o modelo segue melhor o que leu por último."""
    contexto = "[Fonte: a.pdf, página 3]\n" + "texto da apostila " * 200
    _system, user, _t = montar_prompt_professor("socratico", contexto, "o que é few-shot?")

    assert user.index("CONTEXTO:") < user.index(contexto) < user.index("PERGUNTA:") < user.index("LEMBRETE:")
    lembrete = user[user.index("LEMBRETE:"):]
    assert "Socrático" in lembrete
    for titulo, _ in PROFESSOR_PERSONAS["socratico"]["estrutura"]:
        assert titulo in lembrete


def test_system_de_personas_diferentes_nao_coincide():
    systems = {montar_prompt_professor(pid, "c", "p")[0] for pid in PROFESSOR_PERSONAS}
    assert len(systems) == len(PROFESSOR_PERSONAS)


# ── Rotas ───────────────────────────────────────────────────────────────────


def test_lista_so_expoe_o_que_o_card_mostra():
    personas = cliente.get("/api/professor-personas").json()["personas"]
    assert [p["persona_id"] for p in personas] == IDS_ESPERADOS
    for p in personas:
        assert set(p) == {"persona_id", "nome", "descricao", "exemplo"}


@pytest.fixture
def dubles(monkeypatch):
    chamadas = []

    async def _emb(textos):
        return [[0.0] * 384 for _ in textos]

    async def _chunks(_emb, n=6):
        return [{"content": "Few-shot é dar exemplos no prompt.", "source": "a.pdf", "page": 3, "similarity": 0.8}]

    async def _llm(provider, modelo, system_prompt, user_prompt, timeout=None, temperatura=None):
        chamadas.append({"system": system_prompt, "user": user_prompt, "temperatura": temperatura})
        return "resposta"

    async def _stream(provider, modelo, system_prompt, user_prompt, timeout=None, temperatura=None):
        chamadas.append({"system": system_prompt, "user": user_prompt, "temperatura": temperatura})
        yield "resposta"

    async def _sem_limite(_r):
        return None

    monkeypatch.setattr(index, "gerar_embeddings", _emb)
    monkeypatch.setattr(index, "buscar_chunks", _chunks)
    monkeypatch.setattr(index, "chamar_llm", _llm)
    monkeypatch.setattr(index, "chamar_llm_stream", _stream)
    monkeypatch.setattr(index, "_limitar_llm", _sem_limite)
    return chamadas


def _perguntar(persona, rota="/api/perguntar"):
    modelo = index.PROVIDERS["groq"]["models"][0]
    return cliente.post(rota, json={"pergunta": "o que é few-shot?", "provider": "groq", "modelo": modelo, "persona": persona})


def test_pergunta_com_ficha_usa_prompt_montado_e_temperatura(dubles):
    r = _perguntar("showman")
    assert r.status_code == 200
    system, user, temperatura = montar_prompt_professor(
        "showman", "[Fonte: a.pdf, página 3]\nFew-shot é dar exemplos no prompt.", "o que é few-shot?"
    )
    assert dubles[0] == {"system": system, "user": user, "temperatura": temperatura}


def test_stream_tambem_usa_a_ficha(dubles):
    r = _perguntar("visual", rota="/api/perguntar/stream")
    assert r.status_code == 200
    assert "### O mapa" in dubles[0]["system"]
    assert dubles[0]["temperatura"] == PROFESSOR_PERSONAS["visual"]["temperatura"]


def test_padrao_da_aba_perguntar_continua_igual(dubles):
    r = _perguntar("padrao")
    assert r.status_code == 200
    assert dubles[0]["system"] == SYSTEM_PROMPT_PERGUNTA
    assert "LEMBRETE:" not in dubles[0]["user"]
    assert dubles[0]["temperatura"] is None  # usa a temperatura padrão do provedor


def test_id_antigo_chega_na_ficha_nova(dubles):
    r = _perguntar("nivel_avancado")
    assert r.status_code == 200
    assert PROFESSOR_PERSONAS["desafio"]["papel"] in dubles[0]["system"]


def test_persona_desconhecida_e_recusada_sem_gastar_chave(dubles):
    r = _perguntar("nao-existe")
    assert r.status_code == 400
    assert "nao-existe" in r.json()["detail"]
    assert not dubles


def test_stream_recusa_persona_desconhecida_antes_de_comecar(dubles):
    r = _perguntar("nao-existe", rota="/api/perguntar/stream")
    assert r.status_code == 400
    assert not dubles


# ── Temperatura no provedor ─────────────────────────────────────────────────


class _Captura:
    """Substitui `_http` e guarda o corpo enviado ao provedor."""

    def __init__(self):
        self.corpos = []

    def __call__(self, _timeout):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def post(self, url, json=None, **_):
        self.corpos.append(json)
        ok = {"choices": [{"message": {"content": "ok"}}]}
        return httpx.Response(200, json=ok, request=httpx.Request("POST", url))


def test_chamar_llm_envia_a_temperatura_pedida(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "k")
    captura = _Captura()
    monkeypatch.setattr(provedores, "_http", captura)

    asyncio.run(provedores.chamar_llm("groq", "m", "s", "u", temperatura=0.7))
    asyncio.run(provedores.chamar_llm("groq", "m", "s", "u"))

    assert captura.corpos[0]["temperature"] == 0.7
    assert captura.corpos[1]["temperature"] == provedores.TEMPERATURA_PADRAO == 0.3
