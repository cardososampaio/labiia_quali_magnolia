/**
 * The helper's part of the program's diagnostics (Help → Program
 * diagnostics, and the check when the program opens): whether the files
 * the lexical analyses need are in place, which R was found and where it
 * was looked for, and which R packages are missing. It never reads a
 * project: the report a researcher sends contains no research data.
 */
import { accessSync, constants, existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { arch, platform, release, tmpdir } from 'os'
import { paths } from './paths'
import { resolveR } from './lexical/r-runtime'
import { checkPackages } from './lexical/r-packages'

/** Files every analysis reads: without them the program cannot run one. */
export const REQUIRED_RESOURCES = [
  'lexical/dictionaries/lexique_pt.txt',
  'lexical/dictionaries/lexique_en.txt',
  'lexical/dictionaries/lexique_sp.txt',
  'lexical/stopwords/pt.txt',
  'lexical/R/wordcloud.R',
  'lexical/R/chd.R',
  'lexical/R/iramuteq'
]

export function missingResources(resourcesDir: string = paths.resourcesDir): string[] {
  return REQUIRED_RESOURCES.filter((f) => !existsSync(join(resourcesDir, f)))
}

/** Whether the helper can write where it keeps its cache and runs R. */
function writable(dir: string): boolean {
  try {
    mkdirSync(dir, { recursive: true })
    const probe = join(dir, `.labiia-write-test-${process.pid}`)
    writeFileSync(probe, 'ok')
    rmSync(probe)
    accessSync(dir, constants.W_OK)
    return true
  } catch {
    return false
  }
}

export async function selfCheck(params: unknown): Promise<unknown> {
  const wanted = (params as { packages?: unknown } | null)?.packages
  const packages = Array.isArray(wanted) ? wanted.filter((p): p is string => typeof p === 'string') : []
  const r = await resolveR(true)
  let packageStatus: Record<string, boolean> | null = null
  let packageError: string | null = null
  if (r.found && r.installation && packages.length) {
    try {
      packageStatus = await checkPackages(r.installation, packages)
    } catch (err) {
      packageError = err instanceof Error ? err.message : String(err)
    }
  }
  return {
    node: process.versions.node,
    system: { platform: platform(), release: release(), arch: arch() },
    resourcesDir: paths.resourcesDir,
    missingResources: missingResources(),
    dataDir: paths.dataDir,
    dataWritable: writable(paths.dataDir),
    tempDir: tmpdir(),
    tempWritable: writable(join(tmpdir(), 'labiia-lexical')),
    locale: { LANG: process.env.LANG ?? null, LC_ALL: process.env.LC_ALL ?? null },
    r,
    packages: packageStatus,
    packageError
  }
}
