import type { Rng } from '../core/rng';
import type { DqnConfig } from '../learner/config';
import { Adam, clipGradNorm } from '../nn/adam';
import { huberTd } from '../nn/losses';
import { Mlp, type FloatArray } from '../nn/mlp';
import { ReplayBuffer, type ReplayBatch } from './replay';

/** y = r + gamma * (1 - terminal) * Qtarget(s', argmax_a Qonline(s', a)); the Q rows start at `off` and hold `n` actions. */
export function ddqnTarget(
  reward: number, terminal: boolean, gamma: number, qOnlineNext: FloatArray, qTargetNext: FloatArray, off = 0, n = qOnlineNext.length,
): number {
  if (terminal) return reward;
  let best = 0;
  for (let a = 1; a < n; a++) if (qOnlineNext[off + a]! > qOnlineNext[off + best]!) best = a;
  return reward + gamma * qTargetNext[off + best]!;
}

export class DqnAgent {
  readonly online: Mlp;
  readonly target: Mlp;
  /** Env steps observed. */
  steps = 0;
  private buffer: ReplayBuffer;
  private adam: Adam;
  private batch: ReplayBatch;
  private targets: Float32Array;
  private dOut: Float32Array;

  constructor(obsSize: number, private nActions: number, private cfg: DqnConfig, private rng: Rng) {
    const sizes = [obsSize, ...cfg.hidden, nActions];
    this.online = new Mlp(sizes, 'relu');
    this.target = new Mlp(sizes, 'relu');
    this.online.init(rng);
    this.target.copyParamsFrom(this.online);
    this.buffer = new ReplayBuffer(cfg.bufferSize, obsSize);
    this.adam = new Adam(this.online.params, cfg.lr);
    const B = cfg.batchSize;
    this.batch = {
      obs: new Float32Array(B * obsSize), actions: new Int32Array(B), rewards: new Float32Array(B),
      nextObs: new Float32Array(B * obsSize), terminals: new Float32Array(B),
    };
    this.targets = new Float32Array(B);
    this.dOut = new Float32Array(B * nActions);
  }

  /** Linear from epsilonStart to epsilonEnd over epsilonDecaySteps. */
  get epsilon(): number {
    const { epsilonStart: s, epsilonEnd: e, epsilonDecaySteps: n } = this.cfg;
    return s + (e - s) * Math.min(1, this.steps / n);
  }

  /** Epsilon-greedy unless greedy; always leaves the Q-values of obs in online.lastActivations. */
  act(obs: Float32Array, greedy = false): number {
    const q = this.online.forward1(obs);
    if (!greedy && this.rng.next() < this.epsilon) return this.rng.int(this.nActions);
    let best = 0;
    for (let a = 1; a < this.nActions; a++) if (q[a]! > q[best]!) best = a;
    return best;
  }

  /** Q-values from the last act(). */
  qValues(): Float32Array { return this.online.lastActivations[this.online.sizes.length - 1] as Float32Array; }

  /** Stores the transition and trains when due; returns the TD loss of that update or null. */
  observe(obs: Float32Array, action: number, reward: number, nextObs: Float32Array, terminal: boolean): number | null {
    const c = this.cfg, B = c.batchSize, nA = this.nActions;
    this.buffer.push(obs, action, reward, nextObs, terminal);
    this.steps++;
    let loss: number | null = null;
    if (this.steps >= c.learnStart && this.steps % c.trainEvery === 0 && this.buffer.size >= B) {
      const s = this.batch;
      this.buffer.sample(B, this.rng, s);
      const qNextOnline = this.online.forward(s.nextObs, B), qNextTarget = this.target.forward(s.nextObs, B);
      for (let b = 0; b < B; b++) this.targets[b] = ddqnTarget(s.rewards[b]!, s.terminals[b] === 1, c.gamma, qNextOnline, qNextTarget, b * nA, nA);
      loss = huberTd(this.online.forward(s.obs, B), s.actions, this.targets, nA, B, this.dOut);
      this.online.zeroGrad();
      this.online.backward(this.dOut, B);
      clipGradNorm(this.online.grads, c.maxGradNorm);
      this.adam.step(this.online.grads);
    }
    if (this.steps % c.targetSyncEvery === 0) this.target.copyParamsFrom(this.online);
    return loss;
  }
}
