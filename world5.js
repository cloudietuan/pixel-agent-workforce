// World rendering + static walkable grid. Supports expansion unlocks.
// v3: adds EXITS for story expansion.
import {
  TILE, ZOOM, S, COLS, ROWS, ROOM_DIVIDE_COL, DOOR_ROW_TOP, DOOR_ROW_BOT,
  AGENTS, MEET_SPOTS, DOG_BED
} from './agents2.js';

const ASSETS = [
  ['f0','assets/floors/floor_0.png'],
  ['f1','assets/floors/floor_1.png'],
  ['f2','assets/floors/floor_2.png'],
  ['f3','assets/floors/floor_3.png'],
  ['wall','assets/walls/wall_0.png'],
  ['desk_f','assets/furniture/DESK/DESK_FRONT.png'],
  ['desk_b','assets/furniture/DESK/DESK_BACK.png'],
  ['pc1','assets/furniture/PC/PC_FRONT_ON_1.png'],
  ['pc2','assets/furniture/PC/PC_FRONT_ON_2.png'],
  ['pc3','assets/furniture/PC/PC_FRONT_ON_3.png'],
  ['pc_b1','assets/furniture/PC/PC_BACK_ON_1.png'],
  ['pc_b2','assets/furniture/PC/PC_BACK_ON_2.png'],
  ['pc_b3','assets/furniture/PC/PC_BACK_ON_3.png'],
  ['plant','assets/furniture/PLANT/PLANT.png'],
  ['lplant','assets/furniture/LARGE_PLANT/LARGE_PLANT.png'],
  ['book','assets/furniture/BOOKSHELF/BOOKSHELF.png'],
  ['dbook','assets/furniture/DOUBLE_BOOKSHELF/DOUBLE_BOOKSHELF.png'],
  ['wboard','assets/furniture/WHITEBOARD/WHITEBOARD.png'],
  ['sofa_f','assets/furniture/SOFA/SOFA_FRONT.png'],
  ['sofa_s','assets/furniture/SOFA/SOFA_SIDE.png'],
  ['sofa_b','assets/furniture/SOFA/SOFA_BACK.png'],
  ['ctable','assets/furniture/COFFEE_TABLE/COFFEE_TABLE.png'],
  ['coffee','assets/furniture/COFFEE/COFFEE.png'],
  ['cactus','assets/furniture/CACTUS/CACTUS.png'],
  ['clock','assets/furniture/CLOCK/CLOCK.png'],
  ['hplant','assets/furniture/HANGING_PLANT/HANGING_PLANT.png'],
  ['painting','assets/furniture/LARGE_PAINTING/LARGE_PAINTING.png'],
  ['painting2','assets/furniture/SMALL_PAINTING/SMALL_PAINTING.png'],
  ['painting3','assets/furniture/SMALL_PAINTING_2/SMALL_PAINTING_2.png'],
  ['wchair','assets/furniture/WOODEN_CHAIR/WOODEN_CHAIR_FRONT.png'],
  ['wchair_s','assets/furniture/WOODEN_CHAIR/WOODEN_CHAIR_SIDE.png'],
  ['cchair','assets/furniture/CUSHIONED_CHAIR/CUSHIONED_CHAIR_FRONT.png'],
  ['cbench','assets/furniture/CUSHIONED_BENCH/CUSHIONED_BENCH.png'],
  ['wbench','assets/furniture/WOODEN_BENCH/WOODEN_BENCH.png'],
  ['pot','assets/furniture/POT/POT.png'],
  ['plant2','assets/furniture/PLANT_2/PLANT_2.png'],
  ['stable_f','assets/furniture/SMALL_TABLE/SMALL_TABLE_FRONT.png'],
  ['table_f','assets/furniture/TABLE_FRONT/TABLE_FRONT.png'],
  ['bin','assets/furniture/BIN/BIN.png'],
];
for (let i = 0; i < 6; i++) ASSETS.push([`ch${i}`, `assets/characters/char_${i}.png`]);
ASSETS.push(['chdog', 'assets/characters/dog.png']);

