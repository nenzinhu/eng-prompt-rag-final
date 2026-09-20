/**
 * Parte do compressor que depende do NAVEGADOR: descompacta o `/FlateDecode` e
 * recodifica a imagem em JPEG usando canvas.
 *
 * O canvas é o "codec" que o navegador já tem: ele decodifica JPEG/PNG (e CMYK)
 * e reencoda em JPEG com qualidade escolhida, sem biblioteca nenhuma, sem custo
 * e sem enviar o arquivo a lugar algum.
 */
import type { Dependencias, EntradaImagem, OpcoesCompressao, SaidaImagem } from './pdf'

/** Descompacta um fluxo zlib do PDF (`/FlateDecode`). */
export async function inflar(dados: Uint8Array): Promise<Uint8Array> {
  const tentar = async (formato: 'deflate' | 'deflate-raw') => {
    const fluxo = new Blob([dados as BlobPart])
      .stream()
      .pipeThrough(new DecompressionStream(formato))
    return new Uint8Array(await new Response(fluxo).arrayBuffer())
  }
  try {
    return await tentar('deflate')
  } catch {
    // Alguns produtores gravam deflate cru, sem o cabeçalho zlib.
    return await tentar('deflate-raw')
  }
}

/** Converte os pixels crus do PDF em RGBA para o `ImageData` do canvas. */
export function pixelsParaRgba(entrada: {
  pixels: Uint8Array
  largura: number
  altura: number
  canais: 1 | 3 | 4
}): Uint8ClampedArray<ArrayBuffer> {
  const { pixels, largura, altura, canais } = entrada
  const total = largura * altura
  // Buffer próprio (e não `new Uint8ClampedArray(n)`): o `ImageData` exige um
  // ArrayBuffer concreto, não o tipo genérico ArrayBufferLike.
  const rgba = new Uint8ClampedArray(new ArrayBuffer(total * 4))
  if (canais === 1) {
    for (let i = 0; i < total; i++) {
      const v = pixels[i] ?? 0
      rgba[i * 4] = v
      rgba[i * 4 + 1] = v
      rgba[i * 4 + 2] = v
      rgba[i * 4 + 3] = 255
    }
    return rgba
  }
  if (canais === 3) {
    for (let i = 0; i < total; i++) {
      rgba[i * 4] = pixels[i * 3] ?? 0
      rgba[i * 4 + 1] = pixels[i * 3 + 1] ?? 0
      rgba[i * 4 + 2] = pixels[i * 3 + 2] ?? 0
      rgba[i * 4 + 3] = 255
    }
    return rgba
  }
  // CMYK: conversão padrão das gráficas (o K escurece os três canais).
  for (let i = 0; i < total; i++) {
    const c = pixels[i * 4] ?? 0
    const m = pixels[i * 4 + 1] ?? 0
    const y = pixels[i * 4 + 2] ?? 0
    const k = pixels[i * 4 + 3] ?? 0
    rgba[i * 4] = ((255 - c) * (255 - k)) / 255
    rgba[i * 4 + 1] = ((255 - m) * (255 - k)) / 255
    rgba[i * 4 + 2] = ((255 - y) * (255 - k)) / 255
    rgba[i * 4 + 3] = 255
  }
  return rgba
}

interface Tela {
  largura: number
  altura: number
  desenhar(origem: CanvasImageSource, largura: number, altura: number): void
  paraJpeg(qualidade: number): Promise<Uint8Array>
}

