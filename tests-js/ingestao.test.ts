/**
 * Laço de indexação da aba PDFs (`lib/ingestao.ts`).
 *
 * O risco aqui é o sucesso falso (análise de 17/09/2026, A1-06 e A1-07): um
 * bloqueio ou uma falha terminava em "✓ Concluído" e o administrador achava que
 * o material tinha entrado no índice.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { ApiError } from '../lib/api'
import { ESPERAS_MS, ingerirArquivo, resumirIngestao, type OpcoesIngestao } from '../lib/ingestao'
import type { IngerirResp } from '../lib/types'

type Passo = IngerirResp | Error

/** Backend falso: responde os passos em ordem e grava os pedidos recebidos. */
function simular(passos: Passo[]) {
  const pedidos: { offset: number; forcar: boolean; corte?: number; ultimo?: number }[] = []
  const esperas: number[] = []
  const logs: string[] = []
  const opcoes: OpcoesIngestao = {
    ingerir: async (_a, offset, forcar, corte, ultimo) => {
      pedidos.push({ offset, forcar, corte, ultimo })
      const p = passos.shift()
      if (!p) throw new Error('passos acabaram')
      if (p instanceof Error) throw p
      return p
    },
    log: (_t, msg) => logs.push(msg),
    esperar: async (ms) => {
      esperas.push(ms)
    },
  }
  return { opcoes, pedidos, esperas, logs }
}

const lote = (proximo: number, total: number, extra: Partial<IngerirResp> = {}): IngerirResp => ({
  ok: true,
  total,
  proximo_offset: proximo,
  done: proximo >= total,
  ...extra,
})

test('indexa em lotes e devolve corte e último id nos pedidos seguintes', async () => {
  const s = simular([lote(24, 30, { corte_id: 500, ultimo_id: 524 }), lote(30, 30)])
  const r = await ingerirArquivo('a.pdf', false, s.opcoes)
  assert.deepEqual(r, { situacao: 'ok', arquivo: 'a.pdf', chunks: 30 })
  assert.deepEqual(s.pedidos[1], { offset: 24, forcar: false, corte: 500, ultimo: 524 })
})

test('409 vira bloqueio com a análise, nunca "✓ 0 chunks"', async () => {
  const detalhe = { mensagem: 'bloqueada', ok: false, arquivo: 'a.pdf', chunks_novos: 3, avisos: ['perda de 90%'] }
  const s = simular([new ApiError('bloqueada', 409, detalhe)])
  const r = await ingerirArquivo('a.pdf', false, s.opcoes)
  assert.equal(r.situacao, 'bloqueado')
  assert.equal(r.situacao === 'bloqueado' && r.analise?.chunks_novos, 3)
  assert.ok(!s.logs.some((l) => l.startsWith('✓')))
})

test('erro passageiro espera 1, 2, 4… segundos e repete o mesmo lote', async () => {
  const s = simular([
    lote(24, 30, { corte_id: 500, ultimo_id: 524 }),
    new ApiError('Supabase fora', 503, null),
    new TypeError('Failed to fetch'),
    lote(30, 30),
  ])
  const r = await ingerirArquivo('a.pdf', false, s.opcoes)
  assert.equal(r.situacao, 'ok')
  assert.deepEqual(s.esperas, [1000, 2000])
  assert.deepEqual(
    s.pedidos.slice(1).map((p) => [p.offset, p.ultimo]),
    [[24, 524], [24, 524], [24, 524]],
  )
})

test('erro definitivo (422) não é repetido', async () => {
  const s = simular([new ApiError('PDF ilegível', 422, null)])
  const r = await ingerirArquivo('a.pdf', false, s.opcoes)
  assert.equal(r.situacao, 'falhou')
  assert.equal(s.pedidos.length, 1)
  assert.deepEqual(s.esperas, [])
})

test('desiste depois de esgotar as esperas', async () => {
  const falhas = Array.from({ length: ESPERAS_MS.length + 1 }, () => new ApiError('fora', 503, null))
  const s = simular(falhas)
  const r = await ingerirArquivo('a.pdf', false, s.opcoes)
  assert.equal(r.situacao, 'falhou')
  assert.deepEqual(s.esperas, ESPERAS_MS)
})

test('forcar vale só para o primeiro lote', async () => {
  const s = simular([lote(24, 30, { corte_id: 1 }), lote(30, 30)])
  await ingerirArquivo('a.pdf', true, s.opcoes)
  assert.deepEqual(
    s.pedidos.map((p) => p.forcar),
    [true, false],
  )
})

test('extração vazia é pendência, não sucesso', async () => {
  const s = simular([{ ok: true, total: 0, done: true, avisos: ['Nenhum texto extraído'] }])
  const r = await ingerirArquivo('a.pdf', true, s.opcoes)
  assert.equal(r.situacao, 'vazio')
})

test('"Concluído" só quando todos os arquivos entraram', () => {
  const tudoOk = resumirIngestao([
    { situacao: 'ok', arquivo: 'a.pdf', chunks: 10 },
    { situacao: 'ok', arquivo: 'b.pdf', chunks: 5 },
  ])
  assert.deepEqual(tudoOk, { concluido: true, totalChunks: 15, pendencias: [] })

  const comFalha = resumirIngestao([
    { situacao: 'ok', arquivo: 'a.pdf', chunks: 10 },
    { situacao: 'bloqueado', arquivo: 'b.pdf', analise: null },
    { situacao: 'falhou', arquivo: 'c.pdf', mensagem: 'fora' },
  ])
  assert.equal(comFalha.concluido, false)
  assert.equal(comFalha.pendencias.length, 2)
})
