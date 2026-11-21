import { describe, expect, it } from 'vitest';
import { EXAMPLE_META } from './exampleEnv';
import { parseResponse } from './parse';
import { SYSTEM_PROMPT, repairMessage, userMessage } from './prompt';

describe('prompt', () => {
  it('contains the contract and no unreplaced placeholders', () => {
    for (const s of ['createEnv(sdk)', 'RESPONSE FORMAT', 'HARD RULES', 'sdk.rng(seed)', 'draw.poly', 'humanAct(input)', 'Never use Math.random'])
      expect(SYSTEM_PROMPT).toContain(s);
    expect(SYSTEM_PROMPT).not.toContain('{{');
  });
  it('the inline example parses back to the example metadata', () => {
    const example = SYSTEM_PROMPT.slice(SYSTEM_PROMPT.indexOf('EXAMPLE\n'));
    const r = parseResponse(example);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.meta).toEqual(EXAMPLE_META);
  });
  it('builds user and repair messages', () => {
    expect(userMessage('  learn to "juggle"  ')).toBe(`Concept: "learn to 'juggle'"`);
    expect(userMessage('x'.repeat(900))).toHaveLength(500 + 'Concept: ""'.length);
    const m = repairMessage(Array.from({ length: 12 }, (_, i) => `error ${i} ${'x'.repeat(400)}`));
    expect(m.split('\n- ').length - 1).toBe(8); expect(m).toContain('same two-block format');
    expect(m.length).toBeLessThan(8 * 320 + 200);
  });
});
