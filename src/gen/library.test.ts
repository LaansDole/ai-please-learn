import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { GOOD } from './fixtures';
import { openLibrary, parseConceptFile, toConceptFile, type StoredConcept } from './library';

const concept = (id: string, createdAt: number): StoredConcept =>
  ({ id, name: GOOD.meta.name, prompt: 'slide a dot', meta: GOOD.meta, source: GOOD.source, model: 'fake-model', createdAt });

describe('concept library', () => {
  it('stores, lists oldest first, replaces and removes', async () => {
    const lib = openLibrary(new IDBFactory());
    expect(await lib.list()).toEqual([]);
    await lib.put(concept('gen-b-0002', 200));
    await lib.put(concept('gen-a-0001', 100));
    await lib.put(concept('gen-z-0003', 150));
    expect((await lib.list()).map((c) => c.id)).toEqual(['gen-a-0001', 'gen-z-0003', 'gen-b-0002']);
    expect(await lib.get('gen-a-0001')).toEqual(concept('gen-a-0001', 100));
    expect(await lib.get('gen-nope-0000')).toBeUndefined();
    await lib.put({ ...concept('gen-a-0001', 100), prompt: 'changed' });
    expect((await lib.get('gen-a-0001'))!.prompt).toBe('changed');
    expect(await lib.list()).toHaveLength(3);
    await lib.remove('gen-a-0001');
    expect((await lib.list()).map((c) => c.id)).toEqual(['gen-z-0003', 'gen-b-0002']);
  });
  it('persists across opens of the same database', async () => {
    const factory = new IDBFactory();
    await openLibrary(factory).put(concept('gen-a-0001', 1));
    expect(await openLibrary(factory).list()).toEqual([concept('gen-a-0001', 1)]);
  });
});

describe('concept files', () => {
  const c = concept('gen-a-0001', 123);
  it('round trip', () => {
    const text = toConceptFile(c);
    expect(JSON.parse(text)).toMatchObject({ format: 'evolab-concept', version: 1, id: 'gen-a-0001' });
    expect(parseConceptFile(text)).toEqual({ ok: true, concept: c });
  });
  it.each<[string, string, RegExp]>([
    ['invalid JSON', '{ nope', /not valid JSON/],
    ['wrong format', JSON.stringify({ ...JSON.parse(toConceptFile(c)), format: 'evolab-champion' }), /format/],
    ['future version', JSON.stringify({ ...JSON.parse(toConceptFile(c)), version: 2 }), /version/],
    ['missing source', JSON.stringify({ ...JSON.parse(toConceptFile(c)), source: undefined }), /source/],
    ['foreign id', JSON.stringify({ ...JSON.parse(toConceptFile(c)), id: 'pong' }), /id/],
    ['not an object', '[]', /object/],
  ])('rejects %s', (_name, text, pattern) => {
    const r = parseConceptFile(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join('\n')).toMatch(pattern);
  });
});
