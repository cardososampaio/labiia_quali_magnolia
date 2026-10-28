/**
 * Emotions with the NRC lexicon (labiia_lex's "Análise de Emoções"): the
 * text goes to R and syuzhet, and labiia_lex's own R script draws the bar,
 * radar and polarity charts (identical pixel for pixel on the same input).
 *
 * Correction to labiia_lex: the text keeps its function words (labiia_lex
 * had deleted them during preparation); NRC only scores the words it lists.
 */
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { runRScript } from '../r-runner'
import type { TestContext } from '../engine'
import type { LexicalFile, LexicalRunResult } from '../../../renderer/models/lexical-api'
import type { CorpusText } from '../lexical-worker'

const NRC_LANGUAGE = { pt: 'portuguese', en: 'english', es: 'spanish' } as const

// Chart texts follow the corpus language, as in labiia_lex.
const LABELS = {
  pt: {
    emotion_labels: { anger: 'Raiva', anticipation: 'Antecipação', disgust: 'Nojo', fear: 'Medo', joy: 'Alegria', sadness: 'Tristeza', surprise: 'Surpresa', trust: 'Confiança', positive: 'Positivo', negative: 'Negativo' },
    polarity_labels: { positive: 'Positivo', negative: 'Negativo' },
    title_emotions: 'Análise de Emoções — Léxico NRC', title_radar: 'Perfil Emocional — Léxico NRC', title_polarity: 'Polaridade — Léxico NRC', ylab_frequency: 'Frequência de ocorrências'
  },
  en: {
    emotion_labels: { anger: 'Anger', anticipation: 'Anticipation', disgust: 'Disgust', fear: 'Fear', joy: 'Joy', sadness: 'Sadness', surprise: 'Surprise', trust: 'Trust', positive: 'Positive', negative: 'Negative' },
    polarity_labels: { positive: 'Positive', negative: 'Negative' },
    title_emotions: 'Emotion Analysis — NRC Lexicon', title_radar: 'Emotional Profile — NRC Lexicon', title_polarity: 'Polarity — NRC Lexicon', ylab_frequency: 'Occurrence frequency'
  },
  es: {
    emotion_labels: { anger: 'Ira', anticipation: 'Anticipación', disgust: 'Asco', fear: 'Miedo', joy: 'Alegría', sadness: 'Tristeza', surprise: 'Sorpresa', trust: 'Confianza', positive: 'Positivo', negative: 'Negativo' },
    polarity_labels: { positive: 'Positivo', negative: 'Negativo' },
    title_emotions: 'Análisis de Emociones — Léxico NRC', title_radar: 'Perfil Emocional — Léxico NRC', title_polarity: 'Polaridad — Léxico NRC', ylab_frequency: 'Frecuencia de apariciones'
  }
}

/** R's write.csv (quoted, comma-separated) to the semicolon table the window previews. */
function rCsvToSemicolons(text: string): string {
  return text.split(/\r?\n/).filter(Boolean).map((line) => {
    const cells: string[] = []
    let cur = ''
    let quoted = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') { if (quoted && line[i + 1] === '"') { cur += '"'; i++ } else quoted = !quoted }
      else if (ch === ',' && !quoted) { cells.push(cur); cur = '' }
      else cur += ch
    }
    cells.push(cur)
    return cells.map((c) => c.replace(/;/g, ',')).join(';')
  }).join('\n') + '\n'
}

export async function runEmotions(ctx: TestContext): Promise<Omit<LexicalRunResult, 'ok' | 'corpus'>> {
  const text = await ctx.worker<CorpusText>({ type: 'corpus-text', key: ctx.key })
  writeFileSync(join(ctx.runDir, 'emotions_corpus_input.txt'), text.text, 'utf-8')
  writeFileSync(join(ctx.runDir, 'params.json'), JSON.stringify({ width: 1200, height: 900, nrc_language: NRC_LANGUAGE[ctx.language], ...LABELS[ctx.language] }), 'utf-8')

  ctx.progress({ stage: 'render' })
  const images = ['emotions_bar.png', 'emotions_radar.png', 'emotions_polarity.png']
  const run = await runRScript(ctx.r!, ctx.runId, {
    script: join(ctx.resourcesDir, 'R', 'emotions.R'),
    args: [join(ctx.runDir, 'params.json')],
    cwd: ctx.runDir,
    timeoutMs: 600_000,
    expectedOutputs: images.map((f) => join(ctx.runDir, f))
  })
  if (!run.ok) return { error: run.timedOut ? 'r-timeout' : run.cancelled ? 'cancelled' : 'r-failed', detail: (run.stderr || run.stdout).slice(-4000) }

  const files: LexicalFile[] = images.map((name) => ({ name, mime: 'image/png', role: 'image' as const, data: readFileSync(join(ctx.runDir, name)).toString('base64') }))
  const stats = join(ctx.runDir, 'emotions_stats.csv')
  if (existsSync(stats)) files.push({ name: 'emotions_stats.csv', mime: 'text/csv', role: 'table', title: 'Emotions', data: Buffer.from(rCsvToSemicolons(readFileSync(stats, 'utf-8')), 'utf-8').toString('base64') })
  for (const name of ['emotions_words.csv', 'emotions_words_summary.csv']) {
    const p = join(ctx.runDir, name)
    if (existsSync(p)) files.push({ name, mime: 'text/csv', role: 'data', data: readFileSync(p).toString('base64') })
  }
  return { files, summary: {} }
}
