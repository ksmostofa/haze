import worker, { Leaderboard } from "./worker.js";

export { Leaderboard };

const PUBLIC_ORIGIN = "https://survivethehaze.netlify.app";
const CORS_HEADERS = {
  "access-control-allow-origin": PUBLIC_ORIGIN,
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "Content-Type,X-Haze-Player",
  "access-control-max-age": "86400",
  "vary": "Origin",
};

function normalizePublicApiRequest(request) {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if (!url.pathname.startsWith("/api/") || origin !== PUBLIC_ORIGIN) return request;

  const publicUrl = new URL(request.url);
  publicUrl.protocol = "https:";
  publicUrl.host = new URL(PUBLIC_ORIGIN).host;
  return new Request(publicUrl, request);
}

function withPublicCors(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(CORS_HEADERS)) headers.set(name, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const publicApiRequest = url.pathname.startsWith("/api/") && request.headers.get("origin") === PUBLIC_ORIGIN;

    if (publicApiRequest && request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const response = await worker.fetch(normalizePublicApiRequest(request), env, ctx);
    return publicApiRequest ? withPublicCors(response) : response;
  },
};
