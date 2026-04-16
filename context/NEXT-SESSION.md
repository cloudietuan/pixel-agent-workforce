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

## THE ONE THING TO FINISH: office.html

File: ~/johns-command-center/pixel-ui/public/office.html
The character drawing code is correct and written. Just needs:
1. Sidebar build + update functions
2. Colyseus server connection
3. Main render loop + boot

Key facts already figured out:
- CHAR_FRAME_W=16, CHAR_FRAME_H=32 (NOT 16x16, it's 16x32)
- Direction rows: 0=down, 1=up, 2=right, left=flip right
- Anchor characters BOTTOM-CENTER: drawX = x - width/2, drawY = y - height
- Walk frames 0-3, Idle frame 1
- ZOOM=3 (48px tiles), TILE=16

Just tell Claude: "Continue finishing office.html from where we left off"
and share this file as context.

---

## WHAT'S ALREADY WORKING
- Server: 12 agents thinking with real Ollama inference every 15 seconds
- All 12 agents have persistent memories in SQLite
- Context sync watches ~/context/ folder and updates agent memories
- Sprite assets all present and correct
- Character frame cache (getFrame function) is correct
