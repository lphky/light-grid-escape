import { hazardAt, tileAt, key, energyVisibility, inBreak } from "./engine.mjs";

const C = {
  bg: "#050816",
  wall: "#151d38",
  wallTop: "#222d55",
  wallEdge: "#3b4a85",
  floor: "#0c1430",
  floorEdge: "#1f2b55",
  under: "#02040b",
  safe: "#22c55e",
  energy: "#38bdf8",
  warn: "#f59e0b",
  danger: "#ef4444",
  exit: "#c4b5fd",
  exitClosed: "#5b6584",
  player: "#e0f2fe",
  playerEdge: "#22d3ee",
};

export function layoutBoard(L, width, height) {
  const frame = 0.45;
  const cell = Math.max(8, Math.floor(Math.min(width / (L.w + frame * 2), height / (L.h + frame * 2))));
  const bw = cell * L.w;
  const bh = cell * L.h;
  return { cell, ox: Math.round((width - bw) / 2), oy: Math.round((height - bh) / 2), bw, bh, frame: cell * frame };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawShield(ctx, cx, cy, s, color) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - s);
  ctx.lineTo(cx + s * 0.8, cy - s * 0.6);
  ctx.quadraticCurveTo(cx + s * 0.75, cy + s * 0.5, cx, cy + s);
  ctx.quadraticCurveTo(cx - s * 0.75, cy + s * 0.5, cx - s * 0.8, cy - s * 0.6);
  ctx.closePath();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, s * 0.18);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.35, cy);
  ctx.lineTo(cx - s * 0.05, cy + s * 0.3);
  ctx.lineTo(cx + s * 0.4, cy - s * 0.3);
  ctx.stroke();
}

function drawDiamond(ctx, cx, cy, s, color, fill) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - s);
  ctx.lineTo(cx + s * 0.75, cy);
  ctx.lineTo(cx, cy + s);
  ctx.lineTo(cx - s * 0.75, cy);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, s * 0.16);
  ctx.stroke();
}

function clipTile(ctx, x, y, w, h, r, fn) {
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();
  fn();
  ctx.restore();
}

function drawStripes(ctx, x, y, size, color, gap) {
  ctx.strokeStyle = color;
  ctx.lineWidth = gap * 0.35;
  ctx.beginPath();
  for (let i = -size; i < size * 2; i += gap) {
    ctx.moveTo(x + i, y + size);
    ctx.lineTo(x + i + size, y);
  }
  ctx.stroke();
}

function drawCross(ctx, x, y, size, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, size * 0.09);
  const m = size * 0.28;
  ctx.beginPath();
  ctx.moveTo(x + m, y + m);
  ctx.lineTo(x + size - m, y + size - m);
  ctx.moveTo(x + size - m, y + m);
  ctx.lineTo(x + m, y + size - m);
  ctx.stroke();
}

function drawDoor(ctx, cx, cy, s, color, open) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, s * 0.15);
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.6, cy + s);
  ctx.lineTo(cx - s * 0.6, cy - s * 0.4);
  ctx.arc(cx, cy - s * 0.4, s * 0.6, Math.PI, 0);
  ctx.lineTo(cx + s * 0.6, cy + s);
  ctx.stroke();
  if (open) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.2, cy - s * 0.1);
    ctx.lineTo(cx + s * 0.3, cy + s * 0.3);
    ctx.lineTo(cx - s * 0.2, cy + s * 0.7);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillStyle = color;
    ctx.fillRect(cx - s * 0.18, cy + s * 0.05, s * 0.36, s * 0.3);
  }
}

