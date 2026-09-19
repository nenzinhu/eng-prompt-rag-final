'use client'

import { useState } from 'react'
import { MessageSquareQuote, PartyPopper } from 'lucide-react'
import type { ProvidersResp } from '@/lib/types'
import FaleOQuePensaTab from './FaleOQuePensaTab'
import ElencoTab from './ElencoTab'

const MODOS = [
  { id: 'fale', label: 'Fale o que pensa', icon: MessageSquareQuote },
  { id: 'assunto', label: 'Puxar assunto', icon: PartyPopper },
] as const

type Modo = (typeof MODOS)[number]['id']

/**
 * Aba principal "Elenco": reúne os dois elencos de personalidades.
 * "Fale o que pensa" melhora uma mensagem que o usuário já escreveu;
 * "Puxar assunto" é o Elenco original, que cria a mensagem do zero.
 * As duas ficam montadas para não perder o que foi digitado ao trocar de modo.
 */
export default function ElencoMainTab({ providers }: { providers: ProvidersResp }) {
  const [modo, setModo] = useState<Modo>('fale')

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Modos do Elenco">
        {MODOS.map((m) => (
          <button
            key={m.id}
            role="tab"
            aria-selected={modo === m.id}
            onClick={() => setModo(m.id)}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              modo === m.id
                ? 'bg-gradient-to-r from-violet to-cyan text-[#08070c]'
                : 'border border-white/10 bg-white/[0.03] text-text hover:bg-white/[0.06]'
            }`}
          >
            <m.icon className="h-4 w-4" aria-hidden="true" />
            {m.label}
          </button>
        ))}
      </div>

      <div hidden={modo !== 'fale'}>
        <FaleOQuePensaTab providers={providers} />
      </div>
      <div hidden={modo !== 'assunto'}>
        <ElencoTab providers={providers} />
      </div>
    </div>
  )
}
