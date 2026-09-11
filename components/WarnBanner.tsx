'use client'

import { useLayoutEffect, useRef } from 'react'
import { gsap } from 'gsap'

export default function WarnBanner({ confianca }: { confianca: number }) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!ref.current) return
    gsap.fromTo(
      ref.current,
      { autoAlpha: 0, y: -8, scale: 0.98 },
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.4, ease: 'power2.out' }
    )
  }, [])

  return (
    <div
      ref={ref}
      className="mb-4 flex items-center gap-2 rounded-lg border border-amber-300/25 bg-amber-300/10 px-3.5 py-2.5 text-[0.8rem] text-amber-300"
    >
      ⚠️ resposta baseada majoritariamente em conhecimento geral da IA (confiança na apostila:{' '}
      {Math.round(confianca * 100)}%)
    </div>
  )
}
