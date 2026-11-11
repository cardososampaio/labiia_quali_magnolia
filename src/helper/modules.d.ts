// The lexical engine imports its background thread's file path this way
// (an electron-vite convention); scripts/build-helper.mjs turns it into the
// path of lexical-worker.cjs beside the bundle.
declare module '*?modulePath' {
  const path: string
  export default path
}

// Electron adds `process.resourcesPath`; the helper sets it from --resources
// (paths.ts) so the engine finds `<resources>/lexical`.
declare namespace NodeJS {
  interface Process {
    resourcesPath?: string
  }
}
