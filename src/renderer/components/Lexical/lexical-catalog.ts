/**
 * The lexical analyses (ported from labiia_lex) and their settings.
 *
 * Each test keeps the settings and defaults of labiia_lex so results can be
 * compared with it: a researcher moving a corpus from labiia_lex to
 * labiia_quali should get the same picture without retuning anything.
 *
 * `engine` says where the computation runs. Tests whose engine is R need R
 * and the listed CRAN packages; the others run inside the app.
 */
import {
  faCloud,
  faGitFork,
  faWaypoints,
  faSmile,
  faLink2,
  faLayers,
  faMap,
  faKeyRound,
  faThumbsUp,
  faListTree,
  faSpline,
  faWorkflow,
  type IconComponent
} from '../Icon'
import { t } from '../../i18n'

import { LEXICAL_R_PACKAGES, type LexicalTestId, type LexicalToolType } from '../../models/lexical-api'

export type { LexicalTestId, LexicalToolType }

export type LexicalParamValue = number | string | boolean

export type LexicalParam =
  | { key: string; label: string; kind: 'int'; default: number; min: number; max: number; step?: number; help?: string }
  | { key: string; label: string; kind: 'number'; default: number; min: number; max: number; step: number; help?: string }
  | { key: string; label: string; kind: 'bool'; default: boolean; help?: string }
  | { key: string; label: string; kind: 'text'; default: string; placeholder?: string; help?: string }
  | { key: string; label: string; kind: 'select'; default: string; options: { value: string; label: string }[]; help?: string }

export interface LexicalTestDef {
  id: LexicalTestId
  label: string
  description: string
  icon: IconComponent
  color: string
  engine: 'r' | 'app'
  /** CRAN packages the R engine loads. */
  rPackages: string[]
  params: LexicalParam[]
  /** Settings shown under "More settings" instead of up front. */
  advanced?: string[]
}

const opt = (value: string, label: string) => ({ value, label })

/** The similarity indices of IRaMuTeQ, in its order (the R engine reads them by name). */
const SIMILARITY_INDICES = [
  'cooccurrence', 'percentual de coocorrência', 'Russel', 'Jaccard', 'Kulczynski1', 'Kulczynski2',
  'Mountford', 'Fager', 'simple matching', 'Hamman', 'Faith', 'Tanimoto', 'Dice', 'Phi', 'Stiles',
  'Michael', 'Mozley', 'Yule', 'Yule2', 'Ochiai', 'Simpson', 'Braun-Blanquet', 'Chi-squared',
  'Phi-squared', 'Tschuprow', 'Cramer', 'Pearson', 'binomial'
]

const USE_LEMMAS: LexicalParam = { key: 'use_lemmas', label: t('Use lemmas'), kind: 'bool', default: true, help: t('Group inflected forms under their dictionary form ("falou", "falar" → "falar")') }
const ACTIVE_ONLY: LexicalParam = { key: 'active_only', label: t('Active forms only'), kind: 'bool', default: true, help: t('Count only nouns, verbs, adjectives, adverbs and unknown words') }

