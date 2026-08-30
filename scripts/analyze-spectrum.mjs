import fs from 'node:fs';

const url='https://cdn.spectrumcustomizer.com/stanley/frontend/js/customizer.min.js';
const r=await fetch(url);
console.log('FETCH',r.status,r.headers.get('content-type'),r.headers.get('content-length'));
const text=await r.text();
fs.writeFileSync('customizer.min.js',text);
console.log('BYTES',text.length);

const urls=[...new Set([...text.matchAll(/https?:\\?\/\\?\/[^\"'`\\s)]+/g)].map(m=>m[0].replaceAll('\\/','/')))];
console.log('\n=== URL STRINGS ===');
for(const u of urls) console.log(u);
console.log('=== END URL STRINGS ===');

const terms=['api.spectrumcustomizer','cdn.spectrumcustomizer','spectrumLoadProduct','loadProduct','productId','product_id','manifest','scene','model','asset','mesh','glb','gltf','.bin','.json','ktx','basis','wasm','three','babylon','3dtrue','fetch(','XMLHttpRequest','axios'];
for(const term of terms){
  let p=0,c=0;
  while((p=text.toLowerCase().indexOf(term.toLowerCase(),p))>=0 && c<20){
    console.log(`\n=== AROUND ${term} #${c+1} ===\n${text.slice(Math.max(0,p-800),Math.min(text.length,p+1600))}`);
    p+=term.length;c++;
  }
}
