import { playDrawCmds } from '../../env/draw2d';
import type { Body3D, RenderFrame } from '../../env/types';
import type { ThreeStage } from '../../three/threeStage';
import { h } from '../dom';

export interface Stage {
  el: HTMLElement;
  show(frame: RenderFrame): void;
  setHeader(text: string): void;
  setMode(mode: 'play' | 'live' | 'replay'): void;
  dispose(): void;
}

/** The game viewport. Paints frames posted by the workers; knows nothing about envs. */
export function createStage(): Stage {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = h('canvas', { class: 'stage-canvas', width: 800 * dpr, height: 500 * dpr, 'aria-label': 'Game view', dataset: { kind: '2d' } });
  const ctx = canvas.getContext('2d')!;
  // 3D: a second canvas and the HUD over it, created with three.js on the first 3d frame so 2D concepts never load it.
  const canvas3d = h('canvas', { class: 'stage-canvas', 'aria-label': '3D view', dataset: { kind: '3d' }, hidden: true });
  const distance = h('span', { class: 'hud-distance num', testid: 'hud-distance' }, '0.0 m');
  const caption = h('span', { class: 'hud-caption' });
  const hud = h('div', { class: 'stage-hud', hidden: true }, h('span', { class: 'hud-label' }, 'Distance'), distance, caption);
  const header = h('span', { class: 'stage-header', testid: 'stage-header' }, 'Loading');
  const el = h('section', { class: 'panel stage', testid: 'stage', dataset: { mode: 'live', frames: '0' } },
    h('div', { class: 'stage-bar' }, header),
    h('div', { class: 'stage-view' }, canvas, canvas3d, hud));
  let frames = 0, three: ThreeStage | null = null, loading = false, pending: Body3D[] | null = null, gone = false;

  const paint3d = (bodies: Body3D[]) => {
    const x = three!.show(bodies);
    if (x !== null) distance.textContent = `${x.toFixed(1)} m`;
  };
  const observer = new ResizeObserver(() => { three?.resize(canvas3d.clientWidth, canvas3d.clientHeight); if (three && pending) paint3d(pending); });
  observer.observe(canvas3d);
  const load3d = () => {
    loading = true;
    // Lazy on purpose: three.js is its own chunk, fetched only by concepts that send 3d frames.
    import('../../three/threeStage').then(({ createThreeStage }) => {
      if (gone) return;
      three = createThreeStage(canvas3d);
      three.resize(canvas3d.clientWidth, canvas3d.clientHeight);
      if (pending) paint3d(pending);        // frames that arrived while loading were dropped, except the newest
    }, (e: unknown) => { caption.textContent = `3D view failed to load: ${e instanceof Error ? e.message : String(e)}`; });
  };

  return {
    el,
    show(frame) {
      el.dataset.frames = String(++frames);
      const is3d = frame.kind === '3d';
      canvas.hidden = is3d; canvas3d.hidden = hud.hidden = !is3d;
      if (frame.kind === '2d') { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); playDrawCmds(ctx, frame.cmds); return; }
      pending = frame.bodies;
      if (three) paint3d(frame.bodies);
      else if (!loading) load3d();
    },
    setHeader(text) { header.textContent = text; caption.textContent = text; },
    setMode(m) { el.dataset.mode = m; },
    dispose() { gone = true; observer.disconnect(); three?.dispose(); three = null; },
  };
}
