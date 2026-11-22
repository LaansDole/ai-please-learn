import { read, write } from '../persist/storage';

/** proxy: through the dev/preview server's /api/llm/* routes. direct: the browser calls the endpoint itself (static hosting). */
export type ConnectionMode = 'proxy' | 'direct';
export type ProviderId = 'openai' | 'lmstudio' | 'ollama';
export interface LlmSettings { provider: ProviderId; baseUrl: string; model: string; apiKey: string; mode: 'auto' | ConnectionMode }

/** An empty preset model means "ask the server": the first chat model that /models lists (LM Studio serves whatever is loaded). */
export const PROVIDERS: Record<ProviderId, { label: string; baseUrl: string; model: string; needsKey: boolean }> = {
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-6-luna', needsKey: true },
  lmstudio: { label: 'LM Studio', baseUrl: 'http://localhost:1234/v1', model: '', needsKey: false },
  ollama: { label: 'Ollama', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5-coder:14b', needsKey: false },
};
export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];
export const presetFor = (provider: ProviderId): LlmSettings =>
  ({ provider, baseUrl: PROVIDERS[provider].baseUrl, model: PROVIDERS[provider].model, apiKey: '', mode: 'auto' });
export const DEFAULT_LLM: LlmSettings = presetFor('openai');
const KEY = 'evolab.settings.v1';

export const normalizeBaseUrl = (u: string): string => u.trim().replace(/\/+$/, '');

export function isLocalUrl(u: string): boolean {
  try { return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(u).hostname); } catch { return false; }
}

/** Settings saved before providers existed: the preset with that base URL, else the closest one (local -> a local server, remote -> OpenAI-compatible). */
export function detectProvider(baseUrl: string): ProviderId {
  const u = normalizeBaseUrl(baseUrl);
  const exact = PROVIDER_IDS.find((id) => PROVIDERS[id].baseUrl === u);
  if (exact) return exact;
  if (!isLocalUrl(u)) return 'openai';
  return new URL(u).port === '1234' ? 'lmstudio' : 'ollama';
}

/**
 * True when a request would be sent without the key its endpoint demands. Only api.openai.com is known to demand one: any
 * other base URL under the OpenAI preset (a LAN Ollama, host.docker.internal, an OpenAI-compatible gateway) is a custom
 * server, and whether it wants a key is for it to say.
 */
export function missingKey(s: LlmSettings): boolean {
  if (!PROVIDERS[s.provider].needsKey || s.apiKey.trim()) return false;
  try { return new URL(s.baseUrl).hostname === 'api.openai.com'; } catch { return false; }
}

/** "gpt-6-luna via OpenAI", or "m at <url>" once the base URL is no longer the preset's. */
export function describeEndpoint(s: LlmSettings): string {
  const p = PROVIDERS[s.provider];
  return `${s.model || 'the first loaded model'} ${normalizeBaseUrl(s.baseUrl) === p.baseUrl ? `via ${p.label}` : `at ${s.baseUrl}`}`;
}

export function validateSettings(s: unknown): LlmSettings | null {
  if (typeof s !== 'object' || s === null) return null;
  const { provider, baseUrl, model, apiKey, mode = 'auto' } = s as Record<string, unknown>;
  if (typeof baseUrl !== 'string' || typeof model !== 'string' || typeof apiKey !== 'string') return null;
  if (mode !== 'auto' && mode !== 'proxy' && mode !== 'direct') return null;
  try { if (!['http:', 'https:'].includes(new URL(baseUrl.trim()).protocol)) return null; } catch { return null; }
  const id = PROVIDER_IDS.find((p) => p === provider) ?? detectProvider(baseUrl);
  if (!model.trim() && PROVIDERS[id].model) return null;
  return { provider: id, baseUrl: normalizeBaseUrl(baseUrl), model: model.trim(), apiKey, mode };
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
