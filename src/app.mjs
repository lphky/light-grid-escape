import { LEVELS } from "./levels.mjs";
import {
  SIM_DT, DASH_COOLDOWN, MAX_LIVES, createGame, step, pressDir, releaseDir, clearInput, requestDash,
  beginCountdown, retryStage, hazardAt, inBreak, normalizeLevel,
} from "./engine.mjs";
import { render } from "./render.mjs";
import { loadSave, writeSave, clearSave, applyResult, emptySave } from "./storage.mjs";
import { unlockAudio, setAudioPrefs, sfx, startMusic, stopMusic } from "./audio.mjs";

const $ = (id) => document.getElementById(id);
const COUNT = LEVELS.length;
const NORMALIZED = LEVELS.map(normalizeLevel);

let { save, ok: storageOk } = loadSave(COUNT);
let practiceTab = false;
let game = null;
let current = null;
let paused = false;
let acc = 0;
let lastFrame = 0;
let canvasSize = { w: 0, h: 0, dpr: 1 };
let bannerTimer = 0;
let lastWarnNear = false;
const fx = { hits: [], particles: [], trail: [] };
const openOverlays = [];

const canvas = $("board");
const ctx = canvas.getContext("2d");

function persist() {
  if (!writeSave(save)) $("storage-warning").hidden = false;
}

function applySettings() {
  const st = save.settings;
  document.body.classList.toggle("left-handed", st.leftHanded);
  document.body.classList.toggle("reduced", st.reducedMotion);
  setAudioPrefs({ music: st.music, sfx: st.sfx });
  $("btn-sound").textContent = st.music || st.sfx ? "♪" : "✕";
  $("btn-sound").setAttribute("aria-label", st.music || st.sfx ? "關閉聲音" : "開啟聲音");
  document.querySelectorAll("[data-setting]").forEach((el) => { el.checked = !!st[el.dataset.setting]; });
}

