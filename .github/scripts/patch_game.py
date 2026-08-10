from pathlib import Path

p = Path('index.html')
s = p.read_text(encoding='utf-8')

def replace_once(old, new, label):
    global s
    count = s.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, found {count}')
    s = s.replace(old, new, 1)

replace_once(
    'let rankedRunToken=null,rankedRunPromise=null,rankedRunSeq=0,turnstileWidget=null,turnstileSiteKey=null,submitBusy=false;',
    'let rankedRunToken=null,rankedRunPromise=null,rankedRunSeq=0,rankedCompletionToken=null,rankedCompletionPromise=null,turnstileWidget=null,turnstileSiteKey=null,submitBusy=false;',
    'rank state',
)

replace_once(
'''function beginRankedRun(){
  const seq=++rankedRunSeq;rankedRunToken=null;
  rankedRunPromise=apiJSON("/api/run/start",{method:"POST",body:JSON.stringify({playerId:PLAYER_ID,build:BUILD_ID})})
    .then(data=>{if(seq===rankedRunSeq)rankedRunToken=data.runToken;return seq===rankedRunSeq?data.runToken:null;})
    .catch(()=>null);
  return rankedRunPromise;
}''',
'''function beginRankedRun(){
  const seq=++rankedRunSeq;rankedRunToken=null;rankedCompletionToken=null;rankedCompletionPromise=null;
  rankedRunPromise=apiJSON("/api/run/start",{method:"POST",body:JSON.stringify({playerId:PLAYER_ID,build:BUILD_ID})})
    .then(data=>{if(seq===rankedRunSeq)rankedRunToken=data.runToken;return seq===rankedRunSeq?data.runToken:null;})
    .catch(()=>null);
  return rankedRunPromise;
}
async function completeRankedRun(){
  if(rankedCompletionToken)return rankedCompletionToken;
  if(rankedCompletionPromise)return rankedCompletionPromise;
  rankedCompletionPromise=(async()=>{
    let runToken=rankedRunToken;if(!runToken&&rankedRunPromise)runToken=await rankedRunPromise;if(!runToken)throw new Error("This run could not be verified. Try another run.");
    const data=await apiJSON("/api/run/complete",{method:"POST",body:JSON.stringify({runToken,playerId:PLAYER_ID,score:GS.score|0,kills:GS.kills|0,build:BUILD_ID})});
    rankedCompletionToken=data.completionToken;$("vTime").textContent=fmtMs(data.officialTimeMs);return rankedCompletionToken;
  })().catch(e=>{rankedCompletionPromise=null;throw e;});
  return rankedCompletionPromise;
}''',
    'complete function',
)

replace_once(
'''    saveName(name);let runToken=rankedRunToken;if(!runToken&&rankedRunPromise)runToken=await rankedRunPromise;if(!runToken)throw new Error("This run could not be verified. Try another run.");
    const data=await apiJSON("/api/run/finish",{method:"POST",body:JSON.stringify({runToken,playerId:PLAYER_ID,name,score:GS.score|0,kills:GS.kills|0,turnstileToken,build:BUILD_ID})});''',
'''    saveName(name);const completionToken=await completeRankedRun();
    const data=await apiJSON("/api/run/finish",{method:"POST",body:JSON.stringify({completionToken,playerId:PLAYER_ID,name,turnstileToken,build:BUILD_ID})});''',
    'finish payload',
)

replace_once(
'''    if(!rankedRunToken&&rankedRunPromise)rankedRunToken=await rankedRunPromise;if(!rankedRunToken)throw new Error("This run could not be verified. Try another run.");
    const [sitekey]=await Promise.all([getTurnstileSiteKey(),loadTurnstileScript()]);''',
'''    await completeRankedRun();
    const [sitekey]=await Promise.all([getTurnstileSiteKey(),loadTurnstileScript()]);''',
    'submit prep',
)

replace_once(
'''    $("vScore").textContent=GS.score.toLocaleString();$("vKills").textContent=GS.kills;$("vTime").textContent=fmtPrecise(GS.time);
    $("vrating").textContent="— "+rating(true)+" —";$("victoryRank").textContent="Global rank —";$("victoryBest").textContent="Submit this victory to the global leaderboard";''',
'''    $("vScore").textContent=GS.score.toLocaleString();$("vKills").textContent=GS.kills;$("vTime").textContent=fmtPrecise(GS.time);
    completeRankedRun().catch(()=>{});
    $("vrating").textContent="— "+rating(true)+" —";$("victoryRank").textContent="Global rank —";$("victoryBest").textContent="Submit this victory to the global leaderboard";''',
    'victory freeze',
)

p.write_text(s, encoding='utf-8')
print(f'Patched index.html: {len(s.encode())} bytes')
