import {
  applySurveyCellScope,
  resolveFilteredSources
} from '../../components/Analysis/analysis-helpers'
import { documentFilterFromConfig } from '../../components/Analysis/documents-filter'
import { formatNumber, t } from '../../i18n'
import { buildAnalysisInitData } from '../../utils/build-analysis-init-data'
import { buildClusteringInput, type ComparisonUnit } from '../coding-units/units'
import {
  analyzeClusteringLocal,
  buildDendrogramSvg,
  clusterLeaves,
  type ClusterLinkage,
  type ClusterTarget,
  type SimilarityMeasure
} from './model'
import type { SavedClusteringConfig } from './ClusteringTab'

function escHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Regenerate a saved coding-clusters analysis as HTML for PDF Reports,
 *  recording the active methodological parameters alongside the clusters. */
export function codingClustersReportHtml(config?: SavedClusteringConfig): string {
  const selectedCodes = config?.selectedCodes ?? []
  if (selectedCodes.length === 0) {
    return `<div class="empty">${escHtml(t('reports.noCodes'))}</div>`
  }

  const docFilter = documentFilterFromConfig(config)
  const rawData = buildAnalysisInitData('coding-clusters')
  const scoped = applySurveyCellScope(rawData, docFilter)
  const included = new Set(
    resolveFilteredSources(
      rawData,
      docFilter.sourceGuids ?? [],
      docFilter.tagGuids ?? [],
      docFilter.tagExcludeGuids ?? [],
      docFilter.typeInclude ?? [],
      docFilter.typeExclude ?? []
    )
  )
  const sources = rawData.sources.filter((s) => included.has(s.guid)).map((s) => s.guid)
  const validCodes = rawData.codes
    .filter((c) => c.isCodable && selectedCodes.includes(c.guid))
    .map((c) => c.guid)

  const target: ClusterTarget = config?.target ?? 'documents'
  const unit: ComparisonUnit = target === 'codes' ? (config?.unit ?? 'document') : 'document'
  const measure: SimilarityMeasure = config?.measure ?? 'cosine'
  const linkage: ClusterLinkage = config?.linkage ?? 'average'
  const includeSubcodes = config?.includeSubcodes ?? true
  const expandSurveyRespondents = config?.expandSurveyRespondents ?? true
  const minReferences = Math.max(1, config?.minReferences ?? 1)

  const prepared = buildClusteringInput(scoped, {
    sourceGuids: sources,
    selectedCodeGuids: validCodes,
    target,
    unit,
    includeSubcodes,
    expandSurveyRespondents,
    measure,
    linkage,
    minReferences
  })
  const result = analyzeClusteringLocal(prepared.request)
  if (result.limited) {
    return `<div class="empty">${escHtml(t('labiia.clustering.limit', { limit: result.limit }))}</div>`
  }
  if (!result.root || result.items.length < 2) {
    return `<div class="empty">${escHtml(t('labiia.clustering.tooFew'))}</div>`
  }

  const sourceNames = new Map(rawData.sources.map((s) => [s.guid, s.name]))
  const codeNames = new Map(rawData.codes.map((c) => [c.guid, c.name]))
  const resolveName = (guid: string): string =>
    prepared.itemLabels.get(guid) ??
    (target === 'codes' ? codeNames.get(guid) : sourceNames.get(guid)) ??
    guid

  const names = result.items.map((i) => resolveName(i.guid))
  const order = clusterLeaves(result.root)
  const groupCount = Math.max(1, Math.min(order.length, config?.groupCount ?? 2))
  const groups = result.groupsByCut[groupCount - 1] ?? []

  const measureLabel = {
    cosine: t('labiia.clustering.cosine'),
    jaccard: t('labiia.clustering.jaccard'),
    dice: t('labiia.clustering.dice')
  }[measure]
  const linkageLabel =
    linkage === 'average' ? t('labiia.clustering.average') : t('labiia.clustering.complete')
  const unitLabel = {
    document: t('labiia.clustering.unitDocument'),
    paragraph: t('labiia.clustering.unitParagraph'),
    sentence: t('labiia.clustering.unitSentence'),
    overlap: t('labiia.clustering.unitOverlap')
  }[unit]

  const meta = [
    `${t('labiia.clustering.target')}: ${target === 'codes' ? t('labiia.clustering.codes') : t('labiia.clustering.documents')}`,
    `${t('labiia.clustering.unit')}: ${unitLabel}`,
    `${t('labiia.clustering.method')}: ${measureLabel}`,
    `${t('labiia.clustering.linkage')}: ${linkageLabel}`,
    `${t('labiia.clustering.includeSubcodes')}: ${includeSubcodes ? t('labiia.clustering.yes') : t('labiia.clustering.no')}`,
    `${t('labiia.clustering.minReferences')}: ${formatNumber(minReferences)}`
  ]
    .map(escHtml)
    .join(' · ')

  const svgBlock =
    config?.view !== 'matrix'
      ? `<div class="report-map">${buildDendrogramSvg(result.root, order, names, groups)}</div>`
      : ''

  const headCols = [
    `<th>${escHtml(t('labiia.clustering.name'))}</th>`,
    `<th>${escHtml(t('labiia.clustering.group'))}</th>`,
    ...order.map((col) => `<th class="num">${escHtml(names[col])}</th>`)
  ].join('')
  const bodyRows = order
    .map((row) => {
      const cells = order
        .map((col) => `<td class="num">${escHtml(result.similarities[row][col].toFixed(3))}</td>`)
        .join('')
      return `<tr><td class="rowname">${escHtml(names[row])}</td><td class="num">${escHtml(String(groups[row]))}</td>${cells}</tr>`
    })
    .join('')

  return `<p style="font-size:11px;color:#475569;margin:4px 0 8px">${meta}</p>${svgBlock}<table><thead><tr>${headCols}</tr></thead><tbody>${bodyRows}</tbody></table>`
}
