/**
 * "Preparar corpus": the project's choices for joining what the dictionary
 * leaves apart, applied to every lexical analysis of the project.
 *
 * - Plurals the dictionary does not list, joined to their singular (found
 *   again on each run; the researcher can keep some apart).
 * - Spelling variants, grouped by one of OpenRefine's methods and accepted
 *   one group at a time.
 * - The researcher's own equivalences ("docente" → "professor").
 * - Expressions of two or three words that become one ("política_pública").
 *
 * Suggestions are found in Rust (crates/labiia-prep) in the texts the
 * current analysis has selected. Nothing changes until the researcher saves.
 */
import { useMemo, useRef, useState } from 'react'
import { t } from '../../i18n'
import type {
  CompoundSuggestion,
  CorpusPreparation,
  PluralSuggestion,
  VariantMethod,
  VariantSuggestion
} from '../../models/lexical-api'

interface Props {
  initial: CorpusPreparation
  language: string
  texts: string[]
  onCancel: () => void
  onSave: (p: CorpusPreparation) => void
}

type Section = 'plurals' | 'variants' | 'equivalences' | 'expressions'

const METHODS: VariantMethod[] = ['fingerprint', 'ngram2', 'ngram3', 'levenshtein1', 'levenshtein2']

/** Equivalences from a .txt or .csv file: one per line, "from;to", "from,to", "from<TAB>to" or "from = to". */
export function parseEquivalences(text: string): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const m = line.match(/^(.+?)\s*(?:=>|->|→|=|;|\t|,)\s*(.+)$/)
    if (m && m[1].trim() && m[2].trim()) out.push({ from: m[1].trim(), to: m[2].trim() })
  }
  return out
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

