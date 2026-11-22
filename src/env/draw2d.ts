import type { Body3D, Draw2D, DrawCmd, Quat, Scene3D, Vec3 } from './types';

/** Draw2D that records serialisable commands instead of touching a canvas. */
export class RecordingDraw2D implements Draw2D {
  cmds: DrawCmd[] = [];
  clear(color: string): void { this.cmds.push(['c', color]); }
  rect(x: number, y: number, w: number, h: number, color: string): void { this.cmds.push(['r', x, y, w, h, color]); }
  circle(x: number, y: number, r: number, color: string): void { this.cmds.push(['o', x, y, r, color]); }
  line(x1: number, y1: number, x2: number, y2: number, color: string, width = 1): void { this.cmds.push(['l', x1, y1, x2, y2, color, width]); }
  poly(points: number[], color: string, fill = true): void { this.cmds.push(['p', points, color, fill]); }
  text(s: string, x: number, y: number, color: string, size = 14): void { this.cmds.push(['t', s, x, y, color, size]); }
  /** Harness only (ghost transparency); not part of the env-facing Draw2D. */
  alpha(a: number): void { this.cmds.push(['a', a]); }
}

export class RecordingScene3D implements Scene3D {
  bodies: Body3D[] = [];
  prefix = '';
  ghost = false;
  body(id: string, shape: Body3D['shape'], size: Vec3, pos: Vec3, quat: Quat, color?: string): void {
    this.bodies.push({ id: this.prefix + id, shape, size, pos, quat, color, ghost: this.ghost });
  }
}

/** The subset of CanvasRenderingContext2D that playDrawCmds uses. */
export type Ctx2D = Pick<CanvasRenderingContext2D,
  'fillStyle' | 'strokeStyle' | 'lineWidth' | 'globalAlpha' | 'font' | 'fillRect' | 'beginPath' | 'arc' | 'moveTo' | 'lineTo' | 'closePath' | 'fill' | 'stroke' | 'fillText'>;

/** Paints recorded commands on the 800 x 500 logical canvas. */
export function playDrawCmds(ctx: Ctx2D, cmds: DrawCmd[]): void {
  for (const c of cmds) {
    switch (c[0]) {
      case 'c': ctx.globalAlpha = 1; ctx.fillStyle = c[1]; ctx.fillRect(0, 0, 800, 500); break;
      case 'r': ctx.fillStyle = c[5]; ctx.fillRect(c[1], c[2], c[3], c[4]); break;
      case 'o': ctx.fillStyle = c[4]; ctx.beginPath(); ctx.arc(c[1], c[2], c[3], 0, Math.PI * 2); ctx.fill(); break;
      case 'l': ctx.strokeStyle = c[5]; ctx.lineWidth = c[6]; ctx.beginPath(); ctx.moveTo(c[1], c[2]); ctx.lineTo(c[3], c[4]); ctx.stroke(); break;
      case 'p': {
        const pts = c[1];
        if (pts.length < 4) break;
        ctx.beginPath(); ctx.moveTo(pts[0]!, pts[1]!);
        for (let i = 2; i + 1 < pts.length; i += 2) ctx.lineTo(pts[i]!, pts[i + 1]!);
        ctx.closePath();
        if (c[3]) { ctx.fillStyle = c[2]; ctx.fill(); } else { ctx.strokeStyle = c[2]; ctx.lineWidth = 1; ctx.stroke(); }
        break;
      }
      case 't': ctx.fillStyle = c[4]; ctx.font = `${c[5]}px "Gill Sans", "Gill Sans MT", "Trebuchet MS", Candara, system-ui, sans-serif`; ctx.fillText(c[1], c[2], c[3]); break;
      case 'a': ctx.globalAlpha = c[1]; break;
    }
  }
}
