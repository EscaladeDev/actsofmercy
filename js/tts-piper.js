// tts-piper.js
import * as tts from 'https://cdn.jsdelivr.net/npm/@mintplex-labs/piper-tts-web@1.0.4/+esm';

// --- Configuration ---
// You can add more voices here if you find their IDs on the Piper GitHub
export const AVAILABLE_VOICES = [
  { id: 'en_US-hfc_female-medium', name: 'US Female (HFC)' },
  { id: 'en_US-hfc_male-medium',   name: 'US Male (HFC)' },
  { id: 'en_GB-cori-medium',       name: 'UK Female (Cori)' },
  { id: 'en_GB-alan-medium',       name: 'UK Male (Alan)' }
];

let segments = [];
let index = 0;
let isPlaying = false;
let isPaused = false;
let currentAudio = null;
let currentVoiceId = AVAILABLE_VOICES[0].id;
let rate = 1.0;

// Callbacks
let onStart = null;
let onDone = null;

// Initialize automatically
(async () => {
  try {
    const stored = await tts.stored();
    console.log('Piper initialized. Cached voices:', stored);
  } catch (e) {
    console.warn('Piper init warning (ignore if offline):', e);
  }
})();

export function setSegments(s) {
  stop();
  segments = Array.isArray(s) ? s : [];
  index = 0;
}

export function setRate(v) {
  rate = typeof v === 'number' ? v : 1.0;
  if (currentAudio) currentAudio.playbackRate = rate;
}

export function setVoice(vid) {
  currentVoiceId = vid;
}

export function onSegmentStart(cb) { onStart = cb; }
export function onFinished(cb) { onDone = cb; }

export function getStatus() {
  return { playing: isPlaying, paused: isPaused, index, total: segments.length };
}

export async function play() {
  if (segments.length === 0) return;

  if (isPaused && currentAudio) {
    currentAudio.play();
    isPaused = false;
    isPlaying = true;
    return;
  }

  if (isPlaying) return;
  isPlaying = true;
  isPaused = false;
  
  processQueue();
}

export function pause() {
  if (currentAudio) {
    currentAudio.pause();
    isPaused = true;
    isPlaying = false;
  }
}

export function stop() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  isPlaying = false;
  isPaused = false;
  index = 0;
  if (onStart) onStart(null);
}

async function processQueue() {
  if (!isPlaying || isPaused) return;

  if (index >= segments.length) {
    stop();
    if (onDone) onDone();
    return;
  }

  const seg = segments[index];
  if (onStart) onStart(seg.id);

  try {
    const text = seg.text.trim();
    if (!text) {
      index++;
      processQueue();
      return;
    }

    // Generate Audio (Downloads model if needed)
    const audioBlob = await tts.predict({
      text: text,
      voiceId: currentVoiceId,
    });

    currentAudio = new Audio(URL.createObjectURL(audioBlob));
    currentAudio.playbackRate = rate;
    
    currentAudio.onended = () => {
      index++;
      processQueue();
    };
    
    // Safety timeout in case audio hangs
    currentAudio.onerror = (e) => {
      console.error('Audio playback failed', e);
      index++;
      processQueue();
    };

    await currentAudio.play();

  } catch (e) {
    console.error('Piper generation error:', e);
    index++; // Skip bad segment
    processQueue();
  }
}