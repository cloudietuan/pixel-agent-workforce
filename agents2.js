// Agent definitions — 12 workers + Debug the dog.
// Every agent has a WORKSTATION (workZone: the tile they stand at while working)
// and a SEAT direction they face.

export const TILE = 16;
export const ZOOM = 3;
export const S = TILE * ZOOM;
export const CHAR_W = 16;
export const CHAR_H = 32;
export const DIR_DOWN = 0;
export const DIR_UP = 1;
export const DIR_RIGHT = 2;

// Expanded world: wider so each agent has real elbow room.
// Grid: COLS × ROWS. Two rooms: Workspace (left) + Lounge (right). Exits on top wall for future expansion.
export const COLS = 52;
export const ROWS = 22;
export const ROOM_DIVIDE_COL = 26;
export const DOOR_ROW_TOP = 10;
export const DOOR_ROW_BOT = 11;

// Workstation positions — each agent has a desk (occupied tile) + a standing spot (walkable) facing it.
// Layout: 6 desks along top row of workspace, 6 desks along bottom row.
// Lounge has: coffee station, 2 couch groups, reading nook, dog bed.
// col/row = tile the agent STANDS on (walkable), deskCol/deskRow = desk tile (not walkable).
export const AGENTS = [
  // ── Top row of workspace (cols 3,7,11,15,19,23) ──
  { id:'scholar',   name:'Scholar',   emoji:'🎓', role:'Academic',       color:'#4fc3f7',
    col:3,  row:5,  deskCol:3,  deskRow:4,  faceDir:'up', si:0,
    mission:'AP exams · essays · Berkeley transition',
    persona:'A focused, methodical student-researcher. Loves structure. Gets anxious when behind schedule.',
    thoughts:['Cross-checking essay thesis','Reviewing AP Calc mocks','Drafting Berkeley transfer letter','Summarizing lecture notes'] },
  { id:'biz',       name:'Biz',       emoji:'💼', role:'Operations',     color:'#81c784',
    col:7,  row:5,  deskCol:7,  deskRow:4,  faceDir:'up', si:1,
    mission:'Lumina Sites · Sunset Nails · new ventures',
    persona:'Pragmatic operator. Speaks in spreadsheets. Zero patience for vibes without margin.',
    thoughts:['Pricing Lumina retainer tiers','Sunset Nails inventory check','Vendor onboarding flow','Q2 OKRs drafted'] },
  { id:'research',  name:'Research',  emoji:'🔬', role:'Analyst',        color:'#ffb74d',
    col:11, row:5,  deskCol:11, deskRow:4,  faceDir:'up', si:2,
    mission:'Stock desk · crypto · general research',
    persona:'Evidence-first analyst. Cautious, data-soaked. Gets excited by anomalies.',
    thoughts:['Scanning 10-Q filings','BTC/ETH ratio anomaly','Sentiment model retraining','Drafting macro note'] },
  { id:'atlas',     name:'Atlas',     emoji:'📅', role:'Orchestrator',   color:'#ce93d8',
    col:15, row:5,  deskCol:15, deskRow:4,  faceDir:'up', si:3,
    mission:'Calendar · goals · travel · long-term vision',
    persona:'The orchestrator. Calm, strategic, sees the whole board. Proposes expansions when load spikes.',
    thoughts:['Rebalancing daily agenda','Routing Biz ↔ Finance','Long-range goal review','Travel itinerary draft'] },
  { id:'finance',   name:'Finance',   emoji:'💰', role:'CFO',            color:'#f48fb1',
    col:19, row:5,  deskCol:19, deskRow:4,  faceDir:'up', si:4,
    mission:'College finance · pricing strategy · income',
    persona:'Conservative CFO. Numbers over narrative. Stress spikes when runway dips.',
    thoughts:['Runway model v4','College aid forecast','Margin check on Lumina','Tax-loss harvesting'] },
  { id:'exercise',  name:'Exercise',  emoji:'💪', role:'Trainer',        color:'#80cbc4',
    col:23, row:5,  deskCol:23, deskRow:4,  faceDir:'up', si:5,
    mission:'Workout planning · recovery · progress',
    persona:'Energetic trainer. Thinks in sets and reps. Auto-pairs with Nutrition.',
    thoughts:['Deload week programmed','Volleyball plyo block','Recovery HRV trending up','Pulling Nutrition in'] },
  // ── Bottom row of workspace (cols 3,7,11,15,19,23) ──
  { id:'social',    name:'Social',    emoji:'📣', role:'Content',        color:'#fff176',
    col:3,  row:16, deskCol:3,  deskRow:17, faceDir:'down', si:0,
    mission:'Platform posts · content strategy · scripts',
    persona:'Hook-obsessed content person. Thinks in formats. Rivals Research over narrative vs data.',
    thoughts:['Hook variant A outperforming','Short-form cadence bump','Script: "office tour" cut','Pitching Biz on launch copy'] },
  { id:'nutrition', name:'Nutrition', emoji:'🍽', role:'Dietitian',      color:'#a5d6a7',
    col:7,  row:16, deskCol:7,  deskRow:17, faceDir:'down', si:1,
    mission:'Meal planning · macros · Berkeley prep',
    persona:'Detail-oriented dietitian. Paired at the hip with Exercise.',
    thoughts:['Macro split for bulk','Berkeley dining audit','Grocery auto-list ready','Syncing with Exercise'] },
  { id:'mental',    name:'Mental',    emoji:'🧠', role:'Wellbeing',      color:'#ef9a9a',
    col:11, row:16, deskCol:11, deskRow:17, faceDir:'down', si:2,
    mission:'Reflection · stress tracking · big picture',
    persona:'The check-in person. Flags overload to Atlas. Gets resentful of Finance for squeezing joy.',
    thoughts:['Stress index climbing','Flagging overload to Atlas','Journaling prompt queued','Checking in with Scholar'] },
  { id:'comms',     name:'Comms',     emoji:'✉️', role:'Communications', color:'#90caf9',
    col:15, row:16, deskCol:15, deskRow:17, faceDir:'down', si:3,
    mission:'Client emails · professional drafts',
    persona:'Diplomatic writer. Warm + direct. Always finishing a follow-up.',
    thoughts:['Drafting Lumina reply','Tone: warm / direct','Follow-up queue: 3','Signing off thread #912'] },
  { id:'knowledge', name:'Knowledge', emoji:'📚', role:'Archivist',      color:'#ffe082',
    col:19, row:16, deskCol:19, deskRow:17, faceDir:'down', si:4,
    mission:'Research archive · idea bank',
    persona:'Quiet archivist. Remembers everything. Paired with Scholar.',
    thoughts:['Indexing new PDFs','Tagging idea #284','Cross-linking Scholar notes','Archive → 2,318 entries'] },
  { id:'it',        name:'IT',        emoji:'💻', role:'Portfolio',      color:'#b0bec5',
    col:23, row:16, deskCol:23, deskRow:17, faceDir:'down', si:5,
    mission:'Site health · GitHub · auto-audit',
    persona:'Low-ego infra person. Speaks in commits and uptime %. Shrugs at drama.',
    thoughts:['Uptime 99.98%','Running weekly audit','Deploying patch to Lumina','Listener on context/ ok'] },
  // ── The dog: lounge, own bed ──
  { id:'debug',     name:'Debug',     emoji:'🐕', role:'Office Dog',     color:'#d4a574',
    col:42, row:17, deskCol:42, deskRow:17, faceDir:'down', si:'dog', noTint:true,
    mission:'Vibes · floor patrol · morale',
    persona:'A good dog. Sleeps in the lounge, patrols when bored, seeks out whoever has the lowest mood.',
    thoughts:['*sniff sniff*','Patrolling the lounge','Tail wagging','Found a sunny spot'] },
];

