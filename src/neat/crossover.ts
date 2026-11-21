import type { Rng } from '../core/rng';
import type { NeatConfig } from './config';
import type { Genome } from './genome';

/** `a` is the fitter parent. The child has exactly a's nodes and connections. */
export function crossover(a: Genome, b: Genome, childId: number, rng: Rng, cfg: NeatConfig): Genome {
  const bConns = new Map(b.conns.map((c) => [c.innov, c]));
  const bNodes = new Map(b.nodes.map((n) => [n.id, n]));
  const conns = a.conns.map((ca) => {
    const cb = bConns.get(ca.innov);
    const src = cb && rng.next() < 0.5 ? cb : ca;
    const eitherDisabled = !ca.enabled || (cb !== undefined && !cb.enabled);
    return { innov: ca.innov, from: ca.from, to: ca.to, weight: src.weight, enabled: eitherDisabled ? rng.next() >= cfg.pInheritDisabled : true };
  });
  const nodes = a.nodes.map((na) => {
    const nb = bNodes.get(na.id);
    return { ...na, bias: nb && rng.next() < 0.5 ? nb.bias : na.bias };
  });
  return { id: childId, nodes, conns, fitness: 0, speciesId: -1 };
}
