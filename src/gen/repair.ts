import type { GeneratedMeta } from './meta';
import { parseResponse } from './parse';
import { SYSTEM_PROMPT, repairMessage, userMessage, type ChatMessage } from './prompt';
import type { ValidationReport } from './validator';

export const MAX_REPAIRS = 3;

export interface ProgressEvent { phase: 'prompting' | 'validating' | 'repairing' | 'done' | 'failed'; attempt: number; errors?: string[] }
export interface GenerateDeps {
  chat(messages: ChatMessage[]): Promise<string>;
  validate(source: string, meta: unknown): Promise<ValidationReport>;
  onProgress(ev: ProgressEvent): void;
}
export type GenerateResult = { ok: true; meta: GeneratedMeta; source: string; attempts: number } | { ok: false; errors: string[]; lastResponse: string };

/** Spec section 12.7: one prompt, then up to MAX_REPAIRS rounds that feed the validator's errors back. Transport errors end the run at once. */
export async function generateConcept(text: string, deps: GenerateDeps): Promise<GenerateResult> {
  const messages: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userMessage(text) }];
  let errors: string[] = [], last = '';
  for (let attempt = 0; attempt <= MAX_REPAIRS; attempt++) {
    deps.onProgress({ phase: attempt === 0 ? 'prompting' : 'repairing', attempt, errors: attempt ? errors : undefined });
    try { last = await deps.chat(messages); }
    catch (e) { errors = [e instanceof Error ? e.message : String(e)]; deps.onProgress({ phase: 'failed', attempt, errors }); return { ok: false, errors, lastResponse: last }; }
    deps.onProgress({ phase: 'validating', attempt });
    const parsed = parseResponse(last);
    if (parsed.ok) {
      const report = await deps.validate(parsed.source, parsed.meta);
      if (report.ok) { deps.onProgress({ phase: 'done', attempt }); return { ok: true, meta: parsed.meta as GeneratedMeta, source: parsed.source, attempts: attempt + 1 }; }
      errors = report.errors;
    } else errors = parsed.errors;
    messages.push({ role: 'assistant', content: last }, { role: 'user', content: repairMessage(errors) });
  }
  deps.onProgress({ phase: 'failed', attempt: MAX_REPAIRS, errors });
  return { ok: false, errors, lastResponse: last };
}
