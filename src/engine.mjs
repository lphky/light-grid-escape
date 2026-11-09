export const SIM_DT = 1 / 60;
export const MOVE_TIME = 0.18;
export const DASH_CELL_TIME = 0.075;
export const DASH_CELLS = 2;
export const DASH_COOLDOWN = 3;
export const INVULN_TIME = 1;
export const COUNTDOWN_TIME = 3;
export const BREAK_TIME = 2;
export const MAX_LIVES = 3;
export const ASSIST_SPEED = 0.75;
export const MIN_WARN = 0.8;

export const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const DIR8 = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
const BATCH_CHARS = { E: 0, "2": 1, "3": 2 };

export const key = (x, y) => x + "," + y;
const mod = (a, n) => ((a % n) + n) % n;

function compileHazard(def) {
  const h = { type: def.type, name: def.name || "紅格", tip: def.tip || "", def };
  if (def.type === "static") {
    const set = new Set(def.cells.map(([x, y]) => key(x, y)));
    h.cells = set;
    h.minWarn = Infinity;
    h.at = (t, x, y) => (set.has(key(x, y)) ? 2 : 0);
  } else if (def.type === "pulse") {
    const set = new Set(def.cells.map(([x, y]) => key(x, y)));
    const { period, warn, on } = def;
    const offset = def.offset || 0;
    if (!(warn + on <= period)) throw new Error("pulse 時段超過週期");
    h.cells = set;
    h.minWarn = warn;
    h.at = (t, x, y) => {
      if (!set.has(key(x, y))) return 0;
      const p = mod(t + offset, period);
      return p < warn ? 1 : p < warn + on ? 2 : 0;
    };
  } else if (def.type === "mover") {
    const shape = new Set(def.shape.map(([x, y]) => key(x, y)));
    const { path, step } = def;
    const n = path.length;
    h.minWarn = step;
    h.at = (t, x, y) => {
      const k = Math.floor(t / step) % n;
      const cur = path[k];
      const nxt = path[(k + 1) % n];
      if (cur && shape.has(key(x - cur[0], y - cur[1]))) return 2;
      if (nxt && shape.has(key(x - nxt[0], y - nxt[1]))) return 1;
      return 0;
    };
  } else if (def.type === "rotor") {
    const { center, length, step } = def;
    const arms = def.arms || 1;
    const dir = def.clockwise === false ? -1 : 1;
    const start = def.start || 0;
    const frames = [];
    for (let k = 0; k < 8; k++) {
      const set = new Set();
      for (let a = 0; a < arms; a++) {
        const d = DIR8[mod(start + dir * k + (a * 8) / arms, 8)];
        for (let i = 1; i <= length; i++) set.add(key(center[0] + d[0] * i, center[1] + d[1] * i));
      }
      frames.push(set);
    }
    h.minWarn = step;
    h.at = (t, x, y) => {
      const k = Math.floor(t / step) % 8;
      const c = key(x, y);
      if (frames[k].has(c)) return 2;
      if (frames[(k + 1) % 8].has(c)) return 1;
      return 0;
    };
  } else {
    throw new Error("未知機關：" + def.type);
  }
  return h;
}

export function normalizeLevel(def) {
  if (def.__normalized) return def;
  const h = def.map.length;
  const w = def.map[0].length;
  const tiles = [];
  let start = null;
  let exit = null;
  const batches = [];
  const statics = [];
  for (let y = 0; y < h; y++) {
    if (def.map[y].length !== w) throw new Error(`${def.id} 第${y}行長度不一致`);
    for (let x = 0; x < w; x++) {
      const ch = def.map[y][x];
      let tile = "floor";
      if (ch === "#") tile = "wall";
      else if (ch === "S") tile = "safe";
      else if (ch === "P") { tile = "safe"; start = [x, y]; }
      else if (ch === "X") { tile = "exit"; exit = [x, y]; }
      else if (ch in BATCH_CHARS) { (batches[BATCH_CHARS[ch]] ||= []).push([x, y]); }
      else if (ch === "R") statics.push([x, y]);
      else if (ch !== ".") throw new Error(`${def.id} 未知地圖字元 ${ch}`);
      tiles.push(tile);
    }
  }
  const staticHazard = statics.length
    ? compileHazard({ type: "static", cells: statics, name: "固定紅格", tip: "紅色交叉紋格一直危險，要繞路。" })
    : null;
  const rawStages = def.stages || [{ hazards: def.hazards || [], batches: batches.filter(Boolean) }];
  const stages = rawStages.map((s) => {
    const hazards = (s.hazards || []).map(compileHazard);
    if (staticHazard) hazards.unshift(staticHazard);
    return {
      name: s.name || "",
      hazards,
      batches: s.batches || (s.energy ? [s.energy] : []),
      start: s.start || start,
    };
  });
  const totalEnergy = stages.reduce((n, s) => n + s.batches.reduce((m, b) => m + b.length, 0), 0);
  return { ...def, __normalized: true, w, h, tiles, start, exit, stages, totalEnergy };
}

