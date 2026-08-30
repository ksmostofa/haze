const skus=['100000104066c','100000144279c','100000104066','100000144279'];
const api='https://api.spectrumcustomizer.com';
const cdn='https://cdn.spectrumcustomizer.com';

async function get(url){
  const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0'}});
  const text=await r.text();
  console.log('\nGET',r.status,r.headers.get('content-type'),url,'\n',text.slice(0,12000));
  let json=null; try{json=JSON.parse(text)}catch{}
  return {r,text,json};
}

const handles=[];
for(const sku of skus){
  const x=await get(`${api}/api/external/stanley/products/from-sku/${sku}`);
  if(Array.isArray(x.json)) for(const h of x.json) if(typeof h==='string') handles.push({sku,handle:h});
}
console.log('\nRESOLVED_HANDLES',JSON.stringify(handles));

for(const {sku,handle} of handles){
  const ps=await get(`${api}/api/productsets/handle/product/${handle}`);
  const productSetHandle=typeof ps.json==='string'?ps.json:ps.json?.contents?.handle||ps.text.replace(/^"|"$/g,'').trim();
  console.log('PRODUCTSET',sku,handle,productSetHandle);
  if(!productSetHandle) continue;
  const abbrev=await get(`${api}/api/productsets/abbreviated/${productSetHandle}`);
  const clientCandidates=['stanley','stanley1913','production','default'];
  for(const client of clientCandidates){
    const sceneUrl=`${cdn}/webgl/client/stanley/scenelib/${client}/${productSetHandle}/scene.json`;
    const s=await fetch(sceneUrl,{headers:{'user-agent':'Mozilla/5.0'}});
    const st=await s.text();
    console.log('\nSCENE_TRY',s.status,s.headers.get('content-type'),sceneUrl,'\n',st.slice(0,20000));
    if(s.ok){
      let sj=null; try{sj=JSON.parse(st)}catch{}
      if(sj){
        console.log('SCENE_KEYS',Object.keys(sj));
        const strings=[];
        const walk=(v,path='')=>{if(typeof v==='string'){if(/\.(?:json|bin|png|jpg|jpeg|webp|ktx|dds|obj|gltf|glb)(?:\?|$)/i.test(v)||/asset|model|mesh/i.test(path)) strings.push(`${path} = ${v}`)}else if(Array.isArray(v))v.forEach((x,i)=>walk(x,`${path}[${i}]`));else if(v&&typeof v==='object')for(const [k,x] of Object.entries(v))walk(x,path?`${path}.${k}`:k)};
        walk(sj);
        console.log('SCENE_ASSET_STRINGS\n'+strings.slice(0,500).join('\n'));
      }
      break;
    }
  }
}