export const imgs = {};
let loaded = 0;
ASSETS.forEach(([k, src]) => {
  const img = new Image();
  img.onload = img.onerror = () => loaded++;
  img.src = src;
  imgs[k] = img;
});
export function assetsReady() { return loaded >= ASSETS.length; }
export function loadPct() { return loaded / ASSETS.length; }

// ── Walkability grid ────────────────────────────────────────────────────────
// true = walkable, false = blocked (wall, desk, couch, etc)
export const walkable = [];
for (let r = 0; r < ROWS; r++) {
  const row = [];
  for (let c = 0; c < COLS; c++) {
    // Outer walls
    if (r === 0 || r === ROWS-1 || c === 0 || c === COLS-1) row.push(false);
    // Divider with doorway
    else if (c === ROOM_DIVIDE_COL && !(r === DOOR_ROW_TOP || r === DOOR_ROW_BOT)) row.push(false);
    else row.push(true);
  }
  walkable.push(row);
}

function block(col, row) {
  if (row >= 0 && row < ROWS && col >= 0 && col < COLS) walkable[row][col] = false;
}

// ── Furniture — each item declares its blocking tiles ───────────────────────
// { k: sprite, col, row, w?, h?, block: [[dc,dr]...] (relative to col,row) }
// If block omitted, default is [[0,0]]. w/h in tiles for draw scale (auto from image natural size otherwise).
const FURNITURE = [
  // ── Agent desks (drawn as DESK + PC per agent) — handled separately ──

  // ── WORKSPACE decor ──
  // Top wall
  { k:'painting',  col:5,  row:0, block:[] },
  { k:'clock',     col:10, row:0, block:[] },
  { k:'wboard',    col:14, row:0, block:[] },
  { k:'painting3', col:18, row:0, block:[] },
  { k:'painting',  col:22, row:0, block:[] },
  { k:'hplant',    col:2,  row:0, block:[] },
  { k:'hplant',    col:13, row:0, block:[] },
  { k:'hplant',    col:24, row:0, block:[] },

  // Plants beside desks
  { k:'plant',     col:1,  row:4 }, { k:'pot',    col:25, row:4 },
  { k:'cactus',    col:1,  row:8 }, { k:'plant2', col:25, row:8 },

  // Bookshelves left wall
  { k:'book',      col:1,  row:12, block:[[0,0]] },
  { k:'dbook',     col:1,  row:14, block:[[0,0]] },

  // Whiteboard/meeting table (center of workspace, between rows)
  { k:'table_f',   col:12, row:10, block:[[0,0]] },
  { k:'wchair',    col:11, row:10, block:[[0,0]] },
  { k:'wchair_s',  col:13, row:10, block:[[0,0]] },

  // Coffee corner
  { k:'stable_f',  col:20, row:8, block:[[0,0]] },
  { k:'coffee',    col:20, row:7, block:[[0,0]] },
  { k:'cchair',    col:19, row:9, block:[[0,0]] },

  // Floor plants between rows
  { k:'plant',     col:4,  row:10 }, { k:'plant', col:8, row:10 },
  { k:'plant2',    col:16, row:10, block:[[0,0]] }, { k:'pot', col:22, row:10 },

  // Bottom wall near exit
  { k:'bin',       col:1,  row:19 }, { k:'bin', col:25, row:19 },
  { k:'painting2', col:6,  row:21, block:[] }, { k:'painting3', col:12, row:21, block:[] },
  { k:'painting',  col:18, row:21, block:[] },

  // ── LOUNGE (right side, cols 27-50) ──
  { k:'painting',  col:30, row:0, block:[] },
  { k:'clock',     col:36, row:0, block:[] },
  { k:'painting2', col:42, row:0, block:[] },
  { k:'painting3', col:47, row:0, block:[] },
  { k:'hplant',    col:28, row:0, block:[] }, { k:'hplant', col:48, row:0, block:[] },

  // Coffee area top of lounge
  { k:'coffee',    col:29, row:2 }, { k:'stable_f', col:30, row:3, block:[[0,0]] },
  { k:'cchair',    col:29, row:4, block:[[0,0]] }, { k:'cchair', col:31, row:4, block:[[0,0]] },

  // Big couch group — cluster around fire pit at (42,13)
  { k:'sofa_b',    col:40, row:10, block:[[0,0],[1,0]] },
  { k:'sofa_b',    col:42, row:10, block:[[0,0],[1,0]] },
  { k:'sofa_s',    col:39, row:11, block:[[0,0]] },
  { k:'sofa_s',    col:45, row:11, block:[[0,0]] },
  { k:'sofa_f',    col:40, row:14, block:[[0,0],[1,0]] },
  { k:'sofa_f',    col:42, row:14, block:[[0,0],[1,0]] },
  { k:'ctable',    col:41, row:12, block:[[0,0],[1,0]] },
  { k:'pot',       col:38, row:11 }, { k:'pot', col:46, row:11 },

  // Second lounge group around table at (32, 9)
  { k:'sofa_f',    col:32, row:9, block:[[0,0],[1,0]] },
  { k:'cchair',    col:31, row:9, block:[[0,0]] },
  { k:'cchair',    col:34, row:9, block:[[0,0]] },
  { k:'ctable',    col:32, row:8, block:[[0,0],[1,0]] },

  // Reading nook top-right
  { k:'book',      col:50, row:5, block:[[0,0]] },
  { k:'dbook',     col:50, row:7, block:[[0,0]] },
  { k:'cchair',    col:48, row:6, block:[[0,0]] }, { k:'cchair', col:49, row:6, block:[[0,0]] },
  { k:'stable_f',  col:47, row:6, block:[[0,0]] },
  { k:'lplant',    col:50, row:3, block:[[0,0]] },

  // Bottom of lounge: kitchen-ish
  { k:'table_f',   col:30, row:17, block:[[0,0]] },
  { k:'wchair',    col:30, row:16, block:[[0,0]] },
  { k:'wchair',    col:30, row:18, block:[[0,0]] },
  { k:'bin',       col:27, row:19 }, { k:'bin', col:50, row:19 },
  { k:'cactus',    col:35, row:19 }, { k:'plant', col:45, row:19 },

  // ── DOG BED (at DOG_BED location) — rendered separately below ──
];

