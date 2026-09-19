'use client'

import { useEffect, useState } from 'react'
import {
  MessageSquareQuote,
  TriangleAlert,
  Copy,
  CircleCheck,
  History,
  Trash2,
  Target,
  SearchCheck,
  Lightbulb,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useRequisicao } from '@/lib/useRequisicao'
import { useProviderModel } from '@/lib/useProviderModel'
import { useHistorico } from '@/lib/useHistorico'
import type { ProvidersResp, FalePersona, FaleOQuePensaResp } from '@/lib/types'
import ProviderSelect from '../ProviderSelect'
import Markdown from '../Markdown'

// Mesmos tetos da rota /api/fale-o-que-pensa: avisar antes evita um 400 à toa.
const MAX_RASCUNHO = 4000
const MAX_CONTEXTO = 1500

const PERSONAS_PADRAO: FalePersona[] = [
  {
    persona_id: 'auto',
    display_name: 'Automático',
    description: 'A IA lê o contexto e escolhe o tom certo para a situação.',
    exemplo: 'Decide sozinho se é hora de ser direto, delicado ou firme.',
  },
]

/**
 * "Fale o que pensa": o usuário escreve do jeito que sair, a IA entende a
 * intenção, analisa como o rascunho vai soar e reescreve na personalidade
 * escolhida (direto, indireto, para o ex, amigo, lição de moral...).
 */
