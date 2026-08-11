import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const source = "public/index.html";
const html = readFileSync(source, "utf8");
const required = [
  "<title>HAZE — Survive the Night</title>",
  'BUILD_ID="haze-20260811-global-v1"',
  "entryGate",
  "requestGameFullscreen",
  "runProof",
  "completeRankedRun",
  "/api/leaderboard",
  "/api/run/start",
  "/api/run/complete",
  "/api/run/finish",
  'src="/vendor/three.min.js"',
  'property="og:image"',
  'rel="icon"',
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

productionHtml = productionHtml.replace("</head>", '<link rel="stylesheet" href="/how-to-play.css"/>\n</head>');
productionHtml = productionHtml.replace("</body>", '<script src="/how-to-play.js"></script>\n</body>');

for (const marker of [
  'href="/how-to-play.css"', 'src="/how-to-play.js"', 'PERF_PROFILE', 'updateAdaptiveQuality(dt)',
  `<link rel="canonical" href="${publicOrigin}/"/>`, 'apiJSON("/api/run/start"', 'apiJSON("/api/leaderboard"',
]) if (!productionHtml.includes(marker)) throw new Error(`HAZE build verification failed: missing production marker ${marker}`);
if (productionHtml.includes("API_ORIGIN")) throw new Error("HAZE build verification failed: cross-origin API client leaked into production.");

rmSync("dist", { recursive: true, force: true });
cpSync("public", "dist", { recursive: true });
writeFileSync("dist/index.html", productionHtml);
mkdirSync("dist/vendor", { recursive: true });
copyFileSync(threeSource, "dist/vendor/three.min.js");
console.log(`HAZE build verified: ${html.length} source chars → adaptive dist/index.html`);
