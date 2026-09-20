/**
 * Histerese da barra de abas (`lib/barraCompacta.ts`).
 *
 * A barra encolhe quando o aluno rola para ler a resposta. Com um limite só,
 * parar em cima dele faria a barra piscar a cada micro-movimento; por isso os
 * limites de ida e de volta são diferentes.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { ROLAGEM_COMPACTA, ROLAGEM_EXPANDIDA, deveCompactar } from '../lib/barraCompacta'

test('no topo da página a barra fica inteira', () => {
  assert.equal(deveCompactar(0, false), false)
})

test('passando do limite de ida, compacta', () => {
  assert.equal(deveCompactar(ROLAGEM_COMPACTA + 1, false), true)
})

test('exatamente no limite ainda não compacta', () => {
  assert.equal(deveCompactar(ROLAGEM_COMPACTA, false), false)
})

test('já compacta, continua compacta na faixa morta', () => {
  // Entre os dois limites, o estado atual manda — é isso que evita o piscar.
  for (const y of [ROLAGEM_EXPANDIDA + 1, 90, ROLAGEM_COMPACTA]) {
    assert.equal(deveCompactar(y, true), true, `rolagem ${y} devia continuar compacta`)
  }
})

test('expandida, a faixa morta não compacta', () => {
  for (const y of [ROLAGEM_EXPANDIDA + 1, 90, ROLAGEM_COMPACTA]) {
    assert.equal(deveCompactar(y, false), false, `rolagem ${y} não devia compactar ainda`)
  }
})

test('voltando ao topo, expande de novo', () => {
  assert.equal(deveCompactar(ROLAGEM_EXPANDIDA, true), false)
  assert.equal(deveCompactar(0, true), false)
})

test('os dois limites são mesmo diferentes', () => {
  assert.ok(ROLAGEM_EXPANDIDA < ROLAGEM_COMPACTA, 'sem faixa morta a barra pisca')
})
