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

export interface LexicalApi {
  rStatus: (refresh?: boolean) => Promise<RStatusInfo>
  setRPath: (path: string) => Promise<RStatusInfo>
  pickRPath: () => Promise<string | null>
  checkPackages: (packages: string[]) => Promise<{ status?: Record<string, boolean>; error?: string }>
  installPackages: (packages: string[]) => Promise<RInstallResult | { error: string }>
  cancelInstall: () => Promise<boolean>
  onInstallProgress: (callback: (p: RInstallProgress) => void) => () => void
}
