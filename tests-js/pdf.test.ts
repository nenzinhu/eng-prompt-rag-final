/**
 * Testes do compressor de PDF (a parte que não depende do navegador).
 *
 * O PDF de teste é construído aqui com a MESMA forma dos arquivos reais: imagem
 * `/FlateDecode` com preditor PNG, que é o caso que engorda as apostilas.
 * O `inflar` é o zlib de verdade do Node e o `reencodar` é um dublê — assim o
 * que está sob teste é a lógica do PDF (achar imagem, decodificar, substituir),
 * não o codec.
 *
 * Executa com: node --experimental-strip-types --test tests-js/pdf.test.ts
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { deflateSync, inflateSync } from 'node:zlib'

import {
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  StandardFonts,
} from 'pdf-lib'

import { comprimirPdf, type Dependencias, type OpcoesCompressao } from '../lib/compress/pdf.ts'

const OPCOES: OpcoesCompressao = { larguraMax: 400, qualidade: 70 }

/** Aplica o filtro Sub do PNG, linha a linha (como um encoder faria). */
function aplicarSub(pixels: Uint8Array, largura: number, altura: number): Uint8Array {
  const saida = new Uint8Array(altura * (largura + 1))
  for (let y = 0; y < altura; y++) {
    const base = y * (largura + 1)
    saida[base] = 1 // Sub
    for (let x = 0; x < largura; x++) {
      const atual = pixels[y * largura + x]
      const esquerda = x > 0 ? pixels[y * largura + x - 1] : 0
      saida[base + 1 + x] = (atual - esquerda) & 0xff
    }
  }
  return saida
}

interface OpcoesPdfTeste {
  largura?: number
  altura?: number
  /** Filtro declarado no dicionário da imagem. */
  filtro?: 'FlateDecode' | 'DCTDecode'
  comPreditor?: boolean
  bitsPerComponent?: number
  comSmask?: boolean
  /** Bytes brutos da imagem (quando não se quer gerar pixels). */
  conteudo?: Uint8Array
}

/** Monta um PDF de 1 página com uma imagem e um texto, na forma dos reais. */
async function pdfComImagem(op: OpcoesPdfTeste = {}): Promise<Uint8Array> {
  const largura = op.largura ?? 200
  const altura = op.altura ?? 200
  const filtro = op.filtro ?? 'FlateDecode'
  const bpc = op.bitsPerComponent ?? 8

  const doc = await PDFDocument.create()
  const fonte = await doc.embedFont(StandardFonts.Helvetica)
  const pagina = doc.addPage([300, 300])
  pagina.drawText('TEXTO QUE PRECISA SOBREVIVER', { x: 20, y: 260, size: 10, font: fonte })

  const contexto = doc.context

  let conteudo = op.conteudo
  if (!conteudo) {
    // Textura simples, sem repetição perfeita, para o deflate ter o que fazer.
    const pixels = new Uint8Array(largura * altura)
    for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 37 + (i % 11) * 13) & 0xff
    const filtrado = op.comPreditor === false ? pixels : aplicarSub(pixels, largura, altura)
    conteudo = new Uint8Array(deflateSync(Buffer.from(filtrado)))
  }

  const dict = PDFDict.withContext(contexto)
  dict.set(PDFName.of('Type'), PDFName.of('XObject'))
  dict.set(PDFName.of('Subtype'), PDFName.of('Image'))
  dict.set(PDFName.of('Width'), PDFNumber.of(largura))
  dict.set(PDFName.of('Height'), PDFNumber.of(altura))
  dict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceGray'))
  dict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(bpc))
  dict.set(PDFName.of('Filter'), PDFName.of(filtro))

  if (filtro === 'FlateDecode' && op.comPreditor !== false) {
    const parms = PDFDict.withContext(contexto)
    parms.set(PDFName.of('Predictor'), PDFNumber.of(15))
    parms.set(PDFName.of('Colors'), PDFNumber.of(1))
    parms.set(PDFName.of('BitsPerComponent'), PDFNumber.of(bpc))
    parms.set(PDFName.of('Columns'), PDFNumber.of(largura))
    dict.set(PDFName.of('DecodeParms'), parms)
  }

  const refImagem = contexto.register(PDFRawStream.of(dict, conteudo))
  const xobjects = PDFDict.withContext(contexto)
  xobjects.set(PDFName.of('Im0'), refImagem)

  const recursos = PDFDict.withContext(contexto)
  recursos.set(PDFName.of('XObject'), xobjects)
  const refRecursos = contexto.register(recursos)
  const paginaDict = pagina.node
  paginaDict.set(PDFName.of('Resources'), refRecursos)

  if (op.comSmask) {
    const smaskDict = PDFDict.withContext(contexto)
    smaskDict.set(PDFName.of('Type'), PDFName.of('XObject'))
    smaskDict.set(PDFName.of('Subtype'), PDFName.of('Image'))
    smaskDict.set(PDFName.of('Width'), PDFNumber.of(largura))
    smaskDict.set(PDFName.of('Height'), PDFNumber.of(altura))
    smaskDict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceGray'))
    smaskDict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8))
    smaskDict.set(PDFName.of('Filter'), PDFName.of('FlateDecode'))
    const mascara = new Uint8Array(largura * altura).fill(255)
    dict.set(PDFName.of('SMask'), contexto.register(PDFRawStream.of(smaskDict, mascara)))
  }

  return doc.save({ useObjectStreams: true })
}

