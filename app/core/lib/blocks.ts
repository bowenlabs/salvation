// The example-template's form/columns block types (see CLAUDE.md's "Block
// types" section) aren't part of this union — Cadmea core ships no forms
// collection, so a "form" block has nothing to reference. Core only
// renders the block types that don't depend on example-template content.
export type Block =
  | { type: "richText"; content: TipTapJSONContent }
  | { type: "image"; url: string; alt: string; caption?: string }
  | {
      type: "hero";
      heading: string;
      subtext?: string;
      ctaLabel?: string;
      ctaHref?: string;
    }
  | { type: "divider" };

// Minimal structural shape this renderer depends on — not the full TipTap
// JSONContent type (avoids pulling @tiptap/core into the public site
// Worker just for a type import).
export interface TipTapJSONContent {
  type?: string;
  text?: string;
  content?: TipTapJSONContent[];
  marks?: { type: string }[];
}

// `pages.blocks` is stored as an untyped JSON column (cadmus/cms's array
// field type, see app/cadmea.config.ts) — this is the one place that
// narrows it back to `Block[]`.
export function parseBlocks(raw: unknown): Block[] {
  if (!Array.isArray(raw)) return [];
  return raw as Block[];
}

const MARK_TAGS: Record<string, string> = {
  bold: "strong",
  italic: "em",
  code: "code",
};

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function renderInline(node: TipTapJSONContent): string {
  if (node.type === "text") {
    const text = escapeHtml(node.text ?? "");
    return (node.marks ?? []).reduce((html, mark) => {
      const tag = MARK_TAGS[mark.type];
      return tag ? `<${tag}>${html}</${tag}>` : html;
    }, text);
  }
  return (node.content ?? []).map(renderInline).join("");
}

const BLOCK_TAGS: Record<string, string> = {
  paragraph: "p",
  heading: "h2",
  bulletList: "ul",
  orderedList: "ol",
  listItem: "li",
  blockquote: "blockquote",
};

function renderNode(node: TipTapJSONContent): string {
  if (node.type === "text") return renderInline(node);
  const tag = node.type ? BLOCK_TAGS[node.type] : undefined;
  const inner = (node.content ?? []).map(renderNode).join("");
  return tag ? `<${tag}>${inner}</${tag}>` : inner;
}

// Minimal TipTap-JSON → HTML walker — only the node/mark types listed
// above. No transform layer is stored (CLAUDE.md "Block types"); this is
// purely a read-side renderer, not a round-trippable editor format.
export function renderRichText(content: TipTapJSONContent): string {
  return (content.content ?? []).map(renderNode).join("");
}

// Mirrors BlockRenderer.astro's switch, as a plain string builder — the
// preview route (app/workers/site/src/api.ts, issue #28) is a Hono route,
// not an Astro page (it has to be, to stay reachable from tests/int —
// Astro's Vite plugin pulls in a virtual module the vitest-pool-workers
// runtime doesn't provide, same gotcha api.ts's own module comment
// documents), so it can't render the .astro component directly.
export function renderBlocksToHtml(
  blocks: Block[],
  imageService: {
    render: (image: { url: string; alt: string }) => { src: string };
  },
): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case "richText":
          return `<div>${renderRichText(block.content)}</div>`;
        case "image": {
          const { src } = imageService.render({
            url: block.url,
            alt: block.alt,
          });
          const caption = block.caption
            ? `<figcaption>${escapeHtml(block.caption)}</figcaption>`
            : "";
          return `<figure><img src="${escapeHtml(src)}" alt="${escapeHtml(block.alt)}" loading="lazy" decoding="async">${caption}</figure>`;
        }
        case "hero": {
          const subtext = block.subtext
            ? `<p>${escapeHtml(block.subtext)}</p>`
            : "";
          const cta =
            block.ctaLabel && block.ctaHref
              ? `<a href="${escapeHtml(block.ctaHref)}">${escapeHtml(block.ctaLabel)}</a>`
              : "";
          return `<section><h1>${escapeHtml(block.heading)}</h1>${subtext}${cta}</section>`;
        }
        case "divider":
          return "<hr>";
        default:
          return "";
      }
    })
    .join("");
}
