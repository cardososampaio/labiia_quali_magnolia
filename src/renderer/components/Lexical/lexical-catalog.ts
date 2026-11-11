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
/** An option whose label is translated when shown: the catalogue is built
 *  when the module loads, before the interface language is ready. */
const optT = (value: string, key: string) => ({ value, get label() { return t(key) } })

/** The similarity indices of IRaMuTeQ, in its order (the R engine reads them by name). */
const SIMILARITY_INDICES = [
  'cooccurrence', 'percentual de coocorrência', 'Russel', 'Jaccard', 'Kulczynski1', 'Kulczynski2',
  'Mountford', 'Fager', 'simple matching', 'Hamman', 'Faith', 'Tanimoto', 'Dice', 'Phi', 'Stiles',
  'Michael', 'Mozley', 'Yule', 'Yule2', 'Ochiai', 'Simpson', 'Braun-Blanquet', 'Chi-squared',
  'Phi-squared', 'Tschuprow', 'Cramer', 'Pearson', 'binomial'
]

const USE_LEMMAS: LexicalParam = { key: 'use_lemmas', get label() { return t('labiia.lexical.useLemmas') }, kind: 'bool', default: true, get help() { return t('labiia.lexical.groupInflectedFormsUnderTheir') } }
const ACTIVE_ONLY: LexicalParam = { key: 'active_only', get label() { return t('labiia.lexical.activeFormsOnly') }, kind: 'bool', default: true, get help() { return t('labiia.lexical.countOnlyNounsVerbsAdjectives') } }

