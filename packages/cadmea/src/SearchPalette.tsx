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
  /**
   * Optional Phosphor icon class (e.g. `"ph-house"`) shown left of the label.
   * Falls back to `SearchPaletteProps.collectionIcon(collection)` when omitted.
   */
  icon?: string;
  /**
   * Optional right-aligned badge — a status ("Available"/"Sold") or type
   * ("JPG"/"PDF"). `tone` colors it; defaults to a muted tone.
   */
  meta?: { label: string; tone?: "positive" | "negative" | "muted" };
}

export interface SearchPaletteProps {
  /** Runs a query against `LocalApi.search()` for every searchable collection — see `@thebes/cadmus/cms`'s `getCollectionsMeta`. */
  onSearch: (query: string) => Promise<SearchPaletteResult[]>;
  /** Navigates to the chosen result; the palette closes itself afterward. */
  onSelect: (result: SearchPaletteResult) => void;
  /**
   * Group results under per-collection section headers (studio redesign)
   * instead of a flat list. Keyboard nav still runs over the flat result
   * order. Default `false` (flat list, backward-compatible).
   */
  grouped?: boolean;
  /** Humanize a collection slug for the group header + the flat-list tag. Default: capitalize. */
  collectionLabel?: (collection: string) => string;
  /** Fallback Phosphor icon class for a result whose collection has no per-result `icon`. */
  collectionIcon?: (collection: string) => string | undefined;
  /** Search input placeholder. Default `"Search…"`. */
  placeholder?: string;
}

/**
 * Groups results by `collection` in first-seen order, tagging each with its
 * index into the flat `results` array so keyboard nav (which runs over the flat
 * order) and the grouped rendering stay in sync.
 */
function groupByCollection(results: SearchPaletteResult[]): {
  collection: string;
  items: { result: SearchPaletteResult; flatIndex: number }[];
}[] {
  const groups: {
    collection: string;
    items: { result: SearchPaletteResult; flatIndex: number }[];
  }[] = [];
  const byCollection = new Map<string, (typeof groups)[number]>();
  results.forEach((result, flatIndex) => {
    let group = byCollection.get(result.collection);
    if (!group) {
      group = { collection: result.collection, items: [] };
      byCollection.set(result.collection, group);
      groups.push(group);
    }
    group.items.push({ result, flatIndex });
  });
  return groups;
}

const TONE_COLOR: Record<
  NonNullable<NonNullable<SearchPaletteResult["meta"]>["tone"]>,
  string
> = {
  positive: "var(--ok, oklch(0.55 0.09 150))",
  negative: "var(--danger, oklch(0.55 0.15 25))",
  muted: "var(--sea-ink-soft)",
};

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

  // One result row — an optional leading icon, the label, and an optional
  // right-aligned status/type badge. `flatIndex` is its position in the flat
  // results array, so hover/active/keyboard nav stay aligned whether the list
  // is grouped or flat.
  function renderRow(
    result: SearchPaletteResult,
    flatIndex: number,
  ): JSX.Element {
    const icon = result.icon ?? props.collectionIcon?.(result.collection);
    return (
      <li>
        <button
          type="button"
          onClick={() => selectResult(result)}
          onMouseEnter={() => setActiveIndex(flatIndex)}
          class="flex w-full items-center gap-2.5 rounded-lg px-4 py-2 text-left text-sm text-[var(--sea-ink)] hover:bg-[var(--link-bg-hover)]"
          classList={{
            "bg-[var(--link-bg-hover)]": activeIndex() === flatIndex,
          }}
        >
          <Show when={icon}>
            <i
              class={`ph ${icon} shrink-0 text-base text-[var(--sea-ink-soft)]`}
              aria-hidden="true"
            />
          </Show>
          <span class="truncate">{result.label}</span>
          <span class="ml-auto shrink-0 text-xs">
            <Show
              when={result.meta}
              fallback={
                // Grouped mode gets the collection from its section header, so
                // the per-row tag would be redundant — flat mode shows it.
                <Show when={!props.grouped}>
                  <span class="text-[var(--sea-ink-soft)]">
                    {(props.collectionLabel ?? capitalize)(result.collection)}
                  </span>
                </Show>
              }
            >
              {(meta) => (
                <span
                  class="font-semibold"
                  style={{ color: TONE_COLOR[meta().tone ?? "muted"] }}
                >
                  {meta().label}
                </span>
              )}
            </Show>
          </span>
        </button>
      </li>
    );
  }

  return (
    <Show when={open()}>
      {/* Centering container — NOT aria-hidden (it holds the accessible dialog)
          and not itself interactive. */}
      <div class="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[15vh]">
        {/* Decorative backdrop as its own layer: aria-hidden (so its
            click-to-dismiss is a mouse convenience the a11y lint exempts) and
            behind the dialog. Keyboard users dismiss via the dialog's Escape
            handler. Keeping it a sibling — not an ancestor — of the dialog is
            what keeps the dialog + its focused input visible to assistive tech. */}
        <div
          aria-hidden="true"
          class="absolute inset-0 bg-[var(--color-backdrop)]"
          onClick={close}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Search"
          class="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] shadow-2xl"
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
              placeholder={props.placeholder ?? "Search…"}
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
            <ul class="max-h-80 overflow-y-auto p-2">
              <Show
                when={props.grouped}
                fallback={
                  <For each={results()}>
                    {(result, index) => renderRow(result, index())}
                  </For>
                }
              >
                <For each={groupByCollection(results())}>
                  {(group) => (
                    <>
                      <li
                        class="px-2.5 pb-1 pt-2 font-mono text-[9.5px] uppercase tracking-[0.12em] text-[var(--sea-ink-soft)]"
                        aria-hidden="true"
                      >
                        {(props.collectionLabel ?? capitalize)(
                          group.collection,
                        )}
                      </li>
                      <For each={group.items}>
                        {(item) => renderRow(item.result, item.flatIndex)}
                      </For>
                    </>
                  )}
                </For>
              </Show>
            </ul>
          </Show>
        </div>
      </div>
    </Show>
  );
}
