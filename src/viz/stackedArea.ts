import { createChartCanvas } from './canvas';
import { assignColours, OTHER } from './scale';

const PAD = { l: 52, r: 12, t: 10, b: 22 }, LABEL_MIN_HEIGHT = 14, PALETTE = 7;

/**
 * Stacked population shares, one band per species among a generation's largest and one grey band for the rest
 * (`speciesBands`). A band is never told apart by hue alone: it carries its id on the chart and in the legend below. Spec
 * section 11.4. `rows` may be a sample of the run; `total` is the real number of generations (axis label, data-points);
 * `pooled` is how many species the grey band holds now.
 */
export function createStackedArea(opts: { testid: string; title: string; note: string }): { el: HTMLElement; setData(ids: number[], rows: number[][], total?: number, pooled?: number): void } {
  let ids: number[] = [], rows: number[][] = [], total = 0, legendKey = '';
  const slots = new Map<number, number>();           // species id -> palette slot, kept for the whole run
  const c = createChartCanvas(opts.testid, draw), { ctx } = c;
  c.canvas.dataset.points = '0'; c.canvas.dataset.bands = '0';
  c.canvas.setAttribute('role', 'img'); c.canvas.setAttribute('aria-label', opts.title);
  const title = document.createElement('h3'), el = document.createElement('section');
  title.textContent = opts.title; el.className = 'panel chart';
  const note = document.createElement('p');
  note.className = 'chart-note'; note.textContent = opts.note;
  const legend = document.createElement('ul');
  legend.className = 'chart-legend'; legend.dataset.testid = `${opts.testid}-legend`;
  el.append(title, note, c.wrap, legend);

  function draw(): void {
    const muted = c.token('--muted'), mono = c.token('--font-mono'), bg = c.token('--bg');
    const n = rows.length, plotW = c.w - PAD.l - PAD.r, plotH = c.h - PAD.t - PAD.b;
    ctx.font = `11px ${mono}`; ctx.textBaseline = 'middle';
    if (n === 0) { ctx.fillStyle = muted; ctx.textAlign = 'center'; ctx.fillText('Nothing to plot yet', c.w / 2, c.h / 2); return; }
    // One generation is drawn as a full-width column so the first result is already visible.
    const x = (g: number) => PAD.l + (n === 1 ? g : g / (n - 1)) * plotW;
    const y = (share: number) => PAD.t + (1 - share) * plotH;
    const top = (g: number, k: number) => rows[g]![k]!, bottom = (g: number, k: number) => (k === 0 ? 0 : rows[g]![k - 1]!);
    const colour = (id: number) => (id === OTHER ? c.token('--line-strong') : c.token(`--species-${slots.get(id)! + 1}`));
    ctx.strokeStyle = bg; ctx.lineWidth = 1; ctx.lineJoin = 'round';
    for (let k = 0; k < ids.length; k++) {
      ctx.fillStyle = colour(ids[k]!);
      // A species is drawn only over the generations where it has a band, and tapers to nothing on either side.
      for (let a = 0; a < n; a++) {
        if (!(top(a, k) > bottom(a, k))) continue;
        let b = a;
        while (b + 1 < n && top(b + 1, k) > bottom(b + 1, k)) b++;
        const from = Math.max(a - 1, 0), to = Math.min(b + 1, n - 1);
        ctx.beginPath();
        if (n === 1) ctx.rect(PAD.l, y(top(0, k)), plotW, y(bottom(0, k)) - y(top(0, k)));
        else {
          ctx.moveTo(x(from), y(top(from, k)));
          for (let g = from + 1; g <= to; g++) ctx.lineTo(x(g), y(top(g, k)));
          for (let g = to; g >= from; g--) ctx.lineTo(x(g), y(bottom(g, k)));
          ctx.closePath();
        }
        ctx.fill(); ctx.stroke();                    // the stroke is a hairline between neighbours
        a = b;
      }
    }
    // Each species carries its id where its band is thickest, if the id fits inside it.
    ctx.textAlign = 'center'; ctx.font = `bold 11px ${mono}`;
    const placed: { x: number; y: number }[] = [];
    ids.forEach((id, k) => {
      if (id === OTHER) return;
      let best = 0, bestH = 0;
      for (let g = 0; g < n; g++) { const hgt = (top(g, k) - bottom(g, k)) * plotH; if (hgt >= bestH) { bestH = hgt; best = g; } }
      if (bestH < LABEL_MIN_HEIGHT) return;
      const text = String(id), half = ctx.measureText(text).width / 2 + 3;
      const px = Math.min(Math.max(n === 1 ? PAD.l + plotW / 2 : x(best), PAD.l + half), PAD.l + plotW - half);
      const py = y((top(best, k) + bottom(best, k)) / 2);
      if (placed.some((p) => Math.abs(p.x - px) < half * 2 + 4 && Math.abs(p.y - py) < 14)) return;
      placed.push({ x: px, y: py });
      // A plate behind the id keeps it legible over any band colour.
      ctx.fillStyle = bg; ctx.fillRect(px - half, py - 7, half * 2, 14);
      ctx.fillStyle = colour(id); ctx.fillText(text, px, py + 0.5);
    });
    ctx.fillStyle = muted; ctx.font = `11px ${mono}`; ctx.textAlign = 'right';
    for (const share of [0, 0.5, 1]) ctx.fillText(`${share * 100}%`, PAD.l - 6, y(share));
    ctx.textAlign = 'center';
    const axisY = c.h - PAD.b / 2;
    ctx.fillText('1', PAD.l, axisY);
    if (total > 1) ctx.fillText(String(total), PAD.l + plotW - ctx.measureText(String(total)).width / 2 + 6, axisY);
    ctx.fillText('generation', PAD.l + plotW / 2, axisY);
    ctx.save(); ctx.translate(9, PAD.t + plotH / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('share of population', 0, 0); ctx.restore();
  }

  /** The bands of the latest generation, largest share first and the grey band last, with what the numbers mean. */
  function renderLegend(pooled: number): void {
    const last = rows.at(-1) ?? [];
    const items = ids.map((id, k) => ({ id, height: last[k]! - (k === 0 ? 0 : last[k - 1]!) })).filter((b) => b.height > 0)
      .sort((a, b) => Number(a.id === OTHER) - Number(b.id === OTHER) || b.height - a.height)
      .map((b) => ({ id: b.id, share: b.height < 0.005 ? '<1%' : `${Math.round(b.height * 100)}%` }));
    const key = items.map((b) => `${b.id}:${b.share}`).join() + `|${pooled}`;
    if (key === legendKey) return;
    legendKey = key;
    legend.replaceChildren(...items.map((b) => {
      const li = document.createElement('li'), swatch = document.createElement('i'), share = document.createElement('span');
      swatch.style.background = b.id === OTHER ? 'var(--line-strong)' : `var(--species-${slots.get(b.id)! + 1})`;
      share.className = 'num'; share.textContent = b.share;
      li.append(swatch, b.id === OTHER ? `${pooled} smaller species` : `species ${b.id}`, share);
      return li;
    }));
  }

  return {
    el,
    setData(i, r, t = r.length, pooled = 0) {
      if (t < total) slots.clear();                  // a new run numbers its species from the start again
      ids = i; rows = r; total = t;
      assignColours(ids, rows, slots, PALETTE);
      c.canvas.dataset.points = String(t); c.canvas.dataset.bands = String(ids.length);
      renderLegend(pooled);
      c.redraw();
    },
  };
}
