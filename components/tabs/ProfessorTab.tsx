'use client'

import { useEffect, useState } from 'react'
import {
  MessageCircle,
  BookOpen,
  Wand,
  Layers,
  ArrowLeftRight,
  GraduationCap,
  Laugh,
  Mic,
  Ruler,
  Globe,
  Wrench,
  HelpCircle,
  Network,
  ClipboardCheck,
  Flame,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { api } from '@/lib/api'
import type { ProfessorPersona, ProvidersResp } from '@/lib/types'
import PerguntarTab from './PerguntarTab'
import ResumoApostilaTab from './ResumoApostilaTab'

/** Ícone é detalhe de tela: o resto da persona vem de /api/professor-personas. */
const ICONES: Record<string, LucideIcon> = {
  professor: Wand,
  tres_camadas: Layers,
  antes_depois: ArrowLeftRight,
  pratico: Wrench,
  socratico: HelpCircle,
  visual: Network,
  academico: GraduationCap,
  preparatorio: ClipboardCheck,
  desafio: Flame,
  ironista: Laugh,
  showman: Mic,
  dogmatico: Ruler,
  enciclopedico: Globe,
}

// Enquanto a lista carrega (ou se a rota falhar) a aba continua usável com o
// Didático. Só ele: a lista completa mora no backend, não duplicada aqui.
const RESERVA: ProfessorPersona[] = [
  {
    persona_id: 'professor',
    nome: 'Didático',
    descricao: 'Passo a passo, com analogia antes de cada termo técnico',
    exemplo: '',
  },
]

/**
 * "Professor Sabe Tudo" tem dois modos: Perguntar (uma das personalidades,
 * reaproveitando a mecânica de PerguntarTab) e Resumir apostila (map-reduce
 * sobre um PDF/.docx/.pptx avulso, sem indexar no Supabase).
 */
export default function ProfessorTab({ providers }: { providers: ProvidersResp }) {
  const [modo, setModo] = useState<'perguntar' | 'resumir'>('perguntar')
  const [personas, setPersonas] = useState<ProfessorPersona[]>(RESERVA)
  const [personaId, setPersonaId] = useState('professor')

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

  const persona = personas.find((p) => p.persona_id === personaId) ?? personas[0]

  return (
    <div>
      <div className="mb-5 flex gap-2">
        <button
          onClick={() => setModo('perguntar')}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            modo === 'perguntar'
              ? 'bg-gradient-to-r from-violet to-cyan text-[#08070c]'
              : 'border border-white/10 bg-white/[0.03] text-text hover:bg-white/[0.06]'
          }`}
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          Perguntar
        </button>
        <button
          onClick={() => setModo('resumir')}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            modo === 'resumir'
              ? 'bg-gradient-to-r from-violet to-cyan text-[#08070c]'
              : 'border border-white/10 bg-white/[0.03] text-text hover:bg-white/[0.06]'
          }`}
        >
          <BookOpen className="h-4 w-4" aria-hidden="true" />
          Resumir apostila
        </button>
      </div>

      {modo === 'perguntar' ? (
        <>
          <p className="mb-3 font-mono text-[0.7rem] uppercase tracking-wider text-muted">
            Personalidade do professor — cada uma organiza a resposta de um jeito; veja o exemplo antes de clicar
          </p>
          <div className="mb-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {personas.map((p) => {
              const Icone = ICONES[p.persona_id] ?? Sparkles
              return (
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
                    <Icone className="h-4 w-4 shrink-0 text-violet" aria-hidden="true" />
                    <span>{p.nome}</span>
                  </div>
                  <div className="mb-1.5 text-[0.72rem] text-muted">{p.descricao}</div>
                  {p.exemplo && (
                    <div className="text-[0.76rem] italic leading-relaxed text-muted/90">{p.exemplo}</div>
                  )}
                </button>
              )
            })}
          </div>

          <PerguntarTab
            key={persona.persona_id}
            providers={providers}
            persona={persona.persona_id}
            titulo={`Professor Sabe Tudo — ${persona.nome}: ${persona.descricao}`}
            placeholder="Ex: Não entendi nada de few-shot prompting, pode explicar do zero?"
          />
        </>
      ) : (
        <ResumoApostilaTab providers={providers} />
      )}
    </div>
  )
}
