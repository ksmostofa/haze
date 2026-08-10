const JSON_HEADERS={"content-type":"application/json; charset=utf-8","cache-control":"no-store"};
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:JSON_HEADERS});}
const EXPECTED_BUILD="haze-20260811-global-v1",EXPECTED_KILLS=69,MIN_RUN_MS=30000,MAX_RUN_MS=7200000;
function validPlayerId(v){return typeof v==="string"&&v.length>=16&&v.length<=80&&/^[A-Za-z0-9_-]+$/.test(v);}
function cleanName(v){if(typeof v!=="string")return null;v=v.normalize("NFKC").trim().replace(/\s+/g," ");if(v.length<1||v.length>16||/[\u0000-\u001F\u007F]/.test(v))return null;return v;}
function b64url(bytes){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
function unb64url(s){s=s.replace(/-/g,"+").replace(/_/g,"/");while(s.length%4)s+="=";const bin=atob(s),a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return a;}
async function sign(secret,text){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return b64url(new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(text))));}
function sameText(a,b){if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0;}
async function verifyRun(secret,token){if(typeof token!=="string")return null;const p=token.split(".");if(p.length!==2)return null;const expected=await sign(secret,p[0]);if(!sameText(expected,p[1]))return null;try{return JSON.parse(new TextDecoder().decode(unb64url(p[0])));}catch(e){return null;}}
async function verifyTurnstile(secret,token,request){if(!secret||!token)return false;const form=new FormData();form.append("secret",secret);form.append("response",token);const ip=request.headers.get("CF-Connecting-IP");if(ip)form.append("remoteip",ip);const r=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{method:"POST",body:form});if(!r.ok)return false;const d=await r.json();return d.success===true&&(!d.action||d.action==="haze_score");}
function betterClause(prefix="excluded"){return `(${prefix}.time_ms < leaderboard.time_ms OR (${prefix}.time_ms = leaderboard.time_ms AND ${prefix}.score > leaderboard.score) OR (${prefix}.time_ms = leaderboard.time_ms AND ${prefix}.score = leaderboard.score AND ${prefix}.kills > leaderboard.kills))`;}
async function rankFor(db,row){const q=`SELECT COUNT(*) AS n FROM leaderboard WHERE time_ms < ?1 OR (time_ms = ?1 AND score > ?2) OR (time_ms = ?1 AND score = ?2 AND kills > ?3)`;const r=await db.prepare(q).bind(row.time_ms,row.score,row.kills).first();return Number(r?.n||0)+1;}
export async function onRequestPost({request,env}){
  if(!env.DB)return json({error:"Leaderboard database is not configured"},503);
  if(!env.RUN_SIGNING_SECRET||!env.TURNSTILE_SECRET)return json({error:"Leaderboard security is not configured"},503);
  let body;try{body=await request.json();}catch(e){return json({error:"Invalid JSON"},400);}
  if(!validPlayerId(body.playerId))return json({error:"Invalid player ID"},400);
  const name=cleanName(body.name);if(!name)return json({error:"Name must be 1–16 visible characters"},400);
  if(body.build!==EXPECTED_BUILD)return json({error:"Game build is not eligible for ranked play"},409);
  const score=Number(body.score),kills=Number(body.kills);if(!Number.isInteger(score)||score<5000||score>20000)return json({error:"Score failed validation"},400);if(kills!==EXPECTED_KILLS)return json({error:"Run did not contain the expected number of kills"},400);
  const tsOk=await verifyTurnstile(env.TURNSTILE_SECRET,body.turnstileToken,request);if(!tsOk)return json({error:"Verification failed or expired"},403);
  const run=await verifyRun(env.RUN_SIGNING_SECRET,body.runToken);if(!run||run.v!==1||run.playerId!==body.playerId||run.build!==EXPECTED_BUILD)return json({error:"Run token is invalid"},403);
  const now=Date.now(),elapsed=now-Number(run.startedAt);if(!Number.isFinite(elapsed)||elapsed<MIN_RUN_MS||elapsed>MAX_RUN_MS)return json({error:"Run time failed validation"},400);
  const before=await env.DB.prepare("SELECT time_ms,score,kills FROM leaderboard WHERE player_id=?1").bind(body.playerId).first();
  const condition=betterClause();
  const sql=`INSERT INTO leaderboard(player_id,name,time_ms,score,kills,updated_at) VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(player_id) DO UPDATE SET name=excluded.name,time_ms=CASE WHEN ${condition} THEN excluded.time_ms ELSE leaderboard.time_ms END,score=CASE WHEN ${condition} THEN excluded.score ELSE leaderboard.score END,kills=CASE WHEN ${condition} THEN excluded.kills ELSE leaderboard.kills END,updated_at=excluded.updated_at`;
  await env.DB.prepare(sql).bind(body.playerId,name,Math.round(elapsed),score,kills,now).run();
  const row=await env.DB.prepare("SELECT name,time_ms,score,kills FROM leaderboard WHERE player_id=?1").bind(body.playerId).first();
  const rank=await rankFor(env.DB,row);const personalBest=!before||row.time_ms!==before.time_ms||row.score!==before.score||row.kills!==before.kills;
  return json({accepted:true,personalBest,rank,officialTimeMs:Math.round(elapsed),best:{name:row.name,timeMs:row.time_ms,score:row.score,kills:row.kills}});
}
export function onRequest(){return json({error:"Method not allowed"},405);}
