# NEXT SESSION — PICK UP HERE
# Created: April 16, 2026

## START SERVERS FIRST
Tab 1:
  export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 18
  cd ~/johns-command-center/server
  /Users/johnny/john-command-center/server/node_modules/.bin/tsx src/index.ts

Tab 2:
  export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 20
  cd ~/johns-command-center/pixel-ui
  node_modules/.bin/vite --port 5174

Open: http://localhost:5174/office.html

---

## UI REWRITE — DONE ✅ (April 16 evening)
File: pixel-ui/public/office.html (branch: claude/update-pixel-agent-ui-qHlY5)

Completed:
- 4×3 agent grid (no wall/desk overlap)
- Purposeful wander behavior (visit buddies, break area, rest)
- Chat bubbles + live-feed logging when agents meet
- Pokémon-style zone rugs per team (Strategy/Business/Wellness)
- Grouped sidebar cards with color-coded team headers
- Walk/idle sprite animation, bottom-center anchor, 4-frame walk
- Depth sorting (Y-sort) so characters render in front of rear furniture

## STILL OPEN (next session)
1. Wire Claude API (Anthropic) as an alternative inference backend
   — current stack uses Ollama llama3.2 locally
   — agents each get a Claude model call with their persona + context
   — requires ANTHROPIC_API_KEY env var + server/src/rooms/OfficeRoom.ts edits
2. Overlay mode — make pixel-ui a floating overlay window (Electron wrapper?)
3. Sound: footsteps, door chime on entrance visits
4. start.sh — node version auto-switch still flaky

---

## WHAT'S ALREADY WORKING
- Server: 12 agents thinking with real Ollama inference every 15 seconds
- All 12 agents have persistent memories in SQLite
- Context sync watches ~/context/ folder and updates agent memories
- Sprite assets all present and correct
- Character frame cache (getFrame function) is correct
