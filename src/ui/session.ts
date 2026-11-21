import { loadReward, saveReward } from '../persist/storage';
import type { EnvSpecMsg, RewardConfig } from '../env/types';
import type { LearnerConfig } from '../learner/config';
import type { IterationStats, PolicySnapshot } from '../learner/types';
import { WorkerClient } from '../trainer/client';
import type { EnvRef, FromWorker, Speed, ToWorker } from '../trainer/protocol';

export type Viewing = { kind: 'play' } | { kind: 'live' } | { kind: 'replay'; iteration: number | 'imported' };
export interface HofEntry { iteration: number | 'imported'; best: number; policy: PolicySnapshot }
/** Champions live in `hof` only, so thinning the hall of fame frees them. */
export type HistoryEntry = Omit<IterationStats, 'champion'>;
export interface RunInfo { learner: LearnerConfig; seed: number }

export interface Session {
  readonly spec: EnvSpecMsg;
  readonly history: HistoryEntry[];
  readonly hof: HofEntry[];                  // thinned per spec section 11.5
  readonly rewardMarkers: number[];          // iterations at which rewardVersion changed
  readonly state: 'idle' | 'running' | 'paused';
  readonly speed: Speed;
  readonly viewing: Viewing;
  readonly run: RunInfo | null;              // the current or most recent run
  readonly autoReplay: number | null;        // iteration whose champion the stage shows while `viewing` is live (MAX / step)
  reward: RewardConfig;
  /** Frames and network messages are already filtered to the current `viewing`. */
  on<T extends FromWorker['t']>(t: T, fn: (m: Extract<FromWorker, { t: T }>) => void): () => void;
  onChange(fn: () => void): () => void;      // state / viewing / history changed
  play(seed: number): void;
  input(held: string[], pressed: string[]): void;
  start(learner: LearnerConfig, seed: number): void;
  setSpeed(s: Speed): void;
  step(): void;
  setReward(cfg: RewardConfig): void;        // forwards to both workers
  setGhosts(on: boolean): void;
  stop(): void;
  replay(entry: HofEntry): void;
  backToLive(): void;
  importChampion(policy: PolicySnapshot, best: number): void;
  dispose(): void;                           // terminates both workers
}
export interface ClientLike { send(m: ToWorker, transfer?: Transferable[]): void; on: WorkerClient['on']; init(env: EnvRef): Promise<EnvSpecMsg>; terminate(): void }

const REPLAY_LOOP_MS = 600;

/** In place. Past 400 entries, every second entry older than the newest 100 goes; the first and the all-time best stay. */
export function thinHof(hof: HofEntry[]): void {
  if (hof.length <= 400) return;
  const cut = hof.length - 100;
  let best = 0;
  for (let i = 1; i < hof.length; i++) if (hof[i]!.best > hof[best]!.best) best = i;
  const kept = hof.filter((_, i) => i >= cut || i === best || i % 2 === 0);
  hof.splice(0, hof.length, ...kept);
}