// Block furniture tiles in the walkable grid
FURNITURE.forEach(f => {
  const blocks = f.block || [[0,0]];
  blocks.forEach(([dc, dr]) => block(f.col + dc, f.row + dr));
});
// Block agent desks
AGENTS.forEach(a => {
  if (a.id === 'debug') return;
  block(a.deskCol, a.deskRow);
});
// Dog bed tile is walkable (dog sits on it)

const LIGHTS = [
  { col: 8,  row: 0,  color: 'rgba(255,220,130,0.15)', r: 90 },
  { col: 15, row: 0,  color: 'rgba(255,220,130,0.15)', r: 90 },
  { col: 22, row: 0,  color: 'rgba(255,220,130,0.15)', r: 90 },
  { col: 20, row: 7,  color: 'rgba(255,180,100,0.20)', r: 70 },
  { col: 12, row: 11, color: 'rgba(255,200,150,0.12)', r: 110 },
  { col: 30, row: 0,  color: 'rgba(255,200,140,0.18)', r: 90 },
  { col: 40, row: 0,  color: 'rgba(255,200,140,0.18)', r: 90 },
  { col: 48, row: 0,  color: 'rgba(255,200,140,0.18)', r: 90 },
  { col: 41, row: 13, color: 'rgba(255,145,75,0.26)',  r: 100 }, // fire pit glow
  { col: 33, row: 9,  color: 'rgba(255,195,155,0.18)', r: 90 },
  { col: 48, row: 6,  color: 'rgba(140,180,255,0.14)', r: 80 },
];

