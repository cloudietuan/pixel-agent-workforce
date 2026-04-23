// 🐕 DEBUG — the office dog. Wanders the lounge, sniffs around the office,
// follows IT on patrols, naps on lounge sofas, occasional begging at kitchen.
import { LOC, goTo, goToAgent, goHome } from './base.js';

// Places the dog frequents
const NAP_SPOTS = [LOC.loungeSofa, LOC.loungeSofaL, LOC.loungeSofaR, LOC.loungeReading];

export function behavior(a, d, t, now, defs) {
  const r = Math.random();

  if (r < 0.20) {
    // Follow IT on patrol — go visit IT
    goToAgent(a, 'it', defs);
    t.visiting = 'it';
    t.act = 'helping IT';
  } else if (r < 0.35) {
    // Beg at the kitchenette
    goTo(a, LOC.loungeKitchen.col, LOC.loungeKitchen.row);
    t.act = 'begging';
  } else if (r < 0.55) {
    // Nap on a lounge sofa
    const spot = NAP_SPOTS[Math.floor(Math.random() * NAP_SPOTS.length)];
    goTo(a, spot.col, spot.row);
    t.act = 'napping';
  } else if (r < 0.70) {
    // Sniff around — visit a random agent
    const others = defs.filter(x => x.id !== 'debug');
    const target = others[Math.floor(Math.random() * others.length)];
    goToAgent(a, target.id, defs);
    t.visiting = target.id;
    t.act = 'sniffing';
  } else if (r < 0.85) {
    // Wander to lounge game area
    goTo(a, LOC.loungeGame.col, LOC.loungeGame.row);
    t.act = 'exploring';
  } else {
    // Return to "bed" (own spot in lounge)
    goHome(a, d);
    t.act = '*tail wag*';
  }
  t.nextMoveAt = now + 2500 + Math.random() * 3500;
}
