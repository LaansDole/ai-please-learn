import { describe, expect, it } from 'vitest';
import { Rng } from '../core/rng';
import { DEFAULT_NEAT } from './config';
import { hiddenCount } from './genome';
import { compile } from './network';
import { Population, allocate } from './population';

const XOR: [number, number, number][] = [[0, 0, 0], [0, 1, 1], [1, 0, 1], [1, 1, 0]];
function xorFitness(net: ReturnType<typeof compile>): number {
  let err = 0; const x = new Float32Array(2);
  for (const [a, b, y] of XOR) { x[0] = a; x[1] = b; const o = (net.activate(x)[0]! + 1) / 2; err += (o - y) ** 2; }
  return 4 - err;
}

describe('population', () => {
  it('allocate sums to total, gives every species at least 1, is proportional', () => {
    expect(allocate([1, 1, 2], 8)).toEqual([2, 2, 4]);
    const q = allocate([0.001, 5, 5, 0.001], 10);
    expect(q.reduce((a, b) => a + b, 0)).toBe(10); expect(Math.min(...q)).toBeGreaterThanOrEqual(1);
    expect(allocate([0, 0], 5).reduce((a, b) => a + b, 0)).toBe(5);
  });
  it('epoch keeps population size, puts the champion elite at index 0, handles negative fitness', () => {
    const pop = new Population(3, 2, 'tanh', { ...DEFAULT_NEAT, populationSize: 40 }, new Rng(3));
    for (let gen = 0; gen < 5; gen++) {
      pop.genomes.forEach((g, i) => { g.fitness = -100 + i; });
      const champ = pop.best();
      const summary = pop.epoch();
      expect(pop.genomes.length).toBe(40);
      expect(summary.reduce((a, s) => a + s.size, 0)).toBe(40);
      expect(pop.genomes[0]!.conns).toEqual(champ.conns);
    }
    expect(pop.generation).toBe(5);
  });
  it('solves XOR on at least 2 of 3 seeds and grows a hidden node', () => {
    let solved = 0;
    for (const seed of [1, 2, 3]) {
      const pop = new Population(2, 1, 'tanh', DEFAULT_NEAT, new Rng(seed));
      for (let gen = 0; gen < 150; gen++) {
        for (const g of pop.genomes) g.fitness = xorFitness(compile(g));
        const best = pop.best();
        if (best.fitness >= 3.6) { if (hiddenCount(best) >= 1) solved++; break; }
        pop.epoch();
      }
    }
    expect(solved).toBeGreaterThanOrEqual(2);
  });
  it('B1: non-finite fitness never wins: the elite is the best finite genome and the population stays whole', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      const pop = new Population(3, 2, 'tanh', { ...DEFAULT_NEAT, populationSize: 40 }, new Rng(3));
      for (let gen = 0; gen < 5; gen++) {
        pop.genomes.forEach((g, i) => { g.fitness = i % 7 === 0 ? bad : i; });   // index 0 is non-finite
        const champ = pop.best();
        expect(champ.fitness, String(bad)).toBe(39);
        const summary = pop.epoch();
        expect(pop.genomes.length).toBe(40);
        expect(summary.every((s) => Number.isFinite(s.best) && Number.isInteger(s.size))).toBe(true);
        expect(summary.reduce((a, s) => a + s.size, 0)).toBe(40);
        expect(pop.genomes[0]!.conns).toEqual(champ.conns);
      }
    }
  });
});
