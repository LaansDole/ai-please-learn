import { describe, expect, it } from 'vitest';
import { checkConformance } from '../env/conformance';
import { RecordingDraw2D } from '../env/draw2d';
import { validateDefinition } from '../env/registry';
import { reach1d } from '../envs/reach1d';
import { FETCHES, GOOD } from './fixtures';
import { toDefinition } from './generatedEnv';
import { compileGenerated, lockdown } from './sandbox';
import { makeSdk } from './sdk';

describe('sandbox', () => {
  it('compiles the good module into a conformant EnvDefinition that behaves like reach1d', () => {
    const def = toDefinition('gen-reach-0001', GOOD.meta, compileGenerated(GOOD.source));
    expect(validateDefinition(def)).toEqual([]);
    expect(def.meta).toMatchObject({ id: 'gen-reach-0001', dims: '2d', generated: true, ghosts: true, learners: ['neat', 'dqn', 'ppo'] });
    expect(checkConformance(def).errors).toEqual([]);
    const a = def.create(), b = reach1d.create();
    a.reset(5); b.reset(5);
    for (let i = 0; i < 120; i++) { a.step(i % 3); b.step(i % 3); }
    // Deviation from the plan (exact equality): reach1d accumulates its terms in float32, the module in float64.
    Array.from(b.terms).forEach((v, k) => expect(a.terms[k]).toBeCloseTo(v, 5));
    expect(Array.from(a.observe())).toEqual(Array.from(b.observe()));
    expect(a.done).toBe(true);
    expect(a.terms).toBeInstanceOf(Float32Array);
    const ours = new RecordingDraw2D(), theirs = new RecordingDraw2D();
    a.render({ kind: '2d', draw: ours, ghost: false }); b.render({ kind: '2d', draw: theirs, ghost: false });
    expect(ours.cmds).toEqual(theirs.cmds);
  });
  it('maps continuous actions, human input and malformed draw calls safely', () => {
    const meta = { ...GOOD.meta, action: { type: 'continuous' as const, labels: ['push'] } };
    const src = 'function createEnv(sdk) { var got; return { reset: function () {}, step: function (a) { got = a; }, observe: function () { return [0, 0]; }, done: false, terms: [0, 0, 0],'
      + ' render: function (draw) { draw.poly(undefined, 7); draw.rect("1", 2, 3, 4); }, humanAct: function (i) { return i.held.has("KeyA") ? [1] : undefined; }, peek: function () { return got; } }; }';
    const def = toDefinition('gen-x-0001', meta, compileGenerated(src));
    expect(def.meta.learners).toEqual(['neat', 'ppo']);
    const env = def.create();
    env.step(Float32Array.of(0.5));
    expect(env.humanAct!({ held: new Set(['KeyA']), pressed: new Set() })).toEqual(Float32Array.of(1));
    expect(env.humanAct!({ held: new Set(), pressed: new Set() })).toBeNull();
    const draw = new RecordingDraw2D();
    env.render({ kind: '2d', draw, ghost: false });
    expect(draw.cmds).toEqual([['p', [], '7', true], ['r', 1, 2, 3, 4, 'undefined']]);
  });
  it('shadows ambient capabilities inside generated code', () => {
    const make = compileGenerated(FETCHES.source);            // compile skips the scan on purpose here
    const env = make(makeSdk()) as { reset(s: number): void; step(a: number): void };
    env.reset(1);
    expect(() => env.step(1)).toThrow();                      // fetch is undefined inside the module
    const probe = compileGenerated('function createEnv(sdk) { return { g: typeof globalThis, s: typeof self, f: typeof fetch, d: typeof Date, t: typeof setTimeout }; }');
    expect(probe(makeSdk())).toEqual({ g: 'undefined', s: 'undefined', f: 'undefined', d: 'undefined', t: 'undefined' });
  });
  it('reports syntax errors and a missing createEnv', () => {
    expect(() => compileGenerated('function createEnv(sdk) {')).toThrow();
    expect(() => compileGenerated('var x = 1;')).toThrow(/createEnv/);
  });
  it('lockdown replaces network and storage globals with throwing stubs', () => {
    const scope: Record<string, unknown> = { fetch: () => 1, WebSocket: class {}, indexedDB: {}, keep: 1 };
    lockdown(scope);
    expect(() => (scope.fetch as () => void)()).toThrow('EvoLab sandbox: fetch is not available');
    expect(() => new (scope.WebSocket as new () => unknown)()).toThrow(/WebSocket is not available/);
    expect(() => (scope.importScripts as () => void)()).toThrow();
    expect(scope.keep).toBe(1);
  });
  it('sdk.rng is deterministic and the sdk is frozen', () => {
    const sdk = makeSdk();
    expect(sdk.rng(3).next()).toBe(sdk.rng(3).next());
    expect(Object.isFrozen(sdk)).toBe(true); expect(sdk.W).toBe(800);
    expect(Object.isFrozen(sdk.colors) && Object.isFrozen(sdk.vec)).toBe(true);
  });
});
