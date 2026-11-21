import { describe, expect, it } from 'vitest';
import { Rng } from '../core/rng';
import { DEFAULT_NEAT } from './config';
import type { Genome } from './genome';
import { SpeciesSet, distance } from './species';

/** Genome with only the connection genes that matter to `distance`. */
const withConns = (id: number, genes: [innov: number, weight: number][]): Genome => ({
  id, fitness: 0, speciesId: -1, nodes: [],
  conns: genes.map(([innov, weight]) => ({ innov, from: 0, to: 1, weight, enabled: true })),
});

const A = withConns(1, [[0, 1], [1, 1], [2, 0], [5, 0]]);
const B = withConns(2, [[0, 1.5], [1, -0.5], [3, 0], [4, 0], [6, 0], [7, 0]]);

describe('species', () => {
  it('distance = c1*E/N + c2*D/N + c3*Wbar with N = 1 for small genomes, and is symmetric', () => {
    expect(distance(A, B, DEFAULT_NEAT)).toBeCloseTo(6.4, 6);       // E 2, D 4, Wbar 1.0
    expect(distance(B, A, DEFAULT_NEAT)).toBeCloseTo(6.4, 6);
  });
  it('normalises by the larger genome once it reaches smallGenomeN', () => {
    expect(distance(A, B, { ...DEFAULT_NEAT, smallGenomeN: 4 })).toBeCloseTo(2 / 6 + 4 / 6 + 0.4, 6);
  });
  it('speciate groups identical genomes, adapts the threshold and separates distant families', () => {
    const same = Array.from({ length: 20 }, (_, i) => withConns(i, [[0, 1], [1, 1]]));
    const one = new SpeciesSet(DEFAULT_NEAT);
    one.speciate(same, new Rng(1), DEFAULT_NEAT);
    expect(one.species.length).toBe(1);
    expect(one.species[0]!.members.length).toBe(20);
    expect(one.threshold).toBeCloseTo(DEFAULT_NEAT.compatThreshold - DEFAULT_NEAT.thresholdStep, 9);   // 1 species < target 8

    const far = Array.from({ length: 10 }, (_, i) => withConns(100 + i, [[10, 1], [11, 1], [12, 1], [13, 1], [14, 1], [15, 1]]));
    const two = new SpeciesSet(DEFAULT_NEAT);
    two.speciate([...same.slice(0, 10), ...far], new Rng(1), DEFAULT_NEAT);
    expect(two.species.map((s) => s.members.length)).toEqual([10, 10]);
    expect(far[0]!.speciesId).not.toBe(same[0]!.speciesId);
  });
});
