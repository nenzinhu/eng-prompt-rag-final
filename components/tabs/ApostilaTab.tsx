'use client'

import { useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { useProviderModel } from '@/lib/useProviderModel'
import type { ProvidersResp } from '@/lib/types'
import ProviderSelect from '../ProviderSelect'

export default function ApostilaTab({ providers }: { providers: ProvidersResp }) {
  const { provider, modelo, trocarProvider, setModelo, pronto, nenhumConfigurado } = useProviderModel(providers)
  const [tema, setTema] = useState('')
  const [formato, setFormato] = useState<'pdf' | 'docx'>('pdf')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState(false)

  async function gerar() {
    if (!tema.trim()) return
    setLoading(true)
    setErro('')
    setOk(false)
    try {
      await api.gerarApostila(tema.trim(), formato, provider, modelo)
      setOk(true)
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Erro ao gerar apostila')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <p className="mb-4 font-mono text-[0.7rem] uppercase tracking-wider text-muted">
        Gerador de Apostilas — diga o tema e a IA escreve uma apostila completa cobrindo o assunto,
        pronta para baixar em PDF ou Word
      </p>
      <ProviderSelect
        providers={providers}
        provider={provider}
        modelo={modelo}
        onProviderChange={trocarProvider}
        onModeloChange={setModelo}
        nenhumConfigurado={nenhumConfigurado}
      />
      <textarea
        value={tema}
        onChange={(e) => setTema(e.target.value)}
        placeholder="Ex: Chain-of-thought prompting, Fundamentos de few-shot learning, Segurança em prompts..."
        className="glass min-h-[90px] w-full rounded-xl p-4 font-mono text-[0.82rem] leading-relaxed text-text outline-none placeholder:text-muted focus:border-violet/40"
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          <button
            onClick={() => setFormato('pdf')}
            className={`rounded-lg px-3.5 py-2 text-[0.82rem] font-medium transition-colors ${
              formato === 'pdf'
                ? 'bg-gradient-to-r from-violet to-cyan text-[#08070c]'
                : 'border border-white/10 bg-white/[0.03] text-text hover:bg-white/[0.06]'
            }`}
          >
            📄 PDF
          </button>
          <button
            onClick={() => setFormato('docx')}
            className={`rounded-lg px-3.5 py-2 text-[0.82rem] font-medium transition-colors ${
              formato === 'docx'
                ? 'bg-gradient-to-r from-violet to-cyan text-[#08070c]'
                : 'border border-white/10 bg-white/[0.03] text-text hover:bg-white/[0.06]'
            }`}
          >
            📝 Word (.docx)
          </button>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          onClick={gerar}
          disabled={loading || !tema.trim() || !pronto}
          className="rounded-lg bg-gradient-to-r from-violet to-cyan px-5 py-2.5 text-sm font-semibold text-[#08070c] transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {loading ? 'Escrevendo apostila…' : 'Gerar apostila'}
        </button>
      </div>

      <div className="mt-6">
        {loading && (
          <div className="flex min-h-[160px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/10 text-muted">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet/30 border-t-violet" />
            <span className="text-[0.82rem]">Pesquisando o material e escrevendo a apostila…</span>
          </div>
        )}
        {!loading && erro && (
          <div className="rounded-xl border border-rose-400/25 bg-rose-400/10 p-6 text-center text-[0.85rem] text-rose-300">
            ⚠️ {erro}
          </div>
        )}
        {!loading && !erro && ok && (
          <div className="rounded-xl border border-cyan/25 bg-cyan/10 p-6 text-center text-[0.85rem] text-cyan">
            ✅ Apostila gerada — o download deve ter começado automaticamente.
          </div>
        )}
        {!loading && !erro && !ok && (
          <div className="flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 text-center text-muted">
            <span className="text-2xl opacity-50">📘</span>
            <span className="text-[0.82rem]">A apostila gerada será baixada automaticamente</span>
          </div>
        )}
      </div>
    </div>
  )
}
