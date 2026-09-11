'use client'

import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'

export interface TabDef {
  id: string
  label: string
  labelShort: string
  icon: string
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
    gsap.to(indicator, {
      x: btnBox.left - navBox.left,
      width: btnBox.width,
      duration: 0.5,
      ease: 'power3.out',
    })
  }, [active, tabs])

  // Entrada em cascata dos botões da barra de abas, uma única vez ao montar.
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        Object.values(btnRefs.current).filter(Boolean),
        { autoAlpha: 0, y: 10 },
        { autoAlpha: 1, y: 0, duration: 0.4, ease: 'power2.out', stagger: 0.04, delay: 0.1 }
      )
    }, navRef)
    return () => ctx.revert()
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
    <nav className="sticky top-[64px] z-40 flex justify-center px-4 py-3">
      <div
        ref={navRef}
        className="glass relative flex flex-wrap justify-center gap-1 rounded-2xl p-1.5"
      >
        <div
          ref={indicatorRef}
          className="absolute top-1.5 bottom-1.5 left-0 rounded-xl bg-gradient-to-r from-violet/25 to-cyan/20 border border-white/10"
          style={{ width: 0 }}
        />
        {tabs.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              btnRefs.current[t.id] = el
            }}
            onClick={() => onClickBtn(t.id)}
            onMouseEnter={() => onEnterBtn(t.id)}
            onMouseLeave={() => onLeaveBtn(t.id)}
            className={`relative z-10 flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
              active === t.id ? 'text-white' : 'text-muted hover:text-text'
            }`}
          >
            <span className="text-base leading-none">{t.icon}</span>
            <span className="hidden sm:inline">{t.label}</span>
            <span className="sm:hidden">{t.labelShort}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}
