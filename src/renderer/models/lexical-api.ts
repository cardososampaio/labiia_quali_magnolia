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
  | 'network-text'

export type LexicalToolType = `lexical-${LexicalTestId}`

/** CRAN packages each R-based test loads (one list for the window and the engine). */
export const LEXICAL_R_PACKAGES: Record<LexicalTestId, string[]> = {
  wordcloud: ['ggplot2', 'ggwordcloud', 'RColorBrewer', 'jsonlite', 'png'],
  chd: ['Matrix', 'ape', 'wordcloud', 'irlba', 'ca', 'cluster', 'textometry'],
  similitude: ['igraph', 'sna', 'intergraph', 'network', 'jsonlite'],
  emotions: ['syuzhet', 'fmsb', 'jsonlite'],
  'keyword-associations': [],
  lda: ['topicmodels', 'slam', 'jsonlite'],
  'thematic-map': [],
  yake: [],
  sentiment: [],
  'word-tree': [],
  bigrams: [],
  trigrams: [],
  'network-text': []
}

/** labiia_lex's community colours for the text network (Gephi-like, strong on white). */
export const COMMUNITY_PALETTE = ['#8E24AA', '#2E9E3F', '#1E78D2', '#F07F0A', '#D7263D', '#0097A7', '#C2187A', '#7CA81B', '#5B3FD1', '#E0561C', '#00897B', '#B7860B', '#3F51B5', '#AD1457', '#558B2F', '#6D4C41']

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
  /** Source document of a coded passage. */
  document?: string
  text: string
  /** A code's passages, each cut into segments on its own. */
  parts?: string[]
  /** 'code' when the unit gathers the passages of one code. */
  kind?: 'code'
  /** IRaMuTeQ-style variables (*variable_value) from the document's tags and folder. */
  variables?: string[]
  /** "YYYY", "YYYY-MM" or "YYYY-MM-DD", from a date tag. */
  date?: string
}

export interface LexicalRunRequest {
  runId: string
  testId: LexicalTestId
  language: 'pt' | 'en' | 'es'
  params: Record<string, number | string | boolean>
  units: LexicalUnit[]
  /** The project's corpus preparation for this run (built by prepBuild); absent = none. */
  preparation?: PreparationTable
}

/**
 * "Preparar corpus": the researcher's choices, saved with the project. Each
 * part has its own switch; nothing applies while `enabled` is off.
 */
export interface CorpusPreparation {
  enabled: boolean
  plurals: { enabled: boolean; excluded: string[] }
  variants: { enabled: boolean; groups: { canonical: string; variants: string[] }[] }
  equivalences: { enabled: boolean; pairs: { from: string; to: string }[] }
  expressions: { enabled: boolean; items: string[] }
}

export interface PreparationSummary {
  expressions: number
  equivalences: number
  variants: number
  plurals: number
}

/** The replacements the engine applies: phrases that become one word, and words replaced by another. */
export interface PreparationTable {
  expressions: [string, string][]
  forms: Record<string, string>
  summary: PreparationSummary
}

export interface PluralSuggestion { plural: string; singular: string; frequency: number }
export interface VariantSuggestion { canonical: string; variants: { word: string; frequency: number }[]; frequency: number }
export interface CompoundSuggestion {
  expression: string
  replacement: string
  frequency: number
  documents: number
  score: number
  relative: number
  examples: string[]
}
export type VariantMethod = 'fingerprint' | 'ngram2' | 'ngram3' | 'levenshtein1' | 'levenshtein2'

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
  /** figure: a LexicalFigure as JSON, drawn by the window; network: a text network (network.json) drawn as an interactive graph. */
  role: 'image' | 'figure' | 'table' | 'data' | 'network'
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
  /** What the corpus preparation replaced, when the run used one. */
  preparation?: PreparationSummary
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
  /** Suggestions for "Preparar corpus", found in the given texts. */
  prepSuggestPlurals: (language: string, texts: string[]) => Promise<PluralSuggestion[]>
  prepSuggestVariants: (language: string, texts: string[], method: VariantMethod) => Promise<VariantSuggestion[]>
  prepSuggestCompounds: (language: string, texts: string[], minFreq: number) => Promise<CompoundSuggestion[]>
  /** The table of replacements for a run on these texts. */
  prepBuild: (language: string, texts: string[], choices: CorpusPreparation) => Promise<PreparationTable>
  setRPath: (path: string) => Promise<RStatusInfo>
  pickRPath: () => Promise<string | null>
  checkPackages: (packages: string[]) => Promise<{ status?: Record<string, boolean>; error?: string }>
  installPackages: (packages: string[]) => Promise<RInstallResult | { error: string }>
  cancelInstall: () => Promise<boolean>
  onInstallProgress: (callback: (p: RInstallProgress) => void) => () => void
}
