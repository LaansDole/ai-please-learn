import { createNnGraph } from '../../viz/nnGraph';
import { initialNeatSnapshot } from '../../viz/nnLayout';
import type { NetworkSnapshot } from '../../learner/types';
import { h } from '../dom';
import type { Session } from '../session';

/** live = false: the starting network (step 3). live = true: the featured agent's network as it learns (step 4). */
export function createNetworkPanel(session: Session, opts: { live: boolean }): { el: HTMLElement; dispose(): void } {
  const { spec } = session, graph = createNnGraph();
  const outputs = spec.action.type === 'candidates' ? 1 : spec.action.labels.length;
  const counts = h('span', { class: 'num' });
  const show = (net: NetworkSnapshot, animate: boolean) => {
    graph.setNetwork(net, animate);
    counts.textContent = `nodes ${net.nodes.length}, connections ${net.edges.filter((e) => e.enabled).length}`;
  };
  const toggle = h('input', { type: 'checkbox', testid: 'nn-show-disabled' });
  toggle.addEventListener('change', () => graph.setShowDisabled(toggle.checked));
  const el = h('section', { class: 'panel network' },
    h('h3', null, 'Neural network'),
    !opts.live && h('p', { class: 'muted' }, 'Inputs on the left are what the agent senses each step. Outputs on the right are what it can do; the strongest one becomes its action.'),
    h('div', { class: 'nn-wrap' }, graph.el),
    h('div', { class: 'nn-foot' },
      h('label', { class: 'check' }, toggle, 'Show disabled connections'),
      h('span', { class: 'num muted' }, `${spec.observation.labels.length} inputs -> ${outputs} outputs`),
      counts));
  show(initialNeatSnapshot(spec), false);

  const offs: (() => void)[] = [];
  if (opts.live) {
    let source: string | null = null;
    // A snapshot from another source (live population vs replay) is a different agent, not growth.
    offs.push(session.on('network', (m) => { show(m.net, m.source === source); source = m.source; }));
    offs.push(session.on('frame', (m) => { if (m.activations) graph.setActivations(m.activations); }));
  }
  return { el, dispose() { for (const off of offs) off(); graph.dispose(); } };
}
