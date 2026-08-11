import worker, { Leaderboard } from "./worker.js";

export { Leaderboard };

const PUBLIC_ORIGIN = "https://survivethehaze.netlify.app";

function normalizePublicProxyRequest(request) {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if (!url.pathname.startsWith("/api/") || origin !== PUBLIC_ORIGIN) return request;

  const publicUrl = new URL(request.url);
  publicUrl.protocol = "https:";
  publicUrl.host = new URL(PUBLIC_ORIGIN).host;
  return new Request(publicUrl, request);
}

export default {
  async fetch(request, env, ctx) {
    return worker.fetch(normalizePublicProxyRequest(request), env, ctx);
  },
};
