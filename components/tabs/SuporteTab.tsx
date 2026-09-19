'use client'

import { useEffect, useState } from 'react'
import {
  Wrench,
  Lightbulb,
  Rocket,
  Bot,
  Cpu,
  Bug,
  ShieldCheck,
  LifeBuoy,
  TriangleAlert,
  Copy,
  CircleCheck,
  History,
  Trash2,
  Gamepad2,
  Gauge,
  Film,
  Radio,
  Zap,
  Wifi,
  Share2,
  Smartphone,
  type LucideIcon,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useProviderModel } from '@/lib/useProviderModel'
import { useHistorico } from '@/lib/useHistorico'
import type { ProvidersResp, SuportePersona } from '@/lib/types'
import ProviderSelect from '../ProviderSelect'
import AnexoImagem from '../AnexoImagem'
import Markdown from '../Markdown'

const ICONES: Record<string, LucideIcon> = {
  byte: Wrench,
  sam: Lightbulb,
  bolt: Rocket,
  nexus: Bot,
  kernel: Cpu,
  trace: Bug,
  vault: ShieldCheck,
  pixel: Gamepad2,
  frame: Gauge,
  reel: Film,
  live: Radio,
  turbo: Zap,
  ping: Wifi,
  seed: Share2,
  mobi: Smartphone,
}

const AMBIENTE_PADRAO = 'Ex: Windows 11 23H2, notebook Dell, Outlook 365 / ou: EDK II stable202405, OVMF no QEMU 9.0'
const PROBLEMA_PADRAO =
  "Ex: o sistema trava com tela preta logo depois do logo do fabricante; o log serial para em 'Loading driver at ...'"

const PERSONAS_PADRAO: SuportePersona[] = [
  {
    persona_id: 'byte',
    nome: 'Byte',
    display_name: 'O Técnico Pragmático',
    bloco: 'Suporte geral',
    description: 'Direto, analítico e focado em dados — ideal para devs e usuários avançados.',
    exemplo: 'Identifiquei uma falha de autenticação no servidor local.',
    usa_historico: false,
  },
]

