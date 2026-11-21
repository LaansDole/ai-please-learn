import type { Action, ActionSpec, Env, EnvDefinition } from '../env/types';
import type { Genome } from '../neat/genome';
import { compile, type Network } from '../neat/network';
import { createMlpPolicy } from './mlpPolicy';
import type { NetworkSnapshot, Policy, PolicySnapshot } from './types';

/** Ties go to the lowest index. */
export function argmax(v: Float32Array): number {
  let b = 0;
  for (let i = 1; i < v.length; i++) if (v[i]! > v[b]!) b = i;
  return b;
}

export function netAct(net: Network, env: Env, spec: ActionSpec): Action {
  if (spec.type === 'candidates') {
    const cands = env.candidates!();
    let best = 0, bestScore = -Infinity;
    for (let i = 0; i < cands.length; i++) { const s = net.activate(cands[i]!)[0]!; if (s > bestScore) { bestScore = s; best = i; } }
    net.activate(cands[best]!);                 // leave the chosen candidate's activations in net.values for the NN graph
    return best;
  }
  const out = net.activate(env.observe());
  return spec.type === 'discrete' ? argmax(out) : out;   // continuous: a view; envs must not keep a reference
}

export function genomeSnapshot(g: Genome, net: Network, def: Pick<EnvDefinition, 'observation' | 'action'>): NetworkSnapshot {
  const outLabels = def.action.type === 'candidates' ? [def.action.scoreLabel] : def.action.labels;
  let iIn = 0, iOut = 0;
  return {
    maxDepth: net.maxDepth,
    nodes: g.nodes.map((n, i) => ({
      id: n.id, type: n.type, depth: net.depths[i]!,
      label: n.type === 'input' ? def.observation.labels[iIn++] : n.type === 'output' ? outLabels[iOut++] : undefined,
    })),
    edges: g.conns.map((c) => ({ from: c.from, to: c.to, weight: c.weight, enabled: c.enabled })),
  };
}

export function createPolicy(snap: PolicySnapshot, def: EnvDefinition): Policy {
  if (snap.kind === 'mlp') return createMlpPolicy(snap, def);
  const net = compile(snap.genome);
  const snapshot = genomeSnapshot(snap.genome, net, def);
  const outputs = net.values.subarray(net.nIn, net.nIn + net.nOut);
  return {
    act: (env) => netAct(net, env, def.action),
    network: () => snapshot,
    activations: () => net.values,
    outputs: () => outputs,
  };
}
