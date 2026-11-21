import { POPULATION_MAX, POPULATION_MIN, saveRunPrefs, type RunPrefs } from '../../persist/storage';
import type { Speed } from '../../trainer/protocol';
import { h } from '../dom';
import type { Session } from '../session';

const SPEEDS: { id: string; label: string; speed: Speed }[] = [
  ...([1, 2, 5, 10, 100, 1000] as const).map((mult) => ({ id: `speed-${mult}`, label: `x${mult}`, speed: { mode: 'live' as const, mult } })),
  { id: 'speed-max', label: 'MAX', speed: { mode: 'max' } },
];
const same = (a: Speed, b: Speed) => a.mode === b.mode && (a.mode !== 'live' || a.mult === (b as typeof a).mult);
const mult = (v: number) => `x${v >= 10 ? Math.round(v) : v.toFixed(1)}`;

/** Run controls of spec section 9. `prefs` is mutated and persisted on every change; `onStart` (re)starts a run from it. */
export function createSpeedBar(session: Session, prefs: RunPrefs, onStart: () => void): { el: HTMLElement; refresh(): void; dispose(): void } {
  const { meta } = session.spec;
  const save = () => saveRunPrefs(meta.id, prefs);
  const paused = () => session.speed.mode === 'paused';
  const togglePause = () => { if (session.state !== 'idle') session.setSpeed(paused() ? prefs.speed : { mode: 'paused' }); };
  const setSpeed = (s: Speed) => { prefs.speed = s; save(); session.setSpeed(s); };
  const shift = (by: number) => {
    const i = SPEEDS.findIndex((s) => same(s.speed, prefs.speed)), next = SPEEDS[i + by];
    if (next) setSpeed(next.speed);
  };

  const start = h('button', { class: 'btn-primary', testid: 'btn-start', onclick: onStart });
  const pause = h('button', { testid: 'btn-pause', title: 'Space', onclick: togglePause }, 'Pause');
  const step = h('button', { testid: 'btn-step', title: 'Finish the current iteration, then pause (.)', onclick: () => session.step() }, 'Step');
  const restart = h('button', { testid: 'btn-restart', title: 'Start over with the seed and population shown', onclick: () => { session.stop(); onStart(); } }, 'Restart');
  const speeds = SPEEDS.map((s) => h('button', { testid: s.id, onclick: () => setSpeed(s.speed) }, s.label));
  const ghosts = h('input', { type: 'checkbox', testid: 'toggle-ghosts', disabled: !meta.ghosts });
  ghosts.checked = prefs.ghosts && meta.ghosts;
  ghosts.addEventListener('change', () => { prefs.ghosts = ghosts.checked; save(); session.setGhosts(prefs.ghosts); });
  const actual = h('span', { class: 'num muted speed-actual', testid: 'speed-actual' }, '-');
  const seed = h('input', { type: 'number', min: 0, step: 1, testid: 'run-seed', value: prefs.seed });
  seed.addEventListener('change', () => { const v = Math.floor(Number(seed.value)); if (v >= 0) { prefs.seed = v; save(); } seed.value = String(prefs.seed); });
  const population = h('input', { type: 'number', min: POPULATION_MIN, max: POPULATION_MAX, step: 1, testid: 'run-population', value: prefs.population });
  population.addEventListener('change', () => {
    const v = Math.floor(Number(population.value));
    if (Number.isFinite(v)) { prefs.population = Math.min(POPULATION_MAX, Math.max(POPULATION_MIN, v)); save(); }
    population.value = String(prefs.population);
  });
  const populationField = h('label', { class: 'field' }, 'Population', population);

  const el = h('section', { class: 'panel speedbar', 'aria-label': 'Run controls' },
    h('div', { class: 'bar-group' }, start, pause, step, restart),
    h('div', { class: 'bar-group speeds', role: 'group', 'aria-label': 'Speed' }, ...speeds),
    h('label', { class: 'check', title: meta.ghosts ? 'Draw the rest of the population faintly' : 'This concept cannot draw ghosts' }, ghosts, 'Ghosts'),
    actual,
    h('div', { class: 'bar-group bar-end' },
      h('label', { class: 'field' }, 'Seed', seed),
      populationField));

  let effective = 0;
  const sync = () => {
    const idle = session.state === 'idle';
    start.hidden = !idle; pause.disabled = idle; step.disabled = idle; restart.disabled = idle;
    start.textContent = prefs.learner === 'neat' ? 'Start evolving' : 'Start learning';
    populationField.hidden = prefs.learner !== 'neat';             // DQN and PPO train one network
    pause.textContent = !idle && paused() ? 'Resume' : 'Pause';
    speeds.forEach((b, i) => b.setAttribute('aria-pressed', String(same(SPEEDS[i]!.speed, prefs.speed))));
    const target = SPEEDS.find((s) => same(s.speed, prefs.speed))!.label;
    actual.textContent = idle ? target : session.state === 'paused' ? `${target} (paused)` : `${target} (actual ${mult(effective)})`;
  };
  const offStatus = session.on('status', (m) => { effective = m.effectiveMult; sync(); });
  const offChange = session.onChange(sync);
  const onKey = (e: KeyboardEvent) => {
    const t = e.target;
    // Focused controls keep their native keys (Space on a button would otherwise toggle twice).
    if (el.offsetParent === null || e.ctrlKey || e.metaKey || e.altKey || (t instanceof HTMLElement && t.closest('input, textarea, button, a, select'))) return;
    if (e.code === 'Space') togglePause();
    else if (e.key === '.') { if (session.state !== 'idle') session.step(); }
    else if (e.key === '[') shift(-1);
    else if (e.key === ']') shift(1);
    else return;
    e.preventDefault();
  };
  window.addEventListener('keydown', onKey);
  session.setGhosts(ghosts.checked);
  sync();
  return { el, refresh: sync, dispose() { offStatus(); offChange(); window.removeEventListener('keydown', onKey); } };
}
