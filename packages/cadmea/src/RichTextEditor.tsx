import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { onCleanup, onMount } from "solid-js";

export interface RichTextEditorProps {
  id?: string;
  /** TipTap's native JSON document shape — stored as-is, no transform layer. */
  content?: object;
  onChange: (doc: object) => void;
}

// No official Solid binding for TipTap exists, so this wraps @tiptap/core's
// vanilla `Editor` class directly in Solid's onMount/onCleanup lifecycle —
// per CLAUDE.md's preference for the framework-agnostic core API over an
// unofficial community port (same reasoning already applied to Phosphor
// icons). `content` is only read once at mount, matching how this form's
// other fields are initialized from `initialValues` rather than reacting
// to prop changes after the fact — there is no live re-sync if `content`
// changes out from under an already-mounted editor.
export function RichTextEditor(props: RichTextEditorProps) {
  let container: HTMLDivElement | undefined;
  let editor: Editor | undefined;

  onMount(() => {
    if (!container) return;
    editor = new Editor({
      element: container,
      extensions: [StarterKit],
      content: props.content ?? "",
      onUpdate: ({ editor: current }) => {
        props.onChange(current.getJSON());
      },
    });
  });

  onCleanup(() => {
    editor?.destroy();
  });

  return (
    <div
      id={props.id}
      class="textarea h-auto min-h-32 w-full"
      ref={(el) => {
        container = el;
      }}
    />
  );
}
