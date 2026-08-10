import { readFileSync, mkdirSync, writeFileSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

// The ChatGPT GitHub connector could not transfer the ~159 KB HTML in one
// contents write, so the compressed source is stored in four deterministic
// transfer chunks. They are concatenated only at build time; players receive
// a normal, single dist/index.html and never see/decode these chunks.
const chunkPaths = [0, 1, 2, 3].map(i => `assets/game.${i}.b64`);
const payload = chunkPaths
  .map(path => readFileSync(path, 'utf8').replace(/\s+/g, ''))
  .join('');

let html;
try {
  html = gunzipSync(Buffer.from(payload, 'base64')).toString('utf8');
} catch (error) {
  throw new Error(`Could not decode HAZE source payload: ${error.message}`);
}

const required = [
  '<title>HAZE</title>',
  'BUILD_ID="haze-20260811-global-v1"',
  'entryGate',
  'requestFullscreen',
  'rankedCompletionToken',
  'completeRankedRun',
  '/api/leaderboard',
  '/api/run/start',
  '/api/run/complete',
  '/api/run/finish',
  'const sitekey=await getTurnstileSiteKey();'
];
for (const marker of required) {
  if (!html.includes(marker)) throw new Error(`HAZE build verification failed: missing ${marker}`);
}
if (html.length < 150000) {
  throw new Error(`HAZE build verification failed: HTML unexpectedly small (${html.length} chars).`);
}

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', html);
if (existsSync('manifest.webmanifest')) {
  copyFileSync('manifest.webmanifest', 'dist/manifest.webmanifest');
}

console.log(`HAZE build verified: ${html.length} chars from ${chunkPaths.length} transfer chunks → dist/index.html`);
