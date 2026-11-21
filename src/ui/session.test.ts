import { describe, expect, it } from 'vitest';
import type { EnvSpecMsg } from '../env/types';
import { reach1d } from '../envs/reach1d';
import { resolveConfig } from '../learner/config';
import type { IterationStats, PolicySnapshot } from '../learner/types';
import type { FromWorker, ToWorker } from '../trainer/protocol';
import { openSession, thinHof, type ClientLike, type HofEntry } from './session';

const { meta, observation, action, rewardTerms, presets, human, train } = reach1d;
const spec: EnvSpecMsg = { meta, observation, action, rewardTerms, presets, human, train };
const champion = (id: number): PolicySnapshot => ({ kind: 'neat', genome: { id, nodes: [], conns: [], fitness: 0, speciesId: -1 } });
const iteration = (n: number, rewardVersion = 0): FromWorker => ({
  t: 'iteration',
  stats: { iteration: n, learner: 'neat', best: n, mean: 0, median: 0, episodes: 1, envSteps: n, rewardVersion, champion: champion(n) } satisfies IterationStats,
});
const frame = (source: 'train' | 'play' | 'replay'): FromWorker => ({ t: 'frame', source, frame: { kind: '2d', cmds: [] }, tick: 0, fitness: 0, terms: [] });

function fakeClient() {
  const sent: ToWorker[] = [];
  const listeners = new Map<string, Set<(m: FromWorker) => void>>();
  const client: ClientLike = {
    send: (m) => { sent.push(m); },
    on: (t, fn) => {
      const set = listeners.get(t) ?? new Set();
      listeners.set(t, set); set.add(fn as (m: FromWorker) => void);
      return () => { set.delete(fn as (m: FromWorker) => void); };
    },
    init: async (env) => { sent.push({ t: 'init', env }); return spec; },
    terminate: () => {},
  };
  return { client, sent, emit: (m: FromWorker) => { for (const fn of [...(listeners.get(m.t) ?? [])]) fn(m); } };
}

async function open() {
  const made: ReturnType<typeof fakeClient>[] = [];
  const session = await openSession({ kind: 'builtin', id: 'reach1d' }, { makeClient: () => { const f = fakeClient(); made.push(f); return f.client; } });
  return { session, train: made[0]!, stage: made[1]! };
}
const neat = resolveConfig('neat', reach1d);

describe('session', () => {
  it('initialises a train and a stage client', async () => {
    const { session, train, stage } = await open();
    expect(train.sent).toEqual([{ t: 'init', env: { kind: 'builtin', id: 'reach1d' } }]);
    expect(stage.sent).toEqual(train.sent);
    expect(session.spec.meta.id).toBe('reach1d');
  });

  it('collects history, hall of fame and reward markers', async () => {
    const { session, train } = await open();
    session.start(neat, 1);
    train.emit(iteration(1)); train.emit(iteration(2)); train.emit(iteration(3, 1));
    expect(session.history.length).toBe(3);
    expect(session.hof.length).toBe(3);
    expect(session.rewardMarkers).toEqual([3]);
    session.start(neat, 2);
    expect(session.history.length + session.hof.length + session.rewardMarkers.length).toBe(0);
  });

  it('in MAX relays the newest champion to an idle stage worker', async () => {
    const { session, train, stage } = await open();
    session.setSpeed({ mode: 'max' });
    session.start(neat, 7);
    const replays = () => stage.sent.filter((m) => m.t === 'stage/replay');
    train.emit(iteration(1));
    expect(replays()).toEqual([{ t: 'stage/replay', policy: champion(1), seed: 7, reward: session.reward }]);
    train.emit(iteration(2));
    expect(replays().length).toBe(1);
    stage.emit({ t: 'episode', source: 'replay', fitness: 1, terms: [], steps: 10 });
    train.emit(iteration(3));
    expect(replays().length).toBe(2);
    expect(replays()[1]).toMatchObject({ policy: champion(3) });
  });

  it('routes frames by what is being viewed', async () => {
    const { session, train, stage } = await open();
    session.start(neat, 1);
    train.emit(iteration(1));
    const seen: string[] = [];
    session.on('frame', (m) => seen.push(m.source));
    train.emit(frame('train')); stage.emit(frame('replay')); stage.emit(frame('play'));
    expect(seen).toEqual(['train']);
    session.replay(session.hof[0]!);
    expect(session.viewing).toEqual({ kind: 'replay', iteration: 1 });
    train.emit(frame('train')); stage.emit(frame('replay'));
    expect(seen).toEqual(['train', 'replay']);
    session.backToLive();
    expect(session.viewing).toEqual({ kind: 'live' });
    train.emit(frame('train')); stage.emit(frame('replay'));
    expect(seen).toEqual(['train', 'replay', 'train']);
  });

  it('thins the hall of fame past 400 entries', () => {
    const hof: HofEntry[] = Array.from({ length: 401 }, (_, i) => ({ iteration: i + 1, best: i, policy: champion(i) }));
    thinHof(hof);
    expect(hof.length).toBeLessThan(401);
    expect(hof[0]!.iteration).toBe(1);
    expect(hof.some((e) => e.best === 400)).toBe(true);
    expect(hof.slice(-100).map((e) => e.iteration)).toEqual(Array.from({ length: 100 }, (_, i) => 302 + i));
  });
});
