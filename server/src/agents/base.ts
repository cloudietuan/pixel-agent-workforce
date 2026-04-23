// Shared personality defaults for all of John's agents.
// Individual agents can override any field in their own file.
import { AgentConfig } from '../../../core';

export type JohnsAgentConfig = AgentConfig & {
  deskX: number;
  deskY: number;
};

export const BASE_PERSONALITY = {
  workHours: { start: '09:00', end: '23:00' },
  breakFrequency: 120,
};

export const OLLAMA = {
  provider: 'ollama' as const,
  model: 'llama3.2:latest',
};
