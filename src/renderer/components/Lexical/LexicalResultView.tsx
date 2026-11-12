/**
 * The result of a lexical test: corpus figures, the images and tables the
 * test produced, and export. Also the progress notice shown while a test
 * runs (corpus preparation can take minutes on large corpora).
 */
import { useMemo } from 'react'
import type { LexicalFile, LexicalRunProgress, LexicalCorpusStats } from '../../models/lexical-api'
import { t, formatNumber, formatDateTime } from '../../i18n'
import { FigureView } from './FigureView'
import { ZoomFrame } from './ZoomFrame'
import type { LexicalFigure } from '../../models/lexical-figures'
import { NetworkTextView, type NetworkData } from './network/NetworkTextView'

export interface StoredLexicalResult {
  files: LexicalFile[]
  summary?: Record<string, number | string>
  corpus?: LexicalCorpusStats
  /** Settings the result was produced with, to tell when it is out of date. */
  ranWith: string
  ranAt: string
  /** When the researcher last changed the result in place (text network positions). */
  editedAt?: string
}

export function RunProgressNotice({ progress, onCancel }: { progress: LexicalRunProgress | null; onCancel: () => void }) {
  // The long-wait notice appears only once the engine says the corpus is not in the cache.
  const preparing = progress?.stage === 'prepare' && progress.cached === false
  const pct = preparing && progress?.total ? Math.round(((progress.done ?? 0) / progress.total) * 100) : null
  let title: string
  let detail: string | null = null
  if (!progress) {
    title = t('labiia.lexical.startingTheTest')
  } else if (preparing) {
    title = t('labiia.lexical.preparingTheCorpus')
    detail = t('labiia.lexical.withManyDocumentsThisCan')
  } else if (progress?.stage === 'render') {
    title = t('labiia.lexical.drawingTheResultInR')
  } else {
    title = progress?.cached ? t('labiia.lexical.corpusReadyPreparedBeforeRunning') : t('labiia.lexical.runningTheTest')
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
            <span className="lex-muted">{t('labiia.lexical.ofDocuments', { done: formatNumber(progress?.done ?? 0), total: formatNumber(progress?.total ?? 0) })}</span>
          </div>
        )}
      </div>
      <button className="secondary lex-small-btn" onClick={onCancel}>{t('labiia.lexical.cancel')}</button>
    </div>
  )
}

export function CorpusFigures({ corpus }: { corpus: LexicalCorpusStats }) {
  return (
    <div className="lex-figures">
      <span>{t('labiia.lexical.text', { count: corpus.units })}</span>
      <span>{t('labiia.lexical.textSegment', { count: corpus.segments })}</span>
      <span>{t('labiia.lexical.occurrence', { count: corpus.occurrences })}</span>
      <span>{t('labiia.lexical.form', { count: corpus.forms })}</span>
      <span>{t('labiia.lexical.hapax', { count: corpus.hapax })}</span>
      {corpus.preparation && (
        <span title={t('labiia.lexical.prep.appliedHelp')}>
          {t('labiia.lexical.prep.applied', {
            plurals: corpus.preparation.plurals,
            variants: corpus.preparation.variants,
            equivalences: corpus.preparation.equivalences,
            expressions: corpus.preparation.expressions
          })}
        </span>
      )}
    </div>
  )
}

function decodeText(data: string): string {
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
  return new TextDecoder('utf-8').decode(bytes)
}

function encodeText(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
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
      {body.length > limit && <div className="lex-muted" style={{ marginTop: 6 }}>{t('labiia.lexical.showingOfRowsExportThe', { shown: limit, total: formatNumber(body.length) })}</div>}
    </div>
  )
}

/** Kind of word in the CHD profiles. */
function termType(v: string): string {
  if (v === 'active') return t('labiia.lexical.active')
  if (v === 'supplementary') return t('labiia.lexical.supplementary')
  if (v === 'variable') return t('labiia.lexical.variable')
  return v
}

