/**
 * Mesclar projetos lê o outro projeto ao lado do aberto. Os PDFs dele são
 * lidos sem acender o aviso "Lendo o texto dos PDFs": esse aviso só some
 * quando um projeto termina de abrir, e na mesclagem nada o fecharia, de
 * modo que ele ficaria por cima da tela de escolha e o programa pareceria
 * congelado. Ao abrir um projeto, o aviso continua aparecendo.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest'

const invoke = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }))
vi.mock('@tauri-apps/api/event', () => ({ emit: vi.fn(), emitTo: vi.fn() }))
vi.mock('@tauri-apps/api/webview', () => ({ getCurrentWebview: () => ({ onDragDropEvent: vi.fn(async () => () => {}) }) }))
vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: () => ({ label: 'main', listen: vi.fn(async () => () => {}) })
}))
vi.mock('../../src/renderer/platform/pdf-text', () => ({
  base64ToBytes: () => new Uint8Array([1]),
  extractPdfText: vi.fn(async () => ({ text: 'texto do pdf', pageOffsets: [0] }))
}))
vi.mock('../../src/renderer/labiia/lexical-bridge', () => ({ lexicalApi: {} }))
vi.mock('../../src/renderer/labiia/corpus-prep-state', () => ({
  rememberOpenedPreparation: vi.fn(),
  withPreparation: (d: unknown) => d
}))

/** Um projeto com um PDF cujo texto ainda precisa ser lido. */
function projectWithPdf(filePath: string): any {
  return {
    filePath,
    sources: [{ guid: 'pdf-1', _pendingPdfText: true, formatData: { pdfFilePath: 'internal://pdf-1.pdf' } }],
    sourceContents: {}
  }
}

let api: any

beforeAll(async () => {
  ;(globalThis as any).window = globalThis
  ;(globalThis as any).addEventListener ??= () => {}
  ;(globalThis as any).open ??= () => null
  const element = { getAttribute: () => null, setAttribute: () => {}, style: {}, classList: { add() {}, remove() {}, toggle() {} } }
  ;(globalThis as any).document ??= { addEventListener: () => {}, documentElement: element, body: element }
  ;(globalThis as any).navigator ??= { userAgent: 'Windows' }
  ;(globalThis as any).requestAnimationFrame ??= () => 0
  ;(globalThis as any).MutationObserver ??= class { observe(): void {} disconnect(): void {} }
  await import('../../src/renderer/platform/tauri-api')
  api = (globalThis as any).api
})

describe('aviso de leitura dos PDFs', () => {
  it('não aparece ao ler o outro projeto para mesclar, mas o texto do PDF é lido', async () => {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'read_qdpx_for_compare') return projectWithPdf('C:/outro.qdpx')
      if (cmd === 'read_compare_binary') return new Uint8Array([1, 2]).buffer
      return null
    })
    const progress = vi.fn()
    const stop = api.onProjectLoadProgress(progress)
    const data = await api.readQdpxForCompare('C:/outro.qdpx')
    stop()
    expect(progress).not.toHaveBeenCalled()
    expect(data.sourceContents['pdf-1']).toBe('texto do pdf')
  })

  it('aparece ao abrir um projeto com PDFs', async () => {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'open_project_path') return projectWithPdf('C:/aberto.qdpx')
      if (cmd === 'read_media') return new Uint8Array([1, 2]).buffer
      return null
    })
    const progress = vi.fn()
    const stop = api.onProjectLoadProgress(progress)
    await api.openProjectPath('C:/aberto.qdpx')
    stop()
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ current: 1, total: 1 }))
  })
})
