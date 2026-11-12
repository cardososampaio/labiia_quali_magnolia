/**
 * "Style and network" panel of the text network, after Gephi Lite's panels:
 * Appearance (colours, link colours, background, word sizes, labels), Filters
 * (metric range, a word's neighbourhood, k-core, largest component), Layout
 * (ForceAtlas2 settings) and Communities (recompute at another resolution,
 * rename, recolour, merge). Every change shows at once.
 */
import { useState } from 'react'
import { t, formatNumber } from '../../../i18n'
import { PALETTES, communityColour, defaultStyle, type FilterMetric, type NetworkStyle, type PaletteId, type SizeMetric } from './network-style'

type Tab = 'appearance' | 'filters' | 'layout' | 'communities'

export interface CommunitySummary { id: number; words: string[] }

interface Props {
  style: NetworkStyle
  onStyle: (next: NetworkStyle) => void
  communities: CommunitySummary[]
  modularity: number
  words: string[]
  metricRange: (key: FilterMetric) => [number, number]
  visibleCount: number
  totalCount: number
  /** Largest k whose core is not empty. */
  maxCore: number
}

const SIZE_METRICS: SizeMetric[] = ['strength', 'frequency', 'degree', 'betweenness', 'eigenvector']
const FILTER_METRICS: FilterMetric[] = ['strength', 'frequency', 'degree', 'betweenness', 'closeness', 'eigenvector']

export function metricLabel(key: FilterMetric): string {
  if (key === 'frequency') return t('labiia.lexical.frequency')
  return t(`labiia.lexical.network.${key}`)
}

