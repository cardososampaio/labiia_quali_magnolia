/**
 * One lexical analysis in a tab: which documents, which language, the
 * test's settings, and Run. Shared by all the tests; what differs
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
import { t } from '../../i18n'
import {
  CORPUS_LANGUAGES,
  defaultParams,
  lexicalToolType,
  type CorpusLanguage,
  type LexicalParam,
  type LexicalParamValue,
  type LexicalTestDef
} from './lexical-catalog'
import { codeUnits, documentUnits, type LexicalSource } from './lexical-units'
import { ManualSelectButton } from '../ItemPicker/ManualSelectButton'
import { RStatusPanel } from './RStatusPanel'
import { LexicalResultView, RunProgressNotice, runErrorText, type StoredLexicalResult } from './LexicalResultView'
import { useLexicalRStore } from './lexical-r-store'
import { CONNECTED_TESTS } from './lexical-catalog'
import type { LexicalRunProgress, PreparationTable } from '../../models/lexical-api'
import { CorpusPreparationDialog } from './CorpusPreparationDialog'
import { preparationActive, setCorpusPreparation, useCorpusPreparation } from '../../labiia/corpus-prep-store'
import './Lexical.css'

export interface LexicalSavedConfig {
  docFilter: DocumentFilterState
  source: LexicalSource
  /** "Codes" source: the chosen codes and whether their subcodes count. */
  codeGuids?: string[]
  includeSubcodes?: boolean
  language: CorpusLanguage
  params: Record<string, LexicalParamValue>
  /** Whether this analysis uses the project's corpus preparation (when the project has one). */
  usePreparation?: boolean
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
  const [source, setSource] = useState<LexicalSource>(savedConfig?.source ?? 'documents')
  const [codeGuids, setCodeGuids] = useState<string[]>(savedConfig?.codeGuids ?? [])
  const [includeSubcodes, setIncludeSubcodes] = useState(savedConfig?.includeSubcodes ?? true)
  const [language, setLanguage] = useState<CorpusLanguage>(savedConfig?.language ?? 'pt')
  const [params, setParams] = useState(() => defaultParams(test, savedConfig?.params))
  const [usePreparation, setUsePreparation] = useState(savedConfig?.usePreparation ?? true)
  const [showPreparation, setShowPreparation] = useState(false)
  const preparation = useCorpusPreparation()
  // The project's preparation applies unless this analysis turned it off.
  const prepApplies = usePreparation && preparationActive(preparation)
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
  const currentConfig = useMemo(() => ({ docFilter, source, codeGuids, includeSubcodes, language, params, usePreparation, ranAt: resultStamp(result) }), [docFilter, source, codeGuids, includeSubcodes, language, params, usePreparation, result])
  const initialBaseline = useMemo(() => ({
    docFilter: savedConfig?.docFilter ?? emptyDocumentFilter(),
    source: (savedConfig?.source ?? 'documents') as LexicalSource,
    codeGuids: savedConfig?.codeGuids ?? [],
    includeSubcodes: savedConfig?.includeSubcodes ?? true,
    language: savedConfig?.language ?? ('pt' as CorpusLanguage),
    params: defaultParams(test, savedConfig?.params),
    usePreparation: savedConfig?.usePreparation ?? true,
    ranAt: resultStamp(savedConfig?.result)
  }), [])
  const { dirty, baseline, setBaseline } = useToolDirtyState(currentConfig, initialBaseline, inTab)

  const handleDiscard = useCallback(() => {
    setDocFilter(baseline.docFilter)
    setSource(baseline.source)
    setCodeGuids(baseline.codeGuids)
    setIncludeSubcodes(baseline.includeSubcodes)
    setLanguage(baseline.language)
    setParams(baseline.params)
    setUsePreparation(baseline.usePreparation)
    setResult(savedConfig?.result)
  }, [baseline])

  const filteredSourceGuids = useMemo(
    () => resolveFilteredSources(data, docFilter.sourceGuids, docFilter.tagGuids, docFilter.tagExcludeGuids, docFilter.typeInclude, docFilter.typeExclude),
    [data, docFilter]
  )
  const docUnits = useMemo(() => documentUnits(data, filteredSourceGuids), [data, filteredSourceGuids])
  const codeTexts = useMemo(
    () => (source === 'codes' ? codeUnits(data, filteredSourceGuids, codeGuids, includeSubcodes) : null),
    [source, data, filteredSourceGuids, codeGuids, includeSubcodes]
  )
  // The "Codes" source analyses one text per chosen code (its passages in the chosen documents)
  // instead of whole documents.
  const units = codeTexts ? codeTexts.units : docUnits.units
  // Documents without text only matter when whole documents are analysed.
  const skipped = codeTexts ? [] : docUnits.skipped
  const wordEstimate = useMemo(() => units.reduce((n, u) => n + countWords(u.text), 0), [units])

  // What a result depends on: which documents, the language, the settings and the corpus preparation.
  // Variables and dates change CHD profiles and timelines: a change marks the result as outdated.
  // Without a preparation the signature is as before, so earlier results do not look outdated.
  const runSignature = useMemo(
    () => JSON.stringify({ docs: units.map((u) => [u.id, u.variables, u.date]), language, params, ...(prepApplies ? { preparation } : {}) }),
    [units, language, params, prepApplies, preparation]
  )

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
      // The project's choices become a table of replacements for these texts (plurals are found in them).
      let table: PreparationTable | undefined
      if (prepApplies) table = await window.api.lexical.prepBuild(language, units.map((u) => u.text), preparation)
      if (runIdRef.current !== runId) return
      const res = await window.api.lexical.run({
        runId,
        testId: test.id,
        language,
        params,
        units: units.map((u) => ({ id: u.id, name: u.name, document: u.document, text: u.text, parts: u.parts, kind: u.kind, variables: u.variables, date: u.date })),
        ...(table ? { preparation: table } : {})
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
  }, [test, language, params, units, runSignature, prepApplies, preparation])

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
      config: { docFilter, source, codeGuids, includeSubcodes, language, params, usePreparation, result }
    })
    setBaseline({ docFilter, source, codeGuids, includeSubcodes, language, params, usePreparation, ranAt: resultStamp(result) })
    if (inTab) inTab.onSaved(analysisGuid, name)
  }, [analysisGuid, test.id, docFilter, source, codeGuids, includeSubcodes, language, params, usePreparation, result, inTab, setBaseline])

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
  // Settings the test chooses itself while its automatic switch is on.
  const automaticKeys = test.automatic && params[test.automatic.switch] === true ? new Set(test.automatic.keys) : null
  const isAutomatic = (key: string): boolean => automaticKeys?.has(key) ?? false

  return (
    <div className="lex-tab">
      <div className="lex-header">
        <h2>
          <Icon icon={test.icon} className="analysis-header-icon" style={{ fontSize: 16, color: test.color }} />
          {test.label}{isExisting ? ':' : ''}
          {isExisting && <EditableTitleSuffix name={analysisName} onRename={handleRename} />}
        </h2>
        <div style={{ flex: 1 }} />
        <button className="secondary lex-header-btn" onClick={() => inTab?.onClose()}>{t('labiia.lexical.close')}</button>
        {isExisting && dirty && (
          <button className="secondary lex-header-btn" onClick={handleDiscard}>{t('labiia.lexical.discardChanges')}</button>
        )}
        {isExisting ? (
          <button className="lex-header-btn" disabled={!dirty} onClick={() => handleSave(analysisName)}>
            {dirty ? t('labiia.lexical.updateAnalysis') : t('labiia.lexical.saved')}
          </button>
        ) : (
          <button className="lex-header-btn" onClick={() => setShowSaveDialog(true)}>{t('labiia.lexical.saveAnalysis')}</button>
        )}
        {/* Clearance for the floating MemoFab. */}
        <div style={{ width: 36, flexShrink: 0 }} />
      </div>

      {showSaveDialog && (
        <SaveDialog initial={analysisName} onCancel={() => setShowSaveDialog(false)} onSave={handleSave} />
      )}

      <div className="lex-body">
        <p className="lex-description">{test.description}</p>

        {/* The first choice: whole documents, or one text per code. */}
        <div className="analysis-section lex-section lex-grid">
          <div className="lex-field">
            <span className="lex-label">{t('labiia.lexical.whatToAnalyse')}</span>
            <SegmentedControl
              value={source}
              onChange={(v) => {
                setSource(v as LexicalSource)
                // With codes, the documents only narrow the passages: they start folded away.
                setDocSectionOpen(v === 'documents')
              }}
              label={t('labiia.lexical.whatToAnalyse')}
              options={[
                { value: 'documents', label: t('labiia.lexical.documents') },
                { value: 'codes', label: t('labiia.lexical.codes') }
              ]}
            />
          </div>
          <label className="lex-field">
            <span className="lex-label">{t('labiia.lexical.corpusLanguage')}</span>
            <select value={language} onChange={(e) => setLanguage(e.target.value as CorpusLanguage)}>
              {CORPUS_LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </label>
          <div className="lex-field">
            <span className="lex-label">{t('labiia.lexical.prep.title')}</span>
            <div className="lex-prep-inline">
              <button className="secondary lex-small-btn" onClick={() => setShowPreparation(true)}>{t('labiia.lexical.prep.open')}</button>
              <span className="lex-muted">{preparationActive(preparation) ? t('labiia.lexical.prep.statusOn') : t('labiia.lexical.prep.statusOff')}</span>
            </div>
            {preparationActive(preparation) && (
              <label className="lex-field-check" title={t('labiia.lexical.prep.useHelp')}>
                <input type="checkbox" checked={usePreparation} onChange={(e) => setUsePreparation(e.target.checked)} />
                <span>{t('labiia.lexical.prep.useInAnalysis')}</span>
              </label>
            )}
          </div>
        </div>

        {showPreparation && (
          <CorpusPreparationDialog
            initial={preparation}
            language={language}
            texts={units.map((u) => u.text)}
            onCancel={() => setShowPreparation(false)}
            onSave={(p) => {
              setCorpusPreparation(p)
              setShowPreparation(false)
            }}
          />
        )}

        {codeTexts && (
          <div className="analysis-section lex-section">
            <div className="lex-codes-head">
              <span className="lex-section-title">{t('labiia.lexical.codes')}</span>
              <span className="lex-section-summary">
                {t('labiia.lexical.code', { count: units.length })} · {t('labiia.lexical.aboutWord', { count: wordEstimate })}
              </span>
            </div>
            <div className="lex-codes-head" style={{ marginTop: 8 }}>
              <ManualSelectButton
                kinds={['code']}
                data={data}
                title={t('labiia.lexical.codes')}
                label={codeGuids.length ? t('labiia.lexical.changeCodes') : t('labiia.lexical.chooseCodes')}
                onPicked={(picked) => setCodeGuids([...new Set([...codeGuids, ...(picked.code ?? []).map((c) => c.guid)])])}
              />
              <label className="lex-field-check">
                <input type="checkbox" checked={includeSubcodes} onChange={(e) => setIncludeSubcodes(e.target.checked)} />
                <span>{t('labiia.lexical.includeSubcodes')}</span>
              </label>
            </div>
            {codeGuids.length > 0 && (
              <div className="lex-chips">
                {codeGuids.map((g) => {
                  const code = data.codes.find((c) => c.guid === g)
                  const count = codeTexts.passageCounts[g] ?? 0
                  return (
                    <span key={g} className="lex-chip" style={{ borderColor: code?.color ?? 'var(--border)' }}>
                      {code?.name ?? g}
                      <span className="lex-chip-count">{t('labiia.lexical.passage', { count: count })}</span>
                      <button className="lex-chip-x" title={t('labiia.lexical.remove')} onClick={() => setCodeGuids(codeGuids.filter((x) => x !== g))}>×</button>
                    </span>
                  )
                })}
              </div>
            )}
            <div className="lex-note">
              {codeGuids.length === 0
                ? t('labiia.lexical.chooseTheCodesToAnalyse')
                : t('labiia.lexical.eachCodeIsOneText')}
              {codeTexts.passagesWithoutText > 0 && (
                <> · {t('labiia.lexical.passageWithoutTextImageOr', { count: codeTexts.passagesWithoutText })}</>
              )}
            </div>
            {codeTexts.codesWithoutText.length > 0 && (
              <div className="lex-note">
                <Icon icon={faExclamationTriangle} style={{ fontSize: 12 }} />
                {t('labiia.lexical.codeHasNoPassageWith', { count: codeTexts.codesWithoutText.length })}
                {': '}{codeTexts.codesWithoutText.slice(0, 5).join(', ')}{codeTexts.codesWithoutText.length > 5 ? '…' : ''}
              </div>
            )}
          </div>
        )}

        <div className="analysis-section lex-section">
          <div className="lex-section-toggle" onClick={() => setDocSectionOpen(!docSectionOpen)}>
            <Icon icon={docSectionOpen ? faChevronDown : faChevronRight} style={{ fontSize: 12, color: 'var(--text-muted)' }} />
            <span className="lex-section-title">{codeTexts ? t('labiia.lexical.limitToDocumentsOptional') : t('labiia.lexical.selectDocuments')}</span>
            <span className="lex-section-summary">
              {codeTexts
                ? t('labiia.lexical.document', { count: filteredSourceGuids.length })
                : <>{t('labiia.lexical.document2', { count: units.length })} · {t('labiia.lexical.aboutWord2', { count: wordEstimate })}</>}
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
              {t('labiia.lexical.documentHasNoTextAnd', { count: skipped.length })}
              {': '}{skipped.slice(0, 5).map((s) => s.name).join(', ')}{skipped.length > 5 ? '…' : ''}
            </div>
          )}
        </div>


        {test.params.length > 0 && (
          <div className="analysis-section lex-section">
            <div className="lex-section-title" style={{ marginBottom: 10 }}>{t('labiia.lexical.settings')}</div>
            <div className="lex-grid">
              {mainParams.map((p) => <ParamField key={p.key} param={p} value={params[p.key]} onChange={setParam} automatic={isAutomatic(p.key)} />)}
            </div>
            {advancedParams.length > 0 && (
              <>
                <div className="lex-section-toggle" style={{ marginTop: 12 }} onClick={() => setShowAdvanced(!showAdvanced)}>
                  <Icon icon={showAdvanced ? faChevronDown : faChevronRight} style={{ fontSize: 12, color: 'var(--text-muted)' }} />
                  <span className="lex-advanced-title">{t('labiia.lexical.moreSettings')}</span>
                </div>
                {showAdvanced && (
                  <div className="lex-grid" style={{ marginTop: 10 }}>
                    {advancedParams.map((p) => <ParamField key={p.key} param={p} value={params[p.key]} onChange={setParam} automatic={isAutomatic(p.key)} />)}
                  </div>
                )}
              </>
            )}
            <button className="secondary lex-reset" onClick={() => setParams(defaultParams(test))}>{t('labiia.lexical.restoreDefaults')}</button>
          </div>
        )}

        {test.engine === 'r' && <RStatusPanel packages={test.rPackages} />}

        <div className="lex-run-row">
          <button className="lex-run" disabled={!canRun} onClick={() => void handleRun()}>
            {result ? t('labiia.lexical.runAgain') : t('labiia.lexical.run')}
          </button>
          {!connected && <span className="lex-run-note">{t('labiia.lexical.thisTestIsStillBeing')}</span>}
          {connected && units.length === 0 && <span className="lex-run-note">{source === 'codes' ? t('labiia.lexical.chooseAtLeastOneCode') : t('labiia.lexical.chooseAtLeastOneDocument')}</span>}
        </div>

        {running && <RunProgressNotice progress={progress} onCancel={handleCancel} />}
        {runError && (
          <div className="analysis-section lex-section lex-run-error">
            <div className="lex-r-line lex-r-bad"><Icon icon={faExclamationTriangle} style={{ fontSize: 13 }} /><span>{runError.text}</span></div>
            {runError.detail && (
              <details className="lex-details">
                <summary>{t('labiia.lexical.detailsFromR')}</summary>
                <pre>{runError.detail}</pre>
              </details>
            )}
          </div>
        )}
        <div ref={resultRef}>
          {result && !running && (
            <LexicalResultView
              result={result}
              stale={result.ranWith !== runSignature}
              title={test.label}
              onChangeFile={(name, data) => setResult((r) => r && { ...r, editedAt: new Date().toISOString(), files: r.files.map((f) => (f.name === name ? { ...f, data } : f)) })}
            />
          )}
        </div>
      </div>
    </div>
  )
}

