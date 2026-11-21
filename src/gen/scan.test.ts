import { describe, expect, it } from 'vitest';
import { EXAMPLE_MODULE_JS } from './exampleEnv';
import { FETCHES } from './fixtures';
import { scanSource, stripCommentsAndStrings } from './scan';

describe('static scan', () => {
  it('accepts the example', () => expect(scanSource(EXAMPLE_MODULE_JS)).toEqual([]));
  it('ignores banned words inside comments and strings', () => {
    expect(scanSource('// fetch window\n/* eval */ function createEnv(sdk) { var s = "document.cookie"; var q = \'self\'; return {}; }')).toEqual([]);
    expect(stripCommentsAndStrings('a = "x\\"y"; // c\nb = 1;')).not.toContain('y');
  });
  it('reports each banned identifier once, as a whole word only', () => {
    const errs = scanSource('function createEnv(sdk) { fetch("a"); fetch("b"); var selfish = 1; globalThis.x = 1; return new Function("return 1"); }');
    expect(errs.filter((e) => e.includes('"fetch"')).length).toBe(1);
    expect(errs.some((e) => e.includes('"globalThis"'))).toBe(true);
    expect(errs.some((e) => e.includes('"Function"'))).toBe(true);
    expect(errs.some((e) => e.includes('"self"'))).toBe(false);
  });
  it('catches the escape hatches', () => {
    for (const bad of ['import("x")', 'this.constructor.constructor("return 1")()', 'x.__proto__', 'Math.random()', 'var s = `a${fetch}`', 'setTimeout(f, 1)', 'new Date()', 'importScripts("x")'])
      expect(scanSource(`function createEnv(sdk) { ${bad}; return {}; }`).length).toBeGreaterThan(0);
    expect(scanSource('x'.repeat(40001)).some((e) => e.includes('too long'))).toBe(true);
    expect(scanSource(FETCHES.source).some((e) => e.includes('"fetch"'))).toBe(true);
  });
});
