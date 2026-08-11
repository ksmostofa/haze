import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const source = "public/index.html";
const html = readFileSync(source, "utf8");
const required = [
  "<title>HAZE — Survive the Night</title>",
  'BUILD_ID="haze-20260811-global-v1"',
  "entryGate", "requestGameFullscreen", "runProof", "completeRankedRun",
  "/api/leaderboard", "/api/run/start", "/api/run/complete", "/api/run/finish",
  'src="/vendor/three.min.js"', 'property="og:image"', 'rel="icon"',
];
for (const marker of required) if (!html.includes(marker)) throw new Error(`HAZE build verification failed: missing ${marker}`);
for (const forbidden of ["window.__HAZE", "?debug=1", "unpkg.com", "cdnjs.cloudflare.com", "API_ORIGIN"]) {
  if (html.includes(forbidden)) throw new Error(`HAZE build verification failed: forbidden source marker ${forbidden}`);
}
if (html.length < 150_000) throw new Error(`HAZE build verification failed: HTML unexpectedly small (${html.length} chars).`);

const threeSource = "node_modules/three/build/three.min.js";
if (!existsSync(threeSource)) throw new Error("Three.js dependency is missing; run npm ci first.");
for (const asset of ["public/how-to-play.css", "public/how-to-play.js"]) if (!existsSync(asset)) throw new Error(`HAZE build verification failed: missing ${asset}`);

const publicOrigin = "https://survivethehaze.netlify.app";
const cloudflareOrigin = "https://haze.ksmostofa576.workers.dev";
let productionHtml = html.replaceAll(cloudflareOrigin, publicOrigin);

function replaceOnce(from, to, label) {
  const count = productionHtml.split(from).length - 1;
  if (count !== 1) throw new Error(`HAZE production transform ${label}: expected one match, found ${count}`);
  productionHtml = productionHtml.replace(from, to);
}

