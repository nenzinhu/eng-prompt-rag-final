'use client'

import { useState } from 'react'
import { api } from '@/lib/api'
import type { ProvidersResp, TermoGlossario } from '@/lib/types'
import ProviderSelect from '../ProviderSelect'

export default function GlossarioTab({ providers }: { providers: ProvidersResp }) {
  const firstProvider = Object.keys(providers)[0] ?? ''
  const [provider, setProvider] = useState(firstProvider)
  const [modelo, setModelo] = useState(providers[firstProvider]?.models?.[0] ?? '')
  const [tema, setTema] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [termos, setTermos] = useState<TermoGlossario[] | null>(null)

  async function gerar() {
    setLoading(true)
    setErro('')
    try {
      const d = await api.glossario(tema, provider, modelo)
      setTermos(d.termos)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao gerar glossário')
      setTermos(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <p className="mb-4 font-mono text-[0.7rem] uppercase tracking-wider text-muted">
        Sumário de termos técnicos das apostilas, explicados de forma simples
      </p>
      <ProviderSelect
        providers={providers}
        provider={provider}
        modelo={modelo}
        onProviderChange={setProvider}
        onModeloChange={setModelo}
      />
      <input
        value={tema}
        onChange={(e) => setTema(e.target.value)}
        placeholder="Opcional: foque num assunto (ex: few-shot prompting, RAG, embeddings...)"
        className="glass w-full rounded-xl p-3.5 font-mono text-[0.82rem] text-text outline-none placeholder:text-muted focus:border-violet/40"
      />
      <div className="mt-3 flex gap-2">
        <button
          onClick={gerar}
          disabled={loading}
          className="rounded-lg bg-gradient-to-r from-violet to-cyan px-5 py-2.5 text-sm font-semibold text-[#08070c] transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {loading ? 'Gerando…' : 'Gerar sumário'}
        </button>
        {termos && termos.length > 0 && (
          <button
            onClick={() => {
              setTermos(null)
              setTema('')
              setErro('')
            }}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-text transition-colors hover:bg-white/[0.06]"
          >
            Limpar
          </button>
        )}
      </div>

      <div className="mt-6">
        {loading && (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/10 text-muted">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet/30 border-t-violet" />
            <span className="text-[0.82rem]">Lendo o material e identificando termos técnicos…</span>
          </div>
        )}
        {!loading && erro && (
          <div className="rounded-xl border border-rose-400/25 bg-rose-400/10 p-6 text-center text-[0.85rem] text-rose-300">
            ⚠️ {erro}
          </div>
        )}
        {!loading && !erro && termos && termos.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-muted">
            <p className="text-[0.82rem]">Não encontrei termos técnicos claros nesse trecho do material.</p>
          </div>
        )}
        {!loading && !erro && termos && termos.length > 0 && (
          <div className="flex flex-col gap-2">
            {termos.map((t, i) => (
              <div key={i} className="glass rounded-xl p-4">
                <div className="mb-1 font-mono text-[0.8rem] font-semibold text-cyan">{t.termo}</div>
                <div className="text-[0.85rem] leading-relaxed text-text">{t.explicacao}</div>
              </div>
            ))}
          </div>
        )}
        {!loading && !erro && !termos && (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 text-center text-muted">
            <span className="text-2xl opacity-50">📖</span>
            <span className="text-[0.82rem]">O sumário de termos aparecerá aqui</span>
          </div>
        )}
      </div>
    </div>
  )
}
