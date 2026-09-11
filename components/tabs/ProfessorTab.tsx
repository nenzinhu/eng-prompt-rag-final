'use client'

import type { ProvidersResp } from '@/lib/types'
import PerguntarTab from './PerguntarTab'

/**
 * "Professor Sabe Tudo" — mesma mecânica de Perguntar (busca vetorial +
 * pergunta livre), só troca a persona do prompt para um tom mais didático e
 * paciente. Nenhuma lógica nova: só reaproveita PerguntarTab com props diferentes.
 */
export default function ProfessorTab({ providers }: { providers: ProvidersResp }) {
  return (
    <PerguntarTab
      providers={providers}
      persona="professor"
      titulo="Professor Sabe Tudo — o mestre do conhecimento do curso, sempre com analogias e passo a passo"
      placeholder="Ex: Não entendi nada de few-shot prompting, pode explicar do zero?"
    />
  )
}
