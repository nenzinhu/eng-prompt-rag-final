'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { api } from '@/lib/api'

export default function Header() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'offline'>('loading')
  const [total, setTotal] = useState(0)
  const [inseguro, setInseguro] = useState(false)

  const rootRef = useRef<HTMLElement>(null)
  const logoRef = useRef<HTMLSpanElement>(null)
  const titleRef = useRef<HTMLDivElement>(null)
  const badgeRef = useRef<HTMLDivElement>(null)
  const dotRef = useRef<HTMLSpanElement>(null)
  const firstStatus = useRef(true)

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

  // Entrada suave do cabeçalho ao montar: logo com "pop" e texto deslizando/entrando.
  //
  // Se a aba do navegador nasce em segundo plano, o rAF pode não rodar e o
  // header (que começa com autoAlpha 0) ficaria invisível até o usuário
  // voltar à aba. Nesse caso, aplica o estado final direto, sem animar.
  useLayoutEffect(() => {
    const mostrarDireto = () =>
      gsap.set([rootRef.current, logoRef.current, titleRef.current], {
        autoAlpha: 1,
        y: 0,
        x: 0,
        scale: 1,
        rotate: 0,
      })
    let seguranca: ReturnType<typeof setTimeout> | undefined
    const ctx = gsap.context(() => {
      if (document.hidden) {
        mostrarDireto()
        return
      }
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
      tl.fromTo(rootRef.current, { autoAlpha: 0, y: -12 }, { autoAlpha: 1, y: 0, duration: 0.5 })
        .fromTo(
          logoRef.current,
          { scale: 0.4, rotate: -20, autoAlpha: 0 },
          { scale: 1, rotate: 0, autoAlpha: 1, duration: 0.55, ease: 'back.out(2.2)' },
          '-=0.35'
        )
        .fromTo(titleRef.current, { autoAlpha: 0, x: -8 }, { autoAlpha: 1, x: 0, duration: 0.4 }, '-=0.3')
      // Rede de segurança: se a janela/aba ficar em segundo plano durante a
      // entrada e o rAF não completar a tempo, força o estado final em vez
      // de deixar o cabeçalho preso invisível.
      seguranca = setTimeout(mostrarDireto, 1500)
    }, rootRef)
    return () => {
      if (seguranca) clearTimeout(seguranca)
      ctx.revert()
    }
  }, [])

  // Pequeno "pop" no badge sempre que o status muda de verdade (não na primeira renderização).
  useLayoutEffect(() => {
    if (firstStatus.current) {
      firstStatus.current = false
      return
    }
    if (!badgeRef.current) return
    gsap.fromTo(
      badgeRef.current,
      { scale: 0.9 },
      { scale: 1, duration: 0.4, ease: 'back.out(3)' }
    )
    if (dotRef.current) {
      gsap.fromTo(dotRef.current, { scale: 2, autoAlpha: 0.4 }, { scale: 1, autoAlpha: 1, duration: 0.5, ease: 'power2.out' })
    }
  }, [status, total])

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
    <header
      ref={rootRef}
      className="sticky top-0 z-50 flex items-center justify-between border-b border-white/[0.06] bg-bg/70 px-6 py-3.5 backdrop-blur-xl"
    >
      <div className="flex items-center gap-3">
        <span
          ref={logoRef}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet to-cyan shadow-[0_0_16px_rgba(155,107,255,0.35)]"
        >
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
        <div ref={titleRef} className="leading-tight">
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
          ref={badgeRef}
          className={`flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[0.68rem] font-medium transition-colors ${styles[status]}`}
        >
          <span ref={dotRef} className={`h-1.5 w-1.5 rounded-full bg-current ${status === 'loading' ? 'animate-pulse' : ''}`} />
          {label}
        </div>
      </div>
    </header>
  )
}