// ── Day / night cycle ───────────────────────────────────────────────────────
// phase: 0-1. 0=dawn, 0.25=day, 0.5=dusk, 0.75=night
export let worldPhase = 0.25;
export function setPhase(p) { worldPhase = (p % 1 + 1) % 1; }
export function getPhaseName() {
  const p = worldPhase;
  if (p < 0.15 || p > 0.85) return 'Night';
  if (p < 0.3) return 'Dawn';
  if (p < 0.6) return 'Day';
  return 'Dusk';
}
function phaseTint() {
  const p = worldPhase;
  // Night: deep blue, Day: clear, Dusk: orange
  if (p < 0.15 || p > 0.85) return 'rgba(20, 25, 60, 0.42)';
  if (p < 0.30) return 'rgba(255, 190, 160, 0.18)'; // dawn
  if (p < 0.60) return 'rgba(0,0,0,0)';             // day
  if (p < 0.78) return 'rgba(255, 140, 90, 0.18)';  // dusk
  return 'rgba(40, 40, 100, 0.32)';
}

// ── Expansion state ─────────────────────────────────────────────────────────
// Exits on the top wall that can unlock. When unlocked, they visually change & become walkable.
export const EXITS = [
  { id:'street',  col: 5,  row: 0, label:'▲ to STREET',   unlocked:false },
  { id:'rooftop', col: 40, row: 0, label:'▲ to ROOFTOP',  unlocked:false },
];
export function unlockExit(id) {
  const e = EXITS.find(x => x.id === id);
  if (e) e.unlocked = true;
}

