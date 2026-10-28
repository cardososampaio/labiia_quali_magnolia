/**
 * The result of a lexical test: corpus figures, the images and tables the
 * test produced, and export. Also the progress notice shown while a test
 * runs (corpus preparation can take minutes on large corpora).
 */
import { useMemo, useState } from 'react'
import type { LexicalFile, LexicalRunProgress, LexicalCorpusStats } from '../../models/lexical-api'
import { t, tn, formatNumber, formatDate } from '../../i18n'
import { FigureView } from './FigureView'
import type { LexicalFigure } from '../../models/lexical-figures'

export interface StoredLexicalResult {
  files: LexicalFile[]
  summary?: Record<string, number | string>
  corpus?: LexicalCorpusStats
  /** Settings the result was produced with, to tell when it is out of date. */
  ranWith: string
  ranAt: string
}

export function RunProgressNotice({ progress, onCancel }: { progress: LexicalRunProgress | null; onCancel: () => void }) {
  // The long-wait notice appears only once the engine says the corpus is not in the cache.
  const preparing = progress?.stage === 'prepare' && progress.cached === false
  const pct = preparing && progress?.total ? Math.round(((progress.done ?? 0) / progress.total) * 100) : null
  let title: string
  let detail: string | null = null
  if (!progress) {
    title = t('Starting the test…')
  } else if (preparing) {
    title = t('Preparing the corpus')
    detail = t('With many documents this can take a few minutes. The prepared corpus is kept, so the next tests on these documents start right away.')
  } else if (progress?.stage === 'render') {
    title = t('Drawing the result in R…')
  } else {
    title = progress?.cached ? t('Corpus ready (prepared before). Running the test…') : t('Running the test…')
  }
  return (
    <div className="lex-progress-notice" role="status">
      <div className="lex-spinner" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="lex-progress-title">{title}</div>
        {detail && <div className="lex-muted">{detail}</div>}
        {pct !== null && (
          <div className="lex-progress-line">
            <div className="lex-progress"><div className="lex-progress-bar" style={{ width: `${pct}%` }} /></div>
            <span className="lex-muted">{t('{{done}} of {{total}} documents', { done: formatNumber(progress?.done ?? 0), total: formatNumber(progress?.total ?? 0) })}</span>
          </div>
        )}
      </div>
      <button className="secondary lex-small-btn" onClick={onCancel}>{t('Cancel')}</button>
    </div>
  )
}

export function CorpusFigures({ corpus }: { corpus: LexicalCorpusStats }) {
  return (
    <div className="lex-figures">
      <span>{tn(corpus.units, '{{count}} text', '{{count}} texts')}</span>
      <span>{tn(corpus.segments, '{{count}} text segment', '{{count}} text segments')}</span>
      <span>{tn(corpus.occurrences, '{{count}} occurrence', '{{count}} occurrences')}</span>
      <span>{tn(corpus.forms, '{{count}} form', '{{count}} forms')}</span>
      <span>{tn(corpus.hapax, '{{count}} hapax', '{{count}} hapax')}</span>
    </div>
  )
}

function decodeText(data: string): string {
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
  return new TextDecoder('utf-8').decode(bytes)
}

function CsvPreview({ file, limit = 30 }: { file: LexicalFile; limit?: number }) {
  const rows = useMemo(() => {
    if (!file.data) return []
    return decodeText(file.data).split(/\r?\n/).filter(Boolean).map((l) => l.split(';'))
  }, [file.data])
  if (rows.length < 2) return null
  const [head, ...body] = rows
  return (
    <div className="lex-table-wrap">
      <table className="lex-table">
        <thead><tr>{head.map((h, i) => <th key={i}>{columnLabel(h)}</th>)}</tr></thead>
        <tbody>
          {body.slice(0, limit).map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j} className={/^-?\d+([.,]\d+)?$/.test(c) ? 'num' : undefined}>{/^-?\d+$/.test(c) ? formatNumber(Number(c)) : c}</td>)}</tr>
          ))}
        </tbody>
      </table>
      {body.length > limit && <div className="lex-muted" style={{ marginTop: 6 }}>{t('Showing {{shown}} of {{total}} rows. Export the CSV for all of them.', { shown: limit, total: formatNumber(body.length) })}</div>}
    </div>
  )
}

