/**
 * The result of a lexical test: corpus figures, the images and tables the
 * test produced, and export. Also the progress notice shown while a test
 * runs (corpus preparation can take minutes on large corpora).
 */
import { useMemo } from 'react'
import type { LexicalFile, LexicalRunProgress, LexicalCorpusStats } from '../../models/lexical-api'
import { t, tn, formatNumber, formatDate } from '../../i18n'
import { FigureView } from './FigureView'
import { ZoomFrame } from './ZoomFrame'
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

/** One line of a ;-separated file; "quoted" cells may contain ; and doubled quotes. */
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ } else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === ';') { out.push(cur); cur = '' } else cur += ch
  }
  out.push(cur)
  return out
}

function CsvPreview({ file, limit = 30 }: { file: LexicalFile; limit?: number }) {
  const rows = useMemo(() => {
    if (!file.data) return []
    return decodeText(file.data).split(/\r?\n/).filter(Boolean).map(splitCsvLine)
  }, [file.data])
  if (rows.length < 2) return null
  const [head, ...body] = rows
  return (
    <div className="lex-table-wrap">
      <table className="lex-table">
        <thead><tr>{head.map((h, i) => <th key={i}>{columnLabel(h)}</th>)}</tr></thead>
        <tbody>
          {body.slice(0, limit).map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j} className={/^-?\d+([.,]\d+)?$/.test(c) ? 'num' : undefined}>{/^-?\d+$/.test(c) ? formatNumber(Number(c)) : head[j] === 'type' ? termType(c) : c}</td>)}</tr>
          ))}
        </tbody>
      </table>
      {body.length > limit && <div className="lex-muted" style={{ marginTop: 6 }}>{t('Showing {{shown}} of {{total}} rows. Export the CSV for all of them.', { shown: limit, total: formatNumber(body.length) })}</div>}
    </div>
  )
}

/** Kind of word in the CHD profiles. */
function termType(v: string): string {
  if (v === 'active') return t('Active')
  if (v === 'supplementary') return t('Supplementary')
  if (v === 'variable') return t('Variable')
  return v
}

function columnLabel(h: string): string {
  if (h === 'word') return t('Word')
  if (h === 'freq' || h === 'frequency' || h === 'Frequency') return t('Frequency')
  if (h === 'Phrase') return t('Expression')
  if (h === 'RawYAKE') return t('YAKE score')
  if (h === 'Relevance') return t('Relevance')
  if (h === 'DocCount') return t('Segments')
  if (h === 'class') return t('Class')
  if (h === 'segments') return t('Segments')
  if (h === 'percent') return t('Percent')
  if (h === 'type') return t('Type')
  if (h === 'segments_in_class') return t('Segments in the class')
  if (h === 'segments_total') return t('Segments in the corpus')
  if (h === 'chi2') return t('Chi²')
  if (h === 'p') return 'p'
  if (h === 'score') return t('Score')
  if (h === 'setting') return t('Setting')
  if (h === 'classes_obtained') return t('Classes obtained')
  if (h === 'percent_classified') return t('% classified')
  if (h === 'ari_vs_main') return t('Agreement with the main result (ARI)')
  if (h === 'error') return t('Error')
  if (h === 'document') return t('Document')
  if (h === 'text') return t('Text')
  const m = h.match(/^word_(\d)$/)
  if (m) return t('Word {{n}}', { n: m[1] })
  return h
}

