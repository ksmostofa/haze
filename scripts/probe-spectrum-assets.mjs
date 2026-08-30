const api='https://api.spectrumcustomizer.com';
const cdn='https://cdn.spectrumcustomizer.com';
const shop='https://www.stanley1913.com';

async function get(url){
  const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0','accept':'application/json,text/plain,*/*'}});
  const text=await r.text();
  console.log('\nGET',r.status,r.headers.get('content-type'),url,'\n',text.slice(0,24000));
  let json=null; try{json=JSON.parse(text)}catch{}
  return {r,text,json};
}

// Stanley's current PDP maps regular Black 2.0 variant -> hidden Create variant and then passes
// the CREATE SHOPIFY VARIANT ID to Spectrum's historically named /from-sku/ endpoint.
const regularVariantId='44559859712127';
const createVariantId='44559897460863';
const variantIds=[createVariantId,regularVariantId];
const identifiers=[createVariantId];
for(const id of variantIds){
  for(const url of [`${shop}/variants/${id}.js`,`${shop}/products/adventure-quencher-travel-tumbler-40-oz.js?variant=${id}`]){
    const x=await get(url);
    if(x.json?.sku) identifiers.push(x.json.sku);
    if(Array.isArray(x.json?.variants)) for(const v of x.json.variants) if(String(v.id)===id&&v.sku) identifiers.push(v.sku);
  }
}
identifiers.push('100000104066c','100000144279c','100000104066','100000144279');
console.log('IDENTIFIER_CANDIDATES',JSON.stringify([...new Set(identifiers)]));

const handles=[];
for(const identifier of [...new Set(identifiers)]){
  const x=await get(`${api}/api/external/stanley/products/from-sku/${encodeURIComponent(identifier.toLowerCase())}`);
  if(Array.isArray(x.json)) for(const h of x.json) if(typeof h==='string') handles.push({identifier,handle:h});
}
console.log('\nRESOLVED_HANDLES',JSON.stringify(handles));

for(const {identifier,handle} of handles){
  const ps=await get(`${api}/api/productsets/handle/product/${handle}`);
  const productSetHandle=typeof ps.json==='string'?ps.json:ps.json?.contents?.handle||ps.text.replace(/^"|"$/g,'').trim();
  console.log('PRODUCTSET',identifier,handle,productSetHandle);
  if(!productSetHandle) continue;
  const abbrev=await get(`${api}/api/productsets/abbreviated/${productSetHandle}`);
  const groupHandles=abbrev.json?.contents?.productGroups?.flatMap(g=>g.productHandles)||[];
  console.log('GROUP_HANDLES',JSON.stringify(groupHandles));

  // Search plausible client/scenelib folders; log the first successful official scene.
  const clientCandidates=['stanley','stanley1913','production','default'];
  for(const client of clientCandidates){
    const sceneUrl=`${cdn}/webgl/client/stanley/scenelib/${client}/${productSetHandle}/scene.json`;
    const s=await fetch(sceneUrl,{headers:{'user-agent':'Mozilla/5.0'}});
    const st=await s.text();
    console.log('\nSCENE_TRY',s.status,s.headers.get('content-type'),sceneUrl,'\n',st.slice(0,32000));
    if(s.ok){
      let sj=null; try{sj=JSON.parse(st)}catch{}
      if(sj){
        const strings=[];
        const walk=(v,path='')=>{if(typeof v==='string'){if(/\.(?:json|bin|png|jpg|jpeg|webp|ktx|dds|obj|gltf|glb)(?:\?|$)/i.test(v)||/asset|model|mesh|geometry|uri|url|path/i.test(path)) strings.push(`${path} = ${v}`)}else if(Array.isArray(v))v.forEach((x,i)=>walk(x,`${path}[${i}]`));else if(v&&typeof v==='object')for(const [k,x] of Object.entries(v))walk(x,path?`${path}.${k}`:k)};
        walk(sj);
        console.log('OFFICIAL_SCENE_URL',sceneUrl);
        console.log('SCENE_KEYS',Object.keys(sj));
        console.log('SCENE_ASSET_STRINGS\n'+strings.slice(0,1500).join('\n'));
      }
      break;
    }
  }
}
