const JSON_HEADERS={"content-type":"application/json; charset=utf-8","cache-control":"no-store"};
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:JSON_HEADERS});}

export function onRequestGet({env}){if(!env.TURNSTILE_SITE_KEY)return json({error:"Turnstile site key is not configured"},503);return json({turnstileSiteKey:env.TURNSTILE_SITE_KEY});}
export function onRequest(){return json({error:"Method not allowed"},405);}
