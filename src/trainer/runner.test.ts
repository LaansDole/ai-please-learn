import { describe, expect, it } from 'vitest';
import { defaultReward } from '../env/reward';
import { reach1d } from '../envs/reach1d';
import { resolveConfig } from '../learner/config';
import { runHeadless } from './headless';
import type { FromWorker, Speed, ToWorker } from './protocol';
import { TrainRunner } from './runner';
import { fakeSched } from './testSched';

const learner = resolveConfig('neat', reach1d, { populationSize: 10, episodesPerGenome: 1 });
const start = (speed: Speed): ToWorker =>
  ({ t: 'train/start', learner, reward: defaultReward(reach1d), seed: 3, speed, ghosts: true, runId: 7 });

describe('TrainRunner', () => {
  it('MAX: produces iterations identical to runHeadless and no frames', async () => {
    const msgs: FromWorker[] = []; const f = fakeSched(0.1);    // 120 ticks per 12 ms slice keeps MAX-mode tests fast
    const r = new TrainRunner(reach1d, (m) => msgs.push(m), f.sched);
    r.handle(start({ mode: 'max' }));
    f.drain(200);
    const its = msgs.filter((m) => m.t === 'iteration').map((m) => (m as Extract<FromWorker, { t: 'iteration' }>).stats);
    expect(its.length).toBeGreaterThanOrEqual(3);
    const ref = await runHeadless({ def: reach1d, learner, seed: 3, iterations: 3 });
    expect(its.slice(0, 3).map((s) => [s.best, s.mean])).toEqual(ref.map((s) => [s.best, s.mean]));
    expect(msgs.some((m) => m.t === 'frame')).toBe(false);
    expect(msgs.some((m) => m.t === 'status' && m.state === 'running')).toBe(true);
  });
  it('live x1: tick rate follows fps, frames carry ghosts and activations, results equal MAX', async () => {
    const msgs: FromWorker[] = []; const f = fakeSched();
    const r = new TrainRunner(reach1d, (m) => msgs.push(m), f.sched);
    r.handle(start({ mode: 'live', mult: 1 }));
    while (f.time() < 4500) f.drain(1);                            // 4.5 virtual seconds at 30 fps = ~135 ticks > one 120-tick generation
    const its = msgs.filter((m) => m.t === 'iteration');
    expect(its.length).toBe(1);
    const frames = msgs.filter((m) => m.t === 'frame') as Extract<FromWorker, { t: 'frame' }>[];
    expect(frames.length).toBeGreaterThan(100); expect(frames.length).toBeLessThan(300);
    expect(frames[5]!.frame.kind).toBe('2d'); expect(frames[5]!.activations!.length).toBeGreaterThanOrEqual(5);
    expect(frames[5]!.frame.kind === '2d' && frames[5]!.frame.cmds.some((c) => c[0] === 'a')).toBe(true);
    expect(msgs.filter((m) => m.t === 'network').length).toBeGreaterThanOrEqual(1);
    const ref = await runHeadless({ def: reach1d, learner, seed: 3, iterations: 1 });
    expect((its[0] as Extract<FromWorker, { t: 'iteration' }>).stats.best).toBe(ref[0]!.best);
  });
  it('pause stops ticking; step runs exactly one more iteration then pauses', () => {
    const msgs: FromWorker[] = []; const f = fakeSched();
    const r = new TrainRunner(reach1d, (m) => msgs.push(m), f.sched);
    r.handle(start({ mode: 'paused' }));
    f.drain(50);
    expect(msgs.filter((m) => m.t === 'iteration').length).toBe(0);
    r.handle({ t: 'train/step' }); f.drain(500);
    expect(msgs.filter((m) => m.t === 'iteration').length).toBe(1);
    expect(msgs.filter((m) => m.t === 'status').at(-1)).toMatchObject({ state: 'paused', iteration: 1 });
  });
  it('train/reward reaches the learner: rewardVersion increments on a later iteration', () => {
    const msgs: FromWorker[] = []; const f = fakeSched(0.1);
    const r = new TrainRunner(reach1d, (m) => msgs.push(m), f.sched);
    r.handle(start({ mode: 'max' })); f.drain(20);
    r.handle({ t: 'train/reward', reward: { version: 1, envId: 'reach1d', preset: null, weights: { effort: 9 } } });
    f.drain(400);
    const versions = msgs.filter((m) => m.t === 'iteration').map((m) => (m as Extract<FromWorker, { t: 'iteration' }>).stats.rewardVersion);
    expect(versions[0]).toBe(0); expect(versions.at(-1)).toBe(1);
  });
  it('MAX: iterations reach the main thread in batches at most once per 100 ms; pausing flushes the rest', () => {
    const f = fakeSched(0.1); const times: number[] = []; let count = 0;
    const r = new TrainRunner(reach1d, (m) => { if (m.t === 'iteration') { count++; if (times.at(-1) !== f.time()) times.push(f.time()); } }, f.sched);
    r.handle(start({ mode: 'max' }));
    f.drain(300);
    expect(times.length).toBeGreaterThanOrEqual(3);
    expect(count).toBeGreaterThan(times.length);                    // several generations per batch
    for (let i = 1; i < times.length; i++) expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(100);
    const status: FromWorker[] = [];
    const r2 = new TrainRunner(reach1d, (m) => { if (m.t === 'iteration') count++; else status.push(m); }, f.sched);
    count = 0; r2.handle(start({ mode: 'max' })); f.drain(5); r2.handle({ t: 'train/speed', speed: { mode: 'paused' } });
    expect(status.at(-1)).toMatchObject({ t: 'status', state: 'paused', iteration: count });
    expect(count).toBeGreaterThan(0);
  });
  it('D4: every train-sourced message echoes the runId of its train/start', () => {
    const msgs: FromWorker[] = []; const f = fakeSched();
    const r = new TrainRunner(reach1d, (m) => msgs.push(m), f.sched);
    r.handle(start({ mode: 'live', mult: 1 }));
    while (f.time() < 4500) f.drain(1);
    for (const t of ['status', 'iteration', 'frame', 'network'] as const) {
      const of = msgs.filter((m) => m.t === t) as { runId?: number }[];
      expect(of.length, t).toBeGreaterThan(0);
      expect(of.every((m) => m.runId === 7), t).toBe(true);
    }
  });
  it('D5: a throwing tick ends the run with an error and an idle status instead of a stuck runner', () => {
    const throwing = { ...reach1d, create: () => {
      const env = reach1d.create(), step = env.step.bind(env); let n = 0;
      env.step = (a) => { if (++n > 5) throw new Error('boom'); step(a); };
      return env;
    } };
    const msgs: FromWorker[] = []; const f = fakeSched(0.1);
    const r = new TrainRunner(throwing, (m) => msgs.push(m), f.sched);
    r.handle(start({ mode: 'max' }));
    f.drain(50);
    expect(msgs.filter((m) => m.t === 'error')).toEqual([{ t: 'error', message: 'boom' }]);
    expect(msgs.filter((m) => m.t === 'status').at(-1)).toMatchObject({ state: 'idle' });
    r.handle(start({ mode: 'paused' }));                           // a new start still works
    expect(msgs.at(-1)).toMatchObject({ t: 'status', state: 'paused' });
  });
});
