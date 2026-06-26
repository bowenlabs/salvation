import { Editor } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import StarterKit from "@tiptap/starter-kit";
import {
  createSignal,
  For,
  type JSX,
  onCleanup,
  onMount,
  Show,
} from "solid-js";

export interface RichTextEditorProps {
  id?: string;
  /** TipTap's native JSON document shape — stored as-is, no transform layer. */
  content?: object;
  onChange: (doc: object) => void;
  /**
   * Resolves a picked image file to a stored URL (same contract as the form's
   * upload fields). When provided, the toolbar and slash menu expose an
   * "Image" insert; omitted, image insertion is hidden.
   */
  onUploadFile?: (file: File) => Promise<{ url: string }>;
}

interface SlashItem {
  label: string;
  /** Extra search terms so e.g. "ul" finds "Bullet list". */
  keywords: string;
  run: (editor: Editor) => void;
}

// Pure: a slash menu opens only when the current block's text up to the
// cursor is a bare `/` followed by an optional word (Notion/Ghost-style, at
// the start of an empty-ish block). Returns the query (may be "") or null.
// Exported for unit testing without a live ProseMirror view.
export function matchSlashQuery(textBeforeCursor: string): string | null {
  const m = textBeforeCursor.match(/^\/(\w*)$/);
  return m ? m[1] : null;
}

// Pure: filter slash items by label or keywords against a (lowercased) query.
export function filterSlashItems(
  items: SlashItem[],
  query: string,
): SlashItem[] {
  const q = query.toLowerCase();
  if (!q) return items;
  return items.filter(
    (it) => it.label.toLowerCase().includes(q) || it.keywords.includes(q),
  );
}

interface SlashState {
  from: number;
  to: number;
  query: string;
  left: number;
  top: number;
}