function reducedMotion() {
  return save.settings.reducedMotion || matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function detectTouch() {
  if (matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0) document.body.classList.add("touch");
}
detectTouch();
window.addEventListener("touchstart", () => document.body.classList.add("touch"), { passive: true, once: true });

function showScreen(name) {
  for (const id of ["home", "levels", "game"]) $("screen-" + id).hidden = id !== name;
  if (name === "home") renderHome();
  if (name === "levels") renderLevels();
  if (name !== "game") {
    stopMusic();
    game = null;
  }
}

function openOverlay(id) {
  const el = $(id);
  if (!el.hidden) return;
  el.hidden = false;
  openOverlays.push({ id, focus: document.activeElement });
  const first = el.querySelector(".btn.primary, button, input");
  first?.focus();
}

function closeOverlay(id) {
  const el = $(id);
  if (el.hidden) return;
  el.hidden = true;
  const i = openOverlays.findIndex((o) => o.id === id);
  if (i >= 0) {
    const [o] = openOverlays.splice(i, 1);
    if (o.focus && document.contains(o.focus) && !o.focus.closest("[hidden]")) o.focus.focus();
  }
}

function topOverlay() {
  return openOverlays.length ? openOverlays[openOverlays.length - 1].id : null;
}

function starsHtml(n, total = 3) {
  let h = "";
  for (let i = 0; i < total; i++) h += i < n ? "★" : '<span class="off">★</span>';
  return h;
}

function nextLevelToPlay() {
  return Math.min(save.unlocked, COUNT);
}

function renderHome() {
  const btn = $("btn-start");
  const n = nextLevelToPlay();
  if (!save.started) {
    btn.textContent = "開始闖關";
    $("home-progress").textContent = "第一次遊玩會由第一關教學開始。";
  } else {
    btn.textContent = `繼續闖關 · 第${n}關`;
    const cleared = LEVELS.filter((l) => save.records.normal[l.id] || save.records.assist[l.id]).length;
    const stars = LEVELS.reduce((s, l) => s + (save.records.normal[l.id]?.stars || 0), 0);
    $("home-progress").textContent = `已完成 ${cleared}／${COUNT} 關 · 星星 ${stars}／${COUNT * 3}`;
  }
  $("storage-warning").hidden = storageOk;
}

function renderLevels() {
  document.querySelectorAll(".mode-switch button").forEach((b) => {
    b.setAttribute("aria-checked", String((b.dataset.mode === "practice") === practiceTab));
  });
  $("mode-note").textContent = practiceTab
    ? "練習模式：不限時、不計分，也不會更新最佳紀錄。只可練習已解鎖的關卡。"
    : save.settings.assist
      ? "輔助模式已開啟：成績會另行記錄，同樣可解鎖下一關。"
      : "完成一關即解鎖下一關。星星與分數只計算標準模式。";
  const grid = $("level-grid");
  grid.innerHTML = "";
  for (const l of LEVELS) {
    const locked = l.id > save.unlocked;
    const rec = save.records.normal[l.id];
    const arec = save.records.assist[l.id];
    const b = document.createElement("button");
    b.type = "button";
    b.className = "level-card";
    b.disabled = locked;
    b.innerHTML = `
      <span class="num">第 ${l.id} 關 · <span class="zone">${l.zone}</span></span>
      <span class="name">${l.name}</span>
      <span class="stars" aria-label="${rec ? rec.stars + " 星" : "未有標準紀錄"}">${starsHtml(rec?.stars || 0)}</span>
      <span class="sub">${rec ? `最佳 ${rec.score} 分 · ${rec.time.toFixed(1)} 秒` : locked ? "完成上一關解鎖" : "未有紀錄"}${arec ? ` · 輔助 ${"★".repeat(arec.stars)}` : ""}</span>
      ${locked ? '<span class="lock">🔒 未解鎖</span>' : ""}`;
    b.setAttribute("aria-label", `第${l.id}關 ${l.name}${locked ? "，未解鎖" : ""}`);
    if (!locked) b.addEventListener("click", () => openIntro(l.id, practiceTab));
    grid.appendChild(b);
  }
}

const LEGEND = {
  floor: ["floor", "", "普通地板", "可行走，可能預警後變紅"],
  safe: ["safe", "✓", "綠色盾牌", "永遠安全"],
  energy: ["energy", "◆", "藍色能量", "踩上收集"],
  warn: ["warn", "", "琥珀斜紋", "即將變紅"],
  danger: ["danger", "✕", "紅色交叉", "碰到扣生命"],
  exit: ["exit", "⌂", "出口", "收集完成後開啟"],
  wall: ["wall", "", "牆柱", "不能通過"],
};

function legendHtml(keys) {
  return keys.map((k) => {
    const [cls, sym, name, desc] = LEGEND[k];
    return `<div class="legend-item"><span class="swatch ${cls}" aria-hidden="true">${sym}</span><span><b>${name}</b><small>${desc}</small></span></div>`;
  }).join("");
}

function openIntro(id, practice) {
  current = { id, practice: !!practice };
  const l = LEVELS[id - 1];
  const N = NORMALIZED[id - 1];
  $("intro-zone").textContent = `第 ${id} 關 · ${l.zone}`;
  $("intro-title").textContent = l.name;
  const badges = [`<span class="badge new">新：${l.newThing}</span>`];
  if (practice) badges.push('<span class="badge practice">練習模式</span>');
  if (save.settings.assist) badges.push('<span class="badge assist">輔助模式</span>');
  $("intro-badges").innerHTML = badges.join("");
  $("intro-goal").textContent = l.goal;
  $("intro-text").textContent = l.intro;
  const keys = new Set(["energy", "exit"]);
  if (id <= 3) ["floor", "safe", "warn", "danger"].forEach((k) => keys.add(k));
  if (l.map.some((r) => r.includes("#"))) keys.add("wall");
  $("intro-legend").innerHTML = id <= 5 ? legendHtml([...keys]) : "";
  const facts = [];
  facts.push(`能量：${N.totalEnergy} 個${N.stages.length > 1 ? `，分 ${N.stages.length} 段` : ""}${N.stages[0].batches.length > 1 ? `，分 ${N.stages[0].batches.length} 批出現` : ""}`);
  facts.push(practice ? "時間：練習模式不限時" : `時限：${l.time} 秒`);
  if (!practice) facts.push(`★★★ 目標：無傷，並在 ${l.starTime} 秒內完成`);
  if (l.dash) facts.push(document.body.classList.contains("touch") ? "衝刺：按「衝刺」鍵向前衝兩格" : "衝刺：按 Space 向前衝兩格");
  $("intro-facts").innerHTML = facts.map((f) => `<li>${f}</li>`).join("");
  $("btn-intro-back").textContent = "關卡選擇";
  openOverlay("ov-intro");
}

function startLevel(retryFromStage = false) {
  const l = LEVELS[current.id - 1];
  if (retryFromStage && game && game.stage > 0) {
    retryStage(game);
  } else {
    game = createGame(NORMALIZED[current.id - 1], { assist: save.settings.assist, practice: current.practice });
  }
  game.levelDef = l;
  paused = false;
  acc = 0;
  fx.hits = [];
  fx.particles = [];
  fx.trail = [];
  lastWarnNear = false;
  if (!save.started || save.lastLevel !== current.id) {
    save.started = true;
    save.lastLevel = current.id;
    persist();
  }
  showScreen("game");
  document.activeElement?.blur?.();
  $("hud-zone").textContent = `第 ${l.id} 關 · ${l.zone}`;
  $("hud-level").textContent = l.name;
  const modeChip = $("hud-mode");
  modeChip.hidden = !(game.practice || game.assist);
  modeChip.textContent = [game.practice ? "練習" : "", game.assist ? "輔助" : ""].filter(Boolean).join("・");
  $("hud-dash").hidden = !l.dash;
  document.querySelector(".kbd-hint").textContent = l.dash ? "方向鍵／WASD 移動 · Space 衝刺 · Esc 暫停" : "方向鍵／WASD 移動 · Esc 暫停";
  $("btn-dash").disabled = !l.dash;
  hideBanner();
  resizeCanvas();
  if (save.settings.music) startMusic();
}

function showBanner(text, kind = "", ms = 1800) {
  const b = $("banner");
  b.textContent = text;
  b.className = "banner show " + kind;
  clearTimeout(bannerTimer);
  if (ms) bannerTimer = setTimeout(hideBanner, ms);
}

function hideBanner() {
  $("banner").className = "banner";
}

function handleEvents() {
  if (!game) return;
  const evs = game.events;
  game.events = [];
  const now = performance.now();
  for (const e of evs) {
    switch (e.type) {
      case "go":
        sfx("go");
        if (current.id === 1 && game.collected === 0) showBanner(document.body.classList.contains("touch") ? "用方向盤移動，走到藍色菱形格" : "用方向鍵或 WASD 移動，走到藍色菱形格", "", 3500);
        else if (game.stage > 0) showBanner(game.L.stages[game.stage].name, "good");
        break;
      case "collect":
        sfx("collect");
        fx.particles.push({ x: e.x, y: e.y, at: now, seed: Math.random() * 6 });
        break;
      case "hit":
        sfx("hit");
        fx.hits.push({ x: e.x, y: e.y, at: now });
        showBanner(`受傷！剩餘生命 ${game.lives}`, "bad", 1200);
        if (navigator.vibrate && game.lives > 0) navigator.vibrate(80);
        break;
      case "dash":
        sfx("dash");
        break;
      case "dashCooldown":
        showBanner("衝刺冷卻中", "", 800);
        break;
      case "bump":
        break;
      case "batch":
        sfx("batch");
        showBanner("新一批能量出現！", "good");
        break;
      case "stageClear":
        sfx("batch");
        showBanner(`${(e.name || "").split("：")[0]}完成！兩秒安全時間，先看清下一段`, "good", 2000);
        break;
      case "stageStart":
        sfx("go");
        showBanner(game.L.stages[game.stage].name, "good");
        break;
      case "exitOpen":
        sfx("exitOpen");
        showBanner("出口已開啟！走進白紫色出口", "good", 2500);
        break;
      case "win":
        sfx("win");
        finishLevel();
        break;
      case "fail":
        sfx("fail");
        finishLevel();
        break;
    }
  }
}

function checkWarnSound() {
  if (!game || game.status !== "playing" || inBreak(game)) {
    lastWarnNear = false;
    return;
  }
  const p = game.player;
  const cells = [[p.x, p.y], [p.x + 1, p.y], [p.x - 1, p.y], [p.x, p.y + 1], [p.x, p.y - 1]];
  const near = cells.some(([x, y]) => hazardAt(game, x, y) === 1);
  if (near && !lastWarnNear) sfx("warn");
  lastWarnNear = near;
}

function finishLevel() {
  stopMusic();
  const g = game;
  const l = LEVELS[current.id - 1];
  const body = $("result-body");
  const actions = $("result-actions");
  actions.innerHTML = "";
  const addBtn = (label, cls, fn) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn " + cls;
    b.textContent = label;
    b.addEventListener("click", () => { closeOverlay("ov-result"); fn(); });
    actions.appendChild(b);
    return b;
  };
  const hasNext = current.id < COUNT;
  if (g.status === "won") {
    const r = g.result;
    if (r.practice) {
      $("result-title").textContent = "練習完成！";
      $("result-stars").innerHTML = "";
      body.innerHTML = `<p class="lead">用時 ${r.elapsed.toFixed(1)} 秒 · 受傷 ${r.hits} 次</p><p class="muted">練習模式不計分，也不會更新紀錄。</p>`;
    } else {
      const { newBest } = applyResult(save, current.id, COUNT, r, g.assist);
      persist();
      $("result-title").textContent = "成功逃出！";
      $("result-stars").innerHTML = starsHtml(r.stars);
      const remain = Math.max(0, Math.floor(g.timeLeft));
      body.innerHTML = `
        ${g.assist ? '<p><span class="badge assist">輔助模式成績（另行記錄）</span></p>' : ""}
        ${newBest ? '<p><span class="new-best">新紀錄！</span></p>' : ""}
        <ul class="cond">
          <li class="ok">★ 成功逃出 ✓</li>
          <li class="${r.hits <= 1 ? "ok" : "no"}">★★ 受傷不多於一次（受傷 ${r.hits} 次）${r.hits <= 1 ? "✓" : "✗"}</li>
          <li class="${r.stars === 3 ? "ok" : "no"}">★★★ 無傷，並在 ${l.starTime} 秒內完成（用時 ${r.elapsed.toFixed(1)} 秒）${r.stars === 3 ? "✓" : "✗"}</li>
        </ul>
        <table class="result-table">
          <tr><td>能量 ${g.collected} × 100</td><td>${g.collected * 100}</td></tr>
          <tr><td>剩餘生命 ${g.lives} × 200</td><td>${g.lives * 200}</td></tr>
          <tr><td>剩餘時間 ${remain} 秒 × 10</td><td>${remain * 10}</td></tr>
          <tr class="total"><td>總分</td><td>${r.score}</td></tr>
        </table>`;
    }
    if (hasNext && current.id + 1 <= save.unlocked) addBtn("下一關", "primary", () => openIntro(current.id + 1, current.practice));
    addBtn("再挑戰", hasNext && current.id + 1 <= save.unlocked ? "" : "primary", () => startLevel());
    addBtn("關卡選擇", "ghost", () => showScreen("levels"));
    if (!hasNext && !r.practice) body.insertAdjacentHTML("beforeend", '<p class="lead">🎉 你已突圍全部十二關！試試挑戰更多三星。</p>');
  } else {
    $("result-title").textContent = "挑戰失敗";
    $("result-stars").innerHTML = "";
    const fr = g.failReason || {};
    const tip = fr.reason === "time"
      ? "先規劃路線：近的能量先拿，綠色安全格可以停下觀察。"
      : fr.tip || "琥珀色斜紋是下一個危險位置，看到就要準備離開。";
    const what = fr.reason === "time" ? "時間用完了。" : `被「${fr.name || "紅格"}」碰到了，生命用完。`;
    body.innerHTML = `<p class="fail-reason">${what}</p><p class="muted">提示：${tip}</p><p class="muted">能量 ${g.collected}／${g.L.totalEnergy}</p>`;
    if (g.stage > 0) {
      addBtn(`從${g.L.stages[g.stage].name.split("：")[0]}重試`, "primary", () => startLevel(true));
      addBtn("整關重試", "", () => startLevel());
    } else {
      addBtn("重試", "primary", () => startLevel());
    }
    addBtn("關卡選擇", "ghost", () => showScreen("levels"));
  }
  openOverlay("ov-result");
}

