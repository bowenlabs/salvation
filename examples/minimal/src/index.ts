import { checkRateLimit } from "@thebes/cadmus/rate-limit";

interface Env {
  KV: KVNamespace;
}

// The smallest possible Cadmus app: one Worker, one primitive. It rate-limits
// each client IP to 5 requests per minute using @thebes/cadmus/rate-limit —
// no Node.js, no adapter layer, just a Cloudflare KV binding passed straight
// into the primitive (see CADMUS.md "Raw bindings").
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const ip = request.headers.get("cf-connecting-ip") ?? "anonymous";
    const { allowed, remaining } = await checkRateLimit(
      env.KV,
      `minimal:${ip}`,
      5,
      60,
    );

    if (!allowed) {
      return new Response("Too many requests — try again in a moment.\n", {
        status: 429,
      });
    }

    return new Response(
      `Hello from Cadmus. ${remaining} requests left this minute.\n`,
    );
  },
} satisfies ExportedHandler<Env>;
