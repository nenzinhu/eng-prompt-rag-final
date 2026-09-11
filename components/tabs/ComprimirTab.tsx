'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '@/lib/api'
import type { OpcoesImagem } from '@/lib/compress/imagem'
import type { OpcoesCompressao } from '@/lib/compress/pdf'

type Tipo = 'pdf' | 'imagem'
type Status = 'na_fila' | 'processando' | 'pronto' | 'erro'

interface Item {
  id: string
  nome: string
  arquivo: File
  tipo: Tipo
  original: number
  status: Status
  saida?: Blob
  tamanho?: number
  ganho?: number
  /** Resumo do que foi feito (para PDF: quantas imagens foram reencodadas). */
  detalhe?: string
  erro?: string
  url?: string
}

const EXTENSOES_PDF = /\.pdf$/i
const EXTENSOES_IMAGEM = /\.(jpe?g|png|webp)$/i

function mb(n: number): string {
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

function nomeSaida(nome: string, formato?: 'jpeg' | 'png'): string {
  if (formato === 'jpeg') return nome.replace(/\.[^.]+$/, '') + '.jpg'
  if (formato === 'png') return nome.replace(/\.[^.]+$/, '') + '.png'
  return nome.replace(/(\.[^.]+)$/, '-comprimido$1')
}

/**
 * Aba "Comprimir": reduz PDF, JPEG e PNG antes de enviar.
 *
 * Por que no navegador: a função da Vercel recusa corpos acima de 4,5 MB, então
 * um PDF grande nunca chegaria ao servidor para ser comprimido. Aqui o arquivo
 * não sai da máquina do aluno, não custa nada e não tem limite de tamanho.
 * O texto do PDF é preservado — só as imagens de dentro são reencodadas.
 */
export default function ComprimirTab() {
  const [itens, setItens] = useState<Item[]>([])
  const [qualidade, setQualidade] = useState(70)
  const [larguraMax, setLarguraMax] = useState(1200)
  const [formato, setFormato] = useState<'auto' | 'jpeg' | 'png'>('auto')
  const [limiteMb, setLimiteMb] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [progresso, setProgresso] = useState<{ atual: number; total: number } | null>(null)
  const [avisoEntrada, setAvisoEntrada] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const itensRef = useRef<Item[]>([])

  useEffect(() => {
    api
      .config()
      .then((c) => setLimiteMb(c.max_upload_mb))
      .catch(() => undefined)
  }, [])

  // A lista vive numa ref para o efeito de limpeza rodar SÓ ao sair da aba.
  // Com `itens` nas dependências, cada arquivo concluído revogaria as URLs dos
  // que já estavam prontos — e o download deles pararia de funcionar.
  useEffect(() => {
    itensRef.current = itens
  }, [itens])

  useEffect(() => {
    return () => {
      for (const i of itensRef.current) if (i.url) URL.revokeObjectURL(i.url)
    }
  }, [])

  function adicionar(files: File[]) {
    const novos: Item[] = []
    const ignorados: string[] = []
    for (const f of files) {
      const ehPdf = EXTENSOES_PDF.test(f.name)
      const ehImagem = EXTENSOES_IMAGEM.test(f.name)
      if (!ehPdf && !ehImagem) {
        ignorados.push(f.name)
        continue
      }
      novos.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        nome: f.name,
        arquivo: f,
        tipo: ehPdf ? 'pdf' : 'imagem',
        original: f.size,
        status: 'na_fila',
      })
    }
    setAvisoEntrada(
      ignorados.length > 0
        ? `${ignorados.length} ${ignorados.length === 1 ? 'arquivo foi ignorado' : 'arquivos foram ignorados'}: use PDF, JPEG, PNG ou WebP.`
        : null
    )
    if (novos.length > 0) setItens((atual) => [...atual, ...novos])
  }

  function atualizar(id: string, mudanca: Partial<Item>) {
    setItens((atual) => atual.map((i) => (i.id === id ? { ...i, ...mudanca } : i)))
  }

  /** Libera as URLs de objeto (só depois de o arquivo sair da lista). */
  function revogar(lista: Item[]) {
    for (const i of lista) if (i.url) URL.revokeObjectURL(i.url)
  }

  async function comprimirUm(item: Item): Promise<Partial<Item>> {
    // pdf-lib é grande (~180 kB): carrega sob demanda, só quando houver um PDF
    // para comprimir, para não pesar a primeira abertura do app.
    if (item.tipo === 'pdf') {
      const [{ comprimirPdf }, { dependenciasNavegador }] = await Promise.all([
        import('@/lib/compress/pdf'),
        import('@/lib/compress/canvas'),
      ])
      const bytes = new Uint8Array(await item.arquivo.arrayBuffer())
      const opcoes: OpcoesCompressao = { larguraMax, qualidade }
      const r = await comprimirPdf(bytes, opcoes, dependenciasNavegador)
      const saida = new Blob([r.pdf as BlobPart], { type: 'application/pdf' })
      const detalhe =
        r.resumo.reencodadas > 0
          ? `${r.resumo.reencodadas} de ${r.resumo.imagens} imagens reencodadas` +
            (r.resumo.ignoradas > 0 ? ` · ${r.resumo.ignoradas} mantidas` : '')
          : r.resumo.imagens === 0
            ? 'nenhuma imagem para reencodar — só texto'
            : 'nenhuma imagem pôde ser reencodada com estes ajustes'
      return { saida, tamanho: saida.size, ganho: 1 - saida.size / item.original, detalhe }
    }

    const { comprimirImagem } = await import('@/lib/compress/imagem')
    const opcoes: OpcoesImagem = { larguraMax, qualidade, formato }
    const r = await comprimirImagem(item.arquivo, opcoes)
    const detalhe = `${r.larguraOriginal}×${r.alturaOriginal} → ${r.largura}×${r.altura} · ${r.formato.toUpperCase()}`
    return { saida: r.blob, tamanho: r.blob.size, ganho: r.ganho, detalhe }
  }

  async function processar() {
    setOcupado(true)
    setProgresso({ atual: 0, total: itens.length })
    // Reprocessa TODOS: a compressão sempre parte do arquivo ORIGINAL (ele fica
    // guardado no item), então mudar os ajustes e clicar de novo refaz o
    // trabalho do zero, sem comprimir o que já estava comprimido.
    try {
      for (const [indice, item] of itens.entries()) {
        setProgresso({ atual: indice + 1, total: itens.length })
        if (item.url) URL.revokeObjectURL(item.url)
        atualizar(item.id, { status: 'processando', erro: undefined, url: undefined })
        try {
          const r = await comprimirUm(item)
          const url = r.saida ? URL.createObjectURL(r.saida) : undefined
          atualizar(item.id, { ...r, status: 'pronto', url })
        } catch (e) {
          atualizar(item.id, {
            status: 'erro',
            erro: e instanceof Error ? e.message : String(e),
          })
        }
        // Deixa o navegador pintar a tela entre um arquivo e outro.
        await new Promise((r) => setTimeout(r, 0))
      }
    } finally {
      setOcupado(false)
      setProgresso(null)
    }
  }

  function baixar(item: Item) {
    if (!item.url) return
    const a = document.createElement('a')
    a.href = item.url
    a.download = nomeSaida(item.nome, item.tipo === 'imagem' && item.detalhe?.includes('JPEG') ? 'jpeg' : undefined)
    a.click()
  }

  const prontos = itens.filter((i) => i.status === 'pronto' && i.tamanho)
  const totalAntes = prontos.reduce((s, i) => s + i.original, 0)
  const totalDepois = prontos.reduce((s, i) => s + (i.tamanho ?? 0), 0)
  const ganhoTotal = totalAntes > 0 ? 1 - totalDepois / totalAntes : 0

  const abaixoDoLimite = useMemo(
    () =>
      limiteMb !== null
        ? prontos.filter((i) => i.tipo === 'pdf' && (i.tamanho ?? 0) <= limiteMb * 1024 * 1024).length
        : 0,
    [prontos, limiteMb]
  )
  const acimaDoLimite = useMemo(
    () =>
      limiteMb !== null
        ? prontos.filter((i) => i.tipo === 'pdf' && (i.tamanho ?? 0) > limiteMb * 1024 * 1024).length
        : 0,
    [prontos, limiteMb]
  )

  const opcoesLargura = [800, 1200, 1600, 2000, 3000]

  return (
    <div>
      <p className="mb-4 font-mono text-[0.7rem] uppercase tracking-wider text-muted">
        Reduza o arquivo antes de enviá-lo
      </p>

      <div
        role="button"
        tabIndex={0}
        aria-label="Selecionar arquivos para compactar"
        aria-describedby="formatos-compativeis"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          adicionar(Array.from(e.dataTransfer.files))
        }}
        className={`glass mb-4 cursor-pointer rounded-xl border-2 border-dashed p-7 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet focus-visible:ring-offset-2 focus-visible:ring-offset-[#08070c] sm:p-9 ${
          dragOver ? 'border-violet bg-violet/[0.04]' : 'border-white/10'
        }`}
      >
        <div className="mb-2 text-3xl text-cyan" aria-hidden="true">⬆</div>
        <p className="text-[0.85rem] text-muted">
          <strong className="font-medium text-text">Selecione os arquivos</strong>
          <br />
          <span className="hidden sm:inline">ou arraste-os para esta área<br /></span>
          <span id="formatos-compativeis">PDF, JPEG, PNG e WebP</span>
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            adicionar(Array.from(e.target.files ?? []))
            e.target.value = ''
          }}
        />
      </div>

      {avisoEntrada && (
        <div role="alert" className="mb-4 rounded-lg border border-amber-300/25 bg-amber-300/10 px-3.5 py-2.5 text-[0.78rem] text-amber-200">
          ⚠️ {avisoEntrada}
        </div>
      )}

      <div className="glass mb-4 grid grid-cols-1 items-end gap-4 rounded-xl p-4 sm:grid-cols-2 xl:grid-cols-[auto_auto_auto_1fr]">
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[0.65rem] uppercase tracking-wider text-muted">
            Qualidade do JPEG: {qualidade}
          </span>
          <input
            type="range"
            min={30}
            max={95}
            step={5}
            value={qualidade}
            aria-label={`Qualidade do JPEG: ${qualidade}`}
            onChange={(e) => setQualidade(Number(e.target.value))}
            className="h-11 w-[180px] accent-violet focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[0.65rem] uppercase tracking-wider text-muted">Largura máxima</span>
          <select
            value={larguraMax}
            onChange={(e) => setLarguraMax(Number(e.target.value))}
            className="glass min-h-11 rounded-lg px-3 py-2 font-mono text-[0.78rem] text-text outline-none focus-visible:ring-2 focus-visible:ring-violet"
          >
            {opcoesLargura.map((px) => (
              <option key={px} value={px} className="bg-[#0b0a12]">
                {px} px
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[0.65rem] uppercase tracking-wider text-muted">Formato da imagem</span>
          <select
            value={formato}
            onChange={(e) => setFormato(e.target.value as 'auto' | 'jpeg' | 'png')}
            className="glass min-h-11 rounded-lg px-3 py-2 font-mono text-[0.78rem] text-text outline-none focus-visible:ring-2 focus-visible:ring-violet"
          >
            <option value="auto" className="bg-[#0b0a12]">
              automático
            </option>
            <option value="jpeg" className="bg-[#0b0a12]">
              JPEG (menor)
            </option>
            <option value="png" className="bg-[#0b0a12]">
              PNG (sem perda)
            </option>
          </select>
        </label>
        <div className="flex w-full flex-col gap-2 sm:col-span-2 sm:flex-row xl:col-span-1 xl:ml-auto xl:w-auto">
          <button
            onClick={processar}
            disabled={ocupado || itens.length === 0}
            aria-busy={ocupado}
            aria-describedby={itens.length === 0 ? 'ajuda-comprimir' : undefined}
            className="min-h-11 rounded-lg bg-gradient-to-r from-violet to-cyan px-5 py-2.5 text-sm font-semibold text-[#08070c] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-[#08070c] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {ocupado && progresso
              ? `Comprimindo ${progresso.atual} de ${progresso.total}…`
              : itens.some((i) => i.status === 'pronto')
                ? 'Comprimir novamente'
                : 'Comprimir arquivos'}
          </button>
          {itens.length > 0 && (
            <button
              onClick={() => {
                revogar(itens)
                setItens([])
                setAvisoEntrada(null)
              }}
              disabled={ocupado}
              className="min-h-11 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-text transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet disabled:cursor-not-allowed disabled:opacity-40"
            >
              Limpar lista
            </button>
          )}
          {itens.length === 0 && (
            <span id="ajuda-comprimir" className="sr-only">Adicione pelo menos um arquivo para continuar.</span>
          )}
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 text-[0.76rem] leading-relaxed text-muted">
        <p>
          <strong className="font-medium text-text">Privacidade:</strong> a compactação acontece neste
          navegador; seus arquivos não são enviados para outro serviço.
        </p>
        <p className="mt-1.5">
          Em PDFs, o texto pesquisável é preservado. Somente as imagens internas são reduzidas quando
          isso realmente diminui o arquivo. PDFs digitalizados continuam sendo imagens.
        </p>
      </div>

      {prontos.length > 0 && (
        <div role="status" aria-live="polite" className="mb-4 rounded-xl border border-cyan/20 bg-cyan/[0.05] px-4 py-2.5">
          <p className="font-mono text-[0.72rem] text-cyan">
            {prontos.length} {prontos.length === 1 ? 'arquivo compactado' : 'arquivos compactados'}: {mb(totalAntes)} → {mb(totalDepois)}
            {' '}(−{(ganhoTotal * 100).toFixed(0)}%)
          </p>
          {prontos.length > 1 && (
            <p className="mt-1 text-[0.72rem] text-muted">
              Baixe cada resultado separadamente. Assim o navegador não bloqueia vários downloads automáticos.
            </p>
          )}
        </div>
      )}

      {abaixoDoLimite > 0 && limiteMb !== null && (
        <div role="status" className="mb-4 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3.5 py-2.5 text-[0.78rem] text-emerald-300">
          ✓ {abaixoDoLimite} {abaixoDoLimite === 1 ? 'PDF está pronto' : 'PDFs estão prontos'} para o envio
          (limite de {limiteMb} MB). Baixe e envie pela aba PDFs.
        </div>
      )}

      {acimaDoLimite > 0 && limiteMb !== null && (
        <div role="alert" className="mb-4 rounded-lg border border-amber-300/25 bg-amber-300/10 px-3.5 py-2.5 text-[0.78rem] text-amber-200">
          ⚠️ {acimaDoLimite} {acimaDoLimite === 1 ? 'PDF ainda está' : 'PDFs ainda estão'} acima de {limiteMb} MB.
          Tente qualidade menor e largura de 800 px. Se não for suficiente, indexe pelo app local.
        </div>
      )}

      {itens.length > 0 && (
        <div className="flex flex-col gap-2">
          {itens.map((item) => (
            <div key={item.id} className="glass rounded-xl p-3.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-[0.95rem]" aria-hidden="true">{item.tipo === 'pdf' ? '📕' : '🖼️'}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-[0.78rem] text-text" title={item.nome}>
                  {item.nome}
                </span>
                <span className="shrink-0 font-mono text-[0.72rem] text-muted">{mb(item.original)}</span>
                {item.status === 'processando' && (
                  <span role="status" className="shrink-0 font-mono text-[0.7rem] text-cyan">Comprimindo…</span>
                )}
                {item.status === 'pronto' && item.tamanho !== undefined && (
                  <>
                    <span className="font-mono text-[0.72rem] text-muted">→</span>
                    <span className="font-mono text-[0.78rem] font-semibold text-cyan">{mb(item.tamanho)}</span>
                    <span
                      className={`rounded-md px-1.5 py-0.5 font-mono text-[0.68rem] ${
                        (item.ganho ?? 0) > 0
                          ? 'bg-emerald-400/15 text-emerald-300'
                          : 'bg-amber-300/15 text-amber-300'
                      }`}
                    >
                      {(item.ganho ?? 0) > 0 ? `−${((item.ganho ?? 0) * 100).toFixed(0)}%` : 'não reduziu'}
                    </span>
                    <button
                      onClick={() => baixar(item)}
                      className="min-h-11 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[0.75rem] font-medium text-text transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
                    >
                      Baixar arquivo
                    </button>
                  </>
                )}
                {item.status === 'erro' && (
                  <span role="alert" className="text-[0.75rem] text-rose-300">⚠️ Não foi possível compactar: {item.erro}</span>
                )}
                <button
                  onClick={() => {
                    if (item.url) URL.revokeObjectURL(item.url)
                    setItens((atual) => atual.filter((i) => i.id !== item.id))
                  }}
                  disabled={ocupado}
                  className="min-h-11 min-w-11 rounded-lg px-2 text-muted transition-colors hover:bg-white/[0.05] hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={`Remover ${item.nome} da lista`}
                  title="Remover da lista"
                >
                  <span aria-hidden="true">✕</span>
                </button>
              </div>
              {item.detalhe && (
                <div className="mt-1.5 pl-7 font-mono text-[0.68rem] text-muted">{item.detalhe}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
