/**
 * python-louvain's best_partition (Blondel et al., 2008) and modularity, as
 * labiia_lex runs them: the same steps and the same random order (numpy's
 * RandomState with the same seed), so the same network gives the same
 * communities. Shared by the text network's analysis (in the helper) and the
 * window, where the researcher recomputes communities at another resolution
 * or edits them.
 */
import { Graph } from '../../helper/lexical/analyses/graph'
import { RandomState } from '../../helper/lexical/plot/random'

/** numpy RandomState.shuffle: Fisher–Yates with masked rejection sampling. */
class NumpyShuffle extends RandomState {
  private interval(max: number): number {
    if (max === 0) return 0
    let mask = max
    mask |= mask >>> 1; mask |= mask >>> 2; mask |= mask >>> 4; mask |= mask >>> 8; mask |= mask >>> 16
    mask >>>= 0
    let value: number
    do value = (this.nextUint32() & mask) >>> 0
    while (value > max)
    return value
  }

  shuffle<T>(x: T[]): T[] {
    for (let i = x.length - 1; i > 0; i--) {
      const j = this.interval(i)
      const t = x[i]; x[i] = x[j]; x[j] = t
    }
    return x
  }
}

type Node = string | number
const MIN_GAIN = 0.0000001

function graphSize(g: Graph<Node>): number {
  let s = 0
  for (const [, , d] of g.edges()) s += d.weight
  return s
}

class Status {
  node2com = new Map<Node, number>()
  degrees = new Map<number, number>()
  gdegrees = new Map<Node, number>()
  internals = new Map<number, number>()
  loops = new Map<Node, number>()
  totalWeight = 0

  init(g: Graph<Node>): void {
    this.node2com = new Map()
    this.degrees = new Map()
    this.gdegrees = new Map()
    this.internals = new Map()
    this.totalWeight = graphSize(g)
    let count = 0
    for (const node of g.nodes()) {
      this.node2com.set(node, count)
      const deg = g.degree(node)
      this.degrees.set(count, deg)
      this.gdegrees.set(node, deg)
      const loop = g.adj.get(node)!.get(node)?.weight ?? 0
      this.loops.set(node, loop)
      this.internals.set(count, loop)
      count++
    }
  }

  modularity(resolution: number): number {
    const links = this.totalWeight
    let result = 0
    for (const com of [...new Set(this.node2com.values())].sort((a, b) => a - b)) {
      const inDegree = this.internals.get(com) ?? 0
      const degree = this.degrees.get(com) ?? 0
      if (links > 0) result += (inDegree * resolution) / links - (degree / (2 * links)) ** 2
    }
    return result
  }

  remove(node: Node, com: number, weight: number): void {
    this.degrees.set(com, (this.degrees.get(com) ?? 0) - (this.gdegrees.get(node) ?? 0))
    this.internals.set(com, (this.internals.get(com) ?? 0) - weight - (this.loops.get(node) ?? 0))
    this.node2com.set(node, -1)
  }

  insert(node: Node, com: number, weight: number): void {
    this.node2com.set(node, com)
    this.degrees.set(com, (this.degrees.get(com) ?? 0) + (this.gdegrees.get(node) ?? 0))
    this.internals.set(com, (this.internals.get(com) ?? 0) + weight + (this.loops.get(node) ?? 0))
  }
}