// ── Renderers ───────────────────────────────────────────────────────────────
export function drawWorld(ctx, canvas, camX, camY, pcTick) {
  // Floor
  const officeKeys = ['f0','f1','f2','f0'];
  const loungeKeys = ['f2','f3','f3','f1'];
  for (let r = 1; r < ROWS-1; r++) {
    for (let c = 1; c < COLS-1; c++) {
      const x = c*S - camX, y = r*S - camY;
      if (x < -S || y < -S || x > canvas.width+S || y > canvas.height+S) continue;
      const keys = c < ROOM_DIVIDE_COL ? officeKeys : loungeKeys;
      const k = keys[(c*3 + r*7) % keys.length];
      const img = imgs[k] || imgs['f0'];
      if (img && img.complete) ctx.drawImage(img, 0,0,16,16, x,y,S,S);
    }
  }

  // Walls
  const wallImg = imgs['wall'];
  if (wallImg && wallImg.complete) {
    for (let c = 0; c < COLS; c++) {
      // Top wall — skip where exits live
      const exit = EXITS.find(e => e.col === c);
      if (exit && exit.unlocked) {
        // draw open doorway gradient
        ctx.fillStyle = 'rgba(40,40,80,0.9)';
        ctx.fillRect(c*S - camX, 0 - camY, S, S);
      } else {
        ctx.drawImage(wallImg, 0,0,16,16, c*S-camX, 0-camY, S, S);
      }
      const g = ctx.createLinearGradient(0, S-camY, 0, S+8-camY);
      g.addColorStop(0,'rgba(0,0,0,.45)'); g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(c*S-camX, S-camY, S, 8);
    }
    for (let r = 1; r < ROWS; r++) {
      ctx.drawImage(wallImg, 0,0,16,16, 0-camX, r*S-camY, S, S);
      ctx.drawImage(wallImg, 0,0,16,16, (COLS-1)*S-camX, r*S-camY, S, S);
    }
    for (let c = 0; c < COLS; c++) ctx.drawImage(wallImg, 0,0,16,16, c*S-camX, (ROWS-1)*S-camY, S, S);
    for (let r = 1; r < ROWS-1; r++) {
      if (r >= DOOR_ROW_TOP && r <= DOOR_ROW_BOT) continue;
      ctx.drawImage(wallImg, 0,0,16,16, ROOM_DIVIDE_COL*S - camX, r*S - camY, S, S);
      const g = ctx.createLinearGradient(0, r*S+S-camY, 0, r*S+S+6-camY);
      g.addColorStop(0,'rgba(0,0,0,.3)'); g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(ROOM_DIVIDE_COL*S - camX, r*S + S - camY, S, 6);
    }
  }

  // Exit markers (locked = red dashed, unlocked = green arrow)
  EXITS.forEach(e => {
    const x = e.col*S - camX, y = 0 - camY;
    ctx.save();
    ctx.font = 'bold 9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = e.unlocked ? 'rgba(126,231,135,0.8)' : 'rgba(233,69,96,0.55)';
    ctx.fillText(e.label, x + S/2, y + S + 14);
    if (!e.unlocked) {
      ctx.strokeStyle = 'rgba(233,69,96,0.7)';
      ctx.setLineDash([4,3]); ctx.lineWidth = 2;
      ctx.strokeRect(x+2, y+2, S-4, S-4);
      ctx.setLineDash([]);
    }
    ctx.restore();
  });

  // Room labels
  ctx.save();
  ctx.font = 'bold 10px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(233,69,96,0.28)';
  ctx.fillText('◆ WORKSPACE ◆', 13*S - camX, S*1.4 - camY);
  ctx.fillStyle = 'rgba(129,199,132,0.28)';
  ctx.fillText('◆ LOUNGE ◆', 39*S - camX, S*1.4 - camY);
  ctx.restore();

  // Rugs
  const rugs = [
    { x:10, y:9, w:5, h:3, fill:'rgba(180,95,60,0.35)',  stroke:'rgba(140,70,40,0.55)' },
    { x:39, y:10, w:6, h:5, fill:'rgba(100,140,180,0.28)', stroke:'rgba(70,100,140,0.5)' },
    { x:30, y:8, w:5, h:3, fill:'rgba(110,80,140,0.28)', stroke:'rgba(80,55,110,0.5)' },
  ];
  rugs.forEach(rg => {
    ctx.fillStyle = rg.fill;
    ctx.fillRect(rg.x*S - camX, rg.y*S - camY, rg.w*S, rg.h*S);
    ctx.strokeStyle = rg.stroke;
    ctx.lineWidth = 2;
    ctx.strokeRect(rg.x*S - camX, rg.y*S - camY, rg.w*S, rg.h*S);
  });

  // Furniture
  FURNITURE.forEach(f => {
    const img = imgs[f.k];
    if (!img || !img.complete || !img.naturalWidth) return;
    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight,
      f.col*S - camX, f.row*S - camY,
      img.naturalWidth * ZOOM, img.naturalHeight * ZOOM);
  });

  // Lights (warm glows; dimmer during day)
  const lightMul = worldPhase < 0.15 || worldPhase > 0.75 ? 1 : 0.5;
  LIGHTS.forEach(l => {
    const cx = l.col*S + S/2 - camX, cy = l.row*S + S/2 - camY;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, l.r);
    const alphaAdj = l.color.replace(/[\d.]+\)$/, (m) => (parseFloat(m)*lightMul).toFixed(2) + ')');
    g.addColorStop(0, alphaAdj);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - l.r, cy - l.r, l.r*2, l.r*2);
  });

  return (pcTick % 120 < 40) ? 'pc1' : (pcTick % 120 < 80 ? 'pc2' : 'pc3');
}

export function drawDesks(ctx, camX, camY, agents, pcKey) {
  agents.forEach(d => {
    if (d.si === 'dog') return;
    const topRow = d.faceDir === 'up';
    // For top-row desks: desk sits ABOVE standing spot (faces up). For bottom: faces down.
    const dImg = topRow ? imgs['desk_b'] || imgs['desk_f'] : imgs['desk_f'];
    const pImg = imgs[topRow ? pcKey.replace('pc','pc_b') : pcKey] || imgs[pcKey];
    if (dImg && dImg.complete && dImg.naturalWidth > 0) {
      ctx.drawImage(dImg, 0,0, dImg.naturalWidth, dImg.naturalHeight,
        d.deskCol*S - camX, d.deskRow*S - camY,
        dImg.naturalWidth*ZOOM, dImg.naturalHeight*ZOOM);
    }
    if (pImg && pImg.complete && pImg.naturalWidth > 0) {
      // PC atop desk
      const pcY = topRow ? (d.deskRow-1)*S : (d.deskRow-1)*S;
      ctx.drawImage(pImg, 0,0,16,32,
        d.deskCol*S - camX, pcY - camY, S, S*2);
    }
    // Nameplate on desk
    ctx.save();
    ctx.font = 'bold 7px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = d.color + 'bb';
    ctx.fillText(d.name.toUpperCase(), d.deskCol*S + S/2 - camX, d.deskRow*S + S - 3 - camY);
    ctx.restore();
  });
}

