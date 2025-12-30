// ui-reader.js
import { loadEpubFromArrayBuffer, getEpubOutline, getEpubUnit,
         loadPdfFromArrayBuffer, getPdfOutline, getPdfUnit, segmentBlocks } from './reader-core.js';
import * as piperTts from './tts-piper.js';

const params = new URLSearchParams(location.search);
const file = params.get('file');
const name = params.get('name') || file || 'Untitled';
const typeHint = params.get('type');
const bookKey = params.get('key') || file || name;

const BOOKMARK_KEY = 'auroraReaderBookmarks_v1';
let mode = null; let currentUnitId = null;

// DOM Elements
const pageEl = document.getElementById('page');
const bookTitleEl = document.getElementById('bookTitle');
const ttsOverlay = document.getElementById('ttsOverlay');
const ttsStatus = document.getElementById('ttsStatus');
const voiceSelect = document.getElementById('piperVoice');
const piperLoading = document.getElementById('piperLoading');

bookTitleEl.textContent = name;

// --- 1. ERROR HANDLER / FALLBACK ---
function showManualUpload(errorMsg) {
  pageEl.innerHTML = `
    <div style="text-align:center; padding: 40px; color: #cbd5e1;">
      <div style="font-size: 40px; margin-bottom: 20px;">🔒</div>
      <h3 style="margin:0 0 10px 0;">Security Restriction</h3>
      <p style="font-size: 14px; color: #9aa3c2; margin-bottom: 20px;">
        Your browser blocked the automatic loading of <b>"${file}"</b>.<br>
        (This is normal when opening files directly without a web server).
      </p>
      
      <div style="background: #1e293b; padding: 20px; border-radius: 12px; display: inline-block; border: 1px dashed #475569;">
        <label for="manualInput" style="display: block; margin-bottom: 10px; font-weight: bold; cursor: pointer; color: #22c55e;">
          Click here to select "${file}" manually
        </label>
        <input type="file" id="manualInput" accept=".epub,.pdf" style="display:none">
        <button onclick="document.getElementById('manualInput').click()" 
          style="background:#22c55e; border:none; color:black; font-weight:bold; padding:8px 16px; border-radius:6px; cursor:pointer;">
          Select File
        </button>
      </div>
      <p style="font-size:12px; color:#ef4444; margin-top:20px;">Technical Reason: ${errorMsg}</p>
    </div>
  `;

  document.getElementById('manualInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(evt) {
      processBookData(evt.target.result);
    };
    reader.readAsArrayBuffer(file);
  });
}

// --- 2. BOOT LOGIC ---
async function boot(){
  if(!file){ pageEl.innerHTML='<div style="color:#9aa3c2;padding:20px">No file specified in URL.</div>'; return; }
  
  try {
    // Try automatic fetch first
    const res = await fetch('./books/'+file);
    if(!res.ok) throw new Error(`File not found (Status ${res.status})`);
    const buffer = await res.arrayBuffer();
    await processBookData(buffer);
  } catch(e) {
    console.warn("Auto-load failed, showing manual fallback:", e);
    showManualUpload(e.message);
  }
}

async function processBookData(buffer) {
  pageEl.innerHTML = '<div style="text-align:center;padding:50px;color:#9aa3c2">Parsing book...</div>';
  try {
    let type = typeHint || (file.toLowerCase().endsWith('.pdf')?'pdf':'epub');
    
    // Auto-detect if user picked a file with wrong extension
    if(file.toLowerCase().endsWith('.epub') && !typeHint) type = 'epub';
    
    if(type==='epub'){
      await loadEpubFromArrayBuffer(buffer);
      const outline=getEpubOutline(); renderOutline(outline,true);
      const bm = (marksLoad()[bookKey]||{}); 
      const preferred = (bm.mode==='epub' && outline.some(o=>o.id===bm.unitId)) ? bm.unitId : outline[0]?.id;
      if(preferred) await displayEpub(preferred);
    } else {
      await loadPdfFromArrayBuffer(buffer);
      const outline=getPdfOutline(); renderOutline(outline,true);
      const bm = (marksLoad()[bookKey]||{});
      const preferred = (bm.mode==='pdf' && bm.unitId) ? bm.unitId : 'page-1';
      await displayPdf(preferred);
    }
  } catch(e) {
    console.error(e);
    pageEl.innerHTML = `<div style="color:#ef4444;padding:20px"><b>Error parsing book:</b><br>${e.message}</div>`;
  }
}


// --- 3. TTS SETUP (Piper) ---
if(piperTts && piperTts.AVAILABLE_VOICES) {
  piperTts.AVAILABLE_VOICES.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = v.name;
    voiceSelect.appendChild(opt);
  });
  voiceSelect.onchange = () => piperTts.setVoice(voiceSelect.value);

  piperTts.onSegmentStart((segId) => {
    highlight(segId);
    if(segId) ttsStatus.textContent = 'Speaking...';
    piperLoading.style.display = 'none';
  });

  piperTts.onFinished(() => {
    ttsStatus.textContent = 'Finished';
    highlight(null);
  });
}

