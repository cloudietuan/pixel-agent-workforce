// 📚 KNOWLEDGE — archivist: trips to bookshelves, cross-references
// with Research + Scholar
import { LOC, goTo, goToAgent, goHome } from './base.js';

export function behavior(a, d, t, now, defs) {
  const r = Math.random();
  if (r < 0.30) {
    const shelfRow = 6 + Math.floor(Math.random() * 5);
    goTo(a, LOC.bookshelf.col, shelfRow);
    t.act = 'archiving';
  } else if (r < 0.50) {
    goToAgent(a, 'research', defs);
    t.visiting = 'research';
    t.act = 'cross-ref';
  } else if (r < 0.65) {
    goToAgent(a, 'scholar', defs);
    t.visiting = 'scholar';
    t.act = 'referencing';
  } else {
    goHome(a, d);
    t.act = 'cataloging';
  }
  t.nextMoveAt = now + 5000 + Math.random() * 4000;
}
