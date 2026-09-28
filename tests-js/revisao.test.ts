/** Agenda de repetição espaçada (`lib/revisao.ts`). */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { paraHoje, proximaRevisao, registrar, type Agenda } from '../lib/revisao'

const DIA = 24 * 60 * 60 * 1000
const T0 = Date.UTC(2026, 8, 1)

test('acertos seguidos seguem 1, 3, 7, 14 e param em 14 dias', () => {
  let a: Agenda = {}
  const esperado = [1, 3, 7, 14, 14]
  let agora = T0
  for (const dias of esperado) {
    a = registrar(a, 'Token', true, agora)
    assert.equal(a.token.proxima - agora, dias * DIA)
    agora = a.token.proxima
  }
})

test('errar volta o cartão para amanhã', () => {
  let a = registrar({}, 'Token', true, T0)
  a = registrar(a, 'Token', true, T0)
  a = registrar(a, 'Token', false, T0)
  assert.deepEqual(a.token, { nivel: 0, proxima: T0 + DIA })
})

test('para hoje: vencidos primeiro (mais atrasado antes), depois os novos; futuros ficam de fora', () => {
  const termos = [{ termo: 'novo' }, { termo: 'futuro' }, { termo: 'atrasado' }, { termo: 'venceu hoje' }]
  const agenda: Agenda = {
    futuro: { nivel: 1, proxima: T0 + DIA },
    atrasado: { nivel: 1, proxima: T0 - 5 * DIA },
    'venceu hoje': { nivel: 1, proxima: T0 },
  }
  assert.deepEqual(paraHoje(termos, agenda, T0).map((t) => t.termo), ['atrasado', 'venceu hoje', 'novo'])
})

test('o termo é identificado sem diferença de maiúsculas e espaços', () => {
  const a = registrar({}, '  Few  Shot ', true, T0)
  assert.deepEqual(paraHoje([{ termo: 'few shot' }], a, T0), [])
})

test('próxima revisão é a data mais cedo', () => {
  assert.equal(proximaRevisao({}), null)
  assert.equal(proximaRevisao({ a: { nivel: 1, proxima: 5 }, b: { nivel: 1, proxima: 3 } }), 3)
})
