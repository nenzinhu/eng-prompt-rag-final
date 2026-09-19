'use client'

import { useState } from 'react'
import { FileText, TriangleAlert, Download, Library } from 'lucide-react'
import { api } from '@/lib/api'
import { useProviderModel } from '@/lib/useProviderModel'
import type { ProvidersResp, ResumoApostilaResp } from '@/lib/types'
import ProviderSelect from '../ProviderSelect'
import Markdown from '../Markdown'
import TituloAba from '../TituloAba'

export default function ResumoApostilaTab({ providers }: { providers: ProvidersResp }) {
  const { provider, modelo, trocarProvider, setModelo, pronto, nenhumConfigurado } = useProviderModel(providers)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [resultado, setResultado] = useState<ResumoApostilaResp | null>(null)

  async function gerar() {
    if (!arquivo) return
    setLoading(true)
    setErro('')
    setResultado(null)
    try {
      const d = await api.resumirApostila(arquivo, provider, modelo)
      setResultado(d)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao gerar resumo')
    } finally {
      setLoading(false)
    }
  }

  function exportarMarkdown() {
    if (!resultado) return
    const blob = new Blob([`# Resumo — ${resultado.arquivo}\n\n${resultado.resumo}`], {
      type: 'text/markdown;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `resumo-${resultado.arquivo.replace(/\.[^.]+$/, '')}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <TituloAba
        titulo="Resumir apostila"
        descricao="Anexe um PDF, .docx ou .pptx da apostila. O Professor Sabe Tudo lê tudo e escreve um resumo explicado, do tamanho que o conteúdo pedir."
      />
      <ProviderSelect
        providers={providers}
        provider={provider}
        modelo={modelo}
        onProviderChange={trocarProvider}
        onModeloChange={setModelo}
        nenhumConfigurado={nenhumConfigurado}
      />
      <label className="cartao flex min-h-[80px] cursor-pointer flex-col items-center justify-center gap-1 border border-dashed p-4 text-center text-texto-suave transition-colors hover:border-borda-forte">
        <input
          type="file"
          accept=".pdf,.txt,.md,.docx,.pptx"
          className="hidden"
          disabled={loading}
          onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
        />
        <span className="flex items-center gap-1.5 text-[0.82rem]">
          {arquivo ? (
            <>
              <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
              {arquivo.name}
            </>
          ) : (
            'Clique para escolher o arquivo da apostila'
          )}
        </span>
      </label>
      <div className="mt-3 flex gap-2">
        <button
          onClick={gerar}
          disabled={loading || !arquivo || !pronto}
          className="btn-primario"
        >
          {loading ? 'Analisando apostila…' : 'Gerar resumo'}
        </button>
        <button
          onClick={() => {
            setArquivo(null)
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
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/10 text-texto-suave">
            <div className="carregando h-6 w-6" />
            <span className="text-[0.82rem]">Lendo o material e compondo o resumo — pode levar um tempo em apostilas grandes…</span>
          </div>
        )}
        {!loading && erro && (
          <div className="aviso-erro text-texto flex items-center justify-center gap-2 p-6 text-center text-[0.85rem]">
            <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
            {erro}
          </div>
        )}
        {!loading && !erro && resultado && (
          <div className="cartao surgir overflow-hidden">
            <div className="rotulo flex items-center justify-between border-b border-white/[0.06] bg-white/[0.02] px-4 py-3">
              <span>
                Resumo — {resultado.arquivo} ({resultado.provider} / {resultado.modelo})
              </span>
              <button
                onClick={exportarMarkdown}
                className="btn-secundario flex items-center gap-1.5 px-3 py-1.5 text-[0.72rem] normal-case tracking-normal"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Exportar .md
              </button>
            </div>
            <div className="p-5">
              {resultado.amostrado && (
                <div className="aviso-atencao text-texto mb-4 p-3 text-[0.78rem]">
                  Apostila grande: o resumo usou uma amostra de {resultado.chunks_usados} de{' '}
                  {resultado.chunks_total} trechos, distribuídos por todo o documento.
                </div>
              )}
              <Markdown>{resultado.resumo}</Markdown>
            </div>
          </div>
        )}
        {!loading && !erro && !resultado && (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 text-center text-texto-suave">
            <Library className="h-6 w-6 opacity-50" aria-hidden="true" />
            <span className="text-[0.82rem]">O resumo da apostila aparecerá aqui</span>
          </div>
        )}
      </div>
    </div>
  )
}
