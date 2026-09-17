'use client'

import { useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { ImageOff, X, CircleCheck, TriangleAlert, Paperclip, FileText } from 'lucide-react'
import { encerrarWorker, reconhecerImagem } from '@/lib/ocr'
import { ACEITOS, extrairTextoDocumento, tipoDoArquivo } from '@/lib/documento'
import { formatarAlternativas, limparTextoOcr } from '@/lib/texto'

type Status = 'lendo' | 'pronto' | 'erro' | 'vazio'

interface Anexo {
  id: string
  nome: string
  /** Guardado para permitir reler a mesma imagem sem anexá-la de novo. */
  arquivo?: File
  /** URL de objeto para a prévia — precisa ser revogada ao remover. */
  url: string
  status: Status
  progresso: number
  /** Texto que ESTE anexo inseriu no campo, para poder retirá-lo depois. */
  texto: string
  erro?: string
}

const MAX_BYTES = 25 * 1024 * 1024

function novoId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** Acrescenta o bloco ao fim do campo, sem apagar o que já foi digitado. */
function inserir(atual: string, bloco: string): string {
  const existente = atual.trimEnd()
  return existente ? `${existente}\n\n${bloco}` : bloco
}

/**
 * Retira o bloco do campo. Se o aluno editou o texto extraído, o bloco exato
 * não é encontrado e nada é alterado — melhor não mexer do que apagar conteúdo
 * digitado à mão.
 */
function removerBloco(atual: string, bloco: string): string {
  if (!bloco) return atual
  const posicao = atual.indexOf(bloco)
  if (posicao < 0) return atual
  return (atual.slice(0, posicao) + atual.slice(posicao + bloco.length))
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Anexo de imagens com extração de texto (OCR) para os campos de pergunta.
 *
 * O texto lido entra no campo como texto comum — o aluno revisa e corrige antes
 * de enviar. Várias imagens são lidas em sequência, na ordem em que foram
 * anexadas, porque a ordem das partes costuma ser a ordem da questão.
 */
export default function AnexoImagem({
  setTexto,
  desabilitado = false,
  onProcessando,
  aplicarFormatoAlternativas = true,
  resetToken,
  dica,
}: {
  texto: string
  setTexto: Dispatch<SetStateAction<string>>
  desabilitado?: boolean
  /** Avisa a aba quando há leitura em andamento (para travar o botão de enviar). */
  onProcessando?: (ocupado: boolean) => void
  /** Separa alternativas grudadas ("A) x B) y") em linhas — útil em questões. */
  aplicarFormatoAlternativas?: boolean
  /** Muda de valor quando a aba limpa o campo: esvazia os anexos junto. */
  resetToken?: number
  dica?: string
}) {
  const [anexos, setAnexos] = useState<Anexo[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const fila = useRef<{ id: string; file: File }[]>([])
  const drenando = useRef(false)
  const anexosRef = useRef<Anexo[]>([])

  const lendo = anexos.some((a) => a.status === 'lendo')

  useEffect(() => {
    anexosRef.current = anexos
  }, [anexos])

  useEffect(() => {
    onProcessando?.(lendo)
  }, [lendo, onProcessando])

  // O worker do OCR é global no módulo; encerra ao desmontar para não deixar
  // memória presa quando a aba sai da árvore. Também libera as prévias.
  useEffect(() => {
    return () => {
      for (const a of anexosRef.current) if (a.url) URL.revokeObjectURL(a.url)
      void encerrarWorker()
    }
  }, [])

  // A aba limpou o campo: descarta as prévias. Quem limpou já esvaziou o texto,
  // então aqui não se toca no campo.
  useEffect(() => {
    if (resetToken === undefined) return
    for (const a of anexosRef.current) if (a.url) URL.revokeObjectURL(a.url)
    fila.current = []
    setAnexos([])
  }, [resetToken])

  function atualizar(id: string, mudanca: Partial<Anexo>) {
    setAnexos((atual) => atual.map((a) => (a.id === id ? { ...a, ...mudanca } : a)))
  }

  async function ler(id: string, file: File) {
    atualizar(id, { status: 'lendo', progresso: 0, erro: undefined })
    try {
      const progresso = (fracao: number) => atualizar(id, { progresso: fracao })
      const ehImagem = tipoDoArquivo(file) === 'imagem'
      const bruto = ehImagem
        ? await reconhecerImagem(file, progresso)
        : await extrairTextoDocumento(file, progresso)
      const limpo = ehImagem ? limparTextoOcr(bruto) : bruto.replace(/\n{3,}/g, '\n\n').trim()
      if (!limpo) {
        atualizar(id, { status: 'vazio', progresso: 1 })
        return
      }
      const bloco = aplicarFormatoAlternativas ? formatarAlternativas(limpo) : limpo
      setTexto((atual) => inserir(atual, bloco))
      atualizar(id, { status: 'pronto', progresso: 1, texto: bloco })
    } catch (e) {
      atualizar(id, {
        status: 'erro',
        progresso: 0,
        erro: e instanceof Error ? e.message : String(e),
      })
    }
  }

  /** Processa a fila uma imagem por vez: o worker não aceita duas ao mesmo tempo. */
  async function drenar() {
    if (drenando.current) return
    drenando.current = true
    try {
      while (fila.current.length) {
        const item = fila.current.shift()
        if (item) await ler(item.id, item.file)
      }
    } finally {
      drenando.current = false
    }
  }

  function adicionarSelecionadas(lista: FileList | null) {
    if (!lista || lista.length === 0) return
    const novos: Anexo[] = []
    for (const file of Array.from(lista)) {
      if (!tipoDoArquivo(file)) {
        novos.push({
          id: novoId(),
          nome: file.name,
          url: '',
          status: 'erro',
          progresso: 0,
          texto: '',
          erro: 'formato não suportado',
        })
        continue
      }
      if (file.size > MAX_BYTES) {
        novos.push({
          id: novoId(),
          nome: file.name,
          url: '',
          status: 'erro',
          progresso: 0,
          texto: '',
          erro: `maior que ${Math.round(MAX_BYTES / (1024 * 1024))} MB`,
        })
        continue
      }
      const id = novoId()
      novos.push({
        id,
        nome: file.name,
        arquivo: file,
        url: tipoDoArquivo(file) === 'imagem' ? URL.createObjectURL(file) : '',
        status: 'lendo',
        progresso: 0,
        texto: '',
      })
      fila.current.push({ id, file })
    }
    setAnexos((atual) => [...atual, ...novos])
    void drenar()
  }

  function remover(id: string) {
    const alvo = anexos.find((a) => a.id === id)
    if (!alvo) return
    if (alvo.url) URL.revokeObjectURL(alvo.url)
    if (alvo.texto) setTexto((atual) => removerBloco(atual, alvo.texto))
    fila.current = fila.current.filter((i) => i.id !== id)
    setAnexos((atual) => atual.filter((a) => a.id !== id))
  }

  function reler(id: string, file: File) {
    atualizar(id, { status: 'lendo', progresso: 0, erro: undefined })
    fila.current.push({ id, file })
    void drenar()
  }

  function limpar() {
    for (const a of anexos) {
      if (a.url) URL.revokeObjectURL(a.url)
      if (a.texto) setTexto((atual) => removerBloco(atual, a.texto))
    }
    fila.current = []
    setAnexos([])
  }

  const prontos = anexos.filter((a) => a.status === 'pronto').length
  const problemas = anexos.filter((a) => a.status === 'erro' || a.status === 'vazio').length

  return (
    <div className="mt-3">
      <input
        ref={inputRef}
        type="file"
        accept={ACEITOS}
        multiple
        hidden
        onChange={(e) => {
          adicionarSelecionadas(e.target.files)
          e.target.value = '' // permite anexar o mesmo arquivo de novo
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={desabilitado}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-[0.82rem] font-medium text-text transition-colors hover:bg-white/[0.06] disabled:opacity-40"
          aria-label="Anexar imagens ou documentos para extrair o texto"
        >
          <Paperclip className="h-4 w-4" aria-hidden="true" />
          Anexar imagem ou documento
        </button>

        {anexos.length > 0 && (
          <button
            type="button"
            onClick={limpar}
            disabled={desabilitado || lendo}
            className="font-mono text-[0.7rem] text-muted underline-offset-2 hover:text-text hover:underline disabled:opacity-40"
          >
            remover todas
          </button>
        )}

        <span className="text-[0.72rem] text-muted" aria-live="polite">
          {anexos.length === 0
            ? dica ?? 'Imagem, PDF, DOCX ou TXT — o texto é lido aqui no navegador (com OCR)'
            : lendo
              ? `Lendo ${prontos} de ${anexos.length}…`
              : problemas > 0
                ? `${prontos} de ${anexos.length} lidas · ${problemas} com problema`
                : `${prontos} ${prontos === 1 ? 'anexo lido' : 'anexos lidos'}`}
        </span>
      </div>

      {lendo && (
        <p className="mt-2 text-[0.72rem] leading-relaxed text-muted">
          A primeira leitura baixa o modelo de idioma (~15 MB, uma vez só) e pode demorar alguns
          segundos.
        </p>
      )}

      {anexos.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-3">
          {anexos.map((a) => (
            <li
              key={a.id}
              className="w-[190px] rounded-xl border border-white/[0.06] bg-white/[0.02] p-2"
            >
              <div className="relative">
                {a.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.url}
                    alt={`Prévia de ${a.nome}`}
                    className="h-[92px] w-full rounded-lg border border-white/10 object-cover"
                  />
                ) : a.arquivo ? (
                  <div className="flex h-[92px] w-full flex-col items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] text-muted">
                    <FileText className="h-6 w-6" aria-hidden="true" />
                    <span className="font-mono text-[0.6rem] uppercase">{a.nome.split('.').pop()}</span>
                  </div>
                ) : (
                  <div className="flex h-[92px] w-full items-center justify-center rounded-lg border border-dashed border-white/10 opacity-40">
                    <ImageOff className="h-5 w-5" aria-hidden="true" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => remover(a.id)}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-md border border-white/10 bg-[#0b0a12]/85 text-muted transition-colors hover:text-rose-300"
                  aria-label={`Remover ${a.nome}`}
                  title="Remover este anexo"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>

              <div className="mt-1.5 truncate font-mono text-[0.62rem] text-muted" title={a.nome}>
                {a.nome}
              </div>

              {a.status === 'lendo' && (
                <div className="mt-1.5">
                  <div className="mb-1 font-mono text-[0.62rem] text-cyan">
                    lendo… {Math.round(a.progresso * 100)}%
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet to-cyan transition-[width] duration-200"
                      style={{ width: `${Math.max(4, Math.round(a.progresso * 100))}%` }}
                    />
                  </div>
                </div>
              )}

              {a.status === 'pronto' && (
                <div className="mt-1.5 flex items-center gap-1 font-mono text-[0.62rem] text-emerald-300">
                  <CircleCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
                  texto no campo
                </div>
              )}

              {a.status === 'vazio' && (
                <div className="mt-1.5">
                  <div className="text-[0.68rem] leading-snug text-amber-300">
                    Não encontrei texto legível neste arquivo.
                  </div>
                  {a.arquivo && (
                    <button
                      type="button"
                      onClick={() => reler(a.id, a.arquivo!)}
                      className="mt-1 font-mono text-[0.62rem] text-muted underline-offset-2 hover:text-text hover:underline"
                    >
                      ler de novo
                    </button>
                  )}
                </div>
              )}

              {a.status === 'erro' && (
                <div className="mt-1.5">
                  <div className="flex items-start gap-1 text-[0.68rem] leading-snug text-rose-300">
                    <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                    {a.erro}
                  </div>
                  {a.arquivo ? (
                    <button
                      type="button"
                      onClick={() => reler(a.id, a.arquivo!)}
                      className="mt-1 font-mono text-[0.62rem] text-muted underline-offset-2 hover:text-text hover:underline"
                    >
                      ler de novo
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      className="mt-1 font-mono text-[0.62rem] text-muted underline-offset-2 hover:text-text hover:underline"
                    >
                      enviar outra
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
