// Copyright (c) 2026 BowenLabs. All rights reserved.
// MIT licensed. See LICENSE in the repo root.
//
// @thebes/cadmea-plugin-crm
//
// A Cadmea plugin (the `plugin(config) => config` axis). Adds `contacts`
// and `activities` collections — generalized from a pattern three sibling
// Next.js + Payload projects each hand-rolled independently (a Contacts
// collection + an Activities audit log + an upsert-by-email hook on a
// lead-capture collection). Unlike `seoPlugin` (which injects fields into
// caller-named collections), this plugin doesn't auto-attach its upsert
// hook to anything — it ships the collections and the hook factory as
// separate pieces, and the *consumer's* config wires the hook onto
// whichever lead-capture collection they define (any name, any shape, as
// long as it has an email-bearing field).
//
// cadmus is a types-only peer — nothing here imports it at runtime.

import type {
  CadmeaPlugin,
  CmsRegistry,
  CollectionConfig,
  CollectionHooks,
} from "@thebes/cadmus/cms";
import { getRegisteredApi } from "@thebes/cadmus/cms";

export interface CrmPluginOptions {
  /** Slug for the injected contacts collection. Default: "contacts". */
  contactsSlug?: string;
  /** Slug for the injected activities collection. Default: "activities". */
  activitiesSlug?: string;
}

const DEFAULT_CONTACTS_SLUG = "contacts";
const DEFAULT_ACTIVITIES_SLUG = "activities";

function buildContactsCollection(slug: string): CollectionConfig {
  return {
    slug,
    fields: {
      id: { type: "number", autoIncrement: true },
      email: { type: "text", required: true, unique: true },
      firstName: { type: "text" },
      lastName: { type: "text" },
      // A fixed enum here would bake in one project's lifecycle vocabulary
      // into a generic library — kept open instead of the
      // lead/prospect/active/loyal/churned-style enums the reference repos
      // used, since those are domain-specific, not CRM-generic. Consumers
      // that want a constrained vocabulary can layer their own `select`
      // field via a second plugin or by editing the resolved config.
      lifecycleStage: { type: "text", defaultValue: "lead" },
      // No native multi-select/string-array field type exists — an `array`
      // of single-`value` items is the generic round-trips-through-admin-UI
      // shape, same choice cadmea-plugin-redirects and this package's own
      // `activities.metadata` make elsewhere for "no purpose-built field
      // type for this shape yet."
      tags: { type: "array", fields: { value: { type: "text" } } },
      lastActivityAt: { type: "date", mode: "timestamp" },
      createdAt: { type: "date", mode: "timestamp", defaultValue: "now" },
    },
  };
}

function buildActivitiesCollection(
  slug: string,
  contactsSlug: string,
): CollectionConfig {
  return {
    slug,
    fields: {
      id: { type: "number", autoIncrement: true },
      contact: { type: "relationship", relationTo: contactsSlug },
      // Free-form, not a `select` — activity types vary per consumer
      // (form_submission, donation, note, email_sent, ...) and a plugin
      // shouldn't hardcode that vocabulary any more than `lifecycleStage`
      // above should.
      type: { type: "text", required: true },
      // The `json` field type (Section 3) — genuinely unstructured
      // per-activity data, the case that field type exists for.
      metadata: { type: "json" },
      createdAt: { type: "date", mode: "timestamp", defaultValue: "now" },
    },
  };
}

/**
 * Returns a Cadmea plugin that adds `contacts`/`activities` collections (or
 * renamed ones via `contactsSlug`/`activitiesSlug`) to the config — a no-op
 * for either collection if a collection with that slug already exists, so
 * re-applying the plugin doesn't collide with `defineCmsConfig`'s
 * duplicate-slug validation.
 */
export function crmPlugin(options: CrmPluginOptions = {}): CadmeaPlugin {
  const contactsSlug = options.contactsSlug ?? DEFAULT_CONTACTS_SLUG;
  const activitiesSlug = options.activitiesSlug ?? DEFAULT_ACTIVITIES_SLUG;
  return (config) => {
    const collections = [...config.collections];
    if (!collections.some((collection) => collection.slug === contactsSlug)) {
      collections.push(buildContactsCollection(contactsSlug));
    }
    if (!collections.some((collection) => collection.slug === activitiesSlug)) {
      collections.push(buildActivitiesCollection(activitiesSlug, contactsSlug));
    }
    return { ...config, collections };
  };
}

