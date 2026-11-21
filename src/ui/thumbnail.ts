import { RecordingDraw2D, playDrawCmds } from '../env/draw2d';
import type { Action, EnvDefinition } from '../env/types';

function neutralAction(def: EnvDefinition): Action {
  const a = def.action;
  return a.type === 'discrete' ? Math.floor(a.labels.length / 2) : a.type === 'continuous' ? new Float32Array(a.labels.length) : 0;
}

/** 2D built-ins: a real frame 30 steps into an episode. 3D or generated: the env's initials. */
export function drawThumbnail(canvas: HTMLCanvasElement, def: EnvDefinition): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width, hgt = canvas.height;
  if (def.meta.dims === '2d' && !def.meta.generated) {
    const env = def.create(), draw = new RecordingDraw2D();
    env.reset(1);
    for (let i = 0; i < 30 && !env.done; i++) env.step(neutralAction(def));
    env.render({ kind: '2d', draw, ghost: false });
    env.dispose?.();
    ctx.setTransform(w / 800, 0, 0, hgt / 500, 0, 0);
    playDrawCmds(ctx, draw.cmds);
    return;
  }
  const css = getComputedStyle(document.documentElement);
  ctx.fillStyle = css.getPropertyValue('--panel-2'); ctx.fillRect(0, 0, w, hgt);
  ctx.fillStyle = css.getPropertyValue('--muted');
  ctx.font = `600 ${hgt * 0.3}px ${css.getPropertyValue('--font-mono')}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(def.meta.name.split(/\s+/).map((s) => s[0]).join('').slice(0, 3).toUpperCase(), w / 2, hgt / 2);
}
