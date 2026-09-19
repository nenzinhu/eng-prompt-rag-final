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
import TituloAba from '../TituloAba'

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
      <TituloAba
        titulo="Fale o que pensa"
        descricao="Escreva do jeito que sair. A IA entende o que você quis dizer, mostra como pode soar e devolve a mensagem melhorada no tom que você escolher."
      />

      <p className="mb-2.5 text-[0.75rem] font-medium text-texto-suave">Como você quer falar?</p>
      <div className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {personas.map((p) => (
          <button
            key={p.persona_id}
            onClick={() => setPersonaId(p.persona_id)}
            aria-pressed={p.persona_id === personaId}
            className={`rounded-xl border p-3 text-left transition-colors ${
              p.persona_id === personaId
                ? 'border-destaque bg-cartao-hover'
                : 'border-borda bg-cartao hover:border-borda-forte hover:bg-cartao-hover'
            }`}
          >
            <div className="mb-1 flex items-center gap-2 text-[0.85rem] font-semibold text-texto">
              <MessageSquareQuote className="h-4 w-4 shrink-0 text-texto" aria-hidden="true" />
              {p.display_name}
            </div>
            <div className="mb-1.5 text-[0.76rem] leading-relaxed text-texto-suave">{p.description}</div>
            <div className="text-[0.74rem] italic leading-relaxed text-texto-suave">{p.exemplo}</div>
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

      <label htmlFor="fale-contexto" className="mb-1 block text-[0.72rem] font-medium text-texto-suave">
        Para quem é e o que aconteceu (opcional, mas ajuda muito)
      </label>
      <textarea
        id="fale-contexto"
        value={contexto}
        onChange={(e) => setContexto(e.target.value)}
        placeholder="Ex: meu amigo de infância, ele furou comigo pela terceira vez este mês"
        className="campo text-[0.92rem] mb-3 min-h-[70px] w-full p-4 leading-relaxed"
      />

      <label htmlFor="fale-rascunho" className="mb-1 block text-[0.72rem] font-medium text-texto-suave">
        O que você quer dizer — do seu jeito, sem filtro
      </label>
      <textarea
        id="fale-rascunho"
        value={rascunho}
        onChange={(e) => setRascunho(e.target.value)}
        placeholder="Ex: cara tu sempre faz isso, marca e some, to de saco cheio já"
        className="campo text-[0.92rem] min-h-[130px] w-full p-4 leading-relaxed"
      />
      <div className={`mt-1 text-right text-[0.7rem] ${longoDemais ? 'text-erro' : 'text-texto-suave'}`}>
        {rascunho.length}/{MAX_RASCUNHO}
        {contexto.length > MAX_CONTEXTO && ` · contexto acima de ${MAX_CONTEXTO} caracteres`}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          onClick={melhorar}
          disabled={loading || !rascunho.trim() || longoDemais || !pronto}
          className="btn-primario"
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
          className="btn-secundario px-5 py-2.5 text-sm"
        >
          Limpar
        </button>
      </div>

      <div className="mt-6">
        {loading && (
          <div className="flex min-h-[140px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/10 text-texto-suave">
            <div className="carregando h-6 w-6" />
            <span className="text-[0.82rem]">Entendendo o que você quis dizer…</span>
          </div>
        )}
        {!loading && erro && (
          <div className="aviso-erro text-texto flex items-center justify-center gap-2 p-6 text-center text-[0.85rem]">
            <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
            {erro}
          </div>
        )}
        {!loading && !erro && resultado && (
          <div className="flex flex-col gap-3">
            {resultado.intencao && (
              <Bloco icone={Target} titulo="O que você quis dizer">
                <p className="text-[0.88rem] leading-relaxed text-texto">{resultado.intencao}</p>
              </Bloco>
            )}
            {resultado.analise && (
              <Bloco icone={SearchCheck} titulo="Como o rascunho pode soar">
                <Markdown>{resultado.analise}</Markdown>
              </Bloco>
            )}

            <div className="cartao overflow-hidden">
              <div className="rotulo flex items-center justify-between border-b border-white/[0.06] bg-white/[0.02] px-4 py-3">
                {['Mensagem melhorada', personas.find((p) => p.persona_id === resultado.persona_id)?.display_name]
                  .filter(Boolean)
                  .join(' — ')}
                <button
                  onClick={copiar}
                  className="btn-secundario flex items-center gap-1.5 px-3 py-1.5 text-[0.72rem] normal-case tracking-normal"
                >
                  {copiado ? (
                    <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {copiado ? 'Copiado' : 'Copiar'}
                </button>
              </div>
              <div className="whitespace-pre-wrap p-5 text-[0.9rem] leading-relaxed text-texto">{resultado.mensagem}</div>
            </div>

            {resultado.dica && (
              <Bloco icone={Lightbulb} titulo="Dica para enviar">
                <p className="text-[0.85rem] leading-relaxed text-texto-suave">{resultado.dica}</p>
              </Bloco>
            )}
            <p className="text-[0.72rem] text-texto-suave">
              Não ficou do seu jeito? Escolha outra personalidade acima e clique de novo — o rascunho continua lá.
            </p>
          </div>
        )}
        {!loading && !erro && !resultado && (
          <div className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 text-center text-texto-suave">
            <MessageSquareQuote className="h-6 w-6 opacity-50" aria-hidden="true" />
            <span className="text-[0.82rem]">A análise e a mensagem melhorada aparecerão aqui</span>
          </div>
        )}
      </div>

      {historico.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <div className="rotulo flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" aria-hidden="true" />
              Mensagens recentes
            </div>
            <button
              onClick={limparHistorico}
              className="flex items-center gap-1 text-[0.72rem] text-texto-suave transition-colors hover:text-erro"
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
                className="border-borda bg-cartao hover:border-borda-forte hover:bg-cartao-hover rounded-lg border px-3 py-2 text-left text-[0.78rem] text-texto-suave transition-colors hover:text-texto"
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
      <div className="rotulo mb-2 flex items-center gap-1.5">
        <Icone className="h-3.5 w-3.5 text-texto" aria-hidden="true" />
        {titulo}
      </div>
      {children}
    </div>
  )
}
