// reader-core.js
const coreState = { epub:null, pdf:null };

export async function loadEpubFromArrayBuffer(buffer){
  if(typeof JSZip==='undefined') throw new Error('JSZip missing');
  const zip = await JSZip.loadAsync(buffer);
  const container = zip.file('META-INF/container.xml'); if(!container) throw new Error('EPUB container.xml missing');
  const containerXml = await container.async('string');
  const parser = new DOMParser();
  const cdom = parser.parseFromString(containerXml,'application/xml');
  const rootfile = cdom.querySelector('rootfile') || cdom.querySelector('container > rootfiles > rootfile');
  if(!rootfile) throw new Error('No <rootfile>');
  const rootPath = rootfile.getAttribute('full-path'); if(!rootPath) throw new Error('rootfile full-path missing');
  const opfFile = zip.file(rootPath); if(!opfFile) throw new Error('OPF not found');
  const opfXml = await opfFile.async('string');
  const opf = parser.parseFromString(opfXml,'application/xml');
  const manifest = new Map();
  const all = opf.getElementsByTagName('*');
  for(let i=0;i<all.length;i++){
    const el = all[i];
    if(el.localName==='item' && el.parentElement?.localName==='manifest'){
      manifest.set(el.getAttribute('id'), el.getAttribute('href'));
    }
  }
  const spineItems = [];
  for(let i=0;i<all.length;i++){
    const el = all[i];
    if(el.localName==='itemref' && el.parentElement?.localName==='spine'){
      const href = manifest.get(el.getAttribute('idref'));
      if(href){ spineItems.push({ id: 'ch-'+spineItems.length, path: resolve(rootPath, href) }); }
    }
  }
  if(!spineItems.length) throw new Error('No spine items');
  coreState.epub = { zip, rootPath, spineItems };
}
export function getEpubOutline(){
  if(!coreState.epub) return [];
  return coreState.epub.spineItems.map((_,i)=>({ id:'ch-'+i, label:'Chapter '+(i+1) }));
}
export async function getEpubUnit(chId){
  const { zip, spineItems } = coreState.epub || {};
  if(!zip) throw new Error('No EPUB');
  const item = spineItems.find(s=>s.id===chId); if(!item) throw new Error('Chapter not found');
  const entry = zip.file(item.path); if(!entry) throw new Error('Chapter file missing');
  const html = await entry.async('string');
  const doc = new DOMParser().parseFromString(html,'text/html');
  const body = doc.body;
  const blocks=[]; let idx=0;
  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_ELEMENT);
  const tags = new Set(['P','H1','H2','H3','H4','H5','H6','LI']);
  while(walker.nextNode()){
    const el=walker.currentNode; if(!tags.has(el.tagName)) continue;
    const text=(el.textContent||'').trim(); if(!text) continue;
    blocks.push({ id:'b-'+chId+'-'+(idx++), html: el.outerHTML, text });
  }
  let title = (doc.querySelector('h1,h2,h3,title')?.textContent||'').trim() || chId;
  return { id: chId, title, blocks, hasTextLayer:true };
}

export async function loadPdfFromArrayBuffer(buffer){
  const pdfjsLib = window.pdfjsLib||window['pdfjsLib']; if(!pdfjsLib) throw new Error('pdf.js missing');
  if(pdfjsLib.GlobalWorkerOptions) pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const task = pdfjsLib.getDocument({ data: buffer }); const doc = await task.promise;
  coreState.pdf = { doc, numPages: doc.numPages };
}
export function getPdfOutline(){
  if(!coreState.pdf) return []; const n=coreState.pdf.numPages; const arr=[]; for(let i=1;i<=n;i++) arr.push({id:'page-'+i,label:'Page '+i}); return arr;
}
export async function getPdfUnit(id){
  const pdf = coreState.pdf; if(!pdf) throw new Error('No PDF');
  let p = typeof id==='string' && id.startsWith('page-') ? parseInt(id.split('-')[1],10) : parseInt(id,10);
  const page = await pdf.doc.getPage(p); const tc = await page.getTextContent();
  const blocks=[]; let y=null, line='', idx=0;
  function flush(){ const t=line.trim(); if(t){ blocks.push({id:'p'+p+'-b'+(idx++), text:t}); } line=''; }
  tc.items.forEach(it=>{ const s=(it.str||'').trim(); if(!s) return; const yy=(it.transform||[])[5]||0;
    if(y===null) y=yy; if(Math.abs(yy-y)>5){ flush(); y=yy; } if(line) line+=' '; line+=s; });
  flush(); const has = blocks.length>0;
  return { id:'page-'+p, title:'Page '+p, blocks, hasTextLayer: has };
}
export function segmentBlocks(blocks){
  const out=[]; let order=0;
  blocks.forEach(b=>{ splitIntoSentences(b.text).forEach(s=> out.push({ id:'seg-'+b.id+'-'+(order++), text:s, blockId:b.id, order })); });
  return out;
}
function resolve(root, href){ const i=root.lastIndexOf('/'); const base = i===-1? '' : root.slice(0,i+1); return base + href; }
function splitIntoSentences(t){ const s=(t||'').trim(); if(!s) return []; const arr=[]; const re=/[^.!?]+[.!?]+["']?\s*|[^.!?]+$/g; let m;
  while((m=re.exec(s))!==null){ const seg=m[0].trim(); if(seg) arr.push(seg); } if(!arr.length) arr.push(s); return arr; }
