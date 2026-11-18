import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AnalysisInitData } from '../../models/types'
import { Icon, faBarsStaggered } from '../../components/Icon'
import { EditableTitleSuffix } from '../../components/EditableTitleSuffix'
import { DocumentsSection } from '../../components/Analysis/DocumentsSection'
import { documentFilterFromConfig } from '../../components/Analysis/documents-filter'
import {
  applySurveyCellScope,
  resolveFilteredSources,
  toCsv
} from '../../components/Analysis/analysis-helpers'
import { useLiveAnalysisData } from '../../components/Analysis/use-live-analysis-data'
import type { DocumentFilterState } from '../../components/DocumentSelector/DocumentSelector'
import { ManualSelectButton } from '../../components/ItemPicker/ManualSelectButton'
import { useToolDirtyState } from '../../hooks/use-tool-dirty-state'
import { useRegisterToolSave } from '../../hooks/use-register-tool-save'
import { useAnalysisTabsStore } from '../../stores/analysis-tabs-store'
import { generateGuid } from '../../utils/guid'
import { renameSavedAnalysis } from '../../utils/rename-saved-analysis'
import {
  buildClusteringInput,
  type ComparisonUnit
} from '../coding-units/units'
import {
  analyzeClusteringLocal,
  buildDendrogramSvg,
  clusterLeaves,
  dendrogramPairForNode,
  sharedReferences,
  type ClusterLinkage,
  type ClusterNode,
  type ClusterRequest,
  type ClusterResult,
  type ClusterTarget,
  type SimilarityMeasure
} from './model'
import { ClusterReferences } from './ClusterReferences'
import './clustering.css'

const ROW_HEIGHT = 24
const TREE_WIDTH = 220

export interface SavedClusteringConfig {
  docFilter?: DocumentFilterState
  target?: ClusterTarget
  unit?: ComparisonUnit
  measure?: SimilarityMeasure
  linkage?: ClusterLinkage
  selectedCodes?: string[]
  includeSubcodes?: boolean
  expandSurveyRespondents?: boolean
  minReferences?: number
  groupCount?: number
  view?: 'tree' | 'matrix'
  guid?: string
  name?: string
}

interface InTabProps {
  onClose: () => void
  onSaved: (savedGuid: string, name: string) => void
  onDirtyChange?: (dirty: boolean) => void
  tabId?: string
}

