// Character rendering + simulation on the walkable grid.
// Agents navigate tile-by-tile using A* from world.js. No walking over desks.
import {
  TILE, ZOOM, S, CHAR_W, CHAR_H, DIR_DOWN, DIR_UP, DIR_RIGHT,
  COLS, ROWS, AGENTS, BY_ID, PAIRS, MEET_SPOTS, DOG_BED
} from './agents2.js';
import { imgs, walkable, findPath } from './world5.js';

// ── Sprite tint cache ──
const frameCache = {};
function tintSprite(src, hex) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const cx = c.getContext('2d');
  cx.imageSmoothingEnabled = false;
  cx.drawImage(src, 0, 0);
  cx.globalCompositeOperation = 'source-atop';
  cx.fillStyle = hex + 'aa';
  cx.fillRect(0, 0, c.width, c.height);
  return c;
}
// Dog sprite layout: 112×96 sheet, 7 frames × 3 rows of 16×32 cells.
// The dog only occupies the BOTTOM 16px of each 32px-tall cell (top 16 is empty padding).
// Rows: 0=down, 1=up, 2=right (left = flipped right). Only ~3 frames are usable per row.
const DOG_W = 16, DOG_H = 16;
const DOG_FRAMES = 3;     // walk-cycle frames per row in the dog sheet
const DOG_ROW_MAP = { 0:0, 1:1, 2:2, 3:2 }; // down, up, right, left (left uses right + flip)

export function getFrame(si, row, frame, flip, tintHex) {
  const isDog = (si === 'dog');
  // For dog, force left-direction to use right-row with auto-flip
  let useRow = row, useFlip = flip;
  if (isDog) {
    useRow = DOG_ROW_MAP[row] ?? 0;
    if (row === 3) useFlip = !flip; // left dir → flip the right-facing sprite
    frame = frame % DOG_FRAMES;
  }
  const key = `${si}_${useRow}_${frame}_${useFlip?1:0}_${tintHex||'x'}`;
  if (frameCache[key]) return frameCache[key];
  const spriteKey = (typeof si === 'string') ? `ch${si}` : `ch${si % 6}`;
  const img = imgs[spriteKey];
  if (!img || !img.complete || !img.naturalWidth) return null;

  const srcW = isDog ? DOG_W : CHAR_W;
  const srcH = isDog ? DOG_H : CHAR_H;
  // Dog sits in the bottom half of its 32px cell — offset Y by 16 to grab the dog only.
  const srcX = frame * (isDog ? 16 : CHAR_W);
  const srcY = useRow * (isDog ? 32 : CHAR_H) + (isDog ? 16 : 0);

  const oc = document.createElement('canvas');
  oc.width = srcW * ZOOM; oc.height = srcH * ZOOM;
  const oc2 = oc.getContext('2d');
  oc2.imageSmoothingEnabled = false;
  if (useFlip) { oc2.translate(srcW * ZOOM, 0); oc2.scale(-1, 1); }
  oc2.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, srcW*ZOOM, srcH*ZOOM);
  const final = tintHex ? tintSprite(oc, tintHex) : oc;
  frameCache[key] = final;
  return final;
}

// ── Runtime state ──
export const state = {};
AGENTS.forEach(d => {
  // World coords are in TILE units
  state[d.id] = {
    ...d,
    wx: d.col * TILE + TILE/2,
    wy: d.row * TILE + TILE,
    // A* path: array of [col,row] tiles to visit (in tile coords)
    path: [],
    pathTarget: { col: d.col, row: d.row },
    tileCol: d.col, tileRow: d.row,
    action: 'idle',
    thought: '...',
    busy: false,
    frame: 1, frameTimer: 0,
    dir: DIR_DOWN, flip: false,
    bobPhase: Math.random()*Math.PI*2,
    talkingWith: null,
    talkUntil: 0,
    mood: 0.7 + Math.random()*0.25,
    reputation: 0.5 + Math.random()*0.35,
    risk: Math.random()*0.3,
    momentum: 0.3 + Math.random()*0.5,
    flashUntil: 0,
    // Dog: sleeping vs patrolling
    sleeping: d.id === 'debug',
    // Last-position override for agents that should face their desk
    deskFaceDir: d.faceDir,
  };
});

