'use client'

import { useEffect, useState } from 'react'

export interface ItemHistorico {
  id: string
  resposta: string
  resumo: string
  criadoEm: number
}

const LIMITE = 10

function chave(namespace: string) {
  return `epi:historico:${namespace}`
}

/** Histórico local (por aba/persona) das últimas respostas geradas — sobrevive a trocas de aba e recarregamentos. */
export function useHistorico(namespace: string) {
  const [itens, setItens] = useState<ItemHistorico[]>([])

  useEffect(() => {
    try {
      const bruto = localStorage.getItem(chave(namespace))
      setItens(bruto ? JSON.parse(bruto) : [])
    } catch {
      setItens([])
    }
  }, [namespace])

  function adicionar(resposta: string, resumo: string) {
    setItens((atual) => {
      const novo: ItemHistorico = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        resposta,
        resumo: resumo.trim().slice(0, 140),
        criadoEm: Date.now(),
      }
      const lista = [novo, ...atual].slice(0, LIMITE)
      try {
        localStorage.setItem(chave(namespace), JSON.stringify(lista))
      } catch {
        // localStorage indisponível (modo privado etc.) — histórico só dura a sessão.
      }
      return lista
    })
  }

  function limpar() {
    setItens([])
    try {
      localStorage.removeItem(chave(namespace))
    } catch {
      // ignore
    }
  }

  return { itens, adicionar, limpar }
}
