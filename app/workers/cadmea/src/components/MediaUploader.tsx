import { createSignal, type JSX, Show } from "solid-js";
import { uploadMediaFile } from "../lib/upload-media";

export interface MediaUploaderProps {
  /** Current stored URL, if any — shown as a thumbnail preview. */
  value?: string | null;
  onUploaded: (url: string) => void;
  label?: string;
}

export default function MediaUploader(props: MediaUploaderProps): JSX.Element {
  const [dragOver, setDragOver] = createSignal(false);
  const [progress, setProgress] = createSignal<number | null>(null);
  const [error, setError] = createSignal<string>();
  let inputRef: HTMLInputElement | undefined;

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(undefined);
    setProgress(0);
    try {
      const { url } = await uploadMediaFile(file, setProgress);
      props.onUploaded(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setProgress(null);
    }
  }

  return (
    <div class="flex flex-col gap-2">
      <Show when={props.value}>
        <img
          src={props.value as string}
          alt=""
          class="h-20 w-20 rounded-lg border border-[var(--line)] object-cover"
        />
      </Show>

      <button
        type="button"
        onClick={() => inputRef?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFile(e.dataTransfer?.files?.[0]);
        }}
        class="rounded-xl border-2 border-dashed p-4 text-center text-sm transition"
        classList={{
          "border-[var(--lagoon-deep)] bg-[var(--chip-bg)]": dragOver(),
          "border-[var(--line)]": !dragOver(),
        }}
      >
        {props.label ?? "Drop an image here, or click to choose a file"}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        class="hidden"
        onChange={(e) => handleFile(e.currentTarget.files?.[0])}
      />

      <Show when={progress() !== null}>
        <progress
          class="progress progress-primary w-full"
          value={progress() ?? 0}
          max={100}
        />
      </Show>

      <Show when={error()}>
        <p class="m-0 text-sm text-error">{error()}</p>
      </Show>
    </div>
  );
}
