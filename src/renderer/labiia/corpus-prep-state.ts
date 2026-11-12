/**
 * The project's "Preparar corpus" choices for the lexical analyses, as kept
 * between opening and saving a project file.
 *
 * They belong to the project: saved in its file (as
 * `labiiaCorpusPreparation`, see crates/magnolia-core/src/qdpx/
 * labiia_lexical.rs), applied to every lexical analysis of the project, and
 * off until the researcher turns them on, so results stay those of
 * labiia_lex until then. Each set of choices is tied to the project it came
 * from (who created it and when), so a new or another project starts empty.
 *
 * This module is loaded with the platform bridge (platform/tauri-api.ts),
 * before the program's stores exist, so it must not import them; the
 * screens use corpus-prep-store.ts.
 */
import { create } from 'zustand'
import type { CorpusPreparation } from '../models/lexical-api'

export const PREPARATION_FIELD = 'labiiaCorpusPreparation'

export function emptyPreparation(): CorpusPreparation {
  return {
    enabled: false,
    plurals: { enabled: false, excluded: [] },
    variants: { enabled: false, groups: [] },
    equivalences: { enabled: false, pairs: [] },
    expressions: { enabled: false, items: [] }
  }
}

export const EMPTY_PREPARATION = emptyPreparation()

/** Choices read from a project file, with any missing part filled in (files from older versions). */
export function normalizePreparation(v: unknown): CorpusPreparation {
  const d = emptyPreparation()
  if (!v || typeof v !== 'object') return d
  const p = v as Partial<CorpusPreparation>
  const strings = (a: unknown): string[] => (Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : [])
  return {
    enabled: p.enabled === true,
    plurals: { enabled: p.plurals?.enabled === true, excluded: strings(p.plurals?.excluded) },
    variants: {
      enabled: p.variants?.enabled === true,
      groups: (Array.isArray(p.variants?.groups) ? p.variants!.groups : [])
        .filter((g) => g && typeof g.canonical === 'string')
        .map((g) => ({ canonical: g.canonical, variants: strings(g.variants) }))
    },
    equivalences: {
      enabled: p.equivalences?.enabled === true,
      pairs: (Array.isArray(p.equivalences?.pairs) ? p.equivalences!.pairs : [])
        .filter((x) => x && typeof x.from === 'string' && typeof x.to === 'string')
        .map((x) => ({ from: x.from, to: x.to }))
    },
    expressions: { enabled: p.expressions?.enabled === true, items: strings(p.expressions?.items) }
  }
}

/** Whether any part of the preparation would change a corpus. */
export function preparationActive(p: CorpusPreparation): boolean {
  return (
    p.enabled &&
    (p.plurals.enabled ||
      (p.variants.enabled && p.variants.groups.length > 0) ||
      (p.equivalences.enabled && p.equivalences.pairs.length > 0) ||
      (p.expressions.enabled && p.expressions.items.length > 0))
  )
}

/** Which project a set of choices belongs to: who created it and when (kept across Save As). */
export function projectKey(p: { creatingUserGUID?: string; creationDateTime?: string; filePath?: string | null }): string {
  return p.creatingUserGUID || p.creationDateTime ? `${p.creatingUserGUID ?? ''}|${p.creationDateTime ?? ''}` : `file:${p.filePath ?? ''}`
}

interface PrepState {
  owner: string | null
  preparation: CorpusPreparation
}

export const usePrepState = create<PrepState>(() => ({ owner: null, preparation: EMPTY_PREPARATION }))

/** A project's choices, or none when the kept choices belong to another project. */
export function preparationFor(project: { creatingUserGUID?: string; creationDateTime?: string; filePath?: string | null }): CorpusPreparation {
  const s = usePrepState.getState()
  return s.owner === projectKey(project) ? s.preparation : EMPTY_PREPARATION
}

/** A project file was opened: keep its choices for it. */
export function rememberOpenedPreparation(project: any): void {
  if (!project || typeof project !== 'object') return
  usePrepState.setState({ owner: projectKey(project), preparation: normalizePreparation(project[PREPARATION_FIELD]) })
}

/** The project about to be saved, with its choices (only when it has some). */
export function withPreparation<T extends { project?: any }>(data: T): T {
  if (!data?.project || typeof data.project !== 'object') return data
  const p = preparationFor(data.project)
  if (JSON.stringify(p) === JSON.stringify(EMPTY_PREPARATION)) return data
  return { ...data, project: { ...data.project, [PREPARATION_FIELD]: p } }
}
