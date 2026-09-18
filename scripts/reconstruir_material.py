"""Reconstrói o material indexado a partir dos chunks salvos.

Os 384 chunks de `Empreendedorismo_Inovacao_Tecnologia_completo.pdf` existem no
banco e nos dumps, mas o PDF original não está no Storage — ou seja, o material
não pode ser reindexado se algo o apagar.

Este script remonta o texto por página e gera:
  • `supabase-backup/reconstruido/<fonte>.txt`  — referência legível, com o
    marcador de página original entre os trechos.
  • `supabase-backup/reconstruido/<fonte>.pdf`  — um PDF com uma página por
    página original, para subir no Storage. É isso que preserva as citações
    ("[Fonte: x, página 3]") numa reindexação: um .txt viraria tudo página 1.

Por que PDF e não só TXT: o extrator lê a página de cada trecho, e as citações
de página são o que dá credibilidade às respostas.

Sobre fidelidade: o texto vem do que o extrator leu do PDF original, então
quebras de linha e hifenização podem diferir do arquivo sumido. Isto devolve o
material ao índice, não ressuscita o arquivo original.

Uso:
    python scripts/reconstruir_material.py            # todas as fontes
    python scripts/reconstruir_material.py --fonte X  # só uma fonte
"""
from __future__ import annotations

import argparse
import json
import unicodedata
from collections import defaultdict
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ENTRADAS = [RAIZ / "supabase-backup" / "dumps", RAIZ / "supabase-backup"]
SAIDA = RAIZ / "supabase-backup" / "reconstruido"

SOBREPOSICAO_ESPERADA = 50  # o chunker antigo usava 500 chars com 50 de sobreposição


def carregar_chunks() -> list[dict]:
    """Prefere o dump mais recente; cai no JSONL do backup original."""
    arquivo = None
    for pasta in ENTRADAS:
        candidatos = sorted(pasta.glob("ementas_chunks*.jsonl"), key=lambda p: p.stat().st_mtime)
        if candidatos:
            arquivo = candidatos[-1]
            break
    if arquivo is None:
        raise SystemExit("Nenhum ementas_chunks*.jsonl encontrado em supabase-backup/.")
    print(f"Lendo {arquivo.relative_to(RAIZ)}")
    with arquivo.open(encoding="utf-8") as f:
        return [json.loads(l) for l in f if l.strip()]


def remover_sobreposicao(anterior: str, seguinte: str) -> str:
    """Descarta o pedaço de `seguinte` que já está no fim de `anterior`.

    Os chunks foram cortados com 50 caracteres de sobreposição; sem esta
    limpeza, o texto reconstruído repetiria as mesmas frases nas junções.
    """
    limite = min(SOBREPOSICAO_ESPERADA, len(anterior), len(seguinte))
    for k in range(limite, 0, -1):
        if anterior.endswith(seguinte[:k]):
            return seguinte[k:].lstrip()
    return seguinte


def montar_paginas(chunks: list[dict]) -> dict[str, dict[int, str]]:
    """{fonte: {pagina: texto}} — os chunks entram na ordem em que foram gravados."""
    por_fonte: dict[str, dict[int, list[dict]]] = defaultdict(lambda: defaultdict(list))
    for c in chunks:
        por_fonte[c["source"]][c.get("page") or 1].append(c)

    paginas: dict[str, dict[int, str]] = {}
    for fonte, mapa in por_fonte.items():
        paginas[fonte] = {}
        for pagina, lista in mapa.items():
            lista.sort(key=lambda c: c.get("id") or 0)
            texto = lista[0]["content"].strip()
            for anterior, seguinte in zip(lista, lista[1:]):
                texto = f"{texto} {remover_sobreposicao(anterior['content'], seguinte['content'])}".strip()
            paginas[fonte][pagina] = texto
    return paginas


def normalizar_espacos(texto: str) -> str:
    return " ".join(texto.split())


def escrever_txt(destino: Path, paginas: dict[int, str]) -> None:
    partes = [
        f"{'=' * 70}\nPÁGINA {pagina}\n{'=' * 70}\n{normalizar_espacos(texto)}\n"
        for pagina, texto in sorted(paginas.items())
    ]
    destino.write_text("\n".join(partes), encoding="utf-8")


FONTE_PDF = RAIZ / "api" / "_app" / "fonts" / "DejaVuSans.ttf"
TAMANHO_FONTE_MAXIMO = 10.0
TAMANHO_FONTE_MINIMO = 5.0


