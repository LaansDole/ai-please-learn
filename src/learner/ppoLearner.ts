import { hashSeed, Rng } from '../core/rng';
import { signedWeights } from '../env/reward';
import type { Env, EnvDefinition, RewardConfig } from '../env/types';
import { PpoAgent } from '../rl/ppo';
import type { PpoConfig } from './config';
import { summarise } from './dqnLearner';
import { concatActivations, mlpSnapshot, outputLabels } from './mlpPolicy';
import type { IterationStats, Learner, LiveView } from './types';

export class PpoLearner implements Learner {
  readonly kind = 'ppo' as const;
  iteration = 0;
  private agent: PpoAgent;
  private envs: Env[];
  private alive: boolean[];
  private nObs: number;
  private nAct: number;
  private discrete: boolean;
  private obs: Float32Array;                  // nEnvs x nObs, as seen by the last actBatch
  private rewards: Float32Array;
  private ends: Uint8Array;
  private boot: Float32Array;
  private lastValues: Float32Array;
  private prevTerms: Float32Array;            // nEnvs x terms
  private epReturn: Float64Array;
  private epSteps: Int32Array;
  private episodes: Int32Array;
  private signed: Float32Array;
  private staged: RewardConfig | null = null;
  private rewardVersion = 0;
  private envSteps = 0;
  private returns: number[] = [];
  private netVersion = 0;
  private shown: Float32Array;                // weights the NN graph shows
  private shownPrev: Float32Array;            // the snapshot before that: baseline of the weight-change heat
  private acts: Float32Array;
  private actsStale = true;
  private sizes: number[];
  private last: IterationStats | null = null;

  constructor(cfg: PpoConfig, private def: EnvDefinition, reward: RewardConfig, private seed: number) {
    if (def.action.type === 'candidates') throw new Error('PPO needs discrete or continuous actions');
    const n = cfg.nEnvs, nObs = (this.nObs = def.observation.labels.length);
    this.nAct = def.action.labels.length;
    this.discrete = def.action.type === 'discrete';
    this.agent = new PpoAgent(nObs, { type: def.action.type, size: this.nAct }, cfg, new Rng(hashSeed(seed, 0x50504f)));
    this.sizes = this.agent.net.sizes;
    this.obs = new Float32Array(n * nObs);
    this.rewards = new Float32Array(n); this.ends = new Uint8Array(n); this.boot = new Float32Array(n); this.lastValues = new Float32Array(n);
    this.prevTerms = new Float32Array(n * def.rewardTerms.length);
    this.epReturn = new Float64Array(n); this.epSteps = new Int32Array(n); this.episodes = new Int32Array(n);
    this.signed = signedWeights(def, reward);
    this.shown = (this.agent.net.params as Float32Array).slice();
    this.shownPrev = this.shown.slice();
    this.acts = new Float32Array(this.sizes.reduce((a, b) => a + b, 0));
    this.alive = new Array<boolean>(n).fill(true);
    this.envs = Array.from({ length: n }, () => def.create());
    for (let e = 0; e < n; e++) this.resetEnv(e);
  }

  private resetEnv(e: number): void {
    this.envs[e]!.reset(hashSeed(this.seed, e, ++this.episodes[e]!));
    const nT = this.signed.length;
    this.prevTerms.fill(0, e * nT, e * nT + nT);
    this.epReturn[e] = 0; this.epSteps[e] = 0;
  }

  tick(): boolean {
    const { envs, agent, nObs, nAct, signed } = this, n = envs.length, nT = signed.length, maxSteps = this.def.meta.maxSteps;
    for (let e = 0; e < n; e++) this.obs.set(envs[e]!.observe(), e * nObs);
    const actions = agent.actBatch(this.obs);
    this.actsStale = true;
    for (let e = 0; e < n; e++) {
      const env = envs[e]!;
      env.step(this.discrete ? actions[e]! : (actions as Float32Array).subarray(e * nAct, e * nAct + nAct));
      let r = 0;                                                     // reward = weighted delta of the term counters
      for (let k = 0; k < nT; k++) { const v = env.terms[k]!, p = e * nT + k; r += signed[k]! * (v - this.prevTerms[p]!); this.prevTerms[p] = v; }
      this.rewards[e] = r; this.epReturn[e]! += r;
      if (env.done) this.ends[e] = 1;
      else if (++this.epSteps[e]! >= maxSteps) { this.ends[e] = 2; this.boot[e] = agent.value(env.observe()); }   // time limit: bootstrap
      else { this.ends[e] = 0; continue; }
      this.returns.push(this.epReturn[e]!);
      this.resetEnv(e);
    }
    agent.record(this.rewards, this.ends, this.boot);
    this.envSteps += n;
    if (!agent.full) return false;
    for (let e = 0; e < n; e++) this.lastValues[e] = agent.value(envs[e]!.observe());
    const losses = agent.update(this.lastValues);
    this.iteration++;
    this.last = {
      iteration: this.iteration, learner: 'ppo', ...summarise(this.returns),   // NaN when no episode ended in this rollout
      episodes: this.returns.length, envSteps: this.envSteps, rewardVersion: this.rewardVersion,
      champion: { kind: 'mlp', algo: 'ppo', sizes: this.sizes, hidden: 'tanh', params: (agent.net.params as Float32Array).slice() },
      rl: { ...losses, returns: this.returns },
    };
    this.returns = [];
    if (this.staged) { this.signed = signedWeights(this.def, this.staged); this.staged = null; this.rewardVersion++; }
    this.shownPrev.set(this.shown); this.shown.set(agent.net.params); this.netVersion++;
    return true;
  }

  stats(): IterationStats { if (!this.last) throw new Error('no iteration completed yet'); return this.last; }
  setReward(cfg: RewardConfig): void { this.staged = cfg; }

  live(): LiveView {
    const self = this;
    return {
      envs: this.envs, alive: this.alive, featured: 0, networkVersion: this.netVersion,
      network: () => mlpSnapshot(self.sizes, self.shown, self.def.observation.labels, outputLabels(self.def, 'ppo'), self.shownPrev),
      activations: () => {
        if (self.actsStale) { self.agent.net.forward1(self.obs); concatActivations(self.agent.net, self.acts); self.actsStale = false; }
        return self.acts;
      },
      outputs: () => self.agent.probsOrMeans(),
      fitness: () => self.epReturn[0]!,
    };
  }

  dispose(): void { for (const e of this.envs) e.dispose?.(); this.envs = []; }
}
