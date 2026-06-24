// Copyright (c) 2026 BowenLabs. All rights reserved.
// MIT licensed. See LICENSE in the repo root.

import type { CmsConfig, CmsRegistry } from "@thebes/cadmus/cms";
import { describe, expect, it } from "vitest";
import { createContactUpsertHook, crmPlugin } from "./index.js";

const pagesCollection = {
  slug: "pages",
  fields: { title: { type: "text" as const, required: true } },
};

describe("crmPlugin", () => {
  it("adds contacts and activities collections with the expected fields", () => {
    const config: CmsConfig = { collections: [pagesCollection] };
    const resolved = crmPlugin()(config);

    expect(resolved.collections.map((c) => c.slug).sort()).toEqual(
      ["activities", "contacts", "pages"].sort(),
    );
    const contacts = resolved.collections.find((c) => c.slug === "contacts");
    expect(Object.keys(contacts?.fields ?? {})).toEqual([
      "id",
      "email",
      "firstName",
      "lastName",
      "lifecycleStage",
      "tags",
      "lastActivityAt",
      "createdAt",
    ]);
    const activities = resolved.collections.find(
      (c) => c.slug === "activities",
    );
    expect(Object.keys(activities?.fields ?? {})).toEqual([
      "id",
      "contact",
      "type",
      "metadata",
      "createdAt",
    ]);
  });

  it("points the activities collection's contact field at the configured contactsSlug", () => {
    const config: CmsConfig = { collections: [] };
    const resolved = crmPlugin({ contactsSlug: "people" })(config);
    const activities = resolved.collections.find(
      (c) => c.slug === "activities",
    );
    expect(activities?.fields.contact).toMatchObject({
      type: "relationship",
      relationTo: "people",
    });
  });

  it("supports custom slugs for both collections", () => {
    const config: CmsConfig = { collections: [] };
    const resolved = crmPlugin({
      contactsSlug: "people",
      activitiesSlug: "events",
    })(config);
    expect(resolved.collections.map((c) => c.slug).sort()).toEqual(
      ["events", "people"].sort(),
    );
  });

  it("is a no-op for a collection slug that already exists", () => {
    const existingContacts = {
      slug: "contacts",
      fields: { email: { type: "text" as const } },
    };
    const config: CmsConfig = { collections: [existingContacts] };
    const resolved = crmPlugin()(config);
    expect(resolved.collections.find((c) => c.slug === "contacts")).toBe(
      existingContacts,
    );
    // activities still gets added since it wasn't already present
    expect(resolved.collections.some((c) => c.slug === "activities")).toBe(
      true,
    );
  });

  it("returns a new collections array (doesn't mutate the input config)", () => {
    const config: CmsConfig = { collections: [pagesCollection] };
    crmPlugin()(config);
    expect(config.collections).toHaveLength(1);
  });
});

// A hand-rolled fake LocalApi over an in-memory array, mirroring the
// pattern used in @thebes/cadmus/hono's own test suites — decouples these
// hook-logic tests from createLocalApi and D1 entirely.
function createFakeApi<TRow extends { id: number }>() {
  const rows: TRow[] = [];
  let nextId = 1;
  return {
    rows,
    async find(_context: unknown) {
      return rows;
    },
    async create(_context: unknown, input: Omit<TRow, "id">) {
      const row = { ...input, id: nextId++ } as TRow;
      rows.push(row);
      return row;
    },
    async update(_context: unknown, id: number, input: Partial<TRow>) {
      const row = rows.find((r) => r.id === id);
      if (!row) throw new Error(`no row with id ${id}`);
      Object.assign(row, input);
      return row;
    },
  };
}

interface Contact {
  id: number;
  email: string;
  lifecycleStage?: string;
  lastActivityAt?: Date;
}

interface Activity {
  id: number;
  contact: number;
  type: string;
}

