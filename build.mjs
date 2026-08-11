import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

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
for (const asset of ["public/how-to-play.css", "public/how-to-play.js"]) {
  if (!existsSync(asset)) throw new Error(`HAZE build verification failed: missing ${asset}`);
}

const publicOrigin = "https://survivethehaze.netlify.app";
let productionHtml = html.replaceAll("https://haze.ksmostofa576.workers.dev", publicOrigin);
productionHtml = productionHtml.replace(
  "</head>",
  '<link rel="stylesheet" href="/how-to-play.css"/>\n</head>',
);
productionHtml = productionHtml.replace(
  "</body>",
  '<script src="/how-to-play.js"></script>\n</body>',
);

if (!productionHtml.includes('href="/how-to-play.css"') || !productionHtml.includes('src="/how-to-play.js"')) {
  throw new Error("HAZE build verification failed: How to Play enhancement was not injected.");
}
if (!productionHtml.includes(`<link rel="canonical" href="${publicOrigin}/"/>`)) {
  throw new Error("HAZE build verification failed: public canonical domain was not applied.");
}

rmSync("dist", { recursive: true, force: true });
cpSync("public", "dist", { recursive: true });
writeFileSync("dist/index.html", productionHtml);
mkdirSync("dist/vendor", { recursive: true });
copyFileSync(threeSource, "dist/vendor/three.min.js");

console.log(`HAZE build verified: ${html.length} source chars → dist/index.html`);
