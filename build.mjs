import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";

const source = "public/index.html";
const html = readFileSync(source, "utf8");
const required = [
  "<title>HAZE — Survive the Night</title>",
  'BUILD_ID="haze-20260811-global-v1"',
  "entryGate",
  "requestGameFullscreen",
  "runProof",
  "completeRankedRun",
  "/api/leaderboard",
  "/api/run/start",
  "/api/run/complete",
  "/api/run/finish",
  'src="/vendor/three.min.js"',
  'property="og:image"',
  'rel="icon"',
];

for (const marker of required) {
  if (!html.includes(marker)) throw new Error(`HAZE build verification failed: missing ${marker}`);
}
for (const forbidden of ["window.__HAZE", "?debug=1", "unpkg.com", "cdnjs.cloudflare.com"]) {
  if (html.includes(forbidden)) throw new Error(`HAZE build verification failed: forbidden production marker ${forbidden}`);
}
if (html.length < 150_000) throw new Error(`HAZE build verification failed: HTML unexpectedly small (${html.length} chars).`);

const threeSource = "node_modules/three/build/three.min.js";
if (!existsSync(threeSource)) throw new Error("Three.js dependency is missing; run npm ci first.");

rmSync("dist", { recursive: true, force: true });
cpSync("public", "dist", { recursive: true });
mkdirSync("dist/vendor", { recursive: true });
copyFileSync(threeSource, "dist/vendor/three.min.js");

console.log(`HAZE build verified: ${html.length} chars → dist/index.html`);