describe("createContactUpsertHook", () => {
  function buildRegistry() {
    const contactsApi = createFakeApi<Contact>();
    const activitiesApi = createFakeApi<Activity>();
    const registry: CmsRegistry = {
      tables: {},
      configs: {},
      // biome-ignore lint/suspicious/noExplicitAny: fake LocalApis satisfy the call shape the hook actually uses (find/create/update); CmsRegistry's own apis map is typed loosely for the same cross-TContext reason
      apis: { contacts: contactsApi as any, activities: activitiesApi as any },
    };
    return { registry, contactsApi, activitiesApi };
  }

  it("creates a new contact and an activity on the first submission with a given email", async () => {
    const { registry, contactsApi, activitiesApi } = buildRegistry();
    const hook = createContactUpsertHook({
      registry,
      emailField: "email",
      context: { internal: true },
    });

    await hook({
      doc: { email: "lead@example.com", message: "hi" },
      operation: "create",
    });

    expect(contactsApi.rows).toHaveLength(1);
    expect(contactsApi.rows[0]).toMatchObject({
      email: "lead@example.com",
      lifecycleStage: "lead",
    });
    expect(activitiesApi.rows).toHaveLength(1);
    expect(activitiesApi.rows[0]).toMatchObject({
      contact: contactsApi.rows[0]?.id,
      type: "form_submission",
    });
  });

  it("upserts onto the existing contact (no duplicate) on a second submission with the same email", async () => {
    const { registry, contactsApi, activitiesApi } = buildRegistry();
    const hook = createContactUpsertHook({
      registry,
      emailField: "email",
      context: { internal: true },
    });

    await hook({ doc: { email: "lead@example.com" }, operation: "create" });
    await hook({ doc: { email: "lead@example.com" }, operation: "create" });

    expect(contactsApi.rows).toHaveLength(1);
    expect(activitiesApi.rows).toHaveLength(2);
  });

  it("does nothing for an update (only create triggers the upsert)", async () => {
    const { registry, contactsApi, activitiesApi } = buildRegistry();
    const hook = createContactUpsertHook({
      registry,
      emailField: "email",
      context: { internal: true },
    });

    await hook({ doc: { email: "lead@example.com" }, operation: "update" });

    expect(contactsApi.rows).toHaveLength(0);
    expect(activitiesApi.rows).toHaveLength(0);
  });

  it("does nothing when the configured email field is missing or empty", async () => {
    const { registry, contactsApi } = buildRegistry();
    const hook = createContactUpsertHook({
      registry,
      emailField: "email",
      context: { internal: true },
    });

    await hook({ doc: { message: "no email here" }, operation: "create" });
    await hook({ doc: { email: "" }, operation: "create" });

    expect(contactsApi.rows).toHaveLength(0);
  });

  it("reads from a different email field name when configured", async () => {
    const { registry, contactsApi } = buildRegistry();
    const hook = createContactUpsertHook({
      registry,
      emailField: "contactEmail",
      context: { internal: true },
    });

    await hook({
      doc: { contactEmail: "custom@example.com" },
      operation: "create",
    });

    expect(contactsApi.rows[0]?.email).toBe("custom@example.com");
  });

  it("uses custom contacts/activities slugs and activityType when configured", async () => {
    const peopleApi = createFakeApi<Contact>();
    const eventsApi = createFakeApi<Activity>();
    const registry: CmsRegistry = {
      tables: {},
      configs: {},
      // biome-ignore lint/suspicious/noExplicitAny: see buildRegistry's own note
      apis: { people: peopleApi as any, events: eventsApi as any },
    };
    const hook = createContactUpsertHook({
      registry,
      emailField: "email",
      contactsSlug: "people",
      activitiesSlug: "events",
      activityType: "newsletter_signup",
      context: { internal: true },
    });

    await hook({ doc: { email: "lead@example.com" }, operation: "create" });

    expect(peopleApi.rows).toHaveLength(1);
    expect(eventsApi.rows[0]?.type).toBe("newsletter_signup");
  });
});