export async function openSession(ref: EnvRef, deps: { makeClient(): ClientLike } = { makeClient: () => new WorkerClient() }): Promise<Session> {
  const train = deps.makeClient(), stage = deps.makeClient();
  let spec: EnvSpecMsg;
  try { [spec] = await Promise.all([train.init(ref), stage.init(ref)]); }
  catch (e) { train.terminate(); stage.terminate(); throw e; }

  const history: HistoryEntry[] = [], hof: HofEntry[] = [], rewardMarkers: number[] = [];
  const listeners = new Map<string, Set<(m: FromWorker) => void>>(), changeFns = new Set<() => void>();
  let state: Session['state'] = 'idle', speed: Speed = { mode: 'live', mult: 1 }, viewing: Viewing = { kind: 'live' };
  let reward = loadReward(spec), ghosts = true, run: RunInfo | null = null;
  let autoReplay: number | null = null, stageBusy = false, stepping = false, lastVersion = 0;
  let loopTimer: ReturnType<typeof setTimeout> | undefined;

  const emit = (m: FromWorker) => { for (const fn of [...(listeners.get(m.t) ?? [])]) fn(m); };
  const changed = () => { for (const fn of [...changeFns]) fn(); };
  const showsReplays = () => viewing.kind === 'replay' || (viewing.kind === 'live' && autoReplay !== null);
  const sendReplay = (policy: PolicySnapshot) => stage.send({ t: 'stage/replay', policy, seed: run?.seed ?? 1, reward });
  /** Forgets whatever the stage worker was doing for us; the caller decides what it does next. */
  const resetStage = () => { clearTimeout(loopTimer); autoReplay = null; stageBusy = false; };

  train.on('frame', (m) => { if (viewing.kind === 'live' && autoReplay === null) emit(m); });
  train.on('network', (m) => { if (viewing.kind === 'live' && autoReplay === null) emit(m); });
  train.on('status', (m) => { state = m.state; emit(m); changed(); });
  train.on('error', emit);
  train.on('iteration', (m) => {
    const { champion, ...stats } = m.stats;
    history.push(stats);
    hof.push({ iteration: stats.iteration, best: stats.best, policy: champion });
    thinHof(hof);
    if (stats.rewardVersion !== lastVersion) { rewardMarkers.push(stats.iteration); lastVersion = stats.rewardVersion; }
    // Spec section 9: with no live frames (MAX, step) the stage shows champion replays, one at a time.
    if ((speed.mode === 'max' || stepping) && viewing.kind === 'live' && !stageBusy) {
      stageBusy = true; autoReplay = stats.iteration;
      sendReplay(champion);
    }
    if (stepping) { stepping = false; speed = { mode: 'paused' }; }
    emit(m); changed();
  });
  stage.on('frame', (m) => { if (m.source === 'play' ? viewing.kind === 'play' : showsReplays()) emit(m); });
  stage.on('network', (m) => { if (showsReplays()) emit(m); });
  stage.on('error', emit);
  stage.on('episode', (m) => {
    if (m.source === 'play') { if (viewing.kind === 'play') emit(m); return; }
    stageBusy = false;
    const v = viewing;
    if (v.kind === 'replay') {
      const entry = hof.find((e) => e.iteration === v.iteration);
      if (entry) loopTimer = setTimeout(() => { if (viewing === v) sendReplay(entry.policy); }, REPLAY_LOOP_MS);
    }
    emit(m);
  });

  const session: Session = {
    spec, history, hof, rewardMarkers,
    get state() { return state; },
    get speed() { return speed; },
    get viewing() { return viewing; },
    get run() { return run; },
    get autoReplay() { return autoReplay; },
    get reward() { return reward; },
    set reward(cfg) { session.setReward(cfg); },
    on(t, fn) {
      const set = listeners.get(t) ?? new Set();
      listeners.set(t, set);
      const wrapped = fn as (m: FromWorker) => void;
      set.add(wrapped);
      return () => { set.delete(wrapped); };
    },
    onChange(fn) { changeFns.add(fn); return () => { changeFns.delete(fn); }; },
    play(seed) {
      resetStage(); viewing = { kind: 'play' };
      stage.send({ t: 'stage/play', seed, reward });
      changed();
    },
    input(held, pressed) { stage.send({ t: 'stage/input', held, pressed }); },
    start(learner, seed) {
      run = { learner, seed };
      history.length = 0; hof.length = 0; rewardMarkers.length = 0; lastVersion = 0; stepping = false;
      resetStage(); viewing = { kind: 'live' };
      stage.send({ t: 'stage/stop' });
      train.send({ t: 'train/start', learner, reward, seed, speed, ghosts });
      changed();
    },
    setSpeed(s) {
      speed = s; stepping = false;
      if (s.mode === 'live' && autoReplay !== null) { resetStage(); stage.send({ t: 'stage/stop' }); }   // live frames take the stage back
      train.send({ t: 'train/speed', speed: s });
      changed();
    },
    step() {
      if (!run) return;
      stepping = true;
      train.send({ t: 'train/step' });
    },
    setReward(cfg) {
      reward = cfg;
      saveReward(cfg);
      train.send({ t: 'train/reward', reward: cfg });
      stage.send({ t: 'stage/reward', reward: cfg });
      changed();
    },
    setGhosts(on) { ghosts = on; train.send({ t: 'train/ghosts', ghosts: on }); },
    stop() { stepping = false; train.send({ t: 'train/stop' }); },
    replay(entry) {
      resetStage(); viewing = { kind: 'replay', iteration: entry.iteration };
      sendReplay(entry.policy);
      changed();
    },
    backToLive() {
      resetStage(); viewing = { kind: 'live' };
      stage.send({ t: 'stage/stop' });
      changed();
    },
    importChampion(policy, best) {
      const entry: HofEntry = { iteration: 'imported', best, policy };
      const old = hof.findIndex((e) => e.iteration === 'imported');
      if (old >= 0) hof.splice(old, 1);       // one imported slot: replay loops look entries up by iteration
      hof.push(entry);
      session.replay(entry);
    },
    dispose() {
      clearTimeout(loopTimer);
      listeners.clear(); changeFns.clear();
      train.terminate(); stage.terminate();
    },
  };
  return session;
}
