'use client'

import { useEffect, useState } from 'react'
import { Shield, TriangleAlert, Copy, CircleCheck, History, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useRequisicao } from '@/lib/useRequisicao'
import { useProviderModel } from '@/lib/useProviderModel'
import { useHistorico } from '@/lib/useHistorico'
import type { ProvidersResp, PerfilComportamental } from '@/lib/types'
import ProviderSelect from '../ProviderSelect'
import AnexoImagem from '../AnexoImagem'
import TituloAba from '../TituloAba'

const PERFIS_PADRAO: PerfilComportamental[] = [
  {
    temperament_id: 'estoico',
    display_name: 'Estoico / Sereno',
    description: 'Calma inabalável — reconhece o fato, fixa o limite e encerra sem se alongar.',
  },
]

export default function PerfisComportamentaisTab({ providers }: { providers: ProvidersResp }) {
  const { provider, modelo, trocarProvider, setModelo, pronto, nenhumConfigurado } = useProviderModel(providers)
  const [perfis, setPerfis] = useState<PerfilComportamental[]>(PERFIS_PADRAO)
  const [temperamentId, setTemperamentId] = useState('estoico')
  const [contexto, setContexto] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [ocrLoading, setOcrLoading] = useState(false)
  const [anexoReset, setAnexoReset] = useState(0)
  const { dados: resposta, setDados: setResposta, carregando: loading, erro, setErro, executar } =
    useRequisicao('')
  const [copiado, setCopiado] = useState(false)
  const {
    itens: historico,
    adicionar: adicionarHistorico,
    limpar: limparHistorico,
  } = useHistorico('perfis-comportamentais')

  useEffect(() => {
    api
      .perfisComportamentais()
      .then((d) => {
        if (d.perfis?.length) {
          setPerfis(d.perfis)
          if (!d.perfis.some((p) => p.temperament_id === temperamentId)) {
            setTemperamentId(d.perfis[0].temperament_id)
          }
        }
      })
      .catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function gerar() {
    if (!mensagem.trim()) return
    setResposta('')
    setCopiado(false)
    const texto = await executar(() => api.perfilComportamental(contexto, mensagem, temperamentId, provider, modelo).then((d) => d.resposta), 'Erro ao gerar resposta')
    if (texto) adicionarHistorico(texto, contexto || mensagem)
  }

  async function copiar() {
    if (!resposta) return
    try {
      await navigator.clipboard.writeText(resposta)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Sem permissão de clipboard — o texto já está visível para selecionar manualmente.
    }
  }

  return (
    <div>
      <TituloAba
        titulo="Perfis comportamentais"
        descricao="Cole a mensagem recebida e escolha o tom da resposta que protege os seus limites."
      />

      <p className="mb-2.5 text-[0.75rem] font-medium text-texto-suave">Escolha o perfil comportamental</p>
      <div className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {perfis.map((p) => (
          <button
            key={p.temperament_id}
            onClick={() => setTemperamentId(p.temperament_id)}
            aria-pressed={p.temperament_id === temperamentId}
            className={`rounded-xl border p-3 text-left transition-colors ${
              p.temperament_id === temperamentId
                ? 'border-destaque bg-cartao-hover'
                : 'border-borda bg-cartao hover:border-borda-forte hover:bg-cartao-hover'
            }`}
          >
            <div className="mb-1 flex items-center gap-2 text-[0.85rem] font-semibold text-texto">
              <Shield className="h-4 w-4 shrink-0 text-texto" aria-hidden="true" />
              {p.display_name}
            </div>
            <div className="text-[0.76rem] leading-relaxed text-texto-suave">{p.description}</div>
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

      <label className="mb-1 block text-[0.72rem] font-medium text-texto-suave">
        Contexto (opcional — o que está acontecendo)
      </label>
      <textarea
        value={contexto}
        onChange={(e) => setContexto(e.target.value)}
        placeholder="Ex: terceira vez que ele some por dias e volta como se nada tivesse acontecido"
        className="campo text-[0.92rem] mb-3 min-h-[70px] w-full p-4 leading-relaxed"
      />

      <label className="mb-1 block text-[0.72rem] font-medium text-texto-suave">Mensagem recebida do interlocutor</label>
      <textarea
        value={mensagem}
        onChange={(e) => setMensagem(e.target.value)}
        placeholder='Ex: "desculpa, eu tava passando por um momento difícil, você não entende..."'
        className="campo text-[0.92rem] min-h-[110px] w-full p-4 leading-relaxed"
      />
      <AnexoImagem
        texto={mensagem}
        setTexto={setMensagem}
        desabilitado={loading}
        onProcessando={setOcrLoading}
        aplicarFormatoAlternativas={false}
        resetToken={anexoReset}
        dica="Print da mensagem, PDF ou DOCX — o texto entra na caixa acima, com OCR"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={gerar}
          disabled={loading || ocrLoading || !mensagem.trim() || !pronto}
          className="btn-primario"
        >
          {loading ? 'Formulando…' : 'Gerar resposta'}
        </button>
        <button
          onClick={() => {
            setContexto('')
            setMensagem('')
            setAnexoReset((n) => n + 1)
            setResposta('')
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
            <span className="text-[0.82rem]">Formulando uma resposta serena e firme…</span>
          </div>
        )}
        {!loading && erro && (
          <div className="aviso-erro text-texto flex items-center justify-center gap-2 p-6 text-center text-[0.85rem]">
            <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
            {erro}
          </div>
        )}
        {!loading && !erro && resposta && (
          <div className="cartao overflow-hidden">
            <div className="rotulo flex items-center justify-between border-b border-white/[0.06] bg-white/[0.02] px-4 py-3">
              Resposta pronta para envio
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
            <div className="whitespace-pre-wrap p-5 text-[0.9rem] leading-relaxed text-texto">{resposta}</div>
          </div>
        )}
        {!loading && !erro && !resposta && (
          <div className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 text-center text-texto-suave">
            <Shield className="h-6 w-6 opacity-50" aria-hidden="true" />
            <span className="text-[0.82rem]">A resposta pronta para envio aparecerá aqui</span>
          </div>
        )}
      </div>

      {historico.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <div className="rotulo flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" aria-hidden="true" />
              Histórico recente
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
                onClick={() => setResposta(h.resposta)}
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
