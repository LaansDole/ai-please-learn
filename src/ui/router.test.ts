import { describe, expect, it } from 'vitest';
import { RESERVED_IDS, listEnvs, validateDefinition } from '../env/registry';
import { registerBuiltins } from '../envs/index';
import { reach1d } from '../envs/reach1d';
import { slugId } from '../gen/meta';
import { formatRoute, legacyHashPath, parseRoute } from './router';

describe('router', () => {
  it('parses and formats clean paths', () => {
    expect(parseRoute('/')).toEqual({ page: 'gallery' });
    expect(parseRoute('/index.html')).toEqual({ page: 'gallery' });
    expect(parseRoute('/pong')).toEqual({ page: 'concept', envId: 'pong', step: 1 });
    expect(parseRoute('/pong/')).toEqual({ page: 'concept', envId: 'pong', step: 1 });
    expect(parseRoute('/gen-juggle-a1b2/4')).toEqual({ page: 'concept', envId: 'gen-juggle-a1b2', step: 4 });
    expect(parseRoute('/pong/9')).toEqual({ page: 'concept', envId: 'pong', step: 1 });
    expect(parseRoute('/settings')).toEqual({ page: 'settings' });
    expect(parseRoute('/create')).toEqual({ page: 'create' });
    expect(formatRoute({ page: 'concept', envId: 'snake', step: 3 })).toBe('/snake/3');
    expect(formatRoute({ page: 'gallery' })).toBe('/');
    expect(formatRoute({ page: 'settings' })).toBe('/settings');
    expect(formatRoute({ page: 'create' })).toBe('/create');
  });
  it('sends unknown paths to the not-found view', () => {
    for (const p of ['/create/extra', '/settings/2', '/pong/2/x', '/Pong', '/favicon.svg', '/c/pong/1/2'])
      expect(parseRoute(p), p).toEqual({ page: 'notfound' });
  });
  it('works under a sub-path base', () => {
    expect(parseRoute('/evolab/', '/evolab/')).toEqual({ page: 'gallery' });
    expect(parseRoute('/evolab', '/evolab/')).toEqual({ page: 'gallery' });
    expect(parseRoute('/evolab/pong/2', '/evolab/')).toEqual({ page: 'concept', envId: 'pong', step: 2 });
    expect(parseRoute('/evolab/create', '/evolab/')).toEqual({ page: 'create' });
    expect(parseRoute('/elsewhere/pong', '/evolab/')).toEqual({ page: 'notfound' });
    expect(formatRoute({ page: 'concept', envId: 'pong', step: 2 }, '/evolab/')).toBe('/evolab/pong/2');
    expect(formatRoute({ page: 'gallery' }, '/evolab/')).toBe('/evolab/');
    expect(formatRoute({ page: 'settings' }, '/evolab/')).toBe('/evolab/settings');
  });
  it('maps old hash links to clean paths', () => {
    expect(legacyHashPath('#/c/pong')).toBe('/pong');
    expect(legacyHashPath('#/c/pong/3', '/evolab/')).toBe('/evolab/pong/3');
    expect(legacyHashPath('#/settings', '/evolab/')).toBe('/evolab/settings');
    expect(legacyHashPath('#/create')).toBe('/create');
    expect(legacyHashPath('#/', '/evolab/')).toBe('/evolab/');
    expect(legacyHashPath('')).toBeNull();
    expect(legacyHashPath('#section')).toBeNull();
  });
  it('reserved top-level names are never concepts', () => {
    for (const name of RESERVED_IDS) expect(parseRoute(`/${name}/1`).page, name).not.toBe('concept');
    for (const name of ['create', 'settings', 'assets', 'demo', 'api', 'src']) expect(RESERVED_IDS.has(name), name).toBe(true);
    registerBuiltins();
    for (const def of listEnvs()) expect(parseRoute(formatRoute({ page: 'concept', envId: def.meta.id, step: 1 })).page, def.meta.id).toBe('concept');
    expect(validateDefinition({ ...reach1d, meta: { ...reach1d.meta, id: 'create' } }).join(' ')).toMatch(/reserved/);
    expect(validateDefinition(reach1d)).toEqual([]);
    expect(RESERVED_IDS.has(slugId('create', () => 0))).toBe(false);
    expect([...RESERVED_IDS].filter((n) => n.startsWith('gen-'))).toEqual([]);
  });
});