// One adaptive frontend, not separate mobile/desktop builds. Low-power/touch
// devices preserve gameplay but avoid the GPU work most likely to cause frame spikes.
replaceOnce(
  'const $=id=>document.getElementById(id);',
  `const $=id=>document.getElementById(id);\nconst PERF_PROFILE=(()=>{\n  const touch=(navigator.maxTouchPoints||0)>0||matchMedia("(pointer:coarse)").matches||matchMedia("(hover:none)").matches;\n  const cores=navigator.hardwareConcurrency||4,mem=navigator.deviceMemory||4;\n  const low=touch||cores<=4||mem<=4;\n  return {touch,low,touchDpr:1,desktopDpr:1.45,pixelRatio:Math.min(devicePixelRatio,low?1:1.45),groundSegments:low?82:124,farTrees:low?18:34,grassTufts:low?62:92,dust:low?96:160,rain:low?620:1050};\n})();`,
  "performance profile",
);
replaceOnce('try{renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance"});}','try{renderer=new THREE.WebGLRenderer({antialias:!PERF_PROFILE.low,powerPreference:"high-performance",stencil:false});}',"renderer options");
replaceOnce('renderer.setPixelRatio(Math.min(devicePixelRatio,1.8));','renderer.setPixelRatio(PERF_PROFILE.pixelRatio);',"initial DPR");
replaceOnce('renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;','renderer.shadowMap.enabled=!PERF_PROFILE.low; renderer.shadowMap.type=THREE.PCFShadowMap;',"shadow mode");
replaceOnce('const S=260, geo=new THREE.PlaneGeometry(S,S,150,150), p=geo.attributes.position;','const S=260, geo=new THREE.PlaneGeometry(S,S,PERF_PROFILE.groundSegments,PERF_PROFILE.groundSegments), p=geo.attributes.position;',"ground tessellation");
replaceOnce('const nB=4+((Math.random()*4)|0);','const nB=PERF_PROFILE.low?3+((Math.random()*3)|0):4+((Math.random()*4)|0);',"branch density");
replaceOnce('for(let i=0,n=7+((Math.random()*7)|0);i<n;i++){','for(let i=0,n=PERF_PROFILE.low?5+((Math.random()*5)|0):7+((Math.random()*7)|0);i<n;i++){',"canopy density");
replaceOnce('const count=54-ring*4, base=CLEARING_R+ring*7;','const count=PERF_PROFILE.low?[42,38,34][ring]:54-ring*4, base=CLEARING_R+ring*7;',"forest density");
replaceOnce('for(let i=0;i<40;i++){const a=Math.random()*6.28,r=CLEARING_R+26+Math.random()*40; tree(Math.cos(a)*r,Math.sin(a)*r,1.4+Math.random()*1.2);}','for(let i=0;i<PERF_PROFILE.farTrees;i++){const a=Math.random()*6.28,r=CLEARING_R+26+Math.random()*40; tree(Math.cos(a)*r,Math.sin(a)*r,1.4+Math.random()*1.2);}',"far forest");
replaceOnce('for(let i=0;i<100;i++){const a=Math.random()*6.28,r=7+Math.random()*(CLEARING_R-3); grassTuft(Math.cos(a)*r,Math.sin(a)*r);}','for(let i=0;i<PERF_PROFILE.grassTufts;i++){const a=Math.random()*6.28,r=7+Math.random()*(CLEARING_R-3); grassTuft(Math.cos(a)*r,Math.sin(a)*r);}',"grass density");
replaceOnce('window.__trunks=segments(trunkData,new THREE.CylinderGeometry(.16,.6,1,7),true,MAT.forestTrunk);','window.__trunks=segments(trunkData,new THREE.CylinderGeometry(.16,.6,1,7),!PERF_PROFILE.low,MAT.forestTrunk);',"trunk shadows");
replaceOnce('const canopy=new THREE.InstancedMesh(geo,MAT.forestLeaf,leafData.length);canopy.castShadow=true;canopy.receiveShadow=false;','const canopy=new THREE.InstancedMesh(geo,MAT.forestLeaf,leafData.length);canopy.castShadow=!PERF_PROFILE.low;canopy.receiveShadow=false;',"canopy shadows");
replaceOnce('const N=180,g=new THREE.BufferGeometry(),pos=new Float32Array(N*3);','const N=PERF_PROFILE.dust,g=new THREE.BufferGeometry(),pos=new Float32Array(N*3);',"dust density");
replaceOnce('const N=1200,g=new THREE.BufferGeometry(),pos=new Float32Array(N*3),vy=new Float32Array(N);','const N=PERF_PROFILE.rain,g=new THREE.BufferGeometry(),pos=new Float32Array(N*3),vy=new Float32Array(N);',"rain density");
replaceOnce('applyBrightness();\n\n/* Monochrome post:',`applyBrightness();\nlet adaptiveDpr=PERF_PROFILE.pixelRatio,perfFrames=0,perfElapsed=0,perfCooldown=0;\nfunction updateAdaptiveQuality(dt){\n  if(!PERF_PROFILE.low||GS.state!=="playing")return;\n  perfFrames++;perfElapsed+=dt;perfCooldown=Math.max(0,perfCooldown-dt);\n  if(perfElapsed<2.5||perfCooldown>0)return;\n  const fps=perfFrames/perfElapsed;let next=adaptiveDpr;\n  if(fps<44)next=Math.max(.72,adaptiveDpr-.12);else if(fps>57)next=Math.min(PERF_PROFILE.pixelRatio,adaptiveDpr+.05);\n  if(Math.abs(next-adaptiveDpr)>.01){adaptiveDpr=next;renderer.setPixelRatio(adaptiveDpr);renderer.setSize(innerWidth,innerHeight,false);perfCooldown=4;}\n  perfFrames=0;perfElapsed=0;\n}\n\n/* Monochrome post:`,"adaptive quality");
replaceOnce('  renderer.setPixelRatio(Math.min(devicePixelRatio,touchLikely?1.35:1.8));','  const cap=touchLikely?PERF_PROFILE.touchDpr:PERF_PROFILE.desktopDpr;if(adaptiveDpr>cap){adaptiveDpr=cap;renderer.setPixelRatio(adaptiveDpr);renderer.setSize(innerWidth,innerHeight,false);}',"control-mode DPR");
replaceOnce('    GS.time+=dt;\n    GS.hudTimer-=dt;','    GS.time+=dt;\n    updateAdaptiveQuality(dt);\n    GS.hudTimer-=dt;',"adaptive loop");