function columnLabel(h: string): string {
  if (h === 'word') return t('Word')
  if (h === 'freq' || h === 'frequency') return t('Frequency')
  const m = h.match(/^word_(\d)$/)
  if (m) return t('Word {{n}}', { n: m[1] })
  return h
}

export function LexicalResultView({ result, stale, title }: { result: StoredLexicalResult; stale: boolean; title: string }) {
  const [actualSize, setActualSize] = useState(false)
  const images = result.files.filter((f) => f.role === 'image' && f.data)
  const figures = useMemo(() => result.files.flatMap((f) => {
    if (f.role !== 'figure' || !f.data) return []
    try { return [{ name: f.name.replace(/\.json$/, ''), figure: JSON.parse(decodeText(f.data)) as LexicalFigure }] } catch { return [] }
  }), [result.files])
  const tables = result.files.filter((f) => f.role === 'table' && f.data)
  const save = (f: LexicalFile): void => { void window.api.lexical.saveFile({ name: f.name, mime: f.mime, data: f.data! }) }

  return (
    <div className="analysis-section lex-section lex-result">
      <div className="lex-result-head">
        <span className="lex-section-title">{t('Result')}</span>
        <span className="lex-muted">{t('Run on {{date}}', { date: formatDate(new Date(result.ranAt), { dateStyle: 'short', timeStyle: 'short' }) })}</span>
      </div>
      {stale && <div className="lex-note lex-note-warn">{t('The documents or settings changed after this result. Run again to update it.')}</div>}
      {result.corpus && <CorpusFigures corpus={result.corpus} />}

      {images.map((f) => (
        <div key={f.name} className="lex-figure">
          <div className="lex-figure-tools">
            <button className="secondary lex-small-btn" onClick={() => setActualSize(!actualSize)}>
              {actualSize ? t('Fit to window') : t('Actual size')}
            </button>
            <button className="secondary lex-small-btn" onClick={() => save(f)}>{t('Export PNG')}</button>
          </div>
          <div className={`lex-figure-frame${actualSize ? ' actual' : ''}`}>
            <img src={`data:${f.mime};base64,${f.data}`} alt={title} draggable={false} />
          </div>
        </div>
      ))}

      {figures.map((f) => <FigureView key={f.name} figure={f.figure} baseName={f.name} />)}

      {tables.map((f) => (
        <div key={f.name} className="lex-table-block">
          <div className="lex-figure-tools">
            <span className="lex-advanced-title">{tableTitle(f)}</span>
            <div style={{ flex: 1 }} />
            <button className="secondary lex-small-btn" onClick={() => save(f)}>{t('Export CSV')}</button>
          </div>
          <CsvPreview file={f} />
        </div>
      ))}
    </div>
  )
}

function tableTitle(f: LexicalFile): string {
  if (f.title === 'Bigrams') return t('Bigrams')
  if (f.title === 'Trigrams') return t('Trigrams')
  if (f.title === 'Branches') return t('Branches')
  return t('Word frequencies')
}

/** Plain-language message for a failed run. */
export function runErrorText(error: string, detail?: string, missing?: string[]): string {
  switch (error) {
    case 'no-text': return t('The chosen documents have no text to analyse.')
    case 'no-words': return t('No word reaches the minimum frequency. Lower the minimum frequency and run again.')
    case 'no-vocabulary': return t('No word reaches the minimum frequency. Lower the minimum frequency and run again.')
    case 'keyword-not-found': return t('"{{word}}" does not appear in the segments with these settings. Check the spelling, lower the minimum frequency or untick "Active forms only".', { word: detail ?? '' })
    case 'no-branches': return t('The branches are below the minimum branch frequency. Lower it or choose another word.')
    case 'no-ngrams': return t('No sequence of words reaches the minimum frequency. Lower the minimum frequency and run again.')
    case 'r-not-found': return t('R was not found on this computer. The tests marked "R" need R 4.0 or newer.')
    case 'r-packages-missing': return t('These R packages are missing: {{list}}. Install them above and run again.', { list: (missing ?? []).join(', ') })
    case 'r-timeout': return t('R took longer than the time limit and was stopped. Try fewer documents or words.')
    case 'r-failed': return t('R could not finish the test.')
    case 'not-available': return t('This test is still being connected')
    default: return detail ? t('The test could not finish: {{error}}', { error: detail.slice(0, 300) }) : t('The test could not finish.')
  }
}
