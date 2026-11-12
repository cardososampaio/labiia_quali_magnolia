/**
 * labiia_quali's helper: a Node program the app starts beside its window to
 * run the lexical analyses, which are written in TypeScript and call R.
 * The Rust side starts it with the folders it needs and talks to it over
 * stdin/stdout (see protocol.ts).
 */
import { configurePaths, paths } from './paths'
import { register, serve } from './protocol'
import { registerLexicalMethods } from './methods'
import { stopAllRuns } from './lexical/r-runner'
import { missingResources, selfCheck } from './diagnostics'

configurePaths(process.argv.slice(2))

register('ping', () => ({
  pong: true,
  node: process.versions.node,
  resourcesDir: paths.resourcesDir,
  dataDir: paths.dataDir,
  missingResources: missingResources()
}))
register('diagnostics.selfCheck', selfCheck)
registerLexicalMethods()

// The app asks the helper to stop with SIGTERM when it quits (outside
// Windows, where it stops the whole process tree itself): any R still
// running is stopped first, so none is left behind.
for (const signal of ['SIGTERM', 'SIGHUP', 'SIGINT'] as const) {
  process.on(signal, () => {
    stopAllRuns()
    process.exit(0)
  })
}

serve()
