'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { TriangleAlert } from 'lucide-react'
import { api } from '@/lib/api'
import { prefersReducedMotion } from '@/lib/reducedMotion'
import InstalarApp from './InstalarApp'
import Conta from './Conta'

export default function Header({ refreshSignal = 0 }: { refreshSignal?: number }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'offline'>('loading')
  const [total, setTotal] = useState(0)
  const [inseguro, setInseguro] = useState(false)

  const rootRef = useRef<HTMLElement>(null)
  const logoRef = useRef<HTMLSpanElement>(null)
  const titleRef = useRef<HTMLDivElement>(null)
  const badgeRef = useRef<HTMLDivElement>(null)
  const dotRef = useRef<HTMLSpanElement>(null)
  const firstStatus = useRef(true)
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

  // Reconsulta o status quando o pai sinaliza uma mudança (ex.: upload de PDF)
  // sem remontar o componente inteiro — evita refazer a animação de entrada
  // do cabeçalho só para atualizar um contador.
  const primeiroSinal = useRef(true)
  useEffect(() => {
    if (primeiroSinal.current) {
      primeiroSinal.current = false
      return
    }
    tick()
  }, [refreshSignal, tick])

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
      if (document.hidden || prefersReducedMotion()) {
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
    if (!badgeRef.current || prefersReducedMotion()) return
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
      className="sticky top-0 z-50 flex items-center justify-between border-b border-white/[0.12] bg-bg/70 px-[8px] py-[4px] backdrop-blur-xl"
    >
      <div className="flex items-center gap-[6px]">
        <span
          ref={logoRef}
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[4px] bg-gradient-to-br from-lime to-hotpink shadow-[0_0_17px_rgba(255,61,240,0.45)]"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" xmlns="http://www.w3.org/2000/svg">
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
          <div className="font-display text-[1.13rem] italic text-text">
            Engenharia de Prompt <span className="grad-text not-italic font-sans font-semibold">IA</span>
          </div>
          <div className="font-mono text-[0.65rem] tracking-wide text-muted">RAG CLOUD · VERCEL + SUPABASE</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <InstalarApp />
        <Conta />
        {inseguro && (
          <div
            className="hidden items-center gap-1.5 rounded-md border border-amber-300/30 bg-amber-300/10 px-3 py-1 font-mono text-[0.68rem] font-medium text-amber-300 sm:flex"
            title="O backend ainda escreve no banco com a chave pública. Defina SUPABASE_SERVICE_ROLE_KEY e ligue o RLS."
          >
            <TriangleAlert className="h-3 w-3" aria-hidden="true" />
            escrita insegura
          </div>
        )}
        <div
          ref={badgeRef}
          className={`flex items-center gap-2 rounded-md border px-3 py-1 font-mono text-[0.68rem] font-medium transition-colors ${styles[status]}`}
        >
          <span ref={dotRef} className={`h-1.5 w-1.5 rounded-full bg-current ${status === 'loading' ? 'animate-pulse' : ''}`} />
          {label}
        </div>
      </div>
    </header>
  )
}