def escrever_pdf(destino: Path, paginas: dict[int, str]) -> None:
    """Um PDF em que a folha N contém exatamente a página original N.

    O extrator numera as páginas pela posição da folha, e é isso que vira a
    citação "[Fonte: x, página N]". Por isso (análise de 17/09/2026, A3-13):
    - nenhum texto extra entra na folha — a versão anterior escrevia
      "[página N]" no topo, e o marcador ia parar no índice;
    - a página nunca transborda para a folha seguinte: se o texto não cabe, a
      letra diminui; se nem assim couber, o script para com erro em vez de
      deslocar todas as citações seguintes;
    - número de página que falta vira folha em branco, pelo mesmo motivo.
    """
    from fpdf import FPDF  # já é dependência do app (gera as apostilas)

    pdf = FPDF(format="A4", unit="pt")
    pdf.set_auto_page_break(False)
    pdf.set_margins(45, 45, 45)
    if FONTE_PDF.exists():
        pdf.add_font("DejaVu", "", str(FONTE_PDF))
        familia = "DejaVu"
        preparar = str
    else:  # sem a fonte, só Latin-1; o que não couber vira "?"
        familia = "Helvetica"
        preparar = lambda t: t.encode("latin-1", "replace").decode("latin-1")  # noqa: E731
    largura_util = pdf.w - 2 * 45
    altura_util = pdf.h - 2 * 45

    ultima = max(paginas) if paginas else 0
    for numero in range(1, ultima + 1):
        pdf.add_page()
        texto = preparar(normalizar_espacos(paginas.get(numero, "")))
        if not texto:
            continue
        tamanho = TAMANHO_FONTE_MAXIMO
        while True:
            pdf.set_font(familia, size=tamanho)
            entrelinha = tamanho * 1.3
            linhas = pdf.multi_cell(largura_util, entrelinha, texto, dry_run=True, output="LINES")
            if len(linhas) * entrelinha <= altura_util:
                break
            if tamanho <= TAMANHO_FONTE_MINIMO:
                raise SystemExit(
                    f"A página {numero} não cabe numa folha nem com letra {TAMANHO_FONTE_MINIMO} pt "
                    f"({len(texto)} caracteres). Gerar assim deslocaria as citações seguintes."
                )
            tamanho -= 0.5
        pdf.multi_cell(largura_util, entrelinha, texto)

    pdf.output(str(destino))


def conferir_pdf(destino: Path, paginas: dict[int, str]) -> float:
    """Relê o PDF como o app faz e compara página a página com o texto original.

    Devolve a menor semelhança encontrada (1,0 = idêntico). Falha se o número de
    folhas não bater ou se sobrar o marcador antigo "[página N]".
    """
    import difflib

    from pypdf import PdfReader

    folhas = [(p.extract_text() or "") for p in PdfReader(str(destino)).pages]
    esperado = max(paginas) if paginas else 0
    if len(folhas) != esperado:
        raise SystemExit(f"{destino.name}: {len(folhas)} folhas, esperado {esperado}.")
    pior = 1.0
    for numero, original in paginas.items():
        lido = normalizar_espacos(folhas[numero - 1])
        if "[página" in lido:
            raise SystemExit(f"{destino.name}: marcador de página no texto da folha {numero}.")
        semelhanca = difflib.SequenceMatcher(None, normalizar_espacos(original), lido, autojunk=False).ratio()
        pior = min(pior, semelhanca)
    return pior


def nome_seguro(fonte: str) -> str:
    base = Path(fonte).stem
    limpo = unicodedata.normalize("NFKD", base).encode("ascii", "ignore").decode()
    return limpo or "documento"


def main() -> int:
    ap = argparse.ArgumentParser(description="Reconstrói o material a partir dos chunks salvos.")
    ap.add_argument("--fonte", help="processa só esta fonte (nome exato do campo source)")
    ap.add_argument("--sem-pdf", action="store_true", help="gera apenas os .txt")
    args = ap.parse_args()

    chunks = carregar_chunks()
    paginas_por_fonte = montar_paginas(chunks)
    if args.fonte:
        paginas_por_fonte = {k: v for k, v in paginas_por_fonte.items() if k == args.fonte}
        if not paginas_por_fonte:
            raise SystemExit(f"Fonte '{args.fonte}' não encontrada nos chunks.")

    SAIDA.mkdir(parents=True, exist_ok=True)
    print()
    total_paginas = 0
    for fonte, paginas in sorted(paginas_por_fonte.items()):
        qtd_chunks = sum(1 for c in chunks if c["source"] == fonte)
        nome = nome_seguro(fonte)
        escrever_txt(SAIDA / f"{nome}.txt", paginas)
        linha = f"  {nome}: {qtd_chunks} chunks → {len(paginas)} páginas"
        if not args.sem_pdf:
            escrever_pdf(SAIDA / f"{nome}.pdf", paginas)
            pior = conferir_pdf(SAIDA / f"{nome}.pdf", paginas)
            linha += f" (.txt + .pdf, semelhança mínima ao reler: {pior:.4f})"
        print(linha)
        total_paginas += len(paginas)

    print(f"\n{len(paginas_por_fonte)} documento(s), {total_paginas} páginas em {SAIDA.relative_to(RAIZ)}")
    print(
        "\nAlternativa sem perda: `scripts/reimportar_chunks.py` devolve os chunks com os\n"
        "embeddings originais (sem depender de nova extração). Use os dois assim: o PDF\n"
        "devolve o arquivo ao Storage, o reimport devolve o índice exato."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
