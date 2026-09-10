'use client'

import { useState } from 'react'
import { api } from '@/lib/api'
import type { ProvidersResp, PerguntarResp } from '@/lib/types'
import ProviderSelect from '../ProviderSelect'
import EvidenceList from '../EvidenceList'
import WarnBanner from '../WarnBanner'
import Markdown from '../Markdown'

export default function PerguntarTab({ providers }: { providers: ProvidersResp }) {
  const firstProvider = Object.keys(providers)[0] ?? ''
  const [provider, setProvider] = useState(firstProvider)
  const [modelo, setModelo] = useState(providers[firstProvider]?.models?.[0] ?? '')
  const [pergunta, setPergunta] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [resultado, setResultado] = useState<PerguntarResp | null>(null)

  async function enviar() {
    if (!pergunta.trim()) return
    setLoading(true)
    setErro('')
    try {
      const d = await api.perguntar(pergunta, provider, modelo)
      setResultado(d)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao gerar resposta')
      setResultado(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <p className="mb-4 font-mono text-[0.7rem] uppercase tracking-wider text-muted">
        Pergunta livre — resposta gerada pela IA com base nas apostilas
      </p>
      <ProviderSelect
        providers={providers}
        provider={provider}
        modelo={modelo}
        onProviderChange={setProvider}
        onModeloChange={setModelo}
      />
      <textarea
        value={pergunta}
        onChange={(e) => setPergunta(e.target.value)}
        placeholder="Ex: Como funciona few-shot prompting? Me mostra um exemplo em Python."
        className="glass min-h-[120px] w-full rounded-xl p-4 font-mono text-[0.82rem] leading-relaxed text-text outline-none placeholder:text-muted focus:border-violet/40"
      />
      <div className="mt-3 flex gap-2">
        <button
          onClick={enviar}
          disabled={loading}
          className="rounded-lg bg-gradient-to-r from-violet to-cyan px-5 py-2.5 text-sm font-semibold text-[#08070c] transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {loading ? 'Pensando…' : 'Perguntar'}
        </button>
        <button
          onClick={() => {
            setPergunta('')
            setResultado(null)
            setErro('')
          }}
          className="rounded-lg border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-text transition-colors hover:bg-white/[0.06]"
        >
          Limpar
        </button>
      </div>

      <div className="mt-6">
        {loading && (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/10 text-muted">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet/30 border-t-violet" />
            <span className="text-[0.82rem]">Buscando no material e gerando resposta…</span>
          </div>
        )}
        {!loading && erro && (
          <div className="rounded-xl border border-rose-400/25 bg-rose-400/10 p-6 text-center text-[0.85rem] text-rose-300">
            ⚠️ {erro}
          </div>
        )}
        {!loading && !erro && resultado && (
          <div className="glass grad-border rounded-xl overflow-hidden">
            <div className="border-b border-white/[0.06] bg-white/[0.02] px-4 py-3 font-mono text-[0.68rem] uppercase tracking-wider text-muted">
              Resposta — {resultado.provider} / {resultado.modelo}
            </div>
            <div className="p-5">
              {resultado.pouco_embasado && <WarnBanner confianca={resultado.confianca_media} />}
              <div className="mb-4">
                <Markdown>{resultado.resposta}</Markdown>
              </div>
              <EvidenceList items={resultado.contexto} />
            </div>
          </div>
        )}
        {!loading && !erro && !resultado && (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 text-center text-muted">
            <span className="text-2xl opacity-50">💬</span>
            <span className="text-[0.82rem]">A resposta da IA aparecerá aqui</span>
          </div>
        )}
      </div>
    </div>
  )
}
