#!/usr/bin/env node
// Bundles labiia_quali's Node helper (src/helper) into two CommonJS files:
//
//   helper/dist/labiia-helper.cjs   the program the app starts
//   helper/dist/lexical-worker.cjs  the lexical engine's background thread
//
// The engine was written for Electron: `electron` is replaced by
// src/helper/electron-shim.ts, and electron-vite's `?modulePath` import of
// the worker becomes the path of lexical-worker.cjs next to the bundle.
import { build } from 'esbuild'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { mkdirSync } from 'fs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'helper', 'dist')
mkdirSync(out, { recursive: true })

const modulePath = {
  name: 'module-path',
  setup(b) {
    b.onResolve({ filter: /\?modulePath$/ }, (args) => ({
      path: args.path.replace(/\?modulePath$/, ''),
      namespace: 'module-path'
    }))
    b.onLoad({ filter: /.*/, namespace: 'module-path' }, (args) => {
      const name = args.path.split('/').pop()
      return {
        contents: `module.exports = require('path').join(__dirname, ${JSON.stringify(name + '.cjs')})`,
        loader: 'js'
      }
    })
  }
}

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  sourcemap: false,
  logLevel: 'warning',
  alias: { electron: join(root, 'src', 'helper', 'electron-shim.ts') },
  plugins: [modulePath]
}

await build({ ...common, entryPoints: [join(root, 'src', 'helper', 'main.ts')], outfile: join(out, 'labiia-helper.cjs') })
await build({
  ...common,
  entryPoints: [join(root, 'src', 'helper', 'lexical', 'lexical-worker.ts')],
  outfile: join(out, 'lexical-worker.cjs')
})
console.log('helper built in helper/dist')
