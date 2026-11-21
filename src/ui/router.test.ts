import { describe, expect, it } from 'vitest';
import { formatRoute, parseRoute } from './router';

describe('router', () => {
  it('parses and formats', () => {
    expect(parseRoute('')).toEqual({ page: 'gallery' });
    expect(parseRoute('#/')).toEqual({ page: 'gallery' });
    expect(parseRoute('#/c/pong')).toEqual({ page: 'concept', envId: 'pong', step: 1 });
    expect(parseRoute('#/c/gen-juggle-a1b2/4')).toEqual({ page: 'concept', envId: 'gen-juggle-a1b2', step: 4 });
    expect(parseRoute('#/c/pong/9')).toEqual({ page: 'concept', envId: 'pong', step: 1 });
    expect(parseRoute('#/settings')).toEqual({ page: 'settings' });
    expect(parseRoute('#/nonsense')).toEqual({ page: 'gallery' });
    expect(formatRoute({ page: 'concept', envId: 'snake', step: 3 })).toBe('#/c/snake/3');
    expect(formatRoute({ page: 'gallery' })).toBe('#/');
  });
});
