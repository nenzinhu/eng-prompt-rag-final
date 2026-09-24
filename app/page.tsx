'use client'

import { useEffect, useState } from 'react'
import {
  MessageCircle,
  GraduationCap,
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
  Lightbulb,
  FlaskConical,
} from 'lucide-react'
import { api, EVENTO_SESSAO_EXPIRADA } from '@/lib/api'
import { limparTokenAdmin } from '@/lib/admin'
import type { ProvidersResp } from '@/lib/types'
import Header from '@/components/Header'
import Login from '@/components/Login'
import TabNav, { type TabDef } from '@/components/TabNav'
import TabPanel from '@/components/TabPanel'
import PerguntarTab from '@/components/tabs/PerguntarTab'
import ProfessorTab from '@/components/tabs/ProfessorTab'
import AprenderTab from '@/components/tabs/AprenderTab'
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

const TABS: TabDef[] = [
  { id: 'perguntar', grupo: 'Aprender', label: 'Perguntar', labelShort: 'Perguntar', icon: MessageCircle },
  { id: 'professor', grupo: 'Aprender', label: 'Professor', labelShort: 'Professor', icon: GraduationCap },
  { id: 'aprender', grupo: 'Aprender', label: 'Aprender', labelShort: 'Aprender', icon: Lightbulb },
  { id: 'laboratorio', grupo: 'Aprender', label: 'Laboratório de Prompts', labelShort: 'Laboratório', icon: FlaskConical },
  { id: 'buscar', grupo: 'Aprender', label: 'Buscar no material', labelShort: 'Buscar', icon: Search },
  { id: 'resolver', grupo: 'Aprender', label: 'Resolver questão', labelShort: 'Resolver', icon: Target },
  { id: 'glossario', grupo: 'Aprender', label: 'Glossário', labelShort: 'Glossário', icon: Library },
  { id: 'comparar', grupo: 'Aprender', label: 'Comparar modelos', labelShort: 'Comparar', icon: Scale },
  { id: 'apostila', grupo: 'Criar', label: 'Criar apostila', labelShort: 'Apostila', icon: BookOpen },
  { id: 'comprimir', grupo: 'Arquivos', label: 'Comprimir', labelShort: 'Comprimir', icon: FileArchive },
  { id: 'pdfs', grupo: 'Arquivos', label: 'Meus PDFs', labelShort: 'PDFs', icon: FileStack },
  { id: 'perfis-comportamentais', grupo: 'Mensagens', label: 'Perfis de resposta', labelShort: 'Respostas', icon: Shield },
  { id: 'elenco', grupo: 'Mensagens', label: 'Elenco', labelShort: 'Elenco', icon: PartyPopper },
  { id: 'suporte', grupo: 'Suporte', label: 'Suporte', labelShort: 'Suporte', icon: LifeBuoy },
]

export default function Home() {
  const [active, setActive] = useState('perguntar')
  const [providers, setProviders] = useState<ProvidersResp>({})
  const [statusTick, setStatusTick] = useState(0)
  const [glossarioSeed, setGlossarioSeed] = useState({ texto: '', tick: 0 })
  // 'verificando' até o servidor dizer se o app é privado; 'login' mostra a
  // tela de entrada no lugar do app inteiro.
  const [acesso, setAcesso] = useState<'verificando' | 'liberado' | 'login'>('verificando')
  const [privado, setPrivado] = useState(false)

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
      <main className="relative mx-auto max-w-[900px] px-5 pb-16 pt-4">
        <div className="relative">
          <TabPanel id="perguntar" active={active === 'perguntar'}>
            <PerguntarTab providers={providers} />
          </TabPanel>
          <TabPanel id="professor" active={active === 'professor'}>
            <ProfessorTab providers={providers} />
          </TabPanel>
          <TabPanel id="aprender" active={active === 'aprender'}>
            <AprenderTab providers={providers} />
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
          <TabPanel id="resolver" active={active === 'resolver'}>
            <ResolverTab providers={providers} onEnviarGlossario={enviarParaGlossario} />
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