// Remove hot-loop garbage that causes periodic GC hitches during crowded waves.
replaceOnce(
`function segmentHitsCabinBox(ax,az,bx,bz,b,r){
  const minX=b.x-b.hx-r,maxX=b.x+b.hx+r,minZ=b.z-b.hz-r,maxZ=b.z+b.hz+r;
  let lo=0,hi=1;const dx=bx-ax,dz=bz-az;
  for(const q of [[ax,dx,minX,maxX],[az,dz,minZ,maxZ]]){
    if(Math.abs(q[1])<1e-8){if(q[0]<q[2]||q[0]>q[3])return false;continue;}
    let t0=(q[2]-q[0])/q[1],t1=(q[3]-q[0])/q[1];if(t0>t1){const t=t0;t0=t1;t1=t;}
    lo=Math.max(lo,t0);hi=Math.min(hi,t1);if(lo>hi)return false;
  }
  return hi>.001&&lo<.999;
}`,
`function segmentHitsCabinBox(ax,az,bx,bz,b,r){
  const minX=b.x-b.hx-r,maxX=b.x+b.hx+r,minZ=b.z-b.hz-r,maxZ=b.z+b.hz+r;
  let lo=0,hi=1,t0,t1,t,dx=bx-ax,dz=bz-az;
  if(Math.abs(dx)<1e-8){if(ax<minX||ax>maxX)return false;}
  else{t0=(minX-ax)/dx;t1=(maxX-ax)/dx;if(t0>t1){t=t0;t0=t1;t1=t;}lo=Math.max(lo,t0);hi=Math.min(hi,t1);if(lo>hi)return false;}
  if(Math.abs(dz)<1e-8){if(az<minZ||az>maxZ)return false;}
  else{t0=(minZ-az)/dz;t1=(maxZ-az)/dz;if(t0>t1){t=t0;t0=t1;t1=t;}lo=Math.max(lo,t0);hi=Math.min(hi,t1);if(lo>hi)return false;}
  return hi>.001&&lo<.999;
}`,
"allocation-free cabin sweep");

