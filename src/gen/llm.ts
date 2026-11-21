import type { ChatMessage } from './prompt';
import { normalizeBaseUrl, type ConnectionMode, type LlmSettings } from './settings';

/** Shown when the browser could not complete a direct call: on a static host that is nearly always CORS or a server that is not running. */
export function directHint(baseUrl: string, origin: string): string {
  return `Cannot reach ${baseUrl} from this page. The server must be running and must allow requests from ${origin}: `
    + `for Ollama start it with "OLLAMA_ORIGINS=${origin} ollama serve"; in LM Studio enable CORS in the local server settings. `
    + 'If that is not possible, use "Paste a response": copy the prompt into any chat model and paste its answer back.';
}

/**
 * proxy: /api/llm/* on the dev/preview server, which forwards to the base URL named in a header.
 * direct: <baseUrl>/* from the browser. GETs carry no custom headers, so listing models needs no CORS preflight.
 */
async function request(s: LlmSettings, mode: ConnectionMode, fetchImpl: typeof fetch, path: string, body?: unknown): Promise<Response> {
  const base = normalizeBaseUrl(s.baseUrl);
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (mode === 'proxy') headers['x-evolab-base-url'] = base;
  if (s.apiKey) headers.authorization = `Bearer ${s.apiKey}`;
  const init: RequestInit = { method: body === undefined ? 'GET' : 'POST', headers };
  if (body !== undefined) init.body = JSON.stringify(body);
  let res: Response;
  try { res = await fetchImpl(mode === 'proxy' ? `/api/llm${path}` : base + path, init); }
  catch (e) {
    if (mode === 'direct') throw new Error(directHint(base, (globalThis as { location?: Location }).location?.origin ?? 'this page'));
    throw new Error(`cannot reach the EvoLab LLM proxy: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) throw new Error(`LLM request failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return res;
}

export function createChat(settings: LlmSettings, fetchImpl: typeof fetch = fetch, mode: ConnectionMode = 'proxy'): (messages: ChatMessage[]) => Promise<string> {
  // No temperature is sent: some hosted models (OpenAI's reasoning models) answer 400 to anything but their own default,
  // and the validator and repair loop absorb the variance of a model's default.
  return async (messages) => {
    const res = await request(settings, mode, fetchImpl, '/chat/completions', { model: settings.model, messages, stream: false });
    const data = await res.json().catch(() => null) as { choices?: { message?: { content?: unknown } }[] } | null;
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content) throw new Error('LLM returned no content');
    return content;
  };
}

export async function listModels(settings: LlmSettings, fetchImpl: typeof fetch = fetch, mode: ConnectionMode = 'proxy'): Promise<string[]> {
  const res = await request(settings, mode, fetchImpl, '/models');
  const data = await res.json().catch(() => null) as { data?: { id?: unknown }[] } | null;
  return (data?.data ?? []).map((m) => String(m.id));
}