export const PAIRS = [
  ['exercise','nutrition', 'alliance'],
  ['biz','finance',         'alliance'],
  ['scholar','knowledge',   'alliance'],
  ['atlas','mental',        'alliance'],
  ['research','finance',    'alliance'],
  ['social','comms',        'alliance'],
  ['biz','social',          'alliance'],
  ['scholar','atlas',       'neutral'],
  ['research','social',     'rivalry'],
  ['finance','mental',      'rivalry'],
];

export const BY_ID = Object.fromEntries(AGENTS.map(a => [a.id, a]));

export const SCENARIOS = ['Startup Crunch','Hackathon Night','Incident War Room','Product Launch'];

export const CHAOS_EVENTS = [
  { id:'server_outage',      label:'Server Outage',      icon:'🔥' },
  { id:'funding_cut',        label:'Funding Cut',        icon:'💸' },
  { id:'client_escalation',  label:'Client Escalation',  icon:'📞' },
  { id:'surprise_launch',    label:'Surprise Launch',    icon:'🚀' },
  { id:'viral_tweet',        label:'Viral Tweet',        icon:'📈' },
];

// ── Meeting / gathering points (walkable tiles) ──
export const MEET_SPOTS = [
  { id:'coffee',     label:'Coffee corner', col: 20, row: 9 },
  { id:'whiteboard', label:'Whiteboard',    col: 12, row: 10 },
  { id:'lounge_a',   label:'Lounge couch',  col: 33, row: 9 },
  { id:'lounge_b',   label:'Fire pit',      col: 42, row: 13 },
  { id:'reading',    label:'Reading nook',  col: 47, row: 6 },
];

// ── Dog bed location ──
export const DOG_BED = { col: 42, row: 17 };
