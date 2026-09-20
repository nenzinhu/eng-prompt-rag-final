/**
 * Divisão de questões no modo lote (`lib/texto.ts` → `dividirQuestoes`).
 *
 * Bug B-04 (análise de 19/09/2026): a tela dizia "separadas por linha em
 * branco", mas o divisor exigia duas — e o anexo de imagens juntava os prints
 * com uma só. Dois prints viravam uma questão, e como o backend usa a ÚLTIMA
 * lista de alternativas, a primeira era descartada em silêncio.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { SEPARADOR_QUESTAO, dividirQuestoes, formatarAlternativas } from '../lib/texto'

const Q1 = 'Sobre inovação, assinale a correta.\n\nA) uma\n\nB) duas'
const Q2 = 'Sobre RAG, assinale a correta.\n\nA) três\n\nB) quatro'

test('duas questões separadas pelo separador viram dois blocos', () => {
  const questoes = dividirQuestoes(`${Q1}${SEPARADOR_QUESTAO}${Q2}`)
  assert.equal(questoes.length, 2)
  assert.ok(questoes[0].startsWith('Sobre inovação'))
  assert.ok(questoes[1].startsWith('Sobre RAG'))
})

test('as alternativas não são confundidas com novas questões', () => {
  // `formatarAlternativas` separa as alternativas por UMA linha em branco.
  const uma = formatarAlternativas('Enunciado A) uma B) duas C) três')
  assert.equal(dividirQuestoes(uma).length, 1)
})

test('o separador do anexo é o mesmo que o divisor reconhece', () => {
  // É o contrato entre AnexoImagem (modo lote) e dividirQuestoes: se um mudar
  // sem o outro, dois prints voltam a virar uma questão só.
  const doisPrints = ['print um', 'print dois'].join(SEPARADOR_QUESTAO)
  assert.deepEqual(dividirQuestoes(doisPrints), ['print um', 'print dois'])
})

test('sem separador, cai no padrão QUESTÃO N', () => {
  const texto = 'QUESTÃO 1\nEnunciado um\nQUESTÃO 2\nEnunciado dois'
  assert.equal(dividirQuestoes(texto).length, 2)
})

test('uma questão só continua sendo uma', () => {
  assert.deepEqual(dividirQuestoes(Q1), [Q1])
  assert.deepEqual(dividirQuestoes('   '), [])
})

test('espaços na linha em branco não atrapalham', () => {
  const questoes = dividirQuestoes(`${Q1}\n  \n \t\n${Q2}`)
  assert.equal(questoes.length, 2)
})

// ── Bug B-22: um "A)" solto no enunciado cortava a questão ────────────────

test('menção isolada a uma letra não vira alternativa', () => {
  const texto = 'Sobre a fase A) do projeto, o que se pode afirmar?'
  assert.equal(formatarAlternativas(texto), texto)
})

test('sequência de alternativas continua sendo separada', () => {
  const saida = formatarAlternativas('Enunciado A) uma B) duas C) três')
  assert.equal(saida, 'Enunciado\n\nA) uma\n\nB) duas\n\nC) três')
})

test('enunciado com letra solta antes das alternativas de verdade', () => {
  const saida = formatarAlternativas('Sobre a fase A) do projeto, qual? A) um B) dois')
  // O "A)" do enunciado fica onde está; a quebra começa na lista real.
  assert.ok(saida.startsWith('Sobre a fase A) do projeto, qual?'))
  assert.ok(saida.includes('\n\nA) um'))
  assert.ok(saida.includes('\n\nB) dois'))
})

test('alternativas já em linhas separadas são normalizadas', () => {
  const saida = formatarAlternativas('Enunciado\nA) uma\nB) duas')
  assert.equal(saida, 'Enunciado\n\nA) uma\n\nB) duas')
})

test('alternativas em minúscula preservam a letra', () => {
  assert.equal(formatarAlternativas('Enunciado a) uma b) duas'), 'Enunciado\n\na) uma\n\nb) duas')
})

test('texto que começa direto na alternativa não ganha linha em branco à frente', () => {
  assert.equal(formatarAlternativas('A) uma B) duas'), 'A) uma\n\nB) duas')
})
