import katex from 'katex';

const REPO = 'https://github.com/LaansDole/ai-please-learn/blob/main/';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// A TeX error fails the build: the page never shows a red `katex-error` span.
const tex = (src: string, displayMode: boolean) => katex.renderToString(src, { displayMode, throwOnError: true, strict: 'error' });

/** Heading id: the text without its section number ("4. NEAT" -> "neat"). */
export function slug(text: string): string {
  return text.replace(/^[\d.]+\s+/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Relative links are written for GitHub, from docs/: on the page they open the same file on `main`. */
function link(text: string, href: string): string {
  if (href.startsWith('#')) return `<a href="${esc(href)}">${inline(text)}</a>`;
  const url = /^https?:/.test(href) ? href : new URL(href, `${REPO}docs/`).href;
  return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${inline(text)}</a>`;
}

/** `code`, $math$, [text](href), **bold**, *italic*. Everything else is escaped text. */
function inline(s: string): string {
  let out = '', last = 0;
  for (const m of s.matchAll(/`([^`]+)`|\$([^$]+)\$|\[((?:[^\]`]|`[^`]*`)+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*/g)) {
    out += esc(s.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[1] !== undefined) out += `<code>${esc(m[1])}</code>`;
    else if (m[2] !== undefined) out += tex(m[2], false);
    else if (m[3] !== undefined) out += link(m[3], m[4]!);
    else if (m[5] !== undefined) out += `<strong>${inline(m[5])}</strong>`;
    else out += `<em>${inline(m[6]!)}</em>`;
  }
  return out + esc(s.slice(last));
}

const cells = (row: string) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

/**
 * docs/math.md to the HTML of the Math page. The input is that one trusted file, so this covers what it uses and no more:
 * h1 to h3, paragraphs, flat lists (continuation lines indented), pipe tables (`---:` right-aligns), display math between
 * `$$` lines, and the inline forms above. An h2 opens a <section>, an h3 an <article> inside it.
 * ponytail: no nested lists, block quotes or fenced code. Swap in markdown-it if the report ever needs them.
 */
export function renderMathDoc(md: string): string {
  const lines = md.split('\n');
  let out = '', i = 0, inSection = false, inArticle = false;
  const close = (section: boolean) => {
    if (inArticle) { out += '</article>'; inArticle = false; }
    if (section && inSection) { out += '</section>'; inSection = false; }
  };
  const isBlockStart = (l: string) => /^(#{1,3} |\$\$|\||- |\d+\. )/.test(l);
  while (i < lines.length) {
    const line = lines[i]!;
    const heading = /^(#{1,3}) (.+)$/.exec(line);
    if (!line.trim()) i++;
    else if (heading) {
      const level = heading[1]!.length, text = heading[2]!, id = slug(text);
      if (level === 1) out += `<h1>${inline(text)}</h1>`;
      else {
        close(level === 2);
        if (level === 2) { out += '<section>'; inSection = true; } else { out += '<article>'; inArticle = true; }
        out += `<h${level} id="${id}">${inline(text)} <a class="anchor" href="#${id}" aria-label="Link to this section">#</a></h${level}>`;
      }
      i++;
    } else if (line.startsWith('$$')) {
      let src = line.slice(2);
      while (!src.trimEnd().endsWith('$$')) src += `\n${lines[++i] ?? '$$'}`;
      out += `<div class="math-eq">${tex(src.trimEnd().slice(0, -2), true)}</div>`;
      i++;
    } else if (line.startsWith('|')) {
      const head = cells(line), right = cells(lines[i + 1]!).map((c) => c.endsWith(':'));
      const row = (tag: string, cs: string[]) => `<tr>${cs.map((c, k) => `<${tag}${right[k] ? ' class="n"' : ''}>${inline(c)}</${tag}>`).join('')}</tr>`;
      out += `<div class="table-wrap"><table><thead>${row('th', head)}</thead><tbody>`;
      for (i += 2; i < lines.length && lines[i]!.startsWith('|'); i++) out += row('td', cells(lines[i]!));
      out += '</tbody></table></div>';
    } else if (/^(- |\d+\. )/.test(line)) {
      const tag = line.startsWith('- ') ? 'ul' : 'ol', items: string[] = [];
      for (; i < lines.length && /^(- |\d+\. |  \S)/.test(lines[i]!); i++) {
        const l = lines[i]!;
        if (l.startsWith('  ')) items[items.length - 1] += ` ${l.trim()}`;
        else items.push(l.replace(/^(- |\d+\. )/, ''));
      }
      out += `<${tag}>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</${tag}>`;
    } else {
      let text = line;
      for (i++; i < lines.length && lines[i]!.trim() && !isBlockStart(lines[i]!); i++) text += ` ${lines[i]!.trim()}`;
      out += `<p>${inline(text)}</p>`;
    }
  }
  close(true);
  return out;
}
