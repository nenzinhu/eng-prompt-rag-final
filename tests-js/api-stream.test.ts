/**
 * Testes do leitor de streaming da aba Perguntar (`api.perguntarStream`).
 *
 * O risco real aqui é silencioso: a rede entrega o NDJSON em pedaços que cortam
 * uma linha ao meio, e um leitor ingênuo perde texto ou quebra no JSON.parse.
 */
import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import { api, ApiError } from '../lib/api'

const fetchOriginal = globalThis.fetch

afterEach(() => {
  globalThis.fetch = fetchOriginal
})

/** Simula o backend devolvendo o corpo em pedaços arbitrários. */
function responderEmPedacos(pedacos: string[], status = 200) {
  globalThis.fetch = async () =>
    new Response(
      new ReadableStream({
        start(c) {
          const enc = new TextEncoder()
          for (const p of pedacos) c.enqueue(enc.encode(p))
          c.close()
        },
      }),
      { status },
    )
}

const META = {
  tipo: 'meta',
  contexto: [{ conteudo: 'x', fonte: 'a.pdf', pagina: 1, relevancia: 0.9 }],
  pouco_embasado: false,
  confianca_media: 0.9,
  provider: 'groq',
  modelo: 'm',
}

test('junta linhas cortadas ao meio entre pedaços', async () => {
  const corpo =
    JSON.stringify(META) + '\n' +
    JSON.stringify({ tipo: 'texto', t: 'Olá, ' }) + '\n' +
    JSON.stringify({ tipo: 'texto', t: 'mundo ✓' }) + '\n' +
    JSON.stringify({ tipo: 'fim' }) + '\n'
  // Corta em pedaços de 7 caracteres: quebra o JSON no meio das linhas.
  const pedacos = corpo.match(/[\s\S]{1,7}/g) ?? []
  responderEmPedacos(pedacos)

  const parciais: string[] = []
  let metaRecebida = false
  const r = await api.perguntarStream('p', 'groq', 'm', 'padrao', () => (metaRecebida = true), (t) => parciais.push(t))

  assert.equal(r.resposta, 'Olá, mundo ✓')
  assert.equal(r.contexto[0].fonte, 'a.pdf')
  assert.ok(metaRecebida)
  assert.deepEqual(parciais, ['Olá, ', 'Olá, mundo ✓'])
})

test('evento de erro antes de qualquer texto vira ApiError', async () => {
  responderEmPedacos([
    JSON.stringify(META) + '\n',
    JSON.stringify({ tipo: 'erro', mensagem: 'provedor caiu' }) + '\n',
  ])
  await assert.rejects(
    api.perguntarStream('p', 'groq', 'm', 'padrao', () => {}, () => {}),
    (e: unknown) => e instanceof ApiError && e.message.startsWith('provedor caiu'),
  )
})

test('erro no meio do texto preserva o parcial e marca como interrompida', async () => {
  responderEmPedacos([
    JSON.stringify(META) + '\n',
    JSON.stringify({ tipo: 'texto', t: 'metade' }) + '\n',
    JSON.stringify({ tipo: 'erro', mensagem: 'provedor caiu' }) + '\n',
  ])
  const r = await api.perguntarStream('p', 'groq', 'm', 'padrao', () => {}, () => {})
  assert.equal(r.resposta, 'metade')
  assert.equal(r.interrompida, 'provedor caiu')
})

test('conexão encerrada sem "fim" não passa por resposta completa', async () => {
  responderEmPedacos([JSON.stringify(META) + '\n', JSON.stringify({ tipo: 'texto', t: 'metade' }) + '\n'])
  const r = await api.perguntarStream('p', 'groq', 'm', 'padrao', () => {}, () => {})
  assert.equal(r.resposta, 'metade')
  assert.match(r.interrompida ?? '', /conexão caiu/)
})

test('linha cortada no fim não vira SyntaxError', async () => {
  responderEmPedacos([
    JSON.stringify(META) + '\n',
    JSON.stringify({ tipo: 'texto', t: 'metade' }) + '\n',
    '{"tipo":"te',
  ])
  const r = await api.perguntarStream('p', 'groq', 'm', 'padrao', () => {}, () => {})
  assert.equal(r.resposta, 'metade')
  assert.match(r.interrompida ?? '', /conexão caiu/)
})

test('resposta completa não é marcada como interrompida', async () => {
  responderEmPedacos([
    JSON.stringify(META) + '\n',
    JSON.stringify({ tipo: 'texto', t: 'inteira' }) + '\n',
    JSON.stringify({ tipo: 'fim' }) + '\n',
  ])
  const r = await api.perguntarStream('p', 'groq', 'm', 'padrao', () => {}, () => {})
  assert.equal(r.interrompida, undefined)
})

test('bloco <think> não aparece na resposta, nem enquanto chega', async () => {
  responderEmPedacos([
    JSON.stringify(META) + '\n',
    JSON.stringify({ tipo: 'texto', t: '<think>pensando' }) + '\n',
    JSON.stringify({ tipo: 'texto', t: ' mais</think>\n\nResposta' }) + '\n',
    JSON.stringify({ tipo: 'fim' }) + '\n',
  ])
  const parciais: string[] = []
  const r = await api.perguntarStream('p', 'groq', 'm', 'padrao', () => {}, (t) => parciais.push(t))
  assert.equal(r.resposta, 'Resposta')
  assert.deepEqual(parciais, ['', 'Resposta'])
})

test('erro HTTP antes do stream usa o detail do backend', async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ detail: 'Pergunta vazia.' }), { status: 400 })
  await assert.rejects(
    api.perguntarStream('', 'groq', 'm', 'padrao', () => {}, () => {}),
    (e: unknown) => e instanceof ApiError && e.status === 400 && e.message === 'Pergunta vazia.',
  )
})
