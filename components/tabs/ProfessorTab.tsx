'use client'

import { useState } from 'react'
import {
  MessageCircle,
  BookOpen,
  Wand,
  GraduationCap,
  Laugh,
  Mic,
  Ruler,
  Globe,
  type LucideIcon,
} from 'lucide-react'
import type { ProvidersResp } from '@/lib/types'
import PerguntarTab from './PerguntarTab'
import ResumoApostilaTab from './ResumoApostilaTab'

interface PersonaDef {
  id: string
  nome: string
  icon: LucideIcon
  descricao: string
  exemplo: string
}

const PERSONAS: PersonaDef[] = [
  {
    id: 'professor',
    nome: 'Padrão',
    icon: Wand,
    descricao: 'Paciente, sempre com analogias e passo a passo',
    exemplo: '"Vamos com calma: pense em few-shot prompting como mostrar 2-3 exemplos resolvidos antes da prova — o modelo aprende o padrão só de ver."',
  },
  {
    id: 'academico',
    nome: 'Acadêmico Detalhista',
    icon: GraduationCap,
    descricao: 'Rigor técnico, precisão cirúrgica, cita fonte e página',
    exemplo: '"Antes de prosseguir, uma correção necessária: o termo cunhado por Brown et al. (2020) é \'few-shot learning\', não \'aprendizado rápido\'. Vejamos a definição precisa."',
  },
  {
    id: 'ironista',
    nome: 'Intelectual Debochado',
    icon: Laugh,
    descricao: 'Sarcasmo refinado, desafia a turma a pensar mais',
    exemplo: '"Ah, few-shot prompting... pergunta clássica de quem não abriu o material. Mas tudo bem, vamos por partes — prometo não repetir duas vezes."',
  },
  {
    id: 'showman',
    nome: 'Orador Magnético',
    icon: Mic,
    descricao: 'Aula-espetáculo, histórias e analogias marcantes',
    exemplo: '"Deixa eu te contar uma história antes: em 2020, uma equipe descobriu algo que mudaria tudo... isso, meu caro, é few-shot prompting em ação."',
  },
  {
    id: 'dogmatico',
    nome: 'Mestre Incontestável',
    icon: Ruler,
    descricao: 'Direcionamento firme, uma única resposta correta',
    exemplo: '"Few-shot prompting funciona exatamente como ensino há anos nesta área. Não há outra forma correta de explicar isso, e minha experiência confirma."',
  },
  {
    id: 'enciclopedico',
    nome: 'Enciclopédico Generalista',
    icon: Globe,
    descricao: 'Conecta o tema com cultura, cinema e atualidades',
    exemplo: '"Few-shot prompting? Isso me lembra como diretores usam referências visuais para guiar um elenco — aliás, isso conecta com semiótica..."',
  },
]

/**
 * "Professor Sabe Tudo" tem dois modos: Perguntar (6 personas possíveis,
 * reaproveitando a mecânica de PerguntarTab) e Resumir apostila (map-reduce
 * sobre um PDF/.docx/.pptx avulso, sem indexar no Supabase).
 */
export default function ProfessorTab({ providers }: { providers: ProvidersResp }) {
  const [modo, setModo] = useState<'perguntar' | 'resumir'>('perguntar')
  const [personaId, setPersonaId] = useState('professor')
  const persona = PERSONAS.find((p) => p.id === personaId) ?? PERSONAS[0]

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
            Escolha a personalidade do professor — veja o exemplo de cada um antes de clicar
          </p>
          <div className="mb-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {PERSONAS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPersonaId(p.id)}
                aria-pressed={p.id === personaId}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  p.id === personaId
                    ? 'border-violet/40 bg-violet/[0.08]'
                    : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05]'
                }`}
              >
                <div className="mb-1 flex items-center gap-2 text-[0.85rem] font-semibold text-text">
                  <p.icon className="h-4 w-4 shrink-0 text-violet" aria-hidden="true" />
                  <span>{p.nome}</span>
                </div>
                <div className="mb-1.5 text-[0.72rem] text-muted">{p.descricao}</div>
                <div className="text-[0.76rem] italic leading-relaxed text-muted/90">{p.exemplo}</div>
              </button>
            ))}
          </div>

          <PerguntarTab
            key={persona.id}
            providers={providers}
            persona={persona.id}
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
