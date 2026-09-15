'use client'

import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import type { LucideIcon } from 'lucide-react'
import { prefersReducedMotion } from '@/lib/reducedMotion'

export interface TabDef {
  id: string
  label: string
  labelShort: string
  icon: LucideIcon
}

export default function TabNav({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef[]
  active: string
  onChange: (id: string) => void
}) {
  const navRef = useRef<HTMLDivElement>(null)
  const indicatorRef = useRef<HTMLDivElement>(null)
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  useEffect(() => {
    const btn = btnRefs.current[active]
    const nav = navRef.current
    const indicator = indicatorRef.current
    if (!btn || !nav || !indicator) return
    const navBox = nav.getBoundingClientRect()
    const btnBox = btn.getBoundingClientRect()
    // x/y/width (em vez de só x/width) para o indicador acompanhar o botão
    // certo tanto na barra em linha única (desktop) quanto quando os itens
    // quebram em várias linhas — evita o indicador "esticar" cobrindo várias
    // abas de uma vez. Altura fica travada em 3px (estilo underline) — só a
    // posição/largura acompanham o botão ativo.
    gsap.to(indicator, {
      x: btnBox.left - navBox.left,
      y: btnBox.bottom - navBox.top - 3,
      width: btnBox.width,
      height: 3,
      duration: 0.5,
      ease: 'power3.out',
    })
    btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [active, tabs])

  // Entrada em cascata dos botões da barra de abas, uma única vez ao montar.
  //
  // Se a página monta com a aba do navegador em segundo plano (ex.: aberta
  // via link em nova aba não focada), o rAF do GSAP pode nunca rodar e os
  // botões ficam travados com autoAlpha 0 (invisíveis) até o usuário voltar
  // à aba — e mesmo aí a animação só recomeça se algo a disparar de novo.
  // Por isso, quando a página já nasce oculta, pula a animação e mostra os
  // botões direto; do contrário, roda a cascata normalmente.
  useEffect(() => {
    const targets = Object.values(btnRefs.current).filter(Boolean)
    const mostrarDireto = () => gsap.set(targets, { autoAlpha: 1, y: 0 })
    let seguranca: ReturnType<typeof setTimeout> | undefined
    const ctx = gsap.context(() => {
      if (document.hidden || prefersReducedMotion()) {
        mostrarDireto()
      } else {
        gsap.fromTo(
          targets,
          { autoAlpha: 0, y: 10 },
          { autoAlpha: 1, y: 0, duration: 0.4, ease: 'power2.out', stagger: 0.04, delay: 0.1 }
        )
        // Rede de segurança: se o rAF não tiver rodado o suficiente em 1,2s
        // (janela/aba em segundo plano, thread principal ocupada), força o
        // estado final em vez de deixar os botões presos invisíveis.
        seguranca = setTimeout(mostrarDireto, 1200)
      }
    }, navRef)
    return () => {
      if (seguranca) clearTimeout(seguranca)
      ctx.revert()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onEnterBtn(id: string) {
    if (id === active) return
    gsap.to(btnRefs.current[id], { scale: 1.05, duration: 0.2, ease: 'power2.out' })
  }
  function onLeaveBtn(id: string) {
    if (id === active) return
    gsap.to(btnRefs.current[id], { scale: 1, duration: 0.25, ease: 'power2.out' })
  }
  function onClickBtn(id: string) {
    const el = btnRefs.current[id]
    if (el) gsap.fromTo(el, { scale: 0.92 }, { scale: 1, duration: 0.35, ease: 'back.out(3)' })
    onChange(id)
  }

  return (
    <nav className="sticky top-[54px] z-40 px-2 py-1.5 sm:px-4">
      <div
        ref={navRef}
        className="no-scrollbar relative mx-auto flex max-w-full items-center gap-1 overflow-x-auto border-b border-white/10 px-1 sm:flex-wrap sm:justify-center sm:overflow-visible"
        style={{ width: 'fit-content' }}
      >
        <div
          ref={indicatorRef}
          className="pointer-events-none absolute bottom-0 left-0 h-[3px] rounded-full bg-gradient-to-r from-lime to-hotpink"
          style={{ width: 0, height: 0 }}
        />
        {tabs.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              ref={(el) => {
                btnRefs.current[t.id] = el
              }}
              onClick={() => onClickBtn(t.id)}
              onMouseEnter={() => onEnterBtn(t.id)}
              onMouseLeave={() => onLeaveBtn(t.id)}
              aria-current={active === t.id ? 'true' : undefined}
              className={`relative z-10 flex shrink-0 items-center gap-2 whitespace-nowrap px-3 py-2 text-[0.83rem] font-medium transition-colors sm:px-3.5 sm:text-sm ${
                active === t.id ? 'text-white' : 'text-muted hover:text-lime active:text-lime'
              }`}
            >
              <Icon
                className={`h-4 w-4 shrink-0 ${active === t.id ? 'text-lime' : ''}`}
                aria-hidden="true"
                strokeWidth={2}
              />
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.labelShort}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
