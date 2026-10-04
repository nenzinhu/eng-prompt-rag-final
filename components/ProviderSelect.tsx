'use client'

import { TriangleAlert } from 'lucide-react'
import type { ProvidersResp } from '@/lib/types'

export default function ProviderSelect({
  providers,
  provider,
  modelo,
  onProviderChange,
  onModeloChange,
  nenhumConfigurado = false,
}: {
  providers: ProvidersResp
  provider: string
  modelo: string
  onProviderChange: (v: string) => void
  onModeloChange: (v: string) => void
  nenhumConfigurado?: boolean
}) {
  const models = providers[provider]?.models ?? []
  const notas = providers[provider]?.notas ?? {}
  const aviso = providers[provider]?.aviso

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-bg/35 p-3">
      <span className="mr-1 w-full text-[0.72rem] font-medium text-muted sm:w-auto">Sua IA</span>
      <select
        value={provider}
        aria-label="Provedor de inteligência artificial"
        onChange={(e) => {
          const p = e.target.value
          onProviderChange(p)
          onModeloChange(providers[p]?.models?.[0] ?? '')
        }}
        className="min-h-11 w-full min-w-0 rounded-lg border border-white/10 bg-surface px-3 py-2 text-[0.8rem] text-text outline-none sm:w-auto"
      >
        {Object.entries(providers).map(([key, v]) => (
          <option key={key} value={key} disabled={!v.configurado} className="bg-surface">
            {v.label}
            {v.configurado ? '' : ' (sem chave)'}
          </option>
        ))}
      </select>
      <select
        value={modelo}
        aria-label="Modelo de inteligência artificial"
        onChange={(e) => onModeloChange(e.target.value)}
        disabled={!models.length}
        className="min-h-11 w-full min-w-0 rounded-lg border border-white/10 bg-surface px-3 py-2 text-[0.8rem] text-text outline-none disabled:opacity-50 sm:w-auto sm:flex-1"
      >
        {models.length === 0 && <option value="">— escolha um provedor —</option>}
        {models.map((m) => (
          <option key={m} value={m} className="bg-surface">
            {notas[m] ? `${m} (${notas[m]})` : m}
          </option>
        ))}
      </select>
      {aviso && (
        <div className="flex w-full items-start gap-1.5 text-[0.72rem] leading-relaxed text-muted">
          <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          <span>{aviso}</span>
        </div>
      )}
      {nenhumConfigurado && (
        <div className="flex w-full items-start gap-1.5 text-[0.75rem] leading-relaxed text-amber-300">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            Nenhuma IA está disponível no momento. O administrador precisa configurar um provedor para habilitar as respostas.
          </span>
        </div>
      )}
    </div>
  )
}
