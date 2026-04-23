// ── Shared constants + helpers for all agent behaviors ─────────────────────
// Imported by each per-agent module. No DOM/Canvas deps — pure movement logic.

export const TILE = 16; // must match office.html

// Named world locations (col, row).
// OFFICE room = cols 1-23, LOUNGE room = cols 25-46, divider wall at col 24
// (doorway gap at rows 9-10, use DOOR to cross rooms).
export const LOC = {
  // ── Office Room (workspace) ────────────────────────────────────
  bookshelf:    { col: 2,  row: 7 },
  library:      { col: 1,  row: 10 },
  coffee:       { col: 21, row: 8 },
  coffeeChair:  { col: 19, row: 8 },
  whiteboard:   { col: 11, row: 3 },
  meeting:      { col: 14, row: 13 },
  sofaLeft:     { col: 8,  row: 15 },
  sofaRight:    { col: 10, row: 15 },
  studyNook:    { col: 3,  row: 14 },
  kitchen:      { col: 18, row: 16 },
  plants:       { col: 22, row: 9 },
  corner1:      { col: 2,  row: 2 },
  corner2:      { col: 22, row: 2 },
  corner3:      { col: 22, row: 18 },
  corner4:      { col: 2,  row: 18 },

  // ── Doorway between rooms ──────────────────────────────────────
  doorOffice:   { col: 23, row: 9 },  // office side of doorway
  doorLounge:   { col: 25, row: 9 },  // lounge side of doorway

  // ── Lounge Room (recreation) ───────────────────────────────────
  loungeGym:       { col: 28, row: 3 },   // gym/fitness area
  loungeGame:      { col: 40, row: 5 },   // entertainment zone
  loungeSofa:      { col: 33, row: 12 },  // big central lounge
  loungeSofaL:     { col: 32, row: 13 },
  loungeSofaR:     { col: 34, row: 13 },
  loungeKitchen:   { col: 28, row: 15 },  // kitchenette
  loungeCoffee:    { col: 25, row: 14 },  // lounge coffee machine
  loungeReading:   { col: 44, row: 14 },  // reading nook
  loungeCornerNW:  { col: 26, row: 2 },
  loungeCornerNE:  { col: 46, row: 2 },
  loungeCornerSW:  { col: 26, row: 18 },
  loungeCornerSE:  { col: 46, row: 18 },
};

// Move agent to world tile (col, row) with optional pixel offsets.
export function goTo(a, col, row, offX = 0, offY = 0) {
  a.tx = col * TILE + TILE / 2 + offX;
  a.ty = row * TILE + TILE + offY;
}

// Walk to another agent's desk (routes through doorway if in different room).
export function goToAgent(a, targetId, defs, offset = TILE) {
  const target = defs.find(x => x.id === targetId);
  if (!target) return;
  goTo(a, target.col, target.row, (Math.random() > .5 ? offset : -offset), 0);
}

// Return to own desk.
export function goHome(a, d) {
  goTo(a, d.col, d.row);
}

// Walk into the Lounge Room via the doorway.
export function goToLounge(a, col, row) {
  goTo(a, col, row);
}
