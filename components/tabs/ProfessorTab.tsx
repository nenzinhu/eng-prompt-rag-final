'use client'

import { useState } from 'react'
import type { ProvidersResp } from '@/lib/types'
import PerguntarTab from './PerguntarTab'
import ResumoApostilaTab from './ResumoApostilaTab'

/**
 * "Professor Sabe Tudo" tem dois modos: Perguntar (reaproveita a mecânica de
 * PerguntarTab com uma persona mais didática) e Resumir apostila (map-reduce
 * sobre um PDF/.docx/.pptx avulso, sem indexar no Supabase).
 */
export default function ProfessorTab({ providers }: { providers: ProvidersResp }) {
  const [modo, setModo] = useState<'perguntar' | 'resumir'>('perguntar')

  return (
    <div>
      <div className="mb-5 flex gap-2">
        <button
          onClick={() => setModo('perguntar')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            modo === 'perguntar'
              ? 'bg-gradient-to-r from-violet to-cyan text-[#08070c]'
              : 'border border-white/10 bg-white/[0.03] text-text hover:bg-white/[0.06]'
          }`}
        >
          💬 Perguntar
        </button>
        <button
          onClick={() => setModo('resumir')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            modo === 'resumir'
              ? 'bg-gradient-to-r from-violet to-cyan text-[#08070c]'
              : 'border border-white/10 bg-white/[0.03] text-text hover:bg-white/[0.06]'
          }`}
        >
          📚 Resumir apostila
        </button>
      </div>

      {modo === 'perguntar' ? (
        <PerguntarTab
          providers={providers}
          persona="professor"
          titulo="Professor Sabe Tudo — o mestre do conhecimento do curso, sempre com analogias e passo a passo"
          placeholder="Ex: Não entendi nada de few-shot prompting, pode explicar do zero?"
        />
      ) : (
        <ResumoApostilaTab providers={providers} />
      )}
    </div>
  )
}
