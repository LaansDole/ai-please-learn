/** Check 1 of spec section 12.6: exactly one json and one js fenced block (in either order); the JSON parses. */
export function parseResponse(text: string): { ok: true; meta: unknown; source: string } | { ok: false; errors: string[] } {
  const json: string[] = [], js: string[] = [];
  for (const m of text.matchAll(/```([a-zA-Z]*)[^\n]*\n([\s\S]*?)```/g)) {
    const lang = m[1]!.toLowerCase();
    if (lang === 'json') json.push(m[2]!);
    else if (lang === 'js' || lang === 'javascript') js.push(m[2]!);
  }
  const errors: string[] = [];
  if (json.length !== 1) errors.push(`the response must contain exactly one \`\`\`json block with the metadata (found ${json.length})`);
  if (js.length !== 1) errors.push(`the response must contain exactly one \`\`\`js block with the module (found ${js.length})`);
  if (errors.length) return { ok: false, errors };
  try { return { ok: true, meta: JSON.parse(json[0]!), source: js[0]! }; }
  catch (e) { return { ok: false, errors: [`the \`\`\`json block is not valid JSON: ${e instanceof Error ? e.message : String(e)}`] }; }
}