/** Canvas de trabalho — OffscreenCanvas quando existe, senão o do documento. */
async function criarTela(largura: number, altura: number): Promise<Tela> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const tela = new OffscreenCanvas(largura, altura)
    const ctx = tela.getContext('2d')
    if (!ctx) throw new Error('canvas 2D indisponível')
    return {
      largura,
      altura,
      desenhar: (origem, w, h) => {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, w, h)
        ctx.drawImage(origem, 0, 0, w, h)
      },
      paraJpeg: async (qualidade) => {
        const blob = await tela.convertToBlob({ type: 'image/jpeg', quality: qualidade / 100 })
        return new Uint8Array(await blob.arrayBuffer())
      },
    }
  }

  const tela = document.createElement('canvas')
  tela.width = largura
  tela.height = altura
  const ctx = tela.getContext('2d')
  if (!ctx) throw new Error('canvas 2D indisponível')
  return {
    largura,
    altura,
    desenhar: (origem, w, h) => {
      // Fundo branco: JPEG não tem transparência, e sem isso o PNG transparente
      // sairia com fundo preto.
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(origem, 0, 0, w, h)
    },
    paraJpeg: (qualidade) =>
      new Promise((resolver, rejeitar) => {
        tela.toBlob(
          (blob) => {
            if (!blob) return rejeitar(new Error('não consegui gerar o JPEG'))
            void blob.arrayBuffer().then((b) => resolver(new Uint8Array(b)))
          },
          'image/jpeg',
          qualidade / 100
        )
      }),
  }
}

/**
 * Maior lado permitido, mantendo a proporção.
 *
 * Um limite inválido (0, negativo, NaN) é tratado como "sem limite": reduzir tudo
 * a 1×1 pixel seria destruir o arquivo em silêncio, e isso já aconteceu neste
 * projeto quando um `<select>` vazio virou `0` no estado.
 */
export function dimensoesAlvo(largura: number, altura: number, larguraMax: number) {
  const limite = Number(larguraMax)
  if (!Number.isFinite(limite) || limite <= 0) return { largura, altura }
  const maior = Math.max(largura, altura)
  if (maior <= limite) return { largura, altura }
  const fator = limite / maior
  return {
    largura: Math.max(1, Math.round(largura * fator)),
    altura: Math.max(1, Math.round(altura * fator)),
  }
}

/**
 * Recodifica uma imagem do PDF em JPEG.
 *
 * Devolve `null` quando não vale a pena mexer (deixa o `pdf.ts` manter o
 * original em vez de arriscar piorar).
 */
export async function reencodarImagem(
  entrada: EntradaImagem,
  opcoes: OpcoesCompressao
): Promise<SaidaImagem | null> {
  let origem: ImageBitmap
  if (entrada.tipo === 'jpeg') {
    origem = await createImageBitmap(new Blob([entrada.bytes as BlobPart], { type: 'image/jpeg' }))
  } else {
    const rgba = pixelsParaRgba(entrada)
    const dados = new ImageData(rgba, entrada.largura, entrada.altura)
    // A tela recebe o pixel exato: desenhar de uma tela para outra poderia
    // reamostrar a imagem antes de qualquer redução. (A tela do tamanho cheio
    // era criada aqui e nunca usada — memória à toa numa imagem grande.)
    if (typeof OffscreenCanvas !== 'undefined') {
      const direta = new OffscreenCanvas(entrada.largura, entrada.altura)
      direta.getContext('2d')?.putImageData(dados, 0, 0)
      origem = direta.transferToImageBitmap()
    } else {
      const direta = document.createElement('canvas')
      direta.width = entrada.largura
      direta.height = entrada.altura
      direta.getContext('2d')?.putImageData(dados, 0, 0)
      origem = await createImageBitmap(direta)
    }
  }

  const alvo = dimensoesAlvo(origem.width, origem.height, opcoes.larguraMax)
  const tela = await criarTela(alvo.largura, alvo.altura)
  tela.desenhar(origem, alvo.largura, alvo.altura)
  if ('close' in origem) origem.close()

  const bytes = await tela.paraJpeg(opcoes.qualidade)
  return { bytes, largura: alvo.largura, altura: alvo.altura }
}

/** Dependências reais do compressor, para usar no navegador. */
export const dependenciasNavegador: Dependencias = {
  inflar,
  reencodar: reencodarImagem,
}
