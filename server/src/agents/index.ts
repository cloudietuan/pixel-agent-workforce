// Aggregates all 12 agents from their individual files.
// Drop-in replacement for the old monolithic johns-agents.ts.

import { JohnsAgentConfig } from './base';
import { scholar } from './scholar';
import { biz } from './biz';
import { research } from './research';
import { atlas } from './atlas';
import { finance } from './finance';
import { exercise } from './exercise';
import { social } from './social';
import { nutrition } from './nutrition';
import { mental } from './mental';
import { comms } from './comms';
import { knowledge } from './knowledge';
import { it } from './it';
import { debug } from './debug';

export const JOHNS_AGENTS: JohnsAgentConfig[] = [
  scholar,
  biz,
  research,
  atlas,
  finance,
  exercise,
  social,
  nutrition,
  mental,
  comms,
  knowledge,
  it,
  debug,
];

export {
  scholar, biz, research, atlas, finance, exercise,
  social, nutrition, mental, comms, knowledge, it, debug,
};
