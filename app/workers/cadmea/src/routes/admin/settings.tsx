import { createFileRoute, useBlocker } from "@tanstack/solid-router";
import { createMemo, createSignal, Show } from "solid-js";
import ContactTab, {
  type SocialLink,
} from "../../components/settings/ContactTab";
import ExportTab from "../../components/settings/ExportTab";
import GeneralTab from "../../components/settings/GeneralTab";
import SeoTab from "../../components/settings/SeoTab";
import { getCadmeaSiteSettings } from "../../server-functions/site-settings";
import { saveSettings } from "../../server-functions/site-settings-write";

export const prerender = false;

export const Route = createFileRoute("/admin/settings")({
  loader: () => getCadmeaSiteSettings(),
  component: SettingsPage,
});

type Tab = "general" | "contact" | "seo" | "export";
const TABS: { id: Tab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "contact", label: "Contact" },
  { id: "seo", label: "SEO" },
  { id: "export", label: "Export" },
];

// The fields this page owns — a subset of site_settings' columns (design
// fields live on /admin/design, see saveDesignSettings).
interface SettingsValues {
  siteName: string | null;
  tagline: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  homepageLayout: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactAddress: string | null;
  socialLinks: SocialLink[] | null;
  metaDescription: string | null;
  defaultOgImageUrl: string | null;
  disableIndexing: boolean;
}

function toValues(
  settings: Awaited<ReturnType<typeof getCadmeaSiteSettings>>,
): SettingsValues {
  return {
    siteName: settings?.siteName ?? null,
    tagline: settings?.tagline ?? null,
    logoUrl: settings?.logoUrl ?? null,
    faviconUrl: settings?.faviconUrl ?? null,
    homepageLayout: settings?.homepageLayout ?? null,
    contactEmail: settings?.contactEmail ?? null,
    contactPhone: settings?.contactPhone ?? null,
    contactAddress: settings?.contactAddress ?? null,
    socialLinks: (settings?.socialLinks as SocialLink[] | null) ?? null,
    metaDescription: settings?.metaDescription ?? null,
    defaultOgImageUrl: settings?.defaultOgImageUrl ?? null,
    disableIndexing: settings?.disableIndexing ?? false,
  };
}

function SettingsPage() {
  const settings = Route.useLoaderData();
  const baseline = createMemo(() => toValues(settings()));
  const [values, setValues] = createSignal<SettingsValues>(baseline());
  const [tab, setTab] = createSignal<Tab>("general");
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const [saved, setSaved] = createSignal(false);

  const isDirty = createMemo(
    () => JSON.stringify(values()) !== JSON.stringify(baseline()),
  );

  useBlocker({
    shouldBlockFn: () => isDirty(),
    enableBeforeUnload: () => isDirty(),
  });

  function setField(
    key: keyof SettingsValues,
    value: SettingsValues[keyof SettingsValues],
  ) {
    setSaved(false);
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setError(undefined);
    try {
      // biome-ignore lint/suspicious/noExplicitAny: validator only constrains the runtime shape, see pages.ts's createPage for the same pattern
      await saveSettings({ data: values() as any });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div class="flex flex-col gap-4">
      <div role="tablist" class="tabs tabs-bordered">
        {TABS.map((t) => (
          <button
            type="button"
            role="tab"
            class="tab"
            classList={{ "tab-active": tab() === t.id }}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div class="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
        <Show when={tab() === "general"}>
          <GeneralTab
            values={values()}
            onChange={(key, value) => setField(key, value)}
          />
        </Show>
        <Show when={tab() === "contact"}>
          <ContactTab
            values={values()}
            onChange={(key, value) => setField(key, value)}
            onSocialLinksChange={(links) => setField("socialLinks", links)}
          />
        </Show>
        <Show when={tab() === "seo"}>
          <SeoTab
            values={values()}
            onChange={(key, value) => setField(key, value)}
            onDisableIndexingChange={(value) =>
              setField("disableIndexing", value)
            }
          />
        </Show>
        <Show when={tab() === "export"}>
          <ExportTab />
        </Show>
      </div>

      <Show when={error()}>
        <p class="text-sm text-error">{error()}</p>
      </Show>

      <div class="flex items-center gap-3">
        <button
          type="button"
          class="btn btn-primary self-start"
          disabled={saving() || !isDirty()}
          onClick={handleSave}
        >
          {saving() ? "Saving…" : "Save"}
        </button>
        <Show when={saved() && !isDirty()}>
          <span class="text-sm text-[var(--sea-ink-soft)]">Saved.</span>
        </Show>
      </div>
    </div>
  );
}
