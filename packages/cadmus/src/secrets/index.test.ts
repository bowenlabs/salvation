import { describe, expect, it, vi } from "vitest";
import { getSecret, requireSecret, type SecretsStoreBinding } from "./index.js";

function binding(value: string): SecretsStoreBinding {
  return { get: vi.fn(async () => value) };
}

describe("getSecret", () => {
  it("returns a plain string as-is (local dev)", async () => {
    expect(await getSecret("sk_test_123")).toBe("sk_test_123");
  });

  it("awaits a Secrets Store binding's .get()", async () => {
    const store = binding("sk_live_456");
    expect(await getSecret(store)).toBe("sk_live_456");
    expect(store.get).toHaveBeenCalledOnce();
  });

  it("returns undefined for an absent secret", async () => {
    expect(await getSecret(undefined)).toBeUndefined();
    expect(await getSecret(null)).toBeUndefined();
  });

  it("propagates a binding error (missing store secret)", async () => {
    const store: SecretsStoreBinding = {
      get: vi.fn(async () => {
        throw new Error("secret not found");
      }),
    };
    await expect(getSecret(store)).rejects.toThrow("secret not found");
  });
});

describe("requireSecret", () => {
  it("returns the value when present (string or binding)", async () => {
    expect(await requireSecret("v", "A")).toBe("v");
    expect(await requireSecret(binding("w"), "B")).toBe("w");
  });

  it("throws with the name when missing", async () => {
    await expect(requireSecret(undefined, "SESSION_SECRET")).rejects.toThrow(
      "Missing required secret: SESSION_SECRET",
    );
  });

  it("throws on an empty string", async () => {
    await expect(requireSecret("", "STRIPE_SECRET_KEY")).rejects.toThrow(
      "Missing required secret: STRIPE_SECRET_KEY",
    );
  });
});
