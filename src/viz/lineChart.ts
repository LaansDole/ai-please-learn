import { createChartCanvas } from './canvas';
import { decimate, niceTicks, tickLabel as short } from './scale';

/**
 * color: a CSS colour or a '--token'. `faint`: a thin, dimmed line for the raw signal behind a trend line.
 * `step`: a heavy stepped line for a value that only changes in jumps (the record).
 */
export interface SeriesSpec { key: string; label: string; color: string; dash?: number[]; dots?: boolean; faint?: boolean; step?: boolean }
export interface ChartMarker { x: number; label: string }
/** A written note pinned to one point of the plot, like a pencilled annotation on a figure. */
export interface ChartCallout { x: number; y: number; text: string }
export interface LineChart {
  el: HTMLElement;
  setData(x: number[], ys: Record<string, (number | null)[]>, markers?: ChartMarker[], callout?: ChartCallout): void;
  /** One plain sentence under the title saying how to read the chart. */
  setNote(text: string): void;
  /** What one step along the x axis is ("generation", "episode"): the axis title and the first line of the tooltip. */
  setXLabel(text: string): void;
}

const DECIMATE_ABOVE = 2000, LABEL_GAP = 14;

/** Line chart with nice ticks, axis titles, directly labelled series, reward-change markers and a hover crosshair (spec section 11.4). */
export function createLineChart(opts: { testid: string; title: string; series: SeriesSpec[]; logToggle?: boolean; yLabel?: string }): LineChart {
  let xs: number[] = [], data: Record<string, (number | null)[]> = {}, markers: ChartMarker[] = [], hover: number | null = null, log = false, xLabel = '';
  let callout: ChartCallout | undefined;
  // Room for the y title on the left, the x title below, and (measured on every draw) the longest series label on the right.
  const PAD = { l: opts.yLabel ? 60 : 46, r: 64, t: 10, b: 22 };
  const c = createChartCanvas(opts.testid, draw), { ctx } = c;
  c.canvas.dataset.points = '0'; c.canvas.dataset.markers = '0';
  c.canvas.setAttribute('role', 'img'); c.canvas.setAttribute('aria-label', opts.title);
  const tip = document.createElement('div');
  tip.className = 'chart-tip'; tip.hidden = true;
  c.wrap.append(tip);
  const head = document.createElement('div'), title = document.createElement('h3');
  head.className = 'chart-head'; title.textContent = opts.title;
  head.append(title);
  if (opts.logToggle) {
    const label = document.createElement('label'), box = document.createElement('input');
    label.className = 'check'; box.type = 'checkbox';
    box.addEventListener('change', () => { log = box.checked; c.redraw(); });
    label.append(box, 'Log scale');
    head.append(label);
  }
  const el = document.createElement('section');
  el.className = 'panel chart';
  const note = document.createElement('p');
  note.className = 'chart-note';
  el.append(head, note, c.wrap);

  const value = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) || (log && v <= 0) ? NaN : log ? Math.log10(v) : v);
  const xRange = (): [number, number] => { const a = xs[0] ?? 0, b = xs.at(-1) ?? 1; return b > a ? [a, b] : [a - 1, a + 1]; };
  const xPos = (x: number) => { const [a, b] = xRange(); return PAD.l + ((x - a) / (b - a)) * (c.w - PAD.l - PAD.r); };

  function draw(): void {
    const line = c.token('--line'), muted = c.token('--muted'), font = c.token('--font-ui');
    ctx.font = `12px ${font}`; ctx.textBaseline = 'middle'; ctx.lineWidth = 1;
    PAD.b = xLabel ? 38 : 22;
    // Each series is labelled at its right end with its name and latest value.
    const endLabel = (s: SeriesSpec) => {
      const ys = data[s.key] ?? [];
      for (let i = ys.length - 1; i >= 0; i--) { const v = ys[i]; if (v !== null && v !== undefined && Number.isFinite(v)) return `${s.label} ${short(v)}`; }
      return '';
    };
    PAD.r = Math.max(40, ...opts.series.map((s) => Math.ceil(ctx.measureText(endLabel(s)).width) + 14));
    const plotH = c.h - PAD.t - PAD.b, right = c.w - PAD.r;
    if (xs.length === 0) {
      ctx.fillStyle = muted; ctx.textAlign = 'center';
      ctx.fillText('Nothing to plot yet', c.w / 2, c.h / 2);
      return;
    }
    let lo = Infinity, hi = -Infinity;
    for (const s of opts.series) for (const raw of data[s.key] ?? []) { const v = value(raw); if (v < lo) lo = v; if (v > hi) hi = v; }
    if (lo > hi) { lo = 0; hi = 1; }
    const ticks = niceTicks(lo, hi, Math.max(2, Math.floor(plotH / 34))), y0 = ticks[0]!, y1 = ticks.at(-1)!;
    const yPos = (v: number) => PAD.t + (1 - (v - y0) / (y1 - y0)) * plotH;

    ctx.textAlign = 'right';
    for (const t of ticks) {
      ctx.strokeStyle = line; ctx.beginPath(); ctx.moveTo(PAD.l, yPos(t)); ctx.lineTo(right, yPos(t)); ctx.stroke();
      ctx.fillStyle = muted; ctx.fillText(log ? `1e${t}` : short(t), PAD.l - 6, yPos(t));
    }
    const [xa, xb] = xRange();
    ctx.textAlign = 'center';
    for (const t of niceTicks(xa, xb, Math.max(2, Math.floor((right - PAD.l) / 90)))) {
      if (t < xa || t > xb || !Number.isInteger(t)) continue;
      ctx.fillStyle = muted; ctx.fillText(String(t), xPos(t), PAD.t + plotH + 11);
    }
    ctx.fillStyle = muted;
    if (xLabel) ctx.fillText(xLabel, (PAD.l + right) / 2, c.h - 8);
    if (opts.yLabel) { ctx.save(); ctx.translate(9, PAD.t + plotH / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(opts.yLabel, 0, 0); ctx.restore(); }

    const warn = c.token('--warn-ink');
    for (const m of markers) {
      const x = Math.round(xPos(m.x)) + 0.5;
      ctx.strokeStyle = warn; ctx.beginPath(); ctx.moveTo(x, PAD.t); ctx.lineTo(x, PAD.t + plotH); ctx.stroke();
      ctx.fillStyle = warn; ctx.fillRect(x, PAD.t, 11, 11);
      ctx.fillStyle = c.token('--panel'); ctx.font = `bold 9px ${font}`; ctx.fillText('R', x + 5.5, PAD.t + 6); ctx.font = `12px ${font}`;
    }

    const ends: { y: number; label: string; color: string }[] = [];
    for (const s of opts.series) {
      const raw = (data[s.key] ?? []).map(value);
      const d = xs.length > DECIMATE_ABOVE ? decimate(xs, raw, DECIMATE_ABOVE / 2) : { xs, ys: raw };
      const color = c.token(s.color);
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = s.step ? 2.5 : s.faint ? 1 : s.dash ? 1.5 : 2; ctx.setLineDash(s.dash ?? []); ctx.lineJoin = 'round';
      ctx.globalAlpha = s.faint ? 0.7 : 1;
      ctx.beginPath();
      let pen = false, last = NaN;
      d.ys.forEach((v, i) => {
        if (Number.isNaN(v)) { pen = false; return; }
        const x = xPos(d.xs[i]!);
        if (pen && s.step) ctx.lineTo(x, yPos(last));
        if (pen) ctx.lineTo(x, yPos(v)); else ctx.moveTo(x, yPos(v));
        pen = true; last = v;
      });
      if (!s.dots) ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      // A dots series is a faint scatter (one mark per sample) with no connecting line.
      if (s.dots) { ctx.globalAlpha = 0.45; d.ys.forEach((v, i) => { if (!Number.isNaN(v)) ctx.fillRect(xPos(d.xs[i]!) - 1.5, yPos(v) - 1.5, 3, 3); }); ctx.globalAlpha = 1; }
      else if (d.xs.length === 1 && !Number.isNaN(last)) { ctx.beginPath(); ctx.arc(xPos(d.xs[0]!), yPos(last), 2.5, 0, Math.PI * 2); ctx.fill(); }
      if (!Number.isNaN(last)) ends.push({ y: yPos(last), label: endLabel(s), color });
    }
    // Direct labels at the right end, spread a full line apart so close series (mean and median) never overlap.
    ends.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) ends[i]!.y = Math.max(ends[i]!.y, ends[i - 1]!.y + LABEL_GAP);
    const overflow = ends.length ? Math.max(0, ends.at(-1)!.y - (PAD.t + plotH)) : 0;
    ctx.textAlign = 'left';
    for (const e of ends) { ctx.fillStyle = e.color; ctx.fillText(e.label, right + 6, e.y - overflow); }

    const cy = callout ? value(callout.y) : NaN;
    if (callout && !Number.isNaN(cy)) {
      const x = xPos(callout.x), y = yPos(cy), pen = c.token('--rec'), onRight = x > (PAD.l + right) / 2;
      ctx.fillStyle = c.token('--panel'); ctx.strokeStyle = pen; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.font = `italic 13px ${c.token('--font-prose')}`; ctx.textAlign = onRight ? 'right' : 'left';
      // Above the point when there is room, otherwise below it, on a plate so the lines behind do not strike through it.
      const tx = x + (onRight ? -9 : 9), ty = y - PAD.t > 26 ? y - 16 : y + 18, tw = ctx.measureText(callout.text).width;
      ctx.fillStyle = c.token('--panel'); ctx.fillRect(onRight ? tx - tw - 3 : tx - 3, ty - 9, tw + 6, 18);
      ctx.fillStyle = pen; ctx.fillText(callout.text, tx, ty);
    }

    if (hover !== null && xs[hover] !== undefined) {
      const x = Math.round(xPos(xs[hover]!)) + 0.5;
      ctx.strokeStyle = muted; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(x, PAD.t); ctx.lineTo(x, PAD.t + plotH); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  c.canvas.addEventListener('pointermove', (e) => {
    if (xs.length === 0) return;
    const box = c.canvas.getBoundingClientRect(), px = e.clientX - box.left;
    let best = 0;
    for (let i = 1; i < xs.length; i++) if (Math.abs(xPos(xs[i]!) - px) < Math.abs(xPos(xs[best]!) - px)) best = i;
    hover = best;
    const rows = opts.series.filter((s) => data[s.key]?.length).map((s) => { const v = data[s.key]![best]; return `${s.label} ${v === null || v === undefined ? '-' : short(v)}`; });
    const marker = markers.find((m) => m.x === xs[best]);
    tip.textContent = [`${xLabel} ${short(xs[best]!)}`.trim(), ...rows, ...(marker ? [`reward change: ${marker.label}`] : [])].join('\n');
    tip.hidden = false;
    const x = xPos(xs[best]!);
    tip.style.left = `${Math.min(x + 10, c.w - tip.offsetWidth - 4)}px`; tip.style.top = `${PAD.t}px`;
    c.redraw();
  });
  c.canvas.addEventListener('pointerleave', () => { hover = null; tip.hidden = true; c.redraw(); });

  return {
    el,
    setNote(text) { if (note.textContent !== text) note.textContent = text; },
    setXLabel(text) { if (xLabel !== text) { xLabel = text; c.redraw(); } },
    setData(x, ys, m = [], note) {
      xs = x; data = ys; markers = m; callout = note;
      c.canvas.dataset.points = String(x.length); c.canvas.dataset.markers = String(m.length);
      c.redraw();
    },
  };
}
