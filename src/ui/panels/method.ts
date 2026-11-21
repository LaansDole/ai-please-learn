import type { EnvSpecMsg, LearnerKind } from '../../env/types';
import { saveRunPrefs, type RunPrefs } from '../../persist/storage';
import { h } from '../dom';
import { compatibility, EXPLAINERS } from '../explainers';

const KINDS: LearnerKind[] = ['neat', 'dqn', 'ppo'];

/** Radio group of the three learning methods; incompatible ones are disabled with a visible reason. Stores the choice in `prefs`. */
export function createMethodPicker(spec: EnvSpecMsg, prefs: RunPrefs, onChange: (k: LearnerKind) => void): HTMLElement {
  const compat = compatibility(spec);
  const explainer = h('p', { class: 'method-explainer', testid: 'method-explainer' }, EXPLAINERS[prefs.learner].text);
  const options = KINDS.map((kind) => {
    const { ok, reason } = compat[kind];
    const radio = h('input', { type: 'radio', name: 'method', value: kind, testid: `method-${kind}`, disabled: !ok });
    radio.checked = kind === prefs.learner;
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      prefs.learner = kind; saveRunPrefs(spec.meta.id, prefs);
      explainer.textContent = EXPLAINERS[kind].text;
      onChange(kind);
    });
    return h('label', { class: ok ? 'method-option' : 'method-option disabled' },
      radio,
      h('span', { class: 'method-title' }, EXPLAINERS[kind].title),
      reason && h('span', { class: 'method-reason', testid: `method-reason-${kind}` }, reason));
  });
  return h('section', { class: 'panel method' },
    h('h3', null, 'Learning method'),
    h('div', { class: 'method-options', role: 'radiogroup', 'aria-label': 'Learning method' }, ...options),
    explainer);
}
