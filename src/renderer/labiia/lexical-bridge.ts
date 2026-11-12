/**
 * `window.api.lexical`: the lexical analyses' bridge to the backend.
 *
 * Same methods as labiia_quali's Electron build, so the lexical screens work
 * unchanged. Each one is a Rust command (src-tauri/src/labiia/lexical.rs)
 * that passes the request to the Node helper running the analyses; progress
 * comes back as events.
 */
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import type {
  CompoundSuggestion,
  CorpusPreparation,
  LexicalApi,
  LexicalRunProgress,
  LexicalRunRequest,
  LexicalRunResult,
  PluralSuggestion,
  PreparationTable,
  RInstallProgress,
  RInstallResult,
  RStatusInfo,
  VariantMethod,
  VariantSuggestion
} from '../models/lexical-api'

function listen<T>(event: string, callback: (payload: T) => void): () => void {
  let unlisten: (() => void) | null = null
  let disposed = false
  void getCurrentWebviewWindow()
    .listen<T>(event, (e) => callback(e.payload))
    .then((u) => {
      if (disposed) u()
      else unlisten = u
    })
  return () => {
    disposed = true
    unlisten?.()
  }
}

export const lexicalApi: LexicalApi = {
  rStatus: (refresh?: boolean) => invoke<RStatusInfo>('lexical_r_status', { refresh: refresh === true }),
  // "Preparar corpus": found and built in Rust (src-tauri/src/labiia/corpus_prep.rs, crates/labiia-prep).
  prepSuggestPlurals: (language: string, texts: string[]) =>
    invoke<PluralSuggestion[]>('corpus_prep_suggest', { kind: 'plurals', language, texts }),
  prepSuggestVariants: (language: string, texts: string[], method: VariantMethod) =>
    invoke<VariantSuggestion[]>('corpus_prep_suggest', { kind: 'variants', language, texts, options: { method } }),
  prepSuggestCompounds: (language: string, texts: string[], minFreq: number) =>
    invoke<CompoundSuggestion[]>('corpus_prep_suggest', { kind: 'compounds', language, texts, options: { minFreq } }),
  prepBuild: (language: string, texts: string[], choices: CorpusPreparation) =>
    invoke<PreparationTable>('corpus_prep_build', { language, texts, choices }),
  setRPath: (path: string) => invoke<RStatusInfo>('lexical_r_set_path', { path }),
  pickRPath: () => invoke<string | null>('lexical_r_pick_path'),
  checkPackages: (packages: string[]) =>
    invoke<{ status?: Record<string, boolean>; error?: string }>('lexical_r_check_packages', { packages }),
  installPackages: (packages: string[]) =>
    invoke<RInstallResult | { error: string }>('lexical_r_install_packages', { packages }),
  cancelInstall: () => invoke<boolean>('lexical_r_cancel_install'),
  run: (req: LexicalRunRequest) => invoke<LexicalRunResult>('lexical_run', { req }),
  cancelRun: (runId: string) => invoke<void>('lexical_cancel_run', { runId }),
  onRunProgress: (callback: (p: LexicalRunProgress) => void) => listen('lexical-run-progress', callback),
  saveFile: (file: { name: string; mime: string; data: string }) =>
    invoke<boolean>('lexical_save_file', { name: file.name, data: file.data }),
  onInstallProgress: (callback: (p: RInstallProgress) => void) => listen('lexical-r-install-progress', callback)
}

/** The helper's Node version and folders; starts it if needed. */
export const pingHelper = (): Promise<unknown> => invoke('labiia_helper_ping')