export function render(ctx, s, view) {
  const { width, height, now, reducedMotion, fx } = view;
  const L = s.L;
  const lay = layoutBoard(L, width, height);
  const { cell, ox, oy, frame } = lay;
  ctx.clearRect(0, 0, width, height);

  roundRect(ctx, ox - frame, oy - frame, lay.bw + frame * 2, lay.bh + frame * 2 + cell * 0.08, cell * 0.25);
  ctx.fillStyle = C.wall;
  ctx.fill();
  ctx.strokeStyle = C.wallEdge;
  ctx.lineWidth = 2;
  ctx.stroke();
  roundRect(ctx, ox - 3, oy - 3, lay.bw + 6, lay.bh + 6, cell * 0.12);
  ctx.fillStyle = "#03050c";
  ctx.fill();

  const gap = Math.max(2, cell * 0.07);
  const r = cell * 0.14;
  const t = now / 1000;
  const vis = energyVisibility(s);
  const breaking = inBreak(s);

  for (let y = 0; y < L.h; y++) {
    for (let x = 0; x < L.w; x++) {
      const tile = tileAt(L, x, y);
      const px = ox + x * cell + gap / 2;
      const py = oy + y * cell + gap / 2;
      const sz = cell - gap;
      const cx = px + sz / 2;
      const cy = py + sz / 2;
      const thick = Math.max(2, cell * 0.06);

      if (tile === "wall") {
        roundRect(ctx, px, py + thick, sz, sz, r);
        ctx.fillStyle = C.under;
        ctx.fill();
        roundRect(ctx, px, py - thick, sz, sz, r);
        ctx.fillStyle = C.wallTop;
        ctx.fill();
        ctx.strokeStyle = C.wallEdge;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        clipTile(ctx, px, py - thick, sz, sz, r, () => {
          ctx.strokeStyle = "rgba(10,14,32,0.85)";
          ctx.lineWidth = Math.max(1.5, sz * 0.05);
          ctx.beginPath();
          for (let i = 1; i < 3; i++) {
            const yy = py - thick + (sz * i) / 3;
            ctx.moveTo(px, yy);
            ctx.lineTo(px + sz, yy);
          }
          ctx.moveTo(px + sz / 2, py - thick);
          ctx.lineTo(px + sz / 2, py - thick + sz / 3);
          ctx.moveTo(px + sz / 4, py - thick + sz / 3);
          ctx.lineTo(px + sz / 4, py - thick + (2 * sz) / 3);
          ctx.moveTo(px + (3 * sz) / 4, py - thick + sz / 3);
          ctx.lineTo(px + (3 * sz) / 4, py - thick + (2 * sz) / 3);
          ctx.moveTo(px + sz / 2, py - thick + (2 * sz) / 3);
          ctx.lineTo(px + sz / 2, py - thick + sz);
          ctx.stroke();
        });
        continue;
      }

      roundRect(ctx, px, py + thick, sz, sz, r);
      ctx.fillStyle = C.under;
      ctx.fill();
      roundRect(ctx, px, py, sz, sz, r);
      ctx.fillStyle = C.floor;
      ctx.fill();

      const k = key(x, y);
      const hasEnergy = s.energy.has(k);
      const hz = tile === "floor" ? hazardAt(s, x, y) : 0;
      let edge = C.floorEdge;
      let edgeW = 1;
      let glow = null;

      if (tile === "safe") {
        ctx.fillStyle = "rgba(34,197,94,0.16)";
        ctx.fill();
        edge = C.safe;
        edgeW = 2;
        glow = C.safe;
        drawShield(ctx, cx, cy, sz * 0.24, C.safe);
      } else if (tile === "exit") {
        if (s.exitOpen) {
          roundRect(ctx, px, py, sz, sz, r);
          ctx.fillStyle = "rgba(196,181,253,0.32)";
          ctx.fill();
          edge = "#f5f3ff";
          edgeW = 2.5;
          glow = C.exit;
          drawDoor(ctx, cx, cy, sz * 0.3, "#ffffff", true);
        } else {
          edge = C.exitClosed;
          edgeW = 2;
          drawDoor(ctx, cx, cy, sz * 0.3, C.exitClosed, false);
        }
      } else if (hz === 2) {
        roundRect(ctx, px, py, sz, sz, r);
        ctx.fillStyle = "rgba(239,68,68,0.42)";
        ctx.fill();
        drawCross(ctx, px, py, sz, "rgba(255,220,220,0.85)");
        edge = C.danger;
        edgeW = 2.5;
        glow = C.danger;
      } else if (hz === 1) {
        roundRect(ctx, px, py, sz, sz, r);
        ctx.fillStyle = "rgba(245,158,11,0.18)";
        ctx.fill();
        clipTile(ctx, px, py, sz, sz, r, () => drawStripes(ctx, px, py, sz, "rgba(245,158,11,0.55)", sz / 4));
        edge = C.warn;
        edgeW = 2;
      } else if (hasEnergy && vis !== "hidden") {
        const pulse = reducedMotion ? 1 : 1 + 0.06 * Math.sin(t * 4 + x + y);
        if (vis === "full") {
          roundRect(ctx, px, py, sz, sz, r);
          ctx.fillStyle = "rgba(56,189,248,0.16)";
          ctx.fill();
          edge = C.energy;
          edgeW = 2;
          glow = C.energy;
          drawDiamond(ctx, cx, cy, sz * 0.26 * pulse, "#bae6fd", "rgba(56,189,248,0.55)");
        } else {
          drawDiamond(ctx, cx, cy, sz * 0.22, "rgba(125,211,252,0.45)", null);
        }
      }

      roundRect(ctx, px, py, sz, sz, r);
      if (glow && !reducedMotion) {
        ctx.save();
        ctx.shadowColor = glow;
        ctx.shadowBlur = cell * 0.22;
        ctx.strokeStyle = edge;
        ctx.lineWidth = edgeW;
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.strokeStyle = edge;
        ctx.lineWidth = edgeW;
        ctx.stroke();
      }
    }
  }

  if (breaking) {
    ctx.fillStyle = "rgba(34,197,94,0.07)";
    ctx.fillRect(ox, oy, lay.bw, lay.bh);
  }

  const center = (gx, gy) => [ox + (gx + 0.5) * cell, oy + (gy + 0.5) * cell];

  for (const m of fx.hits) {
    const age = (now - m.at) / 600;
    if (age > 1) continue;
    const [hx, hy] = center(m.x, m.y);
    ctx.strokeStyle = `rgba(255,255,255,${1 - age})`;
    ctx.lineWidth = 3;
    const rr = cell * (0.25 + age * 0.25);
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.moveTo(hx + Math.cos(a) * rr * 0.5, hy + Math.sin(a) * rr * 0.5);
      ctx.lineTo(hx + Math.cos(a) * rr, hy + Math.sin(a) * rr);
    }
    ctx.stroke();
  }

  const p = s.player;
  const e = p.moving ? p.prog : 0;
  const gx = p.x + (p.tx - p.x) * e;
  const gy = p.y + (p.ty - p.y) * e;
  const [pxc, pyc] = center(gx, gy);

  for (const pt of fx.particles) {
    const age = (now - pt.at) / 350;
    if (age > 1) continue;
    const [sx, sy] = center(pt.x, pt.y);
    const k = age * age;
    ctx.fillStyle = `rgba(125,211,252,${1 - age})`;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + pt.seed;
      const d = cell * 0.45 * (1 - k);
      ctx.beginPath();
      ctx.arc(sx + Math.cos(a) * d + (pxc - sx) * k, sy + Math.sin(a) * d + (pyc - sy) * k, cell * 0.05, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (!reducedMotion) {
    fx.trail.forEach((tp, i) => {
      const [tx, ty] = center(tp[0], tp[1]);
      ctx.fillStyle = `rgba(34,211,238,${0.06 + i * 0.035})`;
      ctx.beginPath();
      ctx.arc(tx, ty, cell * (0.12 + i * 0.02), 0, Math.PI * 2);
      ctx.fill();
    });
  }

  const blink = s.invuln > 0 ? (reducedMotion ? 0.6 : 0.6 + 0.4 * Math.cos(t * Math.PI * 4)) : 1;
  ctx.save();
  ctx.globalAlpha = blink;
  ctx.fillStyle = "rgba(34,211,238,0.25)";
  ctx.beginPath();
  ctx.ellipse(pxc, pyc + cell * 0.22, cell * 0.3, cell * 0.11, 0, 0, Math.PI * 2);
  ctx.fill();
  const rad = cell * 0.27;
  ctx.fillStyle = C.player;
  ctx.strokeStyle = C.playerEdge;
  ctx.lineWidth = Math.max(2, cell * 0.06);
  ctx.beginPath();
  ctx.arc(pxc, pyc, rad, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const dirs = { up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 };
  const a = dirs[p.facing] ?? 0;
  ctx.translate(pxc, pyc);
  ctx.rotate(a);
  ctx.fillStyle = "#0b1226";
  roundRect(ctx, rad * 0.05, -rad * 0.42, rad * 0.65, rad * 0.84, rad * 0.25);
  ctx.fill();
  ctx.fillStyle = C.playerEdge;
  ctx.beginPath();
  ctx.arc(rad * 0.42, -rad * 0.15, rad * 0.11, 0, Math.PI * 2);
  ctx.arc(rad * 0.42, rad * 0.15, rad * 0.11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fde047";
  ctx.beginPath();
  ctx.moveTo(rad * 1.55, 0);
  ctx.lineTo(rad * 1.15, -rad * 0.32);
  ctx.lineTo(rad * 1.15, rad * 0.32);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  return { lay, playerGrid: [gx, gy] };
}
