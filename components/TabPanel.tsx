'use client'

import { useLayoutEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { prefersReducedMotion } from '@/lib/reducedMotion'

export default function TabPanel({
  active,
  children,
  id,
}: {
  active: boolean
  children: React.ReactNode
  id: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const mounted = useRef(false)
  // Só renderiza o conteúdo da aba na primeira vez que ela fica ativa — evita
  // que todas as abas disparem seus efeitos de fetch (personas, listagens etc.)
  // no carregamento inicial da página, mesmo as que o usuário nunca abre.
  const jaAtivouUmaVez = useRef(active)
  if (active) jaAtivouUmaVez.current = true

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
      id={id}
      ref={ref}
      role="tabpanel"
      aria-labelledby={`aba-${id}`}
      className={active ? 'relative' : 'pointer-events-none absolute inset-0 invisible'}
    >
      {jaAtivouUmaVez.current ? children : null}
    </div>
  )
}
