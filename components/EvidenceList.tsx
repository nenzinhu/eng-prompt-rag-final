'use client'

import { useState } from 'react'
import { ChevronRight, FileText } from 'lucide-react'
import type { Evidencia } from '@/lib/types'

export default function EvidenceList({ items }: { items: Evidencia[] }) {
  const [open, setOpen] = useState(false)

  if (!items.length) return null

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mb-2 flex items-center gap-1.5 text-[0.85rem] text-texto-suave transition-colors hover:text-texto"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
          aria-hidden="true"
        />
        {open ? 'Ocultar trechos' : 'Mostrar trechos da apostila'}
      </button>
      {open && (
        <div className="surgir flex flex-col gap-2">
          {items.map((c, i) => (
            <div key={i} className="rounded-lg border border-borda bg-campo p-3">
              <div className="mb-1 flex items-center gap-1 text-[0.75rem] font-semibold text-texto">
                <FileText className="h-3 w-3 shrink-0" aria-hidden="true" />
                {c.fonte}
                {c.pagina ? ` · pág. ${c.pagina}` : ''}
              </div>
              <div className="line-clamp-3 text-[0.85rem] leading-relaxed text-texto-suave">{c.conteudo}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