export function tileAt(L, x, y) {
  if (x < 0 || y < 0 || x >= L.w || y >= L.h) return "out";
  return L.tiles[y * L.w + x];
}

export function passable(L, x, y) {
  const t = tileAt(L, x, y);
  return t !== "out" && t !== "wall";
}

export function createGame(level, opts = {}) {
  const L = normalizeLevel(level);
  const s = {
    L,
    assist: !!opts.assist,
    practice: !!opts.practice,
    status: "countdown",
    countdown: COUNTDOWN_TIME,
    frame: 0,
    t: 0,
    hz: 0,
    timeLeft: L.time,
    stage: 0,
    batch: 0,
    energy: new Set(),
    collected: 0,
    lives: MAX_LIVES,
    hits: 0,
    invuln: 0,
    dashCd: 0,
    dashReq: false,
    queued: null,
    held: [],
    breakLeft: 0,
    exitOpen: false,
    events: [],
    failReason: null,
    lastHit: null,
    grace: null,
    snapshot: null,
    result: null,
    player: { x: 0, y: 0, tx: 0, ty: 0, prog: 0, dur: MOVE_TIME, moving: false, dashLeft: 0, facing: "right" },
  };
  enterStage(s, 0, true);
  return s;
}

export function cloneGame(s) {
  return {
    ...s,
    player: { ...s.player },
    held: [...s.held],
    energy: new Set(s.energy),
    events: [],
    snapshot: s.snapshot && { ...s.snapshot },
    lastHit: s.lastHit && { ...s.lastHit },
  };
}

function placePlayer(s, pos) {
  const p = s.player;
  p.x = p.tx = pos[0];
  p.y = p.ty = pos[1];
  p.prog = 0;
  p.moving = false;
  p.dashLeft = 0;
}

function loadBatch(s) {
  const batch = s.L.stages[s.stage].batches[s.batch] || [];
  s.energy = new Set(batch.map(([x, y]) => key(x, y)));
}

function enterStage(s, i, place) {
  s.stage = i;
  s.batch = 0;
  s.hz = 0;
  s.breakLeft = 0;
  s.grace = null;
  loadBatch(s);
  if (place) placePlayer(s, s.L.stages[i].start);
  s.snapshot = { timeLeft: s.timeLeft, hits: s.hits, collected: s.collected, t: s.t };
}

export function retryStage(s) {
  const snap = s.snapshot;
  s.timeLeft = snap.timeLeft;
  s.hits = snap.hits;
  s.collected = snap.collected;
  s.t = snap.t;
  s.lives = MAX_LIVES;
  s.invuln = 0;
  s.dashCd = 0;
  s.exitOpen = false;
  s.failReason = null;
  s.lastHit = null;
  s.result = null;
  clearInput(s);
  enterStage(s, s.stage, true);
  s.status = "countdown";
  s.countdown = COUNTDOWN_TIME;
}

export function beginCountdown(s, seconds = COUNTDOWN_TIME) {
  if (s.status !== "playing" && s.status !== "countdown") return;
  clearInput(s);
  s.status = "countdown";
  s.countdown = seconds;
}

export function pressDir(s, dir) {
  if (!DIRS[dir]) return;
  if (!s.held.includes(dir)) s.held.push(dir);
  if (s.status === "playing") s.queued = dir;
}

export function releaseDir(s, dir) {
  s.held = s.held.filter((d) => d !== dir);
}

export function clearInput(s) {
  s.held = [];
  s.queued = null;
  s.dashReq = false;
}

export function dashUnlocked(s) {
  return !!s.L.dash;
}

export function requestDash(s) {
  if (!dashUnlocked(s) || s.status !== "playing") return false;
  if (s.dashCd > 0) {
    s.events.push({ type: "dashCooldown" });
    return false;
  }
  s.dashReq = true;
  return true;
}

export function hazardClock(s) {
  return s.hz * (s.assist ? ASSIST_SPEED : 1);
}

export function inBreak(s) {
  return s.breakLeft > 0;
}

export function hazardInfo(s, x, y) {
  if (tileAt(s.L, x, y) !== "floor") return { level: 0, source: null };
  if (s.energy.has(key(x, y)) || s.grace === key(x, y)) return { level: 0, source: null };
  const t = hazardClock(s);
  let level = 0;
  let source = null;
  for (const h of s.L.stages[s.stage].hazards) {
    const v = h.at(t, x, y);
    if (v > level) {
      level = v;
      source = h;
      if (v === 2) break;
    }
  }
  return { level, source };
}

export function hazardAt(s, x, y) {
  return hazardInfo(s, x, y).level;
}

export function occupied(s) {
  const p = s.player;
  return p.moving && p.prog >= 0.5 ? [p.tx, p.ty] : [p.x, p.y];
}

function tryStart(s, dir, dur) {
  const p = s.player;
  p.facing = dir;
  const [dx, dy] = DIRS[dir];
  const nx = p.x + dx;
  const ny = p.y + dy;
  if (!passable(s.L, nx, ny)) return false;
  p.tx = nx;
  p.ty = ny;
  p.prog = 0;
  p.dur = dur;
  p.moving = true;
  return true;
}

