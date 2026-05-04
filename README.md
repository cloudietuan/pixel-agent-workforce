# pixel-agent-workforce

**A personal AI agent workforce running in a pixel office.**

12 autonomous agents — each with a role, persistent memory, and live Ollama inference — rendered in a pixel-art office environment. Built for John's Command Center.

---

## Stack

| Layer | Tech |
|-------|------|
| Agent server | Colyseus (WebSocket), Node 18, TypeScript |
| Inference | Claude (Anthropic Messages API) *or* Ollama + llama3.2 |
| Pixel UI | Vanilla Canvas + pixel-agents sprites |
| Memory | SQLite (persistent across sessions) |
| Context sync | File watcher on `/context/` folder |

### Inference backend

Set `ANTHROPIC_API_KEY` in `server/.env` to have all 12 agents think using
Claude. Without the key, the server falls back to a local Ollama instance at
`http://127.0.0.1:11434`.

```bash
# server/.env
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-haiku-4-5-20251001   # optional override
```

---

## Quick Start

**Prerequisites:** Node 18 + 20 via nvm, Ollama with llama3.2 installed

```bash
# Terminal 1 — Agent server (Node 18)
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 18
cd server
npm install
npx tsx src/index.ts

# Terminal 2 — Pixel UI (Node 20)
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 20
cd pixel-ui
npm install
npx vite --port 5174
```

Open **http://localhost:5174/office.html**

### Access from other devices on your network

Start Vite bound to all interfaces:

```bash
cd pixel-ui && npx vite --host 0.0.0.0 --port 5174
```

Then on any phone / laptop on the same Wi-Fi, open
`http://<your-mac-ip>:5174/office.html` (the WebSocket auto-detects the host).

To target a different server, append `?ws=ws://host:port` to the URL.

---

## The 12 Agents

| Agent | Role | Key Areas |
|-------|------|-----------|
| 🎓 Scholar | Academic | AP exams, essays, Berkeley transition |
| 💼 Biz | Operations | Lumina Sites, Sunset Nails, new ventures |
| 🔬 Research | Analyst | Stock desk, crypto, general research |
| 📅 Atlas | Orchestrator | Calendar, goals, travel, long-term vision |
| 💰 Finance | CFO | College finance, pricing strategy, income |
| 💪 Exercise | Trainer | Workout planning, recovery, progress |
| 📣 Social | Content | Platform posts, content strategy, scripts |
| 🍽️ Nutrition | Dietitian | Meal planning, macros, Berkeley prep |
| 🧠 Mental | Wellbeing | Reflection, stress tracking, big picture |
| ✉️ Comms | Communications | Client emails, professional drafts |
| 📚 Knowledge | Archivist | Research archive, idea bank |
| 💻 IT | Portfolio | Site health, GitHub, auto-audit |

**Inter-agent rules:**
- Atlas orchestrates all agents
- Mental is the circuit breaker — flags overload to Atlas
- IT runs weekly audits proactively
- Exercise + Nutrition always pair
- Biz + Finance always coordinate

---

## Context Sync

Drop any `.txt` or `.md` file into `context/` — agents update automatically.

**Keyword routing:**
- `lumina` → Biz, Finance, Social, Comms
- `berkeley` → Scholar, Finance, Atlas
- `volleyball` → Exercise, Atlas, Mental
- `hinksey` → Research, Scholar, Comms
- `workout` → Exercise, Nutrition
- `stock` → Research, Finance

---

## Project Structure

```
pixel-agent-workforce/
├── server/                    # Colyseus agent server
│   └── src/
│       ├── index.ts           # Entry point + context sync
│       ├── context-sync.ts    # Watches /context/, routes to agents
│       ├── johns-agents.ts    # 12 agent configs + personalities
│       └── rooms/OfficeRoom.ts # Think loop, Ollama, memories
├── pixel-ui/                  # Web frontend
│   └── public/
│       ├── office.html        # Standalone pixel office (no build needed)
│       └── assets/            # Sprite sheets (pixel-agents)
│           ├── characters/    # char_0.png–char_5.png (16×32 frames)
│           ├── floors/
│           ├── walls/
│           └── furniture/
├── context/                   # Drop files here to update agent memories
│   ├── context-bible.md       # Who John is — loaded on every server start
│   └── NEXT-SESSION.md        # What to finish next
├── pixel-agents/              # Source repo (sprite reference)
├── agent-office/              # Source repo (server reference)
└── start.sh                   # Launch script
```

---

## Sprite System (pixel-agents)

Characters use sprite sheets from [pixel-agents](https://github.com/pablodelucca/pixel-agents):
- Frame size: **16×32 pixels** per frame
- Layout: 7 frames wide × 3 rows tall
- Rows: `row0=down`, `row1=up`, `row2=right`, left=flip(right)
- Walk animation: frames 0–3, Idle: frame 1
- Anchor: **bottom-center** — `drawX = x - width/2`, `drawY = y - height`
- Render scale: 3× (48px tiles, 48×96 characters on screen)

---

## Status

- ✅ Server running — 12 agents with persistent memory
- ✅ Ollama inference — real thoughts every ~15 seconds  
- ✅ Context sync — auto-routes conversation exports to agents
- ✅ Sprite assets — all characters, floors, walls, furniture present
- ⚠️ office.html — UI mid-rewrite (correct sprite constants now fixed)

---

## Credits

Pixel art sprites from [pixel-agents](https://github.com/pablodelucca/pixel-agents) by pablodelucca.
Agent server based on [agent-office](https://github.com/lalalune/agent-office).
