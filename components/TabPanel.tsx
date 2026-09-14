'use client'

import { useLayoutEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { prefersReducedMotion } from '@/lib/reducedMotion'

export default function TabPanel({
  active,
  children,
}: {
  active: boolean
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const mounted = useRef(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    gsap.killTweensOf(el)
    if (active) {
      const mostrarDireto = () => gsap.set(el, { autoAlpha: 1, y: 0 })
      // Com a janela/aba em segundo plano, o rAF do GSAP pode não rodar (ou
      // demorar) e o fromTo abaixo deixaria o painel preso em autoAlpha 0
      // (invisível) até o usuário voltar. Se já sabemos que está oculto,
      // pula a animação; senão, roda normal mas com uma rede de segurança:
      // se em 1,2s (bem mais que a duração da animação) o painel ainda não
      // tiver terminado de aparecer, força o estado final.
      if (document.hidden || prefersReducedMotion()) {
        mostrarDireto()
      } else {
        gsap.fromTo(
          el,
          { autoAlpha: 0, y: mounted.current ? 14 : 0 },
          { autoAlpha: 1, y: 0, duration: 0.5, ease: 'power2.out' }
        )
        const seguranca = setTimeout(mostrarDireto, 1200)
        mounted.current = true
        return () => clearTimeout(seguranca)
      }
    } else {
      gsap.set(el, { autoAlpha: 0, y: 0 })
    }
    mounted.current = true
  }, [active])

  return (
    <div
      ref={ref}
      className={active ? 'relative' : 'pointer-events-none absolute inset-0 invisible'}
    >
      {children}
    </div>
  )
}