export const LEXICAL_TESTS: LexicalTestDef[] = [
  {
    id: 'wordcloud',
    label: t('Word Cloud'),
    description: t('The most frequent words, sized by frequency'),
    icon: faCloud,
    color: '#3A7BD5',
    engine: 'r',
    rPackages: LEXICAL_R_PACKAGES['wordcloud'],
    params: [
      { key: 'max_words', label: t('Maximum words'), kind: 'int', default: 100, min: 10, max: 2000, step: 10 },
      { key: 'min_freq', label: t('Minimum frequency'), kind: 'int', default: 3, min: 1, max: 1000 },
      { key: 'colors', label: t('Colour scheme'), kind: 'select', default: 'Dark2', options: ['Dark2', 'Set1', 'Set2', 'Paired', 'Pastel1'].map((v) => opt(v, v)) },
      {
        key: 'shape', label: t('Cloud shape'), kind: 'select', default: 'square', options: [
          opt('square', t('Square')), opt('cardioid', t('Cardioid')), opt('diamond', t('Diamond')),
          opt('triangle-forward', t('Triangle (forward)')), opt('triangle-upright', t('Triangle (upright)')),
          opt('pentagon', t('Pentagon')), opt('star', t('Star'))
        ]
      },
      { key: 'eccentricity', label: t('Eccentricity'), kind: 'select', default: '0.65', options: [opt('0.35', t('Low')), opt('0.65', t('Medium')), opt('1', t('High'))] },
      USE_LEMMAS,
      ACTIVE_ONLY
    ],
    advanced: ['eccentricity', 'use_lemmas', 'active_only']
  },
  {
    id: 'chd',
    label: t('Descending Hierarchical Classification'),
    description: t('Reinert method (IRaMuTeQ): classes of segments, profiles and correspondence analysis'),
    icon: faGitFork,
    color: '#C0392B',
    engine: 'r',
    rPackages: LEXICAL_R_PACKAGES['chd'],
    params: [
      { key: 'n_classes', label: t('Number of terminal classes (phase 1)'), kind: 'int', default: 5, min: 2, max: 10 },
      { key: 'min_freq', label: t('Minimum frequency'), kind: 'int', default: 3, min: 3, max: 1000, help: t('IRaMuTeQ uses at least 3') },
      {
        key: 'classif_mode', label: t('Classification'), kind: 'select', default: '1', options: [
          opt('1', t('Simple on text segments')), opt('2', t('Simple on texts')), opt('0', t('Double on text segments'))
        ]
      },
      { key: 'tailleuc1', label: t('Segment size 1 (double)'), kind: 'int', default: 12, min: 4, max: 100 },
      { key: 'tailleuc2', label: t('Segment size 2 (double)'), kind: 'int', default: 14, min: 4, max: 100 },
      { key: 'min_uce', label: t('Minimum segments per class (0 = automatic)'), kind: 'int', default: 0, min: 0, max: 10000 },
      { key: 'max_actives', label: t('Maximum active forms'), kind: 'int', default: 20000, min: 100, max: 100000, step: 100 },
      {
        key: 'dendro_type', label: t('Dendrogram'), kind: 'select', default: 'profile', options: [
          opt('profile', t('Profiles')), opt('cloud', t('Word clouds')), opt('pie', t('Pie')), opt('barplot', t('Bars'))
        ]
      },
      { key: 'bw', label: t('Black and white'), kind: 'bool', default: false },
      { key: 'robustness_check', label: t('Robustness check'), kind: 'bool', default: false, help: t('Repeats the classification with other settings and measures the agreement (adjusted Rand index)') },
      { key: 'lab', label: t('Class names'), kind: 'text', default: '', placeholder: t('Separated by commas') }
    ],
    advanced: ['tailleuc1', 'tailleuc2', 'min_uce', 'max_actives', 'bw', 'robustness_check', 'lab']
  },
  {
    id: 'similitude',
    label: t('Similarity Analysis'),
    description: t('Graph of words that appear together in the same segments'),
    icon: faWaypoints,
    color: '#16A085',
    engine: 'r',
    rPackages: LEXICAL_R_PACKAGES['similitude'],
    params: [
      { key: 'max_words', label: t('Maximum words'), kind: 'int', default: 80, min: 10, max: 200 },
      { key: 'min_freq', label: t('Minimum frequency'), kind: 'int', default: 3, min: 1, max: 1000 },
      {
        key: 'coefficient', label: t('Index'), kind: 'select', default: 'cooccurrence',
        options: SIMILARITY_INDICES.map((v) => opt(v, v === 'cooccurrence' ? t('Co-occurrence') : v === 'percentual de coocorrência' ? t('Co-occurrence percentage') : v))
      },
      {
        key: 'layout', label: t('Layout'), kind: 'select', default: 'frutch', options: [
          opt('frutch', 'Fruchterman-Reingold'), opt('kawa', 'Kamada-Kawai'), opt('graphopt', 'Graphopt'),
          opt('circle', t('Circle')), opt('random', t('Random'))
        ]
      },
      {
        key: 'vertex_scaling', label: t('Word size by'), kind: 'select', default: 'frequency', options: [
          opt('frequency', t('Frequency')), opt('chi2', t('Chi-square')), opt('degree', t('Degree'))
        ]
      },
      { key: 'min_edge', label: t('Minimum edge value'), kind: 'int', default: 0, min: 0, max: 10000 },
      { key: 'arbremax', label: t('Maximum tree'), kind: 'bool', default: true },
      { key: 'detect_communities', label: t('Communities'), kind: 'bool', default: false },
      { key: 'show_halo', label: t('Halo'), kind: 'bool', default: false },
      USE_LEMMAS
    ],
    advanced: ['layout', 'vertex_scaling', 'min_edge', 'use_lemmas']
  },
  {
    id: 'emotions',
    label: t('Emotions'),
    description: t('Eight emotions and two polarities from the NRC lexicon'),
    icon: faSmile,
    color: '#E67E22',
    engine: 'r',
    rPackages: LEXICAL_R_PACKAGES['emotions'],
    params: []
  },
  {
    id: 'keyword-associations',
    label: t('Keyword Associations'),
    description: t('Words most strongly associated with chosen keywords (log-likelihood)'),
    icon: faLink2,
    color: '#8E44AD',
    engine: 'app',
    rPackages: LEXICAL_R_PACKAGES['keyword-associations'],
    params: [
      { key: 'focal_terms', label: t('Keywords'), kind: 'text', default: '', placeholder: t('Up to 6, separated by commas; empty = the 4 most frequent') },
      { key: 'top_n', label: t('Associations per keyword'), kind: 'int', default: 12, min: 3, max: 50 },
      { key: 'min_joint', label: t('Minimum co-occurrences'), kind: 'int', default: 3, min: 1, max: 100 },
      { key: 'min_freq', label: t('Minimum frequency'), kind: 'int', default: 2, min: 1, max: 1000 },
      USE_LEMMAS
    ],
    advanced: ['min_freq', 'use_lemmas']
  },
  {
    id: 'lda',
    label: t('LDA Topics'),
    description: t('Latent Dirichlet Allocation topic model'),
    icon: faLayers,
    color: '#2C3E50',
    engine: 'r',
    rPackages: LEXICAL_R_PACKAGES['lda'],
    params: [
      { key: 'k', label: t('Number of topics'), kind: 'int', default: 6, min: 2, max: 50 },
      { key: 'method', label: t('Method'), kind: 'select', default: 'VEM', options: [opt('VEM', 'VEM'), opt('Gibbs', 'Gibbs')] },
      { key: 'min_freq', label: t('Minimum frequency'), kind: 'int', default: 2, min: 1, max: 1000 },
      { key: 'max_features', label: t('Maximum terms'), kind: 'int', default: 2000, min: 100, max: 20000, step: 100 },
      { key: 'seed', label: t('Seed'), kind: 'int', default: 42, min: 1, max: 999999 },
      { key: 'n_iter', label: t('Iterations'), kind: 'int', default: 500, min: 50, max: 10000, step: 50 },
      { key: 'gibbs_burnin', label: t('Gibbs burn-in'), kind: 'int', default: 1000, min: 0, max: 20000, step: 100 },
      { key: 'gibbs_iter', label: t('Gibbs iterations'), kind: 'int', default: 1000, min: 100, max: 20000, step: 100 },
      { key: 'gibbs_thin', label: t('Gibbs thinning'), kind: 'int', default: 100, min: 1, max: 1000 },
      { key: 'enable_k_tuning', label: t('Suggest the number of topics'), kind: 'bool', default: false },
      { key: 'k_min', label: t('Smallest number of topics tried'), kind: 'int', default: 2, min: 2, max: 50 },
      { key: 'k_max', label: t('Largest number of topics tried'), kind: 'int', default: 12, min: 3, max: 60 },
      USE_LEMMAS
    ],
    advanced: ['seed', 'n_iter', 'gibbs_burnin', 'gibbs_iter', 'gibbs_thin', 'k_min', 'k_max', 'use_lemmas']
  },
  {
    id: 'thematic-map',
    label: t('Thematic Map'),
    description: t('Word communities placed by centrality and density'),
    icon: faMap,
    color: '#27AE60',
    engine: 'app',
    rPackages: LEXICAL_R_PACKAGES['thematic-map'],
    params: [
      { key: 'max_nodes', label: t('Maximum words in the network'), kind: 'int', default: 120, min: 20, max: 500 },
      { key: 'top_edges', label: t('Maximum links'), kind: 'int', default: 160, min: 20, max: 2000 },
      { key: 'min_freq', label: t('Minimum frequency'), kind: 'int', default: 2, min: 1, max: 1000 },
      { key: 'min_cooc', label: t('Minimum co-occurrences'), kind: 'int', default: 2, min: 1, max: 100 },
      { key: 'max_features', label: t('Maximum terms'), kind: 'int', default: 300, min: 50, max: 5000 },
      { key: 'resolution', label: t('Community resolution'), kind: 'number', default: 0.5, min: 0.1, max: 3, step: 0.1 },
      { key: 'label_words', label: t('Words in each theme name'), kind: 'int', default: 2, min: 1, max: 5 },
      { key: 'min_theme_freq', label: t('Minimum theme frequency (per 1,000 segments)'), kind: 'number', default: 5, min: 0, max: 100, step: 0.5 },
      USE_LEMMAS
    ],
    advanced: ['min_cooc', 'max_features', 'resolution', 'label_words', 'min_theme_freq', 'use_lemmas']
  },
  {
    id: 'yake',
    label: t('YAKE Keywords'),
    description: t('Key expressions of one to three words, ranked by YAKE'),
    icon: faKeyRound,
    color: '#D4AC0D',
    engine: 'app',
    rPackages: LEXICAL_R_PACKAGES['yake'],
    params: [
      { key: 'top_n', label: t('Number of expressions'), kind: 'int', default: 50, min: 5, max: 500 },
      { key: 'min_tokens', label: t('Smallest expression (words)'), kind: 'int', default: 1, min: 1, max: 3 },
      { key: 'max_tokens', label: t('Largest expression (words)'), kind: 'int', default: 3, min: 1, max: 3 },
      { key: 'min_freq', label: t('Minimum frequency'), kind: 'int', default: 1, min: 1, max: 100 },
      { key: 'dedup_threshold', label: t('Duplicate threshold'), kind: 'number', default: 0.7, min: 0.1, max: 1, step: 0.05 }
    ],
    advanced: ['min_freq', 'dedup_threshold']
  },
  {
    id: 'sentiment',
    label: t('Sentiment'),
    description: t('Positive and negative words per document (OpLexicon)'),
    icon: faThumbsUp,
    color: '#E84393',
    engine: 'app',
    rPackages: LEXICAL_R_PACKAGES['sentiment'],
    params: [
      { key: 'top_words', label: t('Words listed'), kind: 'int', default: 25, min: 5, max: 200 },
      { key: 'with_timeline', label: t('Timeline (when documents have dates)'), kind: 'bool', default: true }
    ]
  },
  {
    id: 'word-tree',
    label: t('Word Tree'),
    description: t('What comes before and after a word'),
    icon: faListTree,
    color: '#6C5CE7',
    engine: 'app',
    rPackages: LEXICAL_R_PACKAGES['word-tree'],
    params: [
      { key: 'keyword', label: t('Word'), kind: 'text', default: '', placeholder: t('Empty = the most frequent word') },
      { key: 'max_depth', label: t('Depth'), kind: 'int', default: 4, min: 1, max: 8 },
      { key: 'top_branches', label: t('Maximum branches'), kind: 'int', default: 120, min: 20, max: 500 },
      { key: 'min_branch_freq', label: t('Minimum branch frequency'), kind: 'int', default: 2, min: 1, max: 100 },
      { key: 'min_freq', label: t('Minimum frequency'), kind: 'int', default: 3, min: 1, max: 1000 },
      USE_LEMMAS,
      ACTIVE_ONLY
    ],
    advanced: ['min_freq', 'use_lemmas', 'active_only']
  },
  {
    id: 'bigrams',
    label: t('Bigrams'),
    description: t('Network of word pairs that appear side by side'),
    icon: faSpline,
    color: '#0984E3',
    engine: 'app',
    rPackages: LEXICAL_R_PACKAGES['bigrams'],
    params: [
      { key: 'min_freq', label: t('Minimum pair frequency'), kind: 'int', default: 2, min: 1, max: 1000 },
      { key: 'top_edges', label: t('Maximum links'), kind: 'int', default: 120, min: 10, max: 1000 }
    ]
  },
  {
    id: 'trigrams',
    label: t('Trigrams'),
    description: t('Network of three-word sequences'),
    icon: faWorkflow,
    color: '#00838F',
    engine: 'app',
    rPackages: LEXICAL_R_PACKAGES['trigrams'],
    params: [
      { key: 'min_freq', label: t('Minimum sequence frequency'), kind: 'int', default: 2, min: 1, max: 1000 },
      { key: 'top_edges', label: t('Maximum links'), kind: 'int', default: 120, min: 10, max: 1000 }
    ]
  }
]

