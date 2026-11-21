import { describe, expect, it } from 'vitest';
import { parseResponse } from './parse';

const F = '```';
const json = `${F}json\n{ "name": "x" }\n${F}`, js = (lang = 'js') => `${F}${lang}\nfunction createEnv(sdk) { return {}; }\n${F}`;

describe('parseResponse', () => {
  it('parses a json block followed by a js block', () => {
    expect(parseResponse(`${json}\n\n${js()}`)).toEqual({ ok: true, meta: { name: 'x' }, source: 'function createEnv(sdk) { return {}; }\n' });
  });
  it('tolerates prose, the javascript fence language and either order', () => {
    expect(parseResponse(`Sure! Here you go:\n\n${json}\n\nAnd the module:\n${js('javascript')}\nEnjoy.`).ok).toBe(true);
    expect(parseResponse(`${js()}\n${json}`).ok).toBe(true);
  });
  it('explains what is missing', () => {
    const none = parseResponse(js());
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.errors[0]).toMatch(/json block/);
    const two = parseResponse(`${json}\n${js()}\n${js()}`);
    if (!two.ok) expect(two.errors[0]).toMatch(/js block.*found 2/);
    expect(two.ok).toBe(false);
    const bad = parseResponse(`${F}json\n{ nope }\n${F}\n${js()}`);
    expect(bad.ok).toBe(false);
    let parserMessage = '';
    try { JSON.parse('{ nope }\n'); } catch (e) { parserMessage = (e as Error).message; }
    if (!bad.ok) expect(bad.errors[0]).toContain(parserMessage);
  });
});
