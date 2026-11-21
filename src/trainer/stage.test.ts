import { describe, expect, it } from 'vitest';
import { defaultReward, fitness, signedWeights } from '../env/reward';
import { reach1d } from '../envs/reach1d';
import { resolveConfig } from '../learner/config';
import { createPolicy } from '../learner/policy';
import { runHeadless } from './headless';
import type { FrameMsg, FromWorker } from './protocol';
import { StageRunner } from './stage';
import { fakeSched } from './testSched';

const reward = defaultReward(reach1d);
const setup = () => {
  const msgs: FromWorker[] = []; const f = fakeSched();
  const stage = new StageRunner(reach1d, (m) => msgs.push(m), f.sched);
  const frames = () => msgs.filter((m): m is FrameMsg => m.t === 'frame');
  return { msgs, f, stage, frames };
};

describe('StageRunner', () => {
  it('play: ticks at fps, applies held keys, ends with an episode message', () => {
    const { msgs, f, stage, frames } = setup();
    stage.handle({ t: 'stage/play', seed: 4, reward });
    while (f.time() < 1000) f.drain(1);
    expect(frames().length).toBeGreaterThanOrEqual(28); expect(frames().length).toBeLessThanOrEqual(32);
    expect(frames().every((m) => m.source === 'play')).toBe(true);
    expect(frames().at(-1)!.terms[2]).toBe(0);                 // nothing held: the dot stays
    stage.handle({ t: 'stage/input', held: ['ArrowRight'], pressed: ['ArrowRight'] });
    f.drain(5);
    expect(frames().at(-1)!.terms[2]).toBeGreaterThan(0);
    f.drain(200);
    expect(msgs.at(-1)).toMatchObject({ t: 'episode', source: 'play', steps: 120 });
    expect(frames().length).toBe(120);
    expect(frames().at(-1)!.tick).toBe(120);
    f.drain(50);
    expect(frames().length).toBe(120);                          // frames stop once the episode is over
  });
  it('replay: posts the network first, frames with activations, and the same fitness as an independent rollout', async () => {
    const learner = resolveConfig('neat', reach1d, { populationSize: 10, episodesPerGenome: 1 });
    const champion = (await runHeadless({ def: reach1d, learner, seed: 3, iterations: 1 }))[0]!.champion;
    const { msgs, f, stage, frames } = setup();
    stage.handle({ t: 'stage/replay', policy: champion, seed: 11, reward });
    f.drain(200);
    expect(msgs[0]).toMatchObject({ t: 'network', source: 'replay' });
    expect(msgs.filter((m) => m.t === 'network').length).toBe(1);
    expect(frames()[0]).toMatchObject({ source: 'replay', tick: 1 });
    expect(frames()[0]!.activations!.length).toBe(5); expect(frames()[0]!.outputs!.length).toBe(3);

    const policy = createPolicy(champion, reach1d); const env = reach1d.create();
    env.reset(11);
    while (!env.done) env.step(policy.act(env));
    const episode = msgs.at(-1) as Extract<FromWorker, { t: 'episode' }>;
    expect(episode).toMatchObject({ t: 'episode', source: 'replay', steps: 120 });
    expect(episode.fitness).toBe(fitness(env.terms, signedWeights(reach1d, reward)));
  });
  it('stage/stop halts frames and a new session replaces the old one', () => {
    const { f, stage, frames } = setup();
    stage.handle({ t: 'stage/play', seed: 1, reward });
    f.drain(5);
    stage.handle({ t: 'stage/play', seed: 2, reward });       // the first session's pending tick must be ignored
    f.drain(6);                                                // one stale tick + five live ones
    expect(frames().map((m) => m.tick).slice(5)).toEqual([1, 2, 3, 4, 5]);
    stage.handle({ t: 'stage/stop' });
    f.drain(50);
    expect(frames().length).toBe(10);
  });
});