function oneLevel(g: Graph<Node>, status: Status, resolution: number, rs: NumpyShuffle): void {
  let modified = true
  let newMod = status.modularity(resolution)
  while (modified) {
    const curMod = newMod
    modified = false
    for (const node of rs.shuffle(g.nodes())) {
      const comNode = status.node2com.get(node)!
      const degcTotw = (status.gdegrees.get(node) ?? 0) / (status.totalWeight * 2)
      const neigh = new Map<number, number>()
      for (const [nb, d] of g.adj.get(node)!) {
        if (nb === node) continue
        const c = status.node2com.get(nb)!
        neigh.set(c, (neigh.get(c) ?? 0) + d.weight)
      }
      const removeCost = -(neigh.get(comNode) ?? 0) + resolution * ((status.degrees.get(comNode) ?? 0) - (status.gdegrees.get(node) ?? 0)) * degcTotw
      status.remove(node, comNode, neigh.get(comNode) ?? 0)
      let bestCom = comNode
      let bestIncrease = 0
      for (const [com, dnc] of rs.shuffle([...neigh.entries()])) {
        const incr = removeCost + dnc - resolution * (status.degrees.get(com) ?? 0) * degcTotw
        if (incr > bestIncrease) { bestIncrease = incr; bestCom = com }
      }
      status.insert(node, bestCom, neigh.get(bestCom) ?? 0)
      if (bestCom !== comNode) modified = true
    }
    newMod = status.modularity(resolution)
    if (newMod - curMod < MIN_GAIN) break
  }
}

/** Community labels 0..k-1 (which label each gets does not change the partition). */
function renumber(node2com: Map<Node, number>): Map<Node, number> {
  const labels = new Map<number, number>()
  const out = new Map<Node, number>()
  for (const [node, com] of node2com) {
    if (!labels.has(com)) labels.set(com, labels.size)
    out.set(node, labels.get(com)!)
  }
  return out
}

function inducedGraph(partition: Map<Node, number>, g: Graph<Node>): Graph<Node> {
  const ret = new Graph<Node>()
  for (const com of partition.values()) ret.addNode(com)
  for (const [u, v, d] of g.edges()) {
    const c1 = partition.get(u)!, c2 = partition.get(v)!
    const prev = ret.adj.get(c1)!.get(c2)?.weight ?? 0
    ret.addEdge(c1, c2, { weight: prev + d.weight })
  }
  return ret
}

export function bestPartition(g: Graph<string>, resolution = 1, seed = 42): Map<string, number> {
  const rs = new NumpyShuffle(seed)
  if (g.edgeCount() === 0) return new Map(g.nodes().map((u, i) => [u, i]))
  const levels: Map<Node, number>[] = []
  let current = g as unknown as Graph<Node>
  const status = new Status()
  status.init(current)
  oneLevel(current, status, resolution, rs)
  let mod = status.modularity(resolution)
  let partition = renumber(status.node2com)
  levels.push(partition)
  current = inducedGraph(partition, current)
  status.init(current)
  for (;;) {
    oneLevel(current, status, resolution, rs)
    const newMod = status.modularity(resolution)
    if (newMod - mod < MIN_GAIN) break
    partition = renumber(status.node2com)
    levels.push(partition)
    mod = newMod
    current = inducedGraph(partition, current)
    status.init(current)
  }
  const out = new Map<string, number>()
  for (const [node, com] of levels[0]) {
    let c = com
    for (let l = 1; l < levels.length; l++) c = levels[l].get(c)!
    out.set(node as string, c)
  }
  return out
}

/** Newman's modularity of a partition (python-louvain's modularity). */
export function modularity(g: Graph<string>, partition: Map<string, number>): number {
  const links = graphSize(g as unknown as Graph<Node>)
  if (links === 0) return 0
  const inc = new Map<number, number>()
  const deg = new Map<number, number>()
  for (const u of g.nodes()) {
    const com = partition.get(u)!
    deg.set(com, (deg.get(com) ?? 0) + g.degree(u))
    for (const [v, d] of g.adj.get(u)!) {
      if (partition.get(v) !== com) continue
      inc.set(com, (inc.get(com) ?? 0) + (v === u ? d.weight : d.weight / 2))
    }
  }
  let res = 0
  for (const com of [...new Set(partition.values())].sort((a, b) => a - b)) res += (inc.get(com) ?? 0) / links - ((deg.get(com) ?? 0) / (2 * links)) ** 2
  return res
}

