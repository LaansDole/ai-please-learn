import { describe, expect, it } from 'vitest';
import { GOOD, WRONG_SIZE, toResponse } from './fixtures';
import type { ChatMessage } from './prompt';
import { generateConcept } from './repair';
import { validateModule } from './validator';

const deps = (responses: string[]) => {
  const calls: ChatMessage[][] = []; const events: string[] = [];
  return {
    calls, events,
    chat: async (m: ChatMessage[]) => { calls.push([...m]); return responses[Math.min(calls.length - 1, responses.length - 1)]!; },
    validate: async (source: string, meta: unknown) => validateModule(source, meta),
    onProgress: (e: { phase: string; attempt: number }) => { events.push(`${e.phase}:${e.attempt}`); },
  };
};

describe('generateConcept', () => {
  it('succeeds first time', async () => {
    const d = deps([toResponse(GOOD)]);
    const r = await generateConcept('slide a dot', d);
    expect(r).toMatchObject({ ok: true, attempts: 1 });
    expect(d.calls.length).toBe(1); expect(d.calls[0]!.map((m) => m.role)).toEqual(['system', 'user']);
    expect(d.events).toEqual(['prompting:0', 'validating:0', 'done:0']);
  });
  it('feeds validator errors back and succeeds on the repair', async () => {
    const d = deps([toResponse(WRONG_SIZE), toResponse(GOOD)]);
    const r = await generateConcept('slide a dot', d);
    expect(r).toMatchObject({ ok: true, attempts: 2 });
    expect(d.calls[1]!.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(d.calls[1]![3]!.content).toContain('observation.labels has 3');
    expect(d.events).toContain('repairing:1');
  });
  it('treats unparsable responses as failures and gives up after 3 repairs', async () => {
    const d = deps(['I cannot do that.']);
    const r = await generateConcept('x', d);
    expect(r.ok).toBe(false); expect(d.calls.length).toBe(4);
    if (!r.ok) { expect(r.errors[0]).toMatch(/json/); expect(r.lastResponse).toBe('I cannot do that.'); }
    expect(d.events.at(-1)).toBe('failed:3');
  });
  it('surfaces transport errors without retrying', async () => {
    const d = deps([]); d.chat = async () => { throw new Error('LLM request failed (502): down'); };
    const r = await generateConcept('x', d);
    expect(r.ok).toBe(false); if (!r.ok) expect(r.errors[0]).toContain('502');
  });
});
