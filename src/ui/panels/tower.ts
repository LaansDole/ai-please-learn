import type { LearnerKind } from '../../env/types';
import { iterationLabel } from '../../learner/types';
import type { Mark, Trend } from '../../viz/trend';
import { fmt, h } from '../dom';
import type { HistoryEntry } from '../session';

const TOP = 5, LAPS = 8;
const MARK_WORDS: Record<Mark, string> = { rec: 'new record', imp: 'improved', flat: 'no gain' };

/** The shaped mark that repeats the timing colour, with its meaning for screen readers. */
export function markEl(mark: Mark): HTMLElement {
  return h('span', null, h('i', { class: `mark mark-${mark}`, 'aria-hidden': 'true' }), h('span', { class: 'sr' }, `${MARK_WORDS[mark]}: `));
}

/** "record" for the score that holds it, otherwise how far below it. */
const gap = (best: number, record: number) => (best >= record ? 'record' : fmt(best - record));

/**
 * The timing tower beside the stage: species standings (NEAT only) and the last few iterations as a table.
 * `colour` gives a species the colour its band has in the species chart.
 */
export function createTower(colour: (id: number) => string): { el: HTMLElement; update(hist: readonly HistoryEntry[], kind: LearnerKind, t: Trend): void } {
  const standingsSub = h('span', { class: 'sub' }), standingsBody = h('tbody');
  const standingsTitle = h('h3', null, 'Species standings', standingsSub);
  const col = (label: string, numeric = true) => h('th', { scope: 'col', class: numeric && 'n' }, label);
  const standings = h('table', { class: 'tt', testid: 'species-standings' },
    h('thead', null, h('tr', null, h('th', { scope: 'col' }, h('span', { class: 'sr' }, 'Position')), col('Species', false), col('Size'), col('Best'), col('Gap'), col('Age'))),
    standingsBody);
  const lapsTitle = h('h3'), lapsUnit = h('th', { scope: 'col' }), lapsBody = h('tbody');
  const laps = h('table', { class: 'tt', testid: 'last-iterations' },
    h('thead', null, h('tr', null, lapsUnit, col('Champion'), col('Mean'), col('Gap to record'))),
    lapsBody);
  const el = h('aside', { class: 'panel tower', 'aria-label': 'Standings' }, standingsTitle, standings, lapsTitle, laps);

  // Species ages: the iteration each id was first seen in, filled in as history grows; a new run starts over.
  const born = new Map<number, number>();
  let seen = 0;

  return {
    el,
    update(hist, kind, t) {
      const n = hist.length, unit = iterationLabel(kind), neat = kind === 'neat';
      if (n < seen) { born.clear(); seen = 0; }
      for (; seen < n; seen++) for (const s of hist[seen]!.neat?.species ?? []) if (!born.has(s.id)) born.set(s.id, hist[seen]!.iteration);

      standingsTitle.hidden = standings.hidden = !neat;
      const now = hist.at(-1), species = [...(now?.neat?.species ?? [])].sort((a, b) => b.size - a.size || b.best - a.best);
      const top = species.slice(0, TOP), rest = species.slice(TOP);
      standingsSub.textContent = species.length > TOP ? `top ${TOP} of ${species.length}` : '';
      const rows = top.map((s, i) => h('tr', null,
        h('td', { class: 'p' }, String(i + 1)),
        h('td', null, h('i', { class: 'sw', style: `background:${colour(s.id)}`, 'aria-hidden': 'true' }), `S${s.id}`),
        h('td', { class: 'n' }, String(s.size)),
        h('td', { class: s.best >= t.record ? 'n d-rec' : 'n' }, fmt(s.best)),
        h('td', { class: 'n' }, gap(s.best, t.record)),
        h('td', { class: 'n' }, String(now!.iteration - born.get(s.id)! + 1))));
      if (rest.length > 0) {
        const best = Math.max(...rest.map((s) => s.best));
        rows.push(h('tr', null,
          h('td', { class: 'p' }),
          h('td', null, h('i', { class: 'sw', style: 'background:var(--species-other)', 'aria-hidden': 'true' }), `${rest.length} other${rest.length === 1 ? '' : 's'}`),
          h('td', { class: 'n' }, String(rest.reduce((sum, s) => sum + s.size, 0))),
          h('td', { class: 'n' }, fmt(best)), h('td', { class: 'n' }, gap(best, t.record)), h('td', { class: 'n' })));
      }
      if (rows.length === 0) rows.push(h('tr', null, h('td', { class: 'empty', colspan: 6 }, 'Species appear here once the first generation has played.')));
      standingsBody.replaceChildren(...rows);

      lapsTitle.textContent = `Last ${LAPS} ${unit.toLowerCase()}s`;
      lapsUnit.textContent = unit;
      const lapRows = hist.slice(-LAPS).reverse().map((s, k) => {
        const mark = t.marks[t.marks.length - 1 - k] ?? 'flat';
        return h('tr', null,
          h('td', null, String(s.iteration)),
          h('td', { class: `n d-${mark}` }, markEl(mark), fmt(s.best)),
          h('td', { class: 'n' }, fmt(s.mean)),
          h('td', { class: 'n' }, n - 1 - k === t.recordAt ? 'record' : s.best >= t.record ? 'level' : fmt(s.best - t.record)));
      });
      if (lapRows.length === 0) lapRows.push(h('tr', null, h('td', { class: 'empty', colspan: 4 }, `Each ${unit.toLowerCase()} adds a row: its champion, the crowd's mean and how far it was from the record.`)));
      lapsBody.replaceChildren(...lapRows);
    },
  };
}
