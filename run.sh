#!/usr/bin/env bash
# Johns Command Center — one-command launcher.
# Installs deps if missing, starts server + UI, opens the browser on macOS.
# Stops both with Ctrl+C.
#
# Usage:  ./run.sh
# Set ANTHROPIC_API_KEY for live agent replies, otherwise the UI works
# but agents stay quiet.

set -e
cd "$(dirname "$0")"

GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'

echo -e "${CYAN}== Johns Command Center ==${NC}"

if [ ! -d "server/node_modules" ]; then
  echo -e "${YELLOW}Installing server deps...${NC}"
  (cd server && npm install)
fi
if [ ! -d "pixel-ui/node_modules" ]; then
  echo -e "${YELLOW}Installing UI deps...${NC}"
  (cd pixel-ui && npm install)
fi

if [ -z "$ANTHROPIC_API_KEY" ] && [ ! -f "server/.env" ]; then
  echo -e "${YELLOW}!  No ANTHROPIC_API_KEY set and no server/.env.${NC}"
  echo -e "${YELLOW}   Agents will be silent. Drop ANTHROPIC_API_KEY=sk-ant-... in server/.env to enable Sonnet.${NC}"
fi

# Free ports if anything is squatting
if command -v lsof >/dev/null; then
  lsof -ti:3000 -ti:5174 2>/dev/null | xargs -r kill -9 2>/dev/null || true
fi

(cd server && npm run dev) &
SERVER_PID=$!
(cd pixel-ui && npm run dev) &
UI_PID=$!

cleanup() { echo; echo "Shutting down..."; kill $SERVER_PID $UI_PID 2>/dev/null || true; exit 0; }
trap cleanup INT TERM

# Wait for UI then open browser (macOS only)
URL="http://localhost:5174/office.html"
for i in {1..30}; do
  if curl -fsS -o /dev/null "$URL" 2>/dev/null; then break; fi
  sleep 1
done

echo -e "${GREEN}✓ Open: $URL${NC}"
if [[ "$OSTYPE" == "darwin"* ]] && command -v open >/dev/null; then
  open "$URL"
fi

wait $SERVER_PID
