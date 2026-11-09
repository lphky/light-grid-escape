export const STORAGE_KEY = "light-grid-escape";
export const SAVE_VERSION = 1;

export const DEFAULT_SETTINGS = {
  music: true,
  sfx: true,
  assist: false,
  reducedMotion: false,
  leftHanded: false,
};

export function emptySave() {
  return {
    version: SAVE_VERSION,
    unlocked: 1,
    lastLevel: 1,
    started: false,
    records: { normal: {}, assist: {} },
    settings: { ...DEFAULT_SETTINGS },
  };
}

function sanitizeRecord(r) {
  if (!r || typeof r !== "object") return null;
  const stars = Math.min(3, Math.max(1, Math.floor(Number(r.stars) || 0)));
  const score = Math.max(0, Math.floor(Number(r.score) || 0));
  const time = Number(r.time);
  if (!Number.isFinite(time) || time < 0 || !(Number(r.stars) >= 1)) return null;
  return { stars, score, time, hits: Math.max(0, Math.floor(Number(r.hits) || 0)) };
}

export function sanitizeSave(raw, levelCount) {
  const out = emptySave();
  if (!raw || typeof raw !== "object" || raw.version !== SAVE_VERSION) return out;
  const unlocked = Math.floor(Number(raw.unlocked));
  out.unlocked = Number.isFinite(unlocked) ? Math.min(levelCount, Math.max(1, unlocked)) : 1;
  const last = Math.floor(Number(raw.lastLevel));
  out.lastLevel = Number.isFinite(last) ? Math.min(out.unlocked, Math.max(1, last)) : 1;
  out.started = !!raw.started;
  for (const mode of ["normal", "assist"]) {
    const src = raw.records?.[mode];
    if (!src || typeof src !== "object") continue;
    for (let id = 1; id <= levelCount; id++) {
      const r = sanitizeRecord(src[id]);
      if (r) out.records[mode][id] = r;
    }
  }
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    if (typeof raw.settings?.[k] === "boolean") out.settings[k] = raw.settings[k];
  }
  return out;
}

export function loadSave(levelCount, storage = globalThis.localStorage) {
  try {
    const text = storage?.getItem(STORAGE_KEY);
    if (!text) return { save: emptySave(), ok: true };
    return { save: sanitizeSave(JSON.parse(text), levelCount), ok: true };
  } catch {
    return { save: emptySave(), ok: false };
  }
}

export function writeSave(save, storage = globalThis.localStorage) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(storage = globalThis.localStorage) {
  try {
    storage?.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function applyResult(save, levelId, levelCount, result, assist) {
  if (!result || result.practice) return { save, newBest: false };
  const mode = assist ? "assist" : "normal";
  const prev = save.records[mode][levelId];
  const rec = { stars: result.stars, score: result.score, time: Math.round(result.elapsed * 100) / 100, hits: result.hits };
  let newBest = false;
  const merged = prev ? { ...prev } : null;
  if (!prev) {
    save.records[mode][levelId] = rec;
    newBest = true;
  } else {
    if (rec.score > prev.score) { merged.score = rec.score; newBest = true; }
    if (rec.stars > prev.stars) { merged.stars = rec.stars; newBest = true; }
    if (rec.time < prev.time) { merged.time = rec.time; merged.hits = rec.hits; newBest = true; }
    save.records[mode][levelId] = merged;
  }
  save.unlocked = Math.min(levelCount, Math.max(save.unlocked, levelId + 1));
  return { save, newBest };
}
