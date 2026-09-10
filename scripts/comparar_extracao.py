"""Compara a extração de texto do pypdf com e sem fontTools.

O pypdf avisa no log que não consegue ler a codificação de fontes CFF Type1 sem
o fontTools — e isso pode significar texto perdido na indexação. Este script
mede o efeito real nos PDFs do projeto antes de decidir se vale a dependência.

Uso:
    .venv/Scripts/python.exe scripts/comparar_extracao.py
"""
from __future__ import annotations

import io
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PDFS = RAIZ / "supabase-backup" / "pdfs"


def medir(caminho: Path) -> tuple[int, int, int]:
    """(páginas, caracteres extraídos, palavras com caractere inválido)."""
    from pypdf import PdfReader

    leitor = PdfReader(io.BytesIO(caminho.read_bytes()))
    chars = 0
    suspeitas = 0
    for pagina in leitor.pages:
        texto = pagina.extract_text() or ""
        chars += len(texto)
        suspeitas += len(re.findall(r"[\ufffd\u0000-\u0008\u000b\u000c\u000e-\u001f]", texto))
    return len(leitor.pages), chars, suspeitas


def main() -> int:
    try:
        import fontTools  # noqa: F401

        tem = fontTools.version
    except ImportError:
        tem = None
    print(f"fontTools: {'instalado ' + tem if tem else 'NÃO instalado'}\n")

    arquivos = sorted(PDFS.glob("*.pdf"))
    if not arquivos:
        raise SystemExit(f"Nenhum PDF em {PDFS}")
    for caminho in arquivos:
        paginas, chars, suspeitas = medir(caminho)
        print(f"  {caminho.name[:46]:48s} {paginas:4d} pág | {chars:7d} chars | {suspeitas:5d} suspeitos")
    return 0


if __name__ == "__main__":
    sys.exit(main())
