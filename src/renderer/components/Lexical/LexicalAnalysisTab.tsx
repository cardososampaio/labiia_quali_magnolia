/**
 * One lexical analysis in a tab: which documents, which language, the
 * test's settings, and Run. Shared by all twelve tests; what differs
 * between them (settings, engine, result view) comes from the catalog.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AnalysisInitData } from '../../models/types'
import { Icon, faChevronDown, faChevronRight, faExclamationTriangle } from '../Icon'
import { DocumentSelector, emptyDocumentFilter, type DocumentFilterState } from '../DocumentSelector/DocumentSelector'
import { resolveFilteredSources } from '../Analysis/analysis-helpers'
import { useLiveAnalysisData } from '../Analysis/use-live-analysis-data'
import { SegmentedControl } from '../Analysis/SegmentedControl'
import { EditableTitleSuffix } from '../EditableTitleSuffix'
import { renameSavedAnalysis } from '../../utils/rename-saved-analysis'
import { generateGuid } from '../../utils/guid'
import { useToolDirtyState } from '../../hooks/use-tool-dirty-state'
import { useRegisterToolSave } from '../../hooks/use-register-tool-save'
import { t, tn } from '../../i18n'
import {
  CORPUS_LANGUAGES,
  defaultParams,
  lexicalToolType,
  type CorpusLanguage,
  type LexicalParam,
  type LexicalParamValue,
  type LexicalTestDef
} from './lexical-catalog'
import { documentUnits, type LexicalSource } from './lexical-units'
import { RStatusPanel } from './RStatusPanel'
import { LexicalResultView, RunProgressNotice, runErrorText, type StoredLexicalResult } from './LexicalResultView'
import { useLexicalRStore } from './lexical-r-store'
import { CONNECTED_TESTS } from './lexical-catalog'
import type { LexicalRunProgress } from '../../models/lexical-api'
import './Lexical.css'

export interface LexicalSavedConfig {
  docFilter: DocumentFilterState
  source: LexicalSource
  language: CorpusLanguage
  params: Record<string, LexicalParamValue>
  result?: StoredLexicalResult
  guid: string
  name: string
}

interface Props {
  test: LexicalTestDef
  data: AnalysisInitData
  savedConfig?: Partial<LexicalSavedConfig>
  inTab?: {
    onClose: () => void
    onSaved: (savedGuid: string, name: string) => void
    onDirtyChange?: (dirty: boolean) => void
    tabId?: string
  }
}

export function LexicalAnalysisTab({ test, data: propData, savedConfig, inTab }: Props) {
  const live = useLiveAnalysisData()
  const data = useMemo(() => ({ ...propData, ...live }), [propData, live])

  const [docFilter, setDocFilter] = useState<DocumentFilterState>(savedConfig?.docFilter ?? emptyDocumentFilter())
  const [docSectionOpen, setDocSectionOpen] = useState(!savedConfig?.guid)
  const [source, setSource] = useState<LexicalSource>('documents')
  const [language, setLanguage] = useState<CorpusLanguage>(savedConfig?.language ?? 'pt')
  const [params, setParams] = useState(() => defaultParams(test, savedConfig?.params))
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [analysisGuid] = useState(savedConfig?.guid ?? generateGuid())
  const [analysisName, setAnalysisName] = useState(savedConfig?.name ?? '')
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const isExisting = !!savedConfig?.guid
  const [result, setResult] = useState<StoredLexicalResult | undefined>(savedConfig?.result)
  const [running, setRunning] = useState<string | null>(null)
  const [progress, setProgress] = useState<LexicalRunProgress | null>(null)
  const [runError, setRunError] = useState<{ text: string; detail?: string } | null>(null)
  const runIdRef = useRef<string | null>(null)
  const resultRef = useRef<HTMLDivElement>(null)
  const scrollToResult = useRef(false)
  const connected = CONNECTED_TESTS.has(test.id)

  // The result's run time stands for the result in dirty tracking (comparing images would be slow).
  const currentConfig = useMemo(() => ({ docFilter, source, language, params, ranAt: result?.ranAt ?? '' }), [docFilter, source, language, params, result])
  const initialBaseline = useMemo(() => ({
    docFilter: savedConfig?.docFilter ?? emptyDocumentFilter(),
    source: 'documents' as LexicalSource,
    language: savedConfig?.language ?? ('pt' as CorpusLanguage),
    params: defaultParams(test, savedConfig?.params),
    ranAt: savedConfig?.result?.ranAt ?? ''
  }), [])
  const { dirty, baseline, setBaseline } = useToolDirtyState(currentConfig, initialBaseline, inTab)

  const handleDiscard = useCallback(() => {
    setDocFilter(baseline.docFilter)
    setLanguage(baseline.language)
    setParams(baseline.params)
    setResult(savedConfig?.result)
  }, [baseline])

  const filteredSourceGuids = useMemo(
    () => resolveFilteredSources(data, docFilter.sourceGuids, docFilter.tagGuids, docFilter.tagExcludeGuids, docFilter.typeInclude, docFilter.typeExclude),
    [data, docFilter]
  )
  const { units, skipped } = useMemo(() => documentUnits(data, filteredSourceGuids), [data, filteredSourceGuids])
  const wordEstimate = useMemo(() => units.reduce((n, u) => n + countWords(u.text), 0), [units])

  // What a result depends on: which documents, the language and the settings.
  // Variables and dates change CHD profiles and timelines: a change marks the result as outdated.
  const runSignature = useMemo(() => JSON.stringify({ docs: units.map((u) => [u.id, u.variables, u.date]), language, params }), [units, language, params])

  const rStatus = useLexicalRStore((s) => s.status)
  const rPackages = useLexicalRStore((s) => s.packages)
  const rReady = test.engine !== 'r' || (rStatus?.found === true && test.rPackages.every((p) => rPackages[p] === true))
  const canRun = connected && !running && units.length > 0 && rReady

  useEffect(() => window.api.lexical.onRunProgress((p) => {
    if (p.runId === runIdRef.current) setProgress(p)
  }), [])

  const handleRun = useCallback(async () => {
    const runId = generateGuid()
    runIdRef.current = runId
    setRunning(runId)
    setProgress(null)
    setRunError(null)
    try {
      const res = await window.api.lexical.run({
        runId,
        testId: test.id,
        language,
        params,
        units: units.map((u) => ({ id: u.id, name: u.name, text: u.text, variables: u.variables, date: u.date }))
      })
      if (runIdRef.current !== runId) return
      if (res.ok && res.files) {
        setResult({ files: res.files, summary: res.summary, corpus: res.corpus, ranWith: runSignature, ranAt: new Date().toISOString() })
        scrollToResult.current = true
      } else if (res.error !== 'cancelled') {
        setRunError({ text: runErrorText(res.error ?? 'failed', res.detail, res.missingPackages), detail: res.error === 'r-failed' ? res.detail : undefined })
        if (res.error === 'r-packages-missing') void useLexicalRStore.getState().checkPackages(test.rPackages)
      }
    } catch (err) {
      setRunError({ text: runErrorText('failed', String(err)) })
    } finally {
      if (runIdRef.current === runId) {
        runIdRef.current = null
        setRunning(null)
        setProgress(null)
      }
    }
  }, [test, language, params, units, runSignature])

  // A fresh result sits below the settings: bring it into view once it is drawn.
  useEffect(() => {
    if (!scrollToResult.current || running || !result) return
    scrollToResult.current = false
    resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [result, running])

  const handleCancel = useCallback(() => {
    const runId = runIdRef.current
    if (!runId) return
    runIdRef.current = null
    setRunning(null)
    setProgress(null)
    void window.api.lexical.cancelRun(runId)
  }, [])

  const handleRename = useCallback((newName: string) => {
    setAnalysisName(newName)
    renameSavedAnalysis(analysisGuid, newName)
    if (inTab) inTab.onSaved('', newName)
  }, [analysisGuid, inTab])

  const handleSave = useCallback((name: string) => {
    setAnalysisName(name)
    setShowSaveDialog(false)
    window.api.sendAnalysisAction('save-analysis', {
      guid: analysisGuid,
      toolType: lexicalToolType(test.id),
      name,
      config: { docFilter, source, language, params, result }
    })
    setBaseline({ docFilter, source, language, params, ranAt: result?.ranAt ?? '' })
    if (inTab) inTab.onSaved(analysisGuid, name)
  }, [analysisGuid, test.id, docFilter, source, language, params, result, inTab, setBaseline])

  useRegisterToolSave(inTab?.tabId, () => {
    if (isExisting) {
      handleSave(analysisName)
      return true
    }
    setShowSaveDialog(true)
    return false
  })

  const setParam = (key: string, value: LexicalParamValue): void => setParams((p) => ({ ...p, [key]: value }))
  const advanced = new Set(test.advanced ?? [])
  const mainParams = test.params.filter((p) => !advanced.has(p.key))
  const advancedParams = test.params.filter((p) => advanced.has(p.key))

  return (
    <div className="lex-tab">
      <div className="lex-header">
        <h2>
          <Icon icon={test.icon} className="analysis-header-icon" style={{ fontSize: 16, color: test.color }} />
          {test.label}{isExisting ? ':' : ''}
          {isExisting && <EditableTitleSuffix name={analysisName} onRename={handleRename} />}
        </h2>
        <div style={{ flex: 1 }} />
        <button className="secondary lex-header-btn" onClick={() => inTab?.onClose()}>{t('Close')}</button>
        {isExisting && dirty && (
          <button className="secondary lex-header-btn" onClick={handleDiscard}>{t('Discard Changes')}</button>
        )}
        {isExisting ? (
          <button className="lex-header-btn" disabled={!dirty} onClick={() => handleSave(analysisName)}>
            {dirty ? t('Update Analysis') : t('Saved')}
          </button>
        ) : (
          <button className="lex-header-btn" onClick={() => setShowSaveDialog(true)}>{t('Save Analysis')}</button>
        )}
        {/* Clearance for the floating MemoFab. */}
        <div style={{ width: 36, flexShrink: 0 }} />
      </div>

      {showSaveDialog && (
        <SaveDialog initial={analysisName} onCancel={() => setShowSaveDialog(false)} onSave={handleSave} />
      )}

      <div className="lex-body">
        <p className="lex-description">{test.description}</p>

        <div className="analysis-section lex-section">
          <div className="lex-section-toggle" onClick={() => setDocSectionOpen(!docSectionOpen)}>
            <Icon icon={docSectionOpen ? faChevronDown : faChevronRight} style={{ fontSize: 12, color: 'var(--text-muted)' }} />
            <span className="lex-section-title">{t('Select Documents')}</span>
            <span className="lex-section-summary">
              {tn(units.length, '{{count}} document', '{{count}} documents')} · {tn(wordEstimate, 'about {{count}} word', 'about {{count}} words')}
            </span>
          </div>
          {docSectionOpen && (
            <div style={{ marginTop: 10, minHeight: 160 }}>
              <DocumentSelector sources={data.sources} tags={data.tags} categories={data.categories} folders={data.folders} sourceFolder={data.sourceFolder} tagMembers={data.tagMembers} respondentTagMembers={data.respondentTagMembers} questionTagMembers={data.questionTagMembers} surveyEntityLabels={data.surveyEntityLabels} filter={docFilter} onChange={setDocFilter} />
            </div>
          )}
          {skipped.length > 0 && (
            <div className="lex-note">
              <Icon icon={faExclamationTriangle} style={{ fontSize: 12 }} />
              {tn(skipped.length, '{{count}} document has no text and is left out', '{{count}} documents have no text and are left out')}
              {': '}{skipped.slice(0, 5).map((s) => s.name).join(', ')}{skipped.length > 5 ? '…' : ''}
            </div>
          )}
        </div>

        <div className="analysis-section lex-section lex-grid">
          <div className="lex-field">
            <span className="lex-label">{t('Analyse')}</span>
            <SegmentedControl
              value={source}
              onChange={(v) => setSource(v as LexicalSource)}
              label={t('Analyse')}
              options={[
                { value: 'documents', label: t('Documents') },
                { value: 'codes', label: t('Codes (coming soon)'), disabled: true }
              ]}
            />
          </div>
          <label className="lex-field">
            <span className="lex-label">{t('Corpus language')}</span>
            <select value={language} onChange={(e) => setLanguage(e.target.value as CorpusLanguage)}>
              {CORPUS_LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </label>
        </div>

        {test.params.length > 0 && (
          <div className="analysis-section lex-section">
            <div className="lex-section-title" style={{ marginBottom: 10 }}>{t('Settings')}</div>
            <div className="lex-grid">
              {mainParams.map((p) => <ParamField key={p.key} param={p} value={params[p.key]} onChange={setParam} />)}
            </div>
            {advancedParams.length > 0 && (
              <>
                <div className="lex-section-toggle" style={{ marginTop: 12 }} onClick={() => setShowAdvanced(!showAdvanced)}>
                  <Icon icon={showAdvanced ? faChevronDown : faChevronRight} style={{ fontSize: 12, color: 'var(--text-muted)' }} />
                  <span className="lex-advanced-title">{t('More settings')}</span>
                </div>
                {showAdvanced && (
                  <div className="lex-grid" style={{ marginTop: 10 }}>
                    {advancedParams.map((p) => <ParamField key={p.key} param={p} value={params[p.key]} onChange={setParam} />)}
                  </div>
                )}
              </>
            )}
            <button className="secondary lex-reset" onClick={() => setParams(defaultParams(test))}>{t('Restore defaults')}</button>
          </div>
        )}

        {test.engine === 'r' && <RStatusPanel packages={test.rPackages} />}

        <div className="lex-run-row">
          <button className="lex-run" disabled={!canRun} onClick={() => void handleRun()}>
            {result ? t('Run again') : t('Run')}
          </button>
          {!connected && <span className="lex-run-note">{t('This test is still being connected')}</span>}
          {connected && units.length === 0 && <span className="lex-run-note">{t('Choose at least one document with text.')}</span>}
        </div>

        {running && <RunProgressNotice progress={progress} onCancel={handleCancel} />}
        {runError && (
          <div className="analysis-section lex-section lex-run-error">
            <div className="lex-r-line lex-r-bad"><Icon icon={faExclamationTriangle} style={{ fontSize: 13 }} /><span>{runError.text}</span></div>
            {runError.detail && (
              <details className="lex-details">
                <summary>{t('Details from R')}</summary>
                <pre>{runError.detail}</pre>
              </details>
            )}
          </div>
        )}
        <div ref={resultRef}>
          {result && !running && <LexicalResultView result={result} stale={result.ranWith !== runSignature} title={test.label} />}
        </div>
      </div>
    </div>
  )
}

