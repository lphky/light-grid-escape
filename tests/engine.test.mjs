import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame, step, pressDir, releaseDir, requestDash, hazardAt, retryStage, beginCountdown, starsFor,
  SIM_DT, COUNTDOWN_TIME, MIN_WARN, normalizeLevel,
} from "../src/engine.mjs";
import { LEVELS } from "../src/levels.mjs";
import { solve } from "./solver.mjs";
import { sanitizeSave, applyResult, emptySave, loadSave } from "../src/storage.mjs";

const frames = (s, n) => { for (let i = 0; i < n; i++) step(s); };
const skipCountdown = (s) => { while (s.status === "countdown") step(s); };
const tap = (s, d) => { pressDir(s, d); releaseDir(s, d); };
const moveFrames = 12;

const base = (map, extra = {}) => ({ id: 99, name: "t", time: 30, starTime: 10, map, hazards: [], ...extra });

test("十二關資料完整、出生安全、能量位置合法", () => {
  assert.equal(LEVELS.length, 12);
  LEVELS.forEach((def, i) => {
    assert.equal(def.id, i + 1);
    const L = normalizeLevel(def);
    assert.ok(L.start, `${def.id} 有起點`);
    assert.ok(L.exit, `${def.id} 有出口`);
    assert.ok(L.w >= 6 && L.w <= 9 && L.h >= 6 && L.h <= 9);
    assert.ok(L.starTime < L.time, `${def.id} 三星時間短於時限`);
    assert.equal(L.tiles[L.start[1] * L.w + L.start[0]], "safe");
    for (const st of L.stages) {
      assert.equal(L.tiles[st.start[1] * L.w + st.start[0]], "safe", `${def.id} 每段起點安全`);
      for (const batch of st.batches) for (const [x, y] of batch) {
        assert.equal(L.tiles[y * L.w + x], "floor", `${def.id} 能量 ${x},${y} 在普通地板`);
      }
      for (const h of st.hazards) {
        const need = def.id <= 4 ? 1 : MIN_WARN;
        assert.ok(h.minWarn >= need - 1e-9, `${def.id} ${h.name} 預警 ${h.minWarn} 秒`);
      }
    }
    assert.ok(L.totalEnergy >= 4);
  });
  assert.ok(LEVELS.filter((l) => !l.dash).every((l) => l.id < 4));
  assert.ok(LEVELS.filter((l) => l.dash).every((l) => l.id >= 4));
});

test("至少三種不同機關被使用", () => {
  const types = new Set();
  for (const def of LEVELS) for (const st of normalizeLevel(def).stages) for (const h of st.hazards) types.add(h.type);
  for (const t of ["static", "pulse", "mover", "rotor"]) assert.ok(types.has(t), t);
});

for (const def of LEVELS) {
  test(`第${def.id}關：自動路徑無傷完成，且時限及三星時間可達`, () => {
    const r = solve(def);
    assert.ok(r.ok, `第${def.id}關 無法無傷完成：${JSON.stringify(r)}`);
    assert.equal(r.hits, 0);
    assert.ok(r.time <= def.starTime / 2, `機械人用 ${r.time.toFixed(1)} 秒，三星 ${def.starTime} 秒`);
    assert.equal(r.result.stars, 3);
    const a = solve(def, { assist: true });
    assert.ok(a.ok, `第${def.id}關 輔助模式亦可完成`);
  });
}

test("倒數期間不能移動，倒數後才開始計時", () => {
  const s = createGame(base(["P.E..", ".....", "....X"]));
  pressDir(s, "right");
  frames(s, Math.round(COUNTDOWN_TIME / SIM_DT) - 2);
  assert.equal(s.status, "countdown");
  assert.equal(s.player.x, 0);
  assert.equal(s.t, 0);
  frames(s, 3);
  assert.equal(s.status, "playing");
  frames(s, moveFrames);
  assert.equal(s.player.x, 1, "按住方向在開始後移動");
});

test("逐格移動、牆不可通過、暫存一步輸入", () => {
  const s = createGame(base(["P#E..", ".....", "....X"]));
  skipCountdown(s);
  tap(s, "right");
  frames(s, moveFrames);
  assert.deepEqual([s.player.x, s.player.y], [0, 0]);
  tap(s, "down");
  frames(s, 2);
  tap(s, "right");
  tap(s, "right");
  frames(s, moveFrames * 3);
  assert.deepEqual([s.player.x, s.player.y], [1, 1], "只暫存最後一個方向");
});