replaceOnce(
`function selectCabinWaypoint(e,px,pz,playerInside){
  const p=e.m.position,enemyInside=insideCabin(p.x,p.z);
  const laneClear=Math.max(0,CABIN_DOOR_HALF-e.radius-.14);
  if(e.doorLane==null){
    const pattern=((e.variant*37)%7-3)/3;
    e.doorLane=pattern*laneClear*.58;
  }
  const lane=Math.max(-laneClear,Math.min(laneClear,e.doorLane));
  const dist=(x,z)=>Math.hypot(p.x-x,p.z-z);
  const inward={x:lane*.24,z:CABIN_HALF_D-.72,routing:true,crossing:true};
  const outward={x:lane,z:CABIN_HALF_D+1.28,routing:true,crossing:true};

  if(playerInside&&!enemyInside){
    const valid=["doorRear","doorFlank","doorOuter","doorCrossIn"];
    if(!valid.includes(e.doorState)){
      e.doorSide=(p.x<-.15||(Math.abs(p.x)<.15&&e.variant%2))?-1:1;
      e.doorState=(p.z<-CABIN_HALF_D+.2&&Math.abs(p.x)<CABIN_HALF_W+1.15)?"doorRear":
        (p.z<CABIN_HALF_D+.65&&Math.abs(p.x)<CABIN_HALF_W+1.15)?"doorFlank":"doorOuter";
    }
    if(e.doorState==="doorRear"){
      const q={x:e.doorSide*(CABIN_HALF_W+1.35),z:-CABIN_HALF_D-1,routing:true,crossing:false};
      if(dist(q.x,q.z)<.62)e.doorState="doorFlank";else return q;
    }
    if(e.doorState==="doorFlank"){
      const q={x:e.doorSide*(CABIN_HALF_W+1.35),z:CABIN_HALF_D+1.28,routing:true,crossing:false};
      if(dist(q.x,q.z)<.62)e.doorState="doorOuter";else return q;
    }
    if(e.doorState==="doorOuter"){
      if(dist(outward.x,outward.z)<.48)e.doorState="doorCrossIn";else return outward;
    }
    // Once committed, keep the inward waypoint until insideCabin() confirms the
    // crossing. This prevents the old threshold oscillation shown by the user.
    e.doorState="doorCrossIn";return inward;
  }

  if(!playerInside&&enemyInside){
    if(e.doorState!=="doorInner"&&e.doorState!=="doorCrossOut")e.doorState="doorInner";
    if(e.doorState==="doorInner"){
      if(dist(inward.x,inward.z)<.46)e.doorState="doorCrossOut";else return inward;
    }
    e.doorState="doorCrossOut";return outward;
  }

  e.doorState="pursue";
  return {x:px,z:pz,routing:false,crossing:false};
}`,
`const enemyRouteScratch={x:0,z:0,routing:false,crossing:false};
function setEnemyRoute(x,z,routing,crossing){enemyRouteScratch.x=x;enemyRouteScratch.z=z;enemyRouteScratch.routing=routing;enemyRouteScratch.crossing=crossing;return enemyRouteScratch;}
function selectCabinWaypoint(e,px,pz,playerInside){
  const p=e.m.position,enemyInside=insideCabin(p.x,p.z);
  const laneClear=Math.max(0,CABIN_DOOR_HALF-e.radius-.14);
  if(e.doorLane==null){const pattern=((e.variant*37)%7-3)/3;e.doorLane=pattern*laneClear*.58;}
  const lane=Math.max(-laneClear,Math.min(laneClear,e.doorLane));
  const inwardX=lane*.24,inwardZ=CABIN_HALF_D-.72,outwardX=lane,outwardZ=CABIN_HALF_D+1.28;
  if(playerInside&&!enemyInside){
    const state=e.doorState;
    if(state!=="doorRear"&&state!=="doorFlank"&&state!=="doorOuter"&&state!=="doorCrossIn"){
      e.doorSide=(p.x<-.15||(Math.abs(p.x)<.15&&e.variant%2))?-1:1;
      e.doorState=(p.z<-CABIN_HALF_D+.2&&Math.abs(p.x)<CABIN_HALF_W+1.15)?"doorRear":(p.z<CABIN_HALF_D+.65&&Math.abs(p.x)<CABIN_HALF_W+1.15)?"doorFlank":"doorOuter";
    }
    if(e.doorState==="doorRear"){
      const qx=e.doorSide*(CABIN_HALF_W+1.35),qz=-CABIN_HALF_D-1;
      if(Math.hypot(p.x-qx,p.z-qz)<.62)e.doorState="doorFlank";else return setEnemyRoute(qx,qz,true,false);
    }
    if(e.doorState==="doorFlank"){
      const qx=e.doorSide*(CABIN_HALF_W+1.35),qz=CABIN_HALF_D+1.28;
      if(Math.hypot(p.x-qx,p.z-qz)<.62)e.doorState="doorOuter";else return setEnemyRoute(qx,qz,true,false);
    }
    if(e.doorState==="doorOuter"){
      if(Math.hypot(p.x-outwardX,p.z-outwardZ)<.48)e.doorState="doorCrossIn";else return setEnemyRoute(outwardX,outwardZ,true,true);
    }
    e.doorState="doorCrossIn";return setEnemyRoute(inwardX,inwardZ,true,true);
  }
  if(!playerInside&&enemyInside){
    if(e.doorState!=="doorInner"&&e.doorState!=="doorCrossOut")e.doorState="doorInner";
    if(e.doorState==="doorInner"){
      if(Math.hypot(p.x-inwardX,p.z-inwardZ)<.46)e.doorState="doorCrossOut";else return setEnemyRoute(inwardX,inwardZ,true,true);
    }
    e.doorState="doorCrossOut";return setEnemyRoute(outwardX,outwardZ,true,true);
  }
  e.doorState="pursue";return setEnemyRoute(px,pz,false,false);
}`,
"allocation-free enemy route");

