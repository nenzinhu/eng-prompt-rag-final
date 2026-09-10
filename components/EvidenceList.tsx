'use client'

import { useState } from 'react'
import type { Evidencia } from '@/lib/types'

export default function EvidenceList({ items }: { items: Evidencia[] }) {
  const [open, setOpen] = useState(false)
  if (!items.length) return null
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="mb-2 flex items-center gap-1.5 font-mono text-[0.78rem] text-muted transition-colors hover:text-text"
      >
        {open ? '▼ Ocultar trechos' : '▶ Mostrar trechos da apostila'}
      </button>
      {open && (
        <div className="flex flex-col gap-2">
          {items.map((c, i) => (
            <div key={i} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="mb-1 font-mono text-[0.67rem] text-cyan">
                📄 {c.fonte}
                {c.pagina ? ` · pág. ${c.pagina}` : ''}
              </div>
              <div className="line-clamp-3 text-[0.8rem] leading-relaxed text-muted">{c.conteudo}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
