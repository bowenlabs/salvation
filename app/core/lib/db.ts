import { drizzle } from "drizzle-orm/d1";
import * as core from "../db/schema";
import * as generated from "../db/schema.generated";

const schema = { ...core, ...generated };

export function db(d1: D1Database) {
  return drizzle(d1, { schema });
}
