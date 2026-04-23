// 🧠 MENTAL — checks in on stressed agents, retreats to Lounge Room to meditate,
// acts as the office's circuit breaker
import { LOC, goTo, goToAgent, goHome } from './base.js';

const STRESSED = ['biz', 'scholar', 'finance', 'exercise', 'comms'];

export function behavior(a, d, t, now, defs) {
  const r = Math.random();
  if (r < 0.45) {
    // Check in on a stressed agent
    const target = STRESSED[Math.floor(Math.random() * STRESSED.length)];
    goToAgent(a, target, defs);
    t.visiting = target;
    t.act = 'check-in';
  } else if (r < 0.70) {
    // Retreat to the lounge — big central sofa for meditation
    goTo(a, LOC.loungeSofa.col, LOC.loungeSofa.row);
    t.act = 'meditating';
  } else if (r < 0.85) {
    // Reading nook in lounge
    goTo(a, LOC.loungeReading.col, LOC.loungeReading.row);
    t.act = 'reading';
  } else {
    goHome(a, d);
    t.act = 'reflecting';
  }
  t.nextMoveAt = now + 6000 + Math.random() * 4000;
}
