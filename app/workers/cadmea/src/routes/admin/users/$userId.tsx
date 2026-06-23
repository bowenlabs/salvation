import type { Role } from "@core/lib/session";
import {
  createMutation,
  createQuery,
  useQueryClient,
} from "@tanstack/solid-query";
import { createFileRoute } from "@tanstack/solid-router";
import { createSignal, For, Show } from "solid-js";
import { getUser, updateUserRole } from "../../../server-functions/users";

export const prerender = false;

export const Route = createFileRoute("/admin/users/$userId")({
  component: EditUserPage,
});

const ROLES: Role[] = ["owner", "editor", "viewer"];

// Full-screen edit view, not a modal over the list — per issue #26's
// mobile-first requirement. `role` is the only editable field; everything
// else about a user is set at account-creation time, not here.
function EditUserPage() {
  const params = Route.useParams();
  const queryClient = useQueryClient();
  const id = () => Number(params().userId);

  const user = createQuery(() => ({
    queryKey: ["users", id()],
    queryFn: () => getUser({ data: id() }),
  }));

  const [role, setRole] = createSignal<Role>();
  const [error, setError] = createSignal<string>();
  const [saved, setSaved] = createSignal(false);

  const currentRole = () => role() ?? user.data?.role;

  const save = createMutation(() => ({
    mutationFn: () => {
      const nextRole = currentRole();
      if (!nextRole) return Promise.reject(new Error("Role not loaded yet"));
      return updateUserRole({ data: { id: id(), role: nextRole } });
    },
    onSuccess: () => {
      setError(undefined);
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => setError(e.message),
  }));

  return (
    <div class="flex flex-col gap-4">
      <h1 class="text-xl font-semibold">Edit user</h1>
      <Show when={user.data}>
        {(u) => (
          <div class="flex flex-col gap-4">
            <div class="form-control">
              <label class="label" for="email">
                Email
              </label>
              <input id="email" class="input" value={u().email} readOnly />
            </div>
            <div class="form-control">
              <label class="label" for="role">
                Role
              </label>
              <select
                id="role"
                class="select"
                value={currentRole()}
                onChange={(e) => {
                  setSaved(false);
                  setRole(e.currentTarget.value as Role);
                }}
              >
                <For each={ROLES}>{(r) => <option value={r}>{r}</option>}</For>
              </select>
            </div>
          </div>
        )}
      </Show>

      <Show when={error()}>
        <p class="text-sm text-error">{error()}</p>
      </Show>

      {/* Bottom-anchored action bar, matching CollectionEdit's mobile-first
          pattern. */}
      <div class="bg-base-100 sticky bottom-0 flex items-center gap-3 border-t py-3">
        <button
          type="button"
          class="btn btn-primary flex-1"
          disabled={save.isPending || !user.data}
          onClick={() => save.mutate()}
        >
          <Show when={save.isPending} fallback="Save">
            <span class="loading loading-spinner loading-sm" />
          </Show>
        </button>
        <Show when={saved()}>
          <span class="text-sm text-[var(--sea-ink-soft)]">Saved.</span>
        </Show>
      </div>
    </div>
  );
}