export default function FaleOQuePensaTab({ providers }: { providers: ProvidersResp }) {
  const { provider, modelo, trocarProvider, setModelo, pronto, nenhumConfigurado } = useProviderModel(providers)
  const [personas, setPersonas] = useState<FalePersona[]>(PERSONAS_PADRAO)
  const [personaId, setPersonaId] = useState('auto')
  const [contexto, setContexto] = useState('')
  const [rascunho, setRascunho] = useState('')
  const { dados: resultado, setDados: setResultado, carregando: loading, erro, setErro, executar } =
    useRequisicao<FaleOQuePensaResp | null>(null)
  const [copiado, setCopiado] = useState(false)
  const { itens: historico, adicionar: adicionarHistorico, limpar: limparHistorico } = useHistorico('fale-o-que-pensa')

  useEffect(() => {
    api
      .falePersonas()
      .then((d) => {
        if (d.personas?.length) setPersonas(d.personas)
      })
      .catch(() => undefined)
  }, [])

  const longoDemais = rascunho.length > MAX_RASCUNHO || contexto.length > MAX_CONTEXTO
  const personaAtiva = personas.find((p) => p.persona_id === personaId) ?? personas[0]

  async function melhorar() {
    if (!rascunho.trim() || longoDemais) return
    setResultado(null)
    setCopiado(false)
    const r = await executar(
      () => api.faleOQuePensa(rascunho, contexto, personaId, provider, modelo),
      'Erro ao melhorar a mensagem',
    )
    if (r?.mensagem) adicionarHistorico(r.mensagem, `${personaAtiva?.display_name ?? ''} · ${rascunho}`)
  }

  async function copiar() {
    if (!resultado?.mensagem) return
    try {
      await navigator.clipboard.writeText(resultado.mensagem)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Sem permissão de clipboard — o texto já está visível para selecionar manualmente.
    }
  }

  return (
    <div>
      <p className="mb-4 font-mono text-[0.7rem] uppercase tracking-wider text-muted">
        Fale o que pensa — escreva do jeito que sair. A IA entende o que você quis dizer, mostra como
        pode soar e devolve a mensagem melhorada no tom que você escolher
      </p>

      <p className="mb-2.5 text-[0.75rem] font-medium text-muted">Como você quer falar?</p>
      <div className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {personas.map((p) => (
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
              <MessageSquareQuote className="h-4 w-4 shrink-0 text-violet" aria-hidden="true" />
              {p.display_name}
            </div>
            <div className="mb-1.5 text-[0.76rem] leading-relaxed text-muted">{p.description}</div>
            <div className="text-[0.74rem] italic leading-relaxed text-muted/90">{p.exemplo}</div>
          </button>
        ))}
      </div>

      <ProviderSelect
        providers={providers}
        provider={provider}
        modelo={modelo}
        onProviderChange={trocarProvider}
        onModeloChange={setModelo}
        nenhumConfigurado={nenhumConfigurado}
      />

      <label htmlFor="fale-contexto" className="mb-1 block text-[0.72rem] font-medium text-muted">
        Para quem é e o que aconteceu (opcional, mas ajuda muito)
      </label>
      <textarea
        id="fale-contexto"
        value={contexto}
        onChange={(e) => setContexto(e.target.value)}
        placeholder="Ex: meu amigo de infância, ele furou comigo pela terceira vez este mês"
        className="glass mb-3 min-h-[70px] w-full rounded-xl p-4 font-mono text-[0.82rem] leading-relaxed text-text outline-none placeholder:text-muted focus:border-violet/40"
      />

      <label htmlFor="fale-rascunho" className="mb-1 block text-[0.72rem] font-medium text-muted">
        O que você quer dizer — do seu jeito, sem filtro
      </label>
      <textarea
        id="fale-rascunho"
        value={rascunho}
        onChange={(e) => setRascunho(e.target.value)}
        placeholder="Ex: cara tu sempre faz isso, marca e some, to de saco cheio já"
        className="glass min-h-[130px] w-full rounded-xl p-4 font-mono text-[0.82rem] leading-relaxed text-text outline-none placeholder:text-muted focus:border-violet/40"
      />
      <div className={`mt-1 text-right text-[0.7rem] ${longoDemais ? 'text-rose-300' : 'text-muted'}`}>
        {rascunho.length}/{MAX_RASCUNHO}
        {contexto.length > MAX_CONTEXTO && ` · contexto acima de ${MAX_CONTEXTO} caracteres`}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          onClick={melhorar}
          disabled={loading || !rascunho.trim() || longoDemais || !pronto}
          className="rounded-lg bg-gradient-to-r from-violet to-cyan px-5 py-2.5 text-sm font-semibold text-[#08070c] transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {loading ? 'Analisando…' : 'Analisar e melhorar'}
        </button>
        <button
          onClick={() => {
            setContexto('')
            setRascunho('')
            setResultado(null)
            setErro('')
          }}
          className="rounded-lg border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-text transition-colors hover:bg-white/[0.06]"
        >
          Limpar
        </button>
      </div>

      <div className="mt-6">
        {loading && (
          <div className="flex min-h-[140px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/10 text-muted">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet/30 border-t-violet" />
            <span className="text-[0.82rem]">Entendendo o que você quis dizer…</span>
          </div>
        )}
        {!loading && erro && (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-rose-400/25 bg-rose-400/10 p-6 text-center text-[0.85rem] text-rose-300">
            <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
            {erro}
          </div>
        )}
        {!loading && !erro && resultado && (
          <div className="flex flex-col gap-3">
            {resultado.intencao && (
              <Bloco icone={Target} titulo="O que você quis dizer">
                <p className="text-[0.88rem] leading-relaxed text-text">{resultado.intencao}</p>
              </Bloco>
            )}
            {resultado.analise && (
              <Bloco icone={SearchCheck} titulo="Como o rascunho pode soar">
                <Markdown>{resultado.analise}</Markdown>
              </Bloco>
            )}

            <div className="glass grad-border overflow-hidden rounded-xl">
              <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.02] px-4 py-3 font-mono text-[0.68rem] uppercase tracking-wider text-muted">
                {['Mensagem melhorada', personas.find((p) => p.persona_id === resultado.persona_id)?.display_name]
                  .filter(Boolean)
                  .join(' — ')}
                <button
                  onClick={copiar}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[0.72rem] font-medium normal-case tracking-normal text-text transition-colors hover:bg-white/[0.06]"
                >
                  {copiado ? (
                    <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {copiado ? 'Copiado' : 'Copiar'}
                </button>
              </div>
              <div className="whitespace-pre-wrap p-5 text-[0.9rem] leading-relaxed text-text">{resultado.mensagem}</div>
            </div>

            {resultado.dica && (
              <Bloco icone={Lightbulb} titulo="Dica para enviar">
                <p className="text-[0.85rem] leading-relaxed text-muted">{resultado.dica}</p>
              </Bloco>
            )}
            <p className="text-[0.72rem] text-muted">
              Não ficou do seu jeito? Escolha outra personalidade acima e clique de novo — o rascunho continua lá.
            </p>
          </div>
        )}
        {!loading && !erro && !resultado && (
          <div className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 text-center text-muted">
            <MessageSquareQuote className="h-6 w-6 opacity-50" aria-hidden="true" />
            <span className="text-[0.82rem]">A análise e a mensagem melhorada aparecerão aqui</span>
          </div>
        )}
      </div>

      {historico.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-mono text-[0.68rem] uppercase tracking-wider text-muted">
              <History className="h-3.5 w-3.5" aria-hidden="true" />
              Mensagens recentes
            </div>
            <button
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
                onClick={() =>
                  setResultado({ intencao: '', analise: '', mensagem: h.resposta, dica: '', persona_id: '', provider: '', modelo: '' })
                }
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

function Bloco({
  icone: Icone,
  titulo,
  children,
}: {
  icone: typeof Target
  titulo: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="mb-2 flex items-center gap-1.5 font-mono text-[0.68rem] uppercase tracking-wider text-muted">
        <Icone className="h-3.5 w-3.5 text-violet" aria-hidden="true" />
        {titulo}
      </div>
      {children}
    </div>
  )
}