function pauseGame() {
  if (!game || paused || (game.status !== "playing" && game.status !== "countdown")) return;
  if (topOverlay()) return;
  paused = true;
  clearInput(game);
  releaseAllPointers();
  stopMusic();
  openOverlay("ov-pause");
}

function resumeGame() {
  closeOverlay("ov-pause");
  if (!game) return;
  paused = false;
  acc = 0;
  document.activeElement?.blur?.();
  beginCountdown(game);
  if (save.settings.music) startMusic();
}

function resizeCanvas() {
  const wrap = $("board-wrap");
  const rect = wrap.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  canvasSize = { w: Math.max(1, rect.width), h: Math.max(1, rect.height), dpr };
  canvas.width = Math.round(canvasSize.w * dpr);
  canvas.height = Math.round(canvasSize.h * dpr);
}
new ResizeObserver(() => { if (!$("screen-game").hidden) resizeCanvas(); }).observe($("board-wrap"));

function updateHud() {
  const g = game;
  const time = $("hud-time");
  if (g.practice) {
    time.textContent = "∞";
    time.classList.remove("low");
  } else {
    const sec = Math.max(0, Math.ceil(g.timeLeft - 1e-6));
    if (time.textContent !== String(sec)) time.textContent = String(sec);
    time.classList.toggle("low", sec <= 10);
  }
  const livesHtml = Array.from({ length: MAX_LIVES }, (_, i) => `<span class="${i < g.lives ? "on" : "off"}">♥</span>`).join("");
  const lives = $("hud-lives");
  if (lives.dataset.v !== String(g.lives)) {
    lives.innerHTML = livesHtml;
    lives.dataset.v = String(g.lives);
    lives.setAttribute("aria-label", `生命 ${g.lives}／${MAX_LIVES}`);
  }
  const stageTag = g.L.stages.length > 1 ? ` · ${g.L.stages[g.stage].name.split("：")[0]}` : "";
  const en = `能量 ${g.collected}／${g.L.totalEnergy}${stageTag}${g.exitOpen ? " · 出口已開啟" : ""}`;
  if ($("hud-energy").textContent !== en) $("hud-energy").textContent = en;
  if (g.L.dash) {
    const d = $("hud-dash");
    const ready = g.dashCd <= 0;
    const txt = ready ? "衝刺 就緒" : `衝刺 ${g.dashCd.toFixed(1)}`;
    if (d.textContent !== txt) d.textContent = txt;
    d.classList.toggle("ready", ready);
    $("btn-dash").style.setProperty("--cd", String(g.dashCd / DASH_COOLDOWN));
  }
  const cd = $("countdown");
  const cdText = g.status === "countdown" ? String(Math.ceil(g.countdown)) : "";
  if (cd.textContent !== cdText) {
    cd.textContent = cdText;
    if (cdText && !paused) sfx("tick");
  }
}

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  if (!game || $("screen-game").hidden) return;
  if (!paused && (game.status === "playing" || game.status === "countdown")) {
    acc += dt;
    let n = 0;
    while (acc >= SIM_DT && n < 6) {
      step(game);
      acc -= SIM_DT;
      n++;
      if (game.status !== "playing" && game.status !== "countdown") break;
    }
    if (n >= 6) acc = 0;
    handleEvents();
    checkWarnSound();
  }
  if (!game) return;
  const rm = reducedMotion();
  ctx.setTransform(canvasSize.dpr, 0, 0, canvasSize.dpr, 0, 0);
  const out = render(ctx, game, { width: canvasSize.w, height: canvasSize.h, now, reducedMotion: rm, fx });
  if (game.player.moving && !rm) {
    fx.trail.push(out.playerGrid);
    if (fx.trail.length > 6) fx.trail.shift();
  } else if (fx.trail.length) fx.trail.shift();
  fx.hits = fx.hits.filter((h) => now - h.at < 700);
  fx.particles = fx.particles.filter((p) => now - p.at < 400);
  updateHud();
}
requestAnimationFrame(loop);

