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
  Wrench,
  HelpCircle,
  Network,
  ClipboardCheck,
  LifeBuoy,
  Flame,
  Sprout,
  TrendingUp,
  Rocket,
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
    nome: 'Didático (padrão)',
    icon: Wand,
    descricao: 'Passo a passo, paciente, sempre com analogias',
    exemplo: '"Vamos com calma: pense em few-shot prompting como mostrar 2-3 exemplos resolvidos antes da prova — o modelo aprende o padrão só de ver."',
  },
  {
    id: 'pratico',
    nome: 'Prático',
    icon: Wrench,
    descricao: 'Exemplos reais primeiro, teoria depois',
    exemplo: '"Olha um prompt de verdade: Classifique o e-mail abaixo como spam ou não, com Ex1 e Ex2 já resolvidos. Isso é few-shot. Agora a regra por trás."',
  },
  {
    id: 'socratico',
    nome: 'Socrático',
    icon: HelpCircle,
    descricao: 'Faz perguntas até você chegar na resposta',
    exemplo: '"Antes de eu responder: o que acontece se você der 3 exemplos resolvidos ao modelo em vez de nenhum? O que ele passa a ter que não tinha?"',
  },
  {
    id: 'visual',
    nome: 'Visual',
    icon: Network,
    descricao: 'Diagramas, tabelas e analogias fortes',
    exemplo: '"Pense assim: Instrução → [Ex1 | Ex2 | Ex3] → Nova entrada → Resposta. Os exemplos são os trilhos que guiam o modelo."',
  },
  {
    id: 'academico',
    nome: 'Acadêmico Detalhista',
    icon: GraduationCap,
    descricao: 'Rigor técnico, precisão cirúrgica, cita fonte e página',
    exemplo: '"Antes de prosseguir, uma correção necessária: o termo cunhado por Brown et al. (2020) é \'few-shot learning\', não \'aprendizado rápido\'. Vejamos a definição precisa."',
  },
  {
    id: 'preparatorio',
    nome: 'Preparatório',
    icon: ClipboardCheck,
    descricao: 'Foco em prova: pegadinhas e o que cai',
    exemplo: '"Atenção à pegadinha clássica: few-shot NÃO é fine-tuning. A banca adora trocar os dois. Guarde: few-shot acontece no prompt, sem treinar o modelo."',
  },
  {
    id: 'reforco',
    nome: 'Reforço',
    icon: LifeBuoy,
    descricao: 'Começa do básico, devagar, sem pular etapas',
    exemplo: '"Vamos do comecinho: prompt é o texto que você escreve pro modelo. Só isso. Agora, o que é dar exemplos dentro desse texto?"',
  },
  {
    id: 'desafio',
    nome: 'Desafio',
    icon: Flame,
    descricao: 'Nível alto, nuances e uma tarefa difícil no fim',
    exemplo: '"Few-shot melhora a saída — até certo ponto. Onde está o ponto de saturação e por que exemplos ruins pioram mais do que exemplo nenhum?"',
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

const NIVEIS: PersonaDef[] = [
  {
    id: 'nivel_inicial',
    nome: 'Nível Inicial',
    icon: Sprout,
    descricao: 'Do zero, sem pré-requisitos, só o essencial',
    exemplo: '"Esquece os nomes complicados por enquanto: few-shot é só mostrar exemplos prontos antes de pedir o que você quer. Vamos por partes."',
  },
  {
    id: 'nivel_intermediario',
    nome: 'Nível Intermediário',
    icon: TrendingUp,
    descricao: 'Pula o básico, conecta temas e mostra erros comuns',
    exemplo: '"Você já sabe o que é prompt. O ponto aqui é como os exemplos alteram a distribuição de saída — e por que 2 exemplos bons batem 8 ruins."',
  },
  {
    id: 'nivel_avancado',
    nome: 'Nível Avançado',
    icon: Rocket,
    descricao: 'Mecanismos, trade-offs, limites e quando não usar',
    exemplo: '"O ganho do few-shot vem mais do formato induzido do que do conteúdo dos rótulos. Isso tem implicações diretas em quando ele falha."',
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
  const todas = [...PERSONAS, ...NIVEIS]
  const persona = todas.find((p) => p.id === personaId) ?? PERSONAS[0]

  return (
    <div>
      <div className="mb-5 flex gap-2">
        <button
          onClick={() => setModo('perguntar')}
          className={`flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
            modo === 'perguntar'
              ? 'border-transparent bg-gradient-to-b from-destaque to-destaque-fim font-semibold text-topo'
              : 'border-borda-forte text-texto hover:bg-cartao'
          }`}
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          Perguntar
        </button>
        <button
          onClick={() => setModo('resumir')}
          className={`flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
            modo === 'resumir'
              ? 'border-transparent bg-gradient-to-b from-destaque to-destaque-fim font-semibold text-topo'
              : 'border-borda-forte text-texto hover:bg-cartao'
          }`}
        >
          <BookOpen className="h-4 w-4" aria-hidden="true" />
          Resumir apostila
        </button>
      </div>

      {modo === 'perguntar' ? (
        <>
          {[
            { titulo: 'Personalidade do professor — veja o exemplo antes de clicar', lista: PERSONAS },
            { titulo: 'Ou escolha pelo seu nível no assunto', lista: NIVEIS },
          ].map((grupo) => (
            <div key={grupo.titulo}>
              <p className="rotulo mb-3">
                {grupo.titulo}
              </p>
              <div className="mb-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {grupo.lista.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPersonaId(p.id)}
                    aria-pressed={p.id === personaId}
                    className={`rounded-xl border p-3 text-left transition-colors ${
                      p.id === personaId
                        ? 'border-destaque bg-cartao-hover'
                        : 'border-borda bg-cartao hover:border-borda-forte hover:bg-cartao-hover'
                    }`}
                  >
                    <div className="mb-1 flex items-center gap-2 text-[0.85rem] font-semibold text-texto">
                      <p.icon className="h-4 w-4 shrink-0 text-texto" aria-hidden="true" />
                      <span>{p.nome}</span>
                    </div>
                    <div className="mb-1.5 text-[0.72rem] text-texto-suave">{p.descricao}</div>
                    <div className="text-[0.76rem] italic leading-relaxed text-texto-suave">{p.exemplo}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}

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
