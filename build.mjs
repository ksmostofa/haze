import { readdirSync, readFileSync, mkdirSync, writeFileSync, copyFileSync, existsSync, rmSync } from 'node:fs';
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

function replaceRequired(from, to, label) {
  if (!html.includes(from)) throw new Error(`HAZE build patch not found: ${label}`);
  html = html.replace(from, to);
}

replaceRequired(
  'let rankedRunToken=null,rankedRunPromise=null,rankedRunSeq=0,turnstileWidget=null,turnstileSiteKey=null,submitBusy=false;',
  'let rankedRunToken=null,rankedRunPromise=null,rankedCompletionToken=null,rankedCompletePromise=null,rankedRunSeq=0,turnstileWidget=null,turnstileSiteKey=null,submitBusy=false;',
  'ranked state'
);

replaceRequired(
`function beginRankedRun(){
  const seq=++rankedRunSeq;rankedRunToken=null;
  rankedRunPromise=apiJSON("/api/run/start",{method:"POST",body:JSON.stringify({playerId:PLAYER_ID,build:BUILD_ID})})
    .then(data=>{if(seq===rankedRunSeq)rankedRunToken=data.runToken;return seq===rankedRunSeq?data.runToken:null;})
    .catch(()=>null);
  return rankedRunPromise;
}
`,
`function beginRankedRun(){
  const seq=++rankedRunSeq;rankedRunToken=null;rankedCompletionToken=null;rankedCompletePromise=null;
  rankedRunPromise=apiJSON("/api/run/start",{method:"POST",body:JSON.stringify({playerId:PLAYER_ID,build:BUILD_ID})})
    .then(data=>{if(seq===rankedRunSeq)rankedRunToken=data.runToken;return seq===rankedRunSeq?data.runToken:null;})
    .catch(()=>null);
  return rankedRunPromise;
}
async function completeRankedRun(){
  if(rankedCompletionToken)return rankedCompletionToken;
  if(rankedCompletePromise)return rankedCompletePromise;
  const seq=rankedRunSeq;
  rankedCompletePromise=(async()=>{
    let runToken=rankedRunToken;if(!runToken&&rankedRunPromise)runToken=await rankedRunPromise;if(!runToken)throw new Error("This run could not be verified. Try another run.");
    const data=await apiJSON("/api/run/complete",{method:"POST",body:JSON.stringify({runToken,playerId:PLAYER_ID,score:GS.score|0,kills:GS.kills|0,build:BUILD_ID})});
    if(seq!==rankedRunSeq)return null;
    rankedCompletionToken=data.completionToken;
    if(Number.isFinite(data.officialTimeMs))$("vTime").textContent=fmtMs(data.officialTimeMs);
    return rankedCompletionToken;
  })().catch(err=>{if(seq===rankedRunSeq)rankedCompletePromise=null;throw err;});
  return rankedCompletePromise;
}
`,
  'rank completion flow'
);

replaceRequired(
`    saveName(name);let runToken=rankedRunToken;if(!runToken&&rankedRunPromise)runToken=await rankedRunPromise;if(!runToken)throw new Error("This run could not be verified. Try another run.");
    const data=await apiJSON("/api/run/finish",{method:"POST",body:JSON.stringify({runToken,playerId:PLAYER_ID,name,score:GS.score|0,kills:GS.kills|0,turnstileToken,build:BUILD_ID})});`,
`    saveName(name);let completionToken=rankedCompletionToken;if(!completionToken)completionToken=await completeRankedRun();if(!completionToken)throw new Error("This run could not be verified. Try another run.");
    const data=await apiJSON("/api/run/finish",{method:"POST",body:JSON.stringify({completionToken,playerId:PLAYER_ID,name,turnstileToken,build:BUILD_ID})});`,
  'finish submission'
);

replaceRequired(
`    if(!rankedRunToken&&rankedRunPromise)rankedRunToken=await rankedRunPromise;if(!rankedRunToken)throw new Error("This run could not be verified. Try another run.");
    const [sitekey]=await Promise.all([getTurnstileSiteKey(),loadTurnstileScript()]);
    if(turnstileWidget==null){turnstileWidget=turnstile.render("#turnstileBox",{sitekey,theme:"dark",appearance:"interaction-only",execution:"execute",action:"haze_score",callback:(token)=>{submitBusy=false;$("vSubmit").disabled=false;submitVictoryWithToken(token);},"error-callback":()=>{submitBusy=false;$("vSubmit").disabled=false;setSubmitStatus("Verification failed. Try again.",true);}});}
    submitBusy=false;$("vSubmit").disabled=false;setSubmitStatus("Verifying…");turnstile.execute(turnstileWidget);`,
`    if(!rankedCompletionToken)await completeRankedRun();if(!rankedCompletionToken)throw new Error("This run could not be verified. Try another run.");
    const sitekey=await getTurnstileSiteKey();
    if(!sitekey){submitBusy=false;$("vSubmit").disabled=false;return submitVictoryWithToken("");}
    await loadTurnstileScript();
    if(turnstileWidget==null){turnstileWidget=turnstile.render("#turnstileBox",{sitekey,theme:"dark",appearance:"interaction-only",execution:"execute",action:"haze_score",callback:(token)=>{submitBusy=false;$("vSubmit").disabled=false;submitVictoryWithToken(token);},"error-callback":()=>{submitBusy=false;$("vSubmit").disabled=false;setSubmitStatus("Verification failed. Try again.",true);}});}
    submitBusy=false;$("vSubmit").disabled=false;setSubmitStatus("Verifying…");turnstile.execute(turnstileWidget);`,
  'optional Turnstile flow'
);

replaceRequired(
`    $("vScore").textContent=GS.score.toLocaleString();$("vKills").textContent=GS.kills;$("vTime").textContent=fmtPrecise(GS.time);
    $("vrating").textContent="— "+rating(true)+" —";$("victoryRank").textContent="Global rank —";$("victoryBest").textContent="Submit this victory to the global leaderboard";`,
`    $("vScore").textContent=GS.score.toLocaleString();$("vKills").textContent=GS.kills;$("vTime").textContent=fmtPrecise(GS.time);
    rankedCompletePromise=completeRankedRun().catch(()=>null);
    $("vrating").textContent="— "+rating(true)+" —";$("victoryRank").textContent="Global rank —";$("victoryBest").textContent="Submit this victory to the global leaderboard";`,
  'freeze time on victory'
);

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', html);
if (existsSync('manifest.webmanifest')) copyFileSync('manifest.webmanifest', 'dist/manifest.webmanifest');
console.log(`HAZE build complete: ${html.length} chars, reconstructed from ${used}/${files.length} payload chunks.`);
