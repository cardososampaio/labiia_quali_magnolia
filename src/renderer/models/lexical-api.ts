/**
 * Shapes exchanged with the main process for the lexical analyses (R status,
 * package checks and installs). Kept apart from the components so both the
 * preload bridge and the renderer can import them.
 */
/** The lexical tests (see components/Lexical/lexical-catalog.ts). */
export type LexicalTestId =
  | 'wordcloud'
  | 'chd'
  | 'similitude'
  | 'emotions'
  | 'keyword-associations'
  | 'lda'
  | 'thematic-map'
  | 'yake'
  | 'sentiment'
  | 'word-tree'
  | 'bigrams'
  | 'trigrams'

export type LexicalToolType = `lexical-${LexicalTestId}`

/** CRAN packages each R-based test loads (one list for the window and the engine). */
export const LEXICAL_R_PACKAGES: Record<LexicalTestId, string[]> = {
  wordcloud: ['ggplot2', 'ggwordcloud', 'RColorBrewer', 'jsonlite', 'png'],
  chd: ['Matrix', 'ape', 'wordcloud', 'irlba', 'ca', 'cluster', 'textometry'],
  similitude: ['igraph', 'sna', 'intergraph', 'network', 'jsonlite'],
  emotions: ['syuzhet', 'fmsb'],
  'keyword-associations': [],
  lda: ['topicmodels', 'slam', 'jsonlite'],
  'thematic-map': [],
  yake: [],
  sentiment: [],
  'word-tree': [],
  bigrams: [],
  trigrams: []
}

export interface RInstallationInfo {
  rscript: string
  version: string
  libDir: string
}

export interface RStatusInfo {
  found: boolean
  installation?: RInstallationInfo
  configuredPath: string
  problem?: 'not-found' | 'not-runnable' | 'too-old' | string
}

export interface RInstallProgress {
  current: string
  done: number
  total: number
  line?: string
}

export interface RInstallResult {
  ok: boolean
  installed: string[]
  failed: string[]
  cancelled: boolean
  log: string
}

/** One document (or, later, one coded passage) sent to a lexical test. */
export interface LexicalUnit {
  id: string
  name: string
  text: string
}

export interface LexicalRunRequest {
  runId: string
  testId: LexicalTestId
  language: 'pt' | 'en' | 'es'
  params: Record<string, number | string | boolean>
  units: LexicalUnit[]
}

export interface LexicalRunProgress {
  runId: string
  /** prepare: corpus preparation; compute: the test itself; render: drawing (R). */
  stage: 'prepare' | 'compute' | 'render'
  /** The prepared corpus came from the cache (no preparation needed). */
  cached?: boolean
  done?: number
  total?: number
}

/** A file a test produced: an image, a table or data, kept with a saved analysis. */
export interface LexicalFile {
  name: string
  mime: string
  /** Base64 contents. Absent while the file is only referenced from the project. */
  data?: string
  /** Where the file is stored inside the project file. */
  path?: string
  /** figure: a LexicalFigure as JSON, drawn by the window. */
  role: 'image' | 'figure' | 'table' | 'data'
  title?: string
}

export interface LexicalCorpusStats {
  units: number
  segments: number
  occurrences: number
  forms: number
  lemmas: number
  hapax: number
  fromCache: boolean
}

export interface LexicalRunResult {
  ok: boolean
  /** not-available | no-text | r-not-found | r-packages-missing | cancelled | failed | an R failure code */
  error?: string
  detail?: string
  missingPackages?: string[]
  corpus?: LexicalCorpusStats
  files?: LexicalFile[]
  summary?: Record<string, number | string>
}

export interface LexicalApi {
  run: (req: LexicalRunRequest) => Promise<LexicalRunResult>
  cancelRun: (runId: string) => Promise<void>
  onRunProgress: (callback: (p: LexicalRunProgress) => void) => () => void
  /** Saves a result file where the user chooses. */
  saveFile: (file: { name: string; mime: string; data: string }) => Promise<boolean>
  rStatus: (refresh?: boolean) => Promise<RStatusInfo>
  setRPath: (path: string) => Promise<RStatusInfo>
  pickRPath: () => Promise<string | null>
  checkPackages: (packages: string[]) => Promise<{ status?: Record<string, boolean>; error?: string }>
  installPackages: (packages: string[]) => Promise<RInstallResult | { error: string }>
  cancelInstall: () => Promise<boolean>
  onInstallProgress: (callback: (p: RInstallProgress) => void) => () => void
}
