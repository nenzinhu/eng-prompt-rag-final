'use client'

import { useEffect, useState } from 'react'
import { FileText, FileType, TriangleAlert, CircleCheck, BookOpen, Sparkles } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useProviderModel } from '@/lib/useProviderModel'
import type { ProvidersResp } from '@/lib/types'
import ProviderSelect from '../ProviderSelect'
import AnexoImagem from '../AnexoImagem'

const CHAVE_INTERESSES = 'epi:apostila:interesses'
const MAX_INTERESSES = 120
const SUGESTOES = ['futebol', 'games', 'música', 'cozinha', 'séries', 'carros', 'academia', 'viagens']

export default function ApostilaTab({ providers }: { providers: ProvidersResp }) {
  const { provider, modelo, trocarProvider, setModelo, pronto, nenhumConfigurado } = useProviderModel(providers)
  const [tema, setTema] = useState('')
  const [formato, setFormato] = useState<'pdf' | 'docx'>('pdf')
  const [loading, setLoading] = useState(false)
  const [ocrLoading, setOcrLoading] = useState(false)
  // Esta aba não tem botão de limpar: os anexos nunca precisam ser esvaziados.
  const anexoReset = 0
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState(false)
  const [interesses, setInteresses] = useState('')

  // Os interesses do aluno ficam lembrados neste navegador.
  useEffect(() => {
    try {
      setInteresses(localStorage.getItem(CHAVE_INTERESSES) ?? '')
    } catch {
      // localStorage indisponível — o campo só começa vazio
    }
  }, [])

  function mudarInteresses(valor: string) {
    const v = valor.slice(0, MAX_INTERESSES)
    setInteresses(v)
    try {
      localStorage.setItem(CHAVE_INTERESSES, v)
    } catch {
      // ignore
    }
  }

  function alternarSugestao(s: string) {
    const lista = interesses.split(',').map((x) => x.trim()).filter(Boolean)
    const tem = lista.some((x) => x.toLowerCase() === s.toLowerCase())
    mudarInteresses((tem ? lista.filter((x) => x.toLowerCase() !== s.toLowerCase()) : [...lista, s]).join(', '))
  }

  async function gerar() {
    if (!tema.trim()) return
    setLoading(true)
    setErro('')
    setOk(false)
    try {
      await api.gerarApostila(tema.trim(), formato, provider, modelo, interesses)
      setOk(true)
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Erro ao gerar apostila')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <p className="mb-4 font-mono text-[0.7rem] uppercase tracking-wider text-muted">
        Gerador de Apostilas — diga o tema e a IA escreve uma apostila completa cobrindo o assunto,
        pronta para baixar em PDF ou Word
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
        placeholder="Ex: Chain-of-thought prompting, Fundamentos de few-shot learning, Segurança em prompts..."
        className="glass min-h-[90px] w-full rounded-xl p-4 font-mono text-[0.82rem] leading-relaxed text-text outline-none placeholder:text-muted focus:border-violet/40"
      />
      <AnexoImagem
        texto={tema}
        setTexto={setTema}
        desabilitado={loading}
        onProcessando={setOcrLoading}
        aplicarFormatoAlternativas={false}
        resetToken={anexoReset}
        dica="Imagem, PDF ou DOCX com o tema/ementa — o texto entra na caixa acima, com OCR"
      />

      <div className="glass mt-3 rounded-xl p-4">
        <label
          htmlFor="apostila-interesses"
          className="mb-1 flex items-center gap-1.5 font-mono text-[0.68rem] uppercase tracking-wider text-lime"
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Analogias do seu mundo (opcional)
        </label>
        <p className="mb-2 text-[0.78rem] text-muted">
          Conte do que você gosta e a apostila explica os conceitos com analogias desse universo.
        </p>
        <input
          id="apostila-interesses"
          type="text"
          value={interesses}
          onChange={(e) => mudarInteresses(e.target.value)}
          maxLength={MAX_INTERESSES}
          placeholder="Ex: futebol, games, cozinha"
          className="glass w-full rounded-lg px-3 py-2 text-[0.82rem] text-text outline-none placeholder:text-muted focus:border-violet/40"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SUGESTOES.map((s) => {
            const ativo = interesses.toLowerCase().split(',').map((x) => x.trim()).includes(s)
            return (
              <button
                key={s}
                type="button"
                onClick={() => alternarSugestao(s)}
                aria-pressed={ativo}
                className={`rounded-full border px-2.5 py-0.5 text-[0.72rem] transition-colors ${
                  ativo
                    ? 'border-lime/50 bg-lime/10 text-lime'
                    : 'border-white/10 bg-white/[0.03] text-muted hover:text-text'
                }`}
              >
                {s}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          <button
            onClick={() => setFormato('pdf')}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-medium transition-colors ${
              formato === 'pdf'
                ? 'bg-gradient-to-r from-violet to-cyan text-[#08070c]'
                : 'border border-white/10 bg-white/[0.03] text-text hover:bg-white/[0.06]'
            }`}
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            PDF
          </button>
          <button
            onClick={() => setFormato('docx')}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-medium transition-colors ${
              formato === 'docx'
                ? 'bg-gradient-to-r from-violet to-cyan text-[#08070c]'
                : 'border border-white/10 bg-white/[0.03] text-text hover:bg-white/[0.06]'
            }`}
          >
            <FileType className="h-4 w-4" aria-hidden="true" />
            Word (.docx)
          </button>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          onClick={gerar}
          disabled={loading || ocrLoading || !tema.trim() || !pronto}
          className="rounded-lg bg-gradient-to-r from-violet to-cyan px-5 py-2.5 text-sm font-semibold text-[#08070c] transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {loading ? 'Escrevendo apostila…' : 'Gerar apostila'}
        </button>
      </div>

      <div className="mt-6">
        {loading && (
          <div className="flex min-h-[160px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/10 text-muted">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet/30 border-t-violet" />
            <span className="text-[0.82rem]">Pesquisando o material e escrevendo a apostila…</span>
          </div>
        )}
        {!loading && erro && (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-rose-400/25 bg-rose-400/10 p-6 text-center text-[0.85rem] text-rose-300">
            <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
            {erro}
          </div>
        )}
        {!loading && !erro && ok && (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-cyan/25 bg-cyan/10 p-6 text-center text-[0.85rem] text-cyan">
            <CircleCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
            Apostila gerada — o download deve ter começado automaticamente.
          </div>
        )}
        {!loading && !erro && !ok && (
          <div className="flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 text-center text-muted">
            <BookOpen className="h-6 w-6 opacity-50" aria-hidden="true" />
            <span className="text-[0.82rem]">A apostila gerada será baixada automaticamente</span>
          </div>
        )}
      </div>
    </div>
  )
}
