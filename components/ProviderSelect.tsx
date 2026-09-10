'use client'

import type { ProvidersResp } from '@/lib/types'

export default function ProviderSelect({
  providers,
  provider,
  modelo,
  onProviderChange,
  onModeloChange,
}: {
  providers: ProvidersResp
  provider: string
  modelo: string
  onProviderChange: (v: string) => void
  onModeloChange: (v: string) => void
}) {
  const models = providers[provider]?.models ?? []

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      <select
        value={provider}
        onChange={(e) => {
          const p = e.target.value
          onProviderChange(p)
          onModeloChange(providers[p]?.models?.[0] ?? '')
        }}
        className="glass rounded-lg px-3 py-2 font-mono text-[0.8rem] text-text outline-none"
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
        onChange={(e) => onModeloChange(e.target.value)}
        disabled={!models.length}
        className="glass rounded-lg px-3 py-2 font-mono text-[0.8rem] text-text outline-none disabled:opacity-50"
      >
        {models.length === 0 && <option value="">— escolha um provedor —</option>}
        {models.map((m) => (
          <option key={m} value={m} className="bg-surface">
            {m}
          </option>
        ))}
      </select>
    </div>
  )
}