test("收集、出口、通關計分", () => {
  const s = createGame(base(["PE", ".X"]));
  skipCountdown(s);
  tap(s, "right");
  frames(s, moveFrames);
  assert.equal(s.collected, 1);
  assert.equal(s.exitOpen, true);
  tap(s, "down");
  frames(s, moveFrames);
  assert.equal(s.status, "won");
  assert.equal(s.result.stars, 3);
  assert.equal(s.result.score, 100 + 3 * 200 + Math.floor(s.timeLeft) * 10);
});

test("受傷保護一秒，停在紅格會再受傷，生命歸零失敗", () => {
  const s = createGame(base(["PR.E", "...X"]));
  skipCountdown(s);
  tap(s, "right");
  frames(s, 7);
  assert.equal(s.hits, 1);
  assert.equal(s.lives, 2);
  frames(s, 50);
  assert.equal(s.hits, 1, "保護期內不再扣");
  frames(s, 15);
  assert.equal(s.hits, 2, "保護結束仍在紅格再扣");
  frames(s, 65);
  assert.equal(s.status, "failed");
  assert.equal(s.failReason.reason, "lives");
});

test("致命傷害與超時優先於通關", () => {
  const s = createGame(base(["PE", ".X"], { time: 0.2 }));
  skipCountdown(s);
  tap(s, "right");
  frames(s, 30);
  assert.equal(s.status, "failed");
  assert.equal(s.failReason.reason, "time");
});

test("練習模式不限時、不給星等", () => {
  const s = createGame(base(["PE", ".X"], { time: 0.2 }), { practice: true });
  skipCountdown(s);
  frames(s, 60);
  assert.equal(s.status, "playing");
  tap(s, "right");
  frames(s, moveFrames);
  tap(s, "down");
  frames(s, moveFrames);
  assert.equal(s.status, "won");
  assert.equal(s.result.practice, true);
  assert.equal(s.result.stars, undefined);
});

test("預警一定先於危險；剛收集的格子在離開前不會變紅", () => {
  const def = base(["P.E.", "...X"], { hazards: [{ type: "pulse", cells: [[2, 0]], period: 3, warn: 1, on: 1 }] });
  const s = createGame(def);
  skipCountdown(s);
  assert.equal(hazardAt(s, 2, 0), 0, "能量格不重疊紅格");
  tap(s, "right");
  frames(s, moveFrames);
  tap(s, "right");
  frames(s, moveFrames);
  assert.equal(s.collected, 1);
  frames(s, 90);
  assert.equal(s.hits, 0, "站在剛收集的格子安全");
  tap(s, "left");
  frames(s, moveFrames);
  let prev = 0;
  for (let i = 0; i < 400; i++) {
    const v = hazardAt(s, 2, 0);
    if (v === 2) assert.notEqual(prev, 0, "紅格前必有預警");
    prev = v;
    step(s);
  }
});

test("衝刺：第四關前未解鎖、衝兩格、沿途判定、冷卻", () => {
  const locked = createGame(base(["P...E", "....X"]));
  skipCountdown(locked);
  assert.equal(requestDash(locked), false);

  const s = createGame(base(["PR..E", "....X"], { dash: true }));
  skipCountdown(s);
  s.player.facing = "right";
  assert.equal(requestDash(s), true);
  frames(s, 12);
  assert.equal(s.player.x, 2, "衝兩格");
  assert.equal(s.hits, 1, "穿過紅格會受傷，沒有無敵");
  assert.equal(requestDash(s), false, "冷卻中");
  frames(s, 200);
  assert.equal(requestDash(s), true);
});

test("同一刷新間隔：機關先更新再判定", () => {
  const def = base(["P.E.", "...X"], { hazards: [{ type: "pulse", cells: [[1, 0]], period: 2, warn: 1, on: 1, offset: 0 }] });
  const s = createGame(def);
  skipCountdown(s);
  tap(s, "right");
  while (s.t < 0.98) step(s);
  assert.equal(s.hits, 0);
  assert.equal(hazardAt(s, 1, 0), 1);
  step(s);
  step(s);
  assert.equal(hazardAt(s, 1, 0), 2);
  assert.equal(s.hits, 1, "轉紅當刻即判定");
});

