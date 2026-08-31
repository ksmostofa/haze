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
`,
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

// Keep the gameplay entity authoritative, but give its renderer two faithful
// representations: a real skinned GLB up close and a directional atlas frame
// from that same rig for the crowd. The switch is hysteretic, so it does not
// shimmer at a distance boundary.
replaceOnce(
  `const enemies=[];`,
  `const enemyTemplates=Array(10),enemyPools=Array.from({length:10},()=>[]);
const ZOMBIE_MODELS=["doom","doom","doom"],ZOMBIE_ACTIONS=["idle","walk","attack","hit","death"];
const ZOMBIE_ATLAS_META={cellW:128,cellH:192,frames:6,atlasCols:24,atlasRows:10,atlasW:3072,atlasH:1920};
const zombieAtlases=Array(3),zombieAtlasMaterials=Array(3),zombieRigSources=Array(3),zombieRigClips=Array(3),zombieRigVisualPools=Array.from({length:3},()=>[]);
const zombiePlaneGeo=new THREE.PlaneGeometry(2.13,3.2);
function loadTexture(url){return new Promise((resolve,reject)=>new THREE.TextureLoader().load(url,resolve,undefined,reject));}
function loadGLTF(url){return new Promise((resolve,reject)=>new THREE.GLTFLoader().load(url,resolve,undefined,reject));}
function makeAtlasMaterial(texture){
  texture.encoding=THREE.sRGBEncoding;texture.wrapS=THREE.ClampToEdgeWrapping;texture.wrapT=THREE.ClampToEdgeWrapping;
  texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.anisotropy=1;texture.needsUpdate=true;
  const mat=new THREE.MeshBasicMaterial({map:texture,color:0x555b58,transparent:true,alphaTest:.2,depthWrite:true,side:THREE.DoubleSide,fog:true});
  mat.onBeforeCompile=shader=>{
    shader.uniforms.atlasTile={value:new THREE.Vector4(0,0,1,1)};
    shader.fragmentShader=shader.fragmentShader.replace("#include <map_pars_fragment>","#include <map_pars_fragment>\\nuniform vec4 atlasTile;");
    shader.fragmentShader=shader.fragmentShader.replace("#include <map_fragment>","vec4 sampledDiffuseColor=texture2D(map,vUv*atlasTile.zw+atlasTile.xy);diffuseColor*=sampledDiffuseColor;");
    mat.userData.atlasShader=shader;
  };
  return mat;
}
function tileFor(model,action,dir,frame){
  const row=ZOMBIE_ACTIONS.indexOf(action)*2+Math.floor(dir/4),col=(dir%4)*ZOMBIE_ATLAS_META.frames+frame;
  return new THREE.Vector4(col*ZOMBIE_ATLAS_META.cellW/ZOMBIE_ATLAS_META.atlasW,1-(row+1)*ZOMBIE_ATLAS_META.cellH/ZOMBIE_ATLAS_META.atlasH,ZOMBIE_ATLAS_META.cellW/ZOMBIE_ATLAS_META.atlasW,ZOMBIE_ATLAS_META.cellH/ZOMBIE_ATLAS_META.atlasH);
}
function setTile(out,model,action,dir,frame){
  const row=ZOMBIE_ACTIONS.indexOf(action)*2+Math.floor(dir/4),col=(dir%4)*ZOMBIE_ATLAS_META.frames+frame;
  out.set(col*ZOMBIE_ATLAS_META.cellW/ZOMBIE_ATLAS_META.atlasW,1-(row+1)*ZOMBIE_ATLAS_META.cellH/ZOMBIE_ATLAS_META.atlasH,ZOMBIE_ATLAS_META.cellW/ZOMBIE_ATLAS_META.atlasW,ZOMBIE_ATLAS_META.cellH/ZOMBIE_ATLAS_META.atlasH);return out;
}
function normalizeRig(root){
  root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(root),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3()),s=2.55/(size.y||1);
  root.scale.setScalar(s);root.position.set(-center.x*s,-box.min.y*s,-center.z*s);root.updateMatrixWorld(true);
  root.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;o.frustumCulled=true;const mats=Array.isArray(o.material)?o.material:[o.material];for(const mat of mats)if(mat){if(mat.color)mat.color.multiplyScalar(.62);if(mat.emissive)mat.emissive.multiplyScalar(.025);mat.emissiveIntensity=Math.min(mat.emissiveIntensity||0,.025);mat.metalness=0;mat.roughness=Math.max(mat.roughness||0,.88);mat.needsUpdate=true;}}});return root;
}
function cloneRig(source){
  const root=THREE.SkeletonUtils&&THREE.SkeletonUtils.clone?THREE.SkeletonUtils.clone(source):source.clone(true);
  root.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;o.frustumCulled=true;}});prepareDoomRig(root);return root;
}
function prepareDoomRig(root){
  const bones=Object.create(null);root.traverse(o=>{if(o.isBone)bones[o.name]=o;});
  const find=(side,part)=>{for(const name of Object.keys(bones))if(name.includes("Bip01_"+side+"_"+part))return bones[name];return null;};
  root.userData.doomBones=bones;root.userData.doomBoneList=Object.values(bones);root.userData.doomBaseRotations=new Map(Object.entries(bones).map(([name,bone])=>[name,bone.quaternion.clone()]));
  root.userData.doomParts={pelvis:Object.keys(bones).find(name=>name.includes("Bip01_Pelvis"))?bones[Object.keys(bones).find(name=>name.includes("Bip01_Pelvis"))]:null,spine:Object.keys(bones).find(name=>name.endsWith("Bip01_Spine"))?bones[Object.keys(bones).find(name=>name.endsWith("Bip01_Spine"))]:null,spine1:Object.keys(bones).find(name=>name.endsWith("Bip01_Spine1"))?bones[Object.keys(bones).find(name=>name.endsWith("Bip01_Spine1"))]:null,spine2:Object.keys(bones).find(name=>name.endsWith("Bip01_Spine2"))?bones[Object.keys(bones).find(name=>name.endsWith("Bip01_Spine2"))]:null,neck:Object.keys(bones).find(name=>name.includes("Bip01_Neck"))?bones[Object.keys(bones).find(name=>name.includes("Bip01_Neck"))]:null,head:Object.keys(bones).find(name=>name.includes("Bip01_Head"))?bones[Object.keys(bones).find(name=>name.includes("Bip01_Head"))]:null,lUpper:find("L","UpperArm"),rUpper:find("R","UpperArm"),lFore:find("L","Forearm"),rFore:find("R","Forearm"),lThigh:find("L","Thigh"),rThigh:find("R","Thigh"),lCalf:find("L","Calf"),rCalf:find("R","Calf"),lFoot:find("L","Foot"),rFoot:find("R","Foot")};return root;
}
const zombieVisualReady=(async()=>{
  if(!THREE.GLTFLoader)return false;
  try{
    const [gltf,atlas]=await Promise.all([loadGLTF("/assets/zombies/sketchfab/zombie-doom-default.glb"),loadTexture("/assets/zombies/sketchfab/Zombie_doom_atlas.png")]);
    const source=normalizeRig(gltf.scene),clips=gltf.animations||[],material=makeAtlasMaterial(atlas);
    for(let i=0;i<3;i++){zombieRigSources[i]=source;zombieRigClips[i]=clips;zombieAtlases[i]=atlas;zombieAtlasMaterials[i]=material;}
    return true;
  }catch(error){console.warn("Haze zombie visuals unavailable; procedural fallback kept",error);return false;}
})();
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
  const u=root.userData,p=new THREE.Group();p.name="enemyLodProxy";
  const model=variant%3,mat=zombieAtlasMaterials[model]||new THREE.MeshBasicMaterial({color:0x25272b,transparent:true,opacity:0,depthWrite:false});
  const mesh=new THREE.Mesh(zombiePlaneGeo,mat);mesh.name="zombieImpostor";mesh.userData.tile=tileFor(model,"idle",0,0);mesh.userData.model=model;mesh.renderOrder=2;
  mesh.onBeforeRender=()=>{const active=mesh.material,shader=active.userData&&active.userData.atlasShader;if(shader)shader.uniforms.atlasTile.value.copy(mesh.userData.tile);};
  p.add(mesh);p.position.y=1.25; p.userData.mesh=mesh; p.visible=false;u.spine.add(p);u.lodProxy=p;u.impostor=mesh;
}
function setEnemyLOD(root,simple){
  const u=root.userData,p=u.lodProxy;if(!p)return;u.lodSimple=simple;if(!simple&&!u.rigReady)acquireRigOnRoot(root,variantForRoot(root));if(simple&&u.rigReady)releaseRigOnRoot(root);
  const rig= u.rigVisual,hasRig=!!u.rigReady,hasAtlas=!!zombieAtlasMaterials[variantForRoot(root)%3];
  p.visible=simple&&hasAtlas;
  if(rig)rig.visible=!simple&&hasRig;
  for(const child of u.spine.children)if(child!==p&&child!==rig)child.visible=!hasRig&&!simple||!hasAtlas&&simple;
}
function variantForRoot(root){return root.userData.visualVariant==null?0:root.userData.visualVariant;}
function upgradeImpostorOnRoot(root,variant){
  const mesh=root.userData.impostor,mat=zombieAtlasMaterials[variant%3];if(!mesh||!mat)return;mesh.material=mat;mesh.userData.model=variant%3;
}
function acquireRigOnRoot(root,variant){
  const u=root.userData,model=variant%3;if(u.rigVisual||!zombieRigSources[model])return !!u.rigVisual;const rig=zombieRigVisualPools[model].pop();if(!rig)return false;
  rig.name="enemyRigVisual";rig.visible=true;u.visualVariant=variant;u.rigVisual=rig;u.rigReady=true;u.rigMixer=new THREE.AnimationMixer(rig);u.rigClips=zombieRigClips[model];u.rigAction="";u.rigModel=model;u.spine.add(rig);return true;
}
function releaseRigOnRoot(root){
  const u=root.userData,rig=u.rigVisual;if(!rig)return;const model=u.rigModel==null?0:u.rigModel;u.spine.remove(rig);rig.visible=false;if(u.rigMixer)u.rigMixer.stopAllAction();u.rigMixer=null;u.rigVisual=null;u.rigReady=false;zombieRigVisualPools[model].push(rig);
}
function turnDoom(bone,axis,amount){if(!bone||!amount)return;if(axis==="x")bone.rotateX(amount);else if(axis==="y")bone.rotateY(amount);else bone.rotateZ(amount);}
function poseDoomRig(root,action,phase,deathT=0){
  const u=root.userData;if(!u.doomBones)return;for(const bone of u.doomBoneList)bone.quaternion.copy(u.doomBaseRotations.get(bone.name));
  const b=u.doomParts,s=Math.sin(phase*6.283),c=Math.cos(phase*6.283);
  turnDoom(b.lUpper,"y",.74);turnDoom(b.rUpper,"y",-.74);turnDoom(b.lFore,"x",-.2);turnDoom(b.rFore,"x",-.2);turnDoom(b.spine,"x",.16);turnDoom(b.spine1,"x",.1);
  if(action==="idle"){turnDoom(b.spine2,"z",s*.035);turnDoom(b.head,"z",-s*.04);turnDoom(b.neck,"y",c*.045);turnDoom(b.lUpper,"z",s*.1);turnDoom(b.rUpper,"z",-s*.1);}
  else if(action==="walk"){turnDoom(b.lThigh,"x",s*.38);turnDoom(b.rThigh,"x",-s*.38);turnDoom(b.lCalf,"x",Math.max(0,-s)*.45);turnDoom(b.rCalf,"x",Math.max(0,s)*.45);turnDoom(b.lUpper,"z",-.18+s*.22);turnDoom(b.rUpper,"z",.18-s*.22);turnDoom(b.lFore,"x",-.28);turnDoom(b.rFore,"x",-.28);turnDoom(b.spine,"z",s*.045);}
  else if(action==="attack"){turnDoom(b.spine,"x",.3);turnDoom(b.spine1,"x",.18);turnDoom(b.spine2,"x",.1);turnDoom(b.lUpper,"y",.35);turnDoom(b.rUpper,"y",-.35);turnDoom(b.lUpper,"z",-.16);turnDoom(b.rUpper,"z",.16);turnDoom(b.lFore,"x",-.52);turnDoom(b.rFore,"x",-.52);turnDoom(b.lFore,"z",-.18);turnDoom(b.rFore,"z",.18);turnDoom(b.head,"x",-.08);}
  else if(action==="hit"){turnDoom(b.spine,"z",.13);turnDoom(b.spine1,"z",.1);turnDoom(b.head,"z",-.16);turnDoom(b.lUpper,"y",.54);turnDoom(b.rUpper,"y",-.54);turnDoom(b.lUpper,"z",-.3);turnDoom(b.rUpper,"z",.3);turnDoom(b.lFore,"x",-.5);turnDoom(b.rFore,"x",-.5);}
  else if(action==="death"){const d=Math.min(1,deathT/.9);turnDoom(b.pelvis,"z",-d*.24);turnDoom(b.spine,"z",-d*.55);turnDoom(b.spine1,"z",-d*.32);turnDoom(b.spine,"x",d*.4);turnDoom(b.head,"x",d*.5);turnDoom(b.lThigh,"x",d*.32);turnDoom(b.rThigh,"x",-d*.18);turnDoom(b.lCalf,"x",d*.42);turnDoom(b.rCalf,"x",d*.22);turnDoom(b.lUpper,"y",.52);turnDoom(b.rUpper,"y",-.52);turnDoom(b.lUpper,"z",-d*.5);turnDoom(b.rUpper,"z",d*.5);}
}
function setRigAction(root,action){
  const u=root.userData;if(!u.rigReady)return;const wanted=ZOMBIE_ACTIONS.includes(action)?action:"idle";if(u.rigAction===wanted)return;if(!u.rigClips.length){u.rigAction=wanted;return;}
  const names={idle:["Idle","Idle_Attack"],walk:["Walk","Run","Run_Arms"],attack:["Punch","Run_Attack","Idle_Attack"],hit:["HitReact","Idle"],death:["Death","Crawl","Idle"]}[wanted];
  const clip=names.map(name=>u.rigClips.find(c=>c.name===name)).find(Boolean)||u.rigClips[0];if(!clip)return;
  if(u.rigMixer._hazeAction)u.rigMixer._hazeAction.fadeOut(.12);const next=u.rigMixer.clipAction(clip);next.reset().fadeIn(.12).play();if(wanted==="death")next.setLoop(THREE.LoopOnce,1).clampWhenFinished=true;u.rigMixer._hazeAction=next;u.rigAction=wanted;
}
function updateEnemyVisual(e,dt){
  const m=e.m,u=m.userData;if(!u.lodProxy)return;const simple=u.lodSimple,model=u.rigModel==null?e.variant%3:u.rigModel;
  if(simple){const face=Math.atan2(camera.position.x-m.position.x,camera.position.z-m.position.z);u.lodProxy.rotation.y=angDelta(0,face-m.rotation.y);u.lodProxy.position.y=(1.25-u.soleOffset)*m.scale.x;const rel=angDelta(m.rotation.y,face),dir=((Math.round(rel/(Math.PI*2)*8)%8)+8)%8;const action=e.dead?"death":e.stun>0?"hit":e.lunge>0?"attack":e.inRange?"idle":"walk",frame=e.dead?Math.min(5,Math.floor(e.dying*6)):Math.floor(GS.time*8)%6;setTile(u.impostor.userData.tile,model,action,dir,frame);}
  else if(u.rigReady){const action=e.dead?"death":e.stun>0?"hit":e.lunge>0?"attack":e.inRange?"idle":"walk";u.rigVisual.position.y=-u.soleOffset*m.scale.x;if(u.rigClips.length){setRigAction(m,action);u.rigMixer.update(dt);}else{u.rigAction=action;poseDoomRig(u.rigVisual,action,GS.time*.72+e.phase,e.dying);}}
}
function acquireEnemyVisual(variant){
  const root=enemyPools[variant].pop()||cloneEnemyVisual(enemyTemplates[variant]);
  root.userData.visualVariant=variant;if(!root.userData.lodProxy)attachEnemyProxy(root,variant);upgradeImpostorOnRoot(root,variant);
  root.visible=true;setEnemyLOD(root,true);return root;
}
function releaseEnemyVisual(root,variant){
  root.position.set(0,0,0);root.rotation.set(0,0,0);root.scale.set(1,1,1);releaseRigOnRoot(root);root.traverse(o=>{o.visible=true;});
  setEnemyLOD(root,true);root.visible=false;enemyPools[variant].push(root);
}
for(let v=0;v<enemyTemplates.length;v++)enemyTemplates[v]=makeZombie("shambler",v);
const PREALLOCATED_ENEMIES=22;
for(let i=0;i<PREALLOCATED_ENEMIES;i++){
  const variant=i%enemyTemplates.length,root=cloneEnemyVisual(enemyTemplates[variant]);root.userData.visualVariant=variant;attachEnemyProxy(root,variant);root.visible=false;enemyPools[variant].push(root);
}
for(const template of enemyTemplates){template.visible=false;}
const zombieVisualInstalled=zombieVisualReady.then(ready=>{
  if(!ready)return false;
  for(let variant=0;variant<enemyPools.length;variant++)for(const root of enemyPools[variant])upgradeImpostorOnRoot(root,variant);
  for(let model=0;model<3;model++)for(let copy=0;copy<2;copy++){
    const rig=cloneRig(zombieRigSources[model]);rig.visible=false;scene.add(rig);zombieRigVisualPools[model].push(rig);
  }
  const warm=[];for(let model=0;model<3;model++){const root=enemyPools[model][0];root.visible=true;scene.add(root);setEnemyLOD(root,true);warm.push(root);}for(const root of warm){scene.remove(root);root.visible=false;}
  const warmRig=enemyPools[0][0];warmRig.visible=true;scene.add(warmRig);setEnemyLOD(warmRig,false);renderer.compile(scene,camera);setEnemyLOD(warmRig,true);scene.remove(warmRig);warmRig.visible=false;
  for(const enemy of enemies){upgradeImpostorOnRoot(enemy.m,enemy.variant);setEnemyLOD(enemy.m,enemy.lodSimple);}
  return true;
});

