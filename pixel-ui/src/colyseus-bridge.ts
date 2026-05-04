// COLYSEUS BRIDGE — Johns Command Center
// Connects pixel-agents UI to our Colyseus server.
// Sends messages in the exact format pixel-agents expects.

import * as Colyseus from 'colyseus.js';

declare global {
  interface Window {
    __bridge_spawnAgents?: () => void;
    __colyseus_postMessage?: (msg: unknown) => void;
  }
}

interface AgentSchemaShape {
  action: string;
  thought: string;
  onChange: (cb: () => void) => void;
}

interface OfficeStateShape {
  agents: {
    onAdd: (cb: (agent: AgentSchemaShape, agentId: string) => void) => void;
  };
}

const WS_URL = 'ws://localhost:3000';

const AGENT_MAP: Record<string, { id: number; palette: number; hueShift: number; label: string }> = {
  scholar:   { id: 1,  palette: 0, hueShift: 200, label: 'Scholar 🎓' },
  biz:       { id: 2,  palette: 1, hueShift: 120, label: 'Biz 💼' },
  research:  { id: 3,  palette: 2, hueShift: 45,  label: 'Research 🔬' },
  atlas:     { id: 4,  palette: 3, hueShift: 180, label: 'Atlas 📅' },
  finance:   { id: 5,  palette: 4, hueShift: 30,  label: 'Finance 💰' },
  exercise:  { id: 6,  palette: 5, hueShift: 15,  label: 'Exercise 💪' },
  social:    { id: 7,  palette: 0, hueShift: 320, label: 'Social 📣' },
  nutrition: { id: 8,  palette: 1, hueShift: 90,  label: 'Nutrition 🍽️' },
  mental:    { id: 9,  palette: 2, hueShift: 270, label: 'Mental 🧠' },
  comms:     { id: 10, palette: 3, hueShift: 210, label: 'Comms ✉️' },
  knowledge: { id: 11, palette: 4, hueShift: 60,  label: 'Knowledge 📚' },
  it:        { id: 12, palette: 5, hueShift: 0,   label: 'IT 💻' },
};

const ACTION_TOOL_MAP: Record<string, string> = {
  work:     'Write',
  talk:     'Chat',
  use_tool: 'WebSearch',
  idle:     '',
};

function dispatch(msg: unknown) {
  window.dispatchEvent(new MessageEvent('message', { data: msg }));
}

function spawnAgents() {
  // Step 1: Send existingAgents with meta — buffered until layout loads
  const agents = Object.values(AGENT_MAP).map(a => a.id);
  const agentMeta: Record<number, { palette: number; hueShift: number }> = {};
  const folderNames: Record<number, string> = {};

  for (const [, info] of Object.entries(AGENT_MAP)) {
    agentMeta[info.id] = { palette: info.palette, hueShift: info.hueShift };
    folderNames[info.id] = info.label;
  }

  dispatch({ type: 'existingAgents', agents, agentMeta, folderNames });

  // Step 2: layoutLoaded — triggers agents to be placed from buffer
  setTimeout(() => {
    dispatch({ type: 'layoutLoaded', layout: null });
    console.log('[Bridge] Spawned 12 agents in pixel office');
  }, 200);
}

let room: Colyseus.Room | null = null;

function connect() {
  const client = new Colyseus.Client(WS_URL);

  client.joinOrCreate('office').then((r) => {
    room = r;
    console.log('[Bridge] Connected to Johns Command Center ✓');

    // Listen for state changes and update tool animations
    const state = r.state as OfficeStateShape;
    state.agents.onAdd((agent, agentId) => {
      const info = AGENT_MAP[agentId];
      if (!info) return;

      agent.onChange(() => {
        const toolName = ACTION_TOOL_MAP[agent.action] || '';
        const toolId = `${agentId}-tool`;

        if (toolName) {
          dispatch({
            type: 'agentToolStart',
            id: info.id,
            toolId,
            toolName,
            input: agent.thought || '',
          });
        } else {
          dispatch({ type: 'agentToolEnd', id: info.id, toolId });
        }
      });
    });

    // Map chat messages to waiting bubbles
    r.onMessage('chat', (msg: { sender: string; text: string }) => {
      const entry = Object.entries(AGENT_MAP).find(
        ([, v]) => v.label.toLowerCase().includes(msg.sender.toLowerCase())
      );
      if (entry) {
        dispatch({ type: 'agentWaiting', id: entry[1].id });
        setTimeout(() => dispatch({ type: 'agentDoneWaiting', id: entry[1].id }), 3000);
      }
    });

    r.onLeave(() => {
      console.log('[Bridge] Disconnected — reconnecting in 3s');
      setTimeout(connect, 3000);
    });

  }).catch((err) => {
    console.warn('[Bridge] Server not ready, retrying in 3s...', err.message);
    setTimeout(connect, 3000);
  });
}

export function setupBridge() {
  // Register spawn function — called when vscodeApi receives 'webviewReady'
  // This fires AFTER React mounts and adds the message listener (safe timing)
  window.__bridge_spawnAgents = () => {
    spawnAgents();
    console.log('[Bridge] webviewReady received — spawning 12 agents');
  };

  // Connect to Colyseus server for live agent state
  connect();

  // Allow UI to send messages back to server
  window.__colyseus_postMessage = (msg: unknown) => {
    if (!room) return;
    const m = msg as Record<string, unknown>;
    if (m.type === 'chat') room.send('chat', { text: m.text });
  };

  console.log('[Bridge] Johns Command Center bridge ready');
}
