'use client'

import { useRef } from 'react'

/**
 * Painel de uma aba. Fica montado depois da primeira vez (preserva o que foi
 * digitado ao trocar de aba) e aparece com um fade curto de CSS (`.surgir`).
 */
export default function TabPanel({
  active,
  children,
}: {
  active: boolean
  children: React.ReactNode
}) {
  // Só renderiza o conteúdo da aba na primeira vez que ela fica ativa — evita
  // que todas as abas disparem seus efeitos de fetch (personas, listagens etc.)
  // no carregamento inicial da página, mesmo as que o usuário nunca abre.
  const jaAtivouUmaVez = useRef(active)
  if (active) jaAtivouUmaVez.current = true

  return (
    <div className={active ? 'surgir relative' : 'hidden'} aria-hidden={active ? undefined : true}>
      {jaAtivouUmaVez.current ? children : null}
    </div>
  )
}