const KEYMAP = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  KeyW: "up", KeyS: "down", KeyA: "left", KeyD: "right",
};

window.addEventListener("keydown", (e) => {
  const top = topOverlay();
  if (e.key === "Escape") {
    if (top === "ov-pause") { e.preventDefault(); resumeGame(); return; }
    if (top && top !== "ov-result" && top !== "ov-intro") { e.preventDefault(); closeOverlay(top); return; }
    if (!top && game && !$("screen-game").hidden) { e.preventDefault(); pauseGame(); }
    return;
  }
  if (top || !game || $("screen-game").hidden || paused) return;
  const dir = KEYMAP[e.code];
  if (dir) {
    e.preventDefault();
    if (!e.repeat) unlockAudio();
    if (!e.repeat || !game.held.includes(dir)) pressDir(game, dir);
  } else if (e.code === "Space") {
    e.preventDefault();
    if (!e.repeat) requestDash(game);
  } else if (e.code === "KeyP") {
    e.preventDefault();
    pauseGame();
  }
});

window.addEventListener("keyup", (e) => {
  const dir = KEYMAP[e.code];
  if (dir && game) releaseDir(game, dir);
});

const dpad = $("dpad");
const dpadPointers = new Map();

function dirFromPoint(x, y) {
  const r = dpad.getBoundingClientRect();
  const dx = x - (r.left + r.width / 2);
  const dy = y - (r.top + r.height / 2);
  if (Math.hypot(dx, dy) < r.width * 0.12) return null;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
}

