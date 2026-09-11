'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { api } from '@/lib/api'
import { useProviderModel } from '@/lib/useProviderModel'
import type { ProvidersResp, ResumoApostilaResp } from '@/lib/types'
import ProviderSelect from '../ProviderSelect'
import Markdown from '../Markdown'

export default function ResumoApostilaTab({ providers }: { providers: ProvidersResp }) {
  const { provider, modelo, trocarProvider, setModelo, pronto, nenhumConfigurado } = useProviderModel(providers)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [resultado, setResultado] = useState<ResumoApostilaResp | null>(null)

  const resultCardRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!resultado || !resultCardRef.current) return
    gsap.fromTo(
      resultCardRef.current,
      { autoAlpha: 0, y: 16 },
      { autoAlpha: 1, y: 0, duration: 0.5, ease: 'power2.out' }
    )
  }, [resultado])

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
      <p className="mb-4 font-mono text-[0.7rem] uppercase tracking-wider text-muted">
        Anexe um PDF, .docx ou .pptx da apostila — o Professor Sabe Tudo lê tudo e escreve um resumo
        autoexplicativo do assunto, do tamanho que o conteúdo pedir
      </p>
      <ProviderSelect
        providers={providers}
        provider={provider}
        modelo={modelo}
        onProviderChange={trocarProvider}
        onModeloChange={setModelo}
        nenhumConfigurado={nenhumConfigurado}
      />
      <label className="glass flex min-h-[80px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/15 p-4 text-center text-muted transition-colors hover:border-violet/40">
        <input
          type="file"
          accept=".pdf,.txt,.md,.docx,.pptx"
          className="hidden"
          disabled={loading}
          onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
        />
        <span className="text-[0.82rem]">
          {arquivo ? `📄 ${arquivo.name}` : 'Clique para escolher o arquivo da apostila'}
        </span>
      </label>
      <div className="mt-3 flex gap-2">
        <button
          onClick={gerar}
          disabled={loading || !arquivo || !pronto}
          className="rounded-lg bg-gradient-to-r from-violet to-cyan px-5 py-2.5 text-sm font-semibold text-[#08070c] transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {loading ? 'Analisando apostila…' : 'Gerar resumo'}
        </button>
        <button
          onClick={() => {
            setArquivo(null)
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
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/10 text-muted">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet/30 border-t-violet" />
            <span className="text-[0.82rem]">Lendo o material e compondo o resumo — pode levar um tempo em apostilas grandes…</span>
          </div>
        )}
        {!loading && erro && (
          <div className="rounded-xl border border-rose-400/25 bg-rose-400/10 p-6 text-center text-[0.85rem] text-rose-300">
            ⚠️ {erro}
          </div>
        )}
        {!loading && !erro && resultado && (
          <div ref={resultCardRef} className="glass grad-border overflow-hidden rounded-xl">
            <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.02] px-4 py-3 font-mono text-[0.68rem] uppercase tracking-wider text-muted">
              <span>
                Resumo — {resultado.arquivo} ({resultado.provider} / {resultado.modelo})
              </span>
              <button
                onClick={exportarMarkdown}
                className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[0.72rem] font-medium normal-case tracking-normal text-text transition-colors hover:bg-white/[0.06]"
              >
                ⬇️ Exportar .md
              </button>
            </div>
            <div className="p-5">
              {resultado.amostrado && (
                <div className="mb-4 rounded-lg border border-amber-400/25 bg-amber-400/10 p-3 text-[0.78rem] text-amber-300">
                  Apostila grande: o resumo usou uma amostra de {resultado.chunks_usados} de{' '}
                  {resultado.chunks_total} trechos, distribuídos por todo o documento.
                </div>
              )}
              <Markdown>{resultado.resumo}</Markdown>
            </div>
          </div>
        )}
        {!loading && !erro && !resultado && (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 text-center text-muted">
            <span className="text-2xl opacity-50">📚</span>
            <span className="text-[0.82rem]">O resumo da apostila aparecerá aqui</span>
          </div>
        )}
      </div>
    </div>
  )
}
