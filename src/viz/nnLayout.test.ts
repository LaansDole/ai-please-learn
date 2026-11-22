import { describe, expect, it } from 'vitest';
import type { NetworkSnapshot } from '../learner/types';
import { pong } from '../envs/pong';
import { diffSnapshots, edgeStyle, initialMlpSnapshot, layoutNetwork, strongEdges, STRONG_EDGES, visibleEdges } from './nnLayout';

const net: NetworkSnapshot = {
  maxDepth: 2,
  nodes: [
    { id: 0, type: 'input', depth: 0, label: 'a' }, { id: 1, type: 'input', depth: 0, label: 'b' },
    { id: 2, type: 'output', depth: 2, label: 'out' }, { id: 5, type: 'hidden', depth: 1 },
  ],
  edges: [
    { from: 0, to: 2, weight: 1, enabled: true }, { from: 1, to: 5, weight: -2, enabled: true },
    { from: 5, to: 2, weight: 0.5, enabled: true }, { from: 1, to: 2, weight: 3, enabled: false },
  ],
};

describe('nn layout', () => {
  it('places layers by depth and spreads nodes vertically', () => {
    const p = layoutNetwork(net, 500, 200, { l: 100, r: 100, t: 0, b: 0 });
    expect(p.get(0)!.x).toBe(100); expect(p.get(2)!.x).toBe(400); expect(p.get(5)!.x).toBe(250);
    expect(p.get(0)!.y).toBeLessThan(p.get(1)!.y);
    expect(p.get(2)!.y).toBeCloseTo(100); expect(p.get(5)!.y).toBeCloseTo(100);
    expect((p.get(0)!.y + p.get(1)!.y) / 2).toBeCloseTo(100);
  });
  it('diffs topology growth', () => {
    const grown: NetworkSnapshot = { ...net, nodes: [...net.nodes, { id: 6, type: 'hidden', depth: 1 }], edges: [...net.edges.slice(1), { from: 0, to: 6, weight: 1, enabled: true }] };
    expect(diffSnapshots(net, grown)).toEqual({ addedNodes: [6], removedNodes: [], addedEdges: ['0>6'], removedEdges: ['0>2'] });
    expect(diffSnapshots(null, net).addedNodes).toEqual([]);
  });
  it('styles edges by sign and magnitude, without relying on hue alone', () => {
    expect(edgeStyle(2)).toEqual({ width: 2.5, alpha: 0.85, dashed: false });
    expect(edgeStyle(-8)).toEqual({ width: 4, alpha: 0.85, dashed: true });
    expect(edgeStyle(0).alpha).toBe(0.25);
  });
  it('caps edges per layer pair by magnitude', () => {
    const big: NetworkSnapshot = { maxDepth: 1, nodes: [], edges: Array.from({ length: 1000 }, (_, i) => ({ from: i, to: 5000, weight: i / 1000, enabled: true })) };
    big.nodes = [...big.edges.map((e) => ({ id: e.from, type: 'input' as const, depth: 0 })), { id: 5000, type: 'output', depth: 1 }];
    const v = visibleEdges(big, 400);
    expect(v.length).toBe(400); expect(Math.min(...v.map((e) => e.weight))).toBeCloseTo(0.6);
  });
});

describe('initialMlpSnapshot', () => {
  it('is the fixed layered shape DQN/PPO train, with labelled outputs', () => {
    const s = initialMlpSnapshot(pong, 'ppo', [32, 32]);
    expect(s.nodes.length).toBe(6 + 32 + 32 + 4);
    expect(s.nodes.filter((n) => n.type === 'output').map((n) => n.label)).toEqual(['up', 'stay', 'down', 'value']);
    expect(s.maxDepth).toBe(3);
    expect(initialMlpSnapshot(pong, 'dqn', [32, 32]).nodes.length).toBe(6 + 32 + 32 + 3);
  });
});

describe('strongEdges', () => {
  const edges = (ws: number[]) => ws.map((weight, i) => ({ from: 0, to: i + 1, weight, enabled: true }));
  it('is null for a small network: every link is drawn in full', () => {
    expect(strongEdges(edges([1, -2, 3]), 2, 3)).toBeNull();
  });
  it('is the n strongest links by |weight| past the threshold', () => {
    const e = edges([0.1, -5, 3, 0.2, 4]);
    expect(strongEdges(e, 2, 3)).toEqual(new Set([e[1], e[4]]));
  });
  it('ignores disabled links', () => {
    const e = edges([9, 1, 2, 3, 4]); e[0]!.enabled = false;
    expect(strongEdges(e, 1, 3)).toEqual(new Set([e[4]]));
  });
  it('is exactly n links when weights tie (a fresh NEAT network: every weight 0.5)', () => {
    expect(strongEdges(edges(new Array<number>(40).fill(0.5)))!.size).toBe(STRONG_EDGES);
  });
});
