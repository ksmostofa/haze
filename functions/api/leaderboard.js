const JSON_HEADERS={"content-type":"application/json; charset=utf-8","cache-control":"no-store"};
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:JSON_HEADERS});}
function validPlayerId(v){return typeof v==="string"&&v.length>=16&&v.length<=80&&/^[A-Za-z0-9_-]+$/.test(v);}
async function rankFor(db,row){const q=`SELECT COUNT(*) AS n FROM leaderboard WHERE time_ms < ?1 OR (time_ms = ?1 AND score > ?2) OR (time_ms = ?1 AND score = ?2 AND kills > ?3)`;const r=await db.prepare(q).bind(row.time_ms,row.score,row.kills).first();return Number(r?.n||0)+1;}
export async function onRequestGet({request,env}){
  if(!env.DB)return json({error:"Leaderboard database is not configured"},503);
  const url=new URL(request.url),playerId=url.searchParams.get("playerId")||"",hasPlayer=validPlayerId(playerId);
  const q="SELECT player_id,name,time_ms,score,kills FROM leaderboard ORDER BY time_ms ASC,score DESC,kills DESC,player_id ASC LIMIT 10";
  const {results=[]}=await env.DB.prepare(q).all();let last=null,rank=0;
  const leaders=results.map((r,i)=>{const key=`${r.time_ms}|${r.score}|${r.kills}`;if(key!==last){rank=i+1;last=key;}return{rank,name:r.name,timeMs:r.time_ms,score:r.score,kills:r.kills,isYou:hasPlayer&&r.player_id===playerId};});
  let player=null;if(hasPlayer){const row=await env.DB.prepare("SELECT name,time_ms,score,kills FROM leaderboard WHERE player_id=?1").bind(playerId).first();if(row){player={rank:await rankFor(env.DB,row),name:row.name,timeMs:row.time_ms,score:row.score,kills:row.kills};}}
  return json({leaders,player});
}
export function onRequest(){return json({error:"Method not allowed"},405);}
