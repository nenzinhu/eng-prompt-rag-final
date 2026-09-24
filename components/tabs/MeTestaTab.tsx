'use client'

import { useEffect, useRef, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { api } from '@/lib/api'
import { useProviderModel } from '@/lib/useProviderModel'
import { anotarErro, lerCaderno, salvarCaderno } from '@/lib/caderno'
import { lerProgresso } from '@/lib/progresso'
import type { ProvidersResp, Questao } from '@/lib/types'
import ProviderSelect from '../ProviderSelect'
import QuestaoCard from '../QuestaoCard'

/**
 * "Me testa": questões de múltipla escolha tiradas da apostila. As erradas vão
 * para o caderno de erros.
 */
export default function MeTestaTab({
  providers,
  seed,
  onIr,
}: {
  providers: ProvidersResp
  /** Tema vindo da tela Hoje: preenche e já gera as questões. */
  seed?: { tema: string; tick: number }
  onIr: (aba: string) => void
}) {
  const { provider, modelo, trocarProvider, setModelo, pronto, nenhumConfigurado } = useProviderModel(providers)
  const [tema, setTema] = useState('')
  const [questoes, setQuestoes] = useState<Questao[]>([])
  const [indice, setIndice] = useState(0)
  const [acertos, setAcertos] = useState(0)
  const [respondida, setRespondida] = useState(false)
  const [rodada, setRodada] = useState(0)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  // Sem tema digitado, sugere o último assunto estudado.
  useEffect(() => {
    const ultimo = lerProgresso().estudos[0]
    if (ultimo) setTema((t) => t || ultimo.pergunta)
  }, [])

  async function gerar(assunto = tema) {
    setLoading(true)
    setErro('')
    setQuestoes([])
    try {
      const d = await api.praticarQuestoes(assunto, 3, provider, modelo)
      setQuestoes(d.questoes)
      setIndice(0)
      setAcertos(0)
      setRespondida(false)
      setRodada((r) => r + 1)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui montar as questões. Tente de novo.')
    } finally {
      setLoading(false)
    }
  }

  const seedUsada = useRef(0)
  useEffect(() => {
    if (!seed?.tema.trim()) return
    setTema(seed.tema)
    if (!pronto || seedUsada.current === seed.tick) return
    seedUsada.current = seed.tick
    void gerar(seed.tema)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed?.tick, pronto])

  function responder(questao: Questao, marcada: number) {
    setRespondida(true)
    if (marcada === questao.correta) setAcertos((a) => a + 1)
    else salvarCaderno(anotarErro(lerCaderno(), questao, marcada, Date.now()))
  }

  const atual = questoes[indice]
  const terminou = questoes.length > 0 && indice >= questoes.length
  const erros = questoes.length - acertos

  return (
    <div className="flex flex-col gap-4">
      <p className="font-mono text-[0.7rem] uppercase tracking-wider text-muted">
        Questões tiradas da sua apostila — as que você errar vão para o caderno de erros
      </p>
      <ProviderSelect
        providers={providers}
        provider={provider}
        modelo={modelo}
        onProviderChange={trocarProvider}
        onModeloChange={setModelo}
        nenhumConfigurado={nenhumConfigurado}
      />
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void gerar()
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <label htmlFor="metesta-tema" className="sr-only">
          Assunto das questões
        </label>
        <input
          id="metesta-tema"
          value={tema}
          onChange={(e) => setTema(e.target.value)}
          placeholder="Assunto (vazio: pontos variados do material)"
          className="glass min-w-0 flex-1 rounded-lg px-4 py-2.5 text-[0.9rem] text-text outline-none placeholder:text-muted focus:border-violet/40"
        />
        <button
          type="submit"
          disabled={loading || !pronto}
          className="min-h-11 rounded-lg bg-lime px-5 text-sm font-semibold text-[#08070c] transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {loading ? 'Montando…' : questoes.length ? 'Novas questões' : 'Me testa'}
        </button>
      </form>

      {erro && (
        <p role="alert" className="flex items-start gap-1.5 text-[0.85rem] text-rose-300">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {erro}
        </p>
      )}

      {atual && (
        <>
          <p className="text-[0.8rem] text-muted">
            Questão {indice + 1} de {questoes.length}
          </p>
          <QuestaoCard key={`${rodada}-${indice}`} questao={atual} onResponder={(m) => responder(atual, m)}>
            <button
              type="button"
              onClick={() => {
                setIndice((i) => i + 1)
                setRespondida(false)
              }}
              disabled={!respondida}
              className="min-h-11 rounded-lg bg-lime px-5 text-sm font-semibold text-[#08070c] transition-opacity hover:opacity-90"
            >
              {indice + 1 < questoes.length ? 'Próxima' : 'Ver resultado'}
            </button>
          </QuestaoCard>
        </>
      )}

      {terminou && (
        <div role="status" className="glass flex flex-col gap-3 rounded-2xl p-5">
          <p className="font-display text-[1.5rem] italic text-text">
            {acertos} de {questoes.length} certas
          </p>
          <p className="text-[0.9rem] text-muted">
            {erros === 0
              ? 'Tudo certo. Tente um assunto novo ou mais difícil.'
              : `${erros === 1 ? 'A que você errou foi' : `As ${erros} que você errou foram`} para o caderno de erros.`}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void gerar()}
              className="min-h-11 rounded-lg bg-lime px-5 text-sm font-semibold text-[#08070c] transition-opacity hover:opacity-90"
            >
              Novas questões
            </button>
            {erros > 0 && (
              <button
                type="button"
                onClick={() => onIr('erros')}
                className="min-h-11 rounded-lg border border-white/15 px-5 text-sm text-text transition-colors hover:bg-white/[0.05]"
              >
                Revisar erros
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
