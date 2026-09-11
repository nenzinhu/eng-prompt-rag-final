/**
 * Compressão de imagens soltas (JPEG e PNG), no navegador.
 *
 * Diferente do compressor de PDF (que mexe dentro do arquivo), aqui a imagem é
 * decodificada, redesenhada no tamanho escolhido e reencodada — o caminho
 * clássico e o que dá os maiores ganhos em foto de celular e print.
 *
 * PNG é um caso à parte: ele é sem perda, então qualidade não existe. O ganho vem
 * de reduzir o tamanho (e de virar JPEG quando não há transparência, que costuma
 * ser uma redução enorme).
 */
import { dimensoesAlvo } from './canvas'

export interface OpcoesImagem {
  /** Maior lado da imagem final, em pixels. */
  larguraMax: number
  /** Qualidade do JPEG (0-100). Ignorada quando a saída é PNG. */
  qualidade: number
  /** `auto` vira JPEG quando não há transparência; PNG com transparência fica PNG. */
  formato: 'auto' | 'jpeg' | 'png'
}

export interface ResultadoImagem {
  blob: Blob
  largura: number
  altura: number
  larguraOriginal: number
  alturaOriginal: number
  formato: 'jpeg' | 'png'
  ganho: number
}

/** O PNG tem transparência de verdade? (decide entre manter PNG ou virar JPEG) */
export function temTransparencia(dados: Uint8ClampedArray, passo = 37): boolean {
  // Amostragem: varrer todos os pixels de uma foto grande é desperdício, e a
  // transparência não aparece em pixels isolados.
  for (let i = 3; i < dados.length; i += 4 * passo) {
    if (dados[i] < 250) return true
  }
  return false
}

export async function comprimirImagem(file: File | Blob, opcoes: OpcoesImagem): Promise<ResultadoImagem> {
  const nome = file instanceof File ? file.name : 'imagem'
  const bitmap = await createImageBitmap(file)
  const larguraOriginal = bitmap.width
  const alturaOriginal = bitmap.height

  const alvo = dimensoesAlvo(bitmap.width, bitmap.height, opcoes.larguraMax)

  const tela = document.createElement('canvas')
  tela.width = alvo.largura
  tela.height = alvo.altura
  const ctx = tela.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new Error('canvas 2D indisponível neste navegador')
  }
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  const ehPng = /image\/png/i.test(file.type) || /\.png$/i.test(nome)
  let usarPng = false

  if (ehPng) {
    // Lê os pixels originais para saber se há transparência antes de decidir.
    const ida = document.createElement('canvas')
    ida.width = bitmap.width
    ida.height = bitmap.height
    const ctxIda = ida.getContext('2d')
    let transparente = false
    if (ctxIda) {
      ctxIda.drawImage(bitmap, 0, 0)
      try {
        const amostra = ctxIda.getImageData(0, 0, bitmap.width, bitmap.height)
        transparente = temTransparencia(amostra.data)
      } catch {
        transparente = true // não consegui inspecionar: não arrisco achatá-la
      }
    }
    usarPng = opcoes.formato === 'png' || (opcoes.formato === 'auto' && transparente)
    if (!usarPng) {
      // JPEG não tem transparência: fundo branco, senão sai preto.
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, alvo.largura, alvo.altura)
    }
  } else {
    // Foto/JPEG: fundo branco também (PNG opaco disfarçado de jpg, etc.).
    usarPng = opcoes.formato === 'png'
    if (!usarPng) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, alvo.largura, alvo.altura)
    }
  }

  ctx.drawImage(bitmap, 0, 0, alvo.largura, alvo.altura)
  bitmap.close()

  const blob = await new Promise<Blob>((resolver, rejeitar) => {
    tela.toBlob(
      (b) => (b ? resolver(b) : rejeitar(new Error('não consegui gerar o arquivo'))),
      usarPng ? 'image/png' : 'image/jpeg',
      usarPng ? undefined : opcoes.qualidade / 100
    )
  })

  const original = file.size
  return {
    blob,
    largura: alvo.largura,
    altura: alvo.altura,
    larguraOriginal,
    alturaOriginal,
    formato: usarPng ? 'png' : 'jpeg',
    ganho: original > 0 ? 1 - blob.size / original : 0,
  }
}
