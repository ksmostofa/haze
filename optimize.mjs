import { readFileSync, writeFileSync } from "node:fs";

const path = "dist/index.html";
let html = readFileSync(path, "utf8");

function replaceOnce(from, to, label) {
  const count = html.split(from).length - 1;
  if (count !== 1) throw new Error(`HAZE final optimization ${label}: expected one match, found ${count}`);
  html = html.replace(from, to);
}
function replaceExact(from, to, expected, label) {
  const count = html.split(from).length - 1;
  if (count !== expected) throw new Error(`HAZE final optimization ${label}: expected ${expected} matches, found ${count}`);
  html = html.replaceAll(from, to);
}

// Lower only primitive tessellation on low/touch hardware. The authored
// silhouettes, animation hierarchy, stats and hit volumes remain unchanged.
replaceOnce(
`const FACE_GEO={
  orb:new THREE.SphereGeometry(1,11,9),
  cone:new THREE.ConeGeometry(1,1,7),
  rod:new THREE.CylinderGeometry(.72,1,1,7),
  plate:new THREE.BoxGeometry(1,1,1),
  ear:new THREE.TorusGeometry(.62,.2,5,10)
};`,
`const FACE_GEO={
  orb:new THREE.SphereGeometry(1,PERF_PROFILE.low?8:11,PERF_PROFILE.low?6:9),
  cone:new THREE.ConeGeometry(1,1,PERF_PROFILE.low?6:7),
  rod:new THREE.CylinderGeometry(.72,1,1,PERF_PROFILE.low?6:7),
  plate:new THREE.BoxGeometry(1,1,1),
  ear:new THREE.TorusGeometry(.62,.2,PERF_PROFILE.low?4:5,PERF_PROFILE.low?8:10)
};
const SHARED_ENEMY_GEOMETRIES=new Set(Object.values(FACE_GEO));
function disposeEnemyVisual(root){
  root.traverse(o=>{if(o.geometry&&!SHARED_ENEMY_GEOMETRIES.has(o.geometry))o.geometry.dispose();});
}
// A compact silhouette is used for distant/crowded creatures and on low-power
// devices. The authored rig remains available for the close, small-population
// view, but the hot path never has to submit every facial detail for every enemy.
const ENEMY_LOD_BODY_GEO=new THREE.CylinderGeometry(.32,.44,1.55,6);
const ENEMY_LOD_HEAD_GEO=new THREE.SphereGeometry(.39,6,4);
const ENEMY_LOD_LIMB_GEO=new THREE.CylinderGeometry(.08,.11,.76,5);
SHARED_ENEMY_GEOMETRIES.add(ENEMY_LOD_BODY_GEO);SHARED_ENEMY_GEOMETRIES.add(ENEMY_LOD_HEAD_GEO);SHARED_ENEMY_GEOMETRIES.add(ENEMY_LOD_LIMB_GEO);`,
"shared enemy geometry and disposal");

replaceOnce('new THREE.CylinderGeometry(0.3+R()*0.06,0.24,1.0,9)','new THREE.CylinderGeometry(0.3+R()*0.06,0.24,1.0,PERF_PROFILE.low?6:9)',"torso segments");
replaceOnce('new THREE.SphereGeometry(0.34,12,10)','new THREE.SphereGeometry(0.34,PERF_PROFILE.low?8:12,PERF_PROFILE.low?6:10)',"chest segments");
replaceOnce('new THREE.SphereGeometry(0.1+R()*0.14,8,7)','new THREE.SphereGeometry(0.1+R()*0.14,PERF_PROFILE.low?6:8,PERF_PROFILE.low?5:7)',"tumor segments");
replaceOnce('new THREE.CylinderGeometry(0.08,0.11,0.25+R()*0.2,7)','new THREE.CylinderGeometry(0.08,0.11,0.25+R()*0.2,PERF_PROFILE.low?6:7)',"neck segments");
replaceOnce('q.castShadow=true;parent.add(q);if(mat===fm)','q.castShadow=!PERF_PROFILE.low;parent.add(q);if(mat===fm)',"face shadow flags");
replaceOnce('new THREE.CylinderGeometry(0.09*scale,0.08*scale,len*0.5,10)','new THREE.CylinderGeometry(0.09*scale,0.08*scale,len*0.5,PERF_PROFILE.low?6:10)',"upper arm segments");
replaceOnce('new THREE.CylinderGeometry(0.075*scale,0.055*scale,len*0.5,10)','new THREE.CylinderGeometry(0.075*scale,0.055*scale,len*0.5,PERF_PROFILE.low?6:10)',"forearm segments");
replaceOnce('new THREE.SphereGeometry(0.1*scale,10,8)','new THREE.SphereGeometry(0.1*scale,PERF_PROFILE.low?7:10,PERF_PROFILE.low?5:8)',"hand segments");
replaceOnce('new THREE.CylinderGeometry(0.11,0.09,0.6,10)','new THREE.CylinderGeometry(0.11,0.09,0.6,PERF_PROFILE.low?6:10)',"thigh segments");
replaceOnce('new THREE.CylinderGeometry(0.08,0.06,0.6,10)','new THREE.CylinderGeometry(0.08,0.06,0.6,PERF_PROFILE.low?6:10)',"shin segments");
replaceOnce('new THREE.SphereGeometry(.22,9,7)','new THREE.SphereGeometry(.22,PERF_PROFILE.low?7:9,PERF_PROFILE.low?5:7)',"lump segments");

