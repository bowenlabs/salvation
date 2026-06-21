import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { generateSchemaSource } from "@bowenlabs/cadmus/cms";
import { cmsConfig } from "../citadel.config.js";

const outputPath = fileURLToPath(
  new URL("../core/db/schema.generated.ts", import.meta.url),
);

writeFileSync(outputPath, generateSchemaSource(cmsConfig));

// Run the generated source through Biome so its formatting matches the
// rest of the repo — the emitter optimizes for correct, simple string
// concatenation, not for replicating Biome's line-wrapping rules.
execFileSync("npx", ["biome", "format", "--write", outputPath], {
  stdio: "inherit",
});

console.log(`Generated ${outputPath}`);
