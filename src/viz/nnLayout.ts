import type { EnvSpecMsg } from '../env/types';
import type { NetworkSnapshot } from '../learner/types';

export interface Pad { l: number; r: number; t: number; b: number }
export interface Point { x: number; y: number }
export interface SnapshotDiff { addedNodes: number[]; removedNodes: number[]; addedEdges: string[]; removedEdges: string[] }
type Edge = NetworkSnapshot['edges'][number];

export const edgeKey = (e: { from: number; to: number }): string => `${e.from}>${e.to}`;

/** x by depth (inputs left, outputs right); y evenly spaced within a layer, ordered by node id. */
export function layoutNetwork(net: NetworkSnapshot, w: number, h: number, pad: Pad = { l: 110, r: 90, t: 16, b: 16 }): Map<number, Point> {
  const layers = new Map<number, number[]>();
  for (const n of net.nodes) { const l = layers.get(n.depth) ?? []; layers.set(n.depth, l); l.push(n.id); }
  const out = new Map<number, Point>();
  for (const [depth, ids] of layers) {
    ids.sort((a, b) => a - b);
    const x = pad.l + (net.maxDepth > 0 ? depth / net.maxDepth : 0.5) * (w - pad.l - pad.r);
    ids.forEach((id, i) => out.set(id, { x, y: pad.t + ((i + 0.5) * (h - pad.t - pad.b)) / ids.length }));
  }
  return out;
}

/** Enabled edges only. With no previous snapshot nothing counts as added. */
export function diffSnapshots(prev: NetworkSnapshot | null, next: NetworkSnapshot): SnapshotDiff {
  if (!prev) return { addedNodes: [], removedNodes: [], addedEdges: [], removedEdges: [] };
  const keys = (n: NetworkSnapshot) => n.edges.filter((e) => e.enabled).map(edgeKey);
  const pn = new Set(prev.nodes.map((n) => n.id)), nn = new Set(next.nodes.map((n) => n.id));
  const pe = keys(prev), ne = keys(next), pes = new Set(pe), nes = new Set(ne);
  return {
    addedNodes: [...nn].filter((id) => !pn.has(id)), removedNodes: [...pn].filter((id) => !nn.has(id)),
    addedEdges: ne.filter((k) => !pes.has(k)), removedEdges: pe.filter((k) => !nes.has(k)),
  };
}

/** Sign is carried by the dash as well as the colour. */
export function edgeStyle(weight: number): { width: number; alpha: number; dashed: boolean } {
  const m = Math.abs(weight);
  return { width: 1 + 3 * Math.min(1, m / 4), alpha: 0.25 + 0.6 * Math.min(1, m / 2), dashed: weight < 0 };
}

/** Per pair of layers keeps the `cap` edges with the largest |weight| (wide MLP layers would otherwise be a solid block). */
export function visibleEdges(net: NetworkSnapshot, cap = 400): Edge[] {
  const depth = new Map(net.nodes.map((n) => [n.id, n.depth]));
  const groups = new Map<string, Edge[]>();
  for (const e of net.edges) { const k = `${depth.get(e.from)}>${depth.get(e.to)}`; const g = groups.get(k) ?? []; groups.set(k, g); g.push(e); }
  if ([...groups.values()].every((g) => g.length <= cap)) return net.edges;
  const keep = new Set<Edge>();
  for (const g of groups.values()) for (const e of [...g].sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)).slice(0, cap)) keep.add(e);
  return net.edges.filter((e) => keep.has(e));
}

/** What NEAT starts from: every input wired to every output. Shown before any training. */
export function initialNeatSnapshot(spec: Pick<EnvSpecMsg, 'observation' | 'action'>): NetworkSnapshot {
  const ins = spec.observation.labels, outs = spec.action.type === 'candidates' ? [spec.action.scoreLabel] : spec.action.labels;
  return {
    maxDepth: 1,
    nodes: [
      ...ins.map((label, i) => ({ id: i, type: 'input' as const, depth: 0, label })),
      ...outs.map((label, o) => ({ id: ins.length + o, type: 'output' as const, depth: 1, label })),
    ],
    edges: ins.flatMap((_, i) => outs.map((_, o) => ({ from: i, to: ins.length + o, weight: 0.5, enabled: true }))),
  };
}
