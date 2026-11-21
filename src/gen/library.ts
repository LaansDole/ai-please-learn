import type { GeneratedMeta } from './meta';

/** IndexedDB database `evolab`, version 1, object store `concepts` (spec section 12.8). */
export interface StoredConcept { id: string; name: string; prompt: string; meta: GeneratedMeta; source: string; model: string; createdAt: number }
export interface Library {
  list(): Promise<StoredConcept[]>;                       // oldest first
  get(id: string): Promise<StoredConcept | undefined>;
  put(c: StoredConcept): Promise<void>;
  remove(id: string): Promise<void>;
}

function open(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open('evolab', 1);
    req.onupgradeneeded = () => { req.result.createObjectStore('concepts', { keyPath: 'id' }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction('concepts', mode); const req = fn(t.objectStore('concepts'));
    t.oncomplete = () => resolve(req.result); t.onerror = () => reject(t.error); t.onabort = () => reject(t.error);
  });
}

export function openLibrary(factory: IDBFactory = globalThis.indexedDB): Library {
  let db: Promise<IDBDatabase> | null = null;
  const run = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) => tx(await (db ??= open(factory)), mode, fn);
  return {
    list: async () => (await run<StoredConcept[]>('readonly', (s) => s.getAll())).sort((a, b) => a.createdAt - b.createdAt),
    get: (id) => run<StoredConcept | undefined>('readonly', (s) => s.get(id)),
    put: async (c) => { await run('readwrite', (s) => s.put(c)); },
    remove: async (id) => { await run('readwrite', (s) => s.delete(id)); },
  };
}

let shared: Library | null = null;
const lazy = () => (shared ??= openLibrary());
/** The browser's library; the database opens on first use. */
export const library: Library = {
  list: () => lazy().list(), get: (id) => lazy().get(id), put: (c) => lazy().put(c), remove: (id) => lazy().remove(id),
};

export function toConceptFile(c: StoredConcept): string {
  return JSON.stringify({ format: 'evolab-concept', version: 1, ...c }, null, 2);
}

/** Structure only: the caller re-validates the module in a worker before saving. */
export function parseConceptFile(text: string): { ok: true; concept: StoredConcept } | { ok: false; errors: string[] } {
  let v: unknown;
  try { v = JSON.parse(text); } catch (e) { return { ok: false, errors: [`the file is not valid JSON: ${e instanceof Error ? e.message : String(e)}`] }; }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return { ok: false, errors: ['the file must contain a JSON object'] };
  const f = v as Record<string, unknown>, errors: string[] = [];
  if (f.format !== 'evolab-concept') errors.push('format must be "evolab-concept"; this is not an EvoLab concept file');
  if (f.version !== 1) errors.push(`version must be 1 (got ${JSON.stringify(f.version) ?? 'nothing'})`);
  if (typeof f.id !== 'string' || !/^gen-[a-z0-9-]+$/.test(f.id)) errors.push('id must start with "gen-" and contain only lower-case letters, digits and dashes');
  for (const k of ['name', 'prompt', 'source', 'model']) if (typeof f[k] !== 'string') errors.push(`${k} must be a string`);
  if (typeof f.meta !== 'object' || f.meta === null) errors.push('meta must be an object');
  if (typeof f.createdAt !== 'number' || !Number.isFinite(f.createdAt)) errors.push('createdAt must be a number');
  if (errors.length) return { ok: false, errors };
  const { id, name, prompt, meta, source, model, createdAt } = f as unknown as StoredConcept;
  return { ok: true, concept: { id, name, prompt, meta, source, model, createdAt } };
}
