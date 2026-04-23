// 🔬 RESEARCH — library trips, visits Scholar + Knowledge, otherwise desk
import { LOC, goTo, goToAgent, goHome } from './base.js';

export function behavior(a, d, t, now, defs) {
  const r = Math.random();
  if (r < 0.20) {
    goTo(a, LOC.library.col, LOC.library.row);
    t.act = 'referencing';
  } else if (r < 0.35) {
    goToAgent(a, 'scholar', defs);
    t.visiting = 'scholar';
    t.act = 'discussing';
  } else if (r < 0.50) {
    goToAgent(a, 'knowledge', defs);
    t.visiting = 'knowledge';
    t.act = 'sharing';
  } else {
    goHome(a, d);
    t.act = 'analyzing';
  }
  t.nextMoveAt = now + 6000 + Math.random() * 4000;
}
