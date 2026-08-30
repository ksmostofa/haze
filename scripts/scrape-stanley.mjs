import { chromium } from 'playwright';
import fs from 'node:fs';

const urls = new Set();
const payloads=[];
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:1440,height:1100}});

page.on('request', req => {
  const u=req.url();
  if (/spectrum|\.glb(?:\?|$)|\.gltf(?:\?|$)|manifest|scene|customiz|3d/i.test(u)) urls.add(`REQ ${req.method()} ${u}`);
});
page.on('response', async res => {
  const u=res.url();
  const ct=res.headers()['content-type']||'';
  if (/spectrum|\.glb(?:\?|$)|\.gltf(?:\?|$)|manifest|scene|customiz|3d/i.test(u) || /model\/gltf|octet-stream/i.test(ct)) {
    urls.add(`${res.status()} ${ct} ${u}`);
    if (/spectrumcustomizer\.com/i.test(u) && /(json|javascript|text)/i.test(ct)) {
      try { const t=(await res.text()).slice(0,200000); payloads.push(`\n### ${u}\n${t}`); for(const m of t.matchAll(/https?:[^\"'<>\\\s]+/g)) if(/\.glb|\.gltf|manifest|scene|spectrum/i.test(m[0])) urls.add(m[0].replace(/\\u0026/g,'&')); } catch {}
    }
  }
});

const target='https://ca.stanley1913.com/products/the-quencher-h2-0-flowstate%E2%84%A2-tumbler-40-oz-1-18-l-stanley-create?variant=44535651762228';
console.log('OPEN',target);
await page.goto(target,{waitUntil:'domcontentloaded',timeout:120000});
await page.waitForTimeout(7000);
console.log('TITLE',await page.title());

const controls=page.locator('a,button');
const rows=[];
for(let i=0;i<await controls.count();i++){
  const el=controls.nth(i); let text=''; try{text=(await el.innerText()).trim().replace(/\s+/g,' ')}catch{}
  if(/custom|personal|create/i.test(text)) {
    rows.push({i,text,tag:await el.evaluate(e=>e.tagName),href:await el.getAttribute('href'),cls:await el.getAttribute('class'),html:(await el.evaluate(e=>e.outerHTML)).slice(0,1500)});
  }
}
console.log('CUSTOM_CONTROLS',JSON.stringify(rows,null,2));

// Try product-area controls containing Customize, starting from later matches to avoid top nav.
for(const row of [...rows].reverse()){
  const el=controls.nth(row.i);
  try{
    if(!(await el.isVisible())) continue;
    console.log('CLICKING',row.i,row.text,row.href||'');
    await el.click({timeout:8000});
    await page.waitForTimeout(12000);
    console.log('AFTER_CLICK_URL',page.url());
    if([...urls].some(x=>/spectrumcustomizer|\.glb|\.gltf/i.test(x))) break;
    if(page.url()!==target){ await page.goto(target,{waitUntil:'domcontentloaded',timeout:120000}); await page.waitForTimeout(4000); }
  }catch(e){console.log('CLICK_FAIL',row.i,String(e).slice(0,200));}
}

// Inspect DOM/scripts/iframes/global script text for asset hints.
const dom=await page.content();
for(const m of dom.matchAll(/https?:[^\"'<>\\\s]+/g)){
 const u=m[0].replace(/&amp;/g,'&'); if(/spectrum|\.glb|\.gltf|manifest|scene|customiz/i.test(u)) urls.add(u);
}
const srcs=await page.locator('script[src],iframe[src]').evaluateAll(es=>es.map(e=>e.src));
for(const u of srcs) if(/spectrum|customiz/i.test(u)) urls.add(u);

const out=[...urls].sort();
console.log('\n=== ASSET_CANDIDATES ===');
for(const u of out) console.log(u);
console.log('=== END_ASSET_CANDIDATES ===');
fs.writeFileSync('stanley-assets.txt',out.join('\n'));
fs.writeFileSync('spectrum-payloads.txt',payloads.join('\n'));
await page.screenshot({path:'stanley-page.png',fullPage:true});
await browser.close();
