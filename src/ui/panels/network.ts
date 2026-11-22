import type { EnvSpecMsg, LearnerKind } from '../../env/types';
import { resolveConfig } from '../../learner/config';
import type { NetworkSnapshot } from '../../learner/types';
import type { RunPrefs } from '../../persist/storage';
import { createNnGraph } from '../../viz/nnGraph';
import { initialMlpSnapshot, initialNeatSnapshot, strongCutoff, STRONG_EDGES } from '../../viz/nnLayout';
import { h } from '../dom';
import type { Session } from '../session';
import { createMethodPicker } from './method';

const MLP_WEIGHT_SCALE = 2;                   // MLP weights start around 0.2 where NEAT's are around 1: drawn 2x so training visibly thickens them
const NAMES: Record<LearnerKind, string> = { neat: 'NEAT', dqn: 'DQN', ppo: 'PPO' };

/** What the chosen method starts from, before any training. */
function initialSnapshot(spec: EnvSpecMsg, kind: LearnerKind): NetworkSnapshot {
  const cfg = resolveConfig(kind, spec);
  return cfg.kind === 'neat' ? initialNeatSnapshot(spec) : initialMlpSnapshot(spec, cfg.kind, cfg.kind === 'dqn' ? cfg.dqn.hidden : cfg.ppo.hidden);
}

/** Replayed champions carry no weight-change heat of their own: mark what changed since the champion shown before. */
function markChanges(prev: NetworkSnapshot, next: NetworkSnapshot): void {
  if (prev.edges.length !== next.edges.length || next.edges[0]?.delta !== undefined) return;
  let max = 0;
  for (let i = 0; i < next.edges.length; i++) max = Math.max(max, Math.abs(next.edges[i]!.weight - prev.edges[i]!.weight));
  if (max > 0) next.edges.forEach((e, i) => { e.delta = Math.abs(e.weight - prev.edges[i]!.weight) / max; });
}

/**
 * live = false (step 3): the method picker and the network that method starts from.
 * live = true (step 4): the featured agent's network as it learns. `restart` starts a new run from `prefs`.
 */
export function createNetworkPanel(session: Session, prefs: RunPrefs, opts: { live: boolean; restart(): void }): { el: HTMLElement; refresh(): void; dispose(): void } {
  const { spec } = session, graph = createNnGraph();
  const outputs = spec.action.type === 'candidates' ? 1 : spec.action.labels.length;
  const counts = h('span', { class: 'num' });
  const reading = h('p', { class: 'chart-note', testid: 'network-reading' });
  const show = (net: NetworkSnapshot, animate: boolean) => {
    graph.setNetwork(net, animate);
    const enabled = net.edges.filter((e) => e.enabled).length;
    counts.textContent = `nodes ${net.nodes.length}, connections ${enabled}`;
    const full = strongCutoff(net.edges) > 0 ? `The ${STRONG_EDGES} strongest of ${enabled} connections are drawn in full. ` : '';
    const text = `${full}Solid green excites, dashed russet inhibits. Node fill is activation right now.`;
    if (reading.textContent !== text) reading.textContent = text;
  };
  const caption = h('p', { class: 'muted', testid: 'network-caption' });
  const showInitial = (kind: LearnerKind) => {
    graph.setWeightScale(kind === 'neat' ? 1 : MLP_WEIGHT_SCALE);
    show(initialSnapshot(spec, kind), false);
    caption.textContent = kind === 'neat' ? 'NEAT starts with no hidden neurons and grows them.' : `${NAMES[kind]} keeps this shape and changes the connection strengths.`;
  };
  const toggle = h('input', { type: 'checkbox', testid: 'nn-show-disabled' });
  toggle.addEventListener('change', () => graph.setShowDisabled(toggle.checked));
  const panel = h('section', { class: 'panel network' },
    h('h3', null, opts.live ? 'Its network' : 'Neural network'),
    !opts.live && h('p', { class: 'muted' }, 'Inputs on the left are what the agent senses each step. Outputs on the right are what it can do. The strongest one becomes its action.'),
    !opts.live && caption,
    h('div', { class: 'nn-wrap' }, graph.el),
    opts.live && reading,
    h('div', { class: 'nn-foot' },
      h('label', { class: 'check' }, toggle, 'Show disabled connections'),
      h('span', { class: 'num muted' }, `${spec.observation.labels.length} inputs -> ${outputs} outputs`),
      counts));

  const offs: (() => void)[] = [];
  let el: HTMLElement = panel, refresh: () => void;
  if (opts.live) {
    let source: string | null = null, last: NetworkSnapshot | null = null, run = session.run;
    // A snapshot from another source (live population vs replay) is a different agent, not growth.
    offs.push(session.on('network', (m) => {
      const same = m.source === source;
      if (same && last && session.run?.learner.kind !== 'neat') markChanges(last, m.net);
      show(m.net, same); source = m.source; last = m.net;
    }));
    offs.push(session.on('frame', (m) => { if (m.activations) graph.setActivations(m.activations); }));
    offs.push(session.onChange(() => {
      if (session.run === run || !session.run) return;
      run = session.run; source = last = null;
      showInitial(run.learner.kind);
    }));
    refresh = () => { if (!session.run) showInitial(prefs.learner); };
  } else {
    const again = h('button', { testid: 'method-restart', onclick: () => opts.restart() });
    const note = h('p', { class: 'method-note', testid: 'method-note', hidden: true }, 'The current run keeps its method. ', again);
    refresh = () => {
      showInitial(prefs.learner);
      note.hidden = !session.run || session.run.learner.kind === prefs.learner;
      again.textContent = `Restart with ${NAMES[prefs.learner]}`;
    };
    offs.push(session.onChange(() => { note.hidden = !session.run || session.run.learner.kind === prefs.learner; }));
    el = h('div', { class: 'method-step' }, createMethodPicker(spec, prefs, refresh), note, panel);
  }
  refresh();
  return { el, refresh, dispose() { for (const off of offs) off(); graph.dispose(); } };
}
