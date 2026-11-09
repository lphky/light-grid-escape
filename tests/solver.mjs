import { createGame, step, cloneGame, pressDir, releaseDir, requestDash, DIRS } from "../src/engine.mjs";

const ACTIONS = [null, ...Object.keys(DIRS)];
const WAIT_FRAMES = 6;

function progressKey(s) {
  return `${s.stage}|${s.collected}|${s.breakLeft > 0 ? 1 : 0}|${s.exitOpen ? 1 : 0}|${s.status}`;
}

function simulate(state, action, hitLimit) {
  const c = cloneGame(state);
  const before = progressKey(c);
  if (action) {
    pressDir(c, action);
    releaseDir(c, action);
  }
  let started = false;
  for (let f = 0; f < 40; f++) {
    step(c);
    if (c.status === "failed" || c.hits > hitLimit) return null;
    if (progressKey(c) !== before) return { state: c, progressed: true };
    if (action) {
      if (c.player.moving) started = true;
      else if (started) return { state: c, progressed: false };
      else if (f > 1) return null;
    } else if (f + 1 >= WAIT_FRAMES) return { state: c, progressed: false };
  }
  return null;
}

function segment(start, hitLimit, maxCandidates = 4) {
  const found = [];
  const foundKeys = new Set();
  const buckets = new Map();
  const seen = new Set();
  const push = (s) => {
    const k = `${s.player.x},${s.player.y},${s.frame}`;
    if (seen.has(k)) return;
    seen.add(k);
    if (!buckets.has(s.frame)) buckets.set(s.frame, []);
    buckets.get(s.frame).push(s);
  };
  push(start);
  const maxFrame = start.frame + 60 * 200;
  for (let f = start.frame; f <= maxFrame; f++) {
    const list = buckets.get(f);
    if (!list) continue;
    buckets.delete(f);
    for (const s of list) {
      for (const a of ACTIONS) {
        const r = simulate(s, a, hitLimit);
        if (!r) continue;
        if (r.progressed) {
          const k = `${progressKey(r.state)}|${[...r.state.energy].sort()}|${r.state.player.x},${r.state.player.y}`;
          if (!foundKeys.has(k)) {
            foundKeys.add(k);
            found.push(r.state);
          }
        } else push(r.state);
      }
    }
    if (found.length >= maxCandidates || buckets.size === 0) break;
  }
  return found.sort((a, b) => a.frame - b.frame).slice(0, maxCandidates);
}

export function solve(levelDef, opts = {}) {
  let s = createGame(levelDef, { assist: !!opts.assist, practice: !!opts.practice });
  while (s.status === "countdown") step(s);
  const hitLimit = opts.hitLimit ?? 0;
  let budget = opts.budget ?? 400;
  let deepest = { collected: 0, t: 0 };
  function dfs(state) {
    if (state.status === "won") return state;
    if (budget-- <= 0) return null;
    if (state.collected >= deepest.collected) deepest = { collected: state.collected, t: state.t, stage: state.stage };
    for (const next of segment(state, hitLimit)) {
      const r = dfs(next);
      if (r) return r;
    }
    return null;
  }
  const won = dfs(s);
  if (won) return { ok: true, time: won.t, hits: won.hits, result: won.result };
  return { ok: false, ...deepest };
}

export { requestDash };