export default function SuporteTab({ providers }: { providers: ProvidersResp }) {
  const { provider, modelo, trocarProvider, setModelo, pronto, nenhumConfigurado } = useProviderModel(providers)
  const [personas, setPersonas] = useState<SuportePersona[]>(PERSONAS_PADRAO)
  const [personaId, setPersonaId] = useState('byte')
  const [area, setArea] = useState<string | null>(null)
  const [ambiente, setAmbiente] = useState('')
  const [problema, setProblema] = useState('')
  const [loading, setLoading] = useState(false)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [anexoReset, setAnexoReset] = useState(0)
  const [erro, setErro] = useState('')
  const [resposta, setResposta] = useState('')
  const [usouHistorico, setUsouHistorico] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const { itens: historico, adicionar: adicionarHistorico, limpar: limparHistorico } = useHistorico('suporte')

  useEffect(() => {
    api
      .suportePersonas()
      .then((d) => {
        if (d.personas?.length) {
          setPersonas(d.personas)
          if (!d.personas.some((p) => p.persona_id === personaId)) setPersonaId(d.personas[0].persona_id)
        }
      })
      .catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const personaAtiva = personas.find((p) => p.persona_id === personaId) ?? personas[0]
  const blocos = [...new Set(personas.map((p) => p.bloco))]
  const areaAtiva = area ?? personaAtiva?.bloco ?? blocos[0]

  function escolherArea(b: string) {
    setArea(b)
    const primeira = personas.find((p) => p.bloco === b)
    if (primeira && personaAtiva?.bloco !== b) setPersonaId(primeira.persona_id)
  }

  async function atender() {
    if (!problema.trim()) return
    setLoading(true)
    setErro('')
    setResposta('')
    setCopiado(false)
    try {
      // Os 3 atendimentos mais recentes vão como contexto; o servidor só os usa
      // para a persona que declara `usa_historico`.
      const anteriores = historico
        .slice(0, 3)
        .map((h) => `Problema: ${h.resumo}\nResposta: ${h.resposta.slice(0, 400)}`)
      const d = await api.suporteAtendimento(ambiente, problema, personaId, anteriores, provider, modelo)
      setResposta(d.resposta)
      setUsouHistorico(d.usou_historico)
      adicionarHistorico(d.resposta, problema)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao gerar o atendimento')
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
        Tecnologia — Suporte em TI e IA: escolha a área e o especialista, descreva o ambiente e cole o problema ou o log
      </p>

      <p className="mb-2 text-[0.75rem] font-medium text-muted">Área</p>
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Área do suporte">
        {blocos.map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => escolherArea(b)}
            aria-pressed={b === areaAtiva}
            className={`rounded-full border px-3 py-1 text-[0.76rem] transition-colors ${
              b === areaAtiva
                ? 'border-violet/50 bg-violet/15 text-text'
                : 'border-white/10 bg-white/[0.03] text-muted hover:text-text'
            }`}
          >
            {b}
          </button>
        ))}
      </div>

      {[areaAtiva].map((bloco) => (
        <div key={bloco} className="mb-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {personas
              .filter((p) => p.bloco === bloco)
              .map((p) => {
                const Icone = ICONES[p.persona_id] ?? LifeBuoy
                const ativa = p.persona_id === personaId
                return (
                  <button
                    key={p.persona_id}
                    onClick={() => setPersonaId(p.persona_id)}
                    aria-pressed={ativa}
                    className={`rounded-xl border p-3 text-left transition-colors ${
                      ativa ? 'border-violet/40 bg-violet/[0.08]' : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05]'
                    }`}
                  >
                    <div className="mb-1 flex items-center gap-2 text-[0.85rem] font-semibold text-text">
                      <Icone className="h-4 w-4 shrink-0 text-violet" aria-hidden="true" />
                      {p.nome} <span className="font-normal text-muted">· {p.display_name}</span>
                    </div>
                    <div className="mb-1.5 text-[0.76rem] leading-relaxed text-muted">{p.description}</div>
                    <div className="text-[0.74rem] italic leading-relaxed text-muted/80">&ldquo;{p.exemplo}&rdquo;</div>
                  </button>
                )
              })}
          </div>
        </div>
      ))}

      <ProviderSelect
        providers={providers}
        provider={provider}
        modelo={modelo}
        onProviderChange={trocarProvider}
        onModeloChange={setModelo}
        nenhumConfigurado={nenhumConfigurado}
      />

      <label className="mb-1 block text-[0.72rem] font-medium text-muted">
        Ambiente (sistema, hardware, versões — opcional)
      </label>
      <textarea
        value={ambiente}
        onChange={(e) => setAmbiente(e.target.value)}
        placeholder={personaAtiva?.ambiente_placeholder || AMBIENTE_PADRAO}
        className="glass mb-3 min-h-[70px] w-full rounded-xl p-4 font-mono text-[0.82rem] leading-relaxed text-text outline-none placeholder:text-muted focus:border-violet/40"
      />

      <label className="mb-1 block text-[0.72rem] font-medium text-muted">Problema, mensagem de erro ou log</label>
      <textarea
        value={problema}
        onChange={(e) => setProblema(e.target.value)}
        placeholder={personaAtiva?.problema_placeholder || PROBLEMA_PADRAO}
        className="glass min-h-[130px] w-full rounded-xl p-4 font-mono text-[0.82rem] leading-relaxed text-text outline-none placeholder:text-muted focus:border-violet/40"
      />
      <AnexoImagem
        texto={problema}
        setTexto={setProblema}
        desabilitado={loading}
        onProcessando={setOcrLoading}
        aplicarFormatoAlternativas={false}
        resetToken={anexoReset}
        dica="Print do erro, log (.txt/.log), PDF ou DOCX — o texto entra na caixa acima, com OCR"
      />

      {personaAtiva?.usa_historico && (
        <p className="mt-2 text-[0.72rem] text-muted">
          {personaAtiva.nome} considera os 3 atendimentos mais recentes desta aba para relacionar com problemas anteriores.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={atender}
          disabled={loading || ocrLoading || !problema.trim() || !pronto}
          className="rounded-lg bg-gradient-to-r from-violet to-cyan px-5 py-2.5 text-sm font-semibold text-[#08070c] transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {loading ? 'Diagnosticando…' : `Atender com ${personaAtiva?.nome ?? 'o especialista'}`}
        </button>
        <button
          onClick={() => {
            setAmbiente('')
            setProblema('')
            setAnexoReset((n) => n + 1)
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
            <span className="text-[0.82rem]">{personaAtiva?.nome} está analisando o chamado…</span>
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
              <span>
                Atendimento{usouHistorico ? ' · com histórico' : ''}
              </span>
              <button
                onClick={copiar}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[0.72rem] font-medium normal-case tracking-normal text-text transition-colors hover:bg-white/[0.06]"
              >
                {copiado ? <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                {copiado ? 'Copiado' : 'Copiar'}
              </button>
            </div>
            <div className="p-5">
              <Markdown>{resposta}</Markdown>
            </div>
          </div>
        )}
        {!loading && !erro && !resposta && (
          <div className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 text-center text-muted">
            <LifeBuoy className="h-6 w-6 opacity-50" aria-hidden="true" />
            <span className="text-[0.82rem]">O diagnóstico e os passos de solução aparecerão aqui</span>
          </div>
        )}
      </div>

      {historico.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-mono text-[0.68rem] uppercase tracking-wider text-muted">
              <History className="h-3.5 w-3.5" aria-hidden="true" />
              Atendimentos recentes
            </div>
            <button
              onClick={limparHistorico}
              className="flex items-center gap-1 text-[0.72rem] text-muted transition-colors hover:text-rose-300"
            >
              <Trash2 className="h-3 w-3" aria-hidden="true" />
              Limpar
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            {historico.map((h) => (
              <button
                key={h.id}
                onClick={() => setResposta(h.resposta)}
                className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-left text-[0.78rem] text-muted transition-colors hover:bg-white/[0.05] hover:text-text"
              >
                {h.resumo || h.resposta.slice(0, 140)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
