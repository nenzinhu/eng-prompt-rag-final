/**
 * Nome do arquivo no Storage (`lib/texto.ts` → `nomeParaStorage`).
 *
 * Os casos são os mesmos de `test_nome_para_storage` em
 * tests/test_ingestao_guard.py: a tela mostra o nome final antes do envio, e
 * ele precisa ser exatamente o que o servidor vai gravar.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { nomeParaStorage } from '../lib/texto'

const CASOS: [string, string][] = [
  ['Infográfico_RAG_final.pdf', 'Infografico_RAG_final.pdf'],
  ['Introdução à Programação.pdf', 'Introducao a Programacao.pdf'],
  ['Playbook do Curso - v1.3.pdf', 'Playbook do Curso - v1.3.pdf'],
  ['relatório #2 (final)!.docx', 'relatorio _2 (final)_.docx'],
  ['ção.pdf', 'cao.pdf'],
  ['🚀.pdf', 'documento.pdf'],
]

for (const [enviado, salvo] of CASOS) {
  test(`"${enviado}" é salvo como "${salvo}"`, () => {
    assert.equal(nomeParaStorage(enviado), salvo)
  })
}
