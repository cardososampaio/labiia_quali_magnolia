import { describe, it, expect, vi, afterEach } from 'vitest'
import { register, handleLine, emit } from '../../src/helper/protocol'

/** Lines the helper writes to stdout, parsed. */
function captureStdout(): { lines: unknown[]; restore: () => void } {
  const lines: unknown[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    for (const l of String(chunk).split('\n').filter(Boolean)) lines.push(JSON.parse(l))
    return true
  })
  return { lines, restore: () => spy.mockRestore() }
}

describe('helper protocol', () => {
  let out: ReturnType<typeof captureStdout> | null = null
  afterEach(() => out?.restore())

  it('answers a request with the same id and its result', async () => {
    register('test.echo', (p) => ({ got: p }))
    out = captureStdout()
    await handleLine(JSON.stringify({ id: 41, method: 'test.echo', params: { a: 1 } }))
    expect(out.lines).toEqual([{ id: 41, ok: true, result: { got: { a: 1 } } }])
  })

  it('reports a failing method as an error answer, so the caller is not left waiting', async () => {
    register('test.fail', () => {
      throw new Error('boom')
    })
    out = captureStdout()
    await handleLine(JSON.stringify({ id: 2, method: 'test.fail' }))
    expect(out.lines).toEqual([{ id: 2, ok: false, error: 'boom' }])
  })

  it('names an unknown method in the error', async () => {
    out = captureStdout()
    await handleLine(JSON.stringify({ id: 3, method: 'no.such' }))
    expect(out.lines).toEqual([{ id: 3, ok: false, error: 'unknown-method: no.such' }])
  })

  it('keeps stdout clean when a line is not a request: nothing to answer', async () => {
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    out = captureStdout()
    await handleLine('not json')
    await handleLine(JSON.stringify({ method: 'test.echo' }))
    await handleLine('   ')
    expect(out.lines).toEqual([])
    err.mockRestore()
  })

  it('sends progress as an event without an id', () => {
    out = captureStdout()
    emit('lexical:run-progress', { runId: 'r1', stage: 'prepare' })
    expect(out.lines).toEqual([{ event: 'lexical:run-progress', payload: { runId: 'r1', stage: 'prepare' } }])
  })
})