// No official Solid binding for TipTap exists, so this wraps @tiptap/core's
// vanilla `Editor` class directly in Solid's onMount/onCleanup lifecycle —
// per CLAUDE.md's preference for the framework-agnostic core API over an
// unofficial community port. A persistent formatting toolbar (discoverable
// for non-technical clients) plus a `/` slash menu for inserting blocks make
// this a Ghost-like writing surface rather than a bare textarea. `content`
// is only read once at mount, matching how the form's other fields init from
// `initialValues` rather than reacting to later prop changes.
export function RichTextEditor(props: RichTextEditorProps) {
  let container: HTMLDivElement | undefined;
  let fileInput: HTMLInputElement | undefined;
  let editor: Editor | undefined;

  // Tiptap's Editor isn't reactive; bump a signal on every transaction so the
  // toolbar's active states (bold on/off, current heading…) re-render.
  const [tick, setTick] = createSignal(0);
  const bump = () => setTick((t) => t + 1);
  const [slash, setSlash] = createSignal<SlashState | null>(null);
  const [activeIdx, setActiveIdx] = createSignal(0);

  const slashItems = (): SlashItem[] => {
    const items: SlashItem[] = [
      {
        label: "Heading 2",
        keywords: "h2 title heading",
        run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
      },
      {
        label: "Heading 3",
        keywords: "h3 subtitle heading",
        run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
      },
      {
        label: "Bullet list",
        keywords: "ul unordered bullets",
        run: (e) => e.chain().focus().toggleBulletList().run(),
      },
      {
        label: "Numbered list",
        keywords: "ol ordered numbers",
        run: (e) => e.chain().focus().toggleOrderedList().run(),
      },
      {
        label: "Quote",
        keywords: "blockquote citation",
        run: (e) => e.chain().focus().toggleBlockquote().run(),
      },
      {
        label: "Divider",
        keywords: "hr rule separator line",
        run: (e) => e.chain().focus().setHorizontalRule().run(),
      },
    ];
    if (props.onUploadFile) {
      items.push({
        label: "Image",
        keywords: "img photo picture upload",
        run: () => fileInput?.click(),
      });
    }
    return items;
  };

  const filteredSlash = () => {
    const s = slash();
    return s ? filterSlashItems(slashItems(), s.query) : [];
  };

  // Re-evaluate whether a slash menu should be open after every selection or
  // doc change.
  function detectSlash() {
    if (!editor) return;
    const { state } = editor;
    const sel = state.selection;
    if (!sel.empty) {
      setSlash(null);
      return;
    }
    const $from = sel.$from;
    const textBefore = $from.parent.textBetween(
      0,
      $from.parentOffset,
      undefined,
      "￼",
    );
    const query = matchSlashQuery(textBefore);
    if (query === null) {
      setSlash(null);
      return;
    }
    const to = sel.from;
    const from = $from.start();
    let left = 0;
    let top = 0;
    try {
      const coords = editor.view.coordsAtPos(to);
      const rect = container?.getBoundingClientRect();
      left = coords.left - (rect?.left ?? 0);
      top = coords.bottom - (rect?.top ?? 0);
    } catch {
      // coordsAtPos throws if layout isn't ready (e.g. jsdom) — fall back to
      // the top-left of the editor; the menu is still usable.
    }
    setSlash({ from, to, query, left, top });
    setActiveIdx(0);
  }

  function runSlashItem(item: SlashItem) {
    const s = slash();
    if (!s || !editor) return;
    // Drop the typed "/query" first, then run the block command at that spot.
    editor.chain().focus().deleteRange({ from: s.from, to: s.to }).run();
    item.run(editor);
    setSlash(null);
  }

  onMount(() => {
    if (!container) return;
    editor = new Editor({
      element: container,
      extensions: [
        StarterKit.configure({ link: { openOnClick: false } }),
        Image,
      ],
      content: props.content ?? "",
      editorProps: {
        attributes: { class: "prose-site max-w-none focus:outline-none" },
        // Drive slash-menu keyboard nav while it's open; let TipTap handle
        // everything else.
        handleKeyDown: (_view, event) => {
          if (!slash()) return false;
          const items = filteredSlash();
          if (event.key === "ArrowDown") {
            setActiveIdx((i) => Math.min(i + 1, items.length - 1));
            return true;
          }
          if (event.key === "ArrowUp") {
            setActiveIdx((i) => Math.max(i - 1, 0));
            return true;
          }
          if (event.key === "Enter") {
            const item = items[activeIdx()];
            if (item) {
              runSlashItem(item);
              return true;
            }
          }
          if (event.key === "Escape") {
            setSlash(null);
            return true;
          }
          return false;
        },
      },
      onUpdate: ({ editor: current }) => {
        props.onChange(current.getJSON());
        bump();
        detectSlash();
      },
      onSelectionUpdate: () => {
        bump();
        detectSlash();
      },
    });
  });

  onCleanup(() => editor?.destroy());

  // Reading `tick()` here subscribes the caller (each toolbar button's
  // `active` accessor) to editor transactions, so active states re-render.
  const isActive = (name: string, attrs?: Record<string, unknown>): boolean => {
    tick();
    return Boolean(editor?.isActive(name, attrs));
  };

  function setLink() {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", prev ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  async function handleImageFile(
    e: Event & { currentTarget: HTMLInputElement },
  ) {
    const file = e.currentTarget.files?.[0];
    if (!file || !props.onUploadFile || !editor) return;
    try {
      const { url } = await props.onUploadFile(file);
      editor.chain().focus().setImage({ src: url }).run();
    } finally {
      e.currentTarget.value = "";
    }
  }

  return (
    <div class="border-base-300 rounded-box border">
      <div class="border-base-300 flex flex-wrap items-center gap-0.5 border-b p-1">
        <ToolbarButton
          label="Bold"
          onClick={() => editor?.chain().focus().toggleBold().run()}
          active={() => isActive("bold")}
        >
          <span class="font-bold">B</span>
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          active={() => isActive("italic")}
        >
          <span class="italic">I</span>
        </ToolbarButton>
        <ToolbarButton
          label="Underline"
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
          active={() => isActive("underline")}
        >
          <span class="underline">U</span>
        </ToolbarButton>
        <ToolbarButton
          label="Link"
          onClick={setLink}
          active={() => isActive("link")}
        >
          Link
        </ToolbarButton>
        <span class="bg-base-300 mx-1 h-4 w-px" aria-hidden="true" />
        <ToolbarButton
          label="Heading 2"
          onClick={() =>
            editor?.chain().focus().toggleHeading({ level: 2 }).run()
          }
          active={() => isActive("heading", { level: 2 })}
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          label="Heading 3"
          onClick={() =>
            editor?.chain().focus().toggleHeading({ level: 3 }).run()
          }
          active={() => isActive("heading", { level: 3 })}
        >
          H3
        </ToolbarButton>
        <ToolbarButton
          label="Bullet list"
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          active={() => isActive("bulletList")}
        >
          •
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          active={() => isActive("orderedList")}
        >
          1.
        </ToolbarButton>
        <ToolbarButton
          label="Quote"
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          active={() => isActive("blockquote")}
        >
          ❝
        </ToolbarButton>
        <ToolbarButton
          label="Divider"
          onClick={() => editor?.chain().focus().setHorizontalRule().run()}
        >
          —
        </ToolbarButton>
        <Show when={props.onUploadFile}>
          <span class="bg-base-300 mx-1 h-4 w-px" aria-hidden="true" />
          <ToolbarButton label="Image" onClick={() => fileInput?.click()}>
            Image
          </ToolbarButton>
        </Show>
      </div>

      <div class="relative">
        <div
          id={props.id}
          class="min-h-32 p-3"
          ref={(el) => (container = el)}
        />
        <Show when={slash() && filteredSlash().length > 0}>
          <div
            role="menu"
            aria-label="Insert block"
            class="bg-base-100 border-base-300 rounded-box absolute z-10 flex min-w-44 flex-col border p-1 shadow"
            style={{
              left: `${slash()?.left ?? 0}px`,
              top: `${(slash()?.top ?? 0) + 4}px`,
            }}
          >
            <For each={filteredSlash()}>
              {(item, i) => (
                <button
                  type="button"
                  role="menuitem"
                  class="rounded px-3 py-1.5 text-left text-sm"
                  classList={{ "bg-base-200": i() === activeIdx() }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => runSlashItem(item)}
                >
                  {item.label}
                </button>
              )}
            </For>
          </div>
        </Show>
      </div>

      <Show when={props.onUploadFile}>
        <input
          ref={(el) => (fileInput = el)}
          type="file"
          accept="image/*"
          class="hidden"
          onChange={handleImageFile}
        />
      </Show>
    </div>
  );
}

// A toolbar button. `active` is an accessor so Solid re-tracks it on every
// editor transaction (via the `tick` signal isActive reads).
function ToolbarButton(props: {
  label: string;
  active?: () => boolean;
  onClick: () => void;
  children: JSX.Element;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-label={props.label}
      aria-pressed={props.active?.() ?? false}
      title={props.label}
      class="btn btn-ghost btn-xs"
      classList={{ "btn-active": props.active?.() ?? false }}
      // Keep the editor selection while clicking the toolbar.
      onMouseDown={(e) => e.preventDefault()}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}
