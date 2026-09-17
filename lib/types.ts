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
  /** Por que o teto de upload é esse (ex.: limite da plataforma na Vercel). */
  limite_upload_motivo?: string
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

export interface ResumoApostilaResp {
  resumo: string
  provider: string
  modelo: string
  arquivo: string
  chunks_usados: number
  chunks_total: number
  amostrado: boolean
}

export type NivelFidelidade = 'apoiada' | 'parcial' | 'nao_apoiada'

export interface FraseAuditada {
  frase: string
  nivel: NivelFidelidade
  similaridade: number
  fonte?: string | null
  pagina?: number | null
}

export interface AuditarResp {
  frases: FraseAuditada[]
  resumo: { apoiadas: number; parciais: number; nao_apoiadas: number }
}

export interface ResolverResp {
  questao: string
  alternativas: Record<string, string>
  resposta: string | null
  conteudo_resposta: string
  explicacao: string
  explicacao_rapida: string
  explicacao_detalhada: string
  /** "Professor auxiliar": por que a alternativa escolhida é a correta. */
  por_que_correta: string
  /** 1-2 exemplos concretos que mostram o conceito funcionando. */
  exemplos: string[]
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
  /** Formato antigo: um exemplo só. Mantido para não quebrar o que já existe. */
  exemplo?: string
  /** 1-2 exemplos concretos do termo (frase ou palavra). */
  exemplos?: string[]
}

export interface GlossarioResp {
  termos: TermoGlossario[]
  provider: string
  modelo: string
  /** Presente quando os termos foram exibidos mas não puderam ser salvos. */
  aviso_salvamento?: string
  /** Presente quando o modelo não devolveu os termos no formato esperado. */
  aviso_geracao?: string
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
  /** Maior id dos chunks antigos; reenviado nos lotes seguintes ao primeiro. */
  corte_id?: number
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

// ── Perfis comportamentais ───────────────────────────────────────────────────

export interface PerfilComportamental {
  temperament_id: string
  display_name: string
  description: string
}

export interface PerfisComportamentaisResp {
  perfis: PerfilComportamental[]
}

export interface PerfilComportamentalResp {
  resposta: string
  temperament_id: string
  provider: string
  modelo: string
}

// ── Elenco de Personas (bate-papo que agrega e anima) ────────────────────────

export interface ElencoPersona {
  persona_id: string
  display_name: string
  description: string
  contexto_label: string
  contexto_placeholder: string
  mensagem_label: string
  mensagem_placeholder: string
}

export interface ElencoPersonasResp {
  personas: ElencoPersona[]
}

export interface ElencoConversaResp {
  resposta: string
  persona_id: string
  provider: string
  modelo: string
}

export interface SuportePersona {
  persona_id: string
  nome: string
  display_name: string
  bloco: string
  description: string
  exemplo: string
  usa_historico: boolean
}

export interface SuportePersonasResp {
  personas: SuportePersona[]
}

// ── Professor Sabe Tudo ──────────────────────────────────────────────────────

/** Só o que o card mostra; estrutura, voz e temperatura ficam no servidor. */
export interface ProfessorPersona {
  persona_id: string
  nome: string
  descricao: string
  exemplo: string
}

export interface ProfessorPersonasResp {
  personas: ProfessorPersona[]
}

export interface SuporteAtendimentoResp {
  resposta: string
  persona_id: string
  usou_historico: boolean
  provider: string
  modelo: string
}

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

export type NivelAprender = 'simples' | 'estudante' | 'tecnico'

export interface AprenderExplicarResp {
  resposta: string
  nivel: NivelAprender
  contexto: Evidencia[]
  pouco_embasado: boolean
  provider: string
  modelo: string
}

export interface AprenderAvaliarResp {
  /** null quando o modelo não devolveu JSON — aí vem só `comentario`. */
  nota: number | null
  acertos: string[]
  lacunas: string[]
  confusoes: string[]
  proxima_pergunta: string
  comentario: string
  provider: string
  modelo: string
}
