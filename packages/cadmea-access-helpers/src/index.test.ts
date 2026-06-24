// Copyright (c) 2026 BowenLabs. All rights reserved.
// MIT licensed. See LICENSE in the repo root.

import { describe, expect, it } from "vitest";
import {
  authenticatedOnly,
  checkRole,
  isAdmin,
  publicAccess,
  type RoleAccessContext,
  requireRole,
} from "./index.js";

type Role = "owner" | "editor" | "viewer";

describe("checkRole", () => {
  it("returns true when role is in the allowed list", () => {
    expect(checkRole(["owner", "editor"], "editor")).toBe(true);
  });

  it("returns false when role is not in the allowed list", () => {
    expect(checkRole(["owner"], "viewer")).toBe(false);
  });

  it("returns false for a null or undefined role", () => {
    expect(checkRole(["owner"], null)).toBe(false);
    expect(checkRole(["owner"], undefined)).toBe(false);
  });
});

describe("requireRole", () => {
  const requireEditorOrAbove = requireRole<Role>("owner", "editor");

  it("allows a session whose role is in the allowed list", async () => {
    const context: RoleAccessContext<Role> = { session: { role: "editor" } };
    expect(await requireEditorOrAbove(context)).toBe(true);
  });

  it("rejects a session whose role is not in the allowed list", async () => {
    const context: RoleAccessContext<Role> = { session: { role: "viewer" } };
    expect(await requireEditorOrAbove(context)).toBe(false);
  });

  it("rejects an unauthenticated (null session) context", async () => {
    const context: RoleAccessContext<Role> = { session: null };
    expect(await requireEditorOrAbove(context)).toBe(false);
  });

  it("always allows an internal caller regardless of role", async () => {
    const context: RoleAccessContext<Role> = { session: null, internal: true };
    expect(await requireEditorOrAbove(context)).toBe(true);
  });
});

describe("isAdmin", () => {
  it("is sugar over requireRole for a single role", async () => {
    const admin = isAdmin<Role>("owner");
    expect(await admin({ session: { role: "owner" } })).toBe(true);
    expect(await admin({ session: { role: "editor" } })).toBe(false);
  });
});

describe("publicAccess", () => {
  it("always allows, regardless of context", async () => {
    expect(await publicAccess(undefined)).toBe(true);
    expect(await publicAccess({ anything: "goes" })).toBe(true);
  });
});

describe("authenticatedOnly", () => {
  const requireAuth = authenticatedOnly();

  it("allows any non-null session regardless of role", async () => {
    expect(await requireAuth({ session: { role: "viewer" } })).toBe(true);
  });

  it("rejects a null session", async () => {
    expect(await requireAuth({ session: null })).toBe(false);
  });

  it("allows an internal caller with a null session", async () => {
    expect(await requireAuth({ session: null, internal: true })).toBe(true);
  });
});
