import { env } from "cloudflare:workers";
import { getSiteSettings } from "@core/lib/get-site-settings";
import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async () => {
  const settings = await getSiteSettings(env.DB);

  // /admin/, /api/, /coming-soon are disallowed unconditionally — the
  // disableIndexing toggle only controls the rest of the site (issue #6
  // 5.9 "always disallow").
  const lines = [
    "User-agent: *",
    "Disallow: /admin/",
    "Disallow: /api/",
    "Disallow: /coming-soon",
  ];

  if (settings?.disableIndexing) {
    lines.push("Disallow: /");
  } else {
    const origin = env.SERVER_URL;
    if (origin) lines.push("", `Sitemap: ${origin}/sitemap.xml`);
  }

  return new Response(`${lines.join("\n")}\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
