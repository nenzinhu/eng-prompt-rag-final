'use client'

import { useEffect, useState } from 'react'
import {
  MessageCircle,
  ScrollText,
  BookOpen,
  Scale,
  Search,
  Target,
  Library,
  FileStack,
  FileArchive,
  Shield,
  PartyPopper,
  LifeBuoy,
  FlaskConical,
  House,
  NotebookPen,
  Layers,
  ClipboardCheck,
  GraduationCap,
} from 'lucide-react'
import { api, EVENTO_SESSAO_EXPIRADA } from '@/lib/api'
import { limparTokenAdmin } from '@/lib/admin'
import type { ProvidersResp } from '@/lib/types'
import Header from '@/components/Header'
import Login from '@/components/Login'
import TabNav, { type TabDef } from '@/components/TabNav'
import TabPanel from '@/components/TabPanel'
import PaletaComandos from '@/components/PaletaComandos'
import HojeTab from '@/components/tabs/HojeTab'
import EstudarTab from '@/components/tabs/EstudarTab'
import ResumoApostilaTab from '@/components/tabs/ResumoApostilaTab'
import MeTestaTab from '@/components/tabs/MeTestaTab'
import CadernoTab from '@/components/tabs/CadernoTab'
import FlashcardsTab from '@/components/tabs/FlashcardsTab'
import LaboratorioTab from '@/components/tabs/LaboratorioTab'
import BuscarTab from '@/components/tabs/BuscarTab'
import ResolverTab from '@/components/tabs/ResolverTab'
import CompararTab from '@/components/tabs/CompararTab'
import PdfsTab from '@/components/tabs/PdfsTab'
import GlossarioTab from '@/components/tabs/GlossarioTab'
import ComprimirTab from '@/components/tabs/ComprimirTab'
import ApostilaTab from '@/components/tabs/ApostilaTab'
import PerfisComportamentaisTab from '@/components/tabs/PerfisComportamentaisTab'
import ElencoMainTab from '@/components/tabs/ElencoMainTab'
import SuporteTab from '@/components/tabs/SuporteTab'
import ProfessoresTab from '@/components/tabs/ProfessoresTab'

// Organização do mapa "de 14 abas para 3": Hoje diz o que estudar; Estudar,
// Praticar e Material são o caminho do estudo; o resto fica em Mais.
const TABS: TabDef[] = [
  { id: 'hoje', grupo: 'Hoje', label: 'O que estudar agora', labelShort: 'Hoje', icon: House },
  { id: 'perguntar', grupo: 'Estudar', label: 'Conversa com a apostila', labelShort: 'Conversa', icon: MessageCircle },
  { id: 'professores', grupo: 'Estudar', label: 'Professores', labelShort: 'Professores', icon: GraduationCap },
  { id: 'testar', grupo: 'Praticar', label: 'Me testa', labelShort: 'Me testa', icon: Target },
  { id: 'erros', grupo: 'Praticar', label: 'Caderno de erros', labelShort: 'Erros', icon: NotebookPen },
  { id: 'flashcards', grupo: 'Praticar', label: 'Flashcards', labelShort: 'Flashcards', icon: Layers },
  { id: 'resolver', grupo: 'Praticar', label: 'Resolver questão', labelShort: 'Resolver', icon: ClipboardCheck },
  { id: 'pdfs', grupo: 'Material', label: 'Minhas apostilas', labelShort: 'Apostilas', icon: FileStack },
  { id: 'buscar', grupo: 'Material', label: 'Buscar no material', labelShort: 'Buscar', icon: Search },
  { id: 'glossario', grupo: 'Material', label: 'Glossário', labelShort: 'Glossário', icon: Library },
  { id: 'resumir', grupo: 'Material', label: 'Resumir apostila', labelShort: 'Resumir', icon: ScrollText },
  { id: 'apostila', grupo: 'Mais', label: 'Criar apostila', labelShort: 'Criar', icon: BookOpen },
  { id: 'comparar', grupo: 'Mais', label: 'Comparar modelos', labelShort: 'Comparar', icon: Scale },
  { id: 'laboratorio', grupo: 'Mais', label: 'Laboratório de prompts', labelShort: 'Laboratório', icon: FlaskConical },
  { id: 'comprimir', grupo: 'Mais', label: 'Comprimir arquivos', labelShort: 'Comprimir', icon: FileArchive },
  { id: 'perfis-comportamentais', grupo: 'Mais', label: 'Perfis de resposta', labelShort: 'Respostas', icon: Shield },
  { id: 'elenco', grupo: 'Mais', label: 'Elenco', labelShort: 'Elenco', icon: PartyPopper },
  { id: 'suporte', grupo: 'Mais', label: 'Suporte de TI', labelShort: 'Suporte', icon: LifeBuoy },
]