/** Dublê: devolve um JPEG minúsculo, mas registra o que recebeu. */
function dublê(fazer: (entrada: { tipo: string; [k: string]: unknown }) => { bytes: Uint8Array; largura: number; altura: number } | null) {
  const recebidas: string[] = []
  const deps: Dependencias = {
    inflar: async (dados) => new Uint8Array(inflateSync(Buffer.from(dados))),
    reencodar: async (entrada) => {
      recebidas.push(entrada.tipo)
      return fazer(entrada as never)
    },
  }
  return { deps, recebidas }
}

const jpegFalso = (tamanho = 200) => new Uint8Array(tamanho).fill(7)

test('a imagem FlateDecode com preditor é decodificada e substituída', async () => {
  const original = await pdfComImagem({ largura: 200, altura: 200, comPreditor: true })
  const { deps, recebidas } = dublê(() => ({ bytes: jpegFalso(), largura: 200, altura: 200 }))

  const r = await comprimirPdf(original, OPCOES, deps)

  assert.equal(recebidas.length, 1, 'a imagem devia chegar ao reencodador')
  assert.equal(recebidas[0], 'pixels', 'FlateDecode chega como pixels, não como JPEG')
  assert.equal(r.resumo.reencodadas, 1)
  assert.ok(r.pdf.length < original.length, 'o PDF final devia ser menor')
  assert.ok(r.resumo.bytesDepois < r.resumo.bytesAntes)
})

test('os pixels decodificados têm o tamanho certo', async () => {
  const original = await pdfComImagem({ largura: 120, altura: 80, comPreditor: true })
  const recebidos: { pixels: Uint8Array; largura: number; altura: number }[] = []
  const deps: Dependencias = {
    inflar: async (d) => new Uint8Array(inflateSync(Buffer.from(d))),
    reencodar: async (entrada) => {
      if (entrada.tipo === 'pixels') recebidos.push(entrada)
      return { bytes: jpegFalso(), largura: 120, altura: 80 }
    },
  }
  await comprimirPdf(original, OPCOES, deps)
  assert.equal(recebidos.length, 1, 'devia ter recebido pixels uma vez')
  assert.equal(recebidos[0].pixels.length, 120 * 80, 'sem o byte de filtro por linha')
})

test('predictor ausente também funciona (imagem sem filtro por linha)', async () => {
  const original = await pdfComImagem({ largura: 100, altura: 100, comPreditor: false })
  let tamanho = 0
  const deps: Dependencias = {
    inflar: async (d) => new Uint8Array(inflateSync(Buffer.from(d))),
    reencodar: async (entrada) => {
      if (entrada.tipo === 'pixels') tamanho = entrada.pixels.length
      return { bytes: jpegFalso(), largura: 100, altura: 100 }
    },
  }
  await comprimirPdf(original, OPCOES, deps)
  assert.equal(tamanho, 100 * 100)
})

test('JPEG embutido é repassado como jpeg (sem inflar)', async () => {
  const original = await pdfComImagem({ filtro: 'DCTDecode', conteudo: new Uint8Array(1000).fill(3) })
  const { deps, recebidas } = dublê(() => ({ bytes: jpegFalso(), largura: 200, altura: 200 }))
  const r = await comprimirPdf(original, OPCOES, deps)
  assert.deepEqual(recebidas, ['jpeg'])
  assert.equal(r.resumo.reencodadas, 1)
})

