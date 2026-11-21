import { beforeEach, describe, expect, it } from 'vitest';
import { reach1d } from '../envs/reach1d';
import { clearRegistry, getEnv, listEnvs, registerEnv, validateDefinition } from './registry';
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
