import { readFileSync, writeFileSync } from "node:fs";

const path = "dist/index.html";
let html = readFileSync(path, "utf8");

function replaceOnce(from, to, label) {
  const count = html.split(from).length - 1;
  if (count !== 1) throw new Error(`HAZE final optimization ${label}: expected one match, found ${count}`);
  html = html.replace(from, to);
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
}`,
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
replaceOnce('if(e.dying>1)   {scene.remove(m); enemies.splice(i,1);} continue;','if(e.dying>1){scene.remove(m);disposeEnemyVisual(m);enemies.splice(i,1);} continue;',"dead enemy disposal");
replaceOnce('for(const e of enemies)scene.remove(e.m); enemies.length=0;','for(const e of enemies){scene.remove(e.m);disposeEnemyVisual(e.m);} enemies.length=0;',"restart enemy disposal");
replaceOnce('for(const e of enemies)scene.remove(e.m); enemies.length=0; CABIN.doorInt.visible=true;','for(const e of enemies){scene.remove(e.m);disposeEnemyVisual(e.m);} enemies.length=0; CABIN.doorInt.visible=true;',"title enemy disposal");

for(const marker of ["IMPACT_POOL_SIZE","disposeEnemyVisual","SHARED_ENEMY_GEOMETRIES","PERF_PROFILE.low?6:10"]){
  if(!html.includes(marker)) throw new Error(`HAZE final optimization missing ${marker}`);
}
if(html.includes('vel.push(new THREE.Vector3')) throw new Error('HAZE final optimization left allocating impact vectors in production.');

writeFileSync(path,html);
console.log(`HAZE final optimization complete: ${html.length} chars; pooled impacts + low-device rig tessellation + GPU cleanup.`);