/** Tests whose engine is connected; the others show their settings but cannot run yet. */
export const CONNECTED_TESTS = new Set<LexicalTestId>(['wordcloud'])

export const LEXICAL_TOOL_PREFIX = 'lexical-'

export function isLexicalToolType(toolType: string | undefined): toolType is LexicalToolType {
  return !!toolType && toolType.startsWith(LEXICAL_TOOL_PREFIX) && !!lexicalTestFor(toolType)
}

export function lexicalToolType(id: LexicalTestId): LexicalToolType {
  return `${LEXICAL_TOOL_PREFIX}${id}` as LexicalToolType
}

export function lexicalTestFor(toolType: string): LexicalTestDef | undefined {
  const id = toolType.slice(LEXICAL_TOOL_PREFIX.length)
  return LEXICAL_TESTS.find((d) => d.id === id)
}

/** Settings for a test: labiia_lex defaults, overlaid with what was saved. */
export function defaultParams(def: LexicalTestDef, saved?: Record<string, LexicalParamValue>): Record<string, LexicalParamValue> {
  const out: Record<string, LexicalParamValue> = {}
  for (const p of def.params) {
    const v = saved?.[p.key]
    out[p.key] = v === undefined || typeof v !== typeof p.default ? p.default : clampParam(p, v)
  }
  return out
}

/** Keeps a value inside the range and options the test accepts. */
export function clampParam(p: LexicalParam, v: LexicalParamValue): LexicalParamValue {
  if (p.kind === 'int' || p.kind === 'number') {
    const n = typeof v === 'number' ? v : Number(v)
    if (!Number.isFinite(n)) return p.default
    const clamped = Math.min(p.max, Math.max(p.min, n))
    return p.kind === 'int' ? Math.round(clamped) : clamped
  }
  if (p.kind === 'select') return p.options.some((o) => o.value === v) ? v : p.default
  if (p.kind === 'bool') return typeof v === 'boolean' ? v : p.default
  return typeof v === 'string' ? v : p.default
}

/** Corpus languages with an IRaMuTeQ dictionary. */
export type CorpusLanguage = 'pt' | 'en' | 'es'
export const CORPUS_LANGUAGES: { value: CorpusLanguage; label: string }[] = [
  { value: 'pt', label: t('Portuguese') },
  { value: 'en', label: t('English') },
  { value: 'es', label: t('Spanish') }
]
