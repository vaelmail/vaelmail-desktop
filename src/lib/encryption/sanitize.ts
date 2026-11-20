const TAGS = new Set([
  "a",
  "abbr",
  "b",
  "blockquote",
  "br",
  "caption",
  "code",
  "col",
  "colgroup",
  "dd",
  "del",
  "details",
  "div",
  "dl",
  "dt",
  "em",
  "figcaption",
  "figure",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "ins",
  "kbd",
  "li",
  "mark",
  "ol",
  "p",
  "pre",
  "q",
  "s",
  "small",
  "span",
  "strong",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
]);
const DROP = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "frame",
  "frameset",
  "noscript",
  "template",
  "svg",
  "math",
  "link",
  "meta",
  "base",
  "form",
  "input",
  "button",
  "select",
  "textarea",
  "video",
  "audio",
  "source",
  "track",
  "canvas",
  "head",
  "title",
]);
const ATTRIBUTES = new Set([
  "href",
  "title",
  "colspan",
  "rowspan",
  "align",
  "valign",
  "dir",
  "lang",
  "start",
  "reversed",
  "type",
  "cite",
  "datetime",
  "open",
  "scope",
]);

function safeHref(value: string): string | null {
  const trimmed = value.trim();
  if (/^mailto:/i.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

export function sanitizeDecryptedHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const clean = (node: Element) => {
    for (const child of Array.from(node.children)) {
      const tag = child.tagName.toLowerCase();
      if (DROP.has(tag)) {
        child.remove();
        continue;
      }
      if (tag === "img") {
        const alt = child.getAttribute("alt");
        child.replaceWith(doc.createTextNode(alt ? "[image: " + alt + "]" : ""));
        continue;
      }
      clean(child);
      if (!TAGS.has(tag)) {
        child.replaceWith(...Array.from(child.childNodes));
        continue;
      }
      for (const attribute of Array.from(child.attributes)) {
        const name = attribute.name.toLowerCase();
        if (!ATTRIBUTES.has(name)) child.removeAttribute(attribute.name);
      }
      if (tag === "a") {
        const href = safeHref(child.getAttribute("href") || "");
        if (href) {
          child.setAttribute("href", href);
          child.setAttribute("target", "_blank");
          child.setAttribute("rel", "noopener noreferrer");
        } else child.removeAttribute("href");
      } else child.removeAttribute("href");
    }
  };
  clean(doc.body);
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_COMMENT);
  const comments: Node[] = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  comments.forEach((c) => c.parentNode?.removeChild(c));
  return doc.body.innerHTML;
}
