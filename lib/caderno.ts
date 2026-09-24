/**
 * Caderno de erros: as questões que você errou no "Me testa", para revisar.
 *
 * Acertar na revisão tira a questão do caderno; errar de novo a mantém e
 * atualiza a data. Fica no navegador, como o progresso (lib/progresso.ts);
 * as funções puras não tocam no localStorage, para os testes.
 */
import type { Questao } from './types'

export interface ItemCaderno extends Questao {
  id: string
  /** Índice da alternativa marcada no último erro. */
  marcada: number
  errouEm: number
  vezes: number
}

const CHAVE = 'epi:caderno:v1'
const MAX_ITENS = 100

function idDa(questao: Questao): string {
  return questao.pergunta.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 160)
}

/** Guarda um erro. A mesma pergunta errada de novo sobe para o topo e soma uma vez. */
export function anotarErro(lista: ItemCaderno[], questao: Questao, marcada: number, agora: number): ItemCaderno[] {
  const id = idDa(questao)
  const anterior = lista.find((i) => i.id === id)
  const item: ItemCaderno = { ...questao, id, marcada, errouEm: agora, vezes: (anterior?.vezes ?? 0) + 1 }
  return [item, ...lista.filter((i) => i.id !== id)].slice(0, MAX_ITENS)
}

/** Resultado de uma revisão: acertou sai do caderno; errou fica, com a data nova. */
export function revisar(lista: ItemCaderno[], id: string, marcada: number, agora: number): ItemCaderno[] {
  const item = lista.find((i) => i.id === id)
  if (!item) return lista
  if (marcada === item.correta) return lista.filter((i) => i.id !== id)
  return anotarErro(lista, item, marcada, agora)
}

function valido(dado: unknown): dado is ItemCaderno[] {
  return (
    Array.isArray(dado) &&
    dado.every((i) => i && typeof i.id === 'string' && Array.isArray(i.alternativas) && typeof i.correta === 'number')
  )
}

export function lerCaderno(): ItemCaderno[] {
  try {
    const bruto = localStorage.getItem(CHAVE)
    const dado: unknown = bruto ? JSON.parse(bruto) : []
    return valido(dado) ? dado : []
  } catch {
    // localStorage indisponível ou dado corrompido: caderno vazio.
    return []
  }
}

export function salvarCaderno(lista: ItemCaderno[]): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(lista))
  } catch {
    // Sem localStorage (modo privado): o caderno vale só nesta visita.
  }
}
