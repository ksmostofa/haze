const JSON_HEADERS={"content-type":"application/json; charset=utf-8","cache-control":"no-store"};
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:JSON_HEADERS});}
const EXPECTED_BUILD="haze-20260811-global-v1";
function validPlayerId(v){return typeof v==="string"&&v.length>=16&&v.length<=80&&/^[A-Za-z0-9_-]+$/.test(v);}
function b64url(bytes){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
async function sign(secret,text){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return b64url(new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(text))));}
function encodePayload(obj){return b64url(new TextEncoder().encode(JSON.stringify(obj)));}
export async function onRequestPost({request,env}){
  if(!env.RUN_SIGNING_SECRET)return json({error:"Leaderboard signing secret is not configured"},503);
  let body;try{body=await request.json();}catch(e){return json({error:"Invalid JSON"},400);}
  if(!validPlayerId(body.playerId))return json({error:"Invalid player ID"},400);
  if(body.build!==EXPECTED_BUILD)return json({error:"Game build is not eligible for ranked play"},409);
  const payload={v:1,playerId:body.playerId,startedAt:Date.now(),nonce:crypto.randomUUID(),build:EXPECTED_BUILD};
  const encoded=encodePayload(payload),signature=await sign(env.RUN_SIGNING_SECRET,encoded);
  return json({runToken:encoded+"."+signature,startedAt:payload.startedAt});
}
export function onRequest(){return json({error:"Method not allowed"},405);}
