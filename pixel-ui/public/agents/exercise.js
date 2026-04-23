// 💪 EXERCISE — uses the Lounge Room's gym corner for agility drills,
// pairs with Nutrition, walks laps through both rooms
import { LOC, goTo, goToAgent, goHome } from './base.js';

// Laps now cross both rooms — patrols the full workspace
const LAPS = [
  LOC.corner1, LOC.corner2,
  LOC.loungeCornerNE, LOC.loungeCornerSE,
  LOC.loungeCornerSW, LOC.loungeCornerNW,
  LOC.corner3, LOC.corner4,
];

export function behavior(a, d, t, now, defs) {
  const r = Math.random();
  if (r < 0.30) {
    goToAgent(a, 'nutrition', defs);
    t.visiting = 'nutrition';
    t.act = 'fueling plan';
  } else if (r < 0.50) {
    // Lounge gym corner — real workout spot
    goTo(a, LOC.loungeGym.col, LOC.loungeGym.row);
    t.act = 'training';
  } else if (r < 0.75) {
    // Patrol laps through both rooms
    const p = LAPS[(t.step || 0) % LAPS.length];
    t.step = (t.step || 0) + 1;
    goTo(a, p.col, p.row);
    t.act = 'walking laps';
  } else {
    goHome(a, d);
    t.act = 'planning workout';
  }
  t.nextMoveAt = now + 3500 + Math.random() * 3000;
}
