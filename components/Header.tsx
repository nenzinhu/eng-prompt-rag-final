'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { api } from '@/lib/api'
import InstalarApp from './InstalarApp'
import Conta from './Conta'

/**
 * Cabeçalho: logo, menu de grupos (Estudar, Produzir…) e, à direita, instalar,
 * conta e status do material. No celular o menu de grupos desce para uma linha
 * própria, com rolagem horizontal.
 */
export default function Header({
  refreshSignal = 0,
  grupos,
  grupoAtivo,
  onGrupo,
}: {
  refreshSignal?: number
  grupos: string[]
  grupoAtivo: string
  onGrupo: (grupo: string) => void
}) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'offline'>('loading')
  const [total, setTotal] = useState(0)
  const [inseguro, setInseguro] = useState(false)
  const montado = useRef(true)

  const tick = useCallback(async () => {
    try {
      const d = await api.status()
      if (!montado.current) return
      setStatus(d.status)
      setTotal(d.total)
      setInseguro(d.escrita_via === 'anon')
    } catch {
      if (montado.current) setStatus('offline')
    }
  }, [])

  useEffect(() => {
    montado.current = true
    tick()
    const id = setInterval(tick, 30000)
    return () => {
      montado.current = false
      clearInterval(id)
    }
  }, [tick])

  // Reconsulta o status quando o pai sinaliza uma mudança (ex.: upload de PDF).
  const primeiroSinal = useRef(true)
  useEffect(() => {
    if (primeiroSinal.current) {
      primeiroSinal.current = false
      return
    }
    tick()
  }, [refreshSignal, tick])

  const ponto: Record<typeof status, string> = {
    ready: 'bg-ok',
    empty: 'bg-atencao',
    loading: 'bg-texto-suave animate-pulse',
    offline: 'bg-erro',
  }
  const label =
    status === 'ready' ? 'online' : status === 'empty' ? 'sem material' : status === 'offline' ? 'offline' : 'conectando…'
  const dica = status === 'ready' ? `${total.toLocaleString('pt-BR')} trechos do material indexados` : undefined

  const menu = (
    <nav aria-label="Grupos de ferramentas" className="no-scrollbar flex items-center gap-5 overflow-x-auto">
      {grupos.map((g) => (
        <button
          key={g}
          onClick={() => onGrupo(g)}
          aria-current={g === grupoAtivo ? 'page' : undefined}
          className={`shrink-0 border-b-2 py-1 text-[0.95rem] transition-colors ${
            g === grupoAtivo
              ? 'border-destaque font-semibold text-texto'
              : 'border-transparent text-texto-suave hover:text-texto'
          }`}
        >
          {g}
        </button>
      ))}
    </nav>
  )

  return (
    <header className="sticky top-0 z-50 border-b border-borda bg-topo">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between gap-4 px-4">
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-b from-destaque to-destaque-fim">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M4 6.5 9 12l-5 5.5" stroke="#0a0a0a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M12 17.5h8" stroke="#0a0a0a" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </span>
          <span className="text-[1.1rem] font-bold leading-none text-texto">Engenharia de Prompt</span>
        </div>

        <div className="hidden min-w-0 md:block">{menu}</div>

        <div className="flex shrink-0 items-center gap-2">
          <InstalarApp />
          <Conta />
          {inseguro && (
            <div
              className="hidden items-center gap-1.5 rounded-full border border-atencao/40 px-3 py-1 text-[0.75rem] font-medium text-atencao sm:flex"
              title="O backend ainda escreve no banco com a chave pública. Defina SUPABASE_SERVICE_ROLE_KEY e ligue o RLS."
            >
              <TriangleAlert className="h-3 w-3" aria-hidden="true" />
              escrita insegura
            </div>
          )}
          <div
            className="flex items-center gap-2 rounded-full border border-borda px-3 py-1 text-[0.78rem] font-medium text-texto-suave"
            title={dica}
          >
            <span className={`h-2 w-2 rounded-full ${ponto[status]}`} aria-hidden="true" />
            {label}
          </div>
        </div>
      </div>
      <div className="border-t border-borda px-4 py-2 md:hidden">{menu}</div>
    </header>
  )
}
