import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const entry = readFileSync(new URL("../src/entry.js", import.meta.url), "utf8");
const build = readFileSync(new URL("../build.mjs", import.meta.url), "utf8");
const netlify = readFileSync(new URL("../netlify.toml", import.meta.url), "utf8");
const redirects = readFileSync(new URL("../netlify-proxy/_redirects", import.meta.url), "utf8");

describe("public Netlify domain", () => {
  it("keeps Netlify as the visible public origin and Cloudflare as the API origin", () => {
    expect(entry).toContain('PUBLIC_ORIGIN = "https://survivethehaze.netlify.app"');
    expect(build).toContain('apiOrigin = "https://haze.ksmostofa576.workers.dev"');
    expect(build).toContain('publicOrigin = "https://survivethehaze.netlify.app"');
  });

  it("handles browser CORS instead of bypassing origin validation", () => {
    expect(entry).toContain('request.method === "OPTIONS"');
    expect(entry).toContain('access-control-allow-origin');
    expect(entry).toContain('Content-Type,X-Haze-Player');
    expect(entry).not.toContain('access-control-allow-origin": "*"');
  });

  it("deploys Netlify as a proxy shell only", () => {
    expect(netlify).toMatch(/publish\s*=\s*"netlify-proxy"/);
    expect(netlify).not.toMatch(/command\s*=/);
    expect(redirects.trim()).toBe("/*  https://haze.ksmostofa576.workers.dev/:splat  200!");
  });

  it("injects the desktop/mobile How to Play guide", () => {
    expect(build).toContain('/how-to-play.css');
    expect(build).toContain('/how-to-play.js');
  });
});
