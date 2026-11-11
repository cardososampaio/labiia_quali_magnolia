/**
 * Folders the helper works in, given on its command line by the Rust side:
 *
 *   --resources <folder that contains lexical/>
 *   --data      <user-data folder, e.g. %APPDATA%\labiia_quali>
 *
 * The lexical engine was written for Electron, which supplied these folders
 * through `app.getPath`; `electron-shim.ts` answers from here instead.
 */
import { tmpdir } from 'os'
import { join } from 'path'

export const paths = {
  /** Folder holding `lexical/` (R scripts, dictionaries, stopword lists). */
  resourcesDir: join(process.cwd(), 'resources'),
  /** The user's data folder: corpus cache and the Rscript path chosen in Preferences. */
  dataDir: join(tmpdir(), 'labiia_quali'),
  tempDir: tmpdir()
}

export function configurePaths(argv: string[]): void {
  for (let i = 0; i < argv.length - 1; i++) {
    if (argv[i] === '--resources') paths.resourcesDir = argv[i + 1]
    if (argv[i] === '--data') paths.dataDir = argv[i + 1]
  }
  // The engine looks for `<resourcesPath>/lexical` when packaged.
  ;(process as { resourcesPath?: string }).resourcesPath = paths.resourcesDir
}
