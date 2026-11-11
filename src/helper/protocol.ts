/**
 * The helper's conversation with the Rust side: one JSON message per line.
 *
 *   request   {"id": 7, "method": "lexical.run", "params": {...}}
 *   response  {"id": 7, "ok": true, "result": ...}
 *             {"id": 7, "ok": false, "error": "message"}
 *   event     {"event": "lexical:run-progress", "payload": {...}}
 *
 * stdout carries only these messages, so anything printed with console.log
 * goes to stderr, which the Rust side writes to the helper's log.
 */
import { createInterface } from 'readline'

export type Method = (params: unknown) => unknown | Promise<unknown>

const methods = new Map<string, Method>()

export function register(name: string, fn: Method): void {
  methods.set(name, fn)
}

function write(message: unknown): void {
  process.stdout.write(JSON.stringify(message) + '\n')
}

export function emit(event: string, payload: unknown): void {
  write({ event, payload })
}

export async function handleLine(line: string): Promise<void> {
  const text = line.trim()
  if (!text) return
  let msg: { id?: unknown; method?: unknown; params?: unknown }
  try {
    msg = JSON.parse(text)
  } catch {
    process.stderr.write(`[helper] malformed request ignored: ${text.slice(0, 200)}\n`)
    return
  }
  const id = msg.id
  if (typeof id !== 'number') {
    process.stderr.write(`[helper] request without numeric id ignored\n`)
    return
  }
  const fn = typeof msg.method === 'string' ? methods.get(msg.method) : undefined
  if (!fn) {
    write({ id, ok: false, error: `unknown-method: ${String(msg.method)}` })
    return
  }
  try {
    const result = await fn(msg.params)
    write({ id, ok: true, result: result ?? null })
  } catch (err) {
    write({ id, ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}

/** Reads requests until stdin closes (the app quit), then exits. Requests
 *  run concurrently: a long analysis must not block a Cancel. */
export function serve(): void {
  const log = (...args: unknown[]): void => {
    process.stderr.write(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ') + '\n')
  }
  console.log = log
  console.info = log
  console.warn = log
  console.debug = log
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })
  const inFlight = new Set<Promise<void>>()
  rl.on('line', (line) => {
    const p = handleLine(line).finally(() => inFlight.delete(p))
    inFlight.add(p)
  })
  // Answer what was already asked before leaving.
  rl.on('close', () => {
    void Promise.allSettled([...inFlight]).then(() => process.exit(0))
  })
}
