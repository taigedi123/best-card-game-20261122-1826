// audio.js — small WebAudio sounds, synthesised, no audio files.
//
// The context is created on the first user gesture (browsers demand it),
// so calling these before anyone has clicked is a harmless no-op.

let audioCtx = null;
let muted = false;

function ensureAudio() {
  if (audioCtx) return audioCtx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  } catch (e) {
    audioCtx = null;
  }
  return audioCtx;
}

function unlockAudio() {
  const ctx = ensureAudio();
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

function tone(freq, startIn, duration, type, volume) {
  const ctx = ensureAudio();
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + (startIn || 0);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volume || 0.12, t0 + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

function playSound(name) {
  if (muted) return;
  if (name === 'play') {
    tone(523, 0, 0.12, 'triangle', 0.10);
    tone(784, 0.07, 0.14, 'triangle', 0.08);
  } else if (name === 'attack') {
    tone(180, 0, 0.16, 'sawtooth', 0.10);
    tone(90, 0.02, 0.2, 'square', 0.07);
  } else if (name === 'hurt') {
    tone(140, 0, 0.25, 'sawtooth', 0.09);
  } else if (name === 'heal') {
    tone(660, 0, 0.15, 'sine', 0.09);
    tone(880, 0.09, 0.2, 'sine', 0.08);
  } else if (name === 'draw') {
    tone(440, 0, 0.07, 'triangle', 0.06);
  } else if (name === 'error') {
    tone(160, 0, 0.15, 'square', 0.05);
  } else if (name === 'win') {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.13, 0.3, 'triangle', 0.11));
    tone(1318, 0.55, 0.5, 'triangle', 0.09);
  } else if (name === 'loss') {
    [392, 330, 262, 196].forEach((f, i) => tone(f, i * 0.16, 0.32, 'sine', 0.10));
  } else if (name === 'turn') {
    tone(587, 0, 0.1, 'triangle', 0.06);
  }
}

function toggleMute() {
  muted = !muted;
  return muted;
}
