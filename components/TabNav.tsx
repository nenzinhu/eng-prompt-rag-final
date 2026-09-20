'use client'

import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import type { LucideIcon } from 'lucide-react'
import { ChevronDown } from 'lucide-react'
import { prefersReducedMotion } from '@/lib/reducedMotion'
import { deveCompactar } from '@/lib/barraCompacta'

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
  // Barra encolhida enquanto o aluno rola para ler a resposta.
  const [compacto, setCompacto] = useState(false)
  // Lista de grupos aberta (o seletor que substituiu a fileira de pílulas).
  const [menuAberto, setMenuAberto] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

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
    setMenuAberto(false)
    if (grupo === grupoAtivo) return
    const destino = ultimaPorGrupo.current[grupo] ?? tabs.find((t) => t.grupo === grupo)?.id
    if (destino) onChange(destino)
  }

  // A barra encolhe ao rolar: a altura volta para o conteúdo justamente quando
  // o aluno está lendo. `deveCompactar` tem histerese — sem ela, parar a
  // rolagem em cima do limite faz a barra piscar (ver lib/barraCompacta.ts).
  useEffect(() => {
    const aoRolar = () => setCompacto((atual) => deveCompactar(window.scrollY, atual))
    aoRolar()
    window.addEventListener('scroll', aoRolar, { passive: true })
    return () => window.removeEventListener('scroll', aoRolar)
  }, [])

  // Fecha a lista de grupos ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!menuAberto) return
    const foraDoMenu = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuAberto(false)
    }
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuAberto(false)
    }
    document.addEventListener('mousedown', foraDoMenu)
    document.addEventListener('keydown', aoTeclar)
    return () => {
      document.removeEventListener('mousedown', foraDoMenu)
      document.removeEventListener('keydown', aoTeclar)
    }
  }, [menuAberto])

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

  function navegarPorTeclado(event: React.KeyboardEvent, id: string) {
    const ids = abasDoGrupo.map((t) => t.id)
    const indice = ids.indexOf(id)
    if (indice === -1) return

    let proximo: string | null = null
    if (event.key === 'ArrowRight') proximo = ids[(indice + 1) % ids.length]
    if (event.key === 'ArrowLeft') proximo = ids[(indice - 1 + ids.length) % ids.length]
    if (event.key === 'Home') proximo = ids[0]
    if (event.key === 'End') proximo = ids[ids.length - 1]
    if (!proximo || proximo === id) return

    event.preventDefault()
    onChange(proximo)
    requestAnimationFrame(() => btnRefs.current[proximo]?.focus())
  }

  return (
    <nav
      aria-label="Navegação de ferramentas"
      className={`sticky z-40 bg-bg/80 px-2 backdrop-blur-xl transition-[padding] duration-200 sm:px-4 ${
        compacto ? 'py-0.5' : 'py-1.5'
      }`}
      style={{ top: topo }}
    >
      <div className="mx-auto flex max-w-full items-end justify-center gap-2">
        {/* O grupo virou seletor: economiza a fileira de pílulas que ficava
            sempre visível. `trocarGrupo` já reabre a última aba usada no grupo. */}
        <div ref={menuRef} className="relative shrink-0 pb-1">
          <button
            onClick={() => setMenuAberto((o) => !o)}
            aria-expanded={menuAberto}
            aria-haspopup="menu"
            aria-label={`Grupo: ${grupoAtivo}. Trocar de grupo`}
            className="flex min-h-10 items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 font-mono text-[0.72rem] uppercase tracking-wider text-lime transition-colors hover:bg-white/[0.08]"
          >
            {grupoAtivo}
            <ChevronDown
              className={`h-3 w-3 transition-transform duration-200 ${menuAberto ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>
          {menuAberto && (
            <div
              role="menu"
              className="absolute left-0 top-full z-50 mt-1 min-w-[11rem] rounded-lg border border-white/10 bg-bg/95 p-1 shadow-xl backdrop-blur-xl"
            >
              {grupos.map((g) => (
                <button
                  key={g}
                  role="menuitem"
                  onClick={() => trocarGrupo(g)}
                  className={`block w-full rounded-md px-3 py-2 text-left font-mono text-[0.75rem] uppercase tracking-wider transition-colors ${
                    g === grupoAtivo ? 'bg-white/[0.07] text-lime' : 'text-muted hover:bg-white/[0.04] hover:text-text'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          )}
        </div>
        <div
          ref={navRef}
          role="tablist"
          aria-label={`Abas de ${grupoAtivo}`}
          className="no-scrollbar relative flex min-w-0 items-center gap-1 overflow-x-auto border-b border-white/10 px-1 sm:flex-wrap sm:justify-center sm:overflow-visible"
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
              id={`aba-${t.id}`}
              role="tab"
              aria-selected={active === t.id}
              aria-controls={`painel-${t.id}`}
              tabIndex={active === t.id ? 0 : -1}
              onKeyDown={(e) => navegarPorTeclado(e, t.id)}
              onClick={() => onClickBtn(t.id)}
              onMouseEnter={() => onEnterBtn(t.id)}
              onMouseLeave={() => onLeaveBtn(t.id)}
              // O rótulo some no modo compacto, então o nome precisa continuar
              // acessível ao leitor de tela e ao tooltip do mouse.
              aria-label={t.label}
              title={t.label}
              className={`relative z-10 flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap px-3 text-[0.875rem] font-medium transition-[color,padding] duration-200 sm:px-3.5 sm:text-[0.9375rem] ${
                compacto ? 'py-1.5' : 'py-2.5'
              } ${active === t.id ? 'text-white' : 'text-muted hover:text-lime active:text-lime'}`}
            >
              <Icon
                className={`h-4 w-4 shrink-0 ${active === t.id ? 'text-lime' : ''}`}
                aria-hidden="true"
                strokeWidth={2}
              />
              {/* Mobile keeps icon + short label on every tab so users do not
                  have to guess an icon-only control. */}
              <>
                <span className="hidden sm:inline">{t.label}</span>
                <span className="sm:hidden">{t.labelShort}</span>
              </>
            </button>
          )
        })}
        </div>
      </div>
    </nav>
  )
}
