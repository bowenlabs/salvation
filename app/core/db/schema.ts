// Hand-written infra tables — not generated from cadmea.config.ts.
// `users` and `site_settings` aren't content collections: `users` is auth
// identity (accessed through the auth flow, not a generic content editor)
// and `site_settings` is a singleton config row, not a list of records.
// See DECISIONS.md 2026-06-21 "`site_settings` stays a hand-written core
// table". `sessions` and `magic_link_tokens` are intentionally absent —
// they live in KV (see CLAUDE.md "Authentication"), not D1.
import type { JsonValue } from "@thebes/cadmus/cms";
import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  role: text("role").notNull().default("owner"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const siteSettings = sqliteTable(
  "site_settings",
  {
    id: integer("id").primaryKey().default(1),

    // identity
    siteName: text("site_name"),
    tagline: text("tagline"),
    logoUrl: text("logo_url"),
    faviconUrl: text("favicon_url"),

    // appearance
    brandColor: text("brand_color"),
    secondaryColor: text("secondary_color"),
    tertiaryColor: text("tertiary_color"),
    fontPairing: text("font_pairing"),
    homepageLayout: text("homepage_layout"),
    darkMode: integer("dark_mode", { mode: "boolean" })
      .notNull()
      .default(false),
    theme: text("theme"),
    spacingPreset: text("spacing_preset"),
    typeTokens: text("type_tokens", { mode: "json" }).$type<JsonValue>(),

    // structural colors
    navBackground: text("nav_background"),
    navTextColor: text("nav_text_color"),
    footerBackground: text("footer_background"),
    footerTextColor: text("footer_text_color"),
    pageBackground: text("page_background"),
    surfaceBackground: text("surface_background"),

    // contact
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    contactAddress: text("contact_address"),
    socialLinks: text("social_links", { mode: "json" }).$type<JsonValue>(),

    // nav
    navLinks: text("nav_links", { mode: "json" }).$type<JsonValue>(),

    // seo
    metaDescription: text("meta_description"),
    defaultOgImageUrl: text("default_og_image_url"),
    disableIndexing: integer("disable_indexing", { mode: "boolean" })
      .notNull()
      .default(false),

    // domain — populated by citadel-tooling (Orchestrator) in Section 2
    primaryDomain: text("primary_domain"),
    domainProvider: text("domain_provider", {
      enum: ["cloudflare", "external", "unknown"],
    }),
    nameserverDelegated: integer("nameserver_delegated", { mode: "boolean" })
      .notNull()
      .default(false),
    domainRegisteredViaCitadel: integer("domain_registered_via_citadel", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
    cfAccountId: text("cf_account_id"),
    cfApiTokenScoped: integer("cf_api_token_scoped", { mode: "boolean" })
      .notNull()
      .default(false),

    // feature toggles
    features: text("features", { mode: "json" }).$type<JsonValue>(),
  },
  (table) => [check("site_settings_singleton", sql`${table.id} = 1`)],
);
