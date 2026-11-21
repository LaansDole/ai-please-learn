import { clamp } from '../core/math';
import type { EnvDefinition } from '../env/types';
import { logSoftmaxRow } from '../nn/losses';
import { Mlp } from '../nn/mlp';
import type { NetworkSnapshot, Policy, PolicySnapshot } from './types';

/**
 * Layered graph of an MLP: node ids are sequential layer by layer and edges follow parameter order (biases have no edge).
 * With `prev`, every edge gets delta = |w - prevW| / max|w - prevW| (0 if nothing changed).
 */
export function mlpSnapshot(sizes: number[], params: Float32Array, inLabels: string[], outLabels: string[], prev?: Float32Array): NetworkSnapshot {
  const L = sizes.length - 1;
  const nodes: NetworkSnapshot['nodes'] = [], edges: NetworkSnapshot['edges'] = [];
  for (let l = 0; l <= L; l++) {
    for (let i = 0; i < sizes[l]!; i++) {
      nodes.push({ id: nodes.length, type: l === 0 ? 'input' : l === L ? 'output' : 'hidden', depth: l, label: l === 0 ? inLabels[i] : l === L ? outLabels[i] : undefined });
    }
  }
  let from0 = 0, w0 = 0, maxChange = 0;
  for (let l = 0; l < L; l++) {
    const nin = sizes[l]!, nout = sizes[l + 1]!, to0 = from0 + nin;
    for (let o = 0; o < nout; o++) {
      for (let i = 0; i < nin; i++) {
        const k = w0 + o * nin + i, weight = params[k]!;
        if (!prev) { edges.push({ from: from0 + i, to: to0 + o, weight, enabled: true }); continue; }
        const delta = Math.abs(weight - prev[k]!);
        if (delta > maxChange) maxChange = delta;
        edges.push({ from: from0 + i, to: to0 + o, weight, enabled: true, delta });
      }
    }
    from0 = to0; w0 += nin * nout + nout;
  }
  if (maxChange > 0) for (const e of edges) e.delta = e.delta! / maxChange;
  return { nodes, edges, maxDepth: L };
}

/** Labels of the network's output layer: the actions, plus the value head for PPO. */
export function outputLabels(def: Pick<EnvDefinition, 'action'>, algo: 'dqn' | 'ppo'): string[] {
  const labels = def.action.type === 'candidates' ? [def.action.scoreLabel] : def.action.labels;
  return algo === 'ppo' ? [...labels, 'value'] : labels;
}

/** Copies net.lastActivations (all layers, in node order) into dst. */
export function concatActivations(net: Mlp, dst: Float32Array): Float32Array {
  let off = 0;
  for (const a of net.lastActivations) { dst.set(a, off); off += a.length; }
  return dst;
}

export function createMlpPolicy(snap: Extract<PolicySnapshot, { kind: 'mlp' }>, def: EnvDefinition): Policy {
  if (def.action.type === 'candidates') throw new Error('MLP policies need discrete or continuous actions');
  const net = new Mlp(snap.sizes, snap.hidden);
  net.params.set(snap.params);
  const n = def.action.labels.length, continuous = def.action.type === 'continuous', dqn = snap.algo === 'dqn';
  const network = mlpSnapshot(snap.sizes, snap.params, def.observation.labels, outputLabels(def, snap.algo));
  const acts = new Float32Array(network.nodes.length), outs = new Float32Array(n), action = new Float32Array(n);
  return {
    act(env) {
      const out = net.forward1(env.observe());
      concatActivations(net, acts);
      if (continuous) {
        for (let d = 0; d < n; d++) { outs[d] = out[d]!; action[d] = clamp(out[d]!, -1, 1); }
        return action;
      }
      if (dqn) outs.set(out.subarray(0, n));
      else { logSoftmaxRow(out, 0, n, n + 1, outs); for (let k = 0; k < n; k++) outs[k] = Math.exp(outs[k]!); }
      let best = 0;
      for (let a = 1; a < n; a++) if (out[a]! > out[best]!) best = a;
      return best;
    },
    network: () => network,
    activations: () => acts,
    outputs: () => outs,
  };
}