export const cam = { x: 0, y: 0, tx: 0, ty: 0, followId: null, cinematic: true };

const WALK_SPEED = 44; // px/sec in world coords

let lastTime = 0;
export function drawAgents(ctx, canvas, ts, selectedId) {
  const dt = Math.min((ts - lastTime)/1000, 0.1);
  lastTime = ts;

  const sorted = [...AGENTS].sort((a,b) => state[a.id].wy - state[b.id].wy);

  sorted.forEach(d => {
    const a = state[d.id];

    // Tile-by-tile movement along a.path
    if (a.path.length) {
      const [nc, nr] = a.path[0];
      const targetX = nc * TILE + TILE/2;
      const targetY = nr * TILE + TILE;
      const dx = targetX - a.wx, dy = targetY - a.wy;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < 1.5) {
        a.wx = targetX; a.wy = targetY;
        a.tileCol = nc; a.tileRow = nr;
        a.path.shift();
      } else {
        const step = Math.min(WALK_SPEED * dt, dist);
        a.wx += (dx/dist) * step;
        a.wy += (dy/dist) * step;
        if (Math.abs(dx) > Math.abs(dy)) { a.dir = DIR_RIGHT; a.flip = dx < 0; }
        else { a.dir = dy > 0 ? DIR_DOWN : DIR_UP; a.flip = false; }
        a.frameTimer += dt;
        if (a.frameTimer > 0.15) { a.frameTimer = 0; a.frame = (a.frame+1) % 4; }
      }
    } else {
      a.frame = 1; a.frameTimer = 0;
      // When standing still at desk, face desk direction
      if (a.action === 'work' && a.tileCol === a.col && a.tileRow === a.row) {
        if (a.deskFaceDir === 'up') { a.dir = DIR_UP; a.flip = false; }
        else { a.dir = DIR_DOWN; a.flip = false; }
      }
    }

    const moving = a.path.length > 0;
    const sx = Math.round(a.wx * ZOOM - cam.x);
    const sy = Math.round(a.wy * ZOOM - cam.y);
    // Generous cull margin so characters stay drawn at high zoom / after pan
    if (sx < -S*12 || sy < -S*12 || sx > canvas.width+S*12 || sy > canvas.height+S*12) return;

    const bob = moving ? 0 : Math.sin(ts*0.002 + a.bobPhase)*1.5;
    const tintColor = d.noTint ? null : d.color;
    const isDog = (d.si === 'dog');
    // Dog only has 3 valid walk frames; cap cycle so frame 3 (empty) never shows
    const drawFrame = isDog ? (a.frame % 3) : a.frame;
    const frame = getFrame(d.si, a.dir, drawFrame, a.flip, tintColor);
    // Render dog at 1.5× its sprite size so it reads with similar visual weight as humans
    const dogScale = 1.5;
    const charW = (isDog ? DOG_W * dogScale : CHAR_W) * ZOOM;
    const charH = (isDog ? DOG_H * dogScale : CHAR_H) * ZOOM;

    // Selection: subtle underline glow (NO circle)
    if (selectedId === d.id) {
      ctx.save();
      const grad = ctx.createRadialGradient(sx, sy - 1, 0, sx, sy - 1, charW*0.7);
      grad.addColorStop(0, d.color + 'cc');
      grad.addColorStop(0.7, d.color + '22');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(sx - charW, sy - 10, charW*2, 16);
      // small chevron above
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = d.color;
      const chevY = sy - charH - 30 + bob + Math.sin(ts*0.004)*2;
      ctx.fillText('▼', sx, chevY);
      ctx.restore();
    }

    // Shadow
    ctx.beginPath();
    ctx.ellipse(sx, sy - 2, charW*0.35, 5, 0, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();

    // Dog sleeping: draw Zs instead of movement
    if (d.id === 'debug' && a.sleeping) {
      if (frame) ctx.drawImage(frame, sx - charW/2, sy - charH + bob, charW, charH);
      ctx.font = 'bold 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(200,200,255,' + (0.4 + 0.3*Math.sin(ts*0.003)) + ')';
      ctx.fillText('z z Z', sx + 10, sy - charH - 10 + Math.sin(ts*0.003)*3);
    } else if (frame) {
      ctx.drawImage(frame, sx - charW/2, sy - charH + bob, charW, charH);
    } else {
      ctx.beginPath();
      ctx.arc(sx, sy - charH/2 + bob, S/2, 0, Math.PI*2);
      ctx.fillStyle = d.color + '33';
      ctx.fill();
      ctx.strokeStyle = d.color;
      ctx.lineWidth = 2; ctx.stroke();
    }

    // Busy pulse — a soft outer glow BEHIND the sprite (drawn once above).
    // We re-draw a faint color halo via a radial gradient, not by re-blitting the sprite
    // (which would bleach it to white under 'lighter').
    if (a.busy && !a.sleeping) {
      const pulse = 0.15 + 0.15*Math.sin(ts*0.005);
      ctx.save();
      const gg = ctx.createRadialGradient(sx, sy - charH*0.45 + bob, 2, sx, sy - charH*0.45 + bob, charW*0.9);
      gg.addColorStop(0, d.color + Math.floor(pulse*255).toString(16).padStart(2,'0'));
      gg.addColorStop(1, d.color + '00');
      ctx.fillStyle = gg;
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillRect(sx - charW, sy - charH - 6 + bob, charW*2, charH + 12);
      ctx.restore();
    }

    // Role emoji above head
    ctx.font = '13px serif';
    ctx.textAlign = 'center';
    ctx.fillText(d.emoji, sx, sy - charH - 18 + bob);

    // Name badge
    ctx.font = 'bold 9px "JetBrains Mono","Courier New",monospace';
    const nameY = sy - charH - 4 + bob;
    ctx.fillStyle = 'rgba(0,0,0,.82)';
    const tw = ctx.measureText(d.name).width;
    ctx.fillRect(sx - tw/2 - 3, nameY - 10, tw + 6, 12);
    ctx.fillStyle = d.color;
    ctx.fillText(d.name, sx, nameY);

    // Action indicator
    if (a.action !== 'idle' && !a.sleeping) {
      const ic = a.action==='work'?'⚙️':a.action==='talk'?'💬':a.action==='think'?'💡':'🔍';
      ctx.font = '11px serif';
      ctx.fillText(ic, sx + 12, sy - charH - 18 + bob);
    }

    // Thought bubble (only when busy + substantive thought)
    if (a.busy && a.thought && a.thought !== '...' && a.thought !== a.mission) {
      const txt = a.thought.length > 36 ? a.thought.slice(0, 33)+'…' : a.thought;
      ctx.font = '9px "JetBrains Mono","Courier New",monospace';
      const bw = Math.min(ctx.measureText(txt).width + 12, 220);
      const bx = sx - bw/2, by = sy - charH - 40 + bob;
      ctx.fillStyle = 'rgba(8,8,24,.94)';
      ctx.strokeStyle = d.color + 'aa';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(bx, by, bw, 15, 3);
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sx - 3, by + 15);
      ctx.lineTo(sx, by + 20);
      ctx.lineTo(sx + 3, by + 15);
      ctx.closePath();
      ctx.fillStyle = 'rgba(8,8,24,.94)'; ctx.fill();
      ctx.fillStyle = d.color + 'dd';
      ctx.fillText(txt, sx, by + 11);
    }

    // Talk link line
    if (a.talkingWith && state[a.talkingWith]) {
      const b = state[a.talkingWith];
      if (d.id < a.talkingWith) {
        const bx = Math.round(b.wx*ZOOM - cam.x);
        const by = Math.round(b.wy*ZOOM - cam.y) - charH/2;
        const ay = sy - charH/2;
        ctx.beginPath();
        ctx.moveTo(sx, ay);
        ctx.lineTo(bx, by);
        ctx.strokeStyle = d.color + '55';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 4]);
        ctx.lineDashOffset = -ts*0.05;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  });
}

