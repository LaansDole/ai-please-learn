import { fitness, signedWeights } from '../env/reward';
import type { Env, EnvDefinition, RewardConfig } from '../env/types';
import { createPolicy } from '../learner/policy';
import type { Policy } from '../learner/types';
import { buildFrame } from './frame';
import type { ToWorker } from './protocol';
import type { Post, Scheduler } from './runner';

/** Human play and champion replays at x1 (meta.fps). One session at a time; a new one replaces the old. */
export class StageRunner {
  private mode: 'idle' | 'play' | 'replay' = 'idle';
  private env: Env | null = null;
  private policy: Policy | null = null;
  private steps = 0;
  private signed: Float32Array = new Float32Array(0);
  private session = 0;                        // stale deferred ticks compare against this
  private held: ReadonlySet<string> = new Set();
  private pressed = new Set<string>();

  constructor(private def: EnvDefinition, private post: Post, private sched: Scheduler) {}

  handle(msg: ToWorker): void {
    switch (msg.t) {
      case 'stage/play':
        if (!this.def.human) throw new Error('this environment has no human controls');
        this.begin('play', msg.seed, msg.reward, null);
        break;
      case 'stage/replay': {
        const policy = createPolicy(msg.policy, this.def);
        this.begin('replay', msg.seed, msg.reward, policy);
        this.post({ t: 'network', source: 'replay', net: policy.network() });
        break;
      }
      case 'stage/input':
        this.held = new Set(msg.held);
        for (const k of msg.pressed) this.pressed.add(k);
        break;
      case 'stage/reward': this.signed = signedWeights(this.def, msg.reward); break;
      case 'stage/stop': this.end(); break;
      default: break;
    }
  }

  private begin(mode: 'play' | 'replay', seed: number, reward: RewardConfig, policy: Policy | null): void {
    this.end();
    this.env = this.def.create();
    this.env.reset(seed);
    this.mode = mode; this.policy = policy; this.steps = 0;
    this.signed = signedWeights(this.def, reward);
    this.held = new Set(); this.pressed.clear();
    const interval = 1000 / this.def.meta.fps;
    this.arm(this.session, this.sched.now() + interval, interval);
  }

  private end(): void {
    this.session++;
    this.mode = 'idle';
    this.env?.dispose?.();
    this.env = null; this.policy = null;
  }

  /** Ticks are aimed at absolute due times so timer lateness does not slow the episode below fps. */
  private arm(session: number, due: number, interval: number): void {
    this.sched.defer(() => {
      if (session !== this.session) return;
      this.tick();
      if (session === this.session) this.arm(session, Math.max(due + interval, this.sched.now()), interval);
    }, Math.max(0, due - this.sched.now()));
  }

  private tick(): void {
    const env = this.env!, policy = this.policy;
    if (policy) { env.step(policy.act(env)); this.steps++; }
    else {
      const action = env.humanAct!({ held: this.held, pressed: this.pressed });
      this.pressed.clear();
      if (action !== null) { env.step(action); this.steps++; }
    }
    const source = this.mode as 'play' | 'replay';
    const score = fitness(env.terms, this.signed), terms = Array.from(env.terms);
    const frame = buildFrame(this.def, [env], [true], 0, false);
    if (policy) {
      const activations = policy.activations().slice(), outputs = policy.outputs().slice();
      this.post({ t: 'frame', source, frame, tick: this.steps, fitness: score, terms, activations, outputs }, [activations.buffer, outputs.buffer]);
    } else this.post({ t: 'frame', source, frame, tick: this.steps, fitness: score, terms });
    if (env.done || this.steps >= this.def.meta.maxSteps) {
      this.post({ t: 'episode', source, fitness: score, terms, steps: this.steps });
      this.end();
    }
  }
}
