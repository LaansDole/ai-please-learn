import { describe, expect, it } from 'vitest';
import { defaultReward } from '../env/reward';
import type { EnvSpecMsg } from '../env/types';
import { reach1d } from '../envs/reach1d';
import { resolveConfig } from '../learner/config';
import { runHeadless } from '../trainer/headless';
import { exportFileName, parseExport, toExport, type ChampionExport } from './exportImport';

const { meta, observation, action, rewardTerms, presets, human, train } = reach1d;
const spec: EnvSpecMsg = { meta, observation, action, rewardTerms, presets, human, train };
const learner = resolveConfig('neat', reach1d, { populationSize: 10 });
const NOW = new Date('2026-11-21T10:00:00Z');

async function exported(): Promise<ChampionExport> {
  const [stats] = await runHeadless({ def: reach1d, learner, seed: 1, iterations: 1 });
  return toExport(spec, { learner, seed: 1, reward: defaultReward(reach1d) }, stats!, stats!.champion, NOW);
}
const errorsOf = (json: unknown) => { const r = parseExport(json, spec); return r.ok ? [] : r.errors; };

describe('champion export/import', () => {
  it('round-trips a NEAT champion through JSON', async () => {
    const e = await exported();
    expect(exportFileName(e)).toBe('evolab-reach1d-neat-g1.json');
    expect(e.exportedAt).toBe('2026-11-21T10:00:00.000Z');
    const r = parseExport(JSON.parse(JSON.stringify(e)), spec);
    expect(r.ok).toBe(true);
    if (r.ok && r.policy.kind === 'neat' && e.policy.kind === 'neat') expect(r.policy.genome).toEqual(e.policy.genome);
    else throw new Error('expected a NEAT policy');
  });

  it('rejects files for another format, version, concept or network shape', async () => {
    const e = await exported();
    expect(errorsOf('nope').length).toBe(1);
    expect(errorsOf({ ...e, format: 'x' }).length).toBeGreaterThan(0);
    expect(errorsOf({ ...e, version: 2 }).length).toBeGreaterThan(0);
    expect(errorsOf({ ...e, env: { ...e.env, id: 'pong' } }).join(' ')).toContain('pong');
    if (e.policy.kind !== 'neat') throw new Error('expected a NEAT policy');
    const genome = { ...e.policy.genome, nodes: e.policy.genome.nodes.slice(1) };
    expect(errorsOf({ ...e, policy: { kind: 'neat', genome } }).join(' ')).toContain('expects 2 inputs');
  });

  it('round-trips MLP params as a Float32Array and checks their count', async () => {
    const e = await exported();
    const mlp = (n: number) => ({ ...e, policy: { kind: 'mlp', algo: 'dqn', sizes: [2, 4, 3], hidden: 'relu', params: Array.from({ length: n }, (_, i) => i / 4) } });
    const r = parseExport(JSON.parse(JSON.stringify(mlp(27))), spec);
    expect(r.ok).toBe(true);
    if (r.ok && r.policy.kind === 'mlp') {
      expect(r.policy.params).toBeInstanceOf(Float32Array);
      expect(Array.from(r.policy.params)).toEqual(Array.from({ length: 27 }, (_, i) => i / 4));
    } else throw new Error('expected an MLP policy');
    expect(errorsOf(mlp(26)).join(' ')).toContain('27');
  });

  it('an unscored champion (NaN stats: no episode finished yet) still exports a file that imports', async () => {
    const e = await exported();
    const nan = toExport(spec, { learner, seed: 1, reward: defaultReward(reach1d) }, { iteration: 1, best: NaN, mean: NaN, median: NaN }, e.policy as never, NOW);
    expect(nan.stats).toEqual({ best: 0, mean: 0, median: 0 });
    expect(parseExport(JSON.parse(JSON.stringify(nan)), spec).ok).toBe(true);
  });
});
