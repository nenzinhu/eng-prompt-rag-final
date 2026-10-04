'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { LogOut, TriangleAlert } from 'lucide-react'
import { api } from '@/lib/api'
import { prefersReducedMotion } from '@/lib/reducedMotion'
import InstalarApp from './InstalarApp'
import Conta from './Conta'

export default function Header({
  refreshSignal = 0,
  onSair,
}: {
  refreshSignal?: number
  /** Só no app privado: encerra a sessão e volta à tela de entrada. */
  onSair?: () => void
}) {
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
      // `total` vem nulo quando o banco não respondeu (status 'offline'):
      // manter o último número seria mostrar um dado que já não vale.
      setTotal(d.total ?? 0)
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
    status === 'ready' ? `${total.toLocaleString('pt-BR')} trechos disponíveis` :
    status === 'empty' ? 'Nenhum material indexado' :
    status === 'offline' ? 'Sem conexão' : 'Verificando conexão…'

  return (
    <header
      ref={rootRef}
      className="sticky top-0 z-50 flex min-h-[76px] flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-white/[0.07] bg-bg/95 px-5 py-4 backdrop-blur-xl sm:px-8 lg:px-12"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          ref={logoRef}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-lime shadow-[0_4px_20px_rgba(201,232,162,0.08)]"
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
          <div className="text-[0.95rem] font-semibold tracking-tight text-text sm:text-[1.05rem]">
            Engenharia de Prompt <span className="ml-1 rounded-md bg-cyan/10 px-1.5 py-0.5 font-mono text-[0.65rem] text-cyan">IA</span>
          </div>
          <div className="mt-0.5 text-[0.7rem] text-muted">Seu espaço para aprender melhor</div>
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
            Configuração de segurança pendente
          </div>
        )}
        <div
          ref={badgeRef}
          title={label}
          role="status"
          className={`flex min-h-8 items-center gap-2 rounded-full border px-2.5 py-1 text-[0.7rem] font-medium transition-colors sm:px-3 ${styles[status]}`}
        >
          <span ref={dotRef} className={`h-1.5 w-1.5 rounded-full bg-current ${status === 'loading' ? 'animate-pulse' : ''}`} />
          <span className="hidden lg:inline">{label}</span>
          <span className="lg:hidden">{status === 'ready' ? 'Material pronto' : status === 'empty' ? 'Sem material' : status === 'offline' ? 'Sem conexão' : 'Conectando'}</span>
        </div>
        {onSair && (
          <button
            type="button"
            onClick={onSair}
            title="Sair"
            aria-label="Sair"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.12] text-muted transition-colors hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    </header>
  )
}
