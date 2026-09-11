/**
 * Testes do desfazedor de preditores do PDF.
 *
 * Estes casos foram calculados à mão a partir da especificação (PDF 32000-1,
 * tabela 8: preditores) porque um erro aqui não dá erro — dá imagem torta ou cor
 * trocada, que é o pior tipo de defeito silencioso.
 *
 * Executa com: node --experimental-strip-types --test tests-js/
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  PreditorNaoSuportado,
  bytesPorLinha,
  desfazerPreditor,
} from '../lib/compress/predictor.ts'

const linha = (valores: number[]) => Uint8Array.from(valores)

test('bytesPorLinha', () => {
  assert.equal(bytesPorLinha({ predictor: 1, colors: 3, bitsPerComponent: 8, columns: 4 }), 12)
  assert.equal(bytesPorLinha({ predictor: 1, colors: 1, bitsPerComponent: 8, columns: 3 }), 3)
  // 1 bit por componente: 3 colunas cabem em 1 byte
  assert.equal(bytesPorLinha({ predictor: 1, colors: 1, bitsPerComponent: 1, columns: 3 }), 1)
})

test('predictor 1 (nenhum) devolve os dados como estão', () => {
  const dados = linha([1, 2, 3, 4])
  const saida = desfazerPreditor(dados, { predictor: 1, colors: 1, bitsPerComponent: 8, columns: 4 })
  assert.deepEqual([...saida], [1, 2, 3, 4])
})

test('PNG Sub soma o pixel à esquerda', () => {
  // [10, +5, +5] com 1 byte por pixel → [10, 15, 20]
  const dados = linha([1 /* tipo Sub */, 10, 5, 5])
  const saida = desfazerPreditor(dados, { predictor: 11, colors: 1, bitsPerComponent: 8, columns: 3 })
  assert.deepEqual([...saida], [10, 15, 20])
})

test('PNG Sub respeita o número de componentes (RGB se soma a 3 bytes atrás)', () => {
  // RGB: primeiro pixel cru, o segundo soma o MESMO componente do pixel anterior
  const dados = linha([
    1, // Sub
    10, 20, 30, // pixel 1
    1, 2, 3, // diferenças do pixel 2
  ])
  const saida = desfazerPreditor(dados, { predictor: 11, colors: 3, bitsPerComponent: 8, columns: 2 })
  assert.deepEqual([...saida], [10, 20, 30, 11, 22, 33])
})

test('PNG Up soma a linha de cima', () => {
  const dados = linha([
    0, 10, 20, 30, // linha 1: sem filtro
    2, 1, 2, 3, // linha 2: diferenças em relação à linha 1
  ])
  const saida = desfazerPreditor(dados, { predictor: 12, colors: 1, bitsPerComponent: 8, columns: 3 })
  assert.deepEqual([...saida], [10, 20, 30, 11, 22, 33])
})

test('PNG Average usa a média do vizinho e da linha de cima', () => {
  // linha 2: 2 + (0+10)/2 = 7 · 2 + (7+20)/2 = 15 · 2 + (15+30)/2 = 24
  const dados = linha([
    0, 10, 20, 30,
    3, 2, 2, 2,
  ])
  const saida = desfazerPreditor(dados, { predictor: 13, colors: 1, bitsPerComponent: 8, columns: 3 })
  assert.deepEqual([...saida], [10, 20, 30, 7, 15, 24])
})

test('PNG Paeth escolhe o vizinho mais próximo', () => {
  // linha 2 = [15,25,35]: os três testes do Paeth apontam para a linha de cima
  const dados = linha([
    0, 10, 20, 30,
    4, 5, 5, 5,
  ])
  const saida = desfazerPreditor(dados, { predictor: 14, colors: 1, bitsPerComponent: 8, columns: 3 })
  assert.deepEqual([...saida], [10, 20, 30, 15, 25, 35])
})

test('predictor 15 usa o tipo de filtro de cada linha', () => {
  // linha 1 sem filtro · linha 2 Sub (só olha a própria linha) · linha 3 Up
  const dados = linha([
    0, 10, 20, 30,
    1, 5, 5, 5, // Sub: [5, 10, 15]
    2, 1, 1, 1, // Up sobre a linha anterior: [6, 11, 16]
  ])
  const saida = desfazerPreditor(dados, { predictor: 15, colors: 1, bitsPerComponent: 8, columns: 3 })
  assert.deepEqual([...saida], [10, 20, 30, 5, 10, 15, 6, 11, 16])
})

test('TIFF (predictor 2) acumula dentro da linha e reinicia na seguinte', () => {
  const dados = linha([10, 5, 5, 7, 3, 3])
  const saida = desfazerPreditor(dados, { predictor: 2, colors: 1, bitsPerComponent: 8, columns: 3 })
  assert.deepEqual([...saida], [10, 15, 20, 7, 10, 13])
})

test('TIFF com RGB acumula por componente', () => {
  const dados = linha([10, 20, 30, 1, 2, 3])
  const saida = desfazerPreditor(dados, { predictor: 2, colors: 3, bitsPerComponent: 8, columns: 2 })
  assert.deepEqual([...saida], [10, 20, 30, 11, 22, 33])
})

test('tipo de filtro inválido cai em None em vez de quebrar', () => {
  const dados = linha([9 /* inválido */, 10, 20, 30])
  const saida = desfazerPreditor(dados, { predictor: 15, colors: 1, bitsPerComponent: 8, columns: 3 })
  assert.deepEqual([...saida], [10, 20, 30])
})

test('bits por componente diferente de 8 é recusado (melhor pular que errar)', () => {
  const dados = linha([0, 1, 2])
  assert.throws(
    () => desfazerPreditor(dados, { predictor: 12, colors: 1, bitsPerComponent: 4, columns: 3 }),
    PreditorNaoSuportado
  )
})

test('predictor desconhecido é recusado', () => {
  assert.throws(
    () => desfazerPreditor(linha([1, 2]), { predictor: 3, colors: 1, bitsPerComponent: 8, columns: 2 }),
    PreditorNaoSuportado
  )
})

test('linha incompleta no fim é ignorada sem estourar', () => {
  // 1 byte de filtro + 3 de linha, e depois sobra lixo de meio byte
  const dados = linha([0, 10, 20, 30, 0, 5])
  const saida = desfazerPreditor(dados, { predictor: 15, colors: 1, bitsPerComponent: 8, columns: 3 })
  assert.deepEqual([...saida], [10, 20, 30])
})
