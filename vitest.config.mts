import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'url'

// Node-environment unit tests for renderer logic (stores, query engine,
// merge). Test files live under test/; the Rust backend's tests run with
// `cargo test --workspace`.
export default defineConfig({
  // project-store.ts references __APP_VERSION__, a global normally injected
  // by vite.config.mts's define — stub it here too so tests that import
  // renderer stores (e.g. for the merge apply engine) don't need the app's
  // build config.
  define: {
    __APP_VERSION__: JSON.stringify('0.0.0-test')
  },
  // labiia_quali's lexical engine (src/helper) was written for Electron; its
  // tests resolve `electron` to the helper's stand-in, as the helper bundle does.
  resolve: {
    alias: { electron: fileURLToPath(new URL('./src/helper/electron-shim.ts', import.meta.url)) }
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node'
  }
})
