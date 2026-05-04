// AI Engine — Claude-powered thoughts, chats, recaps, story evolution.
// All Claude calls routed through here. Persistent memory in localStorage.
import { AGENTS, BY_ID, PAIRS } from './agents2.js';
import { state } from './sim2.js';
import { unlockExit, EXITS } from './world5.js';

const MEM_KEY = 'pixel-memory-v1';
const STORY_KEY = 'pixel-story-v1';
const CTX_KEY  = 'pixel-user-context-v1';

// ── Persistent memory ───────────────────────────────────────────────────────
export const Memory = load(MEM_KEY, {
  events: [],         // shared world events — latest first, capped
  perAgent: {},       // { agentId: { recentEvents: [], persona: str, evolvedTraits: [] } }
});
AGENTS.forEach(a => { if (!Memory.perAgent[a.id]) Memory.perAgent[a.id] = { recentEvents: [], persona: a.persona, evolvedTraits: [] }; });

export const Story = load(STORY_KEY, {
  day: 1,
  tensions: [],
  openThreads: [],
  milestones: [],
  worldSize: 'office', // office → office+rooftop → office+rooftop+street → town
  unlockedRooms: ['workspace','lounge'],
});

export const UserContext = load(CTX_KEY, {
  note: '',  // user-provided free context
  updatedAt: 0,
});

