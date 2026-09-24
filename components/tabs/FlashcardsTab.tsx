'use client'

import { useCallback, useEffect, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { api } from '@/lib/api'
import type { TermoGlossario } from '@/lib/types'

const POR_RODADA = 15

function embaralhar<T>(lista: T[]): T[] {
  const copia = [...lista]
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
  }
  return copia
}

/**
 * Flashcards com os termos já salvos no Glossário. "Não sabia" devolve o
 * cartão para o fim da fila; a rodada acaba quando todos foram lembrados.
 */
export default function FlashcardsTab({ ativo, onIr }: { ativo: boolean; onIr: (aba: string) => void }) {
  const [termos, setTermos] = useState<TermoGlossario[] | null>(null)
  const [fila, setFila] = useState<TermoGlossario[]>([])
  const [virado, setVirado] = useState(false)
  const [deCara, setDeCara] = useState(0)
  const [errados, setErrados] = useState<Set<string>>(new Set())
  const [erro, setErro] = useState('')

  const novaRodada = useCallback((lista: TermoGlossario[]) => {
    setFila(embaralhar(lista).slice(0, POR_RODADA))
    setVirado(false)
    setDeCara(0)
    setErrados(new Set())
  }, [])

  useEffect(() => {
    if (!ativo || termos) return
    api
      .glossarioTermosSalvos()
      .then((d) => {
        setTermos(d.termos)
        novaRodada(d.termos)
      })
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não consegui carregar os termos.'))
  }, [ativo, termos, novaRodada])

  const atual = fila[0]
  const total = Math.min(termos?.length ?? 0, POR_RODADA)

  function responder(sabia: boolean) {
    if (!atual) return
    if (sabia) {
      if (!errados.has(atual.termo)) setDeCara((n) => n + 1)
      setFila((f) => f.slice(1))
    } else {
      setErrados((s) => new Set(s).add(atual.termo))
      setFila((f) => [...f.slice(1), f[0]])
    }
    setVirado(false)
  }

  if (erro) {
    return (
      <p role="alert" className="flex items-start gap-1.5 text-[0.85rem] text-rose-300">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        {erro}
      </p>
    )
  }
  if (!termos) return <p className="text-[0.9rem] text-muted">Carregando os termos…</p>

  if (!termos.length) {
    return (
      <div className="glass flex flex-col items-start gap-3 rounded-2xl p-5">
        <p className="text-[0.95rem] text-text">Ainda não há termos no glossário.</p>
        <p className="text-[0.88rem] text-muted">Gere alguns na aba Glossário e eles viram flashcards aqui.</p>
        <button
          type="button"
          onClick={() => onIr('glossario')}
          className="min-h-11 rounded-lg bg-lime px-5 text-sm font-semibold text-[#08070c] transition-opacity hover:opacity-90"
        >
          Ir para o Glossário
        </button>
      </div>
    )
  }

  if (!atual) {
    return (
      <div role="status" className="glass flex flex-col items-start gap-3 rounded-2xl p-5">
        <p className="font-display text-[1.5rem] italic text-text">
          {deCara} de {total} de primeira
        </p>
        <p className="text-[0.9rem] text-muted">
          {errados.size ? `Você precisou rever ${errados.size} ${errados.size === 1 ? 'termo' : 'termos'}.` : 'Nenhum precisou de segunda chance.'}
        </p>
        <button
          type="button"
          onClick={() => novaRodada(termos)}
          className="min-h-11 rounded-lg bg-lime px-5 text-sm font-semibold text-[#08070c] transition-opacity hover:opacity-90"
        >
          Nova rodada
        </button>
      </div>
    )
  }

  const exemplos = atual.exemplos?.length ? atual.exemplos : atual.exemplo ? [atual.exemplo] : []

  return (
    <div className="flex flex-col gap-4">
      <p className="font-mono text-[0.7rem] uppercase tracking-wider text-muted">
        Termos do seu glossário — {fila.length} {fila.length === 1 ? 'cartão restante' : 'cartões restantes'}
      </p>
      <div className="glass flex min-h-[240px] flex-col justify-between gap-4 rounded-2xl p-6">
        <p className="font-display text-[1.7rem] italic leading-tight text-text">{atual.termo}</p>
        {virado ? (
          <div className="flex flex-col gap-2" aria-live="polite">
            <p className="text-[0.95rem] leading-relaxed text-text">{atual.explicacao}</p>
            {exemplos.map((ex, i) => (
              <p key={i} className="text-[0.85rem] leading-relaxed text-muted">
                Ex.: {ex}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-[0.88rem] text-muted">Pense no que significa, depois confira.</p>
        )}
      </div>
      {virado ? (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => responder(false)}
            className="min-h-12 rounded-lg border border-white/15 text-sm text-text transition-colors hover:bg-white/[0.05]"
          >
            Não sabia
          </button>
          <button
            type="button"
            onClick={() => responder(true)}
            className="min-h-12 rounded-lg bg-lime text-sm font-semibold text-[#08070c] transition-opacity hover:opacity-90"
          >
            Sabia
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setVirado(true)}
          className="min-h-12 rounded-lg bg-lime text-sm font-semibold text-[#08070c] transition-opacity hover:opacity-90"
        >
          Mostrar explicação
        </button>
      )}
    </div>
  )
}
