const url='https://cdn.spectrumcustomizer.com/stanley/frontend/js/customizer.min.js';
const r=await fetch(url);
const text=await r.text();
console.log('FETCH',r.status,'BYTES',text.length);

function contexts(term, before=900, after=2200, max=10){
  let p=0,c=0;
  while((p=text.indexOf(term,p))>=0 && c<max){
    console.log(`\n=== ${term} #${++c} @${p} ===\n${text.slice(Math.max(0,p-before),Math.min(text.length,p+after))}`);
    p+=term.length;
  }
}
for(const t of [
  'getModelsPath','modelsPath','getEnvironmentPath','environmentPath',
  'spectrumLoadProduct','loadProduct','structure.json','model.json',
  'cdn.spectrumcustomizer.com','api.spectrumcustomizer.com','product/'
]) contexts(t);

// Pull likely literal path/config assignments without dumping the whole minified bundle.
console.log('\n=== LIKELY PATH LITERALS ===');
for(const m of text.matchAll(/[^,;{}]{0,120}(?:models|environment|assets|cdn|api)[^,;{}]{0,220}/gi)){
  const s=m[0];
  if(/path|url|spectrumcustomizer|structure|model/i.test(s)) console.log(s);
}