function Range({ label, value, min, max, step, onChange, format }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  return (
    <label className="lex-network-field">
      <span>{label} <b>{format ? format(value) : formatNumber(value)}</b></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="lex-network-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

export function StylePanel({ style, onStyle, communities, modularity, words, metricRange, visibleCount, totalCount, maxCore }: Props) {
  const [tab, setTab] = useState<Tab>('appearance')
  const set = (patch: Partial<NetworkStyle>): void => onStyle({ ...style, ...patch })
  const setFilters = (patch: Partial<NetworkStyle['filters']>): void => set({ filters: { ...style.filters, ...patch } })
  const setLayout = (patch: Partial<NetworkStyle['layout']>): void => set({ layout: { ...style.layout, ...patch } })
  const [pendingResolution, setPendingResolution] = useState(style.resolution ?? 1)
  const edited = style.resolution !== null || Object.keys(style.merged).length > 0 || Object.keys(style.moved).length > 0

  return (
    <aside className="lex-network-panel lex-network-style">
      <div className="lex-network-tabs" role="tablist">
        {(['appearance', 'filters', 'layout', 'communities'] as Tab[]).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t(`labiia.lexical.network.style.tab.${k}`)}</button>
        ))}
      </div>

      {tab === 'appearance' && (
        <div className="lex-network-section">
          <div className="lex-advanced-title">{t('labiia.lexical.network.style.colours')}</div>
          <label className="lex-network-field">
            <span>{t('labiia.lexical.network.style.palette')}</span>
            <select value={style.palette} onChange={(e) => set({ palette: e.target.value as PaletteId, communityColors: {} })}>
              {(Object.keys(PALETTES) as PaletteId[]).map((p) => <option key={p} value={p}>{t(`labiia.lexical.network.style.palettes.${p}`)}</option>)}
            </select>
          </label>
          <div className="lex-network-swatches">
            {communities.map((c) => (
              <label key={c.id} className="lex-network-swatch" title={style.communityNames[c.id] || c.words.slice(0, 5).join(', ')}>
                <input type="color" value={communityColour(style, c.id)} onChange={(e) => set({ communityColors: { ...style.communityColors, [c.id]: e.target.value.toUpperCase() } })} />
                <span>{style.communityNames[c.id] || t('labiia.lexical.network.community', { n: c.id + 1 })}</span>
              </label>
            ))}
          </div>
          <label className="lex-network-field">
            <span>{t('labiia.lexical.network.style.edgeColour')}</span>
            <select value={style.edgeColor} onChange={(e) => set({ edgeColor: e.target.value as NetworkStyle['edgeColor'] })}>
              <option value="source">{t('labiia.lexical.network.style.edgeSource')}</option>
              <option value="mix">{t('labiia.lexical.network.style.edgeMix')}</option>
              <option value="gray">{t('labiia.lexical.network.style.edgeGray')}</option>
            </select>
          </label>
          <Range label={t('labiia.lexical.network.style.edgeWidth')} value={style.edgeWidth} min={0.2} max={3} step={0.1} onChange={(v) => set({ edgeWidth: v })} format={(v) => `${formatNumber(v)}×`} />
          <Range label={t('labiia.lexical.network.style.edgeOpacity')} value={style.edgeOpacity} min={0.1} max={2} step={0.1} onChange={(v) => set({ edgeOpacity: v })} format={(v) => `${formatNumber(v)}×`} />
          <label className="lex-network-field">
            <span>{t('labiia.lexical.network.style.background')}</span>
            <select value={style.background} onChange={(e) => set({ background: e.target.value as NetworkStyle['background'] })}>
              <option value="light">{t('labiia.lexical.network.style.light')}</option>
              <option value="dark">{t('labiia.lexical.network.style.dark')}</option>
            </select>
          </label>

          <div className="lex-advanced-title">{t('labiia.lexical.network.style.words')}</div>
          <label className="lex-network-field">
            <span>{t('labiia.lexical.network.style.sizeBy')}</span>
            <select value={style.sizeBy} onChange={(e) => set({ sizeBy: e.target.value as SizeMetric })}>
              {SIZE_METRICS.map((m) => <option key={m} value={m}>{metricLabel(m)}</option>)}
            </select>
          </label>
          <Range label={t('labiia.lexical.network.style.labelMin')} value={style.labelMin} min={2} max={20} step={0.5} onChange={(v) => set({ labelMin: Math.min(v, style.labelMax) })} />
          <Range label={t('labiia.lexical.network.style.labelMax')} value={style.labelMax} min={8} max={60} step={0.5} onChange={(v) => set({ labelMax: Math.max(v, style.labelMin) })} />
          <label className="lex-network-field">
            <span>{t('labiia.lexical.network.style.labelColour')}</span>
            <select value={style.labelColor} onChange={(e) => set({ labelColor: e.target.value as NetworkStyle['labelColor'] })}>
              <option value="dark">{t('labiia.lexical.network.style.labelPlain')}</option>
              <option value="community">{t('labiia.lexical.network.style.labelCommunity')}</option>
            </select>
          </label>
          <Range
            label={t('labiia.lexical.network.style.labelCount')} value={style.labelCount} min={0} max={totalCount} step={10}
            onChange={(v) => set({ labelCount: v })} format={(v) => (v === 0 ? t('labiia.lexical.network.style.all') : formatNumber(v))}
          />
          <Range
            label={t('labiia.lexical.network.style.cropAt')} value={style.cropAt} min={0} max={30} step={1}
            onChange={(v) => set({ cropAt: v })} format={(v) => (v === 0 ? t('labiia.lexical.network.style.noCrop') : formatNumber(v))}
          />
        </div>
      )}

      {tab === 'filters' && (
        <div className="lex-network-section">
          <div className="lex-muted">{t('labiia.lexical.network.style.showing', { n: visibleCount, total: totalCount })}</div>
          <Check
            label={t('labiia.lexical.network.style.metricFilter')} checked={style.filters.metric !== null}
            onChange={(on) => { const [lo, hi] = metricRange('strength'); setFilters({ metric: on ? { key: 'strength', min: lo, max: hi } : null }) }}
          />
          {style.filters.metric && (() => {
            const m = style.filters.metric
            const [lo, hi] = metricRange(m.key)
            const step = hi - lo > 50 ? 1 : (hi - lo) / 100 || 0.01
            return (
              <>
                <label className="lex-network-field">
                  <span>{t('labiia.lexical.network.style.metric')}</span>
                  <select value={m.key} onChange={(e) => { const key = e.target.value as FilterMetric; const [a, b] = metricRange(key); setFilters({ metric: { key, min: a, max: b } }) }}>
                    {FILTER_METRICS.map((k) => <option key={k} value={k}>{metricLabel(k)}</option>)}
                  </select>
                </label>
                <Range label={t('labiia.lexical.network.style.from')} value={m.min} min={lo} max={hi} step={step} onChange={(v) => setFilters({ metric: { ...m, min: Math.min(v, m.max) } })} />
                <Range label={t('labiia.lexical.network.style.to')} value={m.max} min={lo} max={hi} step={step} onChange={(v) => setFilters({ metric: { ...m, max: Math.max(v, m.min) } })} />
              </>
            )
          })()}
          <Check label={t('labiia.lexical.network.style.egoFilter')} checked={style.filters.ego !== null} onChange={(on) => setFilters({ ego: on ? { word: words[0] ?? '', depth: 1 } : null })} />
          {style.filters.ego && (
            <>
              <label className="lex-network-field">
                <span>{t('labiia.lexical.network.style.egoWord')}</span>
                <input list="lex-network-words" value={style.filters.ego.word} onChange={(e) => setFilters({ ego: { ...style.filters.ego!, word: e.target.value } })} />
                <datalist id="lex-network-words">{words.map((w) => <option key={w} value={w} />)}</datalist>
              </label>
              <Range label={t('labiia.lexical.network.style.egoDepth')} value={style.filters.ego.depth} min={1} max={3} step={1} onChange={(v) => setFilters({ ego: { ...style.filters.ego!, depth: v } })} />
            </>
          )}
          <Range
            label={t('labiia.lexical.network.style.kcore')} value={Math.min(style.filters.kcore, maxCore)} min={0} max={maxCore} step={1}
            onChange={(v) => setFilters({ kcore: v })} format={(v) => (v === 0 ? t('labiia.lexical.network.style.off') : formatNumber(v))}
          />
          <div className="lex-muted lex-network-help">{t('labiia.lexical.network.style.kcoreHelp')}</div>
          <Check label={t('labiia.lexical.network.style.largest')} checked={style.filters.largestComponent} onChange={(v) => setFilters({ largestComponent: v })} />
          <button className="secondary lex-small-btn" onClick={() => setFilters(defaultStyle().filters)}>{t('labiia.lexical.network.style.clearFilters')}</button>
        </div>
      )}

      {tab === 'layout' && (
        <div className="lex-network-section">
          <div className="lex-muted lex-network-help">{t('labiia.lexical.network.style.layoutHelp')}</div>
          <Range label={t('labiia.lexical.network.gravity')} value={style.layout.gravity} min={0.1} max={10} step={0.1} onChange={(v) => setLayout({ gravity: v })} />
          <Range label={t('labiia.lexical.network.scaling')} value={style.layout.scaling} min={1} max={100} step={1} onChange={(v) => setLayout({ scaling: v })} />
          <Range label={t('labiia.lexical.network.style.slowDown')} value={style.layout.slowDown} min={1} max={20} step={1} onChange={(v) => setLayout({ slowDown: v })} />
          <Check label={t('labiia.lexical.network.style.strongGravity')} checked={style.layout.strongGravity} onChange={(v) => setLayout({ strongGravity: v })} />
          {/* i18n-ignore: the name of ForceAtlas2's LinLog mode */}
          <Check label="LinLog" checked={style.layout.linLog} onChange={(v) => setLayout({ linLog: v })} />
          <Check label={t('labiia.lexical.network.style.dissuadeHubs')} checked={style.layout.dissuadeHubs} onChange={(v) => setLayout({ dissuadeHubs: v })} />
          <Check label={t('labiia.lexical.network.style.adjustSizes')} checked={style.layout.adjustSizes} onChange={(v) => setLayout({ adjustSizes: v })} />
          <div className="lex-muted lex-network-help">{t('labiia.lexical.network.style.pinned', { count: style.pinned.length })}</div>
          {style.pinned.length > 0 && <button className="secondary lex-small-btn" onClick={() => set({ pinned: [] })}>{t('labiia.lexical.network.style.unpinAll')}</button>}
          <button className="secondary lex-small-btn" onClick={() => setLayout(defaultStyle().layout)}>{t('labiia.lexical.network.style.layoutDefaults')}</button>
        </div>
      )}

      {tab === 'communities' && (
        <div className="lex-network-section">
          <div className="lex-muted">{t('labiia.lexical.network.style.modularity', { value: modularity.toFixed(3), count: communities.length })}</div>
          <Range label={t('labiia.lexical.network.resolution')} value={pendingResolution} min={0.1} max={3} step={0.1} onChange={setPendingResolution} />
          <div className="lex-network-row">
            <button className="secondary lex-small-btn" onClick={() => set({ resolution: pendingResolution, merged: {}, moved: {}, communityNames: {}, communityColors: {} })}>{t('labiia.lexical.network.style.recompute')}</button>
            {edited && <button className="secondary lex-small-btn" onClick={() => { setPendingResolution(1); set({ resolution: null, merged: {}, moved: {}, communityNames: {}, communityColors: {} }) }}>{t('labiia.lexical.network.style.backToAnalysis')}</button>}
          </div>
          {edited && <div className="lex-note lex-network-help">{t('labiia.lexical.network.style.editedNote')}</div>}
          {communities.map((c) => (
            <div key={c.id} className="lex-network-community">
              <div className="lex-network-row">
                <span className="lex-network-dot" style={{ background: communityColour(style, c.id) }} />
                <input
                  className="lex-network-name"
                  value={style.communityNames[c.id] ?? ''}
                  placeholder={t('labiia.lexical.network.community', { n: c.id + 1 })}
                  onChange={(e) => {
                    const names = { ...style.communityNames }
                    if (e.target.value) names[c.id] = e.target.value
                    else delete names[c.id]
                    set({ communityNames: names })
                  }}
                />
                <span className="lex-muted">{c.words.length}</span>
              </div>
              <div className="lex-muted lex-network-words">{c.words.slice(0, 8).join(', ')}</div>
              {communities.length > 1 && (
                <select
                  value=""
                  onChange={(e) => { if (e.target.value !== '') set({ merged: { ...style.merged, [c.id]: Number(e.target.value) } }) }}
                >
                  <option value="">{t('labiia.lexical.network.style.mergeInto')}</option>
                  {communities.filter((o) => o.id !== c.id).map((o) => <option key={o.id} value={o.id}>{style.communityNames[o.id] || t('labiia.lexical.network.community', { n: o.id + 1 })}</option>)}
                </select>
              )}
            </div>
          ))}
        </div>
      )}

      <button className="secondary lex-small-btn lex-network-reset" onClick={() => onStyle(defaultStyle())}>{t('labiia.lexical.network.style.reset')}</button>
    </aside>
  )
}