// Controls
document.getElementById('playBtn').onclick = () => {
  piperLoading.style.display = 'block';
  piperTts.play();
  ttsStatus.textContent = 'Playing...';
};
document.getElementById('pauseBtn').onclick = () => { piperTts.pause(); ttsStatus.textContent = 'Paused'; };
document.getElementById('stopBtn').onclick = () => { piperTts.stop(); ttsStatus.textContent = 'Stopped'; piperLoading.style.display='none'; };
document.getElementById('rateSlider').oninput = (e) => {
  const v = parseFloat(e.target.value) || 1;
  document.getElementById('rateLabel').textContent = v.toFixed(1) + 'x';
  piperTts.setRate(v);
};

// UI Handling
document.getElementById('ttsBtn').onclick = () => {
  ttsOverlay.classList.add('open');
  prepareTextForTts();
};
document.getElementById('closeTts').onclick = () => ttsOverlay.classList.remove('open');
document.getElementById('ttsBackdrop').onclick = () => ttsOverlay.classList.remove('open');

function prepareTextForTts(){
  const blocks = Array.from(document.querySelectorAll('.block'));
  const segs = blocks.map(el => ({
    id: el.getAttribute('data-block-id'),
    text: el.innerText
  })).filter(s => s.text.trim().length > 0);
  
  if(segs.length === 0){
    ttsStatus.textContent = 'No text on page';
    return;
  }
  const st = piperTts.getStatus();
  if(!st.playing && !st.paused){
    piperTts.setSegments(segs);
    ttsStatus.textContent = 'Ready (' + segs.length + ' segments)';
  }
}

// --- 4. NAVIGATION & RENDERING ---
function marksLoad(){ try{return JSON.parse(localStorage.getItem(BOOKMARK_KEY)||'{}')}catch(e){return{}} }
function marksSave(m){ localStorage.setItem(BOOKMARK_KEY, JSON.stringify(m)); }
function setBookmark(unitId){ const m=marksLoad(); m[bookKey]={ unitId, mode }; marksSave(m); }

function highlight(blockId){
  document.querySelectorAll('.block').forEach(el=>el.classList.remove('active'));
  if(!blockId) return;
  const el=document.querySelector('[data-block-id="'+blockId+'"]');
  if(el){ el.classList.add('active'); el.scrollIntoView({behavior:'smooth',block:'center'}); }
}

async function renderOutline(items, isRoot=false){
  const el = document.getElementById('navList');
  if(isRoot) el.innerHTML='';
  if(!items||!items.length){ if(isRoot) el.innerHTML='<div style="padding:10px;color:#9aa3c2">No chapters found</div>'; return; }
  const ul = document.createElement('ul');
  ul.style.listStyle='none'; ul.style.paddingLeft=isRoot?'0':'20px'; ul.style.margin='0';
  items.forEach(it=>{
    const li=document.createElement('li'); li.style.marginBottom='8px';
    const a=document.createElement('a'); a.textContent=it.title||'Untitled'; a.style.color='var(--text)'; a.style.textDecoration='none'; a.style.cursor='pointer';
    a.onclick=()=>{ displayUnit(it.id); document.getElementById('navOverlay').classList.remove('open'); };
    li.appendChild(a);
    if(it.children && it.children.length){
      const sub = document.createElement('div');
      renderOutline(it.children).then(n=>{ if(n) sub.appendChild(n); });
      li.appendChild(sub);
    }
    ul.appendChild(li);
  });
  if(isRoot) el.appendChild(ul);
  return ul;
}

function renderPage(unit){
  const unitTitleEl = document.getElementById('unitTitle');
  unitTitleEl.textContent = unit.title || 'Reader';
  currentUnitId = unit.id;
  setBookmark(unit.id);
  pageEl.innerHTML = '';
  
  if(!unit.blocks || unit.blocks.length===0){
    pageEl.innerHTML = '<div style="padding:20px;color:#9aa3c2;text-align:center">Empty page</div>';
    return;
  }
  
  const segments = segmentBlocks(unit.blocks);
  segments.forEach(seg => {
    const d = document.createElement('div');
    d.className = 'block';
    d.setAttribute('data-block-id', seg.id);
    d.textContent = seg.text;
    pageEl.appendChild(d);
  });
  
  if(ttsOverlay.classList.contains('open')){
    piperTts.stop();
    prepareTextForTts();
  }
}

async function displayEpub(id){
  try{
    const u = await getEpubUnit(id);
    mode='epub'; renderPage(u);
  }catch(e){ console.error(e); pageEl.innerHTML='Error loading chapter'; }
}

async function displayPdf(id){
  try{
    const u = await getPdfUnit(id);
    mode='pdf'; renderPage(u);
  }catch(e){ console.error(e); pageEl.innerHTML='Error loading PDF page'; }
}

function displayUnit(id){
  if(mode==='epub') displayEpub(id);
  else if(mode==='pdf') displayPdf(id);
}

document.getElementById('menuBtn').onclick=()=>{ document.getElementById('navOverlay').classList.add('open'); };
document.getElementById('closeNav').onclick=()=>{ document.getElementById('navOverlay').classList.remove('open'); };
document.getElementById('navBackdrop').onclick=()=>{ document.getElementById('navOverlay').classList.remove('open'); };

const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
prevBtn.onclick = async () => { alert('Use Outline to navigate chapters'); };
nextBtn.onclick = async () => { alert('Use Outline to navigate chapters'); };
document.getElementById('backBtn').onclick=()=>{ location.href='./index.html'; };

// Start
boot();