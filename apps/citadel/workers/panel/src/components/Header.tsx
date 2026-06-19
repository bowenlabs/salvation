import { Link } from "@tanstack/solid-router";
import ThemeToggle from "./ThemeToggle";

export default function Header() {
  return (
    <header class="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--header-bg)] px-4 backdrop-blur-lg">
      <nav class="page-wrap flex flex-wrap items-center gap-x-3 gap-y-2 py-3 sm:py-4">
        <h2 class="m-0 flex-shrink-0 text-base font-semibold tracking-tight">
          <Link
            to="/"
            class="inline-flex items-center gap-2 rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1.5 text-sm text-[var(--sea-ink)] no-underline shadow-[0_8px_24px_rgba(30,90,72,0.08)] sm:px-4 sm:py-2"
          >
            <span class="h-2 w-2 rounded-full bg-[linear-gradient(90deg,#56c6be,#7ed3bf)]" />
            Citadel
          </Link>
        </h2>

        <div class="order-3 flex w-full flex-wrap items-center gap-x-4 gap-y-1 pb-1 text-sm font-semibold sm:order-none sm:w-auto sm:flex-nowrap sm:pb-0">
          <Link
            to="/"
            class="nav-link"
            activeOptions={{ exact: true }}
            activeProps={{ class: "nav-link is-active" }}
          >
            Home
          </Link>
          <Link
            to="/about"
            class="nav-link"
            activeProps={{ class: "nav-link is-active" }}
          >
            About
          </Link>
          <a
            href="https://tanstack.com/start/latest/docs/framework/solid"
            class="nav-link"
            target="_blank"
            rel="noreferrer"
          >
            Docs
          </a>
        </div>

        <div class="ml-auto flex items-center gap-1.5 sm:gap-2">
          <a
            href="https://github.com/bowenlabs/thebes"
            target="_blank"
            rel="noreferrer"
            class="hidden rounded-xl p-2 text-[var(--sea-ink-soft)] transition hover:bg-[var(--link-bg-hover)] hover:text-[var(--sea-ink)] sm:block"
          >
            <span class="sr-only">Go to Thebes on GitHub</span>
            <i class="ph ph-github-logo text-2xl" aria-hidden="true" />
          </a>

          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}