// ── Movement API ──
function pathTo(id, col, row) {
  const a = state[id];
  const path = findPath(a.tileCol, a.tileRow, col, row);
  a.path = path;
  a.pathTarget = { col, row };
}

function randomMeetSpot() { return MEET_SPOTS[Math.floor(Math.random()*MEET_SPOTS.length)]; }

// ── Behaviour ticker ──
export function pickNewAction(a, now) {
  if (a.id === 'debug') return pickDogAction(a, now);

  const r = Math.random();
  if (r < 0.48) {
    // Work at own station
    pathTo(a.id, a.col, a.row);
    a.action = 'work';
    a.thought = a.thoughts[Math.floor(Math.random()*a.thoughts.length)];
    a.busy = true;
    return 7000 + Math.random()*7000;
  } else if (r < 0.72) {
    // Visit ally (paired) or random
    const allies = PAIRS.filter(p => (p[0]===a.id||p[1]===a.id) && p[2]==='alliance');
    let partnerId = null;
    if (allies.length && Math.random() < 0.65) {
      const pair = allies[Math.floor(Math.random()*allies.length)];
      partnerId = pair[0] === a.id ? pair[1] : pair[0];
    } else {
      const others = AGENTS.filter(x => x.id !== a.id && x.id !== 'debug');
      partnerId = others[Math.floor(Math.random()*others.length)].id;
    }
    const p = state[partnerId];
    // Stand one tile next to them
    const adj = findAdjacentWalkable(p.col, p.row) || { col: p.col, row: p.row };
    pathTo(a.id, adj.col, adj.row);
    a.action = 'talk';
    a.talkingWith = partnerId;
    a.thought = `Syncing with ${p.name}`;
    a.busy = true;
    p.talkingWith = a.id;
    p.talkUntil = now + 5000;
    return 5000 + Math.random()*4000;
  } else if (r < 0.9) {
    // Meet spot (coffee / whiteboard / lounge)
    const spot = randomMeetSpot();
    pathTo(a.id, spot.col, spot.row);
    a.action = 'think';
    a.thought = `☕ ${spot.label}`;
    a.busy = false;
    return 5000 + Math.random()*5000;
  } else {
    // Wander nearby
    const tries = 10;
    for (let i = 0; i < tries; i++) {
      const dc = Math.floor((Math.random()-0.5)*8);
      const dr = Math.floor((Math.random()-0.5)*4);
      const nc = a.col + dc, nr = a.row + dr;
      if (nc > 0 && nr > 0 && nc < COLS-1 && nr < ROWS-1 && walkable[nr] && walkable[nr][nc]) {
        pathTo(a.id, nc, nr);
        a.action = 'idle';
        a.thought = '...';
        a.busy = false;
        return 4000 + Math.random()*3000;
      }
    }
    return 2000;
  }
}

