import { beforeEach, describe, expect, it } from 'vitest';
import { defaultReward } from '../env/reward';
import type { EnvSpecMsg, RewardConfig } from '../env/types';
import { reach1d } from '../envs/reach1d';
import { loadReward, loadRunPrefs, saveReward, saveRunPrefs, setStorage, type RunPrefs } from './storage';

const { meta, observation, action, rewardTerms, presets, human, train } = reach1d;
const spec: EnvSpecMsg = { meta, observation, action, rewardTerms, presets, human, train };
let map: Map<string, string>;

beforeEach(() => {
  map = new Map();
  setStorage({ getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); } });
});

describe('storage', () => {
  it('round-trips a reward config and discards corrupt or foreign values', () => {
    expect(loadReward(reach1d)).toEqual(defaultReward(reach1d));
    const custom: RewardConfig = { ...defaultReward(reach1d), preset: null, weights: { closeness: 3, arrived: 5, effort: 0.5 } };
    saveReward(custom);
    expect(map.has('evolab.reward.v1.reach1d')).toBe(true);
    expect(loadReward(reach1d)).toEqual(custom);
    map.set('evolab.reward.v1.reach1d', '{oops');
    expect(loadReward(reach1d)).toEqual(defaultReward(reach1d));
    map.set('evolab.reward.v1.reach1d', JSON.stringify({ ...custom, envId: 'pong' }));
    expect(loadReward(reach1d)).toEqual(defaultReward(reach1d));
  });

  it('round-trips run preferences and repairs invalid fields', () => {
    const defaults: RunPrefs = { learner: 'neat', seed: 1, population: 50, ghosts: true, speed: { mode: 'live', mult: 1 } };
    expect(loadRunPrefs(spec)).toEqual(defaults);
    const mine: RunPrefs = { learner: 'neat', seed: 9, population: 80, ghosts: false, speed: { mode: 'max' } };
    saveRunPrefs('reach1d', mine);
    expect(map.has('evolab.run.v1.reach1d')).toBe(true);
    expect(loadRunPrefs(spec)).toEqual(mine);
    map.set('evolab.run.v1.reach1d', JSON.stringify({ ...mine, speed: { mode: 'live', mult: 3 } }));
    expect(loadRunPrefs(spec)).toEqual({ ...mine, speed: defaults.speed });
  });
});
