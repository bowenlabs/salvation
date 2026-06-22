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

function readAdminEmail(): string {
  const devVarsPath = fileURLToPath(
    new URL("./workers/cadmea/.dev.vars", import.meta.url),
  );
  const devVars = readFileSync(devVarsPath, "utf-8");
  const match = devVars.match(/^ADMIN_EMAIL=(.*)$/m);
  if (!match?.[1]) {
    throw new Error(
      `ADMIN_EMAIL not set in ${devVarsPath} — required to seed the owner user`,
    );
  }
  return match[1].trim();
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

const adminEmail = readAdminEmail();

execSql("INSERT OR IGNORE INTO site_settings (id) VALUES (1);");
execSql(
  `INSERT OR IGNORE INTO users (email, role) VALUES ('${adminEmail.replace(/'/g, "''")}', 'owner');`,
);

console.log(`Seeded site_settings (id=1) and owner user (${adminEmail}).`);
