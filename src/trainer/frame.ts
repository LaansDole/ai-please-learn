import { RecordingDraw2D, RecordingScene3D } from '../env/draw2d';
import type { Env, EnvDefinition, RenderFrame } from '../env/types';

const GHOSTS_2D = 30, GHOSTS_3D = 12, GHOST_ALPHA = 0.15;

/** The featured env's full render, then (if enabled and supported) other alive envs as ghosts. Spec section 9. */
export function buildFrame(def: EnvDefinition, envs: readonly Env[], alive: readonly boolean[], featured: number, ghosts: boolean): RenderFrame {
  const others: number[] = [];
  if (ghosts && def.meta.ghosts) {
    const cap = def.meta.dims === '2d' ? GHOSTS_2D : GHOSTS_3D;
    for (let i = 0; i < envs.length && others.length < cap; i++) if (i !== featured && alive[i]) others.push(i);
  }
  if (def.meta.dims === '3d') {
    const scene = new RecordingScene3D();
    envs[featured]!.render({ kind: '3d', scene, ghost: false });
    scene.ghost = true;
    for (const i of others) { scene.prefix = `${i}:`; envs[i]!.render({ kind: '3d', scene, ghost: true }); }
    return { kind: '3d', bodies: scene.bodies };
  }
  const draw = new RecordingDraw2D();
  envs[featured]!.render({ kind: '2d', draw, ghost: false });
  if (others.length) {
    draw.alpha(GHOST_ALPHA);
    for (const i of others) envs[i]!.render({ kind: '2d', draw, ghost: true });
    draw.alpha(1);
  }
  return { kind: '2d', cmds: draw.cmds };
}
