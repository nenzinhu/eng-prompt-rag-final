/** Estimativa de acerto do modo "Duas IAs" (`lib/acerto.ts`). */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { estimarAcerto, extrairAlternativa } from '../lib/acerto'
import type { CompararResp } from '../lib/types'

function resp(conclusoes: string[], extra: Partial<CompararResp> = {}): CompararResp {
  return {
    pergunta: 'q',
    respostas: conclusoes.map((c, i) => ({
      provider: 'p', modelo: `m${i}`, rotulo: `m${i}`, resposta: c, resposta_direta: c, segundos: 1, erro: null,
    })),
    nivel_concordancia: 'alta', divergencia_numerica: false, similaridade_conclusoes: 0.8,
    numeros_comuns: [], numeros_exclusivos: [], nomes_comuns: [], nomes_exclusivos: [],
    sem_fatos: true, modelos_ok: conclusoes.length, modelos_total: conclusoes.length,
    pouco_embasado: false, confianca_media: 0.8, contexto: [], ...extra,
  }
}

test('extrai a alternativa sem confundir o artigo "A"', () => {
  assert.equal(extrairAlternativa('Letra C, pois...'), 'C')
  assert.equal(extrairAlternativa('B) Planejamento'), 'B')
  assert.equal(extrairAlternativa('alternativa (d)'), 'D')
  assert.equal(extrairAlternativa('A resposta é o planejamento'), null)
})

test('mesma alternativa dá probabilidade alta; diferentes, baixa', () => {
  assert.equal(estimarAcerto(resp(['Letra B', 'B) x']))?.faixa, 'alta')
  assert.equal(estimarAcerto(resp(['Letra B', 'Letra D']))?.faixa, 'baixa')
})

test('sem duas respostas válidas não estima', () => {
  const r = resp(['Letra B', ''])
  r.respostas[1].erro = 'falhou'
  assert.equal(estimarAcerto(r), null)
})
