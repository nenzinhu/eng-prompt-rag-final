'use client'

/**
 * Extração de texto dos DOCUMENTOS anexados — roda no NAVEGADOR, como o OCR.
 *
 * - PDF: lê a camada de texto com pdfjs; página sem texto (PDF digitalizado)
 *   é renderizada em canvas e passa pelo OCR do tesseract.
 * - DOCX: mammoth extrai o texto cru.
 * - TXT/MD/CSV/JSON e afins: lidos direto.
 *
 * O arquivo nunca sai do computador do aluno; só o texto vai para o campo.
 */
import { reconhecerImagem } from './ocr'

/** Página com menos que isso de texto é tratada como imagem digitalizada. */
const MIN_CARACTERES_PAGINA = 20
const MAX_PAGINAS = 60
const ESCALA_RENDER = 2

const EXTENSOES_TEXTO = ['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'xml', 'html', 'htm', 'py', 'js', 'ts', 'sql', 'log']

export type TipoAnexo = 'imagem' | 'pdf' | 'docx' | 'texto' | null

function extensao(nome: string): string {
  return nome.split('.').pop()?.toLowerCase() ?? ''
}

export function tipoDoArquivo(file: File): TipoAnexo {
  const ext = extensao(file.name)
  if (file.type.startsWith('image/')) return 'imagem'
  if (file.type === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (ext === 'docx') return 'docx'
  if (file.type.startsWith('text/') || EXTENSOES_TEXTO.includes(ext)) return 'texto'
  return null
}

/** `accept` do input de arquivo: imagens + documentos suportados. */
export const ACEITOS = ['image/*', '.pdf', '.docx', ...EXTENSOES_TEXTO.map((e) => `.${e}`)].join(',')

async function textoDePdf(file: File, onProgresso?: (fracao: number) => void): Promise<string> {
  // Build legacy + worker servido de /public (copiado no postinstall): o
  // bundler do Next quebra o worker do pdfjs quando tenta empacotá-lo.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
  const tarefa = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const doc = await tarefa.promise
  try {
    const total = Math.min(doc.numPages, MAX_PAGINAS)
    const partes: string[] = []
    for (let n = 1; n <= total; n++) {
      const pagina = await doc.getPage(n)
      const conteudo = await pagina.getTextContent()
      let texto = conteudo.items
        .map((i) => ('str' in i ? i.str + (i.hasEOL ? '\n' : ' ') : ''))
        .join('')
        .trim()

      if (texto.length < MIN_CARACTERES_PAGINA) {
        // Página digitalizada: renderiza e passa pelo OCR.
        const viewport = pagina.getViewport({ scale: ESCALA_RENDER })
        const canvas = document.createElement('canvas')
        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)
        await pagina.render({ canvas, viewport }).promise
        const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
        if (blob) {
          texto = (
            await reconhecerImagem(blob, (f) => onProgresso?.((n - 1 + f) / total))
          ).trim()
        }
      }
      if (texto) partes.push(texto)
      pagina.cleanup()
      onProgresso?.(n / total)
    }
    if (doc.numPages > MAX_PAGINAS) {
      partes.push(`[… PDF tem ${doc.numPages} páginas; foram lidas as primeiras ${MAX_PAGINAS}]`)
    }
    return partes.join('\n\n')
  } finally {
    void tarefa.destroy()
  }
}

async function textoDeDocx(file: File): Promise<string> {
  const mammoth = await import('mammoth')
  const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
  return value
}

/** Lê o texto de um documento (não imagem). Imagens vão por `reconhecerImagem`. */
export async function extrairTextoDocumento(
  file: File,
  onProgresso?: (fracao: number) => void
): Promise<string> {
  const tipo = tipoDoArquivo(file)
  if (tipo === 'pdf') return textoDePdf(file, onProgresso)
  if (tipo === 'docx') return textoDeDocx(file)
  if (tipo === 'texto') return file.text()
  throw new Error('formato não suportado (use imagem, PDF, DOCX ou texto)')
}
