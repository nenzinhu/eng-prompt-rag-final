'use client'

import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import type { LucideIcon } from 'lucide-react'
import { prefersReducedMotion } from '@/lib/reducedMotion'

export interface TabDef {
  id: string
  grupo: string
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
  const [topo, setTopo] = useState(54)

  // O título do cabeçalho quebra em duas linhas em telas estreitas; um `top` fixo
  // deixava a barra escondida atrás dele ao rolar.
  useEffect(() => {
    const header = document.querySelector('header')
    if (!header) return
    const obs = new ResizeObserver(() => setTopo(header.getBoundingClientRect().height))
    obs.observe(header)
    return () => obs.disconnect()
  }, [])
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  const grupos = [...new Set(tabs.map((t) => t.grupo))]
  const grupoAtivo = tabs.find((t) => t.id === active)?.grupo ?? grupos[0]
  const abasDoGrupo = tabs.filter((t) => t.grupo === grupoAtivo)

  // Voltar a um grupo reabre a última aba usada nele, não sempre a primeira.
  const ultimaPorGrupo = useRef<Record<string, string>>({})
  ultimaPorGrupo.current[grupoAtivo] = active

  function trocarGrupo(grupo: string) {
    if (grupo === grupoAtivo) return
    const destino = ultimaPorGrupo.current[grupo] ?? tabs.find((t) => t.grupo === grupo)?.id
    if (destino) onChange(destino)
  }

  // x/y/width acompanham o botão ativo tanto em linha única quanto com as abas
  // quebrando em várias linhas; a altura fica travada em 3px (underline). O
  // indicador é ancorado em top-0/left-0: com `bottom-0` o `y` somava a altura
  // da barra inteira e a linha caía abaixo do menu.
  function posicionarIndicador(animar: boolean) {
    const btn = btnRefs.current[active]
    const nav = navRef.current
    const indicator = indicatorRef.current
    if (!btn || !nav || !indicator) return null
    const navBox = nav.getBoundingClientRect()
    const btnBox = btn.getBoundingClientRect()
    const alvo = {
      x: btnBox.left - navBox.left + nav.scrollLeft,
      y: btnBox.bottom - navBox.top - 3,
      width: btnBox.width,
      height: 3,
    }
    // overwrite: uma animação anterior ainda em curso terminaria depois e
    // devolveria a largura antiga (ex.: rótulo longo trocado pelo curto ao estreitar).
    if (animar) gsap.to(indicator, { ...alvo, duration: 0.5, ease: 'power3.out', overwrite: true })
    else gsap.set(indicator, { ...alvo, overwrite: true })
    return btn
  }

  useEffect(() => {
    const btn = posicionarIndicador(true)
    btn?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, tabs])

  // Mudança de largura (rotação, janela, fontes carregando) reposiciona sem animar.
  // Inscrito uma vez; o ref evita reinscrever a cada render e cortar a animação.
  const posicionarRef = useRef(posicionarIndicador)
  posicionarRef.current = posicionarIndicador
  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const obs = new ResizeObserver(() => posicionarRef.current(false))
    obs.observe(nav)
    return () => obs.disconnect()
  }, [])

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
    <nav className="sticky z-40 bg-bg/80 px-2 py-1.5 backdrop-blur-xl sm:px-4" style={{ top: topo }}>
      <div className="no-scrollbar mx-auto mb-1 flex max-w-full items-center justify-center gap-1 overflow-x-auto">
        {grupos.map((g) => (
          <button
            key={g}
            onClick={() => trocarGrupo(g)}
            aria-pressed={g === grupoAtivo}
            className={`shrink-0 rounded-full px-3 py-1 font-mono text-[0.68rem] uppercase tracking-wider transition-colors ${
              g === grupoAtivo ? 'bg-white/[0.07] text-lime' : 'text-muted hover:text-text'
            }`}
          >
            {g}
          </button>
        ))}
      </div>
      <div
        ref={navRef}
        className="no-scrollbar relative mx-auto flex max-w-full items-center gap-1 overflow-x-auto border-b border-white/10 px-1 sm:flex-wrap sm:justify-center sm:overflow-visible"
        style={{ width: 'fit-content' }}
      >
        <div
          ref={indicatorRef}
          className="pointer-events-none absolute left-0 top-0 h-[3px] rounded-full bg-gradient-to-r from-lime to-hotpink"
          style={{ width: 0, height: 0 }}
        />
        {abasDoGrupo.map((t) => {
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
