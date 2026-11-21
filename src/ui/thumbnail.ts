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
  if (def.meta.dims === '3d' && !def.meta.generated) {
    // A stick figure mid-stride on a ground line with metre ticks (drawn, not simulated: the physics engine is not loaded here).
    const u = hgt / 400, gx = w / 2, gy = 300 * u, line = (pts: number[], color: string, width: number) => {
      ctx.strokeStyle = color; ctx.lineWidth = width * u; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(gx + pts[0]! * u, gy - pts[1]! * u);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(gx + pts[i]! * u, gy - pts[i + 1]! * u);
      ctx.stroke();
    };
    line([-300, 0, 300, 0], css.getPropertyValue('--line'), 3);
    for (let x = -240; x <= 240; x += 80) line([x, 0, x, -10], css.getPropertyValue('--faint'), 3);
    line([0, 120, -34, 62, -60, 4, -36, 0], css.getPropertyValue('--series-median'), 14);    // far leg, trailing
    line([0, 120, 40, 70, 34, 4, 60, 0], css.getPropertyValue('--accent-2'), 14);            // near leg, leading
    line([0, 120, 10, 196], css.getPropertyValue('--accent'), 26);                           // torso
    ctx.fillStyle = css.getPropertyValue('--accent');
    ctx.beginPath(); ctx.arc(gx + 14 * u, gy - 232 * u, 22 * u, 0, Math.PI * 2); ctx.fill();
    return;
  }
  ctx.fillStyle = css.getPropertyValue('--muted');
  ctx.font = `600 ${hgt * 0.3}px ${css.getPropertyValue('--font-mono')}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(def.meta.name.split(/\s+/).map((s) => s[0]).join('').slice(0, 3).toUpperCase(), w / 2, hgt / 2);
}
