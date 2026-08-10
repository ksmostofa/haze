import { readdirSync, readFileSync, mkdirSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const files = readdirSync('assets')
  .filter((f) => /^game\.\d+\.b64$/.test(f))
  .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

if (!files.length) throw new Error('No HAZE payload chunks found.');

let html = null;
let used = 0;
let payload = '';
for (let i = 0; i < files.length; i++) {
  payload += readFileSync(`assets/${files[i]}`, 'utf8').replace(/\s+/g, '');
  try {
    const candidate = gunzipSync(Buffer.from(payload, 'base64')).toString('utf8');
    if (candidate.length > 150000 && /<title>HAZE<\/title>/i.test(candidate) && candidate.includes('BUILD_ID="haze-20260811-global-v1"')) {
      html = candidate;
      used = i + 1;
      break;
    }
  } catch {}
}

if (!html) throw new Error('Could not reconstruct a valid HAZE HTML document from payload chunks.');

const oldSubmit = `    const [sitekey]=await Promise.all([getTurnstileSiteKey(),loadTurnstileScript()]);\n    if(turnstileWidget==null){turnstileWidget=turnstile.render("#turnstileBox",{sitekey,theme:"dark",appearance:"interaction-only",execution:"execute",action:"haze_score",callback:(token)=>{submitBusy=false;$("vSubmit").disabled=false;submitVictoryWithToken(token);},"error-callback":()=>{submitBusy=false;$("vSubmit").disabled=false;setSubmitStatus("Verification failed. Try again.",true);}});}\n    submitBusy=false;$("vSubmit").disabled=false;setSubmitStatus("Verifying…");turnstile.execute(turnstileWidget);`;
const newSubmit = `    const sitekey=await getTurnstileSiteKey();\n    if(!sitekey){submitBusy=false;$("vSubmit").disabled=false;return submitVictoryWithToken("");}\n    await loadTurnstileScript();\n    if(turnstileWidget==null){turnstileWidget=turnstile.render("#turnstileBox",{sitekey,theme:"dark",appearance:"interaction-only",execution:"execute",action:"haze_score",callback:(token)=>{submitBusy=false;$("vSubmit").disabled=false;submitVictoryWithToken(token);},"error-callback":()=>{submitBusy=false;$("vSubmit").disabled=false;setSubmitStatus("Verification failed. Try again.",true);}});}\n    submitBusy=false;$("vSubmit").disabled=false;setSubmitStatus("Verifying…");turnstile.execute(turnstileWidget);`;
if (html.includes(oldSubmit)) html = html.replace(oldSubmit, newSubmit);

mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', html);
if (existsSync('manifest.webmanifest')) copyFileSync('manifest.webmanifest', 'dist/manifest.webmanifest');
console.log(`HAZE build complete: ${html.length} chars, reconstructed from ${used}/${files.length} payload chunks.`);
