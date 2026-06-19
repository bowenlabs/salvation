export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer class="mt-20 border-t border-[var(--line)] px-4 pb-14 pt-10 text-[var(--sea-ink-soft)]">
      <div class="page-wrap flex flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
        <p class="m-0 text-sm">&copy; {year} BowenLabs. All rights reserved.</p>
        <p class="island-kicker m-0">Built with Cadmus + Citadel</p>
      </div>
      <div class="mt-4 flex justify-center gap-4">
        <a
          href="https://github.com/bowenlabs/thebes"
          target="_blank"
          rel="noreferrer"
          class="rounded-xl p-2 text-[var(--sea-ink-soft)] transition hover:bg-[var(--link-bg-hover)] hover:text-[var(--sea-ink)]"
        >
          <span class="sr-only">Go to Thebes on GitHub</span>
          <i class="ph ph-github-logo text-3xl" aria-hidden="true" />
        </a>
      </div>
    </footer>
  );
}
