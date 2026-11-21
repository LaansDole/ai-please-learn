import { signedWeights } from '../../env/reward';
import { h } from '../dom';
import { InputTracker } from '../input';
import type { Session } from '../session';

const signed = (v: number) => `${v < 0 ? '-' : '+'}${Math.abs(v).toFixed(2)}`;

/** Step 1: the user plays the env and sees exactly what the machine will be scored on. */
export function createPlayPanel(session: Session): { el: HTMLElement; dispose(): void } {
  const { spec } = session;
  if (!spec.human) {
    return { el: h('section', { class: 'panel' }, h('h3', null, 'Play it yourself'), h('p', { class: 'muted' }, 'This concept has no manual controls. Continue to step 2 to shape its rewards.')), dispose() {} };
  }
  let seed = 1;
  const rows = spec.rewardTerms.map((t) => {
    const raw = h('td', { class: 'num' }, '0.00'), contrib = h('td', { class: 'num' }, '+0.00');
    const tr = h('tr', { testid: `term-${t.key}` },
      h('th', { scope: 'row' }, h('span', { class: 'mono' }, t.key), h('span', { class: 'term-kind' }, t.kind)),
      h('td', { class: 'term-desc' }, t.description), raw, contrib);
    return { tr, raw, contrib };
  });
  const total = h('span', { class: 'num total', testid: 'play-fitness' }, '0.00');
  const over = h('p', { class: 'play-over', role: 'status' });
  const restart = () => { seed++; over.textContent = ''; session.play(seed); };
  const el = h('section', { class: 'panel play' },
    h('h3', null, 'Play it yourself'),
    h('p', null, spec.human.hint),
    h('div', { class: 'keys' }, ...spec.human.keys.map((k) => h('span', { class: 'key' }, h('kbd', null, k.code.replace(/^Arrow|^Key/, '')), k.label))),
    h('table', { class: 'terms' },
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Term'), h('th', { scope: 'col' }, 'What it counts'), h('th', { scope: 'col', class: 'num' }, 'Raw'), h('th', { scope: 'col', class: 'num' }, 'Fitness'))),
      h('tbody', null, ...rows.map((r) => r.tr))),
    h('div', { class: 'play-foot' },
      h('span', null, 'Fitness ', total),
      h('button', { testid: 'play-restart', onclick: restart }, 'Restart')),
    over);

  const paint = (terms: number[], fitness: number) => {
    const w = signedWeights(spec, session.reward);
    rows.forEach((r, i) => { r.raw.textContent = (terms[i] ?? 0).toFixed(2); r.contrib.textContent = signed(w[i]! * (terms[i] ?? 0)); });
    total.textContent = fitness.toFixed(2);
  };
  const offFrame = session.on('frame', (m) => { if (m.source === 'play') paint(m.terms, m.fitness); });
  const offEpisode = session.on('episode', (m) => { if (m.source === 'play') { paint(m.terms, m.fitness); over.textContent = `Episode over: fitness ${m.fitness.toFixed(2)}`; } });

  const keys = new InputTracker(spec.human.keys.map((k) => k.code));
  const send = () => { const s = keys.take(); session.input(s.held, s.pressed); };
  const typing = (e: Event) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
  const onDown = (e: KeyboardEvent) => { if (!typing(e) && keys.down(e.code)) { e.preventDefault(); send(); } };
  const onUp = (e: KeyboardEvent) => { if (keys.up(e.code)) { e.preventDefault(); send(); } };
  const onBlur = () => { keys.clear(); send(); };
  window.addEventListener('keydown', onDown); window.addEventListener('keyup', onUp); window.addEventListener('blur', onBlur);
  session.play(seed);

  return {
    el,
    dispose() {
      offFrame(); offEpisode();
      window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); window.removeEventListener('blur', onBlur);
    },
  };
}