export function CorpusPreparationDialog({ initial, language, texts, onCancel, onSave }: Props) {
  const [prep, setPrep] = useState<CorpusPreparation>(() => structuredClone(initial))
  const [open, setOpen] = useState<Section | null>('plurals')
  const [busy, setBusy] = useState<Section | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [plurals, setPlurals] = useState<PluralSuggestion[] | null>(null)
  const [method, setMethod] = useState<VariantMethod>('fingerprint')
  const [variants, setVariants] = useState<VariantSuggestion[] | null>(null)
  const [compounds, setCompounds] = useState<CompoundSuggestion[] | null>(null)
  const [newFrom, setNewFrom] = useState('')
  const [newTo, setNewTo] = useState('')
  const [newExpression, setNewExpression] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const noTexts = texts.length === 0

  const update = (f: (p: CorpusPreparation) => void): void =>
    setPrep((p) => {
      const n = structuredClone(p)
      f(n)
      return n
    })

  const run = async <T,>(section: Section, job: () => Promise<T>, done: (v: T) => void): Promise<void> => {
    setBusy(section)
    setError(null)
    try {
      done(await job())
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(null)
    }
  }

  const excluded = useMemo(() => new Set(prep.plurals.excluded), [prep.plurals.excluded])
  const acceptedVariant = useMemo(() => new Set(prep.variants.groups.flatMap((g) => g.variants)), [prep.variants.groups])
  const chosenExpressions = useMemo(() => new Set(prep.expressions.items.map((e) => e.toLowerCase())), [prep.expressions.items])

  const head = (section: Section, title: string, count: string) => (
    <div className="lex-prep-head">
      <label className="lex-field-check" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={prep[section].enabled}
          onChange={(e) => update((p) => { p[section].enabled = e.target.checked })}
        />
        <span className="lex-prep-title">{title}</span>
      </label>
      {count && <span className="lex-muted">{count}</span>}
      <div style={{ flex: 1 }} />
      <button className="secondary lex-small-btn" onClick={() => setOpen(open === section ? null : section)}>
        {open === section ? t('labiia.lexical.prep.hide') : t('labiia.lexical.prep.show')}
      </button>
    </div>
  )

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal lex-prep" onClick={(e) => e.stopPropagation()}>
        <h2>{t('labiia.lexical.prep.title')}</h2>
        <p className="lex-muted">{t('labiia.lexical.prep.intro')}</p>
        <label className="lex-field-check lex-prep-master">
          <input type="checkbox" checked={prep.enabled} onChange={(e) => update((p) => { p.enabled = e.target.checked })} />
          <span>{t('labiia.lexical.prep.useInProject')}</span>
        </label>
        {noTexts && <div className="lex-note">{t('labiia.lexical.prep.noTexts')}</div>}
        {error && <div className="lex-note lex-r-bad">{error}</div>}

        <div className="lex-prep-body" style={prep.enabled ? undefined : { opacity: 0.6 }}>
          {/* Plurals */}
          <section className="lex-prep-section">
            {head('plurals', t('labiia.lexical.prep.plurals'), prep.plurals.excluded.length ? t('labiia.lexical.prep.keptApart', { count: prep.plurals.excluded.length }) : '')}
            {open === 'plurals' && (
              <div className="lex-prep-content">
                <p className="lex-muted">{t('labiia.lexical.prep.pluralsHelp')}</p>
                <button className="secondary lex-small-btn" disabled={noTexts || busy !== null} onClick={() => void run('plurals', () => window.api.lexical.prepSuggestPlurals(language, texts), setPlurals)}>
                  {busy === 'plurals' ? t('labiia.lexical.prep.searching') : t('labiia.lexical.prep.findPlurals')}
                </button>
                {plurals && (
                  plurals.length === 0 ? <p className="lex-muted">{t('labiia.lexical.prep.nonePlurals')}</p> : (
                    <div className="lex-prep-list">
                      {plurals.map((s) => (
                        <label key={s.plural} className="lex-field-check lex-prep-row">
                          <input
                            type="checkbox"
                            checked={!excluded.has(s.plural)}
                            onChange={(e) => update((p) => {
                              const set = new Set(p.plurals.excluded)
                              if (e.target.checked) set.delete(s.plural)
                              else set.add(s.plural)
                              p.plurals.excluded = [...set].sort()
                            })}
                          />
                          <span>{s.plural} → <b>{s.singular}</b></span>
                          <span className="lex-muted">{s.frequency}×</span>
                        </label>
                      ))}
                    </div>
                  )
                )}
              </div>
            )}
          </section>

          {/* Variants */}
          <section className="lex-prep-section">
            {head('variants', t('labiia.lexical.prep.variants'), prep.variants.groups.length ? t('labiia.lexical.prep.groupsAccepted', { count: prep.variants.groups.length }) : '')}
            {open === 'variants' && (
              <div className="lex-prep-content">
                <p className="lex-muted">{t('labiia.lexical.prep.variantsHelp')}</p>
                <div className="lex-prep-inline">
                  <select value={method} onChange={(e) => setMethod(e.target.value as VariantMethod)}>
                    {METHODS.map((m) => <option key={m} value={m}>{t(`labiia.lexical.prep.method.${m}`)}</option>)}
                  </select>
                  <button className="secondary lex-small-btn" disabled={noTexts || busy !== null} onClick={() => void run('variants', () => window.api.lexical.prepSuggestVariants(language, texts, method), setVariants)}>
                    {busy === 'variants' ? t('labiia.lexical.prep.searching') : t('labiia.lexical.prep.findVariants')}
                  </button>
                </div>
                {prep.variants.groups.length > 0 && (
                  <div className="lex-prep-list">
                    <div className="lex-prep-subtitle">{t('labiia.lexical.prep.accepted')}</div>
                    {prep.variants.groups.map((g, i) => (
                      <div key={`${g.canonical}-${i}`} className="lex-prep-row">
                        <span>{g.variants.filter((v) => v !== g.canonical).join(', ')} → <b>{g.canonical}</b></span>
                        <button className="lex-chip-x" title={t('labiia.lexical.remove')} onClick={() => update((p) => { p.variants.groups.splice(i, 1) })}>×</button>
                      </div>
                    ))}
                  </div>
                )}
                {variants && (
                  variants.length === 0 ? <p className="lex-muted">{t('labiia.lexical.prep.noneVariants')}</p> : (
                    <div className="lex-prep-list">
                      <div className="lex-prep-subtitle">{t('labiia.lexical.prep.found')}</div>
                      {variants.filter((g) => !g.variants.every((v) => acceptedVariant.has(v.word))).map((g) => (
                        <VariantRow key={g.variants.map((v) => v.word).join('|')} group={g} onAccept={(canonical, words) => update((p) => {
                          p.variants.groups.push({ canonical, variants: words })
                        })} />
                      ))}
                    </div>
                  )
                )}
              </div>
            )}
          </section>

          {/* Equivalences */}
          <section className="lex-prep-section">
            {head('equivalences', t('labiia.lexical.prep.equivalences'), prep.equivalences.pairs.length ? t('labiia.lexical.prep.pairs', { count: prep.equivalences.pairs.length }) : '')}
            {open === 'equivalences' && (
              <div className="lex-prep-content">
                <p className="lex-muted">{t('labiia.lexical.prep.equivalencesHelp')}</p>
                <div className="lex-prep-inline">
                  <input type="text" value={newFrom} placeholder={t('labiia.lexical.prep.replace')} onChange={(e) => setNewFrom(e.target.value)} />
                  <span>→</span>
                  <input type="text" value={newTo} placeholder={t('labiia.lexical.prep.with')} onChange={(e) => setNewTo(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget.nextElementSibling as HTMLButtonElement | null)?.click() }} />
                  <button className="secondary lex-small-btn" disabled={!newFrom.trim() || !newTo.trim()} onClick={() => {
                    // A word has one equivalence: adding it again replaces the earlier one.
                    update((p) => {
                      const from = newFrom.trim()
                      p.equivalences.pairs = [...p.equivalences.pairs.filter((x) => x.from.toLowerCase() !== from.toLowerCase()), { from, to: newTo.trim() }]
                    })
                    setNewFrom('')
                    setNewTo('')
                  }}>{t('labiia.lexical.prep.add')}</button>
                </div>
                <div className="lex-prep-inline">
                  <button className="secondary lex-small-btn" onClick={() => fileRef.current?.click()}>{t('labiia.lexical.prep.importList')}</button>
                  <button className="secondary lex-small-btn" disabled={prep.equivalences.pairs.length === 0} onClick={() => {
                    const body = prep.equivalences.pairs.map((x) => `${x.from};${x.to}`).join('\n') + '\n'
                    void window.api.lexical.saveFile({ name: 'equivalencias.csv', mime: 'text/csv', data: toBase64(body) })
                  }}>{t('labiia.lexical.prep.exportList')}</button>
                  <input ref={fileRef} type="file" accept=".txt,.csv,text/plain,text/csv" style={{ display: 'none' }} onChange={async (e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (!file) return
                    const pairs = parseEquivalences(await file.text())
                    update((p) => {
                      const seen = new Set(p.equivalences.pairs.map((x) => x.from.toLowerCase()))
                      for (const x of pairs) if (!seen.has(x.from.toLowerCase())) { p.equivalences.pairs.push(x); seen.add(x.from.toLowerCase()) }
                    })
                  }} />
                </div>
                {prep.equivalences.pairs.length > 0 && (
                  <div className="lex-prep-list">
                    {prep.equivalences.pairs.map((x, i) => (
                      <div key={`${x.from}-${i}`} className="lex-prep-row">
                        <span>{x.from} → <b>{x.to}</b></span>
                        <button className="lex-chip-x" title={t('labiia.lexical.remove')} onClick={() => update((p) => { p.equivalences.pairs.splice(i, 1) })}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Expressions */}
          <section className="lex-prep-section">
            {head('expressions', t('labiia.lexical.prep.expressions'), prep.expressions.items.length ? t('labiia.lexical.prep.chosenExpressions', { count: prep.expressions.items.length }) : '')}
            {open === 'expressions' && (
              <div className="lex-prep-content">
                <p className="lex-muted">{t('labiia.lexical.prep.expressionsHelp')}</p>
                <div className="lex-prep-inline">
                  <button className="secondary lex-small-btn" disabled={noTexts || busy !== null} onClick={() => void run('expressions', () => window.api.lexical.prepSuggestCompounds(language, texts, 3), setCompounds)}>
                    {busy === 'expressions' ? t('labiia.lexical.prep.searching') : t('labiia.lexical.prep.findExpressions')}
                  </button>
                  <input type="text" value={newExpression} placeholder={t('labiia.lexical.prep.expressionPlaceholder')} onChange={(e) => setNewExpression(e.target.value)} />
                  <button className="secondary lex-small-btn" disabled={newExpression.trim().split(/\s+/).length < 2} onClick={() => {
                    const v = newExpression.trim().replace(/\s+/g, ' ')
                    update((p) => { if (!p.expressions.items.some((x) => x.toLowerCase() === v.toLowerCase())) p.expressions.items.push(v) })
                    setNewExpression('')
                  }}>{t('labiia.lexical.prep.add')}</button>
                </div>
                {prep.expressions.items.length > 0 && (
                  <div className="lex-chips">
                    {prep.expressions.items.map((x, i) => (
                      <span key={x} className="lex-chip">
                        {x.split(/\s+/).join('_')}
                        <button className="lex-chip-x" title={t('labiia.lexical.remove')} onClick={() => update((p) => { p.expressions.items.splice(i, 1) })}>×</button>
                      </span>
                    ))}
                  </div>
                )}
                {compounds && (
                  compounds.length === 0 ? <p className="lex-muted">{t('labiia.lexical.prep.noneExpressions')}</p> : (
                    <div className="lex-prep-list">
                      {compounds.map((c) => (
                        <label key={c.expression} className="lex-field-check lex-prep-row" title={c.examples.join('\n…\n')}>
                          <input
                            type="checkbox"
                            checked={chosenExpressions.has(c.expression)}
                            onChange={(e) => update((p) => {
                              p.expressions.items = e.target.checked
                                ? [...p.expressions.items, c.expression]
                                : p.expressions.items.filter((x) => x.toLowerCase() !== c.expression)
                            })}
                          />
                          <span>{c.expression}</span>
                          <span className="lex-muted">{t('labiia.lexical.prep.expressionStats', { frequency: c.frequency, documents: c.documents, score: Math.round(c.relative * 100) })}</span>
                        </label>
                      ))}
                    </div>
                  )
                )}
              </div>
            )}
          </section>
        </div>

        <p className="lex-muted lex-prep-order">{t('labiia.lexical.prep.order')}</p>
        <div className="modal-actions">
          <button className="secondary" onClick={onCancel}>{t('labiia.lexical.cancel')}</button>
          <button onClick={() => onSave(prep)}>{t('labiia.lexical.save')}</button>
        </div>
      </div>
    </div>
  )
}

/** A group found by a method: the researcher picks the spelling to keep and which spellings join it. */
function VariantRow({ group, onAccept }: { group: VariantSuggestion; onAccept: (canonical: string, words: string[]) => void }) {
  const [canonical, setCanonical] = useState(group.canonical)
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(group.variants.map((v) => v.word)))
  const words = group.variants.map((v) => v.word).filter((w) => chosen.has(w))
  return (
    <div className="lex-prep-row lex-prep-variant">
      <div className="lex-prep-variant-words">
        {group.variants.map((v) => (
          <label key={v.word} className="lex-field-check">
            <input type="checkbox" checked={chosen.has(v.word)} onChange={(e) => {
              const n = new Set(chosen)
              if (e.target.checked) n.add(v.word)
              else n.delete(v.word)
              setChosen(n)
            }} />
            <span>{v.word} <span className="lex-muted">{v.frequency}×</span></span>
          </label>
        ))}
      </div>
      <span className="lex-prep-arrow">→</span>
      <select value={canonical} onChange={(e) => setCanonical(e.target.value)}>
        {group.variants.map((v) => <option key={v.word} value={v.word}>{v.word}</option>)}
      </select>
      <button className="secondary lex-small-btn" disabled={words.filter((w) => w !== canonical).length === 0} onClick={() => onAccept(canonical, words)}>
        {t('labiia.lexical.prep.accept')}
      </button>
    </div>
  )
}
