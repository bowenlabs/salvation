import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const pages = sqliteTable("pages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  status: text("status", { enum: ["draft", "published"] })
    .notNull()
    .default("draft"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
});

// Phase 0 only needs a minimal schema for POC validation.
// The full site_settings table (added in Phase 2) includes domain fields
// that Section 2's Orchestrator populates:
//   primaryDomain, domainProvider, nameserverDelegated,
//   domainRegisteredViaCitadel, cfAccountId, cfApiTokenScoped
// These are nullable/false by default in Section 1 — never treat them
// as errors if unset. See DECISIONS.md for the full domain onboarding strategy.
