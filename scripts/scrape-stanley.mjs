import { chromium } from 'playwright';
import fs from 'node:fs';
const urls=new Set(), payloads=[];
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1100}});
page.on('request',req=>{const u=req.url();if(/spectrum|\.glb(?:\?|$)|\.gltf(?:\?|$)|manifest|scene|customiz|3d/i.test(u)) urls.add(`REQ ${req.method()} ${u}`)});
page.on('response',async res=>{const u=res.url(),ct=res.headers()['content-type']||'';if(/spectrum|\.glb(?:\?|$)|\.gltf(?:\?|$)|manifest|scene|customiz|3d/i.test(u)||/model\/gltf|octet-stream/i.test(ct)){urls.add(`${res.status()} ${ct} ${u}`);if(/spectrumcustomizer\.com/i.test(u)&&/(json|javascript|text)/i.test(ct)){try{const t=(await res.text()).slice(0,500000);payloads.push(`\n### ${u}\n${t}`);for(const m of t.matchAll(/https?:[^\"'<>\\\s]+/g)){const x=m[0].replace(/\\u0026/g,'&');if(/\.glb|\.gltf|manifest|scene|spectrum/i.test(x))urls.add(x)}}catch{}}}});
const target='https://www.stanley1913.com/products/adventure-quencher-travel-tumbler-40-oz?variant=44559859712127';
console.log('OPEN',target);await page.goto(target,{waitUntil:'domcontentloaded',timeout:120000});await page.waitForTimeout(9000);console.log('TITLE',await page.title());
const all=page.locator('a,button,[role=button]'),rows=[];
for(let i=0;i<await all.count();i++){const el=all.nth(i);let text='';try{text=(await el.innerText()).trim().replace(/\s+/g,' ')}catch{};if(/custom|personal|create/i.test(text)){rows.push({i,text,visible:await el.isVisible().catch(()=>false),tag:await el.evaluate(e=>e.tagName).catch(()=>''),href:await el.getAttribute('href'),cls:await el.getAttribute('class'),attrs:await el.evaluate(e=>Object.fromEntries([...e.attributes].map(a=>[a.name,a.value]))).catch(()=>({})),html:(await el.evaluate(e=>e.outerHTML).catch(()=>'' )).slice(0,4000)})}}
console.log('CUSTOM_CONTROLS',JSON.stringify(rows,null,2));
const dom=await page.content();
for(const pat of ['spectrum','customizer','100000144279c','44559859712127']){let p=0,c=0;while((p=dom.toLowerCase().indexOf(pat.toLowerCase(),p))>=0&&c<12){console.log(`DOM_AROUND_${pat}`,dom.slice(Math.max(0,p-900),p+1800).replace(/\s+/g,' '));p+=pat.length;c++}}
// Click only visible product-ish customize buttons that do not simply navigate to the collection.
for(const row of [...rows].reverse()){if(!row.visible||!/customize/i.test(row.text))continue;if(row.href&&/collections\/stanley-create-custom/.test(row.href))continue;const el=all.nth(row.i);console.log('CLICKING_PRODUCT_CONTROL',row.i,row.text,row.href||'',JSON.stringify(row.attrs));try{await el.click({timeout:10000,force:true});await page.waitForTimeout(18000);console.log('AFTER_CLICK_URL',page.url());}catch(e){console.log('CLICK_FAIL',String(e).slice(0,500))}}
// Some product launchers may be elements outside a/button.
const launchers=page.locator('[data-customizer],[data-customizer-url],[data-spectrum],[data-spectrum-product],[class*=customizer],[id*=customizer]');
console.log('SPECIAL_LAUNCHERS',await launchers.count());for(let i=0;i<Math.min(await launchers.count(),30);i++) console.log('SPECIAL',i,(await launchers.nth(i).evaluate(e=>e.outerHTML).catch(()=>'' )).slice(0,5000));
const finalDom=await page.content();for(const m of finalDom.matchAll(/https?:[^\"'<>\\\s]+/g)){const u=m[0].replace(/&amp;/g,'&');if(/spectrum|\.glb|\.gltf|manifest|scene|customiz/i.test(u))urls.add(u)}
console.log('\n=== ASSET_CANDIDATES ===');for(const u of [...urls].sort())console.log(u);console.log('=== END_ASSET_CANDIDATES ===');
fs.writeFileSync('stanley-assets.txt',[...urls].sort().join('\n'));fs.writeFileSync('spectrum-payloads.txt',payloads.join('\n'));await page.screenshot({path:'stanley-page.png',fullPage:true});await browser.close();