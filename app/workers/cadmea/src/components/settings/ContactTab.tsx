import type { JSX } from "solid-js";
import { For } from "solid-js";

export interface SocialLink {
  platform: string;
  url: string;
}

export interface ContactTabValues {
  contactEmail?: string | null;
  contactPhone?: string | null;
  contactAddress?: string | null;
  socialLinks?: SocialLink[] | null;
}

export interface ContactTabProps {
  values: ContactTabValues;
  onChange: (
    key: "contactEmail" | "contactPhone" | "contactAddress",
    value: string,
  ) => void;
  onSocialLinksChange: (links: SocialLink[]) => void;
}

export default function ContactTab(props: ContactTabProps): JSX.Element {
  const links = () => props.values.socialLinks ?? [];

  function updateLink(index: number, patch: Partial<SocialLink>) {
    const next = links().map((link, i) =>
      i === index ? { ...link, ...patch } : link,
    );
    props.onSocialLinksChange(next);
  }

  function removeLink(index: number) {
    props.onSocialLinksChange(links().filter((_, i) => i !== index));
  }

  function addLink() {
    props.onSocialLinksChange([...links(), { platform: "", url: "" }]);
  }

  return (
    <div class="flex flex-col gap-4">
      <div class="form-control">
        <label class="label" for="contactEmail">
          Contact email
        </label>
        <input
          id="contactEmail"
          type="email"
          class="input"
          value={props.values.contactEmail ?? ""}
          onInput={(e) => props.onChange("contactEmail", e.currentTarget.value)}
        />
      </div>

      <div class="form-control">
        <label class="label" for="contactPhone">
          Contact phone
        </label>
        <input
          id="contactPhone"
          type="text"
          class="input"
          value={props.values.contactPhone ?? ""}
          onInput={(e) => props.onChange("contactPhone", e.currentTarget.value)}
        />
      </div>

      <div class="form-control">
        <label class="label" for="contactAddress">
          Contact address
        </label>
        <textarea
          id="contactAddress"
          class="textarea"
          value={props.values.contactAddress ?? ""}
          onInput={(e) =>
            props.onChange("contactAddress", e.currentTarget.value)
          }
        />
      </div>

      <div class="form-control">
        <span class="label">Social links</span>
        <div class="flex flex-col gap-2">
          <For each={links()}>
            {(link, index) => (
              <div class="flex gap-2">
                <input
                  type="text"
                  class="input"
                  placeholder="Platform (e.g. Instagram)"
                  value={link.platform}
                  onInput={(e) =>
                    updateLink(index(), { platform: e.currentTarget.value })
                  }
                />
                <input
                  type="text"
                  class="input flex-1"
                  placeholder="https://…"
                  value={link.url}
                  onInput={(e) =>
                    updateLink(index(), { url: e.currentTarget.value })
                  }
                />
                <button
                  type="button"
                  class="btn btn-error btn-outline btn-sm"
                  onClick={() => removeLink(index())}
                >
                  Remove
                </button>
              </div>
            )}
          </For>
          <button
            type="button"
            class="btn btn-outline btn-sm self-start"
            onClick={addLink}
          >
            Add social link
          </button>
        </div>
      </div>
    </div>
  );
}
