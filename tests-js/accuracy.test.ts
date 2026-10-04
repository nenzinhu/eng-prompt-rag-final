import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lerAcuracia, registrarResultado } from '../lib/accuracy'

test('acurácia de cada modelo fica separada da outra IA e do resolver', () => {
  const dados = new Map<string, string>()
  const anterior = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    localStorage: {
      getItem: (k: string) => dados.get(k) ?? null,
      setItem: (k: string, v: string) => dados.set(k, v),
    },
  } })
  try {
    registrarResultado(true, 'modelo-a')
    registrarResultado(false, 'modelo-b')
    registrarResultado(false, 'modelo-a')
    assert.deepEqual(lerAcuracia('modelo-a'), { acertos: 1, total: 2 })
    assert.deepEqual(lerAcuracia('modelo-b'), { acertos: 0, total: 1 })
    assert.deepEqual(lerAcuracia(), { acertos: 0, total: 0 })
  } finally {
    if (anterior) Object.defineProperty(globalThis, 'window', anterior)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})
