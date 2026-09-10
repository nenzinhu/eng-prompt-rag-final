export interface StatusResp {
  status: 'ready' | 'empty'
  total: number
  /** 'anon' significa que a escrita ainda usa a chave pública — estado inseguro. */
  escrita_via?: 'service_role' | 'anon'
  cache?: boolean
}

export interface ConfigResp {
  admin_necessario: boolean
  escrita_via: 'service_role' | 'anon'
  inseguro: boolean
  extensoes: string[]
  max_upload_mb: number
}

export interface ProviderInfo {
  label: string
  models: string[]
  configurado: boolean
}

export type ProvidersResp = Record<string, ProviderInfo>

export interface Evidencia {
  conteudo: string
  fonte: string
  pagina?: number
  relevancia?: number
}

export interface BuscarResultado {
  conteudo: string
  fonte: string
  pagina?: number
  relevancia: number
}

export interface BuscarResp {
  resultados: BuscarResultado[]
}

export interface PerguntarResp {
  resposta: string
  contexto: Evidencia[]
  pouco_embasado: boolean
  confianca_media: number
  provider: string
  modelo: string
}

export interface ResolverResp {
  questao: string
  alternativas: Record<string, string>
  resposta: string | null
  conteudo_resposta: string
  explicacao: string
  explicacao_rapida: string
  explicacao_detalhada: string
  alternativas_erradas: Record<string, string>
  pouco_embasado: boolean
  confianca_media: number
  contexto: Evidencia[]
  provider: string
  modelo: string
}

export interface SimplificarResp {
  resposta: string
  provider: string
  modelo: string
}

export interface VerificarResp {
  perguntas: string[]
  provider: string
  modelo: string
}

export interface TermoGlossario {
  termo: string
  explicacao: string
  exemplo?: string
}

export interface GlossarioResp {
  termos: TermoGlossario[]
  provider: string
  modelo: string
  /** Presente quando os termos foram exibidos mas não puderam ser salvos. */
  aviso_salvamento?: string
}

export interface PdfsResp {
  arquivos: string[]
}

export interface IngerirResp {
  ok: boolean
  arquivo?: string
  /** Quantidade processada NESTA chamada. */
  processado?: number
  total?: number
  proximo_offset?: number
  done?: boolean
  avisos?: string[]
  erro?: string
}

export interface PreviaIngestaoResp {
  arquivo: string
  paginas: number
  paginas_com_texto: number
  chunks_existentes: number
  chunks_novos: number
  /** Texto já indexado, em caracteres — é isso que mede perda de conteúdo. */
  chars_existentes: number
  chars_novos: number
  /** Quantos chunks a reindexação removeria do índice atual. */
  perda: number
  perda_texto_percentual: number
  avisos: string[]
  ok: boolean
}

export interface UploadSubstituicao {
  arquivo: string
  substituiu: string
  motivo: string
}

export interface UploadIgnorado {
  arquivo: string
  motivo: string
}

export interface UploadResp {
  salvos: string[]
  substituidos?: UploadSubstituicao[]
  ignorados?: UploadIgnorado[]
}

// ── Comparação entre modelos ────────────────────────────────────────────────

export interface CompararAlvo {
  provider: string
  modelo: string
}

export interface CompararResposta {
  provider: string
  modelo: string
  rotulo: string
  resposta: string
  resposta_direta: string
  segundos: number
  erro: string | null
}

export interface FatoExclusivo {
  fato: string
  modelo: string
}

export type NivelConcordancia = 'alta' | 'media' | 'baixa' | 'indefinida'

export interface CompararResp {
  pergunta: string
  respostas: CompararResposta[]
  nivel_concordancia: NivelConcordancia
  divergencia_numerica: boolean
  similaridade_conclusoes: number
  numeros_comuns: string[]
  numeros_exclusivos: FatoExclusivo[]
  nomes_comuns: string[]
  nomes_exclusivos: FatoExclusivo[]
  sem_fatos: boolean
  modelos_ok: number
  modelos_total: number
  pouco_embasado: boolean
  confianca_media: number
  contexto: Evidencia[]
}
