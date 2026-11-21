import { describe, expect, it } from 'vitest';
import { InputTracker } from './input';

describe('InputTracker', () => {
  it('tracks held and pressed keys of the env only', () => {
    const t = new InputTracker(['ArrowLeft', 'Space']);
    expect(t.down('ArrowLeft')).toBe(true);
    expect(t.down('KeyX')).toBe(false);
    expect(t.take()).toEqual({ held: ['ArrowLeft'], pressed: ['ArrowLeft'] });
    expect(t.take()).toEqual({ held: ['ArrowLeft'], pressed: [] });
    t.down('ArrowLeft');                                   // key repeat
    expect(t.take().pressed).toEqual([]);
    expect(t.up('ArrowLeft')).toBe(true);
    expect(t.take().held).toEqual([]);
    t.down('Space'); t.clear();
    expect(t.take()).toEqual({ held: [], pressed: [] });
  });
});