export const LEXICAL_TESTS: LexicalTestDef[] = [
  {
    id: 'wordcloud',
    get label() { return t('labiia.lexical.wordCloud') },
    get description() { return t('labiia.lexical.theMostFrequentWordsSized') },
    icon: faCloud,
    color: '#3A7BD5',
    engine: 'r',
    rPackages: LEXICAL_R_PACKAGES['wordcloud'],
    params: [
      { key: 'max_words', get label() { return t('labiia.lexical.maximumWords') }, kind: 'int', default: 100, min: 10, max: 2000, step: 10 },
      { key: 'min_freq', get label() { return t('labiia.lexical.minimumFrequency') }, kind: 'int', default: 3, min: 1, max: 1000 },
      { key: 'colors', get label() { return t('labiia.lexical.colourScheme') }, kind: 'select', default: 'Dark2', options: ['Dark2', 'Set1', 'Set2', 'Paired', 'Pastel1'].map((v) => opt(v, v)) },
      {
        key: 'shape', get label() { return t('labiia.lexical.cloudShape') }, kind: 'select', default: 'square', options: [
          optT('square', 'labiia.lexical.square'), optT('cardioid', 'labiia.lexical.cardioid'), optT('diamond', 'labiia.lexical.diamond'),
          optT('triangle-forward', 'labiia.lexical.triangleForward'), optT('triangle-upright', 'labiia.lexical.triangleUpright'),
          optT('pentagon', 'labiia.lexical.pentagon'), optT('star', 'labiia.lexical.star')
        ]
      },
      { key: 'eccentricity', get label() { return t('labiia.lexical.eccentricity') }, kind: 'select', default: '0.65', options: [optT('0.35', 'labiia.lexical.low'), optT('0.65', 'labiia.lexical.medium'), optT('1', 'labiia.lexical.high')] },
      USE_LEMMAS,
      ACTIVE_ONLY
    ],
    advanced: ['eccentricity', 'use_lemmas', 'active_only']
  },
  {
    id: 'chd',
    get label() { return t('labiia.lexical.descendingHierarchicalClassification') },
    get description() { return t('labiia.lexical.reinertMethodIramuteqClassesOf') },
    icon: faGitFork,
    color: '#C0392B',
    engine: 'r',
    rPackages: LEXICAL_R_PACKAGES['chd'],
    params: [
      { key: 'n_classes', get label() { return t('labiia.lexical.numberOfTerminalClassesPhase') }, kind: 'int', default: 5, min: 2, max: 10 },
      { key: 'min_freq', get label() { return t('labiia.lexical.minimumFrequency') }, kind: 'int', default: 3, min: 3, max: 1000, get help() { return t('labiia.lexical.iramuteqUsesAtLeast3') } },
      {
        key: 'classif_mode', get label() { return t('labiia.lexical.classification') }, kind: 'select', default: '1', options: [
          optT('1', 'labiia.lexical.simpleOnTextSegments'), optT('2', 'labiia.lexical.simpleOnTexts'), optT('0', 'labiia.lexical.doubleOnTextSegments')
        ]
      },
      { key: 'tailleuc1', get label() { return t('labiia.lexical.segmentSize1Double') }, kind: 'int', default: 12, min: 4, max: 100 },
      { key: 'tailleuc2', get label() { return t('labiia.lexical.segmentSize2Double') }, kind: 'int', default: 14, min: 4, max: 100 },
      { key: 'min_uce', get label() { return t('labiia.lexical.minimumSegmentsPerClass0') }, kind: 'int', default: 0, min: 0, max: 10000 },
      { key: 'max_actives', get label() { return t('labiia.lexical.maximumActiveForms') }, kind: 'int', default: 20000, min: 100, max: 100000, step: 100 },
      { key: 'bw', get label() { return t('labiia.lexical.blackAndWhite') }, kind: 'bool', default: false },
      { key: 'robustness_check', get label() { return t('labiia.lexical.robustnessCheck') }, kind: 'bool', default: false, get help() { return t('labiia.lexical.repeatsTheClassificationWithOther') } },
      { key: 'lab', get label() { return t('labiia.lexical.classNames') }, kind: 'text', default: '', get placeholder() { return t('labiia.lexical.separatedByCommas') } }
    ],
    advanced: ['tailleuc1', 'tailleuc2', 'min_uce', 'max_actives', 'bw', 'robustness_check', 'lab']
  },
  {
    id: 'similitude',
    get label() { return t('labiia.lexical.similarityAnalysis') },
    get description() { return t('labiia.lexical.graphOfWordsThatAppear') },
    icon: faWaypoints,
    color: '#16A085',
    engine: 'r',
    rPackages: LEXICAL_R_PACKAGES['similitude'],
    params: [
      // 200: the cap labiia_lex applies in its default (IRaMuTeQ) mode.
      { key: 'max_words', get label() { return t('labiia.lexical.maximumWords') }, kind: 'int', default: 200, min: 10, max: 300 },
      { key: 'min_freq', get label() { return t('labiia.lexical.minimumFrequency') }, kind: 'int', default: 3, min: 1, max: 1000 },
      {
        key: 'coefficient', get label() { return t('labiia.lexical.index') }, kind: 'select', default: 'cooccurrence',
        options: SIMILARITY_INDICES.map((v) => v === 'cooccurrence' ? optT(v, 'labiia.lexical.coOccurrence') : v === 'percentual de coocorrência' ? optT(v, 'labiia.lexical.coOccurrencePercentage') : opt(v, v))
      },
      {
        key: 'layout', get label() { return t('labiia.lexical.layout') }, kind: 'select', default: 'frutch', options: [
          opt('frutch', 'Fruchterman-Reingold (sna)'), opt('kawa', 'Kamada-Kawai'), opt('fr', 'Fruchterman-Reingold (igraph)')
        ]
      },
      { key: 'arbremax', get label() { return t('labiia.lexical.maximumTree') }, kind: 'bool', default: true },
      { key: 'detect_communities', get label() { return t('labiia.lexical.colouredCommunities') }, kind: 'bool', default: false, get help() { return t('labiia.lexical.communitiesAreAlwaysDetectedOff') } },
      { key: 'show_halo', get label() { return t('labiia.lexical.halo') }, kind: 'bool', default: false },
      USE_LEMMAS
    ],
    advanced: ['layout', 'arbremax', 'use_lemmas']
  },
  {
    id: 'emotions',
    get label() { return t('labiia.lexical.emotions') },
    get description() { return t('labiia.lexical.eightEmotionsAndTwoPolarities') },
    icon: faSmile,
    color: '#E67E22',
    engine: 'r',
    rPackages: LEXICAL_R_PACKAGES['emotions'],
    params: []
  },
  {
    id: 'keyword-associations',
    get label() { return t('labiia.lexical.keywordAssociations') },
    get description() { return t('labiia.lexical.wordsMostStronglyAssociatedWith') },
    icon: faLink2,
    color: '#8E44AD',
    engine: 'app',
    rPackages: LEXICAL_R_PACKAGES['keyword-associations'],
    params: [
      { key: 'focal_terms', get label() { return t('labiia.lexical.keywords') }, kind: 'text', default: '', get placeholder() { return t('labiia.lexical.upTo6SeparatedBy') } },
      { key: 'top_n', get label() { return t('labiia.lexical.associationsPerKeyword') }, kind: 'int', default: 12, min: 3, max: 50 },
      { key: 'min_joint', get label() { return t('labiia.lexical.minimumCoOccurrences') }, kind: 'int', default: 3, min: 1, max: 100 },
      { key: 'min_freq', get label() { return t('labiia.lexical.minimumFrequency') }, kind: 'int', default: 2, min: 1, max: 1000 },
      USE_LEMMAS
    ],
    advanced: ['min_freq', 'use_lemmas']
  },
  {
    id: 'lda',
    get label() { return t('labiia.lexical.ldaTopics') },
    get description() { return t('labiia.lexical.latentDirichletAllocationTopicModel') },
    icon: faLayers,
    color: '#2C3E50',
    engine: 'r',
    rPackages: LEXICAL_R_PACKAGES['lda'],
    params: [
      { key: 'k', get label() { return t('labiia.lexical.numberOfTopics') }, kind: 'int', default: 6, min: 2, max: 50 },
      { key: 'method', get label() { return t('labiia.lexical.method') }, kind: 'select', default: 'VEM', options: [opt('VEM', 'VEM'), opt('Gibbs', 'Gibbs')] },
      { key: 'min_freq', get label() { return t('labiia.lexical.minimumFrequency') }, kind: 'int', default: 2, min: 1, max: 1000 },
      { key: 'max_features', get label() { return t('labiia.lexical.maximumTerms') }, kind: 'int', default: 2000, min: 100, max: 20000, step: 100 },
      { key: 'seed', get label() { return t('labiia.lexical.seed') }, kind: 'int', default: 42, min: 1, max: 999999 },
      { key: 'n_iter', get label() { return t('labiia.lexical.iterations') }, kind: 'int', default: 500, min: 50, max: 10000, step: 50 },
      { key: 'gibbs_burnin', get label() { return t('labiia.lexical.gibbsBurnIn') }, kind: 'int', default: 1000, min: 0, max: 20000, step: 100 },
      { key: 'gibbs_iter', get label() { return t('labiia.lexical.gibbsIterations') }, kind: 'int', default: 1000, min: 100, max: 20000, step: 100 },
      { key: 'gibbs_thin', get label() { return t('labiia.lexical.gibbsThinning') }, kind: 'int', default: 100, min: 1, max: 1000 },
      { key: 'enable_k_tuning', get label() { return t('labiia.lexical.suggestTheNumberOfTopics') }, kind: 'bool', default: false },
      { key: 'k_min', get label() { return t('labiia.lexical.smallestNumberOfTopicsTried') }, kind: 'int', default: 2, min: 2, max: 50 },
      { key: 'k_max', get label() { return t('labiia.lexical.largestNumberOfTopicsTried') }, kind: 'int', default: 12, min: 3, max: 60 },
      USE_LEMMAS
    ],
    advanced: ['seed', 'n_iter', 'gibbs_burnin', 'gibbs_iter', 'gibbs_thin', 'k_min', 'k_max', 'use_lemmas']
  },
  {
    id: 'thematic-map',
    get label() { return t('labiia.lexical.thematicMap') },
    get description() { return t('labiia.lexical.wordCommunitiesPlacedByCentrality') },
    icon: faMap,
    color: '#27AE60',
    engine: 'app',
    rPackages: LEXICAL_R_PACKAGES['thematic-map'],
    params: [
      { key: 'max_nodes', get label() { return t('labiia.lexical.maximumWordsInTheNetwork') }, kind: 'int', default: 120, min: 20, max: 500 },
      { key: 'top_edges', get label() { return t('labiia.lexical.maximumLinks') }, kind: 'int', default: 160, min: 20, max: 2000 },
      { key: 'min_freq', get label() { return t('labiia.lexical.minimumFrequency') }, kind: 'int', default: 2, min: 1, max: 1000 },
      { key: 'min_cooc', get label() { return t('labiia.lexical.minimumCoOccurrences') }, kind: 'int', default: 2, min: 1, max: 100 },
      { key: 'max_features', get label() { return t('labiia.lexical.maximumTerms') }, kind: 'int', default: 300, min: 50, max: 5000 },
      { key: 'resolution', get label() { return t('labiia.lexical.communityResolution') }, kind: 'number', default: 0.5, min: 0.1, max: 3, step: 0.1 },
      { key: 'label_words', get label() { return t('labiia.lexical.wordsInEachThemeName') }, kind: 'int', default: 2, min: 1, max: 3 },
      { key: 'min_theme_freq', get label() { return t('labiia.lexical.minimumThemeFrequencyPer1') }, kind: 'number', default: 5, min: 0, max: 100, step: 0.5 },
      USE_LEMMAS
    ],
    advanced: ['min_cooc', 'max_features', 'resolution', 'label_words', 'min_theme_freq', 'use_lemmas']
  },
  {
    id: 'yake',
    get label() { return t('labiia.lexical.yakeKeywords') },
    get description() { return t('labiia.lexical.keyExpressionsOfOneTo') },
    icon: faKeyRound,
    color: '#D4AC0D',
    engine: 'app',
    rPackages: LEXICAL_R_PACKAGES['yake'],
    params: [
      { key: 'top_n', get label() { return t('labiia.lexical.numberOfExpressions') }, kind: 'int', default: 50, min: 5, max: 500 },
      { key: 'min_tokens', get label() { return t('labiia.lexical.smallestExpressionWords') }, kind: 'int', default: 1, min: 1, max: 3 },
      { key: 'max_tokens', get label() { return t('labiia.lexical.largestExpressionWords') }, kind: 'int', default: 3, min: 1, max: 3 },
      { key: 'min_freq', get label() { return t('labiia.lexical.minimumFrequency') }, kind: 'int', default: 1, min: 1, max: 100 },
      // 0.9: the value labiia_lex really uses (it passes its 0.7 under a name yake ignores).
      { key: 'dedup_threshold', get label() { return t('labiia.lexical.duplicateThreshold') }, kind: 'number', default: 0.9, min: 0.1, max: 1, step: 0.05, get help() { return t('labiia.lexical.expressionsMoreSimilarThanThis') } }
    ],
    advanced: ['min_freq', 'dedup_threshold']
  },
  {
    id: 'sentiment',
    get label() { return t('labiia.lexical.sentiment') },
    get description() { return t('labiia.lexical.positiveAndNegativeWordsPer') },
    icon: faThumbsUp,
    color: '#E84393',
    engine: 'app',
    rPackages: LEXICAL_R_PACKAGES['sentiment'],
    params: [
      { key: 'top_words', get label() { return t('labiia.lexical.wordsListed') }, kind: 'int', default: 25, min: 10, max: 200 }
    ]
  },
  {
    id: 'word-tree',
    get label() { return t('labiia.lexical.wordTree') },
    get description() { return t('labiia.lexical.whatComesBeforeAndAfter') },
    icon: faListTree,
    color: '#6C5CE7',
    engine: 'app',
    rPackages: LEXICAL_R_PACKAGES['word-tree'],
    params: [
      { key: 'keyword', get label() { return t('labiia.lexical.word') }, kind: 'text', default: '', get placeholder() { return t('labiia.lexical.emptyTheMostFrequentWord') } },
      { key: 'max_depth', get label() { return t('labiia.lexical.depth') }, kind: 'int', default: 4, min: 1, max: 8 },
      { key: 'top_branches', get label() { return t('labiia.lexical.maximumBranches') }, kind: 'int', default: 120, min: 20, max: 500 },
      { key: 'min_branch_freq', get label() { return t('labiia.lexical.minimumBranchFrequency') }, kind: 'int', default: 2, min: 1, max: 100 },
      { key: 'min_freq', get label() { return t('labiia.lexical.minimumFrequency') }, kind: 'int', default: 3, min: 1, max: 1000 },
      USE_LEMMAS,
      ACTIVE_ONLY
    ],
    advanced: ['min_freq', 'use_lemmas', 'active_only']
  },
  {
    id: 'bigrams',
    get label() { return t('labiia.lexical.bigrams') },
    get description() { return t('labiia.lexical.networkOfWordPairsThat') },
    icon: faSpline,
    color: '#0984E3',
    engine: 'app',
    rPackages: LEXICAL_R_PACKAGES['bigrams'],
    params: [
      { key: 'min_freq', get label() { return t('labiia.lexical.minimumPairFrequency') }, kind: 'int', default: 2, min: 1, max: 1000 },
      { key: 'top_edges', get label() { return t('labiia.lexical.maximumLinks') }, kind: 'int', default: 120, min: 10, max: 1000 }
    ]
  },
  {
    id: 'trigrams',
    get label() { return t('labiia.lexical.trigrams') },
    get description() { return t('labiia.lexical.networkOfThreeWordSequences') },
    icon: faWorkflow,
    color: '#00838F',
    engine: 'app',
    rPackages: LEXICAL_R_PACKAGES['trigrams'],
    params: [
      { key: 'min_freq', get label() { return t('labiia.lexical.minimumSequenceFrequency') }, kind: 'int', default: 2, min: 1, max: 1000 },
      { key: 'top_edges', get label() { return t('labiia.lexical.maximumLinks') }, kind: 'int', default: 120, min: 10, max: 1000 }
    ]
  }
]

/** Tests whose engine is connected; the others show their settings but cannot run yet. */
export const CONNECTED_TESTS = new Set<LexicalTestId>(['wordcloud', 'bigrams', 'trigrams', 'word-tree', 'yake', 'keyword-associations', 'sentiment', 'emotions', 'similitude', 'lda', 'thematic-map', 'chd'])

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
  { value: 'pt', get label() { return t('labiia.lexical.portuguese') } },
  { value: 'en', get label() { return t('labiia.lexical.english') } },
  { value: 'es', get label() { return t('labiia.lexical.spanish') } }
]
