'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'

export interface TabDef {
  id: string
  grupo: string
  label: string
  labelShort: string
  icon: LucideIcon
}

/**
 * Barra com as abas do grupo ativo. O traço branco sob a aba ativa é um único
 * elemento que desliza por CSS (`transition` em transform/width).
 */
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
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [topo, setTopo] = useState(56)
  const [traco, setTraco] = useState({ x: 0, largura: 0 })

  // O cabeçalho muda de altura (menu de grupos numa linha própria no celular);
  // um `top` fixo deixaria a barra escondida atrás dele ao rolar.
  useEffect(() => {
    const header = document.querySelector('header')
    if (!header) return
    const obs = new ResizeObserver(() => setTopo(header.getBoundingClientRect().height))
    obs.observe(header)
    return () => obs.disconnect()
  }, [])

  useLayoutEffect(() => {
    const posicionar = () => {
      const btn = btnRefs.current[active]
      if (!btn) return
      setTraco({ x: btn.offsetLeft, largura: btn.offsetWidth })
    }
    posicionar()
    btnRefs.current[active]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    // Rotação, janela e fonte carregando mudam a largura dos botões.
    const nav = navRef.current
    if (!nav) return
    const obs = new ResizeObserver(posicionar)
    obs.observe(nav)
    return () => obs.disconnect()
  }, [active, tabs])

  return (
    <nav
      aria-label="Abas"
      className="sticky z-40 border-b border-borda bg-topo/95 px-2 sm:px-4"
      style={{ top: topo }}
    >
      <div
        ref={navRef}
        className="no-scrollbar relative mx-auto flex max-w-full items-center gap-1 overflow-x-auto sm:justify-center"
        style={{ width: 'fit-content' }}
      >
        {tabs.map((t) => {
          const Icon = t.icon
          const ativa = active === t.id
          return (
            <button
              key={t.id}
              ref={(el) => {
                btnRefs.current[t.id] = el
              }}
              onClick={() => onChange(t.id)}
              aria-current={ativa ? 'true' : undefined}
              className={`flex shrink-0 items-center gap-2 whitespace-nowrap px-3 py-3 text-[0.9rem] font-medium transition-colors sm:px-3.5 ${
                ativa ? 'text-texto' : 'text-texto-suave hover:text-texto'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" strokeWidth={2} />
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.labelShort}</span>
            </button>
          )
        })}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-0 h-[2px] bg-destaque transition-[transform,width] duration-200 ease-out"
          style={{ width: traco.largura, transform: `translateX(${traco.x}px)` }}
        />
      </div>
    </nav>
  )
}
