import { playDrawCmds } from '../../env/draw2d';
import type { RenderFrame } from '../../env/types';
import { h } from '../dom';

export interface Stage {
  el: HTMLElement;
  show(frame: RenderFrame): void;
  setHeader(text: string): void;
  setMode(mode: 'play' | 'live' | 'replay'): void;
}

/** The game viewport. Paints frames posted by the workers; knows nothing about envs. */
export function createStage(): Stage {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = h('canvas', { class: 'stage-canvas', width: 800 * dpr, height: 500 * dpr, 'aria-label': 'Game view' });
  const ctx = canvas.getContext('2d')!;
  const note = h('p', { class: 'stage-note', hidden: true }, '3D view arrives in C4');
  const header = h('span', { class: 'stage-header', testid: 'stage-header' }, 'Loading');
  const el = h('section', { class: 'panel stage', testid: 'stage', dataset: { mode: 'live', frames: '0' } },
    h('div', { class: 'stage-bar' }, header),
    h('div', { class: 'stage-view' }, canvas, note));
  let frames = 0;
  return {
    el,
    show(frame) {
      el.dataset.frames = String(++frames);
      note.hidden = frame.kind === '2d';
      if (frame.kind !== '2d') return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      playDrawCmds(ctx, frame.cmds);
    },
    setHeader(text) { header.textContent = text; },
    setMode(m) { el.dataset.mode = m; },
  };
}
