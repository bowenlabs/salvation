import {
  createEffect,
  createSignal,
  For,
  type JSX,
  onCleanup,
  Show,
} from "solid-js";

export interface SearchPaletteResult {
  collection: string;
  id: number;
  label: string;
}

export interface SearchPaletteProps {
  /** Runs a query against `LocalApi.search()` for every searchable collection — see `@thebes/cadmus/cms`'s `getCollectionsMeta`. */
  onSearch: (query: string) => Promise<SearchPaletteResult[]>;
  /** Navigates to the chosen result; the palette closes itself afterward. */
  onSelect: (result: SearchPaletteResult) => void;
}

const DEBOUNCE_MS = 200;

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}

/**
 * Self-contained Cmd+K (Ctrl+K on non-Mac) search palette — issue #29.
 * Owns its own open/closed state and keyboard listener; the host app only
 * supplies `onSearch` (wired to a server function that fans out across
 * every collection with `search` configured) and `onSelect` (navigation).
 * Mirrors PanelNav's focus-trap-on-open / restore-focus-on-close pattern
 * rather than introducing a second one.
 */
export function SearchPalette(props: SearchPaletteProps): JSX.Element {
  const [open, setOpen] = createSignal(false);
  const [query, setQuery] = createSignal("");
  const [results, setResults] = createSignal<SearchPaletteResult[]>([]);
  const [activeIndex, setActiveIndex] = createSignal(0);
  let inputRef: HTMLInputElement | undefined;
  let triggeredBy: HTMLElement | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  // Guards a result fetch that resolves after a newer one was already
  // kicked off (or after the palette closed) from clobbering fresher
  // results with stale ones.
  let latestQueryToken = 0;

  function close() {
    setOpen(false);
    setQuery("");
    setResults([]);
    triggeredBy?.focus();
  }

  function runSearch(value: string) {
    const token = ++latestQueryToken;
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    props.onSearch(value).then((found) => {
      if (token !== latestQueryToken) return;
      setResults(found);
      setActiveIndex(0);
    });
  }

  function onInput(value: string) {
    setQuery(value);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => runSearch(value), DEBOUNCE_MS);
  }

  function selectResult(result: SearchPaletteResult | undefined) {
    if (!result) return;
    props.onSelect(result);
    close();
  }

  // Global Cmd+K / Ctrl+K listener — registered once, independent of
  // `open` (unlike PanelNav's Escape/Tab handling, which only needs to
  // exist while open).
  createEffect(() => {
    function onGlobalKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        triggeredBy = document.activeElement as HTMLElement | null;
        setOpen(true);
      }
    }
    document.addEventListener("keydown", onGlobalKeyDown);
    onCleanup(() => document.removeEventListener("keydown", onGlobalKeyDown));
  });

  createEffect(() => {
    if (open()) inputRef?.focus();
  });

  function onDialogKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      close();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results().length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      selectResult(results()[activeIndex()]);
    }
  }

  return (
    <Show when={open()}>
      <div
        aria-hidden="true"
        class="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[15vh]"
        onClick={close}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Search"
          class="w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] shadow-2xl"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={onDialogKeyDown}
        >
          <div class="flex items-center gap-2 border-b border-[var(--line)] px-4 py-3">
            <i
              class="ph ph-magnifying-glass text-lg text-[var(--sea-ink-soft)]"
              aria-hidden="true"
            />
            <input
              ref={inputRef}
              type="text"
              value={query()}
              onInput={(event) => onInput(event.currentTarget.value)}
              placeholder="Search…"
              aria-label="Search"
              class="flex-1 bg-transparent text-base text-[var(--sea-ink)] outline-none placeholder:text-[var(--sea-ink-soft)]"
            />
            <kbd class="rounded border border-[var(--chip-line)] bg-[var(--chip-bg)] px-1.5 py-0.5 text-xs text-[var(--sea-ink-soft)]">
              Esc
            </kbd>
          </div>

          <Show
            when={results().length > 0}
            fallback={
              <p class="px-4 py-6 text-center text-sm text-[var(--sea-ink-soft)]">
                {query().trim().length < 2
                  ? "Keep typing to search…"
                  : "No results"}
              </p>
            }
          >
            <ul class="max-h-80 overflow-y-auto py-2">
              <For each={results()}>
                {(result, index) => (
                  <li>
                    <button
                      type="button"
                      onClick={() => selectResult(result)}
                      onMouseEnter={() => setActiveIndex(index())}
                      class="flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm text-[var(--sea-ink)] hover:bg-[var(--link-bg-hover)]"
                      classList={{
                        "bg-[var(--link-bg-hover)]": activeIndex() === index(),
                      }}
                    >
                      <span class="truncate">{result.label}</span>
                      <span class="shrink-0 text-xs text-[var(--sea-ink-soft)]">
                        {capitalize(result.collection)}
                      </span>
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </div>
      </div>
    </Show>
  );
}
