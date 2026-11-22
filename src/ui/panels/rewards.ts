import { applyPreset, validateReward } from '../../env/reward';
import type { RewardConfig, RewardTermSpec } from '../../env/types';
import { iterationLabel } from '../../learner/types';
import { h } from '../dom';
import type { Session } from '../session';

/** Step 2: weights per reward term as sliders, presets and raw JSON. Every valid change goes to session.setReward. */
export function createRewardPanel(session: Session): { el: HTMLElement; dispose(): void } {
  const { spec } = session;
  const weight = (cfg: RewardConfig, t: RewardTermSpec) => cfg.weights[t.key] ?? t.defaultWeight;
  const setWeight = (key: string, v: number) => {
    if (!Number.isFinite(v) || v < 0) return;
    session.setReward({ ...session.reward, preset: null, weights: { ...session.reward.weights, [key]: v } });
  };

  const rows = spec.rewardTerms.map((t) => {
    const max = t.max ?? Math.max(1, 4 * t.defaultWeight);
    const range = h('input', { type: 'range', min: 0, max, step: max / 100, testid: `weight-${t.key}`, 'aria-label': `${t.key} weight` });
    const num = h('input', { type: 'number', min: 0, step: 'any', testid: `weight-num-${t.key}`, 'aria-label': `${t.key} weight, exact` });
    range.addEventListener('input', () => setWeight(t.key, Number(range.value)));
    num.addEventListener('input', () => { if (num.value !== '') setWeight(t.key, Number(num.value)); });
    const el = h('div', { class: 'weight-row' },
      h('div', { class: 'weight-label' }, h('span', { class: 'mono' }, t.key), h('span', { class: 'muted' }, t.description)),
      range, num);
    return { t, el, range, num };
  });
  const group = (kind: 'reward' | 'penalty', legend: string) =>
    h('fieldset', { class: 'weights' }, h('legend', null, legend), ...rows.filter((r) => r.t.kind === kind).map((r) => r.el));

  const presets = spec.presets.map((p) => h('button', {
    testid: `preset-${p.name}`, title: p.description, onclick: () => session.setReward(applyPreset(spec, p.name)),
  }, p.name));
  const note = h('p', { class: 'reward-note', role: 'status' });
  const json = h('textarea', { testid: 'reward-json', rows: 9, spellcheck: 'false', 'aria-label': 'Reward config as JSON' });
  const errors = h('ul', { class: 'errors', testid: 'reward-errors' });
  let shown = '';                             // the JSON last written by sync(); blur only applies real edits
  const apply = () => {
    if (json.value === shown) return;
    let parsed: unknown;
    try { parsed = JSON.parse(json.value); } catch (e) { errors.replaceChildren(h('li', null, `Not valid JSON: ${(e as Error).message}`)); return; }
    const r = validateReward(spec, parsed);
    if (!r.ok) { errors.replaceChildren(...r.errors.map((m) => h('li', null, m))); return; }
    shown = '';                               // force the textarea to reformat
    session.setReward(r.cfg);
  };
  json.addEventListener('blur', apply);
  json.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); apply(); } });

  const el = h('section', { class: 'panel rewards' },
    h('h3', null, 'Rewards and penalties'),
    h('p', null, 'The machine only knows its fitness score. Each reward below adds to it and each penalty takes away. Raise a weight to make that behaviour matter more.'),
    h('p', { class: 'mono formula' }, 'fitness = sum(weight x term)'),
    h('div', { class: 'preset-row' }, h('span', { class: 'muted' }, 'Presets'), ...presets),
    note,
    group('reward', 'Rewards (added to fitness)'),
    group('penalty', 'Penalties (subtracted from fitness)'),
    h('div', { class: 'json-editor' },
      h('div', { class: 'json-head' }, h('span', { class: 'muted' }, 'Raw JSON (Ctrl+Enter applies)'), h('button', { testid: 'reward-json-apply', onclick: apply }, 'Apply')),
      json, errors));

  const sync = () => {
    const cfg = session.reward, active = document.activeElement;
    for (const r of rows) {
      const w = weight(cfg, r.t);
      r.range.value = String(w);
      if (r.num !== active) r.num.value = String(w);
    }
    presets.forEach((b, i) => b.setAttribute('aria-pressed', String(cfg.preset === spec.presets[i]!.name)));
    const text = JSON.stringify(cfg, null, 2);
    if (text !== shown) { shown = text; errors.replaceChildren(); if (json !== active || json.value === '') json.value = text; }
    const kind = session.run?.learner.kind ?? spec.meta.learners[0]!;
    note.textContent = session.state === 'idle' ? '' : `Applies from the next ${iterationLabel(kind).toLowerCase()}`;
  };
  sync();
  return { el, dispose: session.onChange(sync) };
}