function pickDogAction(a, now) {
  if (a.sleeping) {
    // Occasionally wake up and patrol
    if (Math.random() < 0.3) {
      a.sleeping = false;
      // Pick a random agent to visit
      const agents = AGENTS.filter(x => x.id !== 'debug');
      // Prefer the lowest-mood agent
      const target = agents.slice().sort((x, y) => state[x.id].mood - state[y.id].mood)[0];
      const ts = state[target.id];
      const adj = findAdjacentWalkable(ts.col, ts.row) || { col: ts.col, row: ts.row };
      pathTo('debug', adj.col, adj.row);
      a.action = 'think';
      a.thought = `Patrolling → ${target.name}`;
      a.busy = true;
      return 8000 + Math.random()*6000;
    }
    a.thought = 'zzz...';
    return 6000 + Math.random()*8000;
  } else {
    // Finished patrol: go back to bed
    pathTo('debug', DOG_BED.col, DOG_BED.row);
    a.action = 'idle';
    a.thought = 'heading back to bed';
    a.busy = false;
    a.sleeping = true;
    return 10000 + Math.random()*8000;
  }
}

function findAdjacentWalkable(col, row) {
  const nbrs = [[col+1,row],[col-1,row],[col,row+1],[col,row-1]];
  for (const [c,r] of nbrs) {
    if (c > 0 && r > 0 && c < COLS-1 && r < ROWS-1 && walkable[r] && walkable[r][c]) return { col: c, row: r };
  }
  return null;
}