function Dendrogram({
  root,
  order,
  names,
  itemGuids,
  groups,
  label,
  pendingGuid,
  activePair,
  formatScore,
  onSelectBranch,
  onSelectLeaf
}: {
  root: ClusterNode
  order: number[]
  names: string[]
  itemGuids: string[]
  groups: number[]
  label: string
  pendingGuid: string | null
  activePair: [string, string] | null
  formatScore: (value: number) => string
  onSelectBranch: (node: ClusterNode) => void
  onSelectLeaf: (guid: string) => void
}) {
  const { t } = useTranslation()
  const row = new Map(order.map((leaf, index) => [leaf, (index + 0.5) * ROW_HEIGHT]))
  const branches: React.ReactNode[] = []
  const junctions: React.ReactNode[] = []

  function position(node: ClusterNode): [number, number] {
    const x = 8 + (1 - node.height) * (TREE_WIDTH - 16)
    if (!node.left || !node.right) return [x, row.get(node.id)!]
    const [lx, ly] = position(node.left)
    const [rx, ry] = position(node.right)
    const midY = (ly + ry) / 2
    branches.push(<path key={`p-${node.id}`} d={`M ${lx} ${ly} H ${x} V ${ry} H ${rx}`} />)
    const branchLabel = t('labiia.clustering.inspectBranch', {
      similarity: formatScore(Math.max(0, 1 - node.height)),
      distance: formatScore(node.height)
    })
    junctions.push(
      <circle
        key={`j-${node.id}`}
        cx={x}
        cy={midY}
        r={4}
        className="labiia-cluster-junction"
        role="button"
        tabIndex={0}
        aria-label={branchLabel}
        onClick={() => onSelectBranch(node)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelectBranch(node)
          }
        }}
      >
        <title>{branchLabel}</title>
      </circle>
    )
    return [x, midY]
  }
  position(root)

  return (
    <div className="labiia-cluster-tree">
      <svg role="img" aria-label={label} width={TREE_WIDTH} height={order.length * ROW_HEIGHT}>
        <g fill="none" stroke="currentColor">
          {branches}
        </g>
        <g>{junctions}</g>
      </svg>
      <ol>
        {order.map((leaf) => {
          const guid = itemGuids[leaf]
          const isSelected =
            pendingGuid === guid || (activePair ? activePair.includes(guid) : false)
          return (
            <li key={leaf}>
              <button
                type="button"
                className={`labiia-cluster-leaf${isSelected ? ' is-selected' : ''}`}
                title={t('labiia.clustering.selectLeafCompare', { name: names[leaf] })}
                aria-label={t('labiia.clustering.selectLeafCompare', { name: names[leaf] })}
                onClick={() => onSelectLeaf(guid)}
              >
                {groups[leaf]} · {names[leaf]}
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export function ClusteringTab({
  data: snapshot,
  savedConfig,
  inTab
}: {
  data: AnalysisInitData
  savedConfig?: SavedClusteringConfig
  inTab?: InTabProps
}) {
  const { t, i18n } = useTranslation()
  const live = useLiveAnalysisData()

  const [filter, setFilter] = useState<DocumentFilterState>(() =>
    documentFilterFromConfig(savedConfig)
  )
  const [target, setTarget] = useState<ClusterTarget>(savedConfig?.target ?? 'documents')
  const [unit, setUnit] = useState<ComparisonUnit>(savedConfig?.unit ?? 'document')
  const [measure, setMeasure] = useState<SimilarityMeasure>(savedConfig?.measure ?? 'cosine')
  const [linkage, setLinkage] = useState<ClusterLinkage>(savedConfig?.linkage ?? 'average')
  const [selectedCodes, setSelectedCodes] = useState<string[]>(savedConfig?.selectedCodes ?? [])
  const [includeSubcodes, setIncludeSubcodes] = useState<boolean>(
    savedConfig?.includeSubcodes ?? true
  )
  const [expandSurveyRespondents, setExpandSurveyRespondents] = useState<boolean>(
    savedConfig?.expandSurveyRespondents ?? true
  )
  const [minReferences, setMinReferences] = useState<number>(
    Math.max(1, savedConfig?.minReferences ?? 1)
  )
  const [groupCount, setGroupCount] = useState<number>(Math.max(1, savedConfig?.groupCount ?? 2))
  const [view, setView] = useState<'tree' | 'matrix'>(savedConfig?.view ?? 'tree')

  const [pair, setPair] = useState<[string, string] | null>(null)
  const [pendingLeaf, setPendingLeaf] = useState<string | null>(null)
  const [exportError, setExportError] = useState<'csv' | 'svg' | null>(null)

  const [analysisGuid] = useState(savedConfig?.guid ?? generateGuid())
  const [analysisName, setAnalysisName] = useState(savedConfig?.name ?? '')
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const isExisting = !!savedConfig?.guid

  const currentConfig = useMemo(
    () => ({
      docFilter: filter,
      target,
      unit,
      measure,
      linkage,
      selectedCodes,
      includeSubcodes,
      expandSurveyRespondents,
      minReferences,
      groupCount,
      view
    }),
    [
      filter,
      target,
      unit,
      measure,
      linkage,
      selectedCodes,
      includeSubcodes,
      expandSurveyRespondents,
      minReferences,
      groupCount,
      view
    ]
  )

  const initialBaseline = useMemo(
    () => ({
      docFilter: documentFilterFromConfig(savedConfig),
      target: (savedConfig?.target ?? 'documents') as ClusterTarget,
      unit: (savedConfig?.unit ?? 'document') as ComparisonUnit,
      measure: (savedConfig?.measure ?? 'cosine') as SimilarityMeasure,
      linkage: (savedConfig?.linkage ?? 'average') as ClusterLinkage,
      selectedCodes: savedConfig?.selectedCodes ?? [],
      includeSubcodes: savedConfig?.includeSubcodes ?? true,
      expandSurveyRespondents: savedConfig?.expandSurveyRespondents ?? true,
      minReferences: Math.max(1, savedConfig?.minReferences ?? 1),
      groupCount: Math.max(1, savedConfig?.groupCount ?? 2),
      view: (savedConfig?.view ?? 'tree') as 'tree' | 'matrix'
    }),
    []
  )

  const { dirty, baseline, setBaseline } = useToolDirtyState(
    currentConfig,
    initialBaseline,
    inTab
  )

  // Keep ad-hoc tab configuration up to date so unsaved open tabs restore across project reloads.
  useEffect(() => {
    if (!isExisting && inTab?.tabId) {
      useAnalysisTabsStore.getState().setConfig(inTab.tabId, currentConfig)
    }
  }, [currentConfig, isExisting, inTab?.tabId])

  const handleDiscard = useCallback(() => {
    setFilter(baseline.docFilter)
    setTarget(baseline.target)
    setUnit(baseline.unit)
    setMeasure(baseline.measure)
    setLinkage(baseline.linkage)
    setSelectedCodes(baseline.selectedCodes)
    setIncludeSubcodes(baseline.includeSubcodes)
    setExpandSurveyRespondents(baseline.expandSurveyRespondents)
    setMinReferences(baseline.minReferences)
    setGroupCount(baseline.groupCount)
    setView(baseline.view)
    setPair(null)
    setPendingLeaf(null)
  }, [baseline])

  const handleRename = useCallback(
    (newName: string) => {
      setAnalysisName(newName)
      renameSavedAnalysis(analysisGuid, newName)
      if (inTab) inTab.onSaved('', newName)
    },
    [analysisGuid, inTab]
  )

  const handleSave = useCallback(
    (name: string) => {
      setAnalysisName(name)
      setShowSaveDialog(false)
      window.api.sendAnalysisAction('save-analysis', {
        guid: analysisGuid,
        toolType: 'coding-clusters',
        name,
        config: currentConfig
      })
      setBaseline(currentConfig)
      if (inTab) inTab.onSaved(analysisGuid, name)
      else window.setTimeout(() => window.close(), 200)
    },
    [analysisGuid, currentConfig, inTab, setBaseline]
  )

  useRegisterToolSave(inTab?.tabId, () => {
    if (isExisting) {
      handleSave(analysisName)
      return true
    }
    setShowSaveDialog(true)
    return false
  })

  const data = useMemo(() => ({ ...snapshot, ...live }), [snapshot, live])
  const scoped = useMemo(() => applySurveyCellScope(data, filter), [data, filter])
  const sources = useMemo(() => {
    const included = new Set(
      resolveFilteredSources(
        data,
        filter.sourceGuids,
        filter.tagGuids,
        filter.tagExcludeGuids,
        filter.typeInclude,
        filter.typeExclude
      )
    )
    return data.sources.filter(({ guid }) => included.has(guid)).map(({ guid }) => guid)
  }, [data, filter])

  const hasSurveyInScope = useMemo(() => {
    const included = new Set(sources)
    return data.sources.some((s) => included.has(s.guid) && s.sourceType === 'survey')
  }, [data.sources, sources])

  const codes = useMemo(
    () => data.codes.filter(({ guid, isCodable }) => isCodable && selectedCodes.includes(guid)),
    [data.codes, selectedCodes]
  )

  const prepared = useMemo(
    () =>
      buildClusteringInput(scoped, {
        sourceGuids: sources,
        selectedCodeGuids: codes.map(({ guid }) => guid),
        target,
        unit: target === 'codes' ? unit : 'document',
        includeSubcodes,
        expandSurveyRespondents,
        measure,
        linkage,
        minReferences
      }),
    [
      scoped,
      sources,
      codes,
      target,
      unit,
      includeSubcodes,
      expandSurveyRespondents,
      measure,
      linkage,
      minReferences
    ]
  )

  const request = prepared.request
  const [response, setResponse] = useState<{ request: ClusterRequest; result?: ClusterResult }>()

  useEffect(() => {
    if (!request.codes.length) return
    let active = true
    const timer = window.setTimeout(async () => {
      try {
        const result =
          typeof window.api?.clusterCodingProfiles === 'function'
            ? await window.api.clusterCodingProfiles(request)
            : analyzeClusteringLocal(request)
        if (active) setResponse({ request, result })
      } catch {
        if (active) setResponse({ request })
      }
    }, 120)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [request])

  const current = response?.request === request ? response : undefined
  const result = current?.result
  const sourceNames = useMemo(
    () => new Map(data.sources.map(({ guid, name }) => [guid, name])),
    [data.sources]
  )
  const codeNames = useMemo(
    () => new Map(data.codes.map(({ guid, name }) => [guid, name])),
    [data.codes]
  )
  const resolveItemName = useCallback(
    (guid: string) =>
      prepared.itemLabels.get(guid) ??
      (target === 'codes' ? codeNames.get(guid) : sourceNames.get(guid)) ??
      guid,
    [prepared.itemLabels, target, codeNames, sourceNames]
  )

  const first = pair && result?.items.find(({ guid }) => guid === pair[0])
  const second = pair && result?.items.find(({ guid }) => guid === pair[1])
  const references = useMemo(
    () => (first && second ? sharedReferences(prepared, first, second) : null),
    [prepared, first, second]
  )

  const itemGuids = result?.items.map(({ guid }) => guid) ?? []
  const names = itemGuids.map(resolveItemName)
  const root = result && !result.limited ? result.root : undefined
  const order = root ? clusterLeaves(root) : []
  const count = Math.min(groupCount, Math.max(1, order.length))
  const groups = result && !result.limited ? result.groupsByCut[count - 1] ?? [] : []
  const number = useMemo(
    () => new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 3, maximumFractionDigits: 3 }),
    [i18n.language]
  )

  const measureLabel = {
    cosine: t('labiia.clustering.cosine'),
    jaccard: t('labiia.clustering.jaccard'),
    dice: t('labiia.clustering.dice')
  }[measure]
  const linkageLabel =
    linkage === 'average' ? t('labiia.clustering.average') : t('labiia.clustering.complete')
  const effectiveUnit = target === 'codes' ? unit : 'document'
  const unitLabel = {
    document: t('labiia.clustering.unitDocument'),
    paragraph: t('labiia.clustering.unitParagraph'),
    sentence: t('labiia.clustering.unitSentence'),
    overlap: t('labiia.clustering.unitOverlap')
  }[effectiveUnit]

  const hierarchyOverlapNames = useMemo(
    () =>
      prepared.hierarchyOverlaps
        .map(
          ({ ancestorGuid, descendantGuid }) =>
            `${codeNames.get(ancestorGuid) ?? ancestorGuid} → ${codeNames.get(descendantGuid) ?? descendantGuid}`
        )
        .join(', '),
    [prepared.hierarchyOverlaps, codeNames]
  )

  async function exportResults() {
    if (!result || result.limited || !root) return
    setExportError(null)
    const { similarities } = result
    const rows = [
      [t('labiia.clustering.method'), measureLabel],
      [t('labiia.clustering.linkage'), linkageLabel],
      [
        t('labiia.clustering.target'),
        target === 'codes' ? t('labiia.clustering.codes') : t('labiia.clustering.documents')
      ],
      [t('labiia.clustering.unit'), unitLabel],
      [
        t('labiia.clustering.includeSubcodes'),
        includeSubcodes ? t('labiia.clustering.yes') : t('labiia.clustering.no')
      ],
      [
        t('labiia.clustering.expandRespondents'),
        expandSurveyRespondents ? t('labiia.clustering.yes') : t('labiia.clustering.no')
      ],
      [t('labiia.clustering.minReferences'), String(minReferences)],
      [t('labiia.clustering.documents'), ...sources],
      [t('labiia.clustering.codes'), ...codes.map(({ guid }) => guid)],
      [t('labiia.clustering.excluded'), ...result.excluded.map(resolveItemName)],
      [t('labiia.clustering.documentFilter'), JSON.stringify(filter)],
      [],
      [
        t('labiia.clustering.name'),
        'GUID',
        t('labiia.clustering.group'),
        ...order.map((column) => names[column])
      ],
      ...order.map((row) => [
        names[row],
        result.items[row].guid,
        String(groups[row]),
        ...order.map((column) => String(similarities[row][column]))
      ])
    ]
    try {
      await window.api.exportCsv(toCsv(rows), 'agrupamento.csv')
    } catch {
      setExportError('csv')
    }
  }

  async function exportSvg() {
    if (!result || result.limited || !root) return
    setExportError(null)
    try {
      const svg = buildDendrogramSvg(root, order, names, groups)
      await window.api.exportSvg(svg, 'dendrograma.svg')
    } catch {
      setExportError('svg')
    }
  }

  const profileHelpText =
    target === 'documents'
      ? t('labiia.clustering.documentProfileHelp')
      : effectiveUnit === 'paragraph'
        ? t('labiia.clustering.unitParagraphHelp')
        : effectiveUnit === 'sentence'
          ? t('labiia.clustering.unitSentenceHelp')
          : effectiveUnit === 'overlap'
            ? t('labiia.clustering.unitOverlapHelp')
            : t('labiia.clustering.codeProfileHelp')

  return (
    <div className="labiia-clustering-shell">
      <div className="labiia-clustering-header">
        <h2>
          <Icon icon={faBarsStaggered} className="analysis-header-icon" style={{ fontSize: 16 }} />
          {t('labiia.clustering.label')}
          {isExisting ? ':' : ''}
          {isExisting && <EditableTitleSuffix name={analysisName} onRename={handleRename} />}
        </h2>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className="secondary"
          style={{ fontSize: 11, padding: '4px 14px' }}
          onClick={() => (inTab ? inTab.onClose() : window.close())}
        >
          {t('common.close')}
        </button>
        {isExisting && dirty && (
          <button
            type="button"
            className="secondary"
            style={{ fontSize: 11, padding: '4px 14px' }}
            onClick={handleDiscard}
          >
            {t('common.discardChanges')}
          </button>
        )}
        {isExisting ? (
          <button
            type="button"
            style={{ fontSize: 11, padding: '4px 14px' }}
            disabled={!dirty}
            onClick={() => handleSave(analysisName)}
          >
            {dirty ? t('analysis.update') : t('analysis.saved')}
          </button>
        ) : (
          <button
            type="button"
            style={{ fontSize: 11, padding: '4px 14px' }}
            onClick={() => setShowSaveDialog(true)}
          >
            {t('analysis.save')}
          </button>
        )}
        <div style={{ width: 36, flexShrink: 0 }} />
      </div>

      {showSaveDialog && (
        <div className="modal-overlay">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{t('analysis.save')}</h2>
            <input
              autoFocus
              type="text"
              defaultValue={analysisName}
              placeholder={t('analysis.namePlaceholder')}
              style={{ width: '100%' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSave((e.target as HTMLInputElement).value.trim() || t('common.untitled'))
                }
                if (e.key === 'Escape') setShowSaveDialog(false)
              }}
            />
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setShowSaveDialog(false)}>
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  const input = (
                    e.target as HTMLElement
                  ).parentElement!.parentElement!.querySelector('input') as HTMLInputElement
                  handleSave(input.value.trim() || t('common.untitled'))
                }}
              >
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="labiia-clustering">
        <DocumentsSection
          data={data}
          filter={filter}
          onChange={(next) => {
            setPair(null)
            setPendingLeaf(null)
            setFilter(next)
          }}
          filteredSourceGuids={sources}
        />
        <div className="analysis-section">
          <div className="labiia-cluster-controls">
            <ManualSelectButton
              data={data}
              kinds={['code']}
              label={t('labiia.clustering.chooseCodes')}
              onPicked={({ code }) =>
                setSelectedCodes((previous) =>
                  Array.from(new Set([...previous, ...(code ?? []).map(({ guid }) => guid)]))
                )
              }
            />
            {!!codes.length && (
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setPair(null)
                  setPendingLeaf(null)
                  setSelectedCodes([])
                }}
              >
                {t('labiia.clustering.clearCodes')}
              </button>
            )}
            <label>
              <input
                type="checkbox"
                checked={includeSubcodes}
                onChange={(e) => {
                  setPair(null)
                  setPendingLeaf(null)
                  setIncludeSubcodes(e.target.checked)
                }}
              />
              <span>{t('labiia.clustering.includeSubcodes')}</span>
            </label>
          </div>
          {!!codes.length && (
            <ul className="labiia-cluster-codes">
              {codes.map(({ guid, name }) => (
                <li key={guid}>
                  <button
                    type="button"
                    className="secondary"
                    title={t('labiia.clustering.removeCode', { name })}
                    aria-label={t('labiia.clustering.removeCode', { name })}
                    onClick={() => {
                      setPair(null)
                      setPendingLeaf(null)
                      setSelectedCodes((previous) => previous.filter((code) => code !== guid))
                    }}
                  >
                    {name} ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          {prepared.hierarchyOverlaps.length > 0 && (
            <p role="status" className="labiia-cluster-notice">
              {t('labiia.clustering.hierarchyOverlapWarning', { pairs: hierarchyOverlapNames })}
            </p>
          )}
          <div className="labiia-cluster-controls">
            <label>
              {t('labiia.clustering.target')}
              <select
                value={target}
                onChange={(event) => {
                  setPair(null)
                  setPendingLeaf(null)
                  setTarget(event.target.value as ClusterTarget)
                }}
              >
                <option value="documents">{t('labiia.clustering.documents')}</option>
                <option value="codes">{t('labiia.clustering.codes')}</option>
              </select>
            </label>
            {target === 'codes' && (
              <label>
                {t('labiia.clustering.unit')}
                <select
                  value={unit}
                  onChange={(event) => {
                    setPair(null)
                    setPendingLeaf(null)
                    setUnit(event.target.value as ComparisonUnit)
                  }}
                >
                  <option value="document">{t('labiia.clustering.unitDocument')}</option>
                  <option value="paragraph">{t('labiia.clustering.unitParagraph')}</option>
                  <option value="sentence">{t('labiia.clustering.unitSentence')}</option>
                  <option value="overlap">{t('labiia.clustering.unitOverlap')}</option>
                </select>
              </label>
            )}
            <label>
              {t('labiia.clustering.method')}
              <select
                value={measure}
                onChange={(event) => setMeasure(event.target.value as SimilarityMeasure)}
              >
                <option value="cosine">{t('labiia.clustering.cosine')}</option>
                <option value="jaccard">{t('labiia.clustering.jaccard')}</option>
                <option value="dice">{t('labiia.clustering.dice')}</option>
              </select>
            </label>
            <label>
              {t('labiia.clustering.linkage')}
              <select
                value={linkage}
                onChange={(event) =>
                  setLinkage(event.target.value === 'complete' ? 'complete' : 'average')
                }
              >
                <option value="average">{t('labiia.clustering.average')}</option>
                <option value="complete">{t('labiia.clustering.complete')}</option>
              </select>
            </label>
            <label>
              {t('labiia.clustering.minReferences')}
              <input
                type="number"
                min={1}
                value={minReferences}
                onChange={(event) => {
                  const value = event.target.valueAsNumber
                  if (Number.isInteger(value)) {
                    setPair(null)
                    setPendingLeaf(null)
                    setMinReferences(Math.max(1, value))
                  }
                }}
              />
            </label>
            {hasSurveyInScope && effectiveUnit === 'document' && (
              <label>
                <input
                  type="checkbox"
                  checked={expandSurveyRespondents}
                  onChange={(e) => {
                    setPair(null)
                    setPendingLeaf(null)
                    setExpandSurveyRespondents(e.target.checked)
                  }}
                />
                <span>{t('labiia.clustering.expandRespondents')}</span>
              </label>
            )}
          </div>
          <p>
            {profileHelpText}
            {includeSubcodes ? ` ${t('labiia.clustering.subcodeProfileHelp')}` : ''}
          </p>
          <p>
            {measure === 'cosine'
              ? t('labiia.clustering.cosineHelp')
              : t('labiia.clustering.binaryHelp')}{' '}
            {linkage === 'average'
              ? t('labiia.clustering.linkageHelp')
              : t('labiia.clustering.completeHelp')}
          </p>
          {prepared.skippedNonTextSelections > 0 && (
            <p role="status" className="labiia-cluster-notice">
              {t('labiia.clustering.skippedNonText', { count: prepared.skippedNonTextSelections })}
            </p>
          )}
        </div>

        {!!result?.excluded.length && (
          <details>
            <summary>
              {minReferences > 1
                ? t('labiia.clustering.excludedMinCount', {
                    count: result.excluded.length,
                    min: minReferences
                  })
                : t('labiia.clustering.excludedCount', { count: result.excluded.length })}
            </summary>
            <ul>
              {result.excluded.map((guid) => (
                <li key={guid}>{resolveItemName(guid)}</li>
              ))}
            </ul>
          </details>
        )}

        {!codes.length ? (
          <p>{t('labiia.clustering.choosePrompt')}</p>
        ) : !result ? (
          current ? (
            <p role="alert">{t('labiia.clustering.calculationError')}</p>
          ) : (
            <p role="status">{t('labiia.clustering.calculating')}</p>
          )
        ) : result.limited ? (
          <p>{t('labiia.clustering.limit', { limit: result.limit })}</p>
        ) : !root || order.length < 2 ? (
          <p>{t('labiia.clustering.tooFew')}</p>
        ) : (
          <div className="analysis-section">
            <div className="labiia-cluster-controls">
              <label>
                {t('labiia.clustering.groups')}
                <input
                  type="number"
                  min={1}
                  max={order.length}
                  value={count}
                  onChange={(event) => {
                    const value = event.target.valueAsNumber
                    if (Number.isInteger(value)) {
                      setGroupCount(Math.max(1, Math.min(order.length, value)))
                    }
                  }}
                />
              </label>
              <label>
                {t('labiia.clustering.view')}
                <select
                  value={view}
                  onChange={(event) => setView(event.target.value === 'matrix' ? 'matrix' : 'tree')}
                >
                  <option value="tree">{t('labiia.clustering.tree')}</option>
                  <option value="matrix">{t('labiia.clustering.matrix')}</option>
                </select>
              </label>
              {view === 'tree' && (
                <button type="button" className="secondary" onClick={() => void exportSvg()}>
                  {t('labiia.clustering.exportSvg')}
                </button>
              )}
              <button type="button" className="secondary" onClick={() => void exportResults()}>
                {t('labiia.clustering.export')}
              </button>
            </div>
            {exportError === 'csv' && <p role="alert">{t('labiia.clustering.exportError')}</p>}
            {exportError === 'svg' && <p role="alert">{t('labiia.clustering.exportSvgError')}</p>}
            <div className="labiia-cluster-results">
              {view === 'tree' ? (
                <>
                  <p>{t('labiia.clustering.treeHelp')}</p>
                  {pendingLeaf && (
                    <p role="status" className="labiia-cluster-notice">
                      {t('labiia.clustering.selectedFirstHint', {
                        name: resolveItemName(pendingLeaf)
                      })}
                    </p>
                  )}
                  <Dendrogram
                    root={root}
                    order={order}
                    names={names}
                    itemGuids={itemGuids}
                    groups={groups}
                    label={t('labiia.clustering.tree')}
                    pendingGuid={pendingLeaf}
                    activePair={pair}
                    formatScore={(v) => number.format(v)}
                    onSelectBranch={(node) => {
                      const chosen = dendrogramPairForNode(node, result.items, result.similarities)
                      setPendingLeaf(null)
                      if (chosen) setPair(chosen)
                    }}
                    onSelectLeaf={(guid) => {
                      if (!pendingLeaf) {
                        setPendingLeaf(guid)
                        setPair(null)
                      } else {
                        setPair([pendingLeaf, guid])
                        setPendingLeaf(null)
                      }
                    }}
                  />
                </>
              ) : (
                <>
                  <p>{t('labiia.clustering.matrixHelp')}</p>
                  <table
                    className="labiia-cluster-matrix"
                    aria-label={t('labiia.clustering.matrix')}
                  >
                    <thead>
                      <tr>
                        <th scope="col">{t('labiia.clustering.name')}</th>
                        {order.map((column) => (
                          <th key={column} scope="col" title={names[column]}>
                            {names[column]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {order.map((row) => (
                        <tr key={row}>
                          <th scope="row" title={names[row]}>
                            {names[row]}
                          </th>
                          {order.map((column) => {
                            const score = result.similarities[row][column]
                            return (
                              <td
                                key={column}
                                style={{ background: `rgba(89, 108, 212, ${score * 0.3})` }}
                              >
                                <button
                                  type="button"
                                  aria-label={t('labiia.clustering.inspectCell', {
                                    first: names[row],
                                    second: names[column],
                                    score: number.format(score)
                                  })}
                                  onClick={() => {
                                    setPendingLeaf(null)
                                    setPair([result.items[row].guid, result.items[column].guid])
                                  }}
                                >
                                  {number.format(score)}
                                </button>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
            {first && second && references && (
              <ClusterReferences
                key={JSON.stringify(pair)}
                first={resolveItemName(first.guid)}
                second={resolveItemName(second.guid)}
                references={references}
                sourceNames={sourceNames}
                codeNames={codeNames}
                onClose={() => {
                  setPair(null)
                  setPendingLeaf(null)
                }}
              />
            )}
          </div>
        )}
      </section>
    </div>
  )
}