// Pool the expensive enemy rigs and keep a compact silhouette in the renderer
// whenever the population is crowded, distant, or the device is low-power.
replaceOnce(
  `const enemies=[];`,
  `const enemyTemplates=Array(10),enemyPools=Array.from({length:10},()=>[]);
function remapEnemyRefs(value,map){
  if(value&&value.isObject3D)return map.get(value)||value;
  if(Array.isArray(value))return value.map(v=>remapEnemyRefs(v,map));
  if(value&&typeof value==="object"){
    if(value.isMaterial||value.isTexture||value.isColor)return value;
    const proto=Object.getPrototypeOf(value);if(proto!==Object.prototype&&proto!==null)return value;
    const out={};for(const [k,v] of Object.entries(value))out[k]=remapEnemyRefs(v,map);return out;
  }
  return value;
}
function cloneEnemyVisual(template){
  const original=[],cloned=[],saved=[];
  template.traverse(o=>{original.push(o);saved.push(o.userData);o.userData={};});
  const root=template.clone(true);
  original.forEach((o,i)=>{o.userData=saved[i];});root.traverse(o=>cloned.push(o));
  const map=new Map(original.map((o,i)=>[o,cloned[i]]));
  original.forEach((o,i)=>{cloned[i].userData=remapEnemyRefs(saved[i],map);});
  return root;
}
function attachEnemyProxy(root,variant){
  const u=root.userData,A=ANATOMY_PALETTES[variant],p=new THREE.Group();p.name="enemyLodProxy";
  const body=new THREE.Mesh(ENEMY_LOD_BODY_GEO,A.char);body.position.y=1.03;
  const head=new THREE.Mesh(ENEMY_LOD_HEAD_GEO,A.flesh);head.position.set(0,1.98,.08);
  const armL=new THREE.Mesh(ENEMY_LOD_LIMB_GEO,A.bruise);armL.position.set(-.38,1.18,.02);armL.rotation.z=-.18;
  const armR=new THREE.Mesh(ENEMY_LOD_LIMB_GEO,A.bruise);armR.position.set(.38,1.18,.02);armR.rotation.z=.18;
  const legL=new THREE.Mesh(ENEMY_LOD_LIMB_GEO,A.char);legL.position.set(-.15,.31,0);
  const legR=new THREE.Mesh(ENEMY_LOD_LIMB_GEO,A.char);legR.position.set(.15,.31,0);
  p.add(body,head,armL,armR,legL,legR);p.userData={body,head,armL,armR,legL,legR};
  p.traverse(o=>{o.castShadow=false;o.receiveShadow=false;});p.visible=false;u.spine.add(p);u.lodProxy=p;
}
function setEnemyLOD(root,simple){
  const u=root.userData,p=u.lodProxy;if(!p)return;
  p.visible=simple;for(const child of u.spine.children)if(child!==p)child.visible=!simple;
}
function acquireEnemyVisual(variant){
  const root=enemyPools[variant].pop()||cloneEnemyVisual(enemyTemplates[variant]);
  if(!root.userData.lodProxy)attachEnemyProxy(root,variant);
  root.visible=true;setEnemyLOD(root,true);return root;
}
function releaseEnemyVisual(root,variant){
  root.position.set(0,0,0);root.rotation.set(0,0,0);root.scale.set(1,1,1);root.traverse(o=>{o.visible=true;});
  setEnemyLOD(root,true);root.visible=false;enemyPools[variant].push(root);
}
for(let v=0;v<enemyTemplates.length;v++)enemyTemplates[v]=makeZombie("shambler",v);
const PREALLOCATED_ENEMIES=22;
for(let i=0;i<PREALLOCATED_ENEMIES;i++){
  const variant=i%enemyTemplates.length,root=cloneEnemyVisual(enemyTemplates[variant]);attachEnemyProxy(root,variant);root.visible=false;enemyPools[variant].push(root);
}
for(const template of enemyTemplates){template.visible=true;scene.add(template);}
for(const pool of enemyPools)for(const root of pool){setEnemyLOD(root,true);root.visible=true;scene.add(root);}
renderer.compile(scene,camera);renderer.render(scene,camera);
for(const template of enemyTemplates){scene.remove(template);template.visible=false;}
for(const pool of enemyPools)for(const root of pool){root.visible=false;}

const enemies=[];`,
  "pooled enemy visuals and LOD",
);

