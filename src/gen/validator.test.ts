import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkLearnability } from '../env/conformance';
import * as F from './fixtures';
import { toDefinition } from './generatedEnv';
import type { GeneratedMeta } from './meta';
import { parseResponse } from './parse';
import { SYSTEM_PROMPT } from './prompt';
import { compileGenerated } from './sandbox';
import { validateModule } from './validator';

const run = (f: { meta: unknown; source: string }) => validateModule(f.source, f.meta);

describe('validator', () => {
  it('accepts the good module and reports stats', () => {
    const r = run(F.GOOD);
    expect(r).toMatchObject({ ok: true, errors: [] });
    expect(r.stats!.steps).toBe(2000); expect(r.stats!.episodes).toBeGreaterThanOrEqual(16);
  });
  it('accepts the example the system prompt teaches', () => {
    const r = parseResponse(SYSTEM_PROMPT.slice(SYSTEM_PROMPT.indexOf('EXAMPLE\n')));
    expect(r.ok && validateModule(r.source, r.meta).ok).toBe(true);
  });
  it.each([
    ['THROWS', /step .* threw: boom/],
    ['NAN_OBS', /observation .* not a finite number/],
    ['WRONG_SIZE', /observe\(\) returned 2 values but observation\.labels has 3/],
    ['FETCHES', /"fetch" is not available/],
    ['NON_DETERMINISTIC', /not deterministic/],
    ['NO_REWARD', /no reward term ever changed/],
    ['INSTANT_DONE', /done must be false right after reset/],
    ['NO_SIGNAL', /scored exactly the same fitness/],
    ['RANDOM_SURVIVES', /random play already survives the whole episode/],
  ] as const)('rejects %s with an actionable message', (name, pattern) => {
    const r = run(F[name]);
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toMatch(pattern);
    expect(r.errors.length).toBeLessThanOrEqual(8);
  });
  it('rejects bad metadata before running any code', () => {
    const r = validateModule('function createEnv() { throw new Error("must not run"); }', { ...F.GOOD.meta, fps: 500 });
    expect(r.ok).toBe(false); expect(r.errors[0]).toMatch(/fps/);
  });
  it('rejects modules that fail to load', () => {
    expect(validateModule('function createEnv(sdk) {', F.GOOD.meta).errors[0]).toMatch(/failed to load/);
    expect(validateModule('var x = 1;', F.GOOD.meta).errors[0]).toMatch(/createEnv/);
    expect(validateModule('function createEnv(sdk) { return sdk.nope.x; }', F.GOOD.meta).errors[0]).toMatch(/createEnv\(sdk\) threw/);
    expect(validateModule('function createEnv(sdk) { return 3; }', F.GOOD.meta).errors[0]).toMatch(/must return an object/);
  });
  it('rejects missing members and wrong member types', () => {
    const r = validateModule('function createEnv(sdk) { return { reset: function () {}, step: 3 }; }', F.GOOD.meta);
    expect(r.errors.join('\n')).toMatch(/step must be a function/);
    expect(r.errors.join('\n')).toMatch(/observe/);
  });
  it('rejects render that draws nothing or forgets to clear', () => {
    const noClear = { meta: F.GOOD.meta, source: F.GOOD.source.replace('draw.clear(sdk.colors.bg);', '') };
    expect(run(noClear).errors.join('\n')).toMatch(/first draw command must be draw\.clear/);
  });
  it('fails a run that blows the time budget', () => {
    let t = 0;
    const r = validateModule(F.GOOD.source, F.GOOD.meta, () => (t += 4000));
    expect(r.ok).toBe(false); expect(r.errors[0]).toMatch(/took too long/);
  });
  const concept = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as { meta: unknown; source: string };
  it('rejects the real "Dodge Falling Rocks" whose best fitness never moved in 418 generations', () => {
    const r = run(concept('src/gen/testdata/unlearnable-dodge.evolab-concept.json'));
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toMatch(/random play already survives the whole episode.*maxSteps \(900\)/);
  });
  it('rejects it on other seeds too: untrained networks survive it far more often than random actions do', () => {
    const c = concept('src/gen/testdata/unlearnable-dodge.evolab-concept.json');
    const def = toDefinition('gen-dodge', c.meta as GeneratedMeta, compileGenerated(c.source));
    for (const seed of [1, 2, 3, 777, 31337]) expect(checkLearnability(def, { seed }).join('\n')).toMatch(/already survives the whole episode/);
  });
  it('accepts every committed llm-trial concept', () => {
    const files = readdirSync('docs/llm-trial').filter((f) => f.endsWith('.evolab-concept.json'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect([f, run(concept(`docs/llm-trial/${f}`)).errors]).toEqual([f, []]);
  });
});
