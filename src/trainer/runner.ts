import { createLearner } from '../learner/index';
import type { Learner } from '../learner/types';
import type { EnvDefinition } from '../env/types';
import { buildFrame } from './frame';
import type { FromWorker, Speed, ToWorker } from './protocol';

export interface Scheduler { now(): number; defer(fn: () => void, ms: number): void }
export type Post = (m: FromWorker, transfer?: Transferable[]) => void;

const SLICE_MS = 12, FRAME_MS = 16, NETWORK_MS = 250, STATUS_MS = 1000;

export class TrainRunner {
  private learner: Learner | null = null;
  private speed: Speed = { mode: 'paused' };
  private stepping = false;
  private ghosts = true;
  private scheduled = false;
  private owed = 0;
  private lastPump = 0;
  private lastFrame = -Infinity;
  private lastNetwork = -Infinity;
  private lastStatus = -Infinity;
  private sentNetVersion = -1;
  private ticksInWindow = 0;
  private windowStart = 0;
  private ticksPerSec = 0;

  constructor(private def: EnvDefinition, private post: Post, private sched: Scheduler) {}

  handle(msg: ToWorker): void {
    switch (msg.t) {
      case 'train/start':
        this.learner?.dispose();
        this.learner = createLearner(msg.learner, this.def, msg.reward, msg.seed);
        this.speed = msg.speed; this.ghosts = msg.ghosts; this.stepping = false;
        this.owed = 0; this.sentNetVersion = -1; this.lastPump = this.windowStart = this.sched.now();
        this.postStatus(); this.schedule(0);
        break;
      case 'train/speed':
        this.speed = msg.speed; this.stepping = false; this.owed = 0; this.lastPump = this.sched.now();
        this.postStatus(); this.schedule(0);
        break;
      case 'train/step': this.stepping = true; this.postStatus(); this.schedule(0); break;
      case 'train/reward': this.learner?.setReward(msg.reward); break;
      case 'train/ghosts': this.ghosts = msg.ghosts; break;
      case 'train/stop': this.learner?.dispose(); this.learner = null; this.speed = { mode: 'paused' }; this.stepping = false; this.postStatus(); break;
      default: break;
    }
  }

  private get running(): boolean { return this.learner !== null && (this.stepping || this.speed.mode !== 'paused'); }

  private schedule(ms: number): void {
    if (this.scheduled || !this.running) return;
    this.scheduled = true;
    this.sched.defer(this.pump, ms);
  }

  private postStatus(): void {
    const rate = this.def.meta.fps;
    this.post({
      t: 'status', state: this.learner === null ? 'idle' : this.running ? 'running' : 'paused',
      iteration: this.learner?.iteration ?? 0, ticksPerSec: this.ticksPerSec, effectiveMult: this.ticksPerSec / rate,
    });
    this.lastStatus = this.sched.now();
  }

  private pump = (): void => {
    this.scheduled = false;
    const l = this.learner;
    if (!l || !this.running) return;
    const now = this.sched.now();
    const unbounded = this.stepping || this.speed.mode === 'max';
    const rate = this.speed.mode === 'live' ? this.def.meta.fps * this.speed.mult : 0;
    if (!unbounded) this.owed = Math.min(this.owed + ((now - this.lastPump) * rate) / 1000, rate * 0.1 + 1);
    this.lastPump = now;
    const deadline = now + SLICE_MS;
    while ((unbounded || this.owed >= 1) && this.sched.now() < deadline) {
      const iterationDone = l.tick();
      this.ticksInWindow++;
      if (!unbounded) this.owed -= 1;
      if (iterationDone) {
        this.post({ t: 'iteration', stats: l.stats() });
        if (this.stepping) { this.stepping = false; this.speed = { mode: 'paused' }; break; }
      }
    }
    const t = this.sched.now();
    if (t - this.windowStart >= 500) { this.ticksPerSec = (this.ticksInWindow * 1000) / (t - this.windowStart); this.ticksInWindow = 0; this.windowStart = t; }
    if (this.speed.mode === 'live' && !this.stepping) this.emitLive(l, t);
    if (!this.running || t - this.lastStatus >= STATUS_MS) this.postStatus();
    if (unbounded) this.schedule(0);
    else this.schedule(this.owed >= 1 ? 0 : Math.min(FRAME_MS, ((1 - this.owed) * 1000) / rate));
  };

  private emitLive(l: Learner, t: number): void {
    if (t - this.lastFrame < FRAME_MS) return;
    this.lastFrame = t;
    const live = l.live();
    if (live.networkVersion !== this.sentNetVersion && t - this.lastNetwork >= NETWORK_MS) {
      this.sentNetVersion = live.networkVersion; this.lastNetwork = t;
      this.post({ t: 'network', source: 'train', net: live.network() });
    }
    const env = live.envs[live.featured]!;
    const activations = live.activations().slice(), outputs = live.outputs().slice();
    this.post({
      t: 'frame', source: 'train', frame: buildFrame(this.def, live.envs, live.alive, live.featured, this.ghosts),
      tick: 0, fitness: live.fitness(), terms: Array.from(env.terms), activations, outputs,
    }, [activations.buffer, outputs.buffer]);
  }
}
