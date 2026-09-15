'use client'

import { useEffect, useState } from 'react'
import { PartyPopper, TriangleAlert, Copy, CircleCheck } from 'lucide-react'
import { api } from '@/lib/api'
import { useProviderModel } from '@/lib/useProviderModel'
import type { ProvidersResp, ElencoPersona } from '@/lib/types'
import ProviderSelect from '../ProviderSelect'

const PERSONAS_PADRAO: ElencoPersona[] = [
  {
    persona_id: 'debatedor',
    display_name: 'O Debatedor',
    description: 'Puxa uma discussão animada (futebol, séries, "quem venceria") sem ofender.',
    contexto_label: 'Contexto (grupo, amizade, o que rolou)',
    contexto_placeholder: 'Ex: grupo de amigos do trabalho, hoje teve clássico de futebol',
    mensagem_label: 'Última mensagem recebida (opcional)',
    mensagem_placeholder: 'Ex: (deixe em branco para puxar assunto do zero)',
  },
]

export default function ElencoTab({ providers }: { providers: ProvidersResp }) {
  const { provider, modelo, trocarProvider, setModelo, pronto, nenhumConfigurado } = useProviderModel(providers)
  const [personas, setPersonas] = useState<ElencoPersona[]>(PERSONAS_PADRAO)
  const [personaId, setPersonaId] = useState('debatedor')
  const [contexto, setContexto] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [resposta, setResposta] = useState('')
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    api
      .elencoPersonas()
      .then((d) => {
        if (d.personas?.length) {
          setPersonas(d.personas)
          if (!d.personas.some((p) => p.persona_id === personaId)) {
            setPersonaId(d.personas[0].persona_id)
          }
        }
      })
      .catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const personaAtiva = personas.find((p) => p.persona_id === personaId) ?? personas[0]

  async function gerar() {
    if (!contexto.trim() && !mensagem.trim()) return
    setLoading(true)
    setErro('')
    setResposta('')
    setCopiado(false)
    try {
      const d = await api.elencoConversa(contexto, mensagem, personaId, provider, modelo)
      setResposta(d.resposta)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao gerar mensagem')
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
        Elenco — escolha a personalidade e receba uma mensagem com gancho de assunto pronta para
        mandar no WhatsApp, Instagram ou onde quer que a conversa esteja
      </p>

      <p className="mb-2.5 text-[0.75rem] font-medium text-muted">Escolha a persona</p>
      <div className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {personas.map((p) => (
          <button
            key={p.persona_id}
            onClick={() => setPersonaId(p.persona_id)}
            aria-pressed={p.persona_id === personaId}
            className={`rounded-xl border p-3 text-left transition-colors ${
              p.persona_id === personaId
                ? 'border-violet/40 bg-violet/[0.08]'
                : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05]'
            }`}
          >
            <div className="mb-1 flex items-center gap-2 text-[0.85rem] font-semibold text-text">
              <PartyPopper className="h-4 w-4 shrink-0 text-violet" aria-hidden="true" />
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
        {personaAtiva?.contexto_label ?? 'Contexto'}
      </label>
      <textarea
        value={contexto}
        onChange={(e) => setContexto(e.target.value)}
        placeholder={personaAtiva?.contexto_placeholder}
        className="glass mb-3 min-h-[70px] w-full rounded-xl p-4 font-mono text-[0.82rem] leading-relaxed text-text outline-none placeholder:text-muted focus:border-violet/40"
      />

      <label className="mb-1 block text-[0.72rem] font-medium text-muted">
        {personaAtiva?.mensagem_label ?? 'Última mensagem recebida'}
      </label>
      <textarea
        value={mensagem}
        onChange={(e) => setMensagem(e.target.value)}
        placeholder={personaAtiva?.mensagem_placeholder}
        className="glass min-h-[110px] w-full rounded-xl p-4 font-mono text-[0.82rem] leading-relaxed text-text outline-none placeholder:text-muted focus:border-violet/40"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={gerar}
          disabled={loading || (!contexto.trim() && !mensagem.trim()) || !pronto}
          className="rounded-lg bg-gradient-to-r from-violet to-cyan px-5 py-2.5 text-sm font-semibold text-[#08070c] transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {loading ? 'Puxando assunto…' : 'Gerar mensagem'}
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
            <span className="text-[0.82rem]">Puxando um assunto que engaja…</span>
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
              Mensagem pronta para envio
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
            <PartyPopper className="h-6 w-6 opacity-50" aria-hidden="true" />
            <span className="text-[0.82rem]">A mensagem sugerida aparecerá aqui</span>
          </div>
        )}
      </div>
    </div>
  )
}
