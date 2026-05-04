# JOHNS COMMAND CENTER — SESSION CONTEXT UPDATE
# Last updated: April 16, 2026 (UI rewrite — evening session)
# This file is auto-loaded by ContextSync on every server start.

## UI REWRITE — COMPLETED THIS SESSION
- office.html layout fully fixed — 4×3 grid (12 agents), no desk/wall overlap
- Characters now animate with purpose: walk, visit buddies, take breaks, return to desk
- Pokémon-style zone rugs per team (Strategy / Business / Wellness)
- Chat bubbles show when agents meet (speaks buddy's name in feed)
- Sidebar now groups agents by team with color-coded headers
- Buddy relationships encoded from inter-agent rules (Atlas orchestrates, Mental checks on, Exercise↔Nutrition, Biz↔Finance, etc.)
- Branch: claude/update-pixel-agent-ui-qHlY5


## WHO JOHN IS
- Senior at Gilbert Classical Academy (GCA), Gilbert, Arizona — graduating 2026
- Admitted to UC Berkeley, enrolling fall 2026
- Vietnamese-American, family owns Sunset Nails salon in Mesa, AZ
- Runs Lumina Sites — subscription web design (Starter/Professional/Luxe tiers), wellness/salon clients AZ
- Completing internship at Hinksey Labs (prompt engineering, behavioral economics, Harvard referencing)
- Varsity volleyball captain and libero at GCA; coaches club and middle school volleyball
- Searching for flights out of OAK airport (California) — likely Berkeley trip/move planning

## CURRENT PRIORITIES (as of this session)
- AP exams: AP Stats, AP Lit, Philosophy final
- Car wash fundraiser April 18 (volleyball)
- Hinksey Labs internship deliverables
- Lumina Sites client work ongoing
- UC Berkeley enrollment + transition planning (cost of living research, FAFSA by May 2)
- Bold.org scholarship applications active

---

## WHAT WAS BUILT THIS SESSION

### 1. PROJECT FOLDER: ~/johns-command-center/
Full local project with this structure:
```
johns-command-center/
├── start.sh              ← ONE COMMAND TO LAUNCH EVERYTHING
├── README.md
├── context/              ← DROP FILES HERE to update agent memories
│   ├── context-bible.md  ← Always loaded on server start (this file)
│   └── HOW-TO-SYNC.txt
├── server/               ← Colyseus WebSocket server (Node 18, port 3000)
│   └── src/
│       ├── index.ts      ← Entry point, loads ContextSync
│       ├── context-sync.ts ← Watches /context folder, auto-routes to agents
│       ├── johns-agents.ts ← 12 agent configs with personalities
│       └── rooms/OfficeRoom.ts ← Agent think loop, Ollama inference, memories
├── pixel-ui/             ← Web UI (Node 20, Vite, port 5174)
│   └── public/
│       ├── office.html   ← MAIN UI — standalone pixel office (NO build step needed)
│       └── assets/       ← Sprite sheets from pixel-agents repo
│           ├── characters/ (char_0.png through char_5.png)
│           ├── floors/
│           ├── walls/
│           └── furniture/
├── pixel-agents/         ← Original repo (reference, do not delete)
└── agent-office/         ← Original repo (reference, do not delete)
```

### 2. SERVER (WORKING ✅)
- Colyseus WebSocket server running on ws://localhost:3000
- 12 agents loaded with persistent SQLite memory (server/data/office-memory.db)
- Ollama (llama3.2) running locally at http://127.0.0.1:11434
- Each agent thinks every ~15 seconds with real context about John's life
- Agent thoughts logged: [AgentName] 💭 thought → action
- Context sync watches ~/johns-command-center/context/ for .txt/.md files
- Keyword routing: "lumina"→Biz/Finance, "berkeley"→Scholar/Atlas, etc.

### 3. PIXEL OFFICE UI (IN PROGRESS ⚠️)
- Main file: ~/johns-command-center/pixel-ui/public/office.html
- Standalone HTML — served by Vite, no build step required
- Opens at http://localhost:5174/office.html
- Connects to Colyseus server via colyseus.js CDN

**CURRENT UI STATUS:**
The office.html was being rewritten at the end of this session to fix:
1. Cut-off character heads (wrong frame height: was 16px, should be 32px)
2. No animation (wrong direction rows)
3. Characters not moving

**ROOT CAUSE IDENTIFIED AND FIXED IN CODE (needs final completion):**
From pixel-agents/shared/assets/constants.ts:
- CHAR_FRAME_W = 16px ← correct
- CHAR_FRAME_H = 32px ← WAS WRONG (used 16px before)
- CHAR_FRAMES_PER_ROW = 7
- Direction rows: row0=down, row1=up, row2=right, left=flip(right)
- Walk = frames 0-3, Idle = frame 1, anchor = BOTTOM-CENTER not top-left

The new office.html was ~70% written when the session ended.

---

## HOW TO START EVERYTHING (right now)

Open two Terminal tabs:

**Tab 1 — Server (Node 18):**
```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 18
cd ~/johns-command-center/server
/Users/johnny/john-command-center/server/node_modules/.bin/tsx src/index.ts
```

**Tab 2 — UI (Node 20):**
```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 20
cd ~/johns-command-center/pixel-ui
node_modules/.bin/vite --port 5174
```

Then open: http://localhost:5174/office.html

---

## WHAT STILL NEEDS TO BE DONE (next session)

### IMMEDIATE — Complete office.html
The file was mid-rewrite. Need to finish:
1. Colyseus connection (server→UI state sync)
2. Sidebar update functions (agent cards + live feed)
3. Main render loop
4. Close </script> and </body> tags

The correct character rendering logic is already written:
- getFrame(si, row, frame, flip) — pre-caches offscreen canvas per frame
- drawAgents(ts) — bottom-center anchor, proper 16×32 frames, 3 direction rows
- Walk speed = 48px/sec (matching pixel-agents constants)
- Idle bob animation

### AFTER THAT
1. start.sh — currently has node version issues, needs fixing
2. Context sync — verify it's injecting memories correctly on server connect
3. Agent inter-communication (Atlas orchestrating others)
4. Remaining agent UI panels (Biz, Finance, Scholar etc.)

---

## 12 AGENTS STATUS

| Agent | Status | Key Focus This Session |
|-------|--------|----------------------|
| 🎓 Scholar | ✅ Thinking | FQHC prototype presentation, AP Stats, Berkeley prep |
| 💼 Biz | ✅ Thinking | Lumina Sites & Sunset Nails financials, startup prioritization |
| 🔬 Research | ✅ Thinking | Scalable systems update, Harvard references |
| 📅 Atlas | ✅ Thinking | Car wash April 18, coaching April 19, schedule coordination |
| 💰 Finance | ✅ Thinking | Bay Area cost of living, FAFSA May 2 deadline, Lumina tiers |
| 💪 Exercise | ✅ Thinking | Agility training, syncing with Nutrition |
| 📣 Social | ✅ Thinking | SEO blog articles for Arizona wellness industry |
| 🍽️ Nutrition | ✅ Thinking | Volleyball training fueling plan |
| 🧠 Mental | ✅ Thinking | Checking John's stress, gentle nudges before burnout |
| ✉️ Comms | ✅ Thinking | Lumina Sites client messages, scheduling conflicts |
| 📚 Knowledge | ✅ Thinking | VolleyTrack Pro + LessonLock data connections |
| 💻 IT | ✅ Thinking | Lumina Sites audit, broken links |

---

## IMPORTANT FILES TO KNOW

- **Server entry**: ~/johns-command-center/server/src/index.ts
- **Agent configs**: ~/johns-command-center/server/src/johns-agents.ts  
- **Office room**: ~/johns-command-center/server/src/rooms/OfficeRoom.ts
- **Context sync**: ~/johns-command-center/server/src/context-sync.ts
- **Pixel UI**: ~/johns-command-center/pixel-ui/public/office.html ← NEEDS COMPLETION
- **Sprite assets**: ~/johns-command-center/pixel-ui/public/assets/
- **SQLite memories**: ~/johns-command-center/server/data/office-memory.db
- **Ollama**: Running at http://127.0.0.1:11434 with llama3.2:latest

## CONTEXT SYNC — HOW TO USE
Drop any .txt or .md file into ~/johns-command-center/context/
Server auto-detects it and routes to relevant agents by keyword:
- "lumina" → Biz, Finance, Social, Comms
- "berkeley" → Scholar, Finance, Atlas
- "volleyball" → Exercise, Atlas, Mental
- "hinksey" → Research, Scholar, Comms
- "workout" → Exercise, Nutrition
- etc.