replaceOnce('  const m=makeZombie(type,variant); m.scale.setScalar(c.sc);','  const m=acquireEnemyVisual(variant); m.scale.setScalar(c.sc);',"pooled enemy spawn");
replaceOnce('const dPlayer=Math.hypot(px-m.position.x,pz-m.position.z);','const dPlayer=Math.hypot(px-m.position.x,pz-m.position.z);\n    const simpleVisual=PERF_PROFILE.low||dPlayer>10||enemies.length>2;if(simpleVisual!==e.lodSimple){setEnemyLOD(m,simpleVisual);e.lodSimple=simpleVisual;}',"enemy LOD budget");
replaceOnce('    groundY:gy,doorState:"pursue",doorLane:null,doorSide:variant%2?-1:1,stuckTime:0,lastNavX:x,lastNavZ:z});','    groundY:gy,doorState:"pursue",doorLane:null,doorSide:variant%2?-1:1,stuckTime:0,lastNavX:x,lastNavZ:z,lodSimple:true});',"enemy LOD state");
replaceExact('for(const e of enemies)scene.remove(e.m); enemies.length=0;','for(const e of enemies)releaseEnemyVisual(e.m,e.variant); enemies.length=0;',2,"pooled enemy cleanup");

// Pool impact particles/rings. The old path allocated geometry, materials,
// Float32Arrays and Vector3 objects for every hit, then disposed them moments
// later—classic GC/GPU-driver hitch material during rapid combat.
replaceOnce(
`/* ============================ IMPACT FX ============================ */
const bursts=[];
const burstGeo=new THREE.BufferGeometry();
(function(){const N=1;})();
function impactBurst(x,y,z){
  const N=10,g=new THREE.BufferGeometry(),pos=new Float32Array(N*3),vel=[];
  for(let i=0;i<N;i++){pos[i*3]=x;pos[i*3+1]=y;pos[i*3+2]=z;
    vel.push(new THREE.Vector3((Math.random()-.5)*4,Math.random()*3+1,(Math.random()-.5)*4));}
  g.setAttribute("position",new THREE.BufferAttribute(pos,3));
  const m=new THREE.PointsMaterial({color:0xdfe3e8,size:0.14,transparent:true,opacity:.9,depthWrite:false,blending:THREE.AdditiveBlending,fog:false});
  const pts=new THREE.Points(g,m); scene.add(pts);
  bursts.push({pts,pos,vel,life:0.5,max:0.5,N});
  // shock ring
  const ring=new THREE.Mesh(new THREE.RingGeometry(0.1,0.25,18),
    new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.7,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}));
  ring.position.set(x,y,z); ring.lookAt(camera.position); scene.add(ring);
  bursts.push({ring,life:0.3,max:0.3});
}`,
`/* ============================ IMPACT FX ============================ */
const bursts=[];
const IMPACT_POOL_SIZE=PERF_PROFILE.low?8:16,IMPACT_N=PERF_PROFILE.low?7:10;
const impactRingGeo=new THREE.RingGeometry(.1,.25,PERF_PROFILE.low?12:18);
for(let i=0;i<IMPACT_POOL_SIZE;i++){
  const pos=new Float32Array(IMPACT_N*3),vel=new Float32Array(IMPACT_N*3),g=new THREE.BufferGeometry();
  g.setAttribute("position",new THREE.BufferAttribute(pos,3));
  const pm=new THREE.PointsMaterial({color:0xdfe3e8,size:.14,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,fog:false});
  const pts=new THREE.Points(g,pm);pts.visible=false;scene.add(pts);
  const rm=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending,fog:false});
  const ring=new THREE.Mesh(impactRingGeo,rm);ring.visible=false;scene.add(ring);
  bursts.push({pts,ring,pos,vel,life:0,ringLife:0,N:IMPACT_N,active:false});
}
let burstCursor=0;
function impactBurst(x,y,z){
  const b=bursts[burstCursor++%bursts.length];
  b.active=true;b.life=.5;b.ringLife=.3;b.pts.visible=true;b.ring.visible=true;b.pts.material.opacity=.9;b.ring.material.opacity=.7;
  for(let i=0;i<b.N;i++){const j=i*3;b.pos[j]=x;b.pos[j+1]=y;b.pos[j+2]=z;b.vel[j]=(Math.random()-.5)*4;b.vel[j+1]=Math.random()*3+1;b.vel[j+2]=(Math.random()-.5)*4;}
  b.pts.geometry.attributes.position.needsUpdate=true;
  b.ring.position.set(x,y,z);b.ring.scale.set(1,1,1);b.ring.lookAt(camera.position);
}`,
"pooled impact effects");

