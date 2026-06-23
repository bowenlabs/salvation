import { Link, useLocation } from "@tanstack/solid-router";
import { createEffect, type JSX, onCleanup } from "solid-js";
import { cadmeaConfig } from "../../../../cadmea.config.js";

export interface PanelNavProps {
  siteName: string;
  logoutUrl: string;
  /** Mobile slide-in open state — owned by <PanelShell>. */
  open: boolean;
  onClose: () => void;
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}

// Metadata-driven, not a hardcoded link list — see issue #10's reframing
// comment. Cadmea core ships only the `pages` collection; as more
// collections land in cadmea.config.ts, they appear here automatically.
// Forms/Inbox/Contacts are example-template content (see CLAUDE.md), not
// Cadmea core, and are deliberately not nav items here.
const contentLinks = cadmeaConfig.collections.map((collection) => ({
  slug: collection.slug,
  label: capitalize(collection.slug),
  href: `/admin/${collection.slug}`,
}));

const siteLinks = [
  { slug: "users", label: "Users", href: "/admin/users" },
  { slug: "settings", label: "Settings", href: "/admin/settings" },
  { slug: "design", label: "Design", href: "/admin/design" },
  { slug: "extensions", label: "Extensions", href: "/admin/extensions" },
];

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function PanelNav(props: PanelNavProps): JSX.Element {
  const location = useLocation();
  let navRef: HTMLElement | undefined;
  let closeButtonRef: HTMLButtonElement | undefined;
  let triggeredBy: HTMLElement | null = null;

  function isActive(href: string): boolean {
    const pathname = location().pathname;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  // Focus trap: move focus into the panel on open, cycle Tab within it,
  // close on Escape, and restore focus to whatever opened it on close —
  // the mobile sidebar is a modal dialog while open (see issue #10's
  // "Mobile sidebar opens, closes, and traps focus correctly" criterion).
  createEffect(() => {
    if (!props.open) {
      triggeredBy?.focus();
      return;
    }

    triggeredBy = document.activeElement as HTMLElement | null;
    closeButtonRef?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        props.onClose();
        return;
      }
      if (event.key !== "Tab" || !navRef) return;

      const focusable = Array.from(
        navRef.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    onCleanup(() => document.removeEventListener("keydown", onKeyDown));
  });

  return (
    <nav
      ref={navRef}
      id="panel-nav"
      aria-label="Panel navigation"
      class="fixed inset-y-0 left-0 z-50 flex w-72 -translate-x-full flex-col border-r border-[var(--line)] bg-[var(--surface-strong)] p-4 transition-transform duration-200 lg:static lg:z-auto lg:w-64 lg:translate-x-0"
      classList={{ "translate-x-0": props.open }}
    >
      <div class="flex items-center justify-between gap-2">
        <Link
          to="/admin/pages"
          class="inline-flex items-center gap-2 rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1.5 text-sm font-semibold text-[var(--sea-ink)] no-underline"
        >
          <span class="h-2 w-2 rounded-full bg-[linear-gradient(90deg,#56c6be,#7ed3bf)]" />
          {props.siteName}
        </Link>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={props.onClose}
          aria-label="Close menu"
          class="rounded-xl p-2 text-[var(--sea-ink-soft)] hover:bg-[var(--link-bg-hover)] hover:text-[var(--sea-ink)] lg:hidden"
        >
          <i class="ph ph-x text-xl" aria-hidden="true" />
        </button>
      </div>

      <div class="mt-6 flex flex-1 flex-col gap-6 overflow-y-auto">
        <NavSection title="Content" links={contentLinks} isActive={isActive} />
        <NavSection title="Site" links={siteLinks} isActive={isActive} />
      </div>

      <form method="post" action={props.logoutUrl} class="mt-4">
        <button
          type="submit"
          class="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-[var(--sea-ink-soft)] transition hover:bg-[var(--link-bg-hover)] hover:text-[var(--sea-ink)]"
        >
          <i class="ph ph-sign-out text-lg" aria-hidden="true" />
          Sign out
        </button>
      </form>
    </nav>
  );
}

function NavSection(props: {
  title: string;
  links: Array<{ slug: string; label: string; href: string }>;
  isActive: (href: string) => boolean;
}): JSX.Element {
  return (
    <div>
      <p class="island-kicker m-0 px-3">{props.title}</p>
      <ul class="m-0 mt-2 flex list-none flex-col gap-1 p-0">
        {props.links.map((link) => (
          <li>
            <Link
              to={link.href}
              class="block rounded-xl px-3 py-2 text-sm font-semibold text-[var(--sea-ink-soft)] no-underline transition hover:bg-[var(--link-bg-hover)] hover:text-[var(--sea-ink)]"
              classList={{
                "bg-[var(--chip-bg)] text-[var(--sea-ink)]": props.isActive(
                  link.href,
                ),
              }}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
