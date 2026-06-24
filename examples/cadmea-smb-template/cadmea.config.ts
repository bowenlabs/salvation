// The worked multi-provider checkout example referenced throughout
// Section 3's plugin packages (@thebes/cadmea-plugin-crm,
// @thebes/cadmea-plugin-redirects, @thebes/cadmea-plugin-ecommerce) —
// combines all three onto one CMS config, the same way a real operator's
// own cadmea.config.ts would. See app/cadmea.config.ts (the root Thebes
// app's own config) for the access-control pattern this borrows
// (`requireRole` from @thebes/cadmea-access-helpers).

import { requireRole } from "@thebes/cadmea-access-helpers";
import { createContactUpsertHook, crmPlugin } from "@thebes/cadmea-plugin-crm";
import { ecommercePlugin } from "@thebes/cadmea-plugin-ecommerce";
import { redirectsPlugin } from "@thebes/cadmea-plugin-redirects";
import type { CmsRegistry } from "@thebes/cadmus/cms";
import { defineCmsConfig } from "@thebes/cadmus/cms";

export type Role = "owner" | "editor" | "viewer";

export interface AccessContext {
  session: { role: Role } | null;
  internal?: boolean;
}

const requireEditorOrAbove = requireRole<Role, AccessContext>(
  "owner",
  "editor",
);

// Built once, passed to every createLocalApi call in server.ts, and
// populated *after* every one of those calls returns — see
// @thebes/cadmus/cms's CmsRegistry doc comment for why this two-phase
// build order is required. The inquiries collection's afterChange hook
// below closes over this same object reference; by the time a real
// request triggers that hook, `apis` is fully populated even though the
// hook itself was built before that happened.
export const registry: CmsRegistry = { tables: {}, configs: {}, apis: {} };

// The one collection this example defines itself (not injected by a
// plugin) — a public contact-sales / product-inquiry form. Demonstrates
// exactly the "any consumer-defined lead-capture collection, any field
// shape" generality createContactUpsertHook is designed for: nothing
// about this collection is CRM-specific except the hook wired onto it.
const inquiriesCollection = {
  slug: "inquiries",
  fields: {
    id: { type: "number" as const, autoIncrement: true },
    email: { type: "text" as const, required: true },
    message: { type: "text" as const, required: true },
    createdAt: {
      type: "date" as const,
      mode: "timestamp" as const,
      defaultValue: "now" as const,
    },
  },
  access: {
    read: requireEditorOrAbove,
    create: () => true, // public submission endpoint
  },
  hooks: {
    afterChange: [
      createContactUpsertHook({
        registry,
        emailField: "email",
        // Webhooks/hooks don't receive a real per-request session (see
        // createContactUpsertHook's own doc comment) — this trusted,
        // fixed context is what the contacts/activities collections'
        // own `access` config below actually checks.
        context: { session: null, internal: true } satisfies AccessContext,
      }),
    ],
  },
};

export const cmsConfig = defineCmsConfig({
  collections: [inquiriesCollection],
  plugins: [
    crmPlugin(),
    redirectsPlugin(),
    // includeSubscriptions stays false here — this example's Square
    // wiring (server.ts) doesn't implement the optional `subscriptions`
    // capability; flip both on together if a real store needs recurring
    // billing (Stripe's provider does implement it).
    ecommercePlugin(),
  ],
});
