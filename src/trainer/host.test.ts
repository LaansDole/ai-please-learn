import { describe, expect, it } from 'vitest';
import { defaultReward } from '../env/reward';
import { reach1d } from '../envs/reach1d';
import { resolveConfig } from '../learner/config';
import { createHost } from './host';
import type { FromWorker } from './protocol';
import { fakeSched } from './testSched';

const setup = () => {
  const msgs: FromWorker[] = []; const f = fakeSched();
  return { msgs, f, host: createHost((m) => msgs.push(m), f.sched) };
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
    expect(msgs[2]).toMatchObject({ t: 'error', message: expect.stringContaining('C7') });
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
