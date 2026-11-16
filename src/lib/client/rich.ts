const BLOCK = /^\s*<(p|h[1-6]|ul|ol|blockquote|pre|div|hr)\b/i;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Descriptions saved before rich text existed are plain text; show them with their line breaks. */
export const toHtml = (v: string) => (BLOCK.test(v) ? v : `<p>${esc(v).replace(/\n/g, "<br>")}</p>`);

/** Plain-text preview of a (possibly rich) description, for cards and subtitles. */
export function toPlain(v?: string | null): string {
  if (!v) return "";
  if (!BLOCK.test(v)) return v;
  const doc = new DOMParser().parseFromString(v.replace(/<\/(p|li|h[1-6]|blockquote)>/gi, "$& "), "text/html");
  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
}
