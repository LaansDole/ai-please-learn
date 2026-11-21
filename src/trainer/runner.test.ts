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
  ({ t: 'train/start', learner, reward: defaultReward(reach1d), seed: 3, speed, ghosts: true });

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
});
