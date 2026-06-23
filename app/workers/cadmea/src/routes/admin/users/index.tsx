import { createQuery } from "@tanstack/solid-query";
import { createFileRoute, useNavigate } from "@tanstack/solid-router";
import { For, Show } from "solid-js";
import { getUsers } from "../../../server-functions/users";

// Same prerender hazard as admin/pages/index.tsx — getUsers() needs
// request-time `cloudflare:workers` env, see issue #19.
export const prerender = false;

export const Route = createFileRoute("/admin/users/")({
  component: UsersPage,
});

function displayName(user: {
  firstName: string | null;
  lastName: string | null;
}) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || "—";
}

// users isn't a CollectionConfig (see app/core/db/schema.ts's header
// comment), so it can't go through createCollectionListPage — hand-rolled
// instead, but following the same mobile-first card/table split as
// @thebes/cadmea's CollectionList (table on desktop, stacked cards below
// md), per issue #26's mobile-first requirement.
function UsersPage() {
  const navigate = useNavigate();

  const result = createQuery(() => ({
    queryKey: ["users"],
    queryFn: () => getUsers(),
  }));

  function openUser(id: number) {
    navigate({ to: "/admin/users/$userId", params: { userId: String(id) } });
  }

  return (
    <div class="flex flex-col gap-4">
      <h1 class="text-xl font-semibold">Users</h1>
      <Show
        when={!result.isLoading}
        fallback={<div class="loading loading-spinner" />}
      >
        <Show
          when={(result.data?.length ?? 0) > 0}
          fallback={<p class="text-sm opacity-70">No users yet.</p>}
        >
          <table class="table hidden md:table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Role</th>
              </tr>
            </thead>
            <tbody>
              <For each={result.data}>
                {(user) => (
                  <tr
                    class="cursor-pointer hover"
                    onClick={() => openUser(user.id)}
                  >
                    <td>{user.email}</td>
                    <td>{displayName(user)}</td>
                    <td>{user.role}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>

          <div class="flex flex-col gap-2 md:hidden">
            <For each={result.data}>
              {(user) => (
                // biome-ignore lint/a11y/useSemanticElements: matches CollectionList's mobile card pattern — a native <button> can't contain the multi-line content below.
                <div
                  class="card bg-base-200 cursor-pointer p-3"
                  role="button"
                  tabIndex={0}
                  onClick={() => openUser(user.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openUser(user.id);
                    }
                  }}
                >
                  <div class="flex flex-col gap-1">
                    <span class="font-semibold">{user.email}</span>
                    <span class="text-sm opacity-60">{displayName(user)}</span>
                    <span class="text-sm opacity-60">Role: {user.role}</span>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  );
}