function ParamField({ param, value, onChange }: { param: LexicalParam; value: LexicalParamValue; onChange: (key: string, v: LexicalParamValue) => void }) {
  if (param.kind === 'bool') {
    return (
      <label className="lex-field lex-field-check" title={param.help}>
        <input type="checkbox" checked={value === true} onChange={(e) => onChange(param.key, e.target.checked)} />
        <span>{param.label}</span>
      </label>
    )
  }
  return (
    <label className="lex-field" title={param.help}>
      <span className="lex-label">{param.label}</span>
      {param.kind === 'select' ? (
        <select value={String(value)} onChange={(e) => onChange(param.key, e.target.value)}>
          {param.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : param.kind === 'text' ? (
        <input type="text" value={String(value)} placeholder={param.placeholder} onChange={(e) => onChange(param.key, e.target.value)} />
      ) : (
        <input
          type="number"
          min={param.min}
          max={param.max}
          step={param.kind === 'number' ? param.step : (param.step ?? 1)}
          value={Number(value)}
          onChange={(e) => {
            const n = e.target.valueAsNumber
            if (Number.isFinite(n)) onChange(param.key, n)
          }}
          onBlur={(e) => {
            // Keep the value inside the test's range once the user leaves the field.
            const n = e.target.valueAsNumber
            const v = Number.isFinite(n) ? Math.min(param.max, Math.max(param.min, n)) : param.default
            onChange(param.key, param.kind === 'int' ? Math.round(v) : v)
          }}
        />
      )}
    </label>
  )
}

function SaveDialog({ initial, onCancel, onSave }: { initial: string; onCancel: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState(initial)
  const submit = (): void => onSave(name.trim() || t('Untitled'))
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('Save Analysis')}</h2>
        <input
          autoFocus
          type="text"
          value={name}
          placeholder={t('Analysis name')}
          style={{ width: '100%' }}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') onCancel()
          }}
        />
        <div className="modal-actions">
          <button className="secondary" onClick={onCancel}>{t('Cancel')}</button>
          <button onClick={submit}>{t('Save')}</button>
        </div>
      </div>
    </div>
  )
}

/** Rough word count for the selection summary (the real count comes from corpus preparation). */
function countWords(text: string): number {
  const m = text.match(/[\p{L}\p{M}\p{N}]+/gu)
  return m ? m.length : 0
}