/** A result's identity for dirty tracking: when it ran and when it was last changed in place. */
function resultStamp(result: StoredLexicalResult | undefined): string {
  return result ? `${result.ranAt}${result.editedAt ? `|${result.editedAt}` : ''}` : ''
}

function ParamField({ param, value, onChange, automatic = false }: { param: LexicalParam; value: LexicalParamValue; onChange: (key: string, v: LexicalParamValue) => void; automatic?: boolean }) {
  // A setting chosen automatically stays visible but cannot be edited, and says why.
  const title = automatic ? t('labiia.lexical.chosenAutomatically') : param.help
  if (param.kind === 'bool') {
    return (
      <label className="lex-field lex-field-check" title={title} style={automatic ? { opacity: 0.55 } : undefined}>
        <input type="checkbox" checked={value === true} disabled={automatic} onChange={(e) => onChange(param.key, e.target.checked)} />
        <span>{param.label}</span>
      </label>
    )
  }
  return (
    <label className="lex-field" title={title} style={automatic ? { opacity: 0.55 } : undefined}>
      <span className="lex-label">{param.label}</span>
      {param.kind === 'select' ? (
        <select value={String(value)} disabled={automatic} onChange={(e) => onChange(param.key, e.target.value)}>
          {param.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : param.kind === 'text' ? (
        <input type="text" value={String(value)} disabled={automatic} placeholder={param.placeholder} onChange={(e) => onChange(param.key, e.target.value)} />
      ) : (
        <input
          type="number"
          disabled={automatic}
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
  const submit = (): void => onSave(name.trim() || t('labiia.lexical.untitled'))
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('labiia.lexical.saveAnalysis')}</h2>
        <input
          autoFocus
          type="text"
          value={name}
          placeholder={t('labiia.lexical.analysisName')}
          style={{ width: '100%' }}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') onCancel()
          }}
        />
        <div className="modal-actions">
          <button className="secondary" onClick={onCancel}>{t('labiia.lexical.cancel')}</button>
          <button onClick={submit}>{t('labiia.lexical.save')}</button>
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
