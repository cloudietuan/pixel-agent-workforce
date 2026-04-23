// ✉️ COMMS — client rounds (Biz/Finance/Scholar), briefings, syncs with Social
import { LOC, goTo, goToAgent, goHome } from './base.js';

const CLIENTS = ['biz', 'finance', 'scholar'];

export function behavior(a, d, t, now, defs) {
  const r = Math.random();
  if (r < 0.30) {
    goToAgent(a, 'social', defs);
    t.visiting = 'social';
    t.act = 'content sync';
  } else if (r < 0.55) {
    const client = CLIENTS[Math.floor(Math.random() * CLIENTS.length)];
    goToAgent(a, client, defs);
    t.visiting = client;
    t.act = 'client email';
  } else if (r < 0.70) {
    goTo(a, LOC.meeting.col, LOC.meeting.row);
    t.act = 'briefing';
  } else {
    goHome(a, d);
    t.act = 'drafting';
  }
  t.nextMoveAt = now + 4000 + Math.random() * 3000;
}