function refreshDpad() {
  const active = new Set(dpadPointers.values());
  dpad.querySelectorAll(".arrow").forEach((a) => a.classList.toggle("on", active.has(a.dataset.dir)));
}

function setPointerDir(id, dir) {
  const prev = dpadPointers.get(id) ?? null;
  if (prev === dir) return;
  if (prev && game) {
    const stillHeld = [...dpadPointers.entries()].some(([pid, d]) => pid !== id && d === prev);
    if (!stillHeld) releaseDir(game, prev);
  }
  if (dir) {
    dpadPointers.set(id, dir);
    if (game && !paused && !topOverlay()) pressDir(game, dir);
  } else dpadPointers.delete(id);
  refreshDpad();
}

function releaseAllPointers() {
  for (const id of [...dpadPointers.keys()]) setPointerDir(id, null);
}

dpad.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  unlockAudio();
  try { dpad.setPointerCapture(e.pointerId); } catch {}
  setPointerDir(e.pointerId, dirFromPoint(e.clientX, e.clientY));
});
dpad.addEventListener("pointermove", (e) => {
  if (!dpadPointers.has(e.pointerId) && e.buttons === 0) return;
  setPointerDir(e.pointerId, dirFromPoint(e.clientX, e.clientY));
});
for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) {
  dpad.addEventListener(t, (e) => setPointerDir(e.pointerId, null));
}
dpad.addEventListener("contextmenu", (e) => e.preventDefault());

