/**
 * A made-up Portuguese corpus for checking the lexical analyses on every
 * system the program is built for: twelve short interviews about three
 * themes (school, health care, the city), with accents, cedillas and
 * plurals, so text encoding and lemmatisation are exercised too.
 *
 * The texts come from a fixed seed, so every machine gets exactly the same
 * corpus and the results of two systems can be compared word for word.
 * Written here, not downloaded, so the check needs no outside files.
 */

/** Small deterministic generator (mulberry32). */
function random(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const THEMES = {
  escola: {
    subjects: ['A professora', 'O diretor da escola', 'A coordenação pedagógica', 'Os alunos do ensino médio', 'A merendeira', 'As famílias dos estudantes'],
    verbs: ['organizou', 'discutiu', 'criticou', 'defendeu', 'avaliou', 'acompanhou'],
    objects: ['o currículo da escola', 'as aulas de matemática', 'a merenda escolar', 'o reforço de leitura', 'as provas bimestrais', 'a formação dos professores', 'a biblioteca da escola', 'o projeto de redação'],
    tails: ['durante o semestre letivo', 'com muita dedicação', 'apesar da falta de recursos', 'nas reuniões de pais', 'junto com a secretaria de educação', 'para melhorar a aprendizagem']
  },
  saude: {
    subjects: ['A enfermeira', 'O médico da família', 'Os agentes comunitários de saúde', 'A equipe do posto', 'As gestantes do bairro', 'O farmacêutico'],
    verbs: ['atendeu', 'orientou', 'registrou', 'encaminhou', 'acompanhou', 'reclamou de'],
    objects: ['as consultas de pré-natal', 'a fila de espera do posto', 'a vacinação das crianças', 'os remédios da farmácia popular', 'o atendimento de urgência', 'as visitas domiciliares', 'os exames de sangue', 'a saúde mental dos pacientes'],
    tails: ['na unidade básica de saúde', 'com atenção e cuidado', 'mesmo sem médicos suficientes', 'ao longo da campanha', 'junto ao sistema único de saúde', 'para evitar internações']
  },
  cidade: {
    subjects: ['O prefeito', 'Os moradores da periferia', 'A associação de bairro', 'Os motoristas de ônibus', 'As comerciantes do centro', 'O conselho municipal'],
    verbs: ['debateu', 'cobrou', 'aprovou', 'denunciou', 'planejou', 'questionou'],
    objects: ['o transporte público', 'as ciclovias da avenida', 'a coleta de lixo', 'a iluminação das praças', 'os alagamentos no verão', 'o preço das passagens', 'as obras de saneamento', 'a segurança nas ruas'],
    tails: ['na audiência pública', 'com bastante preocupação', 'depois das chuvas fortes', 'em frente à câmara de vereadores', 'junto com os vizinhos', 'para melhorar a mobilidade urbana']
  }
}

const OPENINGS = ['Na minha opinião,', 'Eu acho que', 'Lembro que', 'Todo mundo sabe que', 'No ano passado,', 'Sinceramente,']

function sentence(theme, next) {
  const pick = (list) => list[Math.floor(next() * list.length)]
  const t = THEMES[theme]
  const opening = next() < 0.4 ? pick(OPENINGS) + ' ' : ''
  const subject = pick(t.subjects)
  const s = `${opening}${opening ? subject.charAt(0).toLowerCase() + subject.slice(1) : subject} ${pick(t.verbs)} ${pick(t.objects)} ${pick(t.tails)}.`
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** The twelve interviews: four per theme, each with a little of another theme. */
export function corpus() {
  const next = random(20260512)
  const themes = Object.keys(THEMES)
  const docs = []
  for (let i = 0; i < 12; i++) {
    const main = themes[i % 3]
    const other = themes[(i + 1) % 3]
    const paragraphs = []
    for (let p = 0; p < 6; p++) {
      const sentences = []
      for (let s = 0; s < 8; s++) sentences.push(sentence(next() < 0.85 ? main : other, next))
      paragraphs.push(sentences.join(' '))
    }
    const name = `Entrevista ${String(i + 1).padStart(2, '0')}.txt`
    docs.push({ name, theme: main, text: `Entrevista ${i + 1} | tema: ${main}\n\n${paragraphs.join('\n\n')}\n` })
  }
  return docs
}

// `node scripts/mac-check/corpus.mjs <folder>` writes the interviews as .txt files.
if (process.argv[1] && (await import('node:url')).pathToFileURL(process.argv[1]).href === import.meta.url) {
  const { mkdirSync, writeFileSync } = await import('node:fs')
  const { join } = await import('node:path')
  const dir = process.argv[2]
  if (!dir) {
    console.error('usage: corpus.mjs <folder>')
    process.exit(2)
  }
  mkdirSync(dir, { recursive: true })
  for (const d of corpus()) writeFileSync(join(dir, d.name), d.text, 'utf8')
  console.log(`${corpus().length} interviews written to ${dir}`)
}
