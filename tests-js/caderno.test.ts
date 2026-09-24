/**
 * Caderno de erros (`lib/caderno.ts`).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { anotarErro, revisar } from '../lib/caderno'

const q = {
  pergunta: 'O que é few-shot?',
  alternativas: ['Dar exemplos no prompt', 'Treinar o modelo', 'Usar um modelo menor'],
  correta: 0,
  explicacao: 'Os exemplos vão no prompt.',
  fonte: 'apostila.pdf',
  pagina: 3,
}

test('errar guarda a questão com a alternativa marcada', () => {
  const [item] = anotarErro([], q, 2, 10)
  assert.equal(item.marcada, 2)
  assert.equal(item.vezes, 1)
  assert.equal(item.errouEm, 10)
})

test('errar a mesma pergunta de novo não duplica e conta as vezes', () => {
  let c = anotarErro([], q, 1, 1)
  c = anotarErro(c, { ...q, pergunta: '  o que é   FEW-SHOT? ' }, 2, 2)
  assert.equal(c.length, 1)
  assert.equal(c[0].vezes, 2)
})

test('acertar na revisão tira do caderno; errar mantém', () => {
  const c = anotarErro([], q, 1, 1)
  assert.equal(revisar(c, c[0].id, 0, 2).length, 0)
  const ainda = revisar(c, c[0].id, 2, 3)
  assert.equal(ainda.length, 1)
  assert.equal(ainda[0].vezes, 2)
})

test('revisar um id que não existe não muda nada', () => {
  const c = anotarErro([], q, 1, 1)
  assert.equal(revisar(c, 'outro', 0, 2), c)
})
