/**
 * Artwork for the right half of the Welcome screen: a word network drawn the
 * way the Similitude analysis draws one in halo mode. Each community of
 * related words sits in a soft halo of its colour around a central word;
 * edges take the colour of the community they lead into, the two edges that
 * bridge communities are neutral and dashed; the main words carry a ring. The colours are the ribbon's families
 * (sources, coding, queries, lexical, affect), so the first screen already
 * speaks the program's visual language. Drawn as SVG from theme tokens, it
 * stays sharp at any size and follows the light or dark theme.
 */
import { t } from '../../i18n'

type Family = 'sources' | 'coding' | 'query' | 'lexical' | 'affect'
/** 'core' is the central word, outside every halo. */
type Community = Family | 'core'

interface WordNode {
  id: string
  /** English key, translated when drawn. */
  label: string
  x: number
  y: number
  r: number
  community: Community
  /** Colour of the node itself; defaults to its community's. */
  family?: Family
}

const NODES: WordNode[] = [
  { id: 'analysis', label: 'analysis', x: 182, y: 262, r: 21, community: 'core', family: 'sources' },
  { id: 'text', label: 'text', x: 268, y: 170, r: 14, community: 'sources' },
  { id: 'interview', label: 'interview', x: 226, y: 96, r: 7, community: 'sources' },
  { id: 'source', label: 'source', x: 318, y: 108, r: 6, community: 'sources' },
  { id: 'code', label: 'code', x: 92, y: 168, r: 14, community: 'coding' },
  { id: 'category', label: 'category', x: 48, y: 100, r: 8, community: 'coding' },
  { id: 'memo', label: 'memo', x: 138, y: 92, r: 6, community: 'coding' },
  { id: 'word', label: 'word', x: 96, y: 366, r: 14, community: 'lexical' },
  { id: 'corpus', label: 'corpus', x: 46, y: 436, r: 8, community: 'lexical' },
  { id: 'frequency', label: 'frequency', x: 150, y: 446, r: 6, community: 'lexical' },
  { id: 'theme', label: 'theme', x: 270, y: 352, r: 13, community: 'query' },
  { id: 'speech', label: 'speech', x: 232, y: 438, r: 6, community: 'query' },
  { id: 'meaning', label: 'meaning', x: 316, y: 430, r: 8, community: 'query', family: 'affect' }
]

// [from, to, strength 1–3]: stronger co-occurrence draws a thicker edge.
const EDGES: [string, string, number][] = [
  ['analysis', 'text', 3], ['analysis', 'code', 3], ['analysis', 'word', 2], ['analysis', 'theme', 3],
  ['text', 'interview', 2], ['text', 'source', 1],
  ['code', 'category', 2], ['code', 'memo', 1],
  ['word', 'corpus', 2], ['word', 'frequency', 1],
  ['theme', 'speech', 1], ['theme', 'meaning', 2],
  ['code', 'text', 1], ['word', 'theme', 1]
]

const byId = new Map(NODES.map((n) => [n.id, n]))

/** A gentle curve: the control point sits off the middle of the edge. */
function curve(a: WordNode, b: WordNode): string {
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2
  const dx = b.x - a.x
  const dy = b.y - a.y
  const bend = 0.12
  return `M${a.x},${a.y} Q${mx - dy * bend},${my + dx * bend} ${b.x},${b.y}`
}

/** The halo of a community: a circle around its words, with room for labels. */
function halo(community: Family): { cx: number; cy: number; r: number } {
  const members = NODES.filter((n) => n.community === community)
  const cx = members.reduce((s, n) => s + n.x, 0) / members.length
  const cy = members.reduce((s, n) => s + n.y, 0) / members.length + 5
  const r = Math.max(...members.map((n) => Math.hypot(n.x - cx, n.y - cy) + n.r)) + 16
  return { cx, cy, r }
}

const COMMUNITIES: Family[] = ['sources', 'coding', 'lexical', 'query']

export function WelcomeArt(): JSX.Element {
  return (
    <svg
      className="welcome-art"
      viewBox="0 0 360 520"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={t("A network of related words, as drawn by the Similitude analysis")}
    >
      <defs>
        <pattern id="welcome-art-dots" width="16" height="16" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="1" className="welcome-art-dot" />
        </pattern>
      </defs>
      <rect width="360" height="520" className="welcome-art-bg" />
      <rect width="360" height="520" fill="url(#welcome-art-dots)" />

      {COMMUNITIES.map((c) => {
        const h = halo(c)
        return <circle key={c} data-family={c} cx={h.cx} cy={h.cy} r={h.r} className="welcome-art-halo" />
      })}

      <g fill="none" strokeLinecap="round">
        {EDGES.map(([a, b, w]) => {
          const p = byId.get(a)!
          const q = byId.get(b)!
          // An edge from the central word takes the colour of the community it leads to.
          const into = p.community === 'core' ? q.community : q.community === 'core' ? p.community : p.community === q.community ? p.community : null
          return (
            <path
              key={`${a}-${b}`}
              d={curve(p, q)}
              data-family={into ?? undefined}
              className={into ? 'welcome-art-edge' : 'welcome-art-edge welcome-art-bridge'}
              strokeWidth={into ? 0.8 + w * 0.9 : 1.2}
            />
          )
        })}
      </g>

      {NODES.map((n) => {
        const main = n.r >= 13
        return (
          <g key={n.id} data-family={n.family ?? (n.community as Family)}>
            {main && <circle cx={n.x} cy={n.y} r={n.r + 6} className="welcome-art-ring" />}
            <circle cx={n.x} cy={n.y} r={n.r} className="welcome-art-node" />
            {main && <circle cx={n.x - n.r * 0.32} cy={n.y - n.r * 0.36} r={n.r * 0.28} className="welcome-art-shine" />}
            <text
              x={n.x}
              y={n.y + n.r + (main ? 19 : 13)}
              textAnchor="middle"
              className={main ? 'welcome-art-label welcome-art-label-main' : 'welcome-art-label'}
            >
              {t(n.label)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