replaceOnce(
`  for(let i=bursts.length-1;i>=0;i--){const b=bursts[i];b.life-=dt;
    if(b.pts){for(let k=0;k<b.N;k++){b.pos[k*3]+=b.vel[k].x*dt;b.pos[k*3+1]+=b.vel[k].y*dt;b.pos[k*3+2]+=b.vel[k].z*dt;b.vel[k].y-=6*dt;}
      b.pts.geometry.attributes.position.needsUpdate=true;b.pts.material.opacity=0.9*(b.life/b.max);}
    if(b.ring){const s=1+(1-b.life/b.max)*4;b.ring.scale.set(s,s,s);b.ring.material.opacity=0.7*(b.life/b.max);}
    if(b.life<=0){if(b.pts){scene.remove(b.pts);b.pts.geometry.dispose();}if(b.ring){scene.remove(b.ring);}bursts.splice(i,1);}}`,
`  for(const b of bursts){if(!b.active)continue;
    if(b.life>0){b.life-=dt;for(let k=0;k<b.N;k++){const j=k*3;b.pos[j]+=b.vel[j]*dt;b.pos[j+1]+=b.vel[j+1]*dt;b.pos[j+2]+=b.vel[j+2]*dt;b.vel[j+1]-=6*dt;}b.pts.geometry.attributes.position.needsUpdate=true;b.pts.material.opacity=.9*Math.max(0,b.life/.5);if(b.life<=0)b.pts.visible=false;}
    if(b.ringLife>0){b.ringLife-=dt;const f=Math.max(0,b.ringLife/.3),s=1+(1-f)*4;b.ring.scale.set(s,s,s);b.ring.material.opacity=.7*f;if(b.ringLife<=0)b.ring.visible=false;}
    if(b.life<=0&&b.ringLife<=0)b.active=false;}`,
"pooled impact update");

// Explicitly release unique enemy geometries after death/restart. Materials and
// FACE_GEO primitives are shared and intentionally retained.
replaceOnce('if(e.dying>1)   {scene.remove(m); enemies.splice(i,1);} continue;','if(e.dying>1){releaseEnemyVisual(m,e.variant);enemies.splice(i,1);} continue;',"pooled dead enemy cleanup");

for(const marker of ["IMPACT_POOL_SIZE","disposeEnemyVisual","SHARED_ENEMY_GEOMETRIES","ENEMY_LOD_BODY_GEO","acquireEnemyVisual","setEnemyLOD","PERF_PROFILE.low?6:10"]){
  if(!html.includes(marker)) throw new Error(`HAZE final optimization missing ${marker}`);
}
if(html.includes('vel.push(new THREE.Vector3')) throw new Error('HAZE final optimization left allocating impact vectors in production.');

writeFileSync(path,html);
console.log(`HAZE final optimization complete: ${html.length} chars; pooled impacts + low-device rig tessellation + GPU cleanup.`);
