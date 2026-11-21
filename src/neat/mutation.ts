import type { Rng } from '../core/rng';
import type { NeatConfig } from './config';
import { hiddenCount, type Genome } from './genome';
import type { InnovationTracker } from './innovation';

const clampW = (v: number, c: number) => (v > c ? c : v < -c ? -c : v);
const sortConns = (g: Genome) => g.conns.sort((x, y) => x.innov - y.innov);

/** True if `goal` is reachable from `start` following all connections (enabled or not). */
export function reaches(g: Genome, start: number, goal: number): boolean {
  const adj = new Map<number, number[]>();
  for (const c of g.conns) { const l = adj.get(c.from); if (l) l.push(c.to); else adj.set(c.from, [c.to]); }
  const stack = [start]; const seen = new Set<number>();
  while (stack.length) {
    const n = stack.pop()!;
    if (n === goal) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const t of adj.get(n) ?? []) stack.push(t);
  }
  return false;
}

export function addConnection(g: Genome, rng: Rng, cfg: NeatConfig, innov: InnovationTracker): boolean {
  const sources = g.nodes.filter((n) => n.type !== 'output');
  const targets = g.nodes.filter((n) => n.type !== 'input');
  for (let i = 0; i < cfg.addConnTries; i++) {
    const from = rng.pick(sources).id, to = rng.pick(targets).id;
    if (from === to) continue;
    const existing = g.conns.find((c) => c.from === from && c.to === to);
    if (existing) { if (!existing.enabled) { existing.enabled = true; return true; } continue; }
    if (reaches(g, to, from)) continue;                       // would create a cycle
    g.conns.push({ innov: innov.conn(from, to), from, to, weight: rng.gaussian() * cfg.weightInitSigma, enabled: true });
    sortConns(g);
    return true;
  }
  return false;
}

export function addNode(g: Genome, rng: Rng, cfg: NeatConfig, innov: InnovationTracker): boolean {
  if (hiddenCount(g) >= cfg.maxHidden) return false;
  const enabled = g.conns.filter((c) => c.enabled);
  if (enabled.length === 0) return false;
  const c = rng.pick(enabled);
  const id = innov.split(c.innov, g);
  c.enabled = false;
  g.nodes.push({ id, type: 'hidden', bias: 0, act: 'tanh' });
  g.conns.push({ innov: innov.conn(c.from, id), from: c.from, to: id, weight: 1, enabled: true });
  g.conns.push({ innov: innov.conn(id, c.to), from: id, to: c.to, weight: c.weight, enabled: true });
  sortConns(g);
  return true;
}

export function mutate(g: Genome, rng: Rng, cfg: NeatConfig, innov: InnovationTracker): void {
  if (rng.next() < cfg.pWeightMutate) {
    for (const c of g.conns) {
      c.weight = rng.next() < cfg.pWeightReplace
        ? rng.gaussian() * cfg.weightInitSigma
        : clampW(c.weight + rng.gaussian() * cfg.weightSigma, cfg.weightClamp);
      c.weight = clampW(c.weight, cfg.weightClamp);
    }
  }
  if (rng.next() < cfg.pBiasMutate) {
    for (const n of g.nodes) if (n.type !== 'input') n.bias = clampW(n.bias + rng.gaussian() * cfg.biasSigma, cfg.weightClamp);
  }
  if (rng.next() < cfg.pToggle && g.conns.length > 0) { const c = rng.pick(g.conns); c.enabled = !c.enabled; }
  if (rng.next() < cfg.pAddConn) addConnection(g, rng, cfg, innov);
  if (rng.next() < cfg.pAddNode) addNode(g, rng, cfg, innov);
}