export function LexicalResultView({ result, stale, title }: { result: StoredLexicalResult; stale: boolean; title: string }) {
  // Pictures (R images and window-drawn figures) in the order the test lists them.
  type Visual = { kind: 'image'; file: LexicalFile } | { kind: 'figure'; file: LexicalFile; name: string; figure: LexicalFigure }
  const visuals = useMemo(() => result.files.flatMap<Visual>((f) => {
    if (!f.data) return []
    if (f.role === 'image') return [{ kind: 'image' as const, file: f }]
    if (f.role !== 'figure') return []
    try { return [{ kind: 'figure' as const, file: f, name: f.name.replace(/\.json$/, ''), figure: JSON.parse(decodeText(f.data)) as LexicalFigure }] } catch { return [] }
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

      {visuals.map((v) => v.kind === 'figure' ? <FigureView key={v.file.name} figure={v.figure} baseName={v.name} /> : (
        <ZoomFrame key={v.file.name} tools={<button className="secondary lex-small-btn" onClick={() => save(v.file)}>{t('Export PNG')}</button>}>
          {(style) => <img src={`data:${v.file.mime};base64,${v.file.data}`} alt={title} draggable={false} style={style} />}
        </ZoomFrame>
      ))}

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
  if (f.title === 'Keyphrases') return t('Key expressions')
  if (f.title === 'Associations') return t('Associations')
  if (f.title === 'Examples') return t('Examples')
  if (f.title === 'Distribution') return t('Distribution')
  if (f.title === 'Emotions') return t('Emotions')
  if (f.title === 'Vocabulary') return t('Vocabulary')
  if (f.title === 'DocTopic') return t('Topics per document')
  if (f.title === 'SentimentWords') return t('Words with polarity')
  if (f.title === 'Themes') return t('Themes')
  if (f.title === 'ChdClasses') return t('Classes')
  if (f.title === 'ChdProfiles') return t('Class profiles')
  if (f.title === 'ChdAntiprofiles') return t('Antiprofiles')
  if (f.title === 'ChdTypical') return t('Typical segments')
  if (f.title === 'ChdRobustness') return t('Robustness')
  if (f.title === 'ChdVariables') return t('Variables per class')
  if (f.title === 'ThemeDocuments') return t('Documents per theme')
  if (f.title === 'ThemeSegments') return t('Representative segments')
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
    case 'sentiment-pt-only': return t('Sentiment uses OpLexicon, a Portuguese lexicon. Choose Portuguese as the corpus language.')
    case 'no-sentiment-words': return t('No word of the texts is in the sentiment lexicon.')
    case 'chd-too-small': return t('The CHD needs more text: too few segments or active words. Choose more documents or lower the minimum frequency.')
    case 'chd-no-classes': return t('The CHD found no stable classes in this corpus. Use more documents or fewer classes.')
    case 'thematic-too-small': return t('The thematic map needs at least two terms. Lower the minimum frequency or use more documents.')
    case 'thematic-empty': return t('No pair of words shares enough segments to form a network. Lower the minimum co-occurrences or use more documents.')
    case 'thematic-no-theme': return t('No theme has a word that appears at least {{count}} times. Lower the minimum theme frequency.', { count: detail ?? '' })
    case 'lda-too-small': return t('LDA needs at least two documents and two terms. Choose more documents or lower the minimum frequency.')
    case 'too-small': return t('The corpus is too small for associations. Use more documents or lower the minimum frequency.')
    case 'focal-not-found': return t('None of these keywords is in the analysed vocabulary: {{list}}. Check the spelling, use the dictionary form ("dado" instead of "dados") or lower the minimum frequency.', { list: detail ?? '' })
    case 'no-keyphrases': return t('No key expression passed the filters. Lower the minimum frequency or the smallest expression size.')
    case 'no-ngrams': return t('No sequence of words reaches the minimum frequency. Lower the minimum frequency and run again.')
    case 'r-not-found': return t('R was not found on this computer. The tests marked "R" need R 4.0 or newer.')
    case 'r-packages-missing': return t('These R packages are missing: {{list}}. Install them above and run again.', { list: (missing ?? []).join(', ') })
    case 'r-timeout': return t('R took longer than the time limit and was stopped. Try fewer documents or words.')
    case 'r-failed': return t('R could not finish the test.')
    case 'not-available': return t('This test is still being connected')
    default: return detail ? t('The test could not finish: {{error}}', { error: detail.slice(0, 300) }) : t('The test could not finish.')
  }
}
