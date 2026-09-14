'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { ProvidersResp } from '@/lib/types'
import Header from '@/components/Header'
import TabNav, { type TabDef } from '@/components/TabNav'
import TabPanel from '@/components/TabPanel'
import PerguntarTab from '@/components/tabs/PerguntarTab'
import ProfessorTab from '@/components/tabs/ProfessorTab'
import BuscarTab from '@/components/tabs/BuscarTab'
import ResolverTab from '@/components/tabs/ResolverTab'
import CompararTab from '@/components/tabs/CompararTab'
import PdfsTab from '@/components/tabs/PdfsTab'
import GlossarioTab from '@/components/tabs/GlossarioTab'
import ComprimirTab from '@/components/tabs/ComprimirTab'
import ApostilaTab from '@/components/tabs/ApostilaTab'

const TABS: TabDef[] = [
  { id: 'perguntar', label: 'Perguntar', labelShort: 'Perguntar', icon: '💬' },
  { id: 'professor', label: 'Professor Sabe Tudo', labelShort: 'Professor', icon: '🧙' },
  { id: 'apostila', label: 'Gerador de Apostilas', labelShort: 'Apostilas', icon: '📘' },
  { id: 'comparar', label: 'Comparar Modelos', labelShort: 'Comparar', icon: '⚖️' },
  { id: 'buscar', label: 'Buscar', labelShort: 'Busca', icon: '🔍' },
  { id: 'resolver', label: 'Resolver Questão', labelShort: 'Resolver', icon: '🎯' },
  { id: 'glossario', label: 'Glossário', labelShort: 'Glossário', icon: '📖' },
  { id: 'comprimir', label: 'Comprimir Arquivos', labelShort: 'Comprimir', icon: '🗜️' },
  { id: 'pdfs', label: 'PDFs', labelShort: 'PDFs', icon: '📚' },
]

export default function Home() {
  const [active, setActive] = useState('perguntar')
  const [providers, setProviders] = useState<ProvidersResp>({})
  const [statusTick, setStatusTick] = useState(0)
  const [glossarioSeed, setGlossarioSeed] = useState({ texto: '', tick: 0 })

  function enviarParaGlossario(texto: string) {
    setGlossarioSeed((s) => ({ texto, tick: s.tick + 1 }))
    setActive('glossario')
  }

  useEffect(() => {
    api
      .providers()
      .then(setProviders)
      .catch(() => setProviders({}))
  }, [])

  return (
    <>
      <Header key={statusTick} />
      <TabNav tabs={TABS} active={active} onChange={setActive} />
      <main className="relative mx-auto max-w-[900px] px-5 pb-16 pt-4">
        <div className="relative">
          <TabPanel active={active === 'perguntar'}>
            <PerguntarTab providers={providers} />
          </TabPanel>
          <TabPanel active={active === 'professor'}>
            <ProfessorTab providers={providers} />
          </TabPanel>
          <TabPanel active={active === 'apostila'}>
            <ApostilaTab providers={providers} />
          </TabPanel>
          <TabPanel active={active === 'buscar'}>
            <BuscarTab />
          </TabPanel>
          <TabPanel active={active === 'comparar'}>
            <CompararTab providers={providers} />
          </TabPanel>
          <TabPanel active={active === 'resolver'}>
            <ResolverTab providers={providers} onEnviarGlossario={enviarParaGlossario} />
          </TabPanel>
          <TabPanel active={active === 'glossario'}>
            <GlossarioTab providers={providers} seed={glossarioSeed} />
          </TabPanel>
          <TabPanel active={active === 'comprimir'}>
            <ComprimirTab />
          </TabPanel>
          <TabPanel active={active === 'pdfs'}>
            <PdfsTab onStatusChange={() => setStatusTick((t) => t + 1)} />
          </TabPanel>
        </div>
      </main>
    </>
  )
}