function columnLabel(h: string): string {
  if (h === 'word') return t('labiia.lexical.word')
  if (h === 'freq' || h === 'frequency' || h === 'Frequency') return t('labiia.lexical.frequency')
  if (h === 'Phrase') return t('labiia.lexical.expression')
  if (h === 'RawYAKE') return t('labiia.lexical.yakeScore')
  if (h === 'Relevance') return t('labiia.lexical.relevance')
  if (h === 'DocCount') return t('labiia.lexical.segments')
  if (h === 'class') return t('labiia.lexical.class')
  if (h === 'segments') return t('labiia.lexical.segments')
  if (h === 'percent') return t('labiia.lexical.percent')
  if (h === 'type') return t('labiia.lexical.type')
  if (h === 'segments_in_class') return t('labiia.lexical.segmentsInTheClass')
  if (h === 'segments_total') return t('labiia.lexical.segmentsInTheCorpus')
  if (h === 'chi2') return t('labiia.lexical.chi2')
  if (h === 'p') return 'p'
  if (h === 'score') return t('labiia.lexical.score')
  if (h === 'setting') return t('labiia.lexical.setting')
  if (h === 'classes_obtained') return t('labiia.lexical.classesObtained')
  if (h === 'percent_classified') return t('labiia.lexical.classified')
  if (h === 'ari_vs_main') return t('labiia.lexical.agreementWithTheMainResult')
  if (h === 'error') return t('labiia.lexical.error')
  if (h === 'document') return t('labiia.lexical.documentColumn')
  if (h === 'text') return t('labiia.lexical.text2')
  if (h === 'degree') return t('labiia.lexical.network.degree')
  if (h === 'strength') return t('labiia.lexical.network.strength')
  if (h === 'betweenness') return t('labiia.lexical.network.betweenness')
  if (h === 'closeness') return t('labiia.lexical.network.closeness')
  if (h === 'eigenvector') return t('labiia.lexical.network.eigenvector')
  if (h === 'community') return t('labiia.lexical.network.communityLabel')
  if (h === 'source') return t('labiia.lexical.network.source')
  if (h === 'target') return t('labiia.lexical.network.target')
  if (h === 'weight') return t('labiia.lexical.network.weight')
  const m = h.match(/^word_(\d)$/)
  if (m) return t('labiia.lexical.word2', { n: m[1] })
  return h
}

export function LexicalResultView({ result, stale, title, onChangeFile }: { result: StoredLexicalResult; stale: boolean; title: string; onChangeFile?: (name: string, data: string) => void }) {
  // Pictures (R images and window-drawn figures) in the order the test lists them.
  type Visual = { kind: 'image'; file: LexicalFile } | { kind: 'figure'; file: LexicalFile; name: string; figure: LexicalFigure }
  const visuals = useMemo(() => result.files.flatMap<Visual>((f) => {
    if (!f.data) return []
    if (f.role === 'image') return [{ kind: 'image' as const, file: f }]
    if (f.role !== 'figure') return []
    try { return [{ kind: 'figure' as const, file: f, name: f.name.replace(/\.json$/, ''), figure: JSON.parse(decodeText(f.data)) as LexicalFigure }] } catch { return [] }
  }), [result.files])
  const tables = result.files.filter((f) => f.role === 'table' && f.data)
  const networkFile = result.files.find((f) => f.role === 'network' && f.data)
  const network = useMemo(() => {
    if (!networkFile?.data) return null
    try { return JSON.parse(decodeText(networkFile.data)) as NetworkData } catch { return null }
  }, [networkFile?.data])
  const save = (f: LexicalFile): void => { void window.api.lexical.saveFile({ name: f.name, mime: f.mime, data: f.data! }) }

  return (
    <div className="analysis-section lex-section lex-result">
      <div className="lex-result-head">
        <span className="lex-section-title">{t('labiia.lexical.result')}</span>
        <span className="lex-muted">{t('labiia.lexical.runOn', { date: formatDateTime(new Date(result.ranAt), { dateStyle: 'short', timeStyle: 'short' }) })}</span>
      </div>
      {stale && <div className="lex-note lex-note-warn">{t('labiia.lexical.theDocumentsOrSettingsChanged')}</div>}
      {result.corpus && <CorpusFigures corpus={result.corpus} />}

      {visuals.map((v) => v.kind === 'figure' ? <FigureView key={v.file.name} figure={v.figure} baseName={v.name} /> : (
        <ZoomFrame key={v.file.name} tools={<button className="secondary lex-small-btn" onClick={() => save(v.file)}>{t('labiia.lexical.exportPng')}</button>}>
          {(style) => <img src={`data:${v.file.mime};base64,${v.file.data}`} alt={title} draggable={false} style={style} />}
        </ZoomFrame>
      ))}

      {network && networkFile && (
        <NetworkTextView key={result.ranAt} data={network} onChange={onChangeFile ? (next) => onChangeFile(networkFile.name, encodeText(JSON.stringify(next))) : undefined} />
      )}

      {tables.map((f) => (
        <div key={f.name} className="lex-table-block">
          <div className="lex-figure-tools">
            <span className="lex-advanced-title">{tableTitle(f)}</span>
            <div style={{ flex: 1 }} />
            <button className="secondary lex-small-btn" onClick={() => save(f)}>{t('labiia.lexical.exportCsv')}</button>
          </div>
          <CsvPreview file={f} />
        </div>
      ))}
    </div>
  )
}

