import type { Rng } from '../core/rng';
import type { NeatConfig } from './config';

export type Activation = 'tanh' | 'identity';
export interface NodeGene { id: number; type: 'input' | 'output' | 'hidden'; bias: number; act: Activation }
export interface ConnGene { innov: number; from: number; to: number; weight: number; enabled: boolean }
export interface Genome {
  id: number;
  nodes: NodeGene[];        // inputs (ids 0..I-1), outputs (ids I..I+O-1), then hidden in creation order
  conns: ConnGene[];        // sorted ascending by innov
  fitness: number;          // raw fitness of the last evaluation
  speciesId: number;        // -1 before speciation
}

export function createInitialGenome(id: number, nIn: number, nOut: number, outAct: Activation, rng: Rng, cfg: NeatConfig): Genome {
  const nodes: NodeGene[] = [];
  for (let i = 0; i < nIn; i++) nodes.push({ id: i, type: 'input', bias: 0, act: 'identity' });
  for (let o = 0; o < nOut; o++) nodes.push({ id: nIn + o, type: 'output', bias: 0, act: outAct });
  const conns: ConnGene[] = [];
  for (let i = 0; i < nIn; i++) {
    for (let o = 0; o < nOut; o++) conns.push({ innov: i * nOut + o, from: i, to: nIn + o, weight: rng.gaussian() * cfg.weightInitSigma, enabled: true });
  }
  return { id, nodes, conns, fitness: 0, speciesId: -1 };
}

export function cloneGenome(g: Genome, id: number): Genome {
  return { id, nodes: g.nodes.map((n) => ({ ...n })), conns: g.conns.map((c) => ({ ...c })), fitness: 0, speciesId: -1 };
}

export function hiddenCount(g: Genome): number {
  let n = 0;
  for (const nd of g.nodes) if (nd.type === 'hidden') n++;
  return n;
}
