/**
 * Testes das contas de dimensão do compactador.
 *
 * `dimensoesAlvo` parece trivial, mas já causou um estrago: um `<select>` sem
 * valor virou `0` no estado, e com limite 0 todas as imagens do PDF foram
 * reduzidas a 1×1 pixel — um arquivo destruído sem nenhum erro na tela. O teste
 * do limite inválido existe por causa disso.
 *
 * Executa com: npm run test:js
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { dimensoesAlvo } from '../lib/compress/canvas.ts'

test('imagem menor que o limite fica como está', () => {
  assert.deepEqual(dimensoesAlvo(600, 400, 1200), { largura: 600, altura: 400 })
})

test('imagem maior é reduzida mantendo a proporção', () => {
  // 2400x1200 com limite 1200 → metade em cada lado
  assert.deepEqual(dimensoesAlvo(2400, 1200, 1200), { largura: 1200, altura: 600 })
  // retrato: o maior lado manda
  assert.deepEqual(dimensoesAlvo(1200, 2400, 1200), { largura: 600, altura: 1200 })
})

test('o lado maior é o que obedece ao limite', () => {
  const r = dimensoesAlvo(1000, 3000, 800)
  assert.equal(Math.max(r.largura, r.altura), 800)
  assert.equal(r.altura, 800)
})

test('limite inválido NÃO reduz a imagem (o caso que destruía o PDF)', () => {
  for (const invalido of [0, -100, NaN, Infinity, Number(''), undefined as unknown as number]) {
    assert.deepEqual(
      dimensoesAlvo(2000, 1000, invalido as number),
      { largura: 2000, altura: 1000 },
      `limite ${String(invalido)} devia ser tratado como "sem limite"`
    )
  }
})

test('arredondamento não deixa dimensão zero', () => {
  const r = dimensoesAlvo(4000, 3, 1)
  assert.ok(r.largura >= 1 && r.altura >= 1, 'nenhuma dimensão pode ser 0')
})
