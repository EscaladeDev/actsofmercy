// tts-webspeech.js
let segments=[], idx=0, playing=false, paused=false, rate=1.0;
let onStart=null, onDone=null;
export function setSegments(s){ stop(); segments=Array.isArray(s)?s:[]; idx=0; }
export function setRate(v){ rate=typeof v==='number'?v:1.0; }
export function onSegmentStart(cb){ onStart=typeof cb==='function'?cb:null; }
export function onFinished(cb){ onDone=typeof cb==='function'?cb:null; }
export function play(){ const synth=window.speechSynthesis; if(!synth||!segments.length) return;
  if(paused){ synth.resume(); paused=false; playing=true; return; }
  if(playing) return; playing=true; speakNext(); }
export function pause(){ const s=window.speechSynthesis; if(!s) return; if(!playing) return; s.pause(); paused=true; playing=false; }
export function stop(){ const s=window.speechSynthesis; if(s) s.cancel(); playing=false; paused=false; idx=0; if(onStart) onStart(null); }
export function getStatus(){ return { playing, paused, index:idx, total:segments.length }; }
function speakNext(){ const synth=window.speechSynthesis; if(!synth||!playing) return;
  if(idx>=segments.length){ playing=false; paused=false; idx=0; if(onStart) onStart(null); if(onDone) onDone(); return; }
  const seg=segments[idx]; const u=new SpeechSynthesisUtterance(seg.text); u.rate=rate;
  u.onstart=()=>{ if(onStart&&seg.blockId) onStart(seg.blockId); };
  u.onend=()=>{ if(!playing) return; idx++; speakNext(); };
  u.onerror=()=>{ if(!playing) return; idx++; speakNext(); };
  synth.speak(u);
}