function tableTitle(f: LexicalFile): string {
  if (f.title === 'Bigrams') return t('labiia.lexical.bigrams')
  if (f.title === 'NetworkNodes') return t('labiia.lexical.network.nodesTable')
  if (f.title === 'NetworkEdges') return t('labiia.lexical.network.edgesTable')
  if (f.title === 'Trigrams') return t('labiia.lexical.trigrams')
  if (f.title === 'Branches') return t('labiia.lexical.branches')
  if (f.title === 'Keyphrases') return t('labiia.lexical.keyExpressions')
  if (f.title === 'Associations') return t('labiia.lexical.associations')
  if (f.title === 'Examples') return t('labiia.lexical.examples')
  if (f.title === 'Distribution') return t('labiia.lexical.distribution')
  if (f.title === 'Emotions') return t('labiia.lexical.emotions')
  if (f.title === 'Vocabulary') return t('labiia.lexical.vocabulary')
  if (f.title === 'DocTopic') return t('labiia.lexical.topicsPerDocument')
  if (f.title === 'SentimentWords') return t('labiia.lexical.wordsWithPolarity')
  if (f.title === 'Themes') return t('labiia.lexical.themes')
  if (f.title === 'ChdClasses') return t('labiia.lexical.classes')
  if (f.title === 'ChdProfiles') return t('labiia.lexical.classProfiles')
  if (f.title === 'ChdAntiprofiles') return t('labiia.lexical.antiprofiles')
  if (f.title === 'ChdTypical') return t('labiia.lexical.typicalSegments')
  if (f.title === 'ChdRobustness') return t('labiia.lexical.robustness')
  if (f.title === 'ChdVariables') return t('labiia.lexical.variablesPerClass')
  if (f.title === 'ThemeDocuments') return t('labiia.lexical.documentsPerTheme')
  if (f.title === 'ThemeSegments') return t('labiia.lexical.representativeSegments')
  return t('labiia.lexical.wordFrequencies')
}

/** Plain-language message for a failed run. */
export function runErrorText(error: string, detail?: string, missing?: string[]): string {
  switch (error) {
    case 'no-text': return t('labiia.lexical.theChosenDocumentsHaveNo')
    case 'no-words': return t('labiia.lexical.noWordReachesTheMinimum')
    case 'no-vocabulary': return t('labiia.lexical.noWordReachesTheMinimum')
    case 'keyword-not-found': return t('labiia.lexical.doesNotAppearInThe', { word: detail ?? '' })
    case 'no-branches': return t('labiia.lexical.theBranchesAreBelowThe')
    case 'sentiment-pt-only': return t('labiia.lexical.sentimentUsesOplexiconAPortuguese')
    case 'no-sentiment-words': return t('labiia.lexical.noWordOfTheTexts')
    case 'chd-too-small': return t('labiia.lexical.theChdNeedsMoreText')
    case 'chd-no-classes': return t('labiia.lexical.theChdFoundNoStable')
    case 'thematic-too-small': return t('labiia.lexical.theThematicMapNeedsAt')
    case 'thematic-empty': return t('labiia.lexical.noPairOfWordsShares')
    case 'thematic-no-theme': return t('labiia.lexical.noThemeHasAWord', { count: detail ?? '' })
    case 'lda-too-small': return t('labiia.lexical.ldaNeedsAtLeastTwo')
    case 'too-small': return t('labiia.lexical.theCorpusIsTooSmall')
    case 'focal-not-found': return t('labiia.lexical.noneOfTheseKeywordsIs', { list: detail ?? '' })
    case 'no-keyphrases': return t('labiia.lexical.noKeyExpressionPassedThe')
    case 'no-ngrams': return t('labiia.lexical.noSequenceOfWordsReaches')
    case 'no-network': return t('labiia.lexical.network.empty')
    case 'r-not-found': return t('labiia.lexical.rWasNotFoundOn')
    case 'r-packages-missing': return t('labiia.lexical.theseRPackagesAreMissing', { list: (missing ?? []).join(', ') })
    case 'r-timeout': return t('labiia.lexical.rTookLongerThanThe')
    case 'r-failed': return t('labiia.lexical.rCouldNotFinishThe')
    case 'not-available': return t('labiia.lexical.thisTestIsStillBeing')
    default:
      // The bundled helper did not start or stopped: say so plainly, with the whole error for the report.
      if (detail?.startsWith('helper-') || error.startsWith('helper-')) return t('labiia.diagnostics.helperFailedRun', { error: detail ?? error })
      return detail ? t('labiia.lexical.theTestCouldNotFinish', { error: detail }) : t('labiia.lexical.theTestCouldNotFinish2')
  }
}