// Dog bed
export function drawDogBed(ctx, camX, camY) {
  const x = DOG_BED.col*S - camX, y = DOG_BED.row*S - camY;
  ctx.save();
  // cushion
  ctx.fillStyle = 'rgba(180,140,90,0.8)';
  ctx.beginPath();
  ctx.ellipse(x + S/2, y + S/2 + 4, S*0.7, S*0.4, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,80,50,0.9)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // tag
  ctx.font = 'bold 6px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(212,165,116,0.9)';
  ctx.fillText('DEBUG', x + S/2, y + S - 1);
  ctx.restore();
}

// Post FX: vignette + phase tint + optional scanlines
export function drawPostFx(ctx, canvas, scanlines) {
  const vg = ctx.createRadialGradient(
    canvas.width/2, canvas.height/2, canvas.height * 0.25,
    canvas.width/2, canvas.height/2, canvas.height * 0.9
  );
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const tint = phaseTint();
  if (tint !== 'rgba(0,0,0,0)') {
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  if (scanlines) {
    ctx.fillStyle = 'rgba(0,0,0,0.035)';
    for (let y = 0; y < canvas.height; y += 3) ctx.fillRect(0, y, canvas.width, 1);
  }
}

// ── A* pathfinding on the walkable grid ─────────────────────────────────────
export function findPath(sc, sr, tc, tr) {
  if (sc === tc && sr === tr) return [];
  if (!inBounds(tc, tr) || !walkable[tr][tc]) {
    // Find nearest walkable tile
    for (let rad = 1; rad < 6; rad++) {
      for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
        const nc = tc+dx, nr = tr+dy;
        if (inBounds(nc, nr) && walkable[nr][nc]) { tc = nc; tr = nr; rad = 99; break; }
      }
    }
  }
  const key = (c,r) => r*COLS+c;
  const open = [[sc, sr, 0, Math.abs(tc-sc)+Math.abs(tr-sr), -1]];
  const came = {}, gScore = { [key(sc,sr)]: 0 };
  while (open.length) {
    open.sort((a,b) => (a[2]+a[3]) - (b[2]+b[3]));
    const [c, r, g] = open.shift();
    if (c === tc && r === tr) {
      return rebuild(came, sc, sr, tc, tr);
    }
    const neighbors = [[c+1,r],[c-1,r],[c,r+1],[c,r-1]];
    for (const [nc, nr] of neighbors) {
      if (!inBounds(nc, nr) || !walkable[nr][nc]) continue;
      const ng = g + 1;
      const nk = key(nc, nr);
      if (ng < (gScore[nk] ?? Infinity)) {
        came[nk] = key(c, r);
        gScore[nk] = ng;
        open.push([nc, nr, ng, Math.abs(tc-nc)+Math.abs(tr-nr), key(c,r)]);
      }
    }
    if (Object.keys(gScore).length > 2000) return []; // safety
  }
  return [];
}
function inBounds(c, r) { return c >= 0 && r >= 0 && c < COLS && r < ROWS; }
function rebuild(came, sc, sr, tc, tr) {
  const key = (c,r) => r*COLS+c;
  const out = [];
  let k = key(tc, tr);
  while (k !== key(sc, sr) && came[k] !== undefined) {
    const c = k % COLS, r = Math.floor(k / COLS);
    out.unshift([c, r]);
    k = came[k];
  }
  return out;
}