test("暫停後重新倒數，倒數期間時間凍結", () => {
  const s = createGame(LEVELS[4]);
  skipCountdown(s);
  frames(s, 30);
  const t = s.t;
  beginCountdown(s);
  frames(s, 100);
  assert.equal(s.t, t);
  assert.equal(s.status, "countdown");
});

test("第十二關三段：段間安全，可從當段重試", () => {
  const def = {
    id: 98, name: "t", time: 60, starTime: 40,
    map: ["P..", "...", "..X"],
    stages: [
      { name: "第一段：甲", energy: [[1, 0]], hazards: [] },
      { name: "第二段：乙", energy: [[2, 1]], hazards: [{ type: "static", cells: [[1, 1]] }] },
    ],
  };
  const s = createGame(def);
  skipCountdown(s);
  tap(s, "right");
  frames(s, moveFrames);
  assert.ok(s.breakLeft > 0);
  assert.equal(s.stage, 1, "安全時間內已預覽下一段");
  assert.equal(hazardAt(s, 1, 1), 2, "預覽下一段紅格");
  const hz = s.hz;
  tap(s, "down");
  frames(s, moveFrames);
  assert.equal(s.hits, 0, "段間站上紅格也不受傷");
  assert.equal(s.hz, hz, "安全時間內機關凍結");
  frames(s, 130);
  assert.equal(s.breakLeft, 0);
  assert.equal(s.hits, 1, "安全時間結束後仍站在已顯示的紅格會受傷");
  s.lives = 1;
  frames(s, 70);
  assert.equal(s.status, "failed");
  retryStage(s);
  assert.equal(s.stage, 1);
  assert.equal(s.lives, 3);
  assert.equal(s.collected, 1);
  assert.equal(s.hits, 0);
  assert.equal(s.status, "countdown");
});

test("星等規則", () => {
  const L = { starTime: 30 };
  assert.equal(starsFor(L, 0, 29), 3);
  assert.equal(starsFor(L, 0, 31), 2);
  assert.equal(starsFor(L, 1, 10), 2);
  assert.equal(starsFor(L, 2, 10), 1);
});

test("本機存檔：損壞資料、版本、輔助成績分開", () => {
  assert.deepEqual(sanitizeSave(null, 12), emptySave());
  assert.deepEqual(sanitizeSave({ version: 0, unlocked: 5 }, 12), emptySave());
  const bad = sanitizeSave({ version: 1, unlocked: 99, records: { normal: { 1: { stars: 9, score: -1, time: 3 }, 2: "x" } }, settings: { music: "yes", sfx: false } }, 12);
  assert.equal(bad.unlocked, 12);
  assert.equal(bad.records.normal[1].stars, 3);
  assert.equal(bad.records.normal[1].score, 0);
  assert.equal(bad.records.normal[2], undefined);
  assert.equal(bad.settings.music, true);
  assert.equal(bad.settings.sfx, false);

  const s = emptySave();
  applyResult(s, 1, 12, { practice: false, stars: 2, score: 900, elapsed: 20, hits: 1 }, true);
  assert.equal(s.records.assist[1].stars, 2);
  assert.equal(s.records.normal[1], undefined);
  assert.equal(s.unlocked, 2, "輔助成績可解鎖");
  applyResult(s, 2, 12, { practice: true, elapsed: 5, hits: 0 }, false);
  assert.equal(s.unlocked, 2, "練習不解鎖");
  applyResult(s, 1, 12, { practice: false, stars: 3, score: 1500, elapsed: 10, hits: 0 }, false);
  const r = applyResult(s, 1, 12, { practice: false, stars: 1, score: 800, elapsed: 30, hits: 2 }, false);
  assert.equal(r.newBest, false);
  assert.equal(s.records.normal[1].stars, 3);

  const throwing = { getItem() { throw new Error("blocked"); } };
  const out = loadSave(12, throwing);
  assert.equal(out.ok, false);
  assert.equal(out.save.unlocked, 1);
  const broken = { getItem: () => "{oops" };
  assert.equal(loadSave(12, broken).save.unlocked, 1);
});
