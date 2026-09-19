'use client'

import { useEffect, useState } from 'react'
import { Search, Sparkles, TriangleAlert, Library } from 'lucide-react'
import { api } from '@/lib/api'
import { useProviderModel } from '@/lib/useProviderModel'
import type { ProvidersResp, TermoGlossario } from '@/lib/types'
import ProviderSelect from '../ProviderSelect'
import AnexoImagem from '../AnexoImagem'
import Exemplos from '../Exemplos'
import TituloAba from '../TituloAba'

/**
 * Exemplos de um termo, aceitando o formato antigo.
 *
 * Termos gravados antes desta mudança têm um único `exemplo` (texto); os novos
 * vêm em `exemplos` (lista). Assim o glossário antigo continua renderizando.
 */
function exemplosDe(t: TermoGlossario): string[] {
  if (t.exemplos?.length) return t.exemplos
  return t.exemplo ? [t.exemplo] : []
}

export default function GlossarioTab({
  providers,
  seed,
}: {
  providers: ProvidersResp
  seed?: { texto: string; tick: number }
}) {
  const { provider, modelo, trocarProvider, setModelo, pronto, nenhumConfigurado } = useProviderModel(providers)
  const [tema, setTema] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [termos, setTermos] = useState<TermoGlossario[] | null>(null)
  const [aviso, setAviso] = useState('')

  const [busca, setBusca] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [termosSalvos, setTermosSalvos] = useState<TermoGlossario[]>([])
  const [ocrLoading, setOcrLoading] = useState(false)
  const [anexoReset, setAnexoReset] = useState(0)

  async function buscarSalvos(q: string) {
    setBuscando(true)
    try {
      const d = await api.glossarioTermosSalvos(q)
      setTermosSalvos(d.termos)
    } catch {
      setTermosSalvos([])
    } finally {
      setBuscando(false)
    }
  }

  useEffect(() => {
    buscarSalvos('')
  }, [])

  useEffect(() => {
    const t = setTimeout(() => buscarSalvos(busca), 350)
    return () => clearTimeout(t)
  }, [busca])

  async function gerar(temaForcado?: string) {
    if (!pronto) return
    setLoading(true)
    setErro('')
    setAviso('')
    try {
      const d = await api.glossario(temaForcado ?? tema, provider, modelo)
      setTermos(d.termos)
      setAviso(d.aviso_salvamento ?? d.aviso_geracao ?? '')
      buscarSalvos(busca)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao gerar glossário')
      setTermos(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!seed || !seed.texto.trim()) return
    setTema(seed.texto)
    gerar(seed.texto)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed?.tick])

  return (
    <div>
      <TituloAba
        titulo="Glossário"
        descricao="Os termos técnicos das apostilas, explicados de forma simples."
      />

      <div className="cartao mb-6 p-4">
        <div className="rotulo mb-2.5 flex items-center gap-1.5 text-texto">
          <Search className="h-3.5 w-3.5" aria-hidden="true" />
          Buscar termo já salvo
        </div>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Ex: byte, bit, few-shot..."
          className="campo text-[0.92rem] w-full p-3"
        />
        <div className="mt-3">
          {buscando && <div className="text-[0.78rem] text-texto-suave">Buscando…</div>}
          {!buscando && termosSalvos.length === 0 && (
            <div className="text-[0.78rem] text-texto-suave">
              {busca.trim() ? 'Nenhum termo salvo encontrado com esse filtro.' : 'Nenhum termo salvo ainda — gere um sumário abaixo.'}
            </div>
          )}
          {!buscando && termosSalvos.length > 0 && (
            <div className="flex max-h-[280px] flex-col gap-1.5 overflow-y-auto pr-1">
              {termosSalvos.map((t, i) => (
                <div key={i} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                  <div className="mb-0.5 text-[0.78rem] font-semibold text-texto">{t.termo}</div>
                  <div className="text-[0.8rem] leading-relaxed text-texto-suave">{t.explicacao}</div>
                  {exemplosDe(t).length > 0 && (
                    <ol className="mt-1.5 flex flex-col gap-1">
                      {exemplosDe(t).map((ex, j) => (
                        <li key={j} className="text-[0.75rem] italic leading-relaxed text-texto-suave">
                          <span className="not-italic text-[0.65rem] text-texto">Ex {j + 1}: </span>
                          {ex}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="rotulo mb-2.5 flex items-center gap-1.5 text-texto">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        Gerar novo sumário
      </p>
      <ProviderSelect
        providers={providers}
        provider={provider}
        modelo={modelo}
        onProviderChange={trocarProvider}
        onModeloChange={setModelo}
        nenhumConfigurado={nenhumConfigurado}
      />
      <textarea
        value={tema}
        onChange={(e) => setTema(e.target.value)}
        placeholder={
          'Opcional: foque num assunto (ex: few-shot prompting, RAG, embeddings...) ou cole uma questão completa — os termos técnicos dela entram no sumário'
        }
        className="campo text-[0.92rem] min-h-[90px] w-full p-3.5 leading-relaxed"
      />
      <AnexoImagem
        texto={tema}
        setTexto={setTema}
        desabilitado={loading}
        onProcessando={setOcrLoading}
        aplicarFormatoAlternativas={false}
        resetToken={anexoReset}
        dica="Envie um print da questão — os termos técnicos dela entram no sumário"
      />
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => gerar()}
          disabled={loading || ocrLoading || !pronto}
          className="btn-primario"
        >
          {loading ? 'Gerando…' : 'Gerar sumário'}
        </button>
        {termos && termos.length > 0 && (
          <button
            onClick={() => {
              setTermos(null)
              setTema('')
              setErro('')
              setAnexoReset((t) => t + 1)
            }}
            className="btn-secundario px-5 py-2.5 text-sm"
          >
            Limpar
          </button>
        )}
      </div>

      <div className="mt-6">
        {aviso && (
          <div className="aviso-atencao text-texto mb-4 flex items-center gap-2 px-3.5 py-2.5 text-[0.8rem]">
            <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
            {aviso}
          </div>
        )}
        {loading && (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/10 text-texto-suave">
            <div className="carregando h-6 w-6" />
            <span className="text-[0.82rem]">Lendo o material e identificando termos técnicos…</span>
          </div>
        )}
        {!loading && erro && (
          <div className="aviso-erro text-texto flex items-center justify-center gap-2 p-6 text-center text-[0.85rem]">
            <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
            {erro}
          </div>
        )}
        {!loading && !erro && termos && termos.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-texto-suave">
            <p className="text-[0.82rem]">Não encontrei termos técnicos claros nesse trecho do material.</p>
          </div>
        )}
        {!loading && !erro && termos && termos.length > 0 && (
          <div className="flex flex-col gap-2">
            {termos.map((t, i) => (
              <div key={i} className="cartao p-4">
                <div className="mb-1 text-[0.8rem] font-semibold text-texto">{t.termo}</div>
                <div className="text-[0.85rem] leading-relaxed text-texto">{t.explicacao}</div>
                {exemplosDe(t).length > 0 && (
                  <div className="mt-3">
                    <Exemplos itens={exemplosDe(t)} rotulo={`Exemplos de “${t.termo}”`} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {!loading && !erro && !termos && (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 text-center text-texto-suave">
            <Library className="h-6 w-6 opacity-50" aria-hidden="true" />
            <span className="text-[0.82rem]">O sumário de termos aparecerá aqui</span>
          </div>
        )}
      </div>
    </div>
  )
}
