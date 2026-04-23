// 🎓 SCHOLAR — studies at desk (70%), visits bookshelf (20%), whiteboard (10%)
import { LOC, goTo, goHome } from './base.js';

export function behavior(a, d, t, now, defs) {
  const r = Math.random();
  if (r < 0.20) {
    goTo(a, LOC.bookshelf.col, LOC.bookshelf.row + Math.floor(Math.random() * 3));
    t.act = 'studying';
  } else if (r < 0.30) {
    goTo(a, LOC.whiteboard.col, LOC.whiteboard.row + 1);
    t.act = 'noting';
  } else {
    goHome(a, d);
    t.act = 'researching';
  }
  t.nextMoveAt = now + 6000 + Math.random() * 4000;
}
