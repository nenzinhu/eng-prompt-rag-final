'use client'

import { useLayoutEffect, useRef } from 'react'
import { gsap } from 'gsap'

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
    if (active) {
      gsap.killTweensOf(el)
      gsap.fromTo(
        el,
        { autoAlpha: 0, y: mounted.current ? 14 : 0 },
        { autoAlpha: 1, y: 0, duration: 0.5, ease: 'power2.out' }
      )
    } else {
      gsap.killTweensOf(el)
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
