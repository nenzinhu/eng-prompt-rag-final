/**
 * Compressor de PDF que roda no NAVEGADOR — reduz reencodando as imagens
 * embutidas, sem perder o texto.
 *
 * Por que assim: medido nos PDFs reais do curso (10/09/2026), o que engorda os
 * arquivos são as imagens — no `algoritmo-e-logica` são 11,88 MB dos 13,55 MB, e
 * a maioria está em `/FlateDecode` (foto guardada SEM perda, 0,4 MB por página).
 * Reencodar essas imagens em JPEG levou o arquivo de 13,55 MB para 5,41 MB com o
 * texto intacto (96 mil caracteres, 122 páginas).
 *
 * O que NÃO funciona (e por que este arquivo é assim):
 * - `pdf-lib` sozinho: reescrita dá 0,3% de ganho — ele não recodifica imagem;
 * - `pypdf` no servidor: a reescrita dá 1%; e na Vercel o arquivo grande nem
 *   chega (limite de 4,5 MB por requisição).
 *
 * Por isso o trabalho é no cliente: o arquivo não sai da máquina do aluno, não
 * custa nada e não tem limite de tamanho.
 *
 * As partes que dependem do navegador (inflar o `/FlateDecode` e recodificar em
 * JPEG, via canvas) são INJETADAS em `Dependencias` — assim este módulo, que é a
 * lógica do PDF, roda e é testado no Node com pdf-lib de verdade.
 */
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
} from 'pdf-lib'

import { PreditorNaoSuportado, desfazerPreditor, type ParamsPreditor } from './predictor'

export interface OpcoesCompressao {
  /** Maior lado da imagem no PDF final, em pixels. */
  larguraMax: number
  /** Qualidade do JPEG, 0-100. */
  qualidade: number
}

export interface EntradaJpeg {
  tipo: 'jpeg'
  bytes: Uint8Array
}

export interface EntradaPixels {
  tipo: 'pixels'
  pixels: Uint8Array
  largura: number
  altura: number
  /** 1 = cinza, 3 = RGB, 4 = CMYK. */
  canais: 1 | 3 | 4
}

export type EntradaImagem = EntradaJpeg | EntradaPixels

export interface SaidaImagem {
  bytes: Uint8Array
  /** Dimensões reais do JPEG gerado (podem ser menores, se houve redução). */
  largura: number
  altura: number
}

export interface Dependencias {
  /** Descompacta zlib (`/FlateDecode`). No navegador: DecompressionStream. */
  inflar(dados: Uint8Array): Promise<Uint8Array>
  /** Recodifica em JPEG. No navegador: canvas. Devolve `null` para não mexer. */
  reencodar(entrada: EntradaImagem, opcoes: OpcoesCompressao): Promise<SaidaImagem | null>
}

export interface RelatorioImagem {
  largura: number
  altura: number
  bytesAntes: number
  bytesDepois: number
  acao: 'reencodada' | 'mantida' | 'ignorada'
  motivo?: string
}

export interface ResultadoCompressao {
  pdf: Uint8Array
  relatorio: RelatorioImagem[]
  resumo: {
    imagens: number
    reencodadas: number
    ignoradas: number
    bytesAntes: number
    bytesDepois: number
  }
}

/** Nomes aceitos como cinza/RGB/CMYK (com as variantes de calibração). */
const CANAIS_POR_CORESPACE: Record<string, 1 | 3 | 4> = {
  DeviceGray: 1,
  CalGray: 1,
  DeviceRGB: 3,
  CalRGB: 3,
  DeviceCMYK: 4,
}

