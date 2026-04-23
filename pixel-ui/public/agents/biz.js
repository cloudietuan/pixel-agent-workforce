// 💼 BIZ — pairs with Finance, meets Atlas, visits meeting room
import { LOC, goTo, goToAgent, goHome } from './base.js';

export function behavior(a, d, t, now, defs) {
  const r = Math.random();
  if (r < 0.45) {
    goToAgent(a, 'finance', defs);
    t.visiting = 'finance';
    t.act = 'strategy';
  } else if (r < 0.60) {
    goToAgent(a, 'atlas', defs);
    t.visiting = 'atlas';
    t.act = 'planning';
  } else if (r < 0.75) {
    goTo(a, LOC.meeting.col, LOC.meeting.row);
    t.act = 'meeting';
  } else {
    goHome(a, d);
    t.act = 'reviewing';
  }
  t.nextMoveAt = now + 5000 + Math.random() * 4000;
}