test('imagem com máscara é deixada em paz', async () => {
  const original = await pdfComImagem({ comSmask: true })
  const { deps, recebidas } = dublê(() => ({ bytes: jpegFalso(), largura: 200, altura: 200 }))
  const r = await comprimirPdf(original, OPCOES, deps)
  assert.deepEqual(recebidas, [], 'não devia nem tentar decodificar')
  assert.equal(r.resumo.reencodadas, 0)
  assert.ok(r.relatorio.some((i) => i.motivo === 'tem máscara'))
})

test('imagem pequena (ícone) é ignorada', async () => {
  const original = await pdfComImagem({ largura: 32, altura: 32 })
  const { deps, recebidas } = dublê(() => ({ bytes: jpegFalso(), largura: 32, altura: 32 }))
  const r = await comprimirPdf(original, OPCOES, deps)
  assert.deepEqual(recebidas, [])
  assert.ok(r.relatorio.some((i) => i.motivo === 'imagem pequena'))
})

test('bits por componente diferente de 8 é ignorado', async () => {
  const original = await pdfComImagem({ bitsPerComponent: 4, comPreditor: false })
  const { deps, recebidas } = dublê(() => ({ bytes: jpegFalso(), largura: 200, altura: 200 }))
  const r = await comprimirPdf(original, OPCOES, deps)
  assert.deepEqual(recebidas, [])
  assert.ok(r.relatorio.some((i) => i.motivo === 'não é 8 bits por componente'))
})

test('se o JPEG ficaria maior, a imagem é mantida', async () => {
  const original = await pdfComImagem()
  const { deps } = dublê(() => ({ bytes: new Uint8Array(500000), largura: 200, altura: 200 }))
  const r = await comprimirPdf(original, OPCOES, deps)
  assert.equal(r.resumo.reencodadas, 0)
  assert.ok(r.relatorio.some((i) => i.acao === 'mantida'))
})

test('o texto do PDF sobrevive à compressão', async () => {
  const original = await pdfComImagem()
  const { deps } = dublê(() => ({ bytes: jpegFalso(), largura: 200, altura: 200 }))
  const r = await comprimirPdf(original, OPCOES, deps)

  const relido = await PDFDocument.load(r.pdf)
  assert.equal(relido.getPageCount(), 1)
  // O objeto de fonte continua no arquivo e a página segue legível.
  const conteudo = relido.getPage(0).node.toString()
  assert.ok(conteudo.length > 0)
  assert.ok(r.pdf.length > 1000, 'não pode virar um arquivo vazio')
})

test('falha ao decodificar uma imagem não derruba o PDF inteiro', async () => {
  const original = await pdfComImagem()
  const deps: Dependencias = {
    inflar: async () => {
      throw new Error('deu ruim')
    },
    reencodar: async () => ({ bytes: jpegFalso(), largura: 200, altura: 200 }),
  }
  const r = await comprimirPdf(original, OPCOES, deps)
  assert.equal(r.resumo.reencodadas, 0)
  assert.ok(r.relatorio.some((i) => i.motivo?.includes('não deu para decodificar')))
  assert.ok(r.pdf.length > 1000, 'o PDF precisa sair apesar da falha')
})

test('falha do reencodador também é tolerada', async () => {
  const original = await pdfComImagem()
  const deps: Dependencias = {
    inflar: async (d) => new Uint8Array(inflateSync(Buffer.from(d))),
    reencodar: async () => {
      throw new Error('sem canvas')
    },
  }
  const r = await comprimirPdf(original, OPCOES, deps)
  assert.equal(r.resumo.reencodadas, 0)
  assert.ok(r.relatorio.some((i) => i.motivo?.includes('falha ao recodificar')))
})

test('as novas dimensões vão para o dicionário da imagem', async () => {
  const original = await pdfComImagem({ largura: 200, altura: 200 })
  const deps: Dependencias = {
    inflar: async (d) => new Uint8Array(inflateSync(Buffer.from(d))),
    reencodar: async () => ({ bytes: jpegFalso(), largura: 100, altura: 50 }),
  }
  const r = await comprimirPdf(original, OPCOES, deps)

  const relido = await PDFDocument.load(r.pdf)
  let achou = false
  for (const [, obj] of relido.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue
    if (String(obj.dict.get(PDFName.of('Subtype'))) !== '/Image') continue
    if (String(obj.dict.get(PDFName.of('Filter'))) !== '/DCTDecode') continue
    assert.equal(Number(obj.dict.get(PDFName.of('Width'))?.toString()), 100)
    assert.equal(Number(obj.dict.get(PDFName.of('Height'))?.toString()), 50)
    achou = true
  }
  assert.ok(achou, 'devia existir uma imagem DCTDecode no PDF final')
})
