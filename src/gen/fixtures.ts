import { EXAMPLE_META, EXAMPLE_MODULE_JS } from './exampleEnv';
import type { GeneratedMeta } from './meta';

/** Canned LLM outputs for unit and e2e tests: the example module with one defect each. */
export interface Fixture { meta: GeneratedMeta; source: string }

function patch(src: string, needle: string, replacement: string): string {
  if (!src.includes(needle)) throw new Error(`fixture needle not found: ${needle}`);
  return src.replace(needle, () => replacement);
}
const variant = (...edits: [string, string][]): Fixture => ({ meta: EXAMPLE_META, source: edits.reduce((s, [a, b]) => patch(s, a, b), EXAMPLE_MODULE_JS) });

const STEP_START = 'if (done) return;';

export const GOOD: Fixture = { meta: EXAMPLE_META, source: EXAMPLE_MODULE_JS };
export const THROWS = variant([STEP_START, `${STEP_START}\n      if (t === 10) throw new Error('boom');`]);
export const NAN_OBS = variant(['obs[0] = x;', 'obs[0] = x / 0 * 0;']);
export const WRONG_SIZE: Fixture = { meta: { ...EXAMPLE_META, observation: { labels: [...EXAMPLE_META.observation.labels, 'speed'] } }, source: EXAMPLE_MODULE_JS };
export const INFINITE_LOOP = variant([STEP_START, `while (true) {}\n      ${STEP_START}`]);
export const FETCHES = variant([STEP_START, `${STEP_START}\n      fetch('http://example.com');`]);
export const NON_DETERMINISTIC = variant(['function createEnv(sdk) {', 'var shared = 0;\nfunction createEnv(sdk) {'], ['x = 0;', 'x = shared++ * 0.001;']);
export const NO_REWARD = variant(['terms[0] += Math.max(0, 1 - d) / STEPS;', ''], ['terms[1] += 1 / STEPS;', 'd = 0;'], ['terms[2] += 1 / STEPS;', 'd = 0;']);
export const INSTANT_DONE = variant(['t = 0; done = false;', 't = 0; done = true;']);

/** The two fenced blocks an LLM is asked to return. */
export function toResponse(f: Fixture): string {
  return `\`\`\`json\n${JSON.stringify(f.meta, null, 2)}\n\`\`\`\n\n\`\`\`js\n${f.source}\`\`\`\n`;
}