export default function Home() {
  const [active, setActive] = useState('hoje')
  const [providers, setProviders] = useState<ProvidersResp>({})
  const [statusTick, setStatusTick] = useState(0)
  const [glossarioSeed, setGlossarioSeed] = useState({ texto: '', tick: 0 })
  const [perguntaSeed, setPerguntaSeed] = useState({ texto: '', tick: 0 })
  const [testeSeed, setTesteSeed] = useState({ tema: '', tick: 0 })
  const [modoSeed, setModoSeed] = useState<{ modo: 'feynman'; tick: number }>({ modo: 'feynman', tick: 0 })
  // 'verificando' até o servidor dizer se o app é privado; 'login' mostra a
  // tela de entrada no lugar do app inteiro.
  const [acesso, setAcesso] = useState<'verificando' | 'liberado' | 'login'>('verificando')
  const [privado, setPrivado] = useState(false)

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [active])

  function perguntarNaConversa(texto: string) {
    setPerguntaSeed((s) => ({ texto, tick: s.tick + 1 }))
    setActive('perguntar')
  }

  function testarSobre(tema: string) {
    setTesteSeed((s) => ({ tema, tick: s.tick + 1 }))
    setActive('testar')
  }

  /** Destinos da tela Hoje: abas, ou o modo Feynman dentro de Estudar. */
  function irPara(destino: string) {
    if (destino === 'feynman') {
      setModoSeed((s) => ({ modo: 'feynman', tick: s.tick + 1 }))
      setActive('perguntar')
      return
    }
    setActive(destino)
  }

  function enviarParaGlossario(texto: string) {
    setGlossarioSeed((s) => ({ texto, tick: s.tick + 1 }))
    setActive('glossario')
  }

  useEffect(() => {
    api
      .sessao()
      .then((s) => {
        setPrivado(s.privado)
        setAcesso(s.logado ? 'liberado' : 'login')
      })
      // Backend antigo (sem /api/sessao) ou fora do ar: segue como antes, e
      // cada aba mostra o próprio erro.
      .catch(() => setAcesso('liberado'))
    const expirou = () => setAcesso('login')
    window.addEventListener(EVENTO_SESSAO_EXPIRADA, expirou)
    return () => window.removeEventListener(EVENTO_SESSAO_EXPIRADA, expirou)
  }, [])

  useEffect(() => {
    if (acesso !== 'liberado') return
    api
      .providers()
      .then(setProviders)
      .catch(() => setProviders({}))
  }, [acesso])

  async function sair() {
    limparTokenAdmin()
    try {
      await api.sair()
    } finally {
      setAcesso('login')
    }
  }

  if (acesso === 'verificando') return null
  if (acesso === 'login') return <Login onEntrou={() => setAcesso('liberado')} />

  return (
    <>
      <Header refreshSignal={statusTick} onSair={privado ? sair : undefined} />
      <TabNav tabs={TABS} active={active} onChange={setActive} />
      <PaletaComandos tabs={TABS} onIr={setActive} onPerguntar={perguntarNaConversa} onTestar={testarSobre} />
      <main className="relative mx-auto max-w-[1120px] px-5 pb-20 pt-8 sm:px-8 sm:pt-10">
        <div className="relative">
          <TabPanel id="hoje" active={active === 'hoje'}>
            <HojeTab ativo={active === 'hoje'} onPerguntar={perguntarNaConversa} onTestar={testarSobre} onIr={irPara} />
          </TabPanel>
          <TabPanel id="perguntar" active={active === 'perguntar'}>
            <EstudarTab providers={providers} seed={perguntaSeed} modoSeed={modoSeed} />
          </TabPanel>
          <TabPanel id="professores" active={active === 'professores'}>
            <ProfessoresTab providers={providers} />
          </TabPanel>
          <TabPanel id="laboratorio" active={active === 'laboratorio'}>
            <LaboratorioTab providers={providers} />
          </TabPanel>
          <TabPanel id="apostila" active={active === 'apostila'}>
            <ApostilaTab providers={providers} />
          </TabPanel>
          <TabPanel id="buscar" active={active === 'buscar'}>
            <BuscarTab />
          </TabPanel>
          <TabPanel id="comparar" active={active === 'comparar'}>
            <CompararTab providers={providers} />
          </TabPanel>
          <TabPanel id="testar" active={active === 'testar'}>
            <MeTestaTab providers={providers} seed={testeSeed} onIr={irPara} />
          </TabPanel>
          <TabPanel id="erros" active={active === 'erros'}>
            <CadernoTab ativo={active === 'erros'} onIr={irPara} />
          </TabPanel>
          <TabPanel id="flashcards" active={active === 'flashcards'}>
            <FlashcardsTab ativo={active === 'flashcards'} onIr={irPara} />
          </TabPanel>
          <TabPanel id="resolver" active={active === 'resolver'}>
            <ResolverTab providers={providers} onEnviarGlossario={enviarParaGlossario} />
          </TabPanel>
          <TabPanel id="resumir" active={active === 'resumir'}>
            <ResumoApostilaTab providers={providers} />
          </TabPanel>
          <TabPanel id="glossario" active={active === 'glossario'}>
            <GlossarioTab providers={providers} seed={glossarioSeed} />
          </TabPanel>
          <TabPanel id="comprimir" active={active === 'comprimir'}>
            <ComprimirTab />
          </TabPanel>
          <TabPanel id="pdfs" active={active === 'pdfs'}>
            <PdfsTab onStatusChange={() => setStatusTick((t) => t + 1)} />
          </TabPanel>
          <TabPanel id="perfis-comportamentais" active={active === 'perfis-comportamentais'}>
            <PerfisComportamentaisTab providers={providers} />
          </TabPanel>
          <TabPanel id="elenco" active={active === 'elenco'}>
            <ElencoMainTab providers={providers} />
          </TabPanel>
          <TabPanel id="suporte" active={active === 'suporte'}>
            <SuporteTab providers={providers} />
          </TabPanel>
        </div>
      </main>
    </>
  )
}
