// Writes build/installer/r_packages.txt, the CRAN packages the Windows
// installer installs, from the list the app itself uses
// (LEXICAL_R_PACKAGES in src/renderer/models/lexical-api.ts), so the two
// never disagree. Run by `npm run package:win`.
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(join(root, 'src/renderer/models/lexical-api.ts'), 'utf-8')
const block = source.match(/LEXICAL_R_PACKAGES[^=]*=\s*\{([\s\S]*?)\n\}/)
if (!block) throw new Error('LEXICAL_R_PACKAGES not found')
const packages = [...new Set([...block[1].matchAll(/'([A-Za-z][A-Za-z0-9.]*)'/g)].map((m) => m[1]))]
  .filter((p) => !/^[a-z]+-[a-z-]+$/.test(p))
  .sort((a, b) => a.localeCompare(b))
writeFileSync(join(root, 'build/installer/r_packages.txt'),
  '# Pacotes CRAN dos testes estatísticos (gerado por scripts/write-r-packages.mjs)\n' + packages.join('\n') + '\n')
console.log(`${packages.length} R packages: ${packages.join(', ')}`)