function chooseNext(s) {
  const p = s.player;
  const held = s.held[s.held.length - 1] || null;
  if (s.dashReq) {
    s.dashReq = false;
    if (dashUnlocked(s) && s.dashCd <= 0) {
      const dir = s.queued || held || p.facing;
      s.queued = null;
      if (tryStart(s, dir, DASH_CELL_TIME)) {
        p.dashLeft = DASH_CELLS - 1;
        s.dashCd = DASH_COOLDOWN;
        s.events.push({ type: "dash" });
        return;
      }
    }
  }
  const dir = s.queued || held;
  s.queued = null;
  if (dir && !tryStart(s, dir, MOVE_TIME)) s.events.push({ type: "bump" });
}

function updateMovement(s, dt) {
  const p = s.player;
  if (p.moving) {
    p.prog += dt / p.dur;
    if (p.prog >= 1) {
      p.x = p.tx;
      p.y = p.ty;
      p.moving = false;
      p.prog = 0;
      if (p.dashLeft > 0) {
        p.dashLeft--;
        if (tryStart(s, p.facing, DASH_CELL_TIME)) return;
        p.dashLeft = 0;
      }
    }
  }
  if (!p.moving) chooseNext(s);
}

function fail(s, reason, source) {
  s.status = "failed";
  s.failReason = { reason, name: source?.name || "", tip: source?.tip || "" };
  clearInput(s);
  s.events.push({ type: "fail", reason });
}

export function starsFor(L, hits, elapsed) {
  if (hits === 0 && elapsed <= L.starTime + 1e-9) return 3;
  if (hits <= 1) return 2;
  return 1;
}

export function scoreFor(s) {
  return s.collected * 100 + s.lives * 200 + Math.max(0, Math.floor(s.timeLeft)) * 10;
}

function win(s) {
  s.status = "won";
  clearInput(s);
  const elapsed = s.t;
  s.result = s.practice
    ? { practice: true, elapsed, hits: s.hits }
    : { practice: false, elapsed, hits: s.hits, lives: s.lives, score: scoreFor(s), stars: starsFor(s.L, s.hits, elapsed) };
  s.events.push({ type: "win" });
}

function advanceBatch(s) {
  const st = s.L.stages[s.stage];
  if (s.batch + 1 < st.batches.length) {
    s.batch++;
    loadBatch(s);
    s.events.push({ type: "batch" });
  } else if (s.stage + 1 < s.L.stages.length) {
    const name = st.name;
    enterStage(s, s.stage + 1, false);
    s.breakLeft = BREAK_TIME;
    s.events.push({ type: "stageClear", name });
  } else if (s.L.exit) {
    s.exitOpen = true;
    s.events.push({ type: "exitOpen" });
  } else {
    win(s);
  }
}

export function step(s, dt = SIM_DT) {
  if (s.status === "countdown") {
    s.countdown -= dt;
    if (s.countdown <= 1e-9) {
      s.countdown = 0;
      s.status = "playing";
      s.queued = null;
      s.events.push({ type: "go" });
    }
    return;
  }
  if (s.status !== "playing") return;
  s.frame++;
  const breaking = inBreak(s);
  if (breaking) {
    s.breakLeft -= dt;
    if (s.breakLeft <= 1e-9) {
      s.breakLeft = 0;
      s.events.push({ type: "stageStart", stage: s.stage });
    }
  } else {
    s.t += dt;
    s.hz += dt;
    if (!s.practice) s.timeLeft -= dt;
  }
  s.invuln = Math.max(0, s.invuln - dt);
  s.dashCd = Math.max(0, s.dashCd - dt);
  updateMovement(s, dt);
  if (inBreak(s)) return;

  const [ox, oy] = occupied(s);
  if (s.grace && s.grace !== key(ox, oy)) s.grace = null;
  const { level, source } = hazardInfo(s, ox, oy);
  if (level === 2 && s.invuln <= 0) {
    s.lives--;
    s.hits++;
    s.invuln = INVULN_TIME;
    s.lastHit = { x: ox, y: oy, name: source?.name || "", at: s.t };
    s.events.push({ type: "hit", x: ox, y: oy });
    if (s.lives <= 0) return fail(s, "lives", source);
  }
  if (!s.practice && s.timeLeft <= 1e-9) {
    s.timeLeft = 0;
    return fail(s, "time", null);
  }
  const k = key(ox, oy);
  if (s.energy.has(k)) {
    s.energy.delete(k);
    s.grace = k;
    s.collected++;
    s.events.push({ type: "collect", x: ox, y: oy });
    if (s.energy.size === 0) advanceBatch(s);
  }
  if (s.status === "playing" && s.exitOpen && s.L.exit && ox === s.L.exit[0] && oy === s.L.exit[1]) win(s);
}

export function energyVisibility(s) {
  const m = s.L.memory;
  if (!m || s.assist) return "full";
  if (s.t < m.reveal) return "full";
  return mod(s.t - m.reveal, 4) < 0.6 ? "hint" : "hidden";
}
