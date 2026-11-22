/**
 * Runs the concept-from-text pipeline against a real OpenAI-compatible model, headlessly:
 * SYSTEM_PROMPT + concept -> createChat (direct mode) -> parseResponse -> validateModule (meta, scan, sandbox compile,
 * conformance) -> repair loop. Everything is the app's own code; this file only measures and reports.
 *
 *   OPENAI_API_KEY=... npm run llm-trial -- --model gpt-6-luna [--concepts "a|b"] [--out run.json] [--note "what changed"]
 *
 * The key is read from the environment only and is redacted from everything this script prints or writes.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { toConceptFile } from '../src/gen/library';
import { createChat } from '../src/gen/llm';
import { slugId } from '../src/gen/meta';
import { MAX_REPAIRS, generateConcept } from '../src/gen/repair';
import { validateModule } from '../src/gen/validator';

const DEFAULT_CONCEPTS = 'learn to juggle a ball|balance a pole on a cart|dodge falling rocks|land a lunar lander gently|catch apples in a basket';
const DIR = 'docs/llm-trial', RESULTS = `${DIR}/RESULTS.md`;

const { values: args } = parseArgs({
  args: process.argv.slice(process.argv.findIndex((a) => a.startsWith('--'))),
  options: {
    model: { type: 'string', default: 'gpt-6-luna' },
    'base-url': { type: 'string', default: 'https://api.openai.com/v1' },
    concepts: { type: 'string', default: DEFAULT_CONCEPTS },
    out: { type: 'string' },
    note: { type: 'string', default: '' },            // one line for RESULTS.md, e.g. what changed in the prompt since the last run
    'max-calls': { type: 'string', default: '20' },   // hard cap on chat calls for the whole run
    'price-in': { type: 'string' },                   // USD per 1M prompt tokens; the cost is estimated only when both prices are given
    'price-out': { type: 'string' },
  },
});

const apiKey = process.env.OPENAI_API_KEY ?? '';
if (!apiKey) { console.error('OPENAI_API_KEY is not set'); process.exit(1); }
const redact = (s: string) => s.replaceAll(apiKey, '[key]').replace(/sk-[A-Za-z0-9_*-]{8,}/g, '[key]');
const model = args.model, maxCalls = Number(args['max-calls']);
const settings = { provider: 'openai' as const, baseUrl: args['base-url'], model, apiKey, mode: 'direct' as const };
const kebab = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

interface Row {
  concept: string; ok: boolean; repairs: number; calls: number; errorsPerAttempt: string[][];
  promptTokens: number; completionTokens: number; latencyMs: number; id?: string; name?: string; file?: string;
}

let calls = 0, sawUsage = false;
const rows: Row[] = [];
for (const concept of args.concepts.split('|').map((c) => c.trim()).filter(Boolean)) {
  const row: Row = { concept, ok: false, repairs: 0, calls: 0, errorsPerAttempt: [], promptTokens: 0, completionTokens: 0, latencyMs: 0 };
  /** The app's client discards everything but the text, so usage and latency are read off a clone of each response. */
  const measured: typeof fetch = async (input, init) => {
    if (calls >= maxCalls) throw new Error(`call budget exhausted (--max-calls ${maxCalls})`);
    const t0 = performance.now();
    const res = await fetch(input, init);
    const body = await res.clone().json().catch(() => null) as { usage?: { prompt_tokens?: number; completion_tokens?: number } } | null;
    if (!res.ok) return res;                    // a rejected request (a 4xx/5xx from the server) is not a completion
    calls++; row.calls++;
    row.latencyMs += performance.now() - t0;
    if (body?.usage) { sawUsage = true; row.promptTokens += body.usage.prompt_tokens ?? 0; row.completionTokens += body.usage.completion_tokens ?? 0; }
    return res;
  };
  const r = await generateConcept(concept, {
    chat: createChat(settings, measured, 'direct'),
    // ponytail: validated in-process, without the app's worker watchdog; an infinite loop in a generated module hangs this script (Ctrl-C).
    validate: async (source, meta) => validateModule(source, meta),
    onProgress: (e) => {
      if ((e.phase === 'repairing' || e.phase === 'failed') && e.errors) row.errorsPerAttempt.push(e.errors.map(redact));
      console.error(`[${concept}] ${e.phase}${e.phase === 'repairing' ? ` ${e.attempt}/${MAX_REPAIRS}` : ''}`);
    },
  });
  row.ok = r.ok;
  row.repairs = Math.max(0, row.calls - 1);
  if (r.ok) {
    row.id = slugId(r.meta.name, Math.random); row.name = r.meta.name; row.file = `${DIR}/${kebab(concept)}.evolab-concept.json`;
    mkdirSync(DIR, { recursive: true });
    writeFileSync(row.file, `${toConceptFile({ id: row.id, name: r.meta.name, prompt: concept, meta: r.meta, source: r.source, model, createdAt: Date.now() })}\n`);
  }
  rows.push(row);
}

