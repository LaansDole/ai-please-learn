import type { Genome } from './genome';

export interface Network {
  nIn: number; nOut: number; depths: Int32Array; maxDepth: number; values: Float32Array;
  activate(obs: Float32Array): Float32Array;
}

export function compile(g: Genome): Network {
  const n = g.nodes.length;
  const index = new Map<number, number>();
  g.nodes.forEach((nd, i) => index.set(nd.id, i));
  const nIn = g.nodes.filter((x) => x.type === 'input').length;
  const nOut = g.nodes.filter((x) => x.type === 'output').length;
  const incoming: { from: number; w: number }[][] = Array.from({ length: n }, () => []);
  const outgoing: number[][] = Array.from({ length: n }, () => []);
  const indeg = new Int32Array(n);
  for (const c of g.conns) {
    if (!c.enabled) continue;
    const f = index.get(c.from)!, t = index.get(c.to)!;
    incoming[t]!.push({ from: f, w: c.weight }); outgoing[f]!.push(t); indeg[t]!++;
  }
  const depths = new Int32Array(n);
  for (let i = 0; i < n; i++) depths[i] = g.nodes[i]!.type === 'input' ? 0 : 1;
  const order: number[] = [];
  const queue: number[] = [];
  for (let i = 0; i < n; i++) if (indeg[i] === 0) queue.push(i);
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!; order.push(i);
    for (const t of outgoing[i]!) {
      if (depths[i]! + 1 > depths[t]!) depths[t] = depths[i]! + 1;
      if (--indeg[t]! === 0) queue.push(t);
    }
  }
  if (order.length !== n) throw new Error('genome has a cycle');
  let maxHidden = 0;
  for (let i = 0; i < n; i++) if (g.nodes[i]!.type === 'hidden' && depths[i]! > maxHidden) maxHidden = depths[i]!;
  const maxDepth = maxHidden + 1;
  for (let i = 0; i < n; i++) if (g.nodes[i]!.type === 'output') depths[i] = maxDepth;

  // flatten: evaluation order without inputs
  const evalIdx = order.filter((i) => g.nodes[i]!.type !== 'input');
  const start = new Int32Array(evalIdx.length + 1);
  const from: number[] = []; const w: number[] = [];
  evalIdx.forEach((i, k) => { for (const e of incoming[i]!) { from.push(e.from); w.push(e.w); } start[k + 1] = from.length; });
  const fromA = Int32Array.from(from), wA = Float32Array.from(w);
  const bias = Float32Array.from(evalIdx.map((i) => g.nodes[i]!.bias));
  const isTanh = evalIdx.map((i) => g.nodes[i]!.act === 'tanh');
  const values = new Float32Array(n);
  const out = values.subarray(nIn, nIn + nOut);
  return {
    nIn, nOut, depths, maxDepth, values,
    activate(obs) {
      for (let i = 0; i < nIn; i++) values[i] = obs[i]!;
      for (let k = 0; k < evalIdx.length; k++) {
        let s = bias[k]!;
        for (let e = start[k]!; e < start[k + 1]!; e++) s += wA[e]! * values[fromA[e]!]!;
        values[evalIdx[k]!] = isTanh[k] ? Math.tanh(s) : s;
      }
      return out;
    },
  };
}