$("btn-dash").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  unlockAudio();
  if (game && !paused && !topOverlay()) requestDash(game);
});
$("btn-dash").addEventListener("click", (e) => {
  if (e.detail === 0 && game && !paused && !topOverlay()) requestDash(game);
});
$("btn-dash").addEventListener("contextmenu", (e) => e.preventDefault());
$("board-wrap").addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
$("screen-game").addEventListener("touchmove", (e) => { if (e.target.closest(".dpad, .dash-btn, .board-wrap")) e.preventDefault(); }, { passive: false });

document.addEventListener("visibilitychange", () => { if (document.hidden) pauseGame(); });
window.addEventListener("blur", () => {
  if (game) clearInput(game);
  releaseAllPointers();
  pauseGame();
});

$("btn-start").addEventListener("click", () => {
  unlockAudio();
  sfx("click");
  if (!save.started) openIntro(1, false);
  else openIntro(nextLevelToPlay(), false);
});
$("btn-levels").addEventListener("click", () => { unlockAudio(); showScreen("levels"); });
$("btn-help").addEventListener("click", () => openOverlay("ov-help"));
$("btn-settings").addEventListener("click", () => openOverlay("ov-settings"));
document.querySelectorAll("[data-nav=home]").forEach((b) => b.addEventListener("click", () => showScreen("home")));
document.querySelectorAll(".mode-switch button").forEach((b) => b.addEventListener("click", () => {
  practiceTab = b.dataset.mode === "practice";
  renderLevels();
}));
document.querySelector(".mode-switch").addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    practiceTab = !practiceTab;
    renderLevels();
    document.querySelector(`.mode-switch [data-mode=${practiceTab ? "practice" : "normal"}]`).focus();
  }
});

