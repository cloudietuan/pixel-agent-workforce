// 💻 IT — patrols 4 corners doing audits (70%), occasional debug visits,
// server check at own desk
import { LOC, goTo, goToAgent, goHome } from './base.js';

const PATROL = [LOC.corner1, LOC.corner2, LOC.corner3, LOC.corner4];

export function behavior(a, d, t, now, defs) {
  const r = Math.random();
  if (r < 0.70) {
    const p = PATROL[(t.step || 0) % 4];
    t.step = (t.step || 0) + 1;
    goTo(a, p.col, p.row);
    t.act = 'audit';
  } else if (r < 0.85) {
    const others = defs.filter(x => x.id !== 'it');
    const target = others[Math.floor(Math.random() * others.length)];
    goToAgent(a, target.id, defs);
    t.visiting = target.id;
    t.act = 'debugging';
  } else {
    goHome(a, d);
    t.act = 'server check';
  }
  t.nextMoveAt = now + 3500 + Math.random() * 2500;
}
