import { createChartCanvas } from './canvas';

const PAD = { l: 46, r: 12, t: 10, b: 22 };

/**
 * Stacked population shares: one band per species id (never hue alone: the largest current species carry their id). Spec section 11.4.
 * `rows` may be a sample of the run; `total` is the real number of generations (axis label, data-points).
 */
export function createStackedArea(opts: { testid: string; title: string }): { el: HTMLElement; setData(ids: number[], rows: number[][], total?: number): void } {
  let ids: number[] = [], rows: number[][] = [], total = 0;
  const c = createChartCanvas(opts.testid, draw), { ctx } = c;
  c.canvas.dataset.points = '0';
  c.canvas.setAttribute('role', 'img'); c.canvas.setAttribute('aria-label', opts.title);
  const title = document.createElement('h3'), el = document.createElement('section');
  title.textContent = opts.title; el.className = 'panel chart';
  el.append(title, c.wrap);

  function draw(): void {
    const muted = c.token('--muted'), mono = c.token('--font-mono'), bg = c.token('--bg');
    const n = rows.length, plotW = c.w - PAD.l - PAD.r, plotH = c.h - PAD.t - PAD.b;
    ctx.font = `10px ${mono}`; ctx.textBaseline = 'middle';
    if (n === 0) { ctx.fillStyle = muted; ctx.textAlign = 'center'; ctx.fillText('No data yet', c.w / 2, c.h / 2); return; }
    // One generation is drawn as a full-width column so the first result is already visible.
    const x = (g: number) => PAD.l + (n === 1 ? g : g / (n - 1)) * plotW;
    const y = (share: number) => PAD.t + (1 - share) * plotH;
    const top = (g: number, k: number) => rows[g]![k]!, bottom = (g: number, k: number) => (k === 0 ? 0 : rows[g]![k - 1]!);
    const colours = Array.from({ length: 8 }, (_, i) => c.token(`--species-${i + 1}`));
    // Band separators only while columns are wide; on long runs they would bury the fills under background-coloured strokes.
    const separators = plotW / n >= 4;
    for (let k = 0; k < ids.length; k++) {
      // A species only costs the columns it lived in: long runs have thousands of extinct ones.
      let first = -1, last = -1;
      for (let g = 0; g < n; g++) if (top(g, k) > bottom(g, k)) { if (first < 0) first = g; last = g; }
      if (first < 0) continue;
      ctx.beginPath();
      if (n === 1) { ctx.rect(PAD.l, y(top(0, k)), plotW, y(bottom(0, k)) - y(top(0, k))); }
      else {
        const a = Math.max(0, first - 1), b = Math.min(n - 1, last + 1);
        ctx.moveTo(x(a), y(top(a, k)));
        for (let g = a + 1; g <= b; g++) ctx.lineTo(x(g), y(top(g, k)));
        for (let g = b; g >= a; g--) ctx.lineTo(x(g), y(bottom(g, k)));
        ctx.closePath();
      }
      ctx.fillStyle = colours[ids[k]! % 8]!; ctx.fill();   // by id, so a band keeps its colour while the sample shifts
      if (separators) { ctx.strokeStyle = bg; ctx.lineWidth = 1; ctx.stroke(); }
    }
    // Species id inside each band where it is thickest; thick bands claim their spot first and overlapping ids are dropped.
    ctx.textAlign = 'center'; ctx.fillStyle = bg; ctx.font = `bold 10px ${mono}`;
    const spots = ids.map((id, k) => {
      let best = 0, bestH = 0;
      for (let g = 0; g < n; g++) { const hgt = (rows[g]![k]! - (k === 0 ? 0 : rows[g]![k - 1]!)) * plotH; if (hgt > bestH) { bestH = hgt; best = g; } }
      const mid = (rows[best]![k]! + (k === 0 ? 0 : rows[best]![k - 1]!)) / 2;
      return { id, height: bestH, x: Math.min(Math.max(n === 1 ? PAD.l + plotW / 2 : x(best), PAD.l + 10), PAD.l + plotW - 10), y: y(mid) };
    }).filter((s) => s.height > 14).sort((a, b) => b.height - a.height);
    const placed: { x: number; y: number }[] = [];
    for (const s of spots) {
      if (placed.some((p) => Math.abs(p.x - s.x) < 22 && Math.abs(p.y - s.y) < 13)) continue;
      placed.push(s);
      ctx.fillText(String(s.id), s.x, s.y);
    }
    ctx.fillStyle = muted; ctx.font = `10px ${mono}`; ctx.textAlign = 'right';
    for (const share of [0, 0.5, 1]) ctx.fillText(`${share * 100}%`, PAD.l - 6, y(share));
    ctx.textAlign = 'center';
    ctx.fillText('1', PAD.l, c.h - PAD.b / 2);
    if (total > 1) ctx.fillText(String(total), PAD.l + plotW, c.h - PAD.b / 2);
  }

  return {
    el,
    setData(i, r, t = r.length) { ids = i; rows = r; total = t; c.canvas.dataset.points = String(t); c.redraw(); },
  };
}
