import { describe, expect, it } from 'vitest';
import { defaultReward } from '../env/reward';
import { reach1d } from '../envs/reach1d';
import { FETCHES, GOOD } from '../gen/fixtures';
import { resolveConfig } from '../learner/config';
import { createHost } from './host';
import type { FromWorker } from './protocol';
import { fakeSched } from './testSched';

const setup = () => {
  const msgs: FromWorker[] = []; const f = fakeSched();
  const scope: Record<string, unknown> = { fetch: () => 1 };   // stands in for the worker global that lockdown strips
  return { msgs, f, scope, host: createHost((m) => msgs.push(m), f.sched, undefined, scope) };
};

describe('worker host', () => {
  it('init answers ready with a JSON-safe spec, then routes train messages', async () => {
    const { msgs, f, host } = setup();
    await host({ t: 'init', env: { kind: 'builtin', id: 'reach1d' } });
    const ready = msgs[0] as Extract<FromWorker, { t: 'ready' }>;
    expect(ready.t).toBe('ready');
    expect(ready.spec.meta.id).toBe('reach1d');
    expect(JSON.parse(JSON.stringify(ready.spec))).toEqual(ready.spec);
    expect('create' in ready.spec).toBe(false);

    const learner = resolveConfig('neat', reach1d, { populationSize: 10, episodesPerGenome: 1 });
    await host({ t: 'train/start', learner, reward: defaultReward(reach1d), seed: 1, speed: { mode: 'max' }, ghosts: false });
    f.drain(50);
    expect(msgs.some((m) => m.t === 'iteration')).toBe(true);
  });
  it('reports errors instead of throwing', async () => {
    const { msgs, host } = setup();
    await host({ t: 'train/stop' });
    expect(msgs[0]).toMatchObject({ t: 'error' });
    await host({ t: 'init', env: { kind: 'builtin', id: 'nope' } });
    expect(msgs[1]).toMatchObject({ t: 'error', message: expect.stringContaining('unknown environment') });
    await host({ t: 'init', env: { kind: 'generated', id: 'gen-x', source: '', meta: {} } });
    expect(msgs[2]).toMatchObject({ t: 'error', message: expect.stringContaining('name must be') });
  });
  it('runs generated environments after locking the worker down', async () => {
    const { msgs, f, scope, host } = setup();
    await host({ t: 'init', env: { kind: 'generated', id: 'gen-reach-0001', source: GOOD.source, meta: GOOD.meta } });
    const ready = msgs[0] as Extract<FromWorker, { t: 'ready' }>;
    expect(ready.spec.meta).toMatchObject({ id: 'gen-reach-0001', generated: true });
    expect(() => (scope.fetch as () => void)()).toThrow(/sandbox/);
    const learner = resolveConfig('neat', ready.spec, { populationSize: 10, episodesPerGenome: 1 });
    await host({ t: 'train/start', learner, reward: defaultReward(ready.spec), seed: 1, speed: { mode: 'max' }, ghosts: false });
    f.drain(50);
    expect(msgs.some((m) => m.t === 'iteration')).toBe(true);
    expect(msgs.some((m) => m.t === 'error')).toBe(false);
  });
  it('refuses generated modules that fail the static scan', async () => {
    const { msgs, host } = setup();
    await host({ t: 'init', env: { kind: 'generated', id: 'gen-x-0001', source: FETCHES.source, meta: FETCHES.meta } });
    expect(msgs[0]).toMatchObject({ t: 'error', message: expect.stringContaining('fetch') });
  });
  it('validates without a prior init', async () => {
    const { msgs, scope, host } = setup();
    await host({ t: 'validate', source: GOOD.source, meta: GOOD.meta });
    expect(msgs[0]).toMatchObject({ t: 'validated', report: { ok: true } });
    expect(() => (scope.fetch as () => void)()).toThrow(/sandbox/);
  });
  it('reports errors thrown later inside scheduled work', async () => {
    const msgs: FromWorker[] = []; const f = fakeSched();
    const failing = { ...reach1d, create: () => ({ ...reach1d.create(), step: () => { throw new Error('boom'); } }) };
    const host = createHost((m) => msgs.push(m), f.sched, async () => failing);
    await host({ t: 'init', env: { kind: 'builtin', id: 'reach1d' } });
    await host({ t: 'stage/play', seed: 1, reward: defaultReward(reach1d) });
    f.drain(5);
    expect(msgs.some((m) => m.t === 'error' && m.message === 'boom')).toBe(true);
  });
});
