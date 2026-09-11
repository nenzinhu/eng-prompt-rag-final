/**
 * Desfaz os preditores de imagem do PDF (PNG e TIFF).
 *
 * Por que existe: as imagens que engordam os PDFs do curso são `/FlateDecode` —
 * os pixels estão lá, mas compactados E filtrados linha a linha. Para reencodar
 * em JPEG é preciso descompactar (o navegador faz, com `DecompressionStream`) e
 * depois desfazer o filtro, que é o que esta função faz.
 *
 * Filtro é uma transformação por linha que deixa o dado mais compressível:
 * em vez de guardar cada pixel, guarda a diferença em relação ao vizinho. Desfazer
 * é somar de volta.
 *
 * Só bits por componente 8 é suportado — os outros (1, 2, 4, 16) têm
 * empacotamento de bits e não aparecem nas imagens que importam aqui; quem chama
 * deve pular essas imagens em vez de arriscar pixel errado.
 *
 * Os preditores PNG (10 a 15) põem 1 byte de tipo de filtro no início de cada
 * linha; o 15 usa um tipo diferente por linha, e os outros usam o fixo do
 * próprio número. O TIFF (2) não tem esse byte.
 */

export interface ParamsPreditor {
  /** /Predictor do /DecodeParms. 1 = nenhum, 2 = TIFF, 10-15 = PNG. */
  predictor: number
  /** /Colors — componentes por pixel (1 = cinza, 3 = RGB, 4 = CMYK). */
  colors: number
  /** /BitsPerComponent. */
  bitsPerComponent: number
  /** /Columns — largura da imagem em amostras. */
  columns: number
}

export class PreditorNaoSuportado extends Error {}

/** Bytes por linha do dado filtrado (sem contar o byte de filtro do PNG). */
export function bytesPorLinha(p: ParamsPreditor): number {
  return Math.ceil((p.colors * p.columns * p.bitsPerComponent) / 8)
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

/** Desfaz o filtro e devolve os pixels crus (linha por linha, sem filtro). */
export function desfazerPreditor(dados: Uint8Array, p: ParamsPreditor): Uint8Array {
  if (p.bitsPerComponent !== 8) {
    throw new PreditorNaoSuportado(`bits por componente ${p.bitsPerComponent} (só 8 é suportado)`)
  }
  const linha = bytesPorLinha(p)
  if (linha <= 0) throw new PreditorNaoSuportado('linha de tamanho zero')
  if (p.predictor === 1) return dados

  const bpp = p.colors // em 8 bits, 1 byte por componente

  // TIFF (predictor 2): acumula ao longo da linha, por componente, sem byte de filtro.
  if (p.predictor === 2) {
    const saida = new Uint8Array(dados)
    for (let inicio = 0; inicio + linha <= saida.length; inicio += linha) {
      for (let i = bpp; i < linha; i++) {
        saida[inicio + i] = (saida[inicio + i] + saida[inicio + i - bpp]) & 0xff
      }
    }
    return saida
  }

  if (p.predictor < 10) {
    throw new PreditorNaoSuportado(`predictor ${p.predictor} desconhecido`)
  }

  // PNG (10 a 15): cada linha vem com 1 byte dizendo qual filtro foi aplicado.
  const linhas = Math.floor(dados.length / (linha + 1))
  const saida = new Uint8Array(linhas * linha)
  let anterior = new Uint8Array(linha)

  for (let n = 0; n < linhas; n++) {
    const base = n * (linha + 1)
    const tipo = dados[base]
    const origem = dados.subarray(base + 1, base + 1 + linha)
    const atual = new Uint8Array(linha)
    for (let i = 0; i < linha; i++) {
      const esq = i >= bpp ? atual[i - bpp] : 0
      const cima = anterior[i]
      const diag = i >= bpp ? anterior[i - bpp] : 0
      const bruto = origem[i]
      let valor: number
      switch (tipo) {
        case 0: // None
          valor = bruto
          break
        case 1: // Sub
          valor = bruto + esq
          break
        case 2: // Up
          valor = bruto + cima
          break
        case 3: // Average
          valor = bruto + ((esq + cima) >> 1)
          break
        case 4: // Paeth
          valor = bruto + paeth(esq, cima, diag)
          break
        default:
          // Tipo fora de 0-4: melhor tratar como None do que estourar o índice.
          valor = bruto
      }
      atual[i] = valor & 0xff
    }
    saida.set(atual, n * linha)
    anterior = atual
  }
  return saida
}

/** Páginas soltas de `/DecodeParms`, que pode ser dicionário ou lista. */
export interface ParamsFiltro {
  filtro: string
  params: ParamsPreditor | null
}

/** Nome do filtro sem a barra inicial e sem o sufixo de codificação. */
export function nomeFiltro(bruto: string): string {
  return bruto.replace(/^\//, '').replace(/Decode$/, '').toUpperCase()
}
