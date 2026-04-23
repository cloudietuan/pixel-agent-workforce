// 💰 FINANCE — pairs with Biz, fetches data from Research, coffee breaks
import { LOC, goTo, goToAgent, goHome } from './base.js';

export function behavior(a, d, t, now, defs) {
  const r = Math.random();
  if (r < 0.40) {
    goToAgent(a, 'biz', defs);
    t.visiting = 'biz';
    t.act = 'numbers';
  } else if (r < 0.55) {
    goToAgent(a, 'research', defs);
    t.visiting = 'research';
    t.act = 'fetching data';
  } else if (r < 0.65) {
    goTo(a, LOC.coffee.col, LOC.coffee.row);
    t.act = 'coffee break';
  } else {
    goHome(a, d);
    t.act = 'calculating';
  }
  t.nextMoveAt = now + 6000 + Math.random() * 3000;
}
