/**
 * Artwork for the right half of the Welcome screen: a word network in the
 * style of the Similitude analysis. Nodes take the ribbon's family colours
 * (sources, coding, queries, lexical, affect), so the first screen already
 * speaks the program's visual language. Drawn as SVG from theme tokens, it
 * stays sharp at any size and follows the light or dark theme.
 */
import { t } from '../../i18n'

type Family = 'sources' | 'coding' | 'query' | 'lexical' | 'affect'

interface WordNode { id: string; /** English key, translated when drawn. */ label: string; x: number; y: number; r: number; family: Family }

const NODES: WordNode[] = [
  { id: 'analysis', label: 'analysis', x: 180, y: 258, r: 22, family: 'sources' },
  { id: 'code', label: 'code', x: 98, y: 160, r: 15, family: 'coding' },
  { id: 'category', label: 'category', x: 56, y: 92, r: 8, family: 'coding' },
  { id: 'memo', label: 'memo', x: 150, y: 88, r: 6, family: 'coding' },
  { id: 'text', label: 'text', x: 272, y: 168, r: 15, family: 'sources' },
  { id: 'interview', label: 'interview', x: 236, y: 92, r: 8, family: 'sources' },
  { id: 'source', label: 'source', x: 316, y: 104, r: 7, family: 'sources' },
  { id: 'word', label: 'word', x: 92, y: 362, r: 15, family: 'lexical' },
  { id: 'corpus', label: 'corpus', x: 46, y: 440, r: 8, family: 'lexical' },
  { id: 'frequency', label: 'frequency', x: 146, y: 448, r: 6, family: 'lexical' },
  { id: 'theme', label: 'theme', x: 272, y: 352, r: 14, family: 'query' },
  { id: 'speech', label: 'speech', x: 232, y: 440, r: 6, family: 'query' },
  { id: 'meaning', label: 'meaning', x: 318, y: 428, r: 9, family: 'affect' }
]

// [from, to, strength 1–3]: stronger co-occurrence draws a thicker edge.
const EDGES: [string, string, number][] = [
  ['analysis', 'code', 3], ['analysis', 'text', 3], ['analysis', 'word', 2], ['analysis', 'theme', 3],
  ['code', 'category', 2], ['code', 'memo', 1], ['code', 'text', 1],
  ['text', 'interview', 2], ['text', 'source', 1],
  ['word', 'corpus', 2], ['word', 'frequency', 1], ['word', 'theme', 1],
  ['theme', 'speech', 1], ['theme', 'meaning', 2]
]

export function WelcomeArt(): JSX.Element {
  const byId = new Map(NODES.map((n) => [n.id, n]))
  return (
    <svg
      className="welcome-art"
      viewBox="0 0 360 520"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={t("A network of related words, as drawn by the Similitude analysis")}
    >
      <rect width="360" height="520" className="welcome-art-bg" />
      <g className="welcome-art-edges">
        {EDGES.map(([a, b, w]) => {
          const p = byId.get(a)!
          const q = byId.get(b)!
          return <line key={`${a}-${b}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} strokeWidth={w * 1.2} />
        })}
      </g>
      {NODES.map((n) => (
        <g key={n.id} data-family={n.family}>
          <circle cx={n.x} cy={n.y} r={n.r} className="welcome-art-node" />
          <text
            x={n.x}
            y={n.y + n.r + 14}
            textAnchor="middle"
            className={n.r >= 14 ? 'welcome-art-label welcome-art-label-main' : 'welcome-art-label'}
          >
            {t(n.label)}
          </text>
        </g>
      ))}
    </svg>
  )
}
