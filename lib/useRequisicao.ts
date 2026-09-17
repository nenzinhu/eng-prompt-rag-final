'use client'

import { useCallback, useState } from 'react'

/**
 * Estado padrão de uma chamada à API: resultado, carregando e erro.
 *
 * As abas repetiam o mesmo bloco (setLoading(true) → setErro('') → try/catch →
 * setLoading(false)) com pequenas variações. `executar` concentra isso:
 * limpa o erro, marca carregando, guarda o resultado e devolve o valor (ou
 * `undefined` se falhou, com a mensagem já em `erro`).
 */
export function useRequisicao<T>(inicial: T) {
  const [dados, setDados] = useState<T>(inicial)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')

  const executar = useCallback(
    async (fn: () => Promise<T>, mensagemPadrao = 'Erro na requisição'): Promise<T | undefined> => {
      setCarregando(true)
      setErro('')
      try {
        const valor = await fn()
        setDados(valor)
        return valor
      } catch (e) {
        setErro(e instanceof Error ? e.message : mensagemPadrao)
        return undefined
      } finally {
        setCarregando(false)
      }
    },
    [],
  )

  const limpar = useCallback(() => {
    setDados(inicial)
    setErro('')
    // `inicial` é um valor simples ('' ou null) nas abas: não precisa ser dependência.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { dados, setDados, carregando, erro, setErro, executar, limpar }
}
