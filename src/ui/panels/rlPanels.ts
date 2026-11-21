import { createLineChart } from '../../viz/lineChart';
import { h } from '../dom';
import type { Session } from '../session';

/** Loss and exploration charts shown instead of the species chart when the learner is DQN or PPO (spec section 8.4). */
export function createRlPanels(session: Session): { el: HTMLElement; update(): void; dispose(): void } {
  const loss = createLineChart({
    testid: 'loss-chart', title: 'Loss', logToggle: true,
    series: [
      { key: 'td', label: 'TD', color: '--series-best' },
      { key: 'policy', label: 'policy', color: '--series-best' },
      { key: 'value', label: 'value', color: '--series-mean', dash: [6, 4] },
    ],
  });
  const explore = createLineChart({
    testid: 'explore-chart', title: 'Exploration',
    series: [{ key: 'epsilon', label: 'epsilon', color: '--series-median' }, { key: 'entropy', label: 'entropy', color: '--series-median' }],
  });
  const el = h('div', { class: 'rl-panels' }, loss.el, explore.el);
  return {
    el,
    update() {
      const hist = session.history, x = hist.map((s) => s.iteration);
      const pick = (key: 'tdLoss' | 'policyLoss' | 'valueLoss' | 'epsilon' | 'entropy') => hist.map((s) => s.rl?.[key] ?? null);
      loss.setData(x, { td: pick('tdLoss'), policy: pick('policyLoss'), value: pick('valueLoss') });
      explore.setData(x, { epsilon: pick('epsilon'), entropy: pick('entropy') });
    },
    dispose() {},
  };
}
