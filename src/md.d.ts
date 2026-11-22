/** A markdown file rendered to HTML at build time (vite.config.ts `mathDoc`). */
declare module '*.md?html' {
  const html: string;
  export default html;
}
