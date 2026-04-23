// 📅 ATLAS — orchestrator: cycles through every agent in shuffled queue,
// occasional whiteboard stops to update the schedule
import { LOC, goTo, goToAgent } from './base.js';

export function behavior(a, d, t, now, defs) {
  // Rebuild queue when empty
  if (!t.queue || t.queue.length === 0) {
    t.queue = defs.filter(x => x.id !== 'atlas').map(x => x.id)
      .sort(() => Math.random() - 0.5);
  }

  const r = Math.random();
  if (r < 0.15) {
    goTo(a, LOC.whiteboard.col, LOC.whiteboard.row + 1);
    t.act = 'scheduling';
  } else {
    const nextId = t.queue.shift();
    goToAgent(a, nextId, defs);
    t.visiting = nextId;
    t.act = 'coordinating';
  }
  t.nextMoveAt = now + 4000 + Math.random() * 3000;
}
