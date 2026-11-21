import { createChartCanvas } from './canvas';

const PAD = { l: 46, r: 12, t: 10, b: 22 }, LABELS = 6, LABEL_MIN_HEIGHT = 14;

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
    // Ids only for the largest species alive now, each where its band is thickest and only if the id fits inside it.
    const now = n - 1;
    const current = ids.map((id, k) => ({ id, k, size: top(now, k) - bottom(now, k) })).filter((s) => s.size > 0)
      .sort((a, b) => b.size - a.size).slice(0, LABELS);
    ctx.textAlign = 'center'; ctx.font = `bold 10px ${mono}`;
    const placed: { x: number; y: number }[] = [];
    for (const { id, k } of current) {
      let best = 0, bestH = 0;
      for (let g = 0; g < n; g++) { const hgt = (top(g, k) - bottom(g, k)) * plotH; if (hgt >= bestH) { bestH = hgt; best = g; } }
      if (bestH < LABEL_MIN_HEIGHT) continue;
      const text = String(id), half = ctx.measureText(text).width / 2 + 3;
      const px = Math.min(Math.max(n === 1 ? PAD.l + plotW / 2 : x(best), PAD.l + half), PAD.l + plotW - half);
      const py = y((top(best, k) + bottom(best, k)) / 2);
      if (placed.some((p) => Math.abs(p.x - px) < half * 2 + 4 && Math.abs(p.y - py) < 14)) continue;
      placed.push({ x: px, y: py });
      // A plate behind the id keeps it legible over any band colour and over neighbouring slivers.
      ctx.fillStyle = bg; ctx.fillRect(px - half, py - 7, half * 2, 14);
      ctx.fillStyle = colours[id % 8]!; ctx.fillText(text, px, py + 0.5);
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
