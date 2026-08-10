const JSON_HEADERS={"content-type":"application/json; charset=utf-8","cache-control":"no-store"};
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:JSON_HEADERS});}

const EXPECTED_BUILD="haze-20260811-global-v1",EXPECTED_KILLS=69,MIN_RUN_MS=30000,MAX_RUN_MS=7200000;
function validPlayerId(v){return typeof v==="string"&&v.length>=16&&v.length<=80&&/^[A-Za-z0-9_-]+$/.test(v);}
function b64url(bytes){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
function unb64url(s){s=s.replace(/-/g,"+").replace(/_/g,"/");while(s.length%4)s+="=";const bin=atob(s),a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return a;}
async function sign(secret,text){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return b64url(new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(text))));}
function sameText(a,b){if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0;}
async function verifyToken(secret,token){if(typeof token!=="string")return null;const p=token.split(".");if(p.length!==2)return null;const expected=await sign(secret,p[0]);if(!sameText(expected,p[1]))return null;try{return JSON.parse(new TextDecoder().decode(unb64url(p[0])));}catch{return null;}}
function encodePayload(obj){return b64url(new TextEncoder().encode(JSON.stringify(obj)));}
export async function onRequestPost({request,env}){
  if(!env.RUN_SIGNING_SECRET)return json({error:"Leaderboard signing secret is not configured"},503);
  let body;try{body=await request.json();}catch{return json({error:"Invalid JSON"},400);}
  if(!validPlayerId(body.playerId))return json({error:"Invalid player ID"},400);
  if(body.build!==EXPECTED_BUILD)return json({error:"Game build is not eligible for ranked play"},409);
  const score=Number(body.score),kills=Number(body.kills);
  if(!Number.isInteger(score)||score<5000||score>20000)return json({error:"Score failed validation"},400);
  if(kills!==EXPECTED_KILLS)return json({error:"Run did not contain the expected number of kills"},400);
  const run=await verifyToken(env.RUN_SIGNING_SECRET,body.runToken);
  if(!run||run.v!==1||run.playerId!==body.playerId||run.build!==EXPECTED_BUILD)return json({error:"Run token is invalid"},403);
  const completedAt=Date.now(),elapsed=completedAt-Number(run.startedAt);
  if(!Number.isFinite(elapsed)||elapsed<MIN_RUN_MS||elapsed>MAX_RUN_MS)return json({error:"Run time failed validation"},400);
  const proof={v:2,playerId:body.playerId,build:EXPECTED_BUILD,runNonce:run.nonce,completedAt,elapsedMs:Math.round(elapsed),score,kills};
  const encoded=encodePayload(proof),signature=await sign(env.RUN_SIGNING_SECRET,encoded);
  return json({completionToken:encoded+"."+signature,officialTimeMs:proof.elapsedMs});
}
export function onRequest(){return json({error:"Method not allowed"},405);}