function load(k, def) { try { const r = localStorage.getItem(k); if (r) return { ...def, ...JSON.parse(r) }; } catch {} return def; }
function save(k, v)  { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

export function saveAll() { save(MEM_KEY, Memory); save(STORY_KEY, Story); save(CTX_KEY, UserContext); }

export function setUserContext(note) {
  UserContext.note = note.slice(0, 4000);
  UserContext.updatedAt = Date.now();
  save(CTX_KEY, UserContext);
}

export function logEvent(type, text, agents=[]) {
  const e = { t: Date.now(), type, text: text.slice(0, 260), agents };
  Memory.events.unshift(e);
  Memory.events = Memory.events.slice(0, 60);
  agents.forEach(aid => {
    if (!Memory.perAgent[aid]) Memory.perAgent[aid] = { recentEvents: [], persona: BY_ID[aid]?.persona || '', evolvedTraits: [] };
    Memory.perAgent[aid].recentEvents.unshift(e);
    Memory.perAgent[aid].recentEvents = Memory.perAgent[aid].recentEvents.slice(0, 20);
  });
  save(MEM_KEY, Memory);
}

// ── Claude wrapper ──────────────────────────────────────────────────────────
let lastCall = 0, inflight = 0;
const MIN_GAP = 400, MAX_INFLIGHT = 3;

async function ask(prompt, maxLen=120) {
  if (!window.claude?.complete) return null;
  if (inflight >= MAX_INFLIGHT) return null;
  const gap = Date.now() - lastCall;
  if (gap < MIN_GAP) await new Promise(r => setTimeout(r, MIN_GAP - gap));
  lastCall = Date.now();
  inflight++;
  try {
    const out = await window.claude.complete(prompt);
    return (out || '').trim().slice(0, maxLen);
  } catch (e) { return null; }
  finally { inflight--; }
}

function agentSnapshot(aid) {
  const a = state[aid]; if (!a) return '';
  const m = Memory.perAgent[aid];
  const recent = (m?.recentEvents || []).slice(0, 4).map(e => `- ${e.text}`).join('\n');
  return `You are ${a.name} (${a.role}) in a pixel office simulation.
Persona: ${m?.persona || a.persona}
Mission: ${a.mission}
Mood: ${a.mood.toFixed(2)} · Reputation: ${a.reputation.toFixed(2)} · Risk: ${a.risk.toFixed(2)} · Momentum: ${a.momentum.toFixed(2)}
Recent events you experienced:
${recent || '(none)'}
${UserContext.note ? `User (John)'s context: ${UserContext.note.slice(0, 400)}` : ''}`;
}

// ── Claude-backed thought generator ────────────────────────────────────────
const thoughtCooldown = {};
export async function generateThought(aid) {
  if (!window.claude?.complete) return null;
  if ((thoughtCooldown[aid] || 0) > Date.now()) return null;
  thoughtCooldown[aid] = Date.now() + 25000 + Math.random()*15000;
  const snap = agentSnapshot(aid);
  const prompt = `${snap}

Write a SINGLE short first-person thought (10–16 words) about what you're doing right now. Plain text, no quotes, no prefix. In-character.`;
  const out = await ask(prompt, 140);
  if (out) {
    const a = state[aid];
    a.thought = out.replace(/^["']|["']$/g, '');
    return out;
  }
  return null;
}

// ── Claude-backed chat reply ────────────────────────────────────────────────
export async function generateChatReply(aid, userText, history=[]) {
  const snap = agentSnapshot(aid);
  const hist = history.slice(-6).map(m => `${m.sender}: ${m.text}`).join('\n');
  const prompt = `${snap}

Conversation so far:
${hist}
John: ${userText}

Reply as ${BY_ID[aid].name} in 1–2 short sentences. In-character. Acknowledge the task/question. No preamble, no quotes.`;
  return (await ask(prompt, 300)) || `On it — routing this through Atlas.`;
}

// ── Episode recap ──────────────────────────────────────────────────────────
export async function generateRecap() {
  const events = Memory.events.slice(0, 20).map(e => `- [${e.type}] ${e.text}`).join('\n');
  const prompt = `You are the narrator of a pixel-office workforce sim. John is the user/principal.
Recent events (newest first):
${events || '(quiet day)'}

Write a 3-sentence episode recap for Day ${Story.day}. Dramatic, concise, newsletter tone. Plain text.`;
  return (await ask(prompt, 500)) || `Day ${Story.day} — the office kept pace. Alliances held. Tomorrow, Atlas is proposing new ground.`;
}

// ── Story evolution: user chat → world events ───────────────────────────────
// Parse user chat via Claude for: mentioned intents, agent routing, story flags.
export async function processUserMessage(text) {
  const knownFlags = ['expand', 'scale', 'hire', 'outside', 'town', 'travel', 'rooftop', 'street'];
  const low = text.toLowerCase();

  // Local heuristic first (no Claude needed for common cases)
  let evolved = false;
  if (knownFlags.some(f => low.includes(f))) {
    if (!EXITS.find(e=>e.id==='street').unlocked && (low.includes('street') || low.includes('outside') || low.includes('town') || low.includes('expand'))) {
      unlockExit('street');
      Story.unlockedRooms.push('street');
      Story.milestones.push({ day: Story.day, text: 'Street exit unlocked' });
      logEvent('expansion', 'Atlas proposed street expansion — exit unlocked', ['atlas']);
      evolved = true;
    }
    if (!EXITS.find(e=>e.id==='rooftop').unlocked && (low.includes('rooftop') || low.includes('above') || low.includes('scale'))) {
      unlockExit('rooftop');
      Story.unlockedRooms.push('rooftop');
      Story.milestones.push({ day: Story.day, text: 'Rooftop unlocked' });
      logEvent('expansion', 'Rooftop unlocked — Atlas plans open-air standups', ['atlas']);
      evolved = true;
    }
  }

  logEvent('user', `John said: "${text.slice(0,120)}"`);
  saveAll();
  return { evolved };
}

// ── Advance day ─────────────────────────────────────────────────────────────
export function advanceDay() {
  Story.day++;
  logEvent('day', `Day ${Story.day} begins`);
  saveAll();
  return Story.day;
}

// ── Evolve personas (periodic, stat-driven) ────────────────────────────────
export function evolvePersonas() {
  AGENTS.filter(a=>a.id!=='debug').forEach(a => {
    const s = state[a.id];
    const m = Memory.perAgent[a.id];
    const traits = new Set(m.evolvedTraits);
    if (s.mood < 0.3 && !traits.has('burnt-out')) { traits.add('burnt-out'); logEvent('evolution', `${a.name} is burning out`, [a.id]); }
    if (s.mood > 0.85 && !traits.has('thriving')) { traits.add('thriving'); logEvent('evolution', `${a.name} is thriving`, [a.id]); }
    if (s.reputation > 0.8 && !traits.has('respected')) { traits.add('respected'); logEvent('evolution', `${a.name} gained respect across the office`, [a.id]); }
    if (s.risk > 0.8 && !traits.has('volatile')) { traits.add('volatile'); logEvent('evolution', `${a.name} is acting volatile`, [a.id]); }
    m.evolvedTraits = [...traits];
  });
  saveAll();
}

export function offline() { return !window.claude?.complete; }
