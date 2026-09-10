'use client'

import { useEffect, useState } from 'react'
import type { ProvidersResp } from './types'

export interface ProviderModel {
  provider: string
  modelo: string
  /** Troca o provedor e já seleciona o primeiro modelo dele. */
  trocarProvider: (p: string) => void
  setModelo: (m: string) => void
  /** true quando há provedor e modelo escolhidos — use para habilitar os botões. */
  pronto: boolean
  /** true quando nenhum provedor tem chave no servidor: nada vai funcionar ainda. */
  nenhumConfigurado: boolean
}

/** Primeiro provedor que tem chave configurada; cai no primeiro da lista se nenhum tiver. */
function provedorPadrao(providers: ProvidersResp, chaves: string[]): string {
  return chaves.find((k) => providers[k]?.configurado) ?? chaves[0] ?? ''
}

/**
 * Mantém provedor e modelo sincronizados com a lista que chega da API.
 *
 * O padrão anterior (`useState(Object.keys(providers)[0] ?? '')`) rodava no
 * primeiro render, quando `providers` ainda era `{}` — o estado ficava preso em
 * `''` e o backend respondia "Provedor desconhecido: ". Aqui o estado é
 * corrigido assim que a lista chega.
 */
export function useProviderModel(
  providers: ProvidersResp,
  inicial?: { provider?: string; modelo?: string },
): ProviderModel {
  const chaves = Object.keys(providers)
  const [provider, setProvider] = useState('')
  const [modelo, setModelo] = useState('')

  // 1. Escolhe o provedor quando (e sempre que) a lista mudar.
  useEffect(() => {
    if (!chaves.length) return
    setProvider((atual) => {
      if (atual && chaves.includes(atual)) return atual
      if (inicial?.provider && chaves.includes(inicial.provider)) return inicial.provider
      return provedorPadrao(providers, chaves)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaves.join(','), providers])

  // 2. Escolhe o modelo válido para o provedor atual.
  useEffect(() => {
    if (!provider) {
      setModelo('')
      return
    }
    const modelos = providers[provider]?.models ?? []
    setModelo((atual) => {
      if (atual && modelos.includes(atual)) return atual
      return modelos[0] ?? ''
    })
  }, [provider, providers])

  function trocarProvider(p: string) {
    setProvider(p)
    setModelo(providers[p]?.models?.[0] ?? '')
  }

  return {
    provider,
    modelo,
    trocarProvider,
    setModelo,
    // Sem chave no servidor, a chamada falharia com 500: o botão fica desabilitado
    // e a interface avisa por quê.
    pronto: Boolean(provider && modelo && providers[provider]?.configurado),
    nenhumConfigurado: chaves.length > 0 && !chaves.some((k) => providers[k]?.configurado),
  }
}
