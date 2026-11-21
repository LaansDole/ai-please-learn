import { read, write } from '../persist/storage';

/** proxy: through the dev/preview server's /api/llm/* routes. direct: the browser calls the endpoint itself (static hosting). */
export type ConnectionMode = 'proxy' | 'direct';
export interface LlmSettings { baseUrl: string; model: string; apiKey: string; mode: 'auto' | ConnectionMode }

export const PRESETS = { ollama: 'http://localhost:11434/v1', lmstudio: 'http://localhost:1234/v1' };
export const DEFAULT_LLM: LlmSettings = { baseUrl: PRESETS.ollama, model: 'qwen2.5-coder:14b', apiKey: '', mode: 'auto' };
const KEY = 'evolab.settings.v1';

export const normalizeBaseUrl = (u: string): string => u.trim().replace(/\/+$/, '');

export function isLocalUrl(u: string): boolean {
  try { return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(u).hostname); } catch { return false; }
}

export function validateSettings(s: unknown): LlmSettings | null {
  if (typeof s !== 'object' || s === null) return null;
  const { baseUrl, model, apiKey, mode = 'auto' } = s as Record<string, unknown>;
  if (typeof baseUrl !== 'string' || typeof model !== 'string' || typeof apiKey !== 'string') return null;
  if (mode !== 'auto' && mode !== 'proxy' && mode !== 'direct') return null;
  try { if (!['http:', 'https:'].includes(new URL(baseUrl.trim()).protocol)) return null; } catch { return null; }
  if (!model.trim()) return null;
  return { baseUrl: normalizeBaseUrl(baseUrl), model: model.trim(), apiKey, mode };
}

export function loadSettings(): LlmSettings { return validateSettings(read(KEY)) ?? { ...DEFAULT_LLM }; }
export function saveSettings(s: LlmSettings): void { write(KEY, s); }

/** Set by vite.config.ts for builds made with EVOLAB_STATIC=1 (GitHub Pages); absent under vitest and the llm-trial script. */
declare const __EVOLAB_STATIC__: boolean | undefined;
const STATIC_BUILD = typeof __EVOLAB_STATIC__ !== 'undefined' && __EVOLAB_STATIC__ === true;

/**
 * A static build has no proxy by construction, so it is direct without asking: the probe would only log a 404 in the console.
 * Otherwise (dev, preview, plain builds) the proxy is probed. The proxy answers a request without the x-evolab-base-url header with its own JSON 400. A static host (GitHub Pages)
 * answers 404, and a dev server without the plugin answers the SPA's index.html: both mean "no proxy, call the endpoint directly".
 */
export async function detectMode(fetchImpl: typeof fetch = fetch, staticBuild = STATIC_BUILD): Promise<ConnectionMode> {
  if (staticBuild) return 'direct';
  try {
    const r = await fetchImpl('/api/llm/models');
    return r.status === 400 && (r.headers.get('content-type') ?? '').includes('json') ? 'proxy' : 'direct';
  } catch { return 'direct'; }
}

let detected: Promise<ConnectionMode> | null = null;
/** The mode a request will use: the explicit setting, or what this page's server supports (probed once per page load). */
export function resolveMode(s: LlmSettings, fetchImpl?: typeof fetch): Promise<ConnectionMode> {
  if (s.mode !== 'auto') return Promise.resolve(s.mode);
  return fetchImpl ? detectMode(fetchImpl) : (detected ??= detectMode());
}
