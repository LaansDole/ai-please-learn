import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderMathDoc, slug } from './mathDoc';

describe('mathDoc', () => {
  it('slugs headings without their section number', () => {
    expect(slug('4. NEAT')).toBe('neat');
    expect(slug('11.3 No observation or reward normalisation')).toBe('no-observation-or-reward-normalisation');
    expect(slug('What the charts measure')).toBe('what-the-charts-measure');
  });
  it('renders headings with anchors, sections and cards', () => {
    const html = renderMathDoc('# Title\n\nLede.\n\n## 1. One\n\nText.\n\n### 1.1 Card\n\nBody.\n\n## 2. Two\n');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<section><h2 id="one">1. One <a class="anchor" href="#one" aria-label="Link to this section">#</a></h2>');
    expect(html).toContain('<article><h3 id="card">');
    expect(html).toMatch(/<p>Body\.<\/p><\/article><\/section><section><h2 id="two">/);
  });
  it('renders inline markup and escapes HTML', () => {
    const html = renderMathDoc('A **bold** *it* `a<b` and <script> [x](#one) [f](../src/neat/species.ts) [e](https://example.org/a).');
    expect(html).toContain('<strong>bold</strong> <em>it</em> <code>a&lt;b</code> and &lt;script&gt;');
    expect(html).toContain('<a href="#one">x</a>');
    expect(html).toContain('<a href="https://github.com/LaansDole/ai-please-learn/blob/main/src/neat/species.ts" target="_blank" rel="noopener noreferrer">f</a>');
    expect(html).toContain('<a href="https://example.org/a" target="_blank" rel="noopener noreferrer">e</a>');
  });
  it('renders lists and tables', () => {
    const html = renderMathDoc('- one\n  more\n- two\n\n1. first\n2. second\n\n| A | B |\n|---|---:|\n| x | 1 |\n');
    expect(html).toContain('<ul><li>one more</li><li>two</li></ul>');
    expect(html).toContain('<ol><li>first</li><li>second</li></ol>');
    expect(html).toContain('<thead><tr><th>A</th><th class="n">B</th></tr></thead><tbody><tr><td>x</td><td class="n">1</td></tr></tbody>');
  });
  it('renders inline and display math with KaTeX and throws on bad TeX', () => {
    const html = renderMathDoc('Inline $a_b * c_d$ here.\n\n$$\nx = \\frac{1}{2} \\tag{1.1}\n$$\n');
    expect(html.match(/class="katex"/g)).toHaveLength(2);
    expect(html).toContain('<div class="math-eq"><span class="katex-display">');
    expect(html).not.toContain('<em>');                       // the * inside math is not emphasis
    expect(() => renderMathDoc('$\\frac{1$')).toThrow();
  });
});

describe('docs/math.md', () => {
  const md = readFileSync('docs/math.md', 'utf8'), html = renderMathDoc(md);
  it('renders every equation', () => {
    expect(html.match(/class="katex"/g)!.length).toBeGreaterThanOrEqual(40);
    expect(html).not.toContain('katex-error');
  });
  it('has the twelve numbered sections, each with a unique id', () => {
    const ids = [...html.matchAll(/<h[23] id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...html.matchAll(/<h2 id="[^"]+">(\d+)\./g)].map((m) => Number(m[1]))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const m of md.matchAll(/\]\(#([^)]+)\)/g)) expect(ids, m[1]).toContain(m[1]);
  });
  it('links only to files that exist', () => {
    for (const m of md.matchAll(/\]\((?!https?:|#)([^)#]+)/g)) expect(existsSync(`docs/${m[1]}`), m[1]).toBe(true);
  });
  it('follows the copy rules: ASCII hyphen only and no semicolon in prose', () => {
    expect(md).not.toMatch(/[\u2012-\u2015]/);
    const prose = md.replace(/\$\$[\s\S]*?\$\$/g, '').replace(/\$[^$\n]+\$/g, '').replace(/`[^`\n]+`/g, '').replace(/\]\([^)]+\)/g, ']');
    expect(prose.split('\n').filter((l) => l.includes(';'))).toEqual([]);
  });
});