replaceOnce(
`function updatePlayer(dt){
  const fwd=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
  const rgt=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
  let mx=0,mz=0;
  if(keyDown("KeyW")){mx+=fwd.x;mz+=fwd.z;} if(keyDown("KeyS")){mx-=fwd.x;mz-=fwd.z;}
  if(keyDown("KeyD")){mx+=rgt.x;mz+=rgt.z;} if(keyDown("KeyA")){mx-=rgt.x;mz-=rgt.z;}
  if(touchLikely){mx+=fwd.x*(-touchMove.y)+rgt.x*touchMove.x;mz+=fwd.z*(-touchMove.y)+rgt.z*touchMove.x;}`,
`function updatePlayer(dt){
  const sinY=Math.sin(yaw),cosY=Math.cos(yaw),fwdX=-sinY,fwdZ=-cosY,rgtX=cosY,rgtZ=-sinY;
  let mx=0,mz=0;
  if(keyDown("KeyW")){mx+=fwdX;mz+=fwdZ;} if(keyDown("KeyS")){mx-=fwdX;mz-=fwdZ;}
  if(keyDown("KeyD")){mx+=rgtX;mz+=rgtZ;} if(keyDown("KeyA")){mx-=rgtX;mz-=rgtZ;}
  if(touchLikely){mx+=fwdX*(-touchMove.y)+rgtX*touchMove.x;mz+=fwdZ*(-touchMove.y)+rgtZ*touchMove.x;}`,
"allocation-free player vectors");
replaceOnce('  const alive=enemies.filter(e=>!e.dead).length;','  let alive=0;for(const e of enemies)if(!e.dead)alive++;',"allocation-free alive count");

productionHtml = productionHtml.replace("</head>", '<link rel="stylesheet" href="/how-to-play.css"/>\n</head>');
productionHtml = productionHtml.replace("</body>", '<script src="/how-to-play.js"></script>\n</body>');
for (const marker of [
  'href="/how-to-play.css"','src="/how-to-play.js"','PERF_PROFILE','updateAdaptiveQuality(dt)',
  'enemyRouteScratch','const sinY=Math.sin(yaw)','let alive=0;for(const e of enemies)',
  `<link rel="canonical" href="${publicOrigin}/"/>`,'apiJSON("/api/run/start"','apiJSON("/api/leaderboard"',
]) if (!productionHtml.includes(marker)) throw new Error(`HAZE build verification failed: missing production marker ${marker}`);
if (productionHtml.includes("API_ORIGIN")) throw new Error("HAZE build verification failed: cross-origin API client leaked into production.");

rmSync("dist", { recursive: true, force: true });
cpSync("public", "dist", { recursive: true });
writeFileSync("dist/index.html", productionHtml);
mkdirSync("dist/vendor", { recursive: true });
copyFileSync(threeSource, "dist/vendor/three.min.js");
console.log(`HAZE build verified: ${html.length} source chars → adaptive allocation-light dist/index.html`);
