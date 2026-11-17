import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AnalysisInitData } from '../../models/types'
import { DocumentsSection } from '../../components/Analysis/DocumentsSection'
import { applySurveyCellScope, resolveFilteredSources, toCsv } from '../../components/Analysis/analysis-helpers'
import { useLiveAnalysisData } from '../../components/Analysis/use-live-analysis-data'
import { emptyDocumentFilter } from '../../components/DocumentSelector/DocumentSelector'
import { ManualSelectButton } from '../../components/ItemPicker/ManualSelectButton'
import { clusterLeaves, sharedReferences, type ClusterLinkage, type ClusterNode, type ClusterRequest, type ClusterResult, type ClusterTarget, type SimilarityMeasure } from './model'
import { ClusterReferences } from './ClusterReferences'
import './clustering.css'

const ROW_HEIGHT = 24
const TREE_WIDTH = 220

function Dendrogram({ root, order, names, groups, label }: {
  root: ClusterNode
  order: number[]
  names: string[]
  groups: number[]
  label: string
}) {
  const row = new Map(order.map((leaf, index) => [leaf, (index + 0.5) * ROW_HEIGHT]))
  const branches: React.ReactNode[] = []
  function position(node: ClusterNode): [number, number] {
    const x = 8 + (1 - node.height) * (TREE_WIDTH - 16)
    if (!node.left || !node.right) return [x, row.get(node.id)!]
    const [lx, ly] = position(node.left)
    const [rx, ry] = position(node.right)
    branches.push(<path key={node.id} d={`M ${lx} ${ly} H ${x} V ${ry} H ${rx}`} />)
    return [x, (ly + ry) / 2]
  }
  position(root)
  return (
    <div className="labiia-cluster-tree">
      <svg role="img" aria-label={label} width={TREE_WIDTH} height={order.length * ROW_HEIGHT}>
        <g fill="none" stroke="currentColor">{branches}</g>
      </svg>
      <ol>
        {order.map((leaf) => <li key={leaf} title={names[leaf]}>{groups[leaf]} · {names[leaf]}</li>)}
      </ol>
    </div>
  )
}

