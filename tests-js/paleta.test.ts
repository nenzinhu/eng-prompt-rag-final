/** Busca da paleta de comandos (`lib/paleta.ts`). */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { filtrar, pontuar } from '../lib/paleta'

const ITENS = [
  { id: 'hoje', titulo: 'O que estudar agora', extra: 'Hoje' },
  { id: 'erros', titulo: 'Caderno de erros', extra: 'Praticar Erros' },
  { id: 'glossario', titulo: 'Glossário', extra: 'Material' },
  { id: 'buscar', titulo: 'Buscar no material', extra: 'Material Buscar' },
]

test('consulta vazia devolve tudo na ordem original', () => {
  assert.deepEqual(filtrar('', ITENS).map((i) => i.id), ['hoje', 'erros', 'glossario', 'buscar'])
})

test('ignora acentos e maiúsculas', () => {
  assert.equal(filtrar('GLOSSARIO', ITENS)[0].id, 'glossario')
})

test('aceita letras em sequência com saltos', () => {
  assert.equal(filtrar('cdn', ITENS)[0].id, 'erros')
})

test('começo do título vale mais que o meio', () => {
  assert.ok((pontuar('bus', 'Buscar no material') ?? 0) > (pontuar('mat', 'Buscar no material') ?? 0))
})

test('casa pelo texto extra (grupo, apelido)', () => {
  assert.equal(filtrar('hoje', ITENS)[0].id, 'hoje')
})

test('o título pesa mais que o extra', () => {
  // "material" é o grupo do Glossário, mas está no título de Buscar.
  assert.equal(filtrar('material', ITENS)[0].id, 'buscar')
})

test('sem casamento, some', () => {
  assert.deepEqual(filtrar('xyz', ITENS), [])
})
