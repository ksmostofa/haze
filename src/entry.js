import worker, { Leaderboard } from "./worker.js";

export { Leaderboard };

const PUBLIC_ORIGIN = "https://survivethehaze.netlify.app";

// Netlify is only a public hostname/reverse proxy. When its browser Origin is
// forwarded to the Cloudflare Worker, normalize the request URL so the single
// backend's same-origin validation and optional Turnstile hostname validation
// see the public origin the player actually used.
function normalizePublicProxyRequest(request) {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if (!url.pathname.startsWith("/api/") || origin !== PUBLIC_ORIGIN) return request;

  const publicUrl = new URL(request.url);
  publicUrl.protocol = "https:";
  publicUrl.host = new URL(PUBLIC_ORIGIN).host;
  return new Request(publicUrl, request);
}

function withDeliveryHeaders(response) {
  const headers = new Headers(response.headers);
  const type = headers.get("content-type") || "";
  // Never let a browser keep an obsolete game shell after a production fix.
  // Versioned/static assets can still use the platform's normal caching.
  if (type.includes("text/html")) headers.set("cache-control", "no-cache, no-store, must-revalidate");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env, ctx) {
    return withDeliveryHeaders(await worker.fetch(normalizePublicProxyRequest(request), env, ctx));
  },
};
