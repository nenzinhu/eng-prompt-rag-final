'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

export default function Header() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'offline'>('loading')
  const [total, setTotal] = useState(0)
  const [inseguro, setInseguro] = useState(false)

  useEffect(() => {
    let mounted = true
    async function tick() {
      try {
        const d = await api.status()
        if (!mounted) return
        setStatus(d.status)
        setTotal(d.total)
        setInseguro(d.escrita_via === 'anon')
      } catch {
        if (mounted) setStatus('offline')
      }
    }
    tick()
    const id = setInterval(tick, 30000)
    return () => {
      mounted = false
      clearInterval(id)
    }
  }, [])

  const styles: Record<string, string> = {
    ready: 'text-cyan border-cyan/30 bg-cyan/10',
    empty: 'text-amber-300 border-amber-300/30 bg-amber-300/10',
    loading: 'text-violet border-violet/30 bg-violet/10',
    offline: 'text-rose-400 border-rose-400/30 bg-rose-400/10',
  }

  const label =
    status === 'ready' ? `${total.toLocaleString('pt-BR')} chunks` :
    status === 'empty' ? 'sem dados' :
    status === 'offline' ? 'offline' : 'conectando…'

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between border-b border-white/[0.06] bg-bg/70 px-6 py-3.5 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet to-cyan shadow-[0_0_16px_rgba(155,107,255,0.35)]">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M4 6.5 9 12l-5 5.5"
              stroke="#08070c"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M12 17.5h8" stroke="#08070c" strokeWidth="2.2" strokeLinecap="round" />
            <path
              d="M18.5 3.5l.55 1.45L20.5 5.5l-1.45.55-.55 1.45-.55-1.45L16.5 5.5l1.45-.55.55-1.45Z"
              fill="#08070c"
            />
          </svg>
        </span>
        <div className="leading-tight">
          <div className="font-display text-[0.98rem] italic text-text">
            Engenharia de Prompt <span className="grad-text not-italic font-sans font-semibold">IA</span>
          </div>
          <div className="font-mono text-[0.65rem] tracking-wide text-muted">RAG CLOUD · VERCEL + SUPABASE</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {inseguro && (
          <div
            className="hidden items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 font-mono text-[0.68rem] font-medium text-amber-300 sm:flex"
            title="O backend ainda escreve no banco com a chave pública. Defina SUPABASE_SERVICE_ROLE_KEY e ligue o RLS."
          >
            ⚠ escrita insegura
          </div>
        )}
        <div
          className={`flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[0.68rem] font-medium transition-colors ${styles[status]}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full bg-current ${status === 'loading' ? 'animate-pulse' : ''}`} />
          {label}
        </div>
      </div>
    </header>
  )
}
