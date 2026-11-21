import type { Rng } from '../core/rng';
import type { NeatConfig } from './config';
import { crossover } from './crossover';
import { cloneGenome, createInitialGenome, type Activation, type Genome } from './genome';
import { InnovationTracker } from './innovation';
import { mutate } from './mutation';
import { SpeciesSet } from './species';

export interface SpeciesSummary { id: number; size: number; best: number }

/** Largest-remainder apportionment with a minimum of 1 per entry. */
export function allocate(weights: number[], total: number): number[] {
  const n = weights.length;
  const sum = weights.reduce((a, b) => a + b, 0);
  const shares = weights.map((w) => (sum > 0 ? (w / sum) * total : total / n));
  const q = shares.map((s) => Math.max(1, Math.floor(s)));
  let left = total - q.reduce((a, b) => a + b, 0);
  const byFrac = shares.map((s, i) => ({ i, f: s - Math.floor(s) })).sort((x, y) => y.f - x.f || x.i - y.i);
  for (let k = 0; left > 0; k = (k + 1) % n, left--) q[byFrac[k]!.i]!++;
  while (left < 0) { let m = 0; for (let i = 1; i < n; i++) if (q[i]! > q[m]!) m = i; q[m]!--; left++; }
  return q;
}

export class Population {
  genomes: Genome[];
  generation = 0;
  readonly innov: InnovationTracker;
  readonly speciesSet: SpeciesSet;
  private nextId = 1;
  constructor(nIn: number, nOut: number, outAct: Activation, private cfg: NeatConfig, private rng: Rng) {
    this.innov = new InnovationTracker(nIn, nOut);
    this.speciesSet = new SpeciesSet(cfg);
    this.genomes = Array.from({ length: cfg.populationSize }, () => createInitialGenome(this.nextId++, nIn, nOut, outAct, rng, cfg));
  }

  /** Highest finite fitness; a genome whose fitness is NaN or infinite never wins. */
  best(): Genome { return this.genomes.reduce((a, b) => (Number.isFinite(b.fitness) && (!Number.isFinite(a.fitness) || b.fitness > a.fitness) ? b : a)); }

  epoch(): SpeciesSummary[] {
    const { cfg, rng } = this;
    // A broken evaluation ranks last instead of corrupting the comparisons, sorts and shares below.
    for (const g of this.genomes) if (!Number.isFinite(g.fitness)) g.fitness = -Number.MAX_VALUE;
    const champion = this.best();
    this.speciesSet.speciate(this.genomes, rng, cfg);
    const summary = this.speciesSet.species.map((s) => ({ id: s.id, size: s.members.length, best: Math.max(...s.members.map((m) => m.fitness)) }));

    const ranked = [...this.speciesSet.species].sort((a, b) => b.bestFitness - a.bestFitness);
    const safe = new Set(ranked.slice(0, cfg.protectedSpecies).map((s) => s.id));
    const alive = this.speciesSet.species.filter((s) => s.staleness < cfg.stagnationGens || safe.has(s.id));
    this.speciesSet.species = alive;

    // fmin is over real fitnesses: measured from -MAX_VALUE every share would overflow. Broken genomes share like the worst real one.
    let fmin = Infinity;
    for (const g of this.genomes) if (g.fitness > -Number.MAX_VALUE && g.fitness < fmin) fmin = g.fitness;
    const share = alive.map((s) => s.members.reduce((acc, g) => acc + (Math.max(0, g.fitness - fmin) + 1e-6), 0) / s.members.length);
    const quota = allocate(share, cfg.populationSize);

    const next: Genome[] = [cloneGenome(champion, this.nextId++)];      // global elite at index 0
    alive.forEach((s, si) => {
      const sorted = [...s.members].sort((a, b) => b.fitness - a.fitness || a.conns.length - b.conns.length || a.id - b.id);
      let n = quota[si]!;
      if (sorted[0] === champion) n--;                                   // already copied
      else if (sorted.length >= cfg.elitismMinSpecies && n > 0) { next.push(cloneGenome(sorted[0]!, this.nextId++)); n--; }
      const parents = sorted.slice(0, Math.max(1, Math.ceil(sorted.length * cfg.survivalRate)));
      for (let k = 0; k < n; k++) {
        const p1 = rng.pick(parents);
        let child: Genome;
        if (rng.next() < cfg.crossoverProb) {
          const pool = rng.next() < cfg.interspeciesProb && alive.length > 1 ? rng.pick(alive).members : parents;
          const p2 = rng.pick(pool);
          const [fit, other] = p1.fitness > p2.fitness || (p1.fitness === p2.fitness && p1.id <= p2.id) ? [p1, p2] : [p2, p1];
          child = crossover(fit, other, this.nextId++, rng, cfg);
        } else child = cloneGenome(p1, this.nextId++);
        mutate(child, rng, cfg, this.innov);
        next.push(child);
      }
    });
    while (next.length > cfg.populationSize) next.pop();                 // champion's species had quota 0 edge case
    while (next.length < cfg.populationSize) { const c = cloneGenome(champion, this.nextId++); mutate(c, rng, cfg, this.innov); next.push(c); }
    this.genomes = next;
    this.generation++;
    return summary;
  }
}
