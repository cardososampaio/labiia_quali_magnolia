/**
 * labiia_quali's helper: a Node program the app starts beside its window to
 * run the lexical analyses, which are written in TypeScript and call R.
 * The Rust side starts it with the folders it needs and talks to it over
 * stdin/stdout (see protocol.ts).
 */
import { configurePaths, paths } from './paths'
import { register, serve } from './protocol'
import { registerLexicalMethods } from './methods'

configurePaths(process.argv.slice(2))

register('ping', () => ({ pong: true, node: process.versions.node, resourcesDir: paths.resourcesDir, dataDir: paths.dataDir }))
registerLexicalMethods()

serve()
