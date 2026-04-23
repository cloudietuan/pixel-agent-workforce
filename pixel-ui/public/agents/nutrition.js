// 🍽 NUTRITION — pairs with Exercise, uses the Lounge kitchenette for meal prep,
// visits the lounge coffee station for hydration
import { LOC, goTo, goToAgent, goHome } from './base.js';

export function behavior(a, d, t, now, defs) {
  const r = Math.random();
  if (r < 0.30) {
    goToAgent(a, 'exercise', defs);
    t.visiting = 'exercise';
    t.act = 'macros';
  } else if (r < 0.55) {
    // Lounge kitchenette — the real cooking/prep spot
    goTo(a, LOC.loungeKitchen.col, LOC.loungeKitchen.row);
    t.act = 'meal prep';
  } else if (r < 0.72) {
    // Lounge coffee station — hydration break
    goTo(a, LOC.loungeCoffee.col + 1, LOC.loungeCoffee.row);
    t.act = 'hydration';
  } else if (r < 0.85) {
    // Occasional dining table visit
    goTo(a, 28, 15);
    t.act = 'planning meals';
  } else {
    goHome(a, d);
    t.act = 'journaling nutrition';
  }
  t.nextMoveAt = now + 5000 + Math.random() * 3000;
}
