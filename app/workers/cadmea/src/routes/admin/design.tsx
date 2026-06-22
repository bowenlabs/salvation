import type { TypeTokens } from "@core/lib/design-system/type-defaults";
import { createFileRoute, useBlocker } from "@tanstack/solid-router";
import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  Show,
} from "solid-js";
import { getPublicSiteUrl } from "../../../app/middleware";
import ColorsTab from "../../components/design/ColorsTab";
import SettingsPreviewPane from "../../components/design/SettingsPreviewPane";
import SpacingTab from "../../components/design/SpacingTab";
import ThemeTab from "../../components/design/ThemeTab";
import TypographyTab from "../../components/design/TypographyTab";
import { useDesignPreviewOverrides } from "../../components/design-preview-context";
import { getCadmeaSiteSettings } from "../../server-functions/site-settings";
import { saveDesignSettings } from "../../server-functions/site-settings-write";

export const prerender = false;

export const Route = createFileRoute("/admin/design")({
  loader: async () => {
    const [settings, publicSiteUrl] = await Promise.all([
      getCadmeaSiteSettings(),
      getPublicSiteUrl(),
    ]);
    return { settings, publicSiteUrl };
  },
  component: DesignPage,
});

type Tab = "theme" | "colors" | "typography" | "spacing";
const TABS: { id: Tab; label: string }[] = [
  { id: "theme", label: "Theme" },
  { id: "colors", label: "Colors" },
  { id: "typography", label: "Typography" },
  { id: "spacing", label: "Spacing" },
];

interface DesignValues {
  theme: string | null;
  fontPairing: string | null;
  darkMode: boolean;
  brandColor: string | null;
  secondaryColor: string | null;
  tertiaryColor: string | null;
  navBackground: string | null;
  navTextColor: string | null;
  footerBackground: string | null;
  footerTextColor: string | null;
  pageBackground: string | null;
  surfaceBackground: string | null;
  spacingPreset: string | null;
  typeTokens: Partial<TypeTokens> | null;
}

function toValues(
  settings: Awaited<ReturnType<typeof getCadmeaSiteSettings>>,
): DesignValues {
  return {
    theme: settings?.theme ?? null,
    fontPairing: settings?.fontPairing ?? null,
    darkMode: settings?.darkMode ?? false,
    brandColor: settings?.brandColor ?? null,
    secondaryColor: settings?.secondaryColor ?? null,
    tertiaryColor: settings?.tertiaryColor ?? null,
    navBackground: settings?.navBackground ?? null,
    navTextColor: settings?.navTextColor ?? null,
    footerBackground: settings?.footerBackground ?? null,
    footerTextColor: settings?.footerTextColor ?? null,
    pageBackground: settings?.pageBackground ?? null,
    surfaceBackground: settings?.surfaceBackground ?? null,
    spacingPreset: settings?.spacingPreset ?? null,
    typeTokens: (settings?.typeTokens as Partial<TypeTokens> | null) ?? null,
  };
}

function DesignPage() {
  const data = Route.useLoaderData();
  const baseline = createMemo(() => toValues(data().settings));
  const [values, setValues] = createSignal<DesignValues>(baseline());
  const [tab, setTab] = createSignal<Tab>("theme");
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const [reloadToken, setReloadToken] = createSignal(0);

  const isDirty = createMemo(
    () => JSON.stringify(values()) !== JSON.stringify(baseline()),
  );

  useBlocker({
    shouldBlockFn: () => isDirty(),
    enableBeforeUnload: () => isDirty(),
  });

  const [, setOverrides] = useDesignPreviewOverrides();
  // Feed every draft edit up to <BrandColorProvider> so the Panel itself
  // re-themes live — cleared on unmount so leaving without saving reverts.
  createEffect(() => setOverrides(values()));
  onCleanup(() => setOverrides(null));

  function setField(
    key: keyof DesignValues,
    value: DesignValues[keyof DesignValues],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setError(undefined);
    try {
      // biome-ignore lint/suspicious/noExplicitAny: validator only constrains the runtime shape, see pages.ts's createPage for the same pattern
      await saveDesignSettings({ data: values() as any });
      setOverrides(null);
      setReloadToken((t) => t + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div class="grid gap-4 lg:grid-cols-2">
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
          <Show when={tab() === "theme"}>
            <ThemeTab
              values={values()}
              onThemeChange={(theme) => setField("theme", theme)}
              onFontPairingChange={(pairing) =>
                setField("fontPairing", pairing)
              }
              onDarkModeChange={(darkMode) => setField("darkMode", darkMode)}
            />
          </Show>
          <Show when={tab() === "colors"}>
            <ColorsTab
              values={values()}
              onChange={(key, value) => setField(key, value)}
            />
          </Show>
          <Show when={tab() === "typography"}>
            <TypographyTab
              values={values().typeTokens}
              onChange={(key, value) =>
                setField("typeTokens", {
                  ...(values().typeTokens ?? {}),
                  [key]: value,
                })
              }
            />
          </Show>
          <Show when={tab() === "spacing"}>
            <SpacingTab
              value={values().spacingPreset}
              onChange={(preset) => setField("spacingPreset", preset)}
            />
          </Show>
        </div>

        <Show when={error()}>
          <p class="text-sm text-error">{error()}</p>
        </Show>

        <button
          type="button"
          class="btn btn-primary self-start"
          disabled={saving() || !isDirty()}
          onClick={handleSave}
        >
          {saving() ? "Saving…" : "Save"}
        </button>
      </div>

      <SettingsPreviewPane
        publicSiteUrl={data().publicSiteUrl}
        values={values()}
        reloadToken={reloadToken()}
      />
    </div>
  );
}