function nome(valor: unknown): string {
  return String(valor ?? '').replace(/^\//, '')
}

/** Lista de filtros, aceitando filtro único ou lista (encoder e/ou decode). */
function filtros(dict: PDFDict, resolver: (o: unknown) => unknown): string[] {
  const bruto = resolver(dict.get(PDFName.of('Filter')))
  if (!bruto) return []
  if (bruto instanceof PDFArray) return bruto.asArray().map((f) => nome(resolver(f)))
  return [nome(bruto)]
}

/** `/DecodeParms` acompanha `/Filter`; pode ser dicionário único ou lista. */
function paramsDeFiltro(
  dict: PDFDict,
  resolver: (o: unknown) => unknown,
  indice: number
): ParamsPreditor | null {
  let parms = resolver(dict.get(PDFName.of('DecodeParms')) ?? dict.get(PDFName.of('DP')))
  if (!parms) return null
  if (parms instanceof PDFArray) parms = resolver(parms.get(indice))
  if (!(parms instanceof PDFDict)) return null
  const valor = (chave: string, padrao: number) => {
    const v = resolver(parms.get(PDFName.of(chave)))
    const n = v instanceof PDFNumber ? Number(v.asNumber()) : Number(v?.toString() ?? NaN)
    return Number.isFinite(n) && n > 0 ? n : padrao
  }
  return {
    predictor: valor('Predictor', 1),
    colors: valor('Colors', 1),
    bitsPerComponent: valor('BitsPerComponent', 8),
    columns: valor('Columns', 1),
  }
}

/** Resolve `Colors` do `/DecodeParms` ou, na falta, do espaço de cor. */
function canaisDe(
  dict: PDFDict,
  resolver: (o: unknown) => unknown,
  params: ParamsPreditor | null
): 1 | 3 | 4 | null {
  const espaco = resolver(dict.get(PDFName.of('ColorSpace')))
  if (espaco instanceof PDFArray) {
    // Formas com índice (ex.: [/Indexed ...]) não são suportadas: melhor pular.
    return null
  }
  const canais = CANAIS_POR_CORESPACE[nome(espaco)]
  if (!canais) return null
  if (params && params.colors !== canais && params.colors !== 1) return params.colors as 1 | 3 | 4
  return canais
}

function numero(dict: PDFDict, resolver: (o: unknown) => unknown, chave: string): number {
  const v = resolver(dict.get(PDFName.of(chave)))
  if (v instanceof PDFNumber) return v.asNumber()
  const n = Number(v?.toString() ?? NaN)
  return Number.isFinite(n) ? n : 0
}

/**
 * Comprime o PDF reencodando as imagens embutidas.
 *
 * Imagens com máscara, 1 bit por componente ou `/Decode` invertido são deixadas
 * como estão de propósito: reencodá-las muda a aparência (logo vira borrão,
 * máscara de recorte inverte) — e o ganho não compensa o risco.
 */
export async function comprimirPdf(
  bytes: Uint8Array,
  opcoes: OpcoesCompressao,
  deps: Dependencias
): Promise<ResultadoCompressao> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
  const contexto = doc.context
  /** Filtros, cores e dimensões podem vir por referência indireta. */
  const resolver = (o: unknown) => (o ? contexto.lookup(o as never) ?? o : o)
  const relatorio: RelatorioImagem[] = []

  for (const [ref, objeto] of contexto.enumerateIndirectObjects()) {
    if (!(objeto instanceof PDFRawStream)) continue
    const dict = objeto.dict
    if (nome(resolver(dict.get(PDFName.of('Subtype')))) !== 'Image') continue

    const largura = numero(dict, resolver, 'Width')
    const altura = numero(dict, resolver, 'Height')
    const antes = objeto.contents
    const registrar = (acao: RelatorioImagem['acao'], depois = antes.length, motivo?: string) =>
      relatorio.push({ largura, altura, bytesAntes: antes.length, bytesDepois: depois, acao, motivo })

    const listaFiltros = filtros(dict, resolver)
    const params = paramsDeFiltro(dict, resolver, listaFiltros.length - 1)

    if (dict.get(PDFName.of('ImageMask')) || dict.get(PDFName.of('SMask'))) {
      registrar('ignorada', antes.length, 'tem máscara')
      continue
    }
    if (dict.get(PDFName.of('Decode'))) {
      registrar('ignorada', antes.length, 'tem tabela /Decode')
      continue
    }
    if (numero(dict, resolver, 'BitsPerComponent') !== 8) {
      registrar('ignorada', antes.length, 'não é 8 bits por componente')
      continue
    }
    if (largura < 64 || altura < 64) {
      registrar('ignorada', antes.length, 'imagem pequena')
      continue
    }

    let entrada: EntradaImagem | null = null
    try {
      const unico = listaFiltros.length === 1 ? listaFiltros[0] : ''
      if (unico === 'DCTDecode') {
        // Já é um JPEG: o canvas decodifica direto, sem inflar nada.
        entrada = { tipo: 'jpeg', bytes: antes }
      } else if (unico === 'FlateDecode' || unico === 'Fl') {
        const canais = canaisDe(dict, resolver, params)
        if (!canais) {
          registrar('ignorada', antes.length, 'espaço de cor não suportado')
          continue
        }
        const inflado = await deps.inflar(antes)
        const pixels = desfazerPreditor(
          inflado,
          params ?? { predictor: 1, colors: canais, bitsPerComponent: 8, columns: largura }
        )
        entrada = { tipo: 'pixels', pixels, largura, altura, canais }
      } else {
        registrar('ignorada', antes.length, `filtros não suportados: ${listaFiltros.join('+') || 'nenhum'}`)
        continue
      }
    } catch (e) {
      if (e instanceof PreditorNaoSuportado) {
        registrar('ignorada', antes.length, e.message)
      } else {
        registrar('ignorada', antes.length, `não deu para decodificar (${(e as Error).name})`)
      }
      continue
    }

    if (!entrada) {
      registrar('ignorada', antes.length, 'formato não tratado')
      continue
    }

    let saida: SaidaImagem | null = null
    try {
      saida = await deps.reencodar(entrada, opcoes)
    } catch (e) {
      registrar('ignorada', antes.length, `falha ao recodificar (${(e as Error).name})`)
      continue
    }

    if (!saida || saida.bytes.length >= antes.length) {
      registrar('mantida', antes.length, 'o JPEG ficaria maior')
      continue
    }

    const novoDict = PDFDict.withContext(contexto)
    novoDict.set(PDFName.of('Type'), PDFName.of('XObject'))
    novoDict.set(PDFName.of('Subtype'), PDFName.of('Image'))
    novoDict.set(PDFName.of('Width'), PDFNumber.of(saida.largura))
    novoDict.set(PDFName.of('Height'), PDFNumber.of(saida.altura))
    novoDict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB'))
    novoDict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8))
    novoDict.set(PDFName.of('Filter'), PDFName.of('DCTDecode'))
    contexto.assign(ref, PDFRawStream.of(novoDict, saida.bytes))
    registrar('reencodada', saida.bytes.length)
  }

  const pdf = await doc.save({ useObjectStreams: true, addDefaultPage: false })

  const reencodadas = relatorio.filter((r) => r.acao === 'reencodada')
  return {
    pdf,
    relatorio,
    resumo: {
      imagens: relatorio.length,
      reencodadas: reencodadas.length,
      ignoradas: relatorio.filter((r) => r.acao === 'ignorada').length,
      bytesAntes: reencodadas.reduce((s, r) => s + r.bytesAntes, 0),
      bytesDepois: reencodadas.reduce((s, r) => s + r.bytesDepois, 0),
    },
  }
}
