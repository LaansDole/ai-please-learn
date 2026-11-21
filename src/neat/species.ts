import type { Rng } from '../core/rng';
import type { NeatConfig } from './config';
import type { Genome } from './genome';

export function distance(a: Genome, b: Genome, cfg: NeatConfig): number {
  const ca = a.conns, cb = b.conns;
  let i = 0, j = 0, matching = 0, disjoint = 0, wsum = 0;
  while (i < ca.length && j < cb.length) {
    const x = ca[i]!, y = cb[j]!;
    if (x.innov === y.innov) { matching++; wsum += Math.abs(x.weight - y.weight); i++; j++; }
    else if (x.innov < y.innov) { disjoint++; i++; }
    else { disjoint++; j++; }
  }
  const excess = ca.length - i + (cb.length - j);
  const larger = Math.max(ca.length, cb.length);
  const n = larger < cfg.smallGenomeN ? 1 : larger;
  return (cfg.c1 * excess) / n + (cfg.c2 * disjoint) / n + cfg.c3 * (matching ? wsum / matching : 0);
}

export interface Species { id: number; representative: Genome; members: Genome[]; bestFitness: number; staleness: number }

export class SpeciesSet {
  species: Species[] = [];
  threshold: number;
  private nextId = 1;
  constructor(cfg: NeatConfig) { this.threshold = cfg.compatThreshold; }

  speciate(genomes: Genome[], rng: Rng, cfg: NeatConfig): void {
    for (const s of this.species) { if (s.members.length) s.representative = rng.pick(s.members); s.members = []; }
    for (const g of genomes) {
      let home = this.species.find((s) => distance(g, s.representative, cfg) < this.threshold);
      if (!home) { home = { id: this.nextId++, representative: g, members: [], bestFitness: -Infinity, staleness: 0 }; this.species.push(home); }
      home.members.push(g); g.speciesId = home.id;
    }
    this.species = this.species.filter((s) => s.members.length > 0);
    for (const s of this.species) {
      const best = Math.max(...s.members.map((m) => m.fitness));
      if (best > s.bestFitness) { s.bestFitness = best; s.staleness = 0; } else s.staleness++;
    }
    if (this.species.length > cfg.targetSpecies) this.threshold += cfg.thresholdStep;
    else if (this.species.length < cfg.targetSpecies) this.threshold -= cfg.thresholdStep;
    this.threshold = Math.min(10, Math.max(cfg.thresholdMin, this.threshold));
  }
}