const enemies=[];`,
  "rigged enemy visuals and directional impostors",
);

replaceOnce('  const m=makeZombie(type,variant); m.scale.setScalar(c.sc);','  const m=acquireEnemyVisual(variant); m.scale.setScalar(c.sc);',"pooled enemy spawn");
replaceOnce('const dPlayer=Math.hypot(px-m.position.x,pz-m.position.z);','const dPlayer=Math.hypot(px-m.position.x,pz-m.position.z);\n    e.inRange=dPlayer<e.radius+1.3;const shouldUseCrowd=dPlayer>14||(PERF_PROFILE.low?dPlayer>7:(enemies.length>4&&dPlayer>8));const crowdExit=dPlayer>11||(PERF_PROFILE.low?dPlayer>5.5:(enemies.length>4&&dPlayer>6.5));const simpleVisual=e.lodSimple?shouldUseCrowd:crowdExit;if(simpleVisual!==e.lodSimple){setEnemyLOD(m,simpleVisual);e.lodSimple=simpleVisual;}',"enemy LOD budget");
replaceOnce('    groundY:gy,doorState:"pursue",doorLane:null,doorSide:variant%2?-1:1,stuckTime:0,lastNavX:x,lastNavZ:z});','    groundY:gy,doorState:"pursue",doorLane:null,doorSide:variant%2?-1:1,stuckTime:0,lastNavX:x,lastNavZ:z,lodSimple:true,inRange:false});',"enemy LOD state");
replaceOnce('try{await beginRankedRun();if(!rankedRunToken)throw new Error("Ranked service unavailable");}','try{await Promise.all([beginRankedRun(),zombieVisualInstalled]);if(!rankedRunToken)throw new Error("Ranked service unavailable");}',"prepare enemy visuals before run");
replaceOnce('    if(e.dying>1)   {scene.remove(m); enemies.splice(i,1);} continue;','    updateEnemyVisual(e,dt);if(e.dying>1)   {scene.remove(m); enemies.splice(i,1);} continue;',"dead enemy visual update");
replaceOnce('    if(e.stun>0){e.stun-=dt;u.spine.rotation.z=Math.sin(e.stun*38)*.16;u.spine.rotation.x=.28;m.position.y=e.groundY;continue;}','    if(e.stun>0){e.stun-=dt;u.spine.rotation.z=Math.sin(e.stun*38)*.16;u.spine.rotation.x=.28;m.position.y=e.groundY;updateEnemyVisual(e,dt);continue;}',"stunned enemy visual update");
replaceOnce('    else m.scale.setScalar(e.c.sc);\n  }\n}','    else m.scale.setScalar(e.c.sc);\n    updateEnemyVisual(e,dt);\n  }\n}',"enemy visual adapter update");
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
replaceOnce('updateEnemyVisual(e,dt);if(e.dying>1)   {scene.remove(m); enemies.splice(i,1);} continue;','updateEnemyVisual(e,dt);if(e.dying>1){releaseEnemyVisual(m,e.variant);enemies.splice(i,1);} continue;',"pooled dead enemy cleanup");

for(const marker of ["IMPACT_POOL_SIZE","disposeEnemyVisual","SHARED_ENEMY_GEOMETRIES","ZOMBIE_MODELS","zombieAtlasMaterials","acquireEnemyVisual","setEnemyLOD","PERF_PROFILE.low?6:10"]){
  if(!html.includes(marker)) throw new Error(`HAZE final optimization missing ${marker}`);
}
if(html.includes('vel.push(new THREE.Vector3')) throw new Error('HAZE final optimization left allocating impact vectors in production.');

writeFileSync(path,html);
console.log(`HAZE final optimization complete: ${html.length} chars; pooled impacts + low-device rig tessellation + GPU cleanup.`);
