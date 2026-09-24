/**
 * Progresso de estudo (`lib/progresso.ts`), a base da tela Hoje.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { PROGRESSO_VAZIO, aplicarEstudo, nomeDaApostila, resumoPorApostila } from '../lib/progresso'

const contexto = [
  { fonte: 'Empreendedorismo.pdf', pagina: 47, relevancia: 0.9 },
  { fonte: 'Empreendedorismo.pdf', pagina: 48, relevancia: 0.7 },
  { fonte: 'Praticas.pdf', pagina: 3, relevancia: 0.95 },
]

test('a fonte principal é o trecho mais relevante', () => {
  const p = aplicarEstudo(PROGRESSO_VAZIO, ' O que é proposta de valor? ', contexto, 1)
  assert.deepEqual(p.estudos[0], { pergunta: 'O que é proposta de valor?', fonte: 'Praticas.pdf', pagina: 3, em: 1 })
})

test('páginas citadas contam uma vez só, em ordem', () => {
  let p = aplicarEstudo(PROGRESSO_VAZIO, 'a', contexto, 1)
  p = aplicarEstudo(p, 'b', [{ fonte: 'Empreendedorismo.pdf', pagina: 12 }, { fonte: 'Empreendedorismo.pdf', pagina: 47 }], 2)
  assert.deepEqual(p.paginas['Empreendedorismo.pdf'], [12, 47, 48])
})

test('pergunta vazia não muda nada e o original fica intacto', () => {
  assert.equal(aplicarEstudo(PROGRESSO_VAZIO, '   ', contexto, 1), PROGRESSO_VAZIO)
  aplicarEstudo(PROGRESSO_VAZIO, 'a', contexto, 1)
  assert.deepEqual(PROGRESSO_VAZIO, { estudos: [], paginas: {} })
})

test('resumo lista primeiro a apostila usada por último', () => {
  let p = aplicarEstudo(PROGRESSO_VAZIO, 'a', [{ fonte: 'A.pdf', pagina: 1, relevancia: 1 }], 1)
  p = aplicarEstudo(p, 'b', [{ fonte: 'B.pdf', pagina: 2, relevancia: 1 }, { fonte: 'B.pdf', pagina: 3 }], 2)
  assert.deepEqual(
    resumoPorApostila(p).map((r) => [r.fonte, r.paginas]),
    [['B.pdf', 2], ['A.pdf', 1]],
  )
})

test('nome legível tira extensão e sublinhados', () => {
  assert.equal(nomeDaApostila('Logica_Programacao_Python.pdf'), 'Logica Programacao Python')
})
