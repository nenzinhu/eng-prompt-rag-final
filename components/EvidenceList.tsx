'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { ChevronRight, FileText } from 'lucide-react'
import { prefersReducedMotion } from '@/lib/reducedMotion'
import TrechoNoContexto from '@/components/TrechoNoContexto'
import type { Evidencia } from '@/lib/types'

export default function EvidenceList({ items }: { items: Evidencia[] }) {
  const [open, setOpen] = useState(false)
  const [rendered, setRendered] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const arrowRef = useRef<SVGSVGElement>(null)

  // Monta o painel antes de animar. O efeito de baixo depende do `wrapRef`,
  // que só existe depois que `rendered` vira true — por isso são dois efeitos:
  // num só, o `return` do ref nulo acontecia ANTES do setRendered e a lista
  // nunca abria.
  useLayoutEffect(() => {
    if (open) setRendered(true)
  }, [open])

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    if (open) {
      if (prefersReducedMotion()) {
        gsap.set(el, { height: 'auto', autoAlpha: 1 })
        gsap.set(arrowRef.current, { rotate: 90 })
        return
      }
      gsap.set(el, { height: 0, autoAlpha: 0 })
      requestAnimationFrame(() => {
        gsap.to(el, { height: 'auto', autoAlpha: 1, duration: 0.4, ease: 'power2.out' })
      })
      gsap.to(arrowRef.current, { rotate: 90, duration: 0.3, ease: 'power2.out' })
    } else if (rendered) {
      if (prefersReducedMotion()) {
        setRendered(false)
        gsap.set(arrowRef.current, { rotate: 0 })
        return
      }
      gsap.to(el, {
        height: 0,
        autoAlpha: 0,
        duration: 0.3,
        ease: 'power2.in',
        onComplete: () => setRendered(false),
      })
      gsap.to(arrowRef.current, { rotate: 0, duration: 0.25, ease: 'power2.out' })
    }
  }, [open, rendered])

  if (!items.length) return null

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="mb-2 flex items-center gap-1.5 font-mono text-[0.78rem] text-muted transition-colors hover:text-text"
      >
        <ChevronRight ref={arrowRef} className="h-3.5 w-3.5" aria-hidden="true" />
        {open ? 'Ocultar trechos' : 'Mostrar trechos da apostila'}
      </button>
      {rendered && (
        <div ref={wrapRef} className="overflow-hidden">
          <div className="flex flex-col gap-2">
            {items.map((c, i) => (
              <div key={i} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="mb-1 flex items-center gap-1 font-mono text-[0.67rem] text-cyan">
                  <FileText className="h-3 w-3 shrink-0" aria-hidden="true" />
                  {c.fonte}
                  {c.pagina ? ` · pág. ${c.pagina}` : ''}
                </div>
                <div className="line-clamp-3 text-[0.8rem] leading-relaxed text-muted">{c.conteudo}</div>
                <TrechoNoContexto fonte={c.fonte} pagina={c.pagina} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
