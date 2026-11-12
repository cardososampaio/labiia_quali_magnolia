/**
 * The open project's "Preparar corpus" choices, for the screens (see
 * corpus-prep-state.ts for how they are kept with the project file).
 */
import type { CorpusPreparation } from '../models/lexical-api'
import { useProjectStore } from '../stores/project-store'
import { EMPTY_PREPARATION, projectKey, usePrepState } from './corpus-prep-state'

export { emptyPreparation, preparationActive } from './corpus-prep-state'

/** The open project's choices (empty for a project that has none). */
export function useCorpusPreparation(): CorpusPreparation {
  const owner = usePrepState((s) => s.owner)
  const preparation = usePrepState((s) => s.preparation)
  const current = useProjectStore((s) => projectKey(s))
  return owner === current ? preparation : EMPTY_PREPARATION
}

/** The researcher changed the choices: they become the open project's, and the project needs saving. */
export function setCorpusPreparation(p: CorpusPreparation): void {
  usePrepState.setState({ owner: projectKey(useProjectStore.getState()), preparation: p })
  useProjectStore.getState().markDirty()
}
