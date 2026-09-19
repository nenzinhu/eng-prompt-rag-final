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
    <div className="mb-4 flex flex-wrap gap-2">
      <select
        value={provider}
        onChange={(e) => {
          const p = e.target.value
          onProviderChange(p)
          onModeloChange(providers[p]?.models?.[0] ?? '')
        }}
        className="campo min-w-0 max-w-full px-3 py-2 text-[0.92rem]"
      >
        {Object.entries(providers).map(([key, v]) => (
          <option key={key} value={key} disabled={!v.configurado} className="bg-cartao">
            {v.label}
            {v.configurado ? '' : ' (sem chave)'}
          </option>
        ))}
      </select>
      <select
        value={modelo}
        onChange={(e) => onModeloChange(e.target.value)}
        disabled={!models.length}
        className="campo min-w-0 max-w-full px-3 py-2 text-[0.92rem] disabled:opacity-50"
      >
        {models.length === 0 && <option value="">— escolha um provedor —</option>}
        {models.map((m) => (
          <option key={m} value={m} className="bg-cartao">
            {notas[m] ? `${m} (${notas[m]})` : m}
          </option>
        ))}
      </select>
      {aviso && (
        <div className="flex w-full items-start gap-1.5 text-[0.72rem] leading-relaxed text-texto-suave">
          <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          <span>{aviso}</span>
        </div>
      )}
      {nenhumConfigurado && (
        <div className="flex w-full items-start gap-1.5 text-[0.75rem] leading-relaxed text-atencao">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            Nenhum provedor com chave configurada no servidor. Defina{' '}
            <code>NOUS_API_KEY</code> (ou GROQ/OPENROUTER/NVIDIA) no ambiente
            para habilitar as respostas.
          </span>
        </div>
      )}
    </div>
  )
}
