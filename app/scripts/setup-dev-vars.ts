// Contributor-facing local dev setup — NOT the operator/deploy-time
// provisioning problem (creating real D1/KV/R2 resources, configuring a
// custom domain, etc.). That's out of scope here on purpose: this repo
// isn't the fork target operators deploy from (see README.md's "bigger
// picture" section — that's the separate bowenlabs-template repo). This
// script only removes the friction in getting *this* monorepo's reference
// app (app/) running locally against the emulated D1/KV/R2 `wrangler dev`
// already provides via --persist-to — no real Cloudflare account, deploy,
// or resource creation needed for that.
//
// Idempotent and non-destructive: only ever writes a .dev.vars file that
// doesn't exist yet. Never touches or merges into an existing one, so a
// contributor's own customizations are never overwritten.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SITE_PORT = 3000;
const CADMEA_PORT = 3001;

function devVarsPath(workerDir: string): string {
  return fileURLToPath(
    new URL(`../workers/${workerDir}/.dev.vars`, import.meta.url),
  );
}

function readSessionSecret(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  return readFileSync(path, "utf-8")
    .match(/^SESSION_SECRET=(.*)$/m)?.[1]
    ?.trim();
}

function main(): void {
  const sitePath = devVarsPath("site");
  const cadmeaPath = devVarsPath("cadmea");
  const siteExists = existsSync(sitePath);
  const cadmeaExists = existsSync(cadmeaPath);

  if (siteExists && cadmeaExists) {
    console.log(
      "Both .dev.vars files already exist — nothing to do. Delete them first if you want fresh ones.",
    );
    return;
  }

  // Both Workers verify the same HMAC-signed session, so they must share
  // one secret. Reuse whichever file already has one rather than minting
  // a second, mismatched secret.
  const sessionSecret =
    readSessionSecret(sitePath) ??
    readSessionSecret(cadmeaPath) ??
    randomBytes(32).toString("hex");

  const adminEmail = "dev@localhost";
  const mediaUrl = `http://localhost:${CADMEA_PORT}/media`;

  if (!siteExists) {
    writeFileSync(
      sitePath,
      [
        `SESSION_SECRET=${sessionSecret}`,
        `ADMIN_EMAIL=${adminEmail}`,
        `MEDIA_URL=${mediaUrl}`,
        `CADMEA_URL=http://localhost:${CADMEA_PORT}`,
        "",
      ].join("\n"),
    );
    console.log(`Wrote ${sitePath}`);
  } else {
    console.log(`Skipped ${sitePath} — already exists`);
  }

  if (!cadmeaExists) {
    writeFileSync(
      cadmeaPath,
      [
        `SESSION_SECRET=${sessionSecret}`,
        `ADMIN_EMAIL=${adminEmail}`,
        `MEDIA_URL=${mediaUrl}`,
        `SERVER_URL=http://localhost:${SITE_PORT}`,
        "",
      ].join("\n"),
    );
    console.log(`Wrote ${cadmeaPath}`);
  } else {
    console.log(`Skipped ${cadmeaPath} — already exists`);
  }

  console.log("\nNext: pnpm db:migrate && pnpm seed && pnpm dev");
}

main();
