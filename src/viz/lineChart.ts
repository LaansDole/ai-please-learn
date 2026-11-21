import { createChartCanvas } from './canvas';
import { decimate, niceTicks } from './scale';

export interface SeriesSpec { key: string; label: string; color: string; dash?: number[]; dots?: boolean }   // color: a CSS colour or a '--token'
export interface ChartMarker { x: number; label: string }
export interface LineChart {
  el: HTMLElement;
  setData(x: number[], ys: Record<string, (number | null)[]>, markers?: ChartMarker[]): void;
}

const PAD = { l: 46, r: 64, t: 10, b: 22 }, DECIMATE_ABOVE = 2000;
const short = (v: number) => (Math.abs(v) >= 10000 ? `${(v / 1000).toFixed(0)}k` : Math.abs(v) >= 100 || Number.isInteger(v) ? v.toFixed(0) : v.toPrecision(3));

/** Line chart with nice ticks, directly labelled series, reward-change markers and a hover crosshair (spec section 11.4). */
export function createLineChart(opts: { testid: string; title: string; series: SeriesSpec[]; logToggle?: boolean }): LineChart {
  let xs: number[] = [], data: Record<string, (number | null)[]> = {}, markers: ChartMarker[] = [], hover: number | null = null, log = false;
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
  el.append(head, c.wrap);

  const value = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) || (log && v <= 0) ? NaN : log ? Math.log10(v) : v);
  const xRange = (): [number, number] => { const a = xs[0] ?? 0, b = xs.at(-1) ?? 1; return b > a ? [a, b] : [a - 1, a + 1]; };
  const xPos = (x: number) => { const [a, b] = xRange(); return PAD.l + ((x - a) / (b - a)) * (c.w - PAD.l - PAD.r); };

  function draw(): void {
    const line = c.token('--line'), muted = c.token('--muted'), mono = c.token('--font-mono');
    const plotH = c.h - PAD.t - PAD.b, right = c.w - PAD.r;
    ctx.font = `10px ${mono}`; ctx.textBaseline = 'middle'; ctx.lineWidth = 1;
    if (xs.length === 0) {
      ctx.fillStyle = muted; ctx.textAlign = 'center';
      ctx.fillText('No data yet', c.w / 2, c.h / 2);
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
      ctx.fillStyle = muted; ctx.fillText(String(t), xPos(t), c.h - PAD.b / 2);
    }

    const warn = c.token('--warn');
    for (const m of markers) {
      const x = Math.round(xPos(m.x)) + 0.5;
      ctx.strokeStyle = warn; ctx.beginPath(); ctx.moveTo(x, PAD.t); ctx.lineTo(x, PAD.t + plotH); ctx.stroke();
      ctx.fillStyle = warn; ctx.fillRect(x, PAD.t, 11, 11);
      ctx.fillStyle = c.token('--bg'); ctx.font = `bold 9px ${mono}`; ctx.fillText('R', x + 5.5, PAD.t + 6); ctx.font = `10px ${mono}`;
    }

    const ends: { y: number; label: string; color: string }[] = [];
    for (const s of opts.series) {
      const raw = (data[s.key] ?? []).map(value);
      const d = xs.length > DECIMATE_ABOVE ? decimate(xs, raw, DECIMATE_ABOVE / 2) : { xs, ys: raw };
      const color = c.token(s.color);
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = s.dash ? 1.5 : 2; ctx.setLineDash(s.dash ?? []); ctx.lineJoin = 'round';
      ctx.beginPath();
      let pen = false, last = NaN;
      d.ys.forEach((v, i) => {
        if (Number.isNaN(v)) { pen = false; return; }
        if (pen) ctx.lineTo(xPos(d.xs[i]!), yPos(v)); else ctx.moveTo(xPos(d.xs[i]!), yPos(v));
        pen = true; last = v;
      });
      ctx.stroke(); ctx.setLineDash([]);
      if (s.dots || d.xs.length === 1) d.ys.forEach((v, i) => { if (!Number.isNaN(v)) { ctx.beginPath(); ctx.arc(xPos(d.xs[i]!), yPos(v), 2.5, 0, Math.PI * 2); ctx.fill(); } });
      if (!Number.isNaN(last)) ends.push({ y: yPos(last), label: s.label, color });
    }
    // Direct labels at the right end, nudged apart so close series stay readable.
    ends.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) ends[i]!.y = Math.max(ends[i]!.y, ends[i - 1]!.y + 12);
    const overflow = ends.length ? Math.max(0, ends.at(-1)!.y - (PAD.t + plotH)) : 0;
    ctx.textAlign = 'left'; ctx.font = `11px ${mono}`;
    for (const e of ends) { ctx.fillStyle = e.color; ctx.fillText(e.label, right + 6, e.y - overflow); }

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
    const rows = opts.series.map((s) => { const v = data[s.key]?.[best]; return `${s.label} ${v === null || v === undefined ? '-' : short(v)}`; });
    const marker = markers.find((m) => m.x === xs[best]);
    tip.textContent = [`${xs[best]}`, ...rows, ...(marker ? [`reward change: ${marker.label}`] : [])].join('\n');
    tip.hidden = false;
    const x = xPos(xs[best]!);
    tip.style.left = `${Math.min(x + 10, c.w - tip.offsetWidth - 4)}px`; tip.style.top = `${PAD.t}px`;
    c.redraw();
  });
  c.canvas.addEventListener('pointerleave', () => { hover = null; tip.hidden = true; c.redraw(); });

  return {
    el,
    setData(x, ys, m = []) {
      xs = x; data = ys; markers = m;
      c.canvas.dataset.points = String(x.length); c.canvas.dataset.markers = String(m.length);
      c.redraw();
    },
  };
}
