'use client'

import { useEffect, useState } from 'react'
import { Shield, TriangleAlert, Copy, CircleCheck } from 'lucide-react'
import { api } from '@/lib/api'
import { useProviderModel } from '@/lib/useProviderModel'
import type { ProvidersResp, PerfilComportamental } from '@/lib/types'
import ProviderSelect from '../ProviderSelect'

const PERFIS_PADRAO: PerfilComportamental[] = [
  {
    temperament_id: 'estoico',
    display_name: 'Estoico / Sereno',
    description: 'Calma inabalável — reconhece o fato, fixa o limite e encerra sem se alongar.',
  },
]

export default function PerfisComportamentaisTab({ providers }: { providers: ProvidersResp }) {
  const { provider, modelo, trocarProvider, setModelo, pronto, nenhumConfigurado } = useProviderModel(providers)
  const [perfis, setPerfis] = useState<PerfilComportamental[]>(PERFIS_PADRAO)
  const [temperamentId, setTemperamentId] = useState('estoico')
  const [contexto, setContexto] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [resposta, setResposta] = useState('')
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    api
      .perfisComportamentais()
      .then((d) => {
        if (d.perfis?.length) {
          setPerfis(d.perfis)
          if (!d.perfis.some((p) => p.temperament_id === temperamentId)) {
            setTemperamentId(d.perfis[0].temperament_id)
          }
        }
      })
      .catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function gerar() {
    if (!mensagem.trim()) return
    setLoading(true)
    setErro('')
    setResposta('')
    setCopiado(false)
    try {
      const d = await api.perfilComportamental(contexto, mensagem, temperamentId, provider, modelo)
      setResposta(d.resposta)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao gerar resposta')
    } finally {
      setLoading(false)
    }
  }

  async function copiar() {
    if (!resposta) return
    try {
      await navigator.clipboard.writeText(resposta)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Sem permissão de clipboard — o texto já está visível para selecionar manualmente.
    }
  }

  return (
    <div>
      <p className="mb-4 font-mono text-[0.7rem] uppercase tracking-wider text-muted">
        Perfis Comportamentais — cole a mensagem recebida e escolha o tom da resposta que protege seus limites
      </p>

      <p className="mb-2.5 text-[0.75rem] font-medium text-muted">Escolha o perfil comportamental</p>
      <div className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {perfis.map((p) => (
          <button
            key={p.temperament_id}
            onClick={() => setTemperamentId(p.temperament_id)}
            aria-pressed={p.temperament_id === temperamentId}
            className={`rounded-xl border p-3 text-left transition-colors ${
              p.temperament_id === temperamentId
                ? 'border-violet/40 bg-violet/[0.08]'
                : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05]'
            }`}
          >
            <div className="mb-1 flex items-center gap-2 text-[0.85rem] font-semibold text-text">
              <Shield className="h-4 w-4 shrink-0 text-violet" aria-hidden="true" />
              {p.display_name}
            </div>
            <div className="text-[0.76rem] leading-relaxed text-muted">{p.description}</div>
          </button>
        ))}
      </div>

      <ProviderSelect
        providers={providers}
        provider={provider}
        modelo={modelo}
        onProviderChange={trocarProvider}
        onModeloChange={setModelo}
        nenhumConfigurado={nenhumConfigurado}
      />

      <label className="mb-1 block text-[0.72rem] font-medium text-muted">
        Contexto (opcional — o que está acontecendo)
      </label>
      <textarea
        value={contexto}
        onChange={(e) => setContexto(e.target.value)}
        placeholder="Ex: terceira vez que ele some por dias e volta como se nada tivesse acontecido"
        className="glass mb-3 min-h-[70px] w-full rounded-xl p-4 font-mono text-[0.82rem] leading-relaxed text-text outline-none placeholder:text-muted focus:border-violet/40"
      />

      <label className="mb-1 block text-[0.72rem] font-medium text-muted">Mensagem recebida do interlocutor</label>
      <textarea
        value={mensagem}
        onChange={(e) => setMensagem(e.target.value)}
        placeholder='Ex: "desculpa, eu tava passando por um momento difícil, você não entende..."'
        className="glass min-h-[110px] w-full rounded-xl p-4 font-mono text-[0.82rem] leading-relaxed text-text outline-none placeholder:text-muted focus:border-violet/40"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={gerar}
          disabled={loading || !mensagem.trim() || !pronto}
          className="rounded-lg bg-gradient-to-r from-violet to-cyan px-5 py-2.5 text-sm font-semibold text-[#08070c] transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {loading ? 'Formulando…' : 'Gerar resposta'}
        </button>
        <button
          onClick={() => {
            setContexto('')
            setMensagem('')
            setResposta('')
            setErro('')
          }}
          className="rounded-lg border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-text transition-colors hover:bg-white/[0.06]"
        >
          Limpar
        </button>
      </div>

      <div className="mt-6">
        {loading && (
          <div className="flex min-h-[140px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/10 text-muted">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet/30 border-t-violet" />
            <span className="text-[0.82rem]">Formulando uma resposta serena e firme…</span>
          </div>
        )}
        {!loading && erro && (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-rose-400/25 bg-rose-400/10 p-6 text-center text-[0.85rem] text-rose-300">
            <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
            {erro}
          </div>
        )}
        {!loading && !erro && resposta && (
          <div className="glass grad-border overflow-hidden rounded-xl">
            <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.02] px-4 py-3 font-mono text-[0.68rem] uppercase tracking-wider text-muted">
              Resposta pronta para envio
              <button
                onClick={copiar}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[0.72rem] font-medium normal-case tracking-normal text-text transition-colors hover:bg-white/[0.06]"
              >
                {copiado ? (
                  <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {copiado ? 'Copiado' : 'Copiar'}
              </button>
            </div>
            <div className="whitespace-pre-wrap p-5 text-[0.9rem] leading-relaxed text-text">{resposta}</div>
          </div>
        )}
        {!loading && !erro && !resposta && (
          <div className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 text-center text-muted">
            <Shield className="h-6 w-6 opacity-50" aria-hidden="true" />
            <span className="text-[0.82rem]">A resposta pronta para envio aparecerá aqui</span>
          </div>
        )}
      </div>
    </div>
  )
}
