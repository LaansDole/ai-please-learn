import type { NetworkSnapshot } from '../learner/types';
import { diffSnapshots, edgeKey, edgeStyle, layoutNetwork, visibleEdges, type Point } from './nnLayout';

export interface NnGraph {
  el: HTMLCanvasElement;
  /** animate = false: show the snapshot as is (a different agent or source, not growth of the same one). */
  setNetwork(net: NetworkSnapshot, animate?: boolean): void;
  setActivations(a: Float32Array): void;
  setShowDisabled(on: boolean): void;
  dispose(): void;
}

const MOVE_MS = 400, EDGE_MS = 600, NODE_MS = 900, FADE_MS = 300, CAPTION_MS = 2000, HEAT_MS = 1500;
const R = 7, R_DENSE = 3, DENSE = 24, LABEL_GAP = 7, EDGE_GAP = 6, LABEL_SHARE = 0.38, FONT = 11;

/** cubic-bezier(.2, .8, .2, 1) is close to this ease-out; exactness is not visible at these durations. */
const ease = (t: number) => 1 - (1 - t) ** 3;
const rgb = (hex: string): [number, number, number] => { const n = parseInt(hex.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const plural = (n: number, word: string) => `+${n} ${word}${n === 1 ? '' : 's'}`;

/** Canvas renderer for a NetworkSnapshot with growth animation (spec section 11.3). Redraws only when dirty or animating. */
export function createNnGraph(): NnGraph {
  const el = document.createElement('canvas');
  el.dataset.testid = 'nn-graph'; el.dataset.nodes = '0'; el.dataset.edges = '0';
  el.setAttribute('role', 'img'); el.setAttribute('aria-label', 'Neural network graph');
  const ctx = el.getContext('2d')!;
  const css = getComputedStyle(document.documentElement);
  const token = (name: string) => css.getPropertyValue(name).trim();
  const C = {
    pos: token('--w-pos'), neg: token('--w-neg'), faint: token('--faint'), line: token('--line'), text: token('--text'), muted: token('--muted'),
    heat: token('--heat'), glow: token('--glow'), accent: token('--accent'), panel: token('--panel'), mono: token('--font-mono'),
  };
  const cold = rgb(token('--panel-2')), hot = rgb(C.glow);
  const motion = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1;
  /** Progress 0..1 of an animation `ms` long that started at t0; instant under reduced motion. */
  const prog = (now: number, ms: number) => (motion ? Math.min(1, Math.max(0, now - t0) / ms) : 1);   // rAF time can trail performance.now()

  let net: NetworkSnapshot | null = null, acts: Float32Array | null = null, showDisabled = false;
  let w = 0, h = 0, t0 = 0, raf = 0, hover: number | null = null, caption = '';
  let target = new Map<number, Point>(), from = new Map<number, Point>();
  let addedNodes = new Set<number>(), addedEdges = new Set<string>();
  let goneNodes: Point[] = [], goneEdges: [Point, Point][] = [];
  let dense = new Set<number>();              // depths with more than DENSE nodes
  let labels = new Map<number, string>();     // node id -> label as drawn (shortened only if it cannot fit its side)
  let labelRoom = { l: 0, r: 0 };             // widest label per side, capped at LABEL_SHARE of the width

  /** Longest prefix of `text` (plus an ellipsis) that fits `max` px; the full name stays available on hover and in `title`. */
  const fit = (text: string, max: number): string => {
    if (ctx.measureText(text).width <= max) return text;
    let n = text.length;
    while (n > 1 && ctx.measureText(`${text.slice(0, n)}\u2026`).width > max) n--;
    return `${text.slice(0, n)}\u2026`;
  };

  const at = (id: number, now: number): Point | undefined => {
    const b = target.get(id), a = from.get(id);
    if (!b || !a) return b;
    const t = ease(prog(now, MOVE_MS));
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  };
  const relayout = () => {
    if (!net) return;
    const count = new Map<number, number>();
    for (const n of net.nodes) count.set(n.depth, (count.get(n.depth) ?? 0) + 1);
    dense = new Set([...count].filter(([, c]) => c > DENSE).map(([d]) => d));
    // Reserve room for the labels on each side from their measured width, so none is cut at the panel edge.
    ctx.font = `${FONT}px ${C.mono}`;
    const labelled = net.nodes.filter((n) => n.label && !dense.has(n.depth) && n.type !== 'hidden'), cap = w * LABEL_SHARE;
    const side = (type: 'input' | 'output') => Math.min(cap, Math.max(0, ...labelled.filter((n) => n.type === type).map((n) => ctx.measureText(n.label!).width)));
    labelRoom = { l: Math.ceil(side('input')), r: Math.ceil(side('output')) };
    labels = new Map(labelled.map((n) => [n.id, fit(n.label!, n.type === 'input' ? labelRoom.l : labelRoom.r)]));
    const edge = R + LABEL_GAP + EDGE_GAP;
    target = layoutNetwork(net, w, h, { l: labelRoom.l + edge, r: labelRoom.r + edge, t: 16, b: 16 });
  };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(draw); };

  function draw(now: number): void {
    raf = 0;
    ctx.setTransform(el.width / (w || 1), 0, 0, el.height / (h || 1), 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!net || w === 0 || h === 0) return;
    const elapsed = motion ? now - t0 : Infinity;

    ctx.lineCap = 'round';
    const fade = 1 - prog(now, FADE_MS);
    if (fade > 0) {
      ctx.globalAlpha = fade * 0.6; ctx.strokeStyle = C.faint; ctx.lineWidth = 1; ctx.setLineDash([]);
      for (const [a, b] of goneEdges) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      ctx.fillStyle = C.faint;
      for (const p of goneNodes) { ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, Math.PI * 2); ctx.fill(); }
    }
    const heat = Math.max(0, 1 - elapsed / HEAT_MS), grow = ease(prog(now, EDGE_MS));
    for (const e of visibleEdges(net)) {
      if (!e.enabled && !showDisabled) continue;
      const a = at(e.from, now), b = at(e.to, now);
      if (!a || !b) continue;
      const t = e.enabled && addedEdges.has(edgeKey(e)) ? grow : 1;
      const bx = a.x + (b.x - a.x) * t, by = a.y + (b.y - a.y) * t;
      const line = () => { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(bx, by); ctx.stroke(); };
      if (!e.enabled) { ctx.globalAlpha = 0.8; ctx.strokeStyle = C.faint; ctx.lineWidth = 1; ctx.setLineDash([1, 4]); line(); continue; }
      const s = edgeStyle(e.weight);
      ctx.globalAlpha = s.alpha; ctx.strokeStyle = s.dashed ? C.neg : C.pos; ctx.lineWidth = s.width; ctx.setLineDash(s.dashed ? [6, 4] : []);
      line();
      if (e.delta && heat > 0) { ctx.globalAlpha = e.delta * heat; ctx.strokeStyle = C.heat; ctx.setLineDash([]); line(); }
    }
    ctx.setLineDash([]); ctx.lineCap = 'butt';

    const pop = prog(now, NODE_MS);
    ctx.font = `${FONT}px ${C.mono}`; ctx.textBaseline = 'middle';
    net.nodes.forEach((n, i) => {
      const p = at(n.id, now);
      if (!p) return;
      const isNew = addedNodes.has(n.id), r = (dense.has(n.depth) ? R_DENSE : R) * (isNew ? ease(pop) : 1);
      const a = acts ? acts[i]! : 0, m = Math.min(1, Math.abs(a));
      if (isNew && pop < 1) {
        ctx.globalAlpha = 1 - pop; ctx.strokeStyle = C.accent; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, R + 18 * ease(pop), 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = `rgb(${cold.map((c, k) => Math.round(c + (hot[k]! - c) * m)).join(',')})`;
      ctx.shadowColor = C.glow; ctx.shadowBlur = 12 * m;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = n.id === hover ? C.text : C.line; ctx.lineWidth = 1; ctx.stroke();
      if (a < -0.05 && r >= R) { ctx.strokeStyle = C.panel; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(p.x - 3, p.y); ctx.lineTo(p.x + 3, p.y); ctx.stroke(); }
      const text = labels.get(n.id);
      if (!text || n.id === hover) return;
      ctx.fillStyle = C.muted; ctx.textAlign = n.type === 'input' ? 'right' : 'left';
      ctx.fillText(text, p.x + (n.type === 'input' ? -R - LABEL_GAP : R + LABEL_GAP), p.y);
    });

    const hovered = hover === null ? undefined : net.nodes.find((n) => n.id === hover), hp = hovered && at(hovered.id, now);
    if (hovered && hp) {
      const text = hovered.label ?? `hidden ${hovered.id}`, tw = ctx.measureText(text).width;
      const left = hovered.type === 'input', x = left ? Math.max(4, hp.x - R - LABEL_GAP - tw) : Math.min(w - tw - 4, hp.x + R + LABEL_GAP);
      ctx.fillStyle = C.panel; ctx.fillRect(x - 3, hp.y - 9, tw + 6, 18);
      ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.fillText(text, x, hp.y);
    }
    if (caption && elapsed < CAPTION_MS) {
      ctx.globalAlpha = Math.min(1, (CAPTION_MS - elapsed) / 500);
      ctx.fillStyle = C.accent; ctx.textAlign = 'center'; ctx.font = `12px ${C.mono}`;
      ctx.fillText(caption, w / 2, h - 10);
      ctx.globalAlpha = 1;
    }
    if (elapsed < Math.max(CAPTION_MS, HEAT_MS)) schedule();
  }

  const observer = new ResizeObserver(() => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = el.clientWidth; h = el.clientHeight;
    el.width = Math.max(1, Math.round(w * dpr)); el.height = Math.max(1, Math.round(h * dpr));
    relayout(); from = target;
    schedule();
  });
  observer.observe(el);
  const onMove = (e: PointerEvent) => {
    if (!net) return;
    const box = el.getBoundingClientRect(), x = e.clientX - box.left, y = e.clientY - box.top;
    let best: number | null = null, bestD = 14 * 14;
    for (const [id, p] of target) { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bestD) { bestD = d; best = id; } }
    if (best !== hover) {
      hover = best;
      const label = net.nodes.find((n) => n.id === best)?.label;   // native tooltip only for a label that had to be shortened
      el.title = label && best !== null && labels.get(best) !== label && labels.has(best) ? label : '';
      schedule();
    }
  };
  const onLeave = () => { if (hover !== null) { hover = null; el.title = ''; schedule(); } };
  el.addEventListener('pointermove', onMove); el.addEventListener('pointerleave', onLeave);

  return {
    el,
    setNetwork(next, animate = true) {
      const now = performance.now(), prev = animate ? net : null;
      const d = diffSnapshots(prev, next);
      const current = new Map<number, Point>();
      if (prev) for (const n of prev.nodes) { const p = at(n.id, now); if (p) current.set(n.id, p); }
      goneNodes = d.removedNodes.flatMap((id) => current.get(id) ?? []);
      goneEdges = d.removedEdges.flatMap((k): [Point, Point][] => {
        const [a, b] = k.split('>').map((id) => current.get(Number(id)));
        return a && b ? [[a, b]] : [];
      });
      addedNodes = new Set(d.addedNodes); addedEdges = new Set(d.addedEdges);
      caption = [d.addedNodes.length ? plural(d.addedNodes.length, 'neuron') : '', d.addedEdges.length ? plural(d.addedEdges.length, 'connection') : ''].filter(Boolean).join(', ');
      net = next; t0 = now;
      if (acts && acts.length !== next.nodes.length) acts = null;
      relayout();
      // New nodes start where they will sit; survivors tween from where they are now.
      from = new Map([...target].map(([id, p]) => [id, current.get(id) ?? p]));
      el.dataset.nodes = String(next.nodes.length);
      el.dataset.edges = String(next.edges.filter((e) => e.enabled).length);
      schedule();
    },
    setActivations(a) {
      if (!net || a.length !== net.nodes.length) return;
      acts = a; schedule();
    },
    setShowDisabled(on) { showDisabled = on; schedule(); },
    dispose() {
      cancelAnimationFrame(raf); observer.disconnect();
      el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerleave', onLeave);
    },
  };
}
