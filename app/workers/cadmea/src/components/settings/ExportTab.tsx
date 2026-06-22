import type { JSX } from "solid-js";

// Static placeholder — data export/backup tooling is Phase 13, not this
// issue. Same pattern as routes/admin/extensions.tsx's "coming soon" cards.
export default function ExportTab(): JSX.Element {
  return (
    <div class="flex flex-col gap-3">
      <p class="m-0 text-sm text-[var(--sea-ink-soft)]">
        Data export isn't available yet — here's what's planned.
      </p>
      <div class="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
        <p class="m-0 flex items-center gap-2 text-sm font-semibold">
          Full site export
          <span class="island-kicker">Coming soon</span>
        </p>
        <p class="m-0 mt-1 text-sm text-[var(--sea-ink-soft)]">
          Download all pages, settings, and media references as a portable
          archive.
        </p>
      </div>
    </div>
  );
}
