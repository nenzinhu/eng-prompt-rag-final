'use client'

import { useEffect, useState } from 'react'
import {
  Crosshair,
  Presentation,
  Lightbulb,
  Shapes,
  Sigma,
  ClipboardCheck,
  Brain,
  TriangleAlert,
  Compass,
  Sprout,
  GraduationCap,
  Copy,
  CircleCheck,
  History,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useRequisicao } from '@/lib/useRequisicao'
import { useProviderModel } from '@/lib/useProviderModel'
import { useHistorico } from '@/lib/useHistorico'
import type { ProvidersResp, ProfessorPersona } from '@/lib/types'
import ProviderSelect from '../ProviderSelect'
import Markdown from '../Markdown'

const ICONES: Record<string, LucideIcon> = {
  reto: Crosshair,
  clara: Presentation,
  caso: Lightbulb,
  analogia: Shapes,
  rigoroso: Sigma,
  banca: ClipboardCheck,
  memo: Brain,
  porem: TriangleAlert,
  cronos: Compass,
  zero: Sprout,
}

// Mesmo teto do servidor (MAX_PERGUNTA_PROFESSOR): avisa antes de enviar.
const MAX_PERGUNTA = 2000

const PERSONAS_PADRAO: ProfessorPersona[] = [
  {
    persona_id: 'reto',
    nome: 'Prof. Reto',
    display_name: 'O Objetivo',
    description: 'Só a resposta, em uma ou duas frases. Zero enfeite.',
    exemplo: 'Mitocôndria produz ATP pela respiração celular.',
  },
]

/**
 * Aba "Professores": o aluno escolhe uma de 10 personalidades e recebe uma
 * resposta cirúrgica, só com o conhecimento do modelo — sem busca na apostila.
 */
export default function ProfessoresTab({ providers }: { providers: ProvidersResp }) {
  const { provider, modelo, trocarProvider, setModelo, pronto, nenhumConfigurado } = useProviderModel(providers)
  const [personas, setPersonas] = useState<ProfessorPersona[]>(PERSONAS_PADRAO)
  const [personaId, setPersonaId] = useState('reto')
  const [pergunta, setPergunta] = useState('')
  // Quem respondeu a resposta exibida (pode ser diferente do professor selecionado agora).
  const [autor, setAutor] = useState('')
  const [copiado, setCopiado] = useState(false)
  const { dados: resposta, setDados: setResposta, carregando, erro, setErro, executar } = useRequisicao('')
  const { itens: historico, adicionar: adicionarHistorico, limpar: limparHistorico } = useHistorico('professores')

  useEffect(() => {
    api
      .professorPersonas()
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
  const longaDemais = pergunta.length > MAX_PERGUNTA
  const podeEnviar = !carregando && !!pergunta.trim() && !longaDemais && pronto

  async function perguntar() {
    if (!podeEnviar || !personaAtiva) return
    setResposta('')
    setCopiado(false)
    const nome = personaAtiva.nome
    const texto = await executar(
      () => api.professorResponder(pergunta.trim(), personaAtiva.persona_id, provider, modelo).then((d) => d.resposta),
      'Erro ao obter a resposta',
    )
    if (texto) {
      setAutor(nome)
      adicionarHistorico(texto, `${nome}: ${pergunta.trim()}`)
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
        Professores — escolha quem responde e faça a pergunta. Resposta direta, sem consultar a apostila
      </p>

      <p className="mb-2.5 text-[0.75rem] font-medium text-muted">Escolha o professor</p>
      <div className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-2" role="group" aria-label="Professores">
        {personas.map((p) => {
          const Icone = ICONES[p.persona_id] ?? GraduationCap
          const ativa = p.persona_id === personaId
          return (
            <button
              key={p.persona_id}
              type="button"
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
              {/* No celular o exemplo sai: 10 cartões já empurram a caixa de pergunta para baixo. */}
              <div className="hidden text-[0.74rem] italic leading-relaxed text-muted/80 sm:block">&ldquo;{p.exemplo}&rdquo;</div>
            </button>
          )
        })}
      </div>

      <ProviderSelect
        providers={providers}
        provider={provider}
        modelo={modelo}
        onProviderChange={trocarProvider}
        onModeloChange={setModelo}
        nenhumConfigurado={nenhumConfigurado}
      />

      <label htmlFor="professor-pergunta" className="mb-1 block text-[0.72rem] font-medium text-muted">
        Sua pergunta
      </label>
      <textarea
        id="professor-pergunta"
        value={pergunta}
        onChange={(e) => setPergunta(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            perguntar()
          }
        }}
        placeholder="Ex: Qual a diferença entre prescrição e decadência?"
        aria-describedby="professor-pergunta-dica"
        aria-invalid={longaDemais}
        className="glass min-h-[110px] w-full rounded-xl p-4 font-mono text-[0.82rem] leading-relaxed text-text outline-none placeholder:text-muted focus:border-violet/40"
      />
      <p
        id="professor-pergunta-dica"
        className={`mt-1 text-[0.72rem] ${longaDemais ? 'text-rose-300' : 'text-muted'}`}
      >
        {longaDemais
          ? `Pergunta longa demais: ${pergunta.length}/${MAX_PERGUNTA} caracteres.`
          : 'Uma pergunta por vez. Ctrl+Enter envia.'}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={perguntar}
          disabled={!podeEnviar}
          className="rounded-lg bg-gradient-to-r from-violet to-cyan px-5 py-2.5 text-sm font-semibold text-[#08070c] transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {carregando ? 'Respondendo…' : `Perguntar a ${personaAtiva?.nome ?? 'o professor'}`}
        </button>
        <button
          type="button"
          onClick={() => {
            setPergunta('')
            setResposta('')
            setErro('')
          }}
          className="rounded-lg border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-text transition-colors hover:bg-white/[0.06]"
        >
          Limpar
        </button>
      </div>

      <div className="mt-6" aria-live="polite">
        {carregando && (
          <div className="flex min-h-[140px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/10 text-muted">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet/30 border-t-violet" />
            <span className="text-[0.82rem]">{personaAtiva?.nome} está respondendo…</span>
          </div>
        )}
        {!carregando && erro && (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-rose-400/25 bg-rose-400/10 p-6 text-center text-[0.85rem] text-rose-300">
            <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
            {erro}
          </div>
        )}
        {!carregando && !erro && resposta && (
          <div className="glass grad-border overflow-hidden rounded-xl">
            <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.02] px-4 py-3 font-mono text-[0.68rem] uppercase tracking-wider text-muted">
              <span>Resposta{autor ? ` · ${autor}` : ''}</span>
              <button
                type="button"
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
        {!carregando && !erro && !resposta && (
          <div className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 text-center text-muted">
            <GraduationCap className="h-6 w-6 opacity-50" aria-hidden="true" />
            <span className="text-[0.82rem]">A resposta do professor aparecerá aqui</span>
          </div>
        )}
      </div>

      {historico.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-mono text-[0.68rem] uppercase tracking-wider text-muted">
              <History className="h-3.5 w-3.5" aria-hidden="true" />
              Perguntas recentes
            </div>
            <button
              type="button"
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
                type="button"
                onClick={() => {
                  setErro('')
                  setResposta(h.resposta)
                  setAutor(h.resumo.split(':')[0])
                }}
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
