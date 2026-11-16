import sanitizeHtml from "sanitize-html";

/** Rich text (TipTap output) is stored as sanitised HTML. Only these tags/attributes ever reach the database or an email. */
const RICH = {
  allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "s", "h1", "h2", "h3", "ul", "ol", "li", "blockquote", "code", "pre", "a", "hr"],
  allowedAttributes: { a: ["href", "target", "rel"] },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: { a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer nofollow", target: "_blank" }) },
} satisfies sanitizeHtml.IOptions;

const decode = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");

/** Plain-text rendering (for the text/plain part of an email, previews, and emptiness checks). */
export function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<\/(p|h[1-6]|blockquote|pre)>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<hr\s*\/?>/gi, "\n---\n");
  return decode(sanitizeHtml(withBreaks, { allowedTags: [], allowedAttributes: {} })).replace(/\n{3,}/g, "\n\n").trim();
}

/** Sanitises rich text. Returns "" when the content is visually empty. */
export function sanitizeRich(html: string): string {
  const clean = sanitizeHtml(html, RICH).trim();
  return htmlToText(clean) ? clean : "";
}
