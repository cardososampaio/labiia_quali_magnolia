/**
 * labiia_quali's credits in Help → Licence & Attributions, below the
 * libraries Magnolia lists. Groups, because each
 * reaches the person differently:
 *  - libraries bundled inside the program (their full licence texts are in
 *    THIRD-PARTY-LICENSES.txt, generated from node_modules);
 *  - the lexical analyses: the work they come from (labiia_lex, IRaMuTeQ),
 *    the dictionaries and lexicons shipped in resources/lexical, and the
 *    published methods the code reproduces;
 *  - R and the CRAN packages the R-based tests run on, which are not bundled:
 *    the installer or the program downloads them from CRAN;
 *  - the font bundled for the lexical figures.
 * Licences of R packages are the License field of each package as installed
 * from CRAN; keep them in step with LEXICAL_R_PACKAGES.
 */
import { t } from '../../i18n'

export interface CreditRow {
  name: string
  role: string
  licence: string
  /** Shown under the row, for a condition the person should know about. */
  note?: string
}

export const LEXICAL_CREDITS: CreditRow[] = [
  { name: 'labiia_lex', get role() { return t('labiia.credits.theTwelveLexicalAnalysesTheir') }, licence: 'GPL-3.0+' },
  { name: 'IRaMuTeQ', get role() { return t('labiia.credits.reinertMethodChdScriptsLemmatisation') }, licence: 'GPL' },
  { name: 'Snowball', get role() { return t('labiia.credits.stopwordListsPtEnEs') }, licence: 'BSD-3-Clause' },
  { name: 'OpLexicon', get role() { return t('labiia.credits.portuguesePolarityLexiconUsedBy') }, get licence() { return t('labiia.credits.academic') } },
  {
    name: 'NRC Emotion Lexicon',
    get role() { return t('labiia.credits.emotionLexiconUsedByEmotions') },
    get licence() { return t('labiia.credits.research') },
    get note() { return t('labiia.credits.freeForResearchAndTeaching') }
  },
  { name: 'YAKE!', get role() { return t('labiia.credits.keywordExtractionMethodAndIts') }, licence: 'LGPL-3.0' },
  { name: 'LDAvis', get role() { return t('labiia.credits.intertopicDistanceMapAndTerm') }, licence: 'MIT' },
  { name: 'bibliometrix', get role() { return t('labiia.credits.thematicMapAxesAndTheme') }, licence: 'GPL-3.0' },
  { name: 'Textometrica, Voyant Tools, Lexos', get role() { return t('labiia.credits.connectedConceptsWordTreeAnd') }, licence: '—' },
  { name: 'DejaVu Sans', get role() { return t('labiia.credits.dejavuRole') }, licence: 'Bitstream Vera' },
  { name: 'Gephi, ForceAtlas2', get role() { return t('labiia.credits.forceAtlas2Role') }, licence: 'GPL-3.0 / CDDL-1.0' },
  { name: 'python-louvain', get role() { return t('labiia.credits.louvainRole') }, licence: 'BSD-3-Clause' },
  { name: 'sigma.js, graphology', get role() { return t('labiia.credits.sigmaRole') }, licence: 'MIT' },
  { name: 'OpenRefine', get role() { return t('labiia.credits.openRefineRole') }, licence: 'BSD-3-Clause' }
]

export const R_CREDITS: CreditRow[] = [
  { name: 'R', get role() { return t('labiia.credits.statisticalComputingEnvironmentByThe') }, licence: 'GPL-2 | GPL-3' },
  { name: 'ape', get role() { return t('labiia.credits.chdDendrograms') }, licence: 'GPL-2 | GPL-3' },
  { name: 'ca', get role() { return t('labiia.credits.correspondenceAnalysisAfc') }, licence: 'GPL' },
  { name: 'cluster', get role() { return t('labiia.credits.chdClassStatistics') }, licence: 'GPL-2+' },
  { name: 'fmsb', get role() { return t('labiia.credits.emotionRadarChart') }, licence: 'GPL-2+' },
    { name: 'ggwordcloud, ggplot2', get role() { return t('labiia.credits.wordCloud') }, licence: 'GPL-3, MIT' },
  { name: 'wordcloud', get role() { return t('labiia.credits.wordCloudsOfTheChd') }, licence: 'LGPL-2.1' },
  { name: 'igraph', get role() { return t('labiia.credits.similitudeGraphsAndLayouts') }, licence: 'GPL-2+' },
  { name: 'sna, intergraph, network', get role() { return t('labiia.credits.drawingTheSimilitudeGraph') }, licence: 'GPL-2+, GPL-3' },
  { name: 'irlba', get role() { return t('labiia.credits.chdMatrixDecomposition') }, licence: 'GPL-3' },
  { name: 'Matrix', get role() { return t('labiia.credits.chdSparseMatrices') }, licence: 'GPL-2+' },
  { name: 'slam', get role() { return t('labiia.credits.ldaDocumentTermMatrix') }, licence: 'GPL-2' },
  { name: 'textometry', get role() { return t('labiia.credits.chdSpecificitiesFromTheTxm') }, licence: 'GPL-3+' },
  { name: 'topicmodels', get role() { return t('labiia.credits.ldaTopicModelsByBettina') }, licence: 'GPL-2' },
  { name: 'syuzhet', get role() { return t('labiia.credits.emotionsWithTheNrcLexicon') }, licence: 'GPL-3' },
  { name: 'jsonlite', get role() { return t('labiia.credits.exchangingDataBetweenRAnd') }, licence: 'MIT' },
  { name: 'png', get role() { return t('labiia.credits.wordCloudImage') }, licence: 'GPL-2 | GPL-3' },
  { name: 'RColorBrewer', get role() { return t('labiia.credits.colourPalettes') }, licence: 'Apache-2.0' }
]
