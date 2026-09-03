import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const entry = readFileSync(new URL("../src/entry.js", import.meta.url), "utf8");
const build = readFileSync(new URL("../build.mjs", import.meta.url), "utf8");
const index = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const netlify = readFileSync(new URL("../netlify.toml", import.meta.url), "utf8");
const redirects = readFileSync(new URL("../netlify-proxy/_redirects", import.meta.url), "utf8");
const verify = readFileSync(new URL("../.github/workflows/verify.yml", import.meta.url), "utf8");

describe("public Netlify domain", () => {
  it("uses one frontend and relative same-origin API calls", () => {
    expect(entry).toContain('PUBLIC_ORIGIN = "https://survivethehaze.netlify.app"');
    expect(build).toContain('publicOrigin = "https://survivethehaze.netlify.app"');
    expect(build).toContain('cloudflareOrigin = "https://haze.ksmostofa576.workers.dev"');
    expect(build).toContain('apiJSON("/api/run/start"');
    expect(build).toContain('apiJSON("/api/leaderboard"');
    expect(build).toContain('productionHtml.includes("API_ORIGIN")');
    expect(build).not.toContain('const API_ORIGIN=');
  });

  it("normalizes the proxied Netlify Origin without a second CORS client", () => {
    expect(entry).toContain('normalizePublicProxyRequest');
    expect(entry).toContain('origin !== PUBLIC_ORIGIN');
    expect(entry).toContain('publicUrl.host = new URL(PUBLIC_ORIGIN).host');
    expect(entry).not.toContain('access-control-allow-origin');
    expect(entry).not.toContain('request.method === "OPTIONS"');
  });

  it("deploys Netlify as a proxy shell only", () => {
    expect(netlify).toMatch(/publish\s*=\s*"netlify-proxy"/);
    expect(netlify).not.toMatch(/command\s*=/);
    expect(redirects.trim()).toBe("/*  https://haze.ksmostofa576.workers.dev/:splat  200!");
  });

  it("injects one adaptive allocation-light frontend and the desktop/mobile guide", () => {
    expect(build).toContain("PERF_PROFILE");
    expect(build).toContain("updateAdaptiveQuality");
    expect(build).toContain("enemyRouteScratch");
    expect(build).toContain("allocation-free cabin sweep");
    expect(index).toContain('src="/loader-state.js"');
    expect(build).toContain('/how-to-play.css');
    expect(build).toContain('/how-to-play.js');
  });

  it("live verification exercises API requests through each visible hostname", () => {
    expect(verify).toContain('"$BASE/api/config"');
    expect(verify).toContain('"$BASE/api/leaderboard"');
    expect(verify).toContain('"$BASE/api/run/start"');
    expect(verify).toContain('-H "Origin: $ORIGIN"');
    expect(verify).toContain('verify_host "$CLOUDFLARE" "$CLOUDFLARE" "cloudflare"');
    expect(verify).toContain('verify_host "$NETLIFY" "$NETLIFY" "netlify"');
    expect(verify).not.toContain('API_URL/api/run/start');
  });
});
