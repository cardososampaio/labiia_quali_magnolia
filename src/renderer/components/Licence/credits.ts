/**
 * Credits shown in Help → Licence & Attributions. Four groups, because each
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

export const BUNDLED_LIBRARIES: CreditRow[] = [
  { name: 'Electron', role: t('desktop runtime'), licence: 'MIT' },
  { name: 'React', role: t('interface framework'), licence: 'MIT' },
  { name: 'TipTap', role: t('rich-text editor for memos'), licence: 'MIT' },
  { name: 'PDF.js', role: t('PDF display'), licence: 'Apache-2.0' },
  { name: 'mammoth', role: t('Word (.docx) document import'), licence: 'BSD-2-Clause' },
  { name: 'rtf-parser, rtf-to-html', role: t('RTF document import'), licence: 'ISC' },
  { name: 'heic-decode (libheif-js)', role: t('HEIC / HEIF image decoding'), licence: 'ISC, LGPL-3.0' },
  { name: 'utif', role: t('TIFF image decoding'), licence: 'MIT' },
  { name: 'pngjs', role: t('PNG image reading and writing'), licence: 'MIT' },
  { name: 'mp4box', role: t('video file reading'), licence: 'BSD-3-Clause' },
  { name: 'music-metadata', role: t('audio metadata'), licence: 'MIT' },
  { name: 'SheetJS (xlsx)', role: t('spreadsheet survey import'), licence: 'Apache-2.0' },
  { name: 'JSZip', role: t('QDPX project archive read/write'), licence: 'MIT' },
  { name: 'yauzl', role: t('reading large project archives'), licence: 'MIT' },
  { name: 'fast-xml-parser', role: t('QDPX and codebook XML reading'), licence: 'MIT' },
  { name: 'marked, tiptap-markdown', role: t('Markdown rendering'), licence: 'MIT' },
  { name: 'diff', role: t('comparing project copies when merging'), licence: 'BSD-3-Clause' },
  { name: 'uuid', role: t('identifiers for codes and sources'), licence: 'MIT' },
  { name: 'react-resizable-panels', role: t('split-pane layout'), licence: 'MIT' },
  { name: 'Zustand', role: t('state management'), licence: 'MIT' },
  { name: 'Lucide', role: t('icon set'), licence: 'ISC' },
  { name: 'electron-updater', role: t('automatic updates'), licence: 'MIT' },
  { name: 'DejaVu Sans', role: t('font of the lexical figures'), licence: 'Bitstream Vera' }
]

export const LEXICAL_CREDITS: CreditRow[] = [
  { name: 'labiia_lex', role: t('the twelve lexical analyses, their parameters and figures, by Rafael Cardoso Sampaio (UFPE, labiia_lab)'), licence: 'GPL-3.0+' },
  { name: 'IRaMuTeQ', role: t('Reinert method (CHD) scripts, lemmatisation dictionaries (pt, en, es) and compound expressions, by Pierre Ratinaud'), licence: 'GPL' },
  { name: 'Snowball', role: t('stopword lists (pt, en, es)'), licence: 'BSD-3-Clause' },
  { name: 'OpLexicon', role: t('Portuguese polarity lexicon used by Sentiment, by Marlo Souza and Renata Vieira (PUCRS)'), licence: t('academic') },
  {
    name: 'NRC Emotion Lexicon',
    role: t('emotion lexicon used by Emotions (through syuzhet), by Saif M. Mohammad and Peter D. Turney'),
    licence: t('research'),
    note: t('Free for research and teaching; commercial use of this lexicon needs a licence from the National Research Council Canada.')
  },
  { name: 'YAKE!', role: t('keyword extraction method and its stopwords, by Campos, Mangaravite, Pasquali, Jorge, Nunes and Jatowt (LIAAD / INESC TEC)'), licence: 'LGPL-3.0' },
  { name: 'LDAvis', role: t('intertopic distance map and term relevance, by Carson Sievert and Kenneth Shirley (method)'), licence: 'MIT' },
  { name: 'bibliometrix', role: t('Thematic map axes and theme labels, by Massimo Aria and Corrado Cuccurullo (method)'), licence: 'GPL-3.0' },
  { name: 'Textometrica, Voyant Tools, Lexos', role: t('connected concepts, word tree and n-gram ideas brought in by labiia_lex (methods)'), licence: '—' }
]

export const R_CREDITS: CreditRow[] = [
  { name: 'R', role: t('statistical computing environment, by the R Core Team'), licence: 'GPL-2 | GPL-3' },
  { name: 'ape', role: t('CHD dendrograms'), licence: 'GPL-2 | GPL-3' },
  { name: 'ca', role: t('correspondence analysis (AFC)'), licence: 'GPL' },
  { name: 'cluster', role: t('CHD class statistics'), licence: 'GPL-2+' },
  { name: 'fmsb', role: t('emotion radar chart'), licence: 'GPL-2+' },
    { name: 'ggwordcloud, ggplot2', role: t('Word cloud'), licence: 'GPL-3, MIT' },
  { name: 'wordcloud', role: t('word clouds of the CHD classes and similitude'), licence: 'LGPL-2.1' },
  { name: 'igraph', role: t('similitude graphs and layouts'), licence: 'GPL-2+' },
  { name: 'sna, intergraph, network', role: t('drawing the similitude graph'), licence: 'GPL-2+, GPL-3' },
  { name: 'irlba', role: t('CHD matrix decomposition'), licence: 'GPL-3' },
  { name: 'Matrix', role: t('CHD sparse matrices'), licence: 'GPL-2+' },
  { name: 'slam', role: t('LDA document-term matrix'), licence: 'GPL-2' },
  { name: 'textometry', role: t('CHD specificities (from the TXM software)'), licence: 'GPL-3+' },
  { name: 'topicmodels', role: t('LDA topic models, by Bettina Grün and Kurt Hornik'), licence: 'GPL-2' },
  { name: 'syuzhet', role: t('emotions with the NRC lexicon, by Matthew Jockers'), licence: 'GPL-3' },
  { name: 'jsonlite', role: t('exchanging data between R and the program'), licence: 'MIT' },
  { name: 'png', role: t('Word cloud image'), licence: 'GPL-2 | GPL-3' },
  { name: 'RColorBrewer', role: t('colour palettes'), licence: 'Apache-2.0' }
]
