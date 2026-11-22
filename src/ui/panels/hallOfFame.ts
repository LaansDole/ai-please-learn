import { resolveConfig } from '../../learner/config';
import { exportFileName, parseExport, toExport } from '../../persist/exportImport';
import { h } from '../dom';
import type { HofEntry, Session } from '../session';

/** Champion chips: click to replay in the stage; export the shown champion or import one (spec sections 11.5, 13). */
export function createHallOfFame(session: Session): { el: HTMLElement; dispose(): void } {
  const { spec } = session;
  const list = h('ol', { class: 'hof', testid: 'hof' });
  const empty = h('p', { class: 'muted' }, 'Each generation adds its champion here. Click one to watch it play.');
  const back = h('button', { testid: 'btn-back-live', hidden: true, onclick: () => session.backToLive() }, 'Back to live');
  const errors = h('ul', { class: 'errors', role: 'alert' });
  const chips = new Map<HofEntry, HTMLButtonElement>();

  const selected = () => { const v = session.viewing; return v.kind === 'replay' ? session.hof.find((e) => e.iteration === v.iteration) : undefined; };
  const exportChampion = () => {
    const entry = selected() ?? session.hof.at(-1);
    if (!entry) return;
    const run = session.run ?? { learner: resolveConfig(spec.meta.learners[0]!, spec), seed: 1 };
    // A PPO update in which no episode ended has no score of its own: the file carries the latest one before it.
    const at = entry.iteration === 'imported' ? undefined : session.history.filter((s) => s.iteration <= (entry.iteration as number) && Number.isFinite(s.best)).at(-1);
    const stats = at ? { ...at, iteration: entry.iteration as number } : { iteration: 0, best: entry.best, mean: entry.best, median: entry.best };
    const data = toExport(spec, { ...run, reward: session.reward }, stats, entry.policy, new Date());
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = h('a', { href: url, download: exportFileName(data) });
    document.body.append(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };
  const exportBtn = h('button', { testid: 'btn-export', onclick: exportChampion }, 'Export');
  const file = h('input', { type: 'file', accept: 'application/json', testid: 'input-import', class: 'file-input' });
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    file.value = '';                          // the same file can be picked again
    if (!f) return;
    let json: unknown;
    try { json = JSON.parse(await f.text()); } catch { errors.replaceChildren(h('li', null, `${f.name} is not valid JSON.`)); return; }
    const r = parseExport(json, spec);
    if (!r.ok) { errors.replaceChildren(...r.errors.map((m) => h('li', null, m))); return; }
    errors.replaceChildren();
    session.importChampion(r.policy, r.value.stats.best);
  });

  const el = h('section', { class: 'panel hof-panel' },
    h('div', { class: 'hof-head' },
      h('h3', null, 'Hall of fame'),
      h('div', { class: 'bar-group' }, back, exportBtn, h('label', { class: 'btn file-btn' }, 'Import', file))),
    empty, list, errors);

  let raf = 0;
  const render = () => {
    raf = 0;
    const hof = session.hof, live = new Set(hof), chosen = selected();
    const pinned = list.scrollLeft + list.clientWidth >= list.scrollWidth - 8;   // follow the newest unless the user scrolled back
    for (const [entry, chip] of chips) if (!live.has(entry)) { chip.parentElement?.remove(); chips.delete(entry); }
    let best: HofEntry | undefined;
    for (const e of hof) if (Number.isFinite(e.best) && (!best || e.best > best.best)) best = e;
    for (const entry of hof) {
      let chip = chips.get(entry);
      if (!chip) {
        chip = h('button', { class: 'num', testid: 'hof-item', dataset: { iteration: String(entry.iteration) }, onclick: () => session.replay(entry) });
        chips.set(entry, chip); list.append(h('li', null, chip));
      }
      // g12 for a NEAT generation, r12 for a DQN round, u12 for a PPO update.
      const unit = entry.policy.kind === 'neat' ? 'g' : entry.policy.algo === 'dqn' ? 'r' : 'u';
      const label = entry.iteration === 'imported' ? 'imported' : `${unit}${entry.iteration} ${Number.isFinite(entry.best) ? entry.best.toFixed(1) : '-'}`;
      const text = entry === best ? `\u2605 ${label}` : label;
      if (chip.textContent !== text) chip.textContent = text;
      if (entry === best) chip.title = 'best so far'; else chip.removeAttribute('title');
      chip.setAttribute('aria-pressed', String(entry === chosen));
    }
    empty.hidden = hof.length > 0; list.hidden = hof.length === 0;
    exportBtn.disabled = hof.length === 0;
    back.hidden = session.viewing.kind !== 'replay';
    if (pinned) list.scrollLeft = list.scrollWidth;
    faded();
  };
  // Chips scrolled out on the left fade at the edge instead of ending in a hard cut.
  const faded = () => list.toggleAttribute('data-more', list.scrollLeft > 0);
  list.addEventListener('scroll', faded, { passive: true });
  const off = session.onChange(() => { if (!raf) raf = requestAnimationFrame(render); });
  render();
  return { el, dispose() { cancelAnimationFrame(raf); off(); } };
}