export function ClusteringTab({ data: snapshot }: { data: AnalysisInitData }) {
  const { t, i18n } = useTranslation()
  const live = useLiveAnalysisData()
  const [filter, setFilter] = useState(emptyDocumentFilter)
  const [target, setTarget] = useState<ClusterTarget>('documents')
  const [measure, setMeasure] = useState<SimilarityMeasure>('cosine')
  const [linkage, setLinkage] = useState<ClusterLinkage>('average')
  const [selectedCodes, setSelectedCodes] = useState<string[]>([])
  const [groupCount, setGroupCount] = useState(2)
  const [view, setView] = useState<'tree' | 'matrix'>('tree')
  const [pair, setPair] = useState<[string, string] | null>(null)
  const [exportError, setExportError] = useState(false)
  const data = useMemo(() => ({ ...snapshot, ...live }), [snapshot, live])
  const scoped = useMemo(() => applySurveyCellScope(data, filter), [data, filter])
  const sources = useMemo(() => {
    const included = new Set(resolveFilteredSources(data, filter.sourceGuids, filter.tagGuids, filter.tagExcludeGuids, filter.typeInclude, filter.typeExclude))
    return data.sources.filter(({ guid }) => included.has(guid)).map(({ guid }) => guid)
  }, [data, filter])
  const codes = useMemo(() => data.codes.filter(({ guid, isCodable }) => isCodable && selectedCodes.includes(guid)), [data.codes, selectedCodes])
  const request = useMemo<ClusterRequest>(() => {
    const codeGuids = codes.map(({ guid }) => guid)
    const selected = new Set(codeGuids)
    return {
      target,
      measure,
      linkage,
      codes: codeGuids,
      documents: codeGuids.length ? sources.map((guid) => ({
        guid,
        selections: (scoped.sourceSelections[guid] ?? []).flatMap(({ codings }) => {
          const assigned = codings.flatMap(({ codeGuid }) => selected.has(codeGuid) ? [codeGuid] : [])
          return assigned.length ? [assigned] : []
        })
      })) : []
    }
  }, [sources, scoped.sourceSelections, codes, target, measure, linkage])
  const [response, setResponse] = useState<{ request: ClusterRequest; result?: ClusterResult }>()
  useEffect(() => {
    if (!request.codes.length) return
    let active = true
    const timer = window.setTimeout(async () => {
      try {
        const result = await window.api.clusterCodingProfiles(request)
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
  const sourceNames = useMemo(() => new Map(data.sources.map(({ guid, name }) => [guid, name])), [data.sources])
  const codeNames = useMemo(() => new Map(data.codes.map(({ guid, name }) => [guid, name])), [data.codes])
  const nameByGuid = target === 'codes' ? codeNames : sourceNames
  const first = pair && result?.items.find(({ guid }) => guid === pair[0])
  const second = pair && result?.items.find(({ guid }) => guid === pair[1])
  const references = useMemo(() => first && second
    ? sharedReferences(scoped.sourceSelections, target, first, second)
    : null, [scoped.sourceSelections, target, first, second])
  const names = result?.items.map(({ guid }) => nameByGuid.get(guid) ?? guid) ?? []
  const root = result && !result.limited ? result.root : undefined
  const order = root ? clusterLeaves(root) : []
  const count = Math.min(groupCount, order.length)
  const groups = result && !result.limited ? result.groupsByCut[count - 1] ?? [] : []
  const number = new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 3, maximumFractionDigits: 3 })
  const measureLabel = {
    cosine: t('labiia.clustering.cosine'),
    jaccard: t('labiia.clustering.jaccard'),
    dice: t('labiia.clustering.dice')
  }[measure]
  const linkageLabel = linkage === 'average' ? t('labiia.clustering.average') : t('labiia.clustering.complete')

  async function exportResults() {
    if (!result || result.limited || !root) return
    setExportError(false)
    const { similarities } = result
    const rows = [
      [t('labiia.clustering.method'), measureLabel],
      [t('labiia.clustering.linkage'), linkageLabel],
      [t('labiia.clustering.target'), target === 'codes' ? t('labiia.clustering.codes') : t('labiia.clustering.documents')],
      [t('labiia.clustering.documents'), ...sources],
      [t('labiia.clustering.codes'), ...codes.map(({ guid }) => guid)],
      [t('labiia.clustering.excluded'), ...result.excluded],
      [t('labiia.clustering.documentFilter'), JSON.stringify(filter)],
      [],
      [t('labiia.clustering.name'), 'GUID', t('labiia.clustering.group'), ...order.map((column) => names[column])],
      ...order.map((row) => [
        names[row], result.items[row].guid, String(groups[row]),
        ...order.map((column) => String(similarities[row][column]))
      ])
    ]
    try {
      await window.api.exportCsv(toCsv(rows), 'agrupamento.csv')
    } catch {
      setExportError(true)
    }
  }

  return (
    <section className="labiia-clustering">
      <DocumentsSection data={data} filter={filter} onChange={setFilter} filteredSourceGuids={sources} />
      <div className="analysis-section">
        <div className="labiia-cluster-controls">
          <ManualSelectButton
            data={data}
            kinds={['code']}
            label={t('labiia.clustering.chooseCodes')}
            onPicked={({ code }) => setSelectedCodes((previous) => Array.from(new Set([...previous, ...(code ?? []).map(({ guid }) => guid)])))}
          />
          {!!codes.length && <button type="button" className="secondary" onClick={() => setSelectedCodes([])}>{t('labiia.clustering.clearCodes')}</button>}
        </div>
        {!!codes.length && (
          <ul className="labiia-cluster-codes">
            {codes.map(({ guid, name }) => (
              <li key={guid}>
                <button type="button" className="secondary" title={t('labiia.clustering.removeCode', { name })} aria-label={t('labiia.clustering.removeCode', { name })} onClick={() => setSelectedCodes((previous) => previous.filter((code) => code !== guid))}>{name} ×</button>
              </li>
            ))}
          </ul>
        )}
        <div className="labiia-cluster-controls">
          <label>
            {t('labiia.clustering.target')}
            <select value={target} onChange={(event) => {
              setPair(null)
              setTarget(event.target.value as ClusterTarget)
            }}>
              <option value="documents">{t('labiia.clustering.documents')}</option>
              <option value="codes">{t('labiia.clustering.codes')}</option>
            </select>
          </label>
          <label>
            {t('labiia.clustering.method')}
            <select value={measure} onChange={(event) => setMeasure(event.target.value as SimilarityMeasure)}>
              <option value="cosine">{t('labiia.clustering.cosine')}</option>
              <option value="jaccard">{t('labiia.clustering.jaccard')}</option>
              <option value="dice">{t('labiia.clustering.dice')}</option>
            </select>
          </label>
          <label>
            {t('labiia.clustering.linkage')}
            <select value={linkage} onChange={(event) => setLinkage(event.target.value === 'complete' ? 'complete' : 'average')}>
              <option value="average">{t('labiia.clustering.average')}</option>
              <option value="complete">{t('labiia.clustering.complete')}</option>
            </select>
          </label>
        </div>
        <p>{target === 'codes' ? t('labiia.clustering.codeProfileHelp') : t('labiia.clustering.documentProfileHelp')}</p>
        <p>{measure === 'cosine' ? t('labiia.clustering.cosineHelp') : t('labiia.clustering.binaryHelp')} {linkage === 'average' ? t('labiia.clustering.linkageHelp') : t('labiia.clustering.completeHelp')}</p>
      </div>
      {!!result?.excluded.length && (
        <details>
          <summary>{t('labiia.clustering.excludedCount', { count: result.excluded.length })}</summary>
          <ul>{result.excluded.map((guid) => <li key={guid}>{nameByGuid.get(guid) ?? guid}</li>)}</ul>
        </details>
      )}
      {!codes.length
        ? <p>{t('labiia.clustering.choosePrompt')}</p>
        : !result
          ? (current
            ? <p role="alert">{t('labiia.clustering.calculationError')}</p>
            : <p role="status">{t('labiia.clustering.calculating')}</p>)
        : result.limited
          ? <p>{t('labiia.clustering.limit', { limit: result.limit })}</p>
          : !root || order.length < 2
            ? <p>{t('labiia.clustering.tooFew')}</p>
            : (
              <div className="analysis-section">
                <div className="labiia-cluster-controls">
                  <label>
                    {t('labiia.clustering.groups')}
                    <input type="number" min={1} max={order.length} value={count} onChange={(event) => {
                      const value = event.target.valueAsNumber
                      if (Number.isInteger(value)) setGroupCount(Math.max(1, Math.min(order.length, value)))
                    }} />
                  </label>
                  <label>
                    {t('labiia.clustering.view')}
                    <select value={view} onChange={(event) => setView(event.target.value === 'matrix' ? 'matrix' : 'tree')}>
                      <option value="tree">{t('labiia.clustering.tree')}</option>
                      <option value="matrix">{t('labiia.clustering.matrix')}</option>
                    </select>
                  </label>
                  <button type="button" className="secondary" onClick={() => void exportResults()}>{t('labiia.clustering.export')}</button>
                </div>
                {exportError && <p role="alert">{t('labiia.clustering.exportError')}</p>}
                <div className="labiia-cluster-results">
                  {view === 'tree' ? (
                    <>
                      <p>{t('labiia.clustering.treeHelp')}</p>
                      <Dendrogram root={root} order={order} names={names} groups={groups} label={t('labiia.clustering.tree')} />
                    </>
                  ) : (
                    <>
                    <p>{t('labiia.clustering.matrixHelp')}</p>
                    <table className="labiia-cluster-matrix" aria-label={t('labiia.clustering.matrix')}>
                      <thead><tr><th scope="col">{t('labiia.clustering.name')}</th>{order.map((column) => <th key={column} scope="col" title={names[column]}>{names[column]}</th>)}</tr></thead>
                      <tbody>
                        {order.map((row) => (
                          <tr key={row}>
                            <th scope="row" title={names[row]}>{names[row]}</th>
                            {order.map((column) => {
                              const score = result.similarities[row][column]
                              return (
                                <td key={column} style={{ background: `rgba(89, 108, 212, ${score * 0.3})` }}>
                                  <button
                                    type="button"
                                    aria-label={t('labiia.clustering.inspectCell', { first: names[row], second: names[column], score: number.format(score) })}
                                    onClick={() => setPair([result.items[row].guid, result.items[column].guid])}
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
                {view === 'matrix' && first && second && references && (
                  <ClusterReferences
                    key={JSON.stringify(pair)}
                    first={nameByGuid.get(first.guid) ?? first.guid}
                    second={nameByGuid.get(second.guid) ?? second.guid}
                    references={references}
                    sourceNames={sourceNames}
                    codeNames={codeNames}
                    onClose={() => setPair(null)}
                  />
                )}
              </div>
            )}
    </section>
  )
}
