import { hashSeed, Rng } from '../core/rng';
import { fitness, signedWeights } from '../env/reward';
import type { Env, EnvDefinition, RewardConfig } from '../env/types';
import type { NeatConfig } from '../neat/config';
import { cloneGenome } from '../neat/genome';
import { compile, type Network } from '../neat/network';
import { Population } from '../neat/population';
import { genomeSnapshot, netAct } from './policy';
import type { IterationStats, Learner, LiveView } from './types';

export class NeatLearner implements Learner {
  readonly kind = 'neat' as const;
  iteration = 0;
  private pop: Population;
  private envs: Env[];
  private nets: Network[] = [];
  private alive: boolean[];
  private steps: Int32Array;
  private fitSum: Float64Array;
  private episode = 0;
  private featured = 0;
  private netVersion = 0;
  private signed: Float32Array;
  private staged: RewardConfig | null = null;
  private rewardVersion = 0;
  private envSteps = 0;
  private last: IterationStats | null = null;

  constructor(private cfg: NeatConfig, private def: EnvDefinition, reward: RewardConfig, private seed: number) {
    const nIn = def.observation.labels.length;
    const cand = def.action.type === 'candidates';
    const nOut = def.action.type === 'candidates' ? 1 : def.action.labels.length;
    this.pop = new Population(nIn, nOut, cand ? 'identity' : 'tanh', cfg, new Rng(hashSeed(seed, 0x4e454154)));
    const n = cfg.populationSize;
    this.envs = Array.from({ length: n }, () => def.create());
    this.alive = new Array<boolean>(n).fill(false);
    this.steps = new Int32Array(n);
    this.fitSum = new Float64Array(n);
    this.signed = signedWeights(def, reward);
    this.beginGeneration();
  }

  private beginGeneration(): void {
    this.nets = this.pop.genomes.map(compile);
    this.fitSum.fill(0);
    this.episode = 0;
    this.beginEpisode();
  }

  private beginEpisode(): void {
    const s = hashSeed(this.seed, this.pop.generation, this.episode);
    for (let i = 0; i < this.envs.length; i++) { this.envs[i]!.reset(s); this.alive[i] = true; this.steps[i] = 0; }
    this.featured = 0;
    this.netVersion++;
  }

  private pickFeatured(): void {
    let best = -1, bestFit = -Infinity;
    for (let i = 0; i < this.envs.length; i++) {
      if (!this.alive[i]) continue;
      const f = fitness(this.envs[i]!.terms, this.signed);
      if (f > bestFit) { bestFit = f; best = i; }
    }
    if (best >= 0 && best !== this.featured) { this.featured = best; this.netVersion++; }
  }

  tick(): boolean {
    const max = this.def.meta.maxSteps;
    let anyAlive = false;
    for (let i = 0; i < this.envs.length; i++) {
      if (!this.alive[i]) continue;
      const env = this.envs[i]!;
      env.step(netAct(this.nets[i]!, env, this.def.action));
      this.envSteps++;
      if (env.done || ++this.steps[i]! >= max) { this.alive[i] = false; this.fitSum[i]! += fitness(env.terms, this.signed); }
      else anyAlive = true;
    }
    if (anyAlive) { if (!this.alive[this.featured]) this.pickFeatured(); return false; }
    if (++this.episode < this.cfg.episodesPerGenome) { this.beginEpisode(); return false; }
    this.finishGeneration();
    return true;
  }

  private finishGeneration(): void {
    const n = this.envs.length, eps = this.cfg.episodesPerGenome;
    const fits = new Array<number>(n);
    for (let i = 0; i < n; i++) { fits[i] = this.fitSum[i]! / eps; this.pop.genomes[i]!.fitness = fits[i]!; }
    const sorted = [...fits].sort((a, b) => a - b);
    const champ = this.pop.best();
    const species = this.pop.epoch();
    this.iteration++;
    this.last = {
      iteration: this.iteration, learner: 'neat',
      best: sorted[n - 1]!, mean: fits.reduce((a, b) => a + b, 0) / n, median: sorted[n >> 1]!,
      episodes: n * eps, envSteps: this.envSteps, rewardVersion: this.rewardVersion,
      champion: { kind: 'neat', genome: { ...cloneGenome(champ, champ.id), fitness: champ.fitness } },
      neat: {
        population: n, species,
        nodes: champ.nodes.length, conns: champ.conns.filter((c) => c.enabled).length,
      },
    };
    if (this.staged) { this.signed = signedWeights(this.def, this.staged); this.staged = null; this.rewardVersion++; }
    this.beginGeneration();
  }

  stats(): IterationStats { if (!this.last) throw new Error('no iteration completed yet'); return this.last; }
  setReward(cfg: RewardConfig): void { this.staged = cfg; }

  live(): LiveView {
    const self = this;
    return {
      envs: this.envs, alive: this.alive, featured: this.featured, networkVersion: this.netVersion,
      network: () => genomeSnapshot(self.pop.genomes[self.featured]!, self.nets[self.featured]!, self.def),
      activations: () => self.nets[self.featured]!.values,
      outputs: () => { const net = self.nets[self.featured]!; return net.values.subarray(net.nIn, net.nIn + net.nOut); },
      fitness: () => fitness(self.envs[self.featured]!.terms, self.signed),
    };
  }

  dispose(): void { for (const e of this.envs) e.dispose?.(); this.envs = []; this.nets = []; }
}
