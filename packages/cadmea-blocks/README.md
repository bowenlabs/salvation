# @thebes/cadmea-blocks

Theme-neutral Astro block components for Cadmea sites — the six generic CMS
primitives: **rich text, image, hero, divider, banner, content**.

Markup is theme-neutral: it references CSS classes/variables your site's theme
provides (e.g. `.prose`, `--accent`), so blocks adopt each site's look without
forking. Each component takes only its own props, so it stays decoupled from
your site's block union — wire them into `createBlockRegistry` and override any
type with your own component.

## Install

```sh
pnpm add @thebes/cadmea-blocks
```

Peer deps: `astro` and `@thebes/cadmus` (for `renderRichText`, `parseImageRef`,
and the `ImageService` / TipTap types).

## Use

```astro
---
import RichTextBlock from "@thebes/cadmea-blocks/RichTextBlock.astro";
import ImageBlock from "@thebes/cadmea-blocks/ImageBlock.astro";
---
<RichTextBlock content={block.content} />
<ImageBlock url={block.url} alt={block.alt} caption={block.caption} imageService={imageService} />
```

## Components

| Import | Props |
|---|---|
| `RichTextBlock.astro` | `content` |
| `ImageBlock.astro` | `url`, `alt`, `caption?`, `imageService` |
| `HeroBlock.astro` | `heading`, `subtext?`, `ctaLabel?`, `ctaHref?` |
| `DividerBlock.astro` | — |
| `BannerBlock.astro` | `style?`, `content` |
| `ContentBlock.astro` | `layout?`, `columns?` |

Prop types are exported from `@thebes/cadmea-blocks/types`.
