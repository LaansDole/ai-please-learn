import { describe, expect, it } from 'vitest';
import { EXAMPLE_META } from './exampleEnv';
import { slugId, validateMeta, type GeneratedMeta } from './meta';

const mutate = (fn: (m: GeneratedMeta) => void): GeneratedMeta => { const m = structuredClone(EXAMPLE_META); fn(m); return m; };

describe('validateMeta', () => {
  it('accepts the example', () => expect(validateMeta(EXAMPLE_META)).toEqual([]));
  it.each<[string, (m: GeneratedMeta) => void, string]>([
    ['fps out of range', (m) => { m.fps = 5; }, 'fps'],
    ['maxSteps out of range', (m) => { m.maxSteps = 99999; }, 'maxSteps'],
    ['no observation labels', (m) => { m.observation.labels = []; }, 'observation.labels'],
    ['candidates action', (m) => { (m.action as { type: string }).type = 'candidates'; }, 'action.type'],
    ['discrete with one label', (m) => { m.action.labels = ['only']; }, 'action.labels'],
    ['continuous with seven labels', (m) => { m.action = { type: 'continuous', labels: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }; }, 'action.labels'],
    ['duplicate term keys', (m) => { m.rewardTerms.push({ ...m.rewardTerms[0]! }); }, 'rewardTerms[3].key'],
    ['bad term key', (m) => { m.rewardTerms[2]!.key = 'Bad-Key'; for (const p of m.presets) { p.weights['Bad-Key'] = p.weights.effort!; delete p.weights.effort; } }, 'rewardTerms[2].key'],
    ['no reward term', (m) => { for (const t of m.rewardTerms) t.kind = 'penalty'; }, 'rewardTerms'],
    ['missing preset', (m) => { m.presets = m.presets.filter((p) => p.name !== 'survivalist'); }, 'survivalist'],
    ['unknown preset key', (m) => { m.presets[1]!.weights.ghost = 1; }, 'presets[1].weights.ghost'],
    ['negative preset weight', (m) => { m.presets[1]!.weights.effort = -1; }, 'presets[1].weights.effort'],
    ['default preset differs', (m) => { m.presets[0]!.weights.closeness = 9; }, 'presets[0].weights.closeness'],
    ['no human keys', (m) => { m.human.keys = []; }, 'human.keys'],
    ['long name', (m) => { m.name = 'x'.repeat(41); }, 'name'],
  ])('%s -> one error naming the field', (_name, fn, field) => {
    const errors = validateMeta(mutate(fn));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(field);
  });
  it('rejects non-objects', () => {
    expect(validateMeta(null)).toHaveLength(1);
    expect(validateMeta('x')).toHaveLength(1);
  });
  it('says what it got', () => {
    expect(validateMeta(mutate((m) => { m.observation.labels = Array.from({ length: 40 }, (_, i) => `o${i}`); })))
      .toEqual(['observation.labels must have 1 to 32 entries (got 40)']);
  });
});

describe('slugId', () => {
  it('builds a gen- id from the name', () => {
    expect(slugId('Learn to Juggle!', () => 0.5)).toMatch(/^gen-learn-to-juggle-[0-9a-f]{4}$/);
    expect(slugId('!!!', () => 0)).toBe('gen-concept-0000');
    expect(slugId('A very long concept name that goes on and on', () => 0.999999)).toMatch(/^gen-[a-z0-9-]{1,24}-ffff$/);
    expect(slugId('A very long concept name that goes on and on', () => 0)).not.toContain('--');
  });
});
