import { beforeEach, describe, expect, it } from 'vitest';
import { reach1d } from '../envs/reach1d';
import { clearRegistry, getEnv, listEnvs, prepareEnv, registerEnv, validateDefinition } from './registry';
import type { EnvDefinition } from './types';

beforeEach(clearRegistry);

describe('registry', () => {
  it('registers, returns and lists definitions; rejects duplicates and unknown ids', () => {
    registerEnv(reach1d);
    expect(getEnv('reach1d')).toBe(reach1d);
    expect(listEnvs()).toEqual([reach1d]);
    expect(() => registerEnv(reach1d)).toThrow(/duplicate/);
    expect(() => getEnv('x')).toThrow('unknown environment: x');
  });
  it('validateDefinition reports each kind of broken definition', () => {
    const broken: Record<string, EnvDefinition> = {
      'duplicate term keys': { ...reach1d, rewardTerms: [...reach1d.rewardTerms, reach1d.rewardTerms[0]!] },
      'preset with unknown key': { ...reach1d, presets: [reach1d.presets[0]!, { name: 'x', description: '', weights: { nope: 1 } }] },
      'dqn on continuous actions': { ...reach1d, action: { type: 'continuous', labels: ['move'] } },
      'human without humanAct': { ...reach1d, create: () => ({ ...reach1d.create(), humanAct: undefined }) },
      'first preset not default': { ...reach1d, presets: [...reach1d.presets].reverse() },
    };
    for (const [what, def] of Object.entries(broken)) expect(validateDefinition(def).length, what).toBeGreaterThan(0);
    expect(() => registerEnv(broken['duplicate term keys']!)).toThrow();
  });
});

describe('envs that need prepare() (Rapier WASM)', () => {
  // create() fails until prepare() has resolved, as the Walker does before its physics engine is loaded.
  const needsPrepare = (over: Partial<EnvDefinition> = {}): EnvDefinition => {
    let ready = false;
    return {
      ...reach1d,
      prepare: async () => { ready = true; },
      create: () => { if (!ready) throw new Error('not prepared'); return reach1d.create(); },
      ...over,
    };
  };
  it('registers without creating an instance, and prepareEnv runs the instance checks afterwards', async () => {
    const def = needsPrepare();
    expect(() => registerEnv(def)).not.toThrow();
    await expect(prepareEnv(def)).resolves.toBeUndefined();
    expect(validateDefinition(def)).toEqual([]);
  });
  it('prepareEnv rejects a prepared env whose instance breaks the contract', async () => {
    const def = needsPrepare({ create: () => ({ ...reach1d.create(), humanAct: undefined }) });
    expect(() => registerEnv(def)).not.toThrow();
    await expect(prepareEnv(def)).rejects.toThrow(/humanAct/);
  });
  it('B4: preset weights must be finite numbers >= 0', () => {
    for (const w of [-1, NaN, Infinity, '2' as unknown as number]) {
      const def: EnvDefinition = { ...reach1d, presets: [reach1d.presets[0]!, { name: 'x', description: '', weights: { effort: w } }] };
      expect(validateDefinition(def).length, String(w)).toBe(1);
    }
  });
});
