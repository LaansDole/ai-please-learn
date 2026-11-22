import { hashSeed, Rng } from '../core/rng';
import { signedWeights } from '../env/reward';
import type { Env, EnvDefinition, RewardConfig } from '../env/types';
import { DqnAgent } from '../rl/dqn';
import type { DqnConfig } from './config';
import { concatActivations, mlpSnapshot, outputLabels } from './mlpPolicy';
import type { IterationStats, Learner, LiveView } from './types';

const NETWORK_EVERY = 50;                     // ticks between refreshed weight snapshots for the NN graph (5 s of Snake at x1); a refresh copies the parameters, nothing more

/** Best, mean and median of the episode returns finished in an iteration; NaN when none finished: there is no score to report. */
export function summarise(returns: number[]): { best: number; mean: number; median: number } {
  const sorted = [...returns].sort((a, b) => a - b), n = sorted.length;
  if (n === 0) return { best: NaN, mean: NaN, median: NaN };
  return { best: sorted[n - 1]!, mean: sorted.reduce((a, b) => a + b, 0) / n, median: sorted[n >> 1]! };
}

export class DqnLearner implements Learner {
  readonly kind = 'dqn' as const;
  iteration = 0;
  private agent: DqnAgent;
  private env: Env;
  private obs: Float32Array;
  private signed: Float32Array;
  private prevTerms: Float32Array;
  private staged: RewardConfig | null = null;
  private rewardVersion = 0;
  private envSteps = 0;
  private epSteps = 0;
  private epReturn = 0;
  private episodeCount = 0;
  private returns: number[] = [];
  private lossSum = 0;
  private lossN = 0;
  private netVersion = 0;
  private shown: Float32Array;                // weights the NN graph shows
  private shownPrev: Float32Array;            // the snapshot before that: baseline of the weight-change heat
  private acts: Float32Array;
  private sizes: number[];
  private last: IterationStats | null = null;

  constructor(private cfg: DqnConfig, private def: EnvDefinition, reward: RewardConfig, private seed: number) {
    if (def.action.type !== 'discrete') throw new Error('DQN needs discrete actions');
    const nObs = def.observation.labels.length;
    this.agent = new DqnAgent(nObs, def.action.labels.length, cfg, new Rng(hashSeed(seed, 0x44514e)));
    this.sizes = this.agent.online.sizes;
    this.obs = new Float32Array(nObs);
    this.signed = signedWeights(def, reward);
    this.prevTerms = new Float32Array(def.rewardTerms.length);
    this.shown = (this.agent.online.params as Float32Array).slice();
    this.shownPrev = this.shown.slice();
    this.acts = new Float32Array(this.sizes.reduce((a, b) => a + b, 0));
    this.env = def.create();
    this.resetEnv();
  }

  private resetEnv(): void {
    this.env.reset(hashSeed(this.seed, ++this.episodeCount));
    this.prevTerms.fill(0);
    this.epReturn = this.epSteps = 0;
  }

  private refreshNetwork(): void {
    this.shownPrev.set(this.shown);
    this.shown.set(this.agent.online.params);
    this.netVersion++;
  }

  tick(): boolean {
    const env = this.env;
    this.obs.set(env.observe());
    const a = this.agent.act(this.obs);
    env.step(a);
    this.envSteps++; this.epSteps++;
    let r = 0;                                                         // reward = weighted delta of the term counters
    for (let k = 0; k < this.signed.length; k++) { const v = env.terms[k]!; r += this.signed[k]! * (v - this.prevTerms[k]!); this.prevTerms[k] = v; }
    this.epReturn += r;
    const truncated = !env.done && this.epSteps >= this.def.meta.maxSteps;
    const loss = this.agent.observe(this.obs, a, r, env.observe(), env.done);     // truncation is not terminal
    if (loss !== null) { this.lossSum += loss; this.lossN++; }
    if (this.envSteps % NETWORK_EVERY === 0) this.refreshNetwork();
    if (!env.done && !truncated) return false;
    this.returns.push(this.epReturn);
    this.resetEnv();
    if (this.returns.length < this.cfg.episodesPerIteration) return false;
    this.finishIteration();
    return true;
  }

  private finishIteration(): void {
    this.iteration++;
    this.last = {
      iteration: this.iteration, learner: 'dqn', ...summarise(this.returns),
      episodes: this.returns.length, envSteps: this.envSteps, rewardVersion: this.rewardVersion,
      champion: { kind: 'mlp', algo: 'dqn', sizes: this.sizes, hidden: 'relu', params: (this.agent.online.params as Float32Array).slice() },
      rl: { tdLoss: this.lossN ? this.lossSum / this.lossN : undefined, epsilon: this.agent.epsilon, returns: this.returns },
    };
    this.returns = []; this.lossSum = this.lossN = 0;
    if (this.staged) { this.signed = signedWeights(this.def, this.staged); this.staged = null; this.rewardVersion++; }
    this.refreshNetwork();
  }

  stats(): IterationStats { if (!this.last) throw new Error('no iteration completed yet'); return this.last; }
  setReward(cfg: RewardConfig): void { this.staged = cfg; }

  live(): LiveView {
    const self = this;
    return {
      envs: [this.env], alive: [true], featured: 0, networkVersion: this.netVersion,
      network: () => mlpSnapshot(self.sizes, self.shown, self.def.observation.labels, outputLabels(self.def, 'dqn'), self.shownPrev),
      activations: () => concatActivations(self.agent.online, self.acts),
      outputs: () => self.agent.qValues(),
      fitness: () => self.epReturn,
    };
  }

  dispose(): void { this.env.dispose?.(); }
}
