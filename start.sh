#!/bin/bash
# ═══════════════════════════════════════════════════════
# JOHNS COMMAND CENTER — START SCRIPT
# Run from ~/johns-command-center: bash start.sh
# ═══════════════════════════════════════════════════════

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'

echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║       JOHNS COMMAND CENTER  v1.0              ║${NC}"
echo -e "${CYAN}║  12 Agents · Pixel Office · Claude-Powered    ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════╝${NC}"
echo ""

# Load nvm
export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"
nvm use 18 --silent

DIR="$(cd "$(dirname "$0")" && pwd)"

# Start Ollama if not running
if ! /Applications/Ollama.app/Contents/Resources/ollama list &>/dev/null; then
  echo -e "${YELLOW}Starting Ollama...${NC}"
  open /Applications/Ollama.app
  sleep 3
fi
echo -e "${GREEN}✓ Ollama ready${NC}"

# Kill any leftover processes on ports 3000 and 5174
lsof -ti:3000 | xargs kill -9 2>/dev/null
lsof -ti:5174 | xargs kill -9 2>/dev/null

# Start server
echo -e "${CYAN}Starting server...${NC}"
cd "$DIR/server"
/Users/johnny/john-command-center/server/node_modules/.bin/tsx src/index.ts &
SERVER_PID=$!
sleep 2
echo -e "${GREEN}✓ Server running (PID $SERVER_PID) on ws://localhost:3000${NC}"

# Start pixel-agents UI
echo -e "${CYAN}Starting pixel office UI...${NC}"
cd "$DIR/pixel-ui"
node_modules/.bin/vite --port 5174 &
UI_PID=$!
sleep 2
echo -e "${GREEN}✓ Pixel UI running (PID $UI_PID) on http://localhost:5174${NC}"

echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}  Command Center is LIVE${NC}"
echo -e "${GREEN}  Open: http://localhost:5174${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}Context sync: Drop .txt/.md files in ~/johns-command-center/context/${NC}"
echo -e "${YELLOW}Agents will auto-update from anything you put there${NC}"
echo ""
echo "Press Ctrl+C to stop everything"

open http://localhost:5174

# Keep running, kill both on exit
trap "echo 'Shutting down...'; kill $SERVER_PID $UI_PID 2>/dev/null; exit" INT TERM
wait $SERVER_PID
