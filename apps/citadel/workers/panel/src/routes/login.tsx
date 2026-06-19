import { createFileRoute } from "@tanstack/solid-router";

export const Route = createFileRoute("/login")({
  component: Login,
});

function Login() {
  return <p>Login placeholder — full implementation is Phase 3.</p>;
}
