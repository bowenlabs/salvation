// First-deploy seed script. Idempotent — safe to run twice.
// Runs under Node (tsx) as dev tooling, not inside the Worker isolate, so
// it shells out to `wrangler d1 execute` rather than holding a D1Database
// binding directly (only available inside a Worker).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const wranglerConfig = fileURLToPath(
  new URL("./workers/site/wrangler.jsonc", import.meta.url),
);

function readDevVar(workerDir: string, key: string): string | undefined {
  const devVarsPath = fileURLToPath(
    new URL(`./workers/${workerDir}/.dev.vars`, import.meta.url),
  );
  try {
    const devVars = readFileSync(devVarsPath, "utf-8");
    return devVars.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim();
  } catch {
    return undefined;
  }
}

function readAdminEmail(): string {
  const adminEmail = readDevVar("cadmea", "ADMIN_EMAIL");
  if (!adminEmail) {
    throw new Error(
      "ADMIN_EMAIL not set in workers/cadmea/.dev.vars — required to seed the owner user",
    );
  }
  return adminEmail;
}

// Best-effort — a bucket not yet bound to a public custom domain is a
// common first-deploy state, not a seed failure. Warn, don't throw.
async function warnIfR2Inaccessible(): Promise<void> {
  const mediaUrl = readDevVar("site", "MEDIA_URL");
  if (!mediaUrl) {
    console.warn(
      "[seed] MEDIA_URL not set — skipping R2 accessibility check. " +
        "Uploaded images won't render until it's configured.",
    );
    return;
  }
  try {
    const response = await fetch(mediaUrl);
    if (!response.ok && response.status !== 404) {
      console.warn(
        `[seed] MEDIA_URL (${mediaUrl}) responded with ${response.status}. ` +
          "Confirm the R2 bucket's public access / custom domain is configured.",
      );
    }
  } catch (cause) {
    console.warn(
      `[seed] Could not reach MEDIA_URL (${mediaUrl}): ${cause instanceof Error ? cause.message : String(cause)}. ` +
        "Confirm the R2 bucket's public access / custom domain is configured.",
    );
  }
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function execSql(sql: string): void {
  execFileSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      "thebes-db",
      "--local",
      "--config",
      wranglerConfig,
      "--persist-to",
      fileURLToPath(new URL("../.wrangler/state", import.meta.url)),
      "--command",
      sql,
    ],
    { stdio: "inherit" },
  );
}

interface StarterPage {
  slug: string;
  title: string;
  blocks: unknown[];
}

// Block shapes match app/core/lib/blocks.ts's Block union. No "image" block
// — seeding can't reference a real R2 object. No "form" block — core ships
// no forms collection (see CLAUDE.md "Block types").
const STARTER_PAGES: StarterPage[] = [
  {
    slug: "home",
    title: "Home",
    blocks: [
      {
        type: "hero",
        heading: "Welcome",
        subtext: "This is your new site, built with Cadmea.",
        ctaLabel: "Learn more",
        ctaHref: "/about",
      },
    ],
  },
  {
    slug: "about",
    title: "About",
    blocks: [
      {
        type: "richText",
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Tell your story here." }],
            },
          ],
        },
      },
    ],
  },
  {
    slug: "contact",
    title: "Contact",
    blocks: [
      {
        type: "richText",
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Get in touch." }],
            },
          ],
        },
      },
    ],
  },
];

async function main(): Promise<void> {
  const adminEmail = readAdminEmail();

  execSql("INSERT OR IGNORE INTO site_settings (id) VALUES (1);");
  execSql(
    `INSERT OR IGNORE INTO users (email, role) VALUES (${sqlString(adminEmail)}, 'owner');`,
  );

  for (const page of STARTER_PAGES) {
    execSql(
      `INSERT OR IGNORE INTO pages (title, slug, status, blocks) VALUES (${sqlString(page.title)}, ${sqlString(page.slug)}, 'published', ${sqlString(JSON.stringify(page.blocks))});`,
    );
  }

  await warnIfR2Inaccessible();

  console.log(
    `Seeded site_settings (id=1), owner user (${adminEmail}), and ${STARTER_PAGES.length} starter pages.`,
  );
}

main();