$("btn-intro-go").addEventListener("click", () => {
  unlockAudio();
  closeOverlay("ov-intro");
  startLevel();
});
$("btn-intro-back").addEventListener("click", () => {
  closeOverlay("ov-intro");
  showScreen("levels");
});

$("btn-pause").addEventListener("click", () => pauseGame());
$("btn-resume").addEventListener("click", resumeGame);
$("btn-restart").addEventListener("click", () => { closeOverlay("ov-pause"); startLevel(); });
$("btn-pause-settings").addEventListener("click", () => openOverlay("ov-settings"));
$("btn-pause-help").addEventListener("click", () => openOverlay("ov-help"));
$("btn-quit").addEventListener("click", () => { closeOverlay("ov-pause"); paused = false; showScreen("levels"); });

$("btn-sound").addEventListener("click", () => {
  unlockAudio();
  const on = !(save.settings.music || save.settings.sfx);
  save.settings.music = on;
  save.settings.sfx = on;
  persist();
  applySettings();
  if (on && game && !paused) startMusic();
  else if (!on) stopMusic();
});

document.querySelectorAll("[data-setting]").forEach((el) => el.addEventListener("change", () => {
  save.settings[el.dataset.setting] = el.checked;
  persist();
  applySettings();
  if (el.dataset.setting === "music") {
    if (el.checked && game && !paused && game.status === "playing") { unlockAudio(); startMusic(); }
    else if (!el.checked) stopMusic();
  }
  if (!$("screen-levels").hidden) renderLevels();
}));

document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => closeOverlay(b.closest(".overlay").id)));
$("btn-clear").addEventListener("click", () => openOverlay("ov-confirm"));
$("btn-confirm-clear").addEventListener("click", () => {
  clearSave();
  save = emptySave();
  storageOk = true;
  persist();
  applySettings();
  closeOverlay("ov-confirm");
  closeOverlay("ov-settings");
  if (!$("screen-levels").hidden) renderLevels();
  if (!$("screen-home").hidden) renderHome();
  showBanner("進度已清除", "", 1500);
});

$("help-legend").innerHTML = legendHtml(["floor", "safe", "energy", "warn", "danger", "exit", "wall"]);
applySettings();
showScreen("home");
if (!storageOk) $("storage-warning").hidden = false;

if (new URLSearchParams(location.search).has("debug")) {
  window.__lightGrid = { get game() { return game; }, get save() { return save; }, openIntro, startLevel: () => startLevel() };
}
