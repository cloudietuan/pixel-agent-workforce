// 📣 SOCIAL — networks with everyone, chills in the Lounge's game area
// & big central sofa, syncs with Comms
import { LOC, goTo, goToAgent, goHome } from './base.js';

export function behavior(a, d, t, now, defs) {
  const r = Math.random();
  if (r < 0.35) {
    const others = defs.filter(x => x.id !== 'social' && x.id !== 'comms');
    const target = others[Math.floor(Math.random() * others.length)];
    goToAgent(a, target.id, defs);
    t.visiting = target.id;
    t.act = 'networking';
  } else if (r < 0.55) {
    // Lounge game/TV area
    goTo(a, LOC.loungeGame.col, LOC.loungeGame.row);
    t.act = 'hanging out';
  } else if (r < 0.75) {
    // Big central lounge sofas
    const sofa = Math.random() > .5 ? LOC.loungeSofaL : LOC.loungeSofaR;
    goTo(a, sofa.col, sofa.row);
    t.act = 'brainstorming';
  } else if (r < 0.88) {
    goToAgent(a, 'comms', defs);
    t.visiting = 'comms';
    t.act = 'content';
  } else {
    goHome(a, d);
    t.act = 'posting';
  }
  t.nextMoveAt = now + 3500 + Math.random() * 3000;
}
