// ── All 12 agent behaviors ─────────────────────────────────────────────────
// Each agent lives in its own file. This module exports:
//   BEHAVIORS — map of agentId → behavior(a, d, t, now, defs)
//   bDefault  — fallback behavior (return to own desk)
// Consumed by office.html's updateMovement() loop.

import { goHome } from './base.js';
import { behavior as scholar }   from './scholar.js';
import { behavior as biz }       from './biz.js';
import { behavior as research }  from './research.js';
import { behavior as atlas }     from './atlas.js';
import { behavior as finance }   from './finance.js';
import { behavior as exercise }  from './exercise.js';
import { behavior as social }    from './social.js';
import { behavior as nutrition } from './nutrition.js';
import { behavior as mental }    from './mental.js';
import { behavior as comms }     from './comms.js';
import { behavior as knowledge } from './knowledge.js';
import { behavior as it }        from './it.js';
import { behavior as debug }     from './debug.js';

export const BEHAVIORS = {
  scholar, biz, research, atlas, finance, exercise,
  social, nutrition, mental, comms, knowledge, it, debug,
};

export function bDefault(a, d, t, now) {
  goHome(a, d);
  t.nextMoveAt = now + 4000 + Math.random() * 3000;
}
