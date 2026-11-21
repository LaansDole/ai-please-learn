import { describe, expect, it } from 'vitest';
import { RecordingDraw2D, RecordingScene3D, playDrawCmds, type Ctx2D } from './draw2d';

describe('draw recorders', () => {
  it('records commands with defaults and replays them on a canvas context', () => {
    const d = new RecordingDraw2D();
    d.clear('#000'); d.rect(1, 2, 3, 4, '#111'); d.alpha(0.15); d.circle(5, 6, 7, '#222');
    d.line(0, 0, 9, 9, '#333'); d.poly([0, 0, 4, 0, 4, 4], '#444', false); d.text('hi', 10, 20, '#555');
    expect(d.cmds).toEqual([
      ['c', '#000'], ['r', 1, 2, 3, 4, '#111'], ['a', 0.15], ['o', 5, 6, 7, '#222'],
      ['l', 0, 0, 9, 9, '#333', 1], ['p', [0, 0, 4, 0, 4, 4], '#444', false], ['t', 'hi', 10, 20, '#555', 14],
    ]);

    const log: string[] = []; const alphaAt: number[] = [];
    const call = (name: string) => () => { log.push(name); alphaAt.push(ctx.globalAlpha); };
    const ctx: Ctx2D = {
      fillStyle: '', strokeStyle: '', lineWidth: 0, globalAlpha: 0.5, font: '',
      fillRect: call('fillRect'), beginPath: call('beginPath'), arc: call('arc'), moveTo: call('moveTo'), lineTo: call('lineTo'),
      closePath: call('closePath'), fill: call('fill'), stroke: call('stroke'), fillText: call('fillText'),
    };
    playDrawCmds(ctx, d.cmds);
    expect(log).toEqual([
      'fillRect', 'fillRect', 'beginPath', 'arc', 'fill', 'beginPath', 'moveTo', 'lineTo', 'stroke',
      'beginPath', 'moveTo', 'lineTo', 'lineTo', 'closePath', 'stroke', 'fillText',
    ]);
    expect(alphaAt.slice(0, 3)).toEqual([1, 1, 0.15]);   // clear resets alpha; 'a' applies after the first rect
    expect(ctx.font).toContain('14px');
  });
  it('RecordingScene3D prefixes ids and tags ghosts', () => {
    const s = new RecordingScene3D();
    s.body('torso', 'box', [1, 2, 3], [0, 1, 0], [0, 0, 0, 1], '#fff');
    s.prefix = '3:'; s.ghost = true;
    s.body('torso', 'sphere', [1, 0, 0], [0, 0, 0], [0, 0, 0, 1]);
    expect(s.bodies).toEqual([
      { id: 'torso', shape: 'box', size: [1, 2, 3], pos: [0, 1, 0], quat: [0, 0, 0, 1], color: '#fff', ghost: false },
      { id: '3:torso', shape: 'sphere', size: [1, 0, 0], pos: [0, 0, 0], quat: [0, 0, 0, 1], color: undefined, ghost: true },
    ]);
  });
});
