import type { Rng } from '../core/rng';

export interface ReplayBatch { obs: Float32Array; actions: Int32Array; rewards: Float32Array; nextObs: Float32Array; terminals: Float32Array }

/** Uniform ring buffer in flat arrays. */
export class ReplayBuffer {
  size = 0;
  private head = 0;
  private obs: Float32Array;
  private nextObs: Float32Array;
  private actions: Int32Array;
  private rewards: Float32Array;
  private terminals: Float32Array;

  constructor(private capacity: number, private obsSize: number) {
    this.obs = new Float32Array(capacity * obsSize);
    this.nextObs = new Float32Array(capacity * obsSize);
    this.actions = new Int32Array(capacity);
    this.rewards = new Float32Array(capacity);
    this.terminals = new Float32Array(capacity);
  }

  /** Copies; overwrites the oldest when full. */
  push(obs: Float32Array, action: number, reward: number, nextObs: Float32Array, terminal: boolean): void {
    const i = this.head, n = this.obsSize;
    this.obs.set(obs.subarray(0, n), i * n);
    this.nextObs.set(nextObs.subarray(0, n), i * n);
    this.actions[i] = action; this.rewards[i] = reward; this.terminals[i] = terminal ? 1 : 0;
    this.head = (i + 1) % this.capacity;
    if (this.size < this.capacity) this.size++;
  }

  sample(batch: number, rng: Rng, out: ReplayBatch): void {
    const n = this.obsSize;
    for (let b = 0; b < batch; b++) {
      const i = rng.int(this.size);
      out.obs.set(this.obs.subarray(i * n, i * n + n), b * n);
      out.nextObs.set(this.nextObs.subarray(i * n, i * n + n), b * n);
      out.actions[b] = this.actions[i]!; out.rewards[b] = this.rewards[i]!; out.terminals[b] = this.terminals[i]!;
    }
  }
}
