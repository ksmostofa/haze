import { chromium } from 'playwright';
import fs from 'node:fs';

const urls = new Set();
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:1440,height:1100}});
page.on('request', req => {
  const u=req.url();
  if (/spectrum|\.glb(?:\?|$)|\.gltf(?:\?|$)|manifest|scene|customiz|3d/i.test(u)) urls.add(u);
});
page.on('response', res => {
  const u=res.url();
  const ct=res.headers()['content-type']||'';
  if (/spectrum|\.glb(?:\?|$)|\.gltf(?:\?|$)|manifest|scene|customiz|3d/i.test(u) || /model\/gltf|octet-stream/i.test(ct)) urls.add(`${res.status()} ${ct} ${u}`);
});
const target='https://www.stanley1913.com/products/adventure-quencher-travel-tumbler-40-oz?variant=44559859712127';
console.log('OPEN',target);
await page.goto(target,{waitUntil:'domcontentloaded',timeout:120000});
await page.waitForTimeout(8000);
console.log('TITLE',await page.title());
console.log('BODY_SNIPPET',(await page.locator('body').innerText()).slice(0,6000));

const candidates = page.getByText(/customize|personalize|create/i);
console.log('CUSTOMIZE_MATCHES', await candidates.count());
for (let i=0;i<Math.min(await candidates.count(),8);i++) {
  try {
    const el=candidates.nth(i);
    console.log('MATCH',i,await el.innerText().catch(()=>''));
    if(await el.isVisible()) { await el.click({timeout:5000}).catch(()=>{}); await page.waitForTimeout(12000); break; }
  } catch {}
}

// Inspect scripts, iframes and DOM strings too.
const dom = await page.content();
for (const m of dom.matchAll(/https?:[^\"'<>\\\s]+/g)) {
  const u=m[0].replace(/&amp;/g,'&');
  if (/spectrum|\.glb|\.gltf|manifest|scene|customiz/i.test(u)) urls.add(u);
}
const scriptSrcs=await page.locator('script[src]').evaluateAll(es=>es.map(e=>e.src));
const frameSrcs=await page.locator('iframe[src]').evaluateAll(es=>es.map(e=>e.src));
for(const u of [...scriptSrcs,...frameSrcs]) if(/spectrum|customiz/i.test(u)) urls.add(u);

const out=[...urls].sort();
console.log('\n=== ASSET_CANDIDATES ===');
for(const u of out) console.log(u);
console.log('=== END_ASSET_CANDIDATES ===');
fs.writeFileSync('stanley-assets.txt',out.join('\n'));
await page.screenshot({path:'stanley-page.png',fullPage:true});
await browser.close();