const sum = (f: (r: Row) => number) => rows.reduce((a, r) => a + f(r), 0);
const passed = rows.filter((r) => r.ok).length;
const tokIn = sum((r) => r.promptTokens), tokOut = sum((r) => r.completionTokens);
const avgLatency = calls ? sum((r) => r.latencyMs) / calls / 1000 : 0;
const cost = sawUsage && args['price-in'] && args['price-out'] ? (tokIn * Number(args['price-in']) + tokOut * Number(args['price-out'])) / 1e6 : null;
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\s+/g, ' ');
const table = [
  '| Concept | Result | Repairs | Validator errors per failed attempt | Tokens in / out | Latency | Generated |',
  '|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${cell(r.concept)} | ${r.ok ? 'pass' : 'FAIL'} | ${r.repairs} | ${r.errorsPerAttempt.map((e, i) => `${i + 1}: ${cell(e.join('; '))}`).join('<br>') || '-'} `
    + `| ${sawUsage ? `${r.promptTokens} / ${r.completionTokens}` : 'n/a'} | ${(r.latencyMs / 1000).toFixed(1)} s | ${r.ok ? `[${cell(r.name!)}](${r.file!.slice(DIR.length + 1)}) (\`${r.id}\`)` : '-'} |`),
].join('\n');
const date = new Date().toISOString().slice(0, 10);
const summary = [
  `- Model: \`${model}\` at ${settings.baseUrl}, ${date}`,
  ...(args.note ? [`- Change since the previous run: ${args.note}`] : []),
  `- Pass rate: **${passed}/${rows.length}**`,
  `- Repairs used: ${sum((r) => r.repairs)} (${calls} chat calls)`,
  `- Average latency per call: ${avgLatency.toFixed(1)} s`,
  `- Tokens: ${sawUsage ? `${tokIn} in, ${tokOut} out` : 'the API returned no usage'}`,
  ...(cost === null ? [] : [`- Estimated cost: $${cost.toFixed(4)} (at $${args['price-in']} in / $${args['price-out']} out per 1M tokens)`]),
].join('\n');

console.log(`\n${summary}\n\n${table}`);

// RESULTS.md is an append-only history: every run stays, failing ones included.
const header = '# Concept from text: trials against a real LLM\n\n'
  + 'Each run below is `npm run llm-trial`: the app\'s own prompt, client, parser, static scan, sandbox, validator and repair loop '
  + `(at most ${MAX_REPAIRS} repairs), run headlessly in Node. A concept passes only when the validator accepts the module. `
  + 'Passing modules are saved next to this file as `.evolab-concept.json` and can be imported on the Create page ("Import concept file").\n';
const previous = existsSync(RESULTS) ? readFileSync(RESULTS, 'utf8') : header;
mkdirSync(DIR, { recursive: true });
writeFileSync(RESULTS, `${previous}\n## Run ${(previous.match(/^## Run /gm)?.length ?? 0) + 1}\n\n${summary}\n\n${table}\n`);
if (args.out) {
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, `${JSON.stringify({ model, date, passed, total: rows.length, calls, tokIn, tokOut, avgLatencySec: avgLatency, cost, rows }, null, 2)}\n`);
}