export interface ContactUpsertHookOptions<TContext> {
  /**
   * The same `CmsRegistry` object passed to every `createLocalApi` call —
   * see `@thebes/cadmus/cms`'s `CmsRegistry` doc comment for the late-
   * binding build order this depends on (the registry's `apis` map must
   * be populated, with `contactsSlug`/`activitiesSlug` present, by the time
   * this hook actually runs — not necessarily by the time it's *built*).
   */
  registry: CmsRegistry;
  /** Which field on the lead-capture collection's document holds the email. */
  emailField: string;
  contactsSlug?: string;
  activitiesSlug?: string;
  /** Stored as the created activity's `type`. Default: "form_submission". */
  activityType?: string;
  /**
   * Hooks (`CollectionHooks.afterChange`) don't receive the original
   * request's access-control context — only `{ doc, operation }` — so
   * there is no caller-supplied context to forward into the
   * contacts/activities writes this hook makes. This is the trusted,
   * fixed context value used for those writes instead: the same role an
   * `internal: true` flag plays for the Service Binding RPC case in
   * `app/cadmea.config.ts` — a context value real per-request sessions
   * never carry, used here because this is a system-level sync, not a
   * user-impersonated write. The contacts/activities collections' own
   * `access` config is what actually decides whether this value is
   * accepted; pass whatever context shape satisfies that.
   */
  context: TContext;
}

interface ContactRow {
  id: number;
  email: string;
}

/**
 * Returns an `afterChange` hook for hire on any consumer-defined lead-
 * capture collection (not hardcoded to a specific collection name or
 * field shape) — on every *new* document with a non-empty `emailField`
 * value, upserts a matching `contacts` row by email and logs an
 * `activities` row against it. Runs only on `operation === "create"` (an
 * edit to an already-synced lead-capture row doesn't re-trigger the
 * upsert), matching the create-only `afterChange` pattern the reference
 * repos used for their own contact-message hooks.
 *
 * Looks up the existing contact via a plain `find()` + in-memory filter by
 * email rather than a `where`-filtered query, the same "don't build for
 * scale you don't have" tradeoff `cadmea-plugin-redirects`'s
 * `lookupRedirect` makes — fine for a single-operator contact list,
 * revisit with an indexed lookup (passing the contacts table through so a
 * real `where: eq(table.email, email)` can be built) if that assumption
 * stops holding.
 *
 * ```ts
 * const inquiriesCollection = {
 *   slug: "inquiries",
 *   fields: { email: { type: "text", required: true }, message: { type: "text" } },
 *   hooks: {
 *     afterChange: [
 *       createContactUpsertHook({ registry, emailField: "email", context: { internal: true } }),
 *     ],
 *   },
 * };
 * defineCmsConfig({ collections: [inquiriesCollection], plugins: [crmPlugin()] });
 * ```
 */
export function createContactUpsertHook<TContext>(
  options: ContactUpsertHookOptions<TContext>,
): NonNullable<CollectionHooks["afterChange"]>[number] {
  const contactsSlug = options.contactsSlug ?? DEFAULT_CONTACTS_SLUG;
  const activitiesSlug = options.activitiesSlug ?? DEFAULT_ACTIVITIES_SLUG;
  const activityType = options.activityType ?? "form_submission";

  return async ({ doc, operation }) => {
    if (operation !== "create") return;
    const email = doc[options.emailField];
    if (typeof email !== "string" || email.trim() === "") return;

    const contactsApi = getRegisteredApi<TContext>(
      options.registry,
      contactsSlug,
    );
    const existingContacts = (await contactsApi.find(
      options.context,
    )) as ContactRow[];
    const existing = existingContacts.find(
      (contact) => contact.email === email,
    );

    let contactId: number;
    if (existing) {
      await contactsApi.update(options.context, existing.id, {
        lastActivityAt: new Date(),
      });
      contactId = existing.id;
    } else {
      const created = (await contactsApi.create(options.context, {
        email,
        lifecycleStage: "lead",
        lastActivityAt: new Date(),
      })) as ContactRow;
      contactId = created.id;
    }

    const activitiesApi = getRegisteredApi<TContext>(
      options.registry,
      activitiesSlug,
    );
    await activitiesApi.create(options.context, {
      contact: contactId,
      type: activityType,
    });
  };
}
