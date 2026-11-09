let ctx = null;
let master = null;
let musicGain = null;
let sfxGain = null;
let musicTimer = null;
let musicStep = 0;
let nextNoteTime = 0;
const state = { music: true, sfx: true, musicWanted: false };

export function unlockAudio() {
  if (!ctx) {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = state.music ? 0.12 : 0;
    musicGain.connect(master);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = state.sfx ? 0.5 : 0;
    sfxGain.connect(master);
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return true;
}

export function setAudioPrefs({ music, sfx }) {
  state.music = music;
  state.sfx = sfx;
  if (musicGain) musicGain.gain.value = music ? 0.12 : 0;
  if (sfxGain) sfxGain.gain.value = sfx ? 0.5 : 0;
}

function tone({ freq, to, dur = 0.12, type = "square", vol = 0.4, at = 0, out = sfxGain }) {
  if (!ctx || !out) return;
  const t0 = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(out);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

export function sfx(name) {
  if (!ctx || !state.sfx) return;
  switch (name) {
    case "collect":
      tone({ freq: 660, to: 1320, dur: 0.12, type: "triangle", vol: 0.5 });
      tone({ freq: 1320, dur: 0.08, type: "sine", vol: 0.25, at: 0.08 });
      break;
    case "warn":
      tone({ freq: 880, dur: 0.05, type: "square", vol: 0.12 });
      break;
    case "hit":
      tone({ freq: 160, to: 60, dur: 0.28, type: "sawtooth", vol: 0.5 });
      break;
    case "dash":
      tone({ freq: 300, to: 900, dur: 0.14, type: "sawtooth", vol: 0.2 });
      break;
    case "bump":
      tone({ freq: 120, dur: 0.05, type: "square", vol: 0.12 });
      break;
    case "exitOpen":
      [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.18, type: "triangle", vol: 0.35, at: i * 0.07 }));
      break;
    case "batch":
      [784, 988].forEach((f, i) => tone({ freq: f, dur: 0.12, type: "triangle", vol: 0.3, at: i * 0.08 }));
      break;
    case "win":
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ freq: f, dur: 0.22, type: "triangle", vol: 0.35, at: i * 0.09 }));
      break;
    case "fail":
      [392, 330, 262].forEach((f, i) => tone({ freq: f, dur: 0.22, type: "sawtooth", vol: 0.25, at: i * 0.12 }));
      break;
    case "tick":
      tone({ freq: 740, dur: 0.07, type: "sine", vol: 0.3 });
      break;
    case "go":
      tone({ freq: 1047, dur: 0.18, type: "sine", vol: 0.35 });
      break;
    case "click":
      tone({ freq: 600, dur: 0.04, type: "sine", vol: 0.15 });
      break;
  }
}

const BASS = [110, 110, 131, 98];
const ARP = [0, 7, 12, 7, 3, 10, 15, 10];

function scheduleMusic() {
  if (!ctx) return;
  while (nextNoteTime < ctx.currentTime + 0.25) {
    const beat = musicStep % 8;
    const bar = Math.floor(musicStep / 8) % BASS.length;
    const root = BASS[bar];
    const at = nextNoteTime - ctx.currentTime;
    if (beat % 4 === 0) tone({ freq: root / 2, dur: 0.3, type: "triangle", vol: 0.5, at, out: musicGain });
    tone({ freq: root * 2 * Math.pow(2, ARP[beat] / 12), dur: 0.12, type: "square", vol: 0.12, at, out: musicGain });
    nextNoteTime += 0.2;
    musicStep++;
  }
}

export function startMusic() {
  state.musicWanted = true;
  if (!ctx || musicTimer) return;
  nextNoteTime = ctx.currentTime + 0.05;
  musicTimer = setInterval(scheduleMusic, 80);
}

export function stopMusic() {
  state.musicWanted = false;
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
}
