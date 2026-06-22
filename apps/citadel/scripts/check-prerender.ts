import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// TanStack Start can prerender a route at build time. `loader`/`beforeLoad`
// callbacks that call a server function (auth checks, D1 reads, etc.) need
// request-time bindings (`cloudflare:workers` env) that don't exist at
// build time — so any route using one in `loader`/`beforeLoad` must opt
// out with `export const prerender = false`. See CLAUDE.md and
// SECTION_1_PLAN.md milestone 1.18.
const routesDir = fileURLToPath(
  new URL("../workers/cms/src/routes", import.meta.url),
);

function findRouteFiles(dir: string, base = ""): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const relPath = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      return findRouteFiles(`${dir}/${entry.name}`, relPath);
    }
    return /\.tsx?$/.test(entry.name) ? [relPath] : [];
  });
}

const files = findRouteFiles(routesDir);

const offenders: string[] = [];

for (const file of files) {
  const path = `${routesDir}/${file}`;
  const source = readFileSync(path, "utf-8");

  const usesLoaderOrBeforeLoad = /\b(loader|beforeLoad)\s*:/.test(source);
  if (!usesLoaderOrBeforeLoad) continue;

  const callsServerFunction =
    /from\s+["'].*\/server-functions\//.test(source) ||
    /from\s+["'].*\/middleware["']/.test(source) ||
    /createServerFn/.test(source);
  if (!callsServerFunction) continue;

  const hasPrerenderFalse = /export\s+const\s+prerender\s*=\s*false/.test(
    source,
  );
  if (!hasPrerenderFalse) {
    offenders.push(file);
  }
}

if (offenders.length > 0) {
  console.error(
    "The following routes call a server function from `loader`/`beforeLoad` " +
      "but don't export `prerender = false`:\n",
  );
  for (const file of offenders) {
    console.error(`  - workers/cms/src/routes/${file}`);
  }
  console.error("\nAdd `export const prerender = false;` to each file above.");
  process.exit(1);
}

console.log("check-prerender: all server-function routes opt out correctly");
