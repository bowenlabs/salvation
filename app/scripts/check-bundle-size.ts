import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Cloudflare enforces a compressed-upload size cap per plan — Workers
// Free: 3 MB, Workers Paid: 10 MB (decimal MB, matching Cloudflare's own
// published numbers). `wrangler deploy --dry-run` reports the gzip size
// wrangler will actually upload without touching the account, so this
// parses that line and fails CI before a real deploy would. See
// CLAUDE.md's "five questions" #3 ("free-forever promise") — Cadmea
// specifically promises to fit the Free plan, so the 3 MB check matters
// beyond just CI hygiene.
const [workerDir, limitMbArg] = process.argv.slice(2);
if (!workerDir || !limitMbArg) {
  console.error(
    "Usage: tsx app/scripts/check-bundle-size.ts <workerDir> <limitMB>",
  );
  process.exit(1);
}

const limitBytes = Number(limitMbArg) * 1_000_000;
const outdir = mkdtempSync(join(tmpdir(), "wrangler-dry-run-"));

const output = execFileSync(
  "npx",
  ["wrangler", "deploy", "--dry-run", "--outdir", outdir],
  { cwd: workerDir, encoding: "utf-8" },
);

const match = output.match(/Total Upload:.*\/\s*gzip:\s*([\d.]+)\s*KiB/);
if (!match) {
  console.error(
    `Couldn't find a "Total Upload: ... / gzip: ... KiB" line in wrangler's output for ${workerDir}:\n\n${output}`,
  );
  process.exit(1);
}

const gzipBytes = Number(match[1]) * 1024;
const gzipMb = (gzipBytes / 1_000_000).toFixed(2);
const limitMb = Number(limitMbArg).toFixed(0);

if (gzipBytes > limitBytes) {
  console.error(
    `${workerDir}: gzip upload size ${gzipMb} MB exceeds the ${limitMb} MB limit.`,
  );
  process.exit(1);
}

console.log(
  `${workerDir}: gzip upload size ${gzipMb} MB is within the ${limitMb} MB limit.`,
);