const nextMoveAt = {};
AGENTS.forEach(d => nextMoveAt[d.id] = Date.now() + Math.random()*4000 + 1500);

export function tickSimulation(now) {
  AGENTS.forEach(d => {
    const a = state[d.id];
    if (a.talkingWith && now > a.talkUntil && a.action !== 'talk') a.talkingWith = null;
    const atTarget = a.path.length === 0;
    if (!atTarget || now < nextMoveAt[d.id]) return;
    const wait = pickNewAction(a, now);
    nextMoveAt[d.id] = now + wait;
    // Stat drift
    a.mood = Math.max(0.1, Math.min(1, a.mood + (Math.random()-0.5)*0.05));
    a.momentum = Math.max(0, Math.min(1, a.momentum + (Math.random()-0.4)*0.08));
    a.risk = Math.max(0, Math.min(1, a.risk + (Math.random()-0.55)*0.05));
    a.reputation = Math.max(0, Math.min(1, a.reputation + (Math.random()-0.45)*0.03));
  });
}

export function sendAgentTo(id, targetId, thought) {
  const a = state[id], t = state[targetId];
  if (!a || !t) return;
  const adj = findAdjacentWalkable(t.col, t.row) || { col: t.col, row: t.row };
  pathTo(id, adj.col, adj.row);
  a.action = 'talk';
  a.busy = true;
  a.talkingWith = targetId;
  a.thought = thought || `→ ${t.name}`;
  t.talkingWith = id; t.talkUntil = Date.now() + 5000;
  nextMoveAt[id] = Date.now() + 6000;
}

export function pulseAgent(id, thought, action='think') {
  const a = state[id];
  if (!a) return;
  a.action = action;
  a.busy = true;
  a.thought = thought;
  a.flashUntil = Date.now() + 2500;
  nextMoveAt[id] = Date.now() + 3500;
}

export function centerCameraOnAgent(canvas, id) {
  const a = state[id];
  if (!a) return;
  cam.tx = a.wx*ZOOM - canvas.width/2;
  cam.ty = a.wy*ZOOM - canvas.height/2;
}
export function recenterCamera(canvas) {
  const offW = COLS*S, offH = ROWS*S;
  cam.tx = Math.max(0, (offW - canvas.width) / 2);
  cam.ty = Math.max(0, (offH - canvas.height) / 2);
}
export function updateCamera(dt) {
  cam.x += (cam.tx - cam.x) * Math.min(1, dt * 4);
  cam.y += (cam.ty - cam.y) * Math.min(1, dt * 4);
}

export function hitTest(canvas, cx, cy) {
  const charW = CHAR_W * ZOOM, charH = CHAR_H * ZOOM;
  for (let i = AGENTS.length - 1; i >= 0; i--) {
    const d = AGENTS[i];
    const a = state[d.id];
    const sx = Math.round(a.wx*ZOOM - cam.x);
    const sy = Math.round(a.wy*ZOOM - cam.y);
    if (cx >= sx - charW/2 && cx <= sx + charW/2 &&
        cy >= sy - charH && cy <= sy) return d.id;
  }
  return null;
}
