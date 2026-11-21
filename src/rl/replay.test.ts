import { describe, expect, it } from 'vitest';
import { Rng } from '../core/rng';
import { ReplayBuffer } from './replay';

const batchOut = (n: number, obsSize: number) => ({
  obs: new Float32Array(n * obsSize), actions: new Int32Array(n), rewards: new Float32Array(n),
  nextObs: new Float32Array(n * obsSize), terminals: new Float32Array(n),
});

function filled(): ReplayBuffer {
  const buf = new ReplayBuffer(3, 2);
  const obs = new Float32Array(2), next = new Float32Array(2);
  for (let r = 1; r <= 5; r++) {
    obs[0] = r; obs[1] = -r; next[0] = r + 0.5; next[1] = 0;
    buf.push(obs, r % 3, r, next, r % 2 === 0);
  }
  obs.fill(99); next.fill(99);                     // pushed arrays were copied
  return buf;
}

describe('ReplayBuffer', () => {
  it('overwrites the oldest when full and samples consistent, copied rows', () => {
    const buf = filled();
    expect(buf.size).toBe(3);
    const out = batchOut(64, 2);
    buf.sample(64, new Rng(1), out);
    const seen = new Set<number>();
    for (let b = 0; b < 64; b++) {
      const r = out.rewards[b]!;
      seen.add(r);
      expect([3, 4, 5]).toContain(r);
      expect(out.obs[b * 2]).toBe(r); expect(out.obs[b * 2 + 1]).toBe(-r);
      expect(out.nextObs[b * 2]).toBe(r + 0.5);
      expect(out.actions[b]).toBe(r % 3);
      expect(out.terminals[b]).toBe(r % 2 === 0 ? 1 : 0);
    }
    expect(seen.size).toBe(3);
  });
  it('sampling is deterministic for a seeded Rng', () => {
    const a = batchOut(16, 2), b = batchOut(16, 2);
    filled().sample(16, new Rng(7), a); filled().sample(16, new Rng(7), b);
    expect(Array.from(a.rewards)).toEqual(Array.from(b.rewards));
  });
});
