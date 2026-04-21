#!/bin/bash

# Kill any existing server on port 7432
lsof -ti:7432 | xargs kill -9 2>/dev/null

echo ""
echo "🚀 Starting Portfolio Intelligence Server..."
node server.js &
NODE_PID=$!
sleep 1

echo "🌐 Starting Cloudflare Tunnel (waiting for URL)..."
echo ""

LOGFILE=$(mktemp /tmp/cloudflared.XXXXXX)
TUNNEL_URL=""

# Start cloudflared, pipe to log and stdout simultaneously
npx cloudflared tunnel --url http://localhost:7432 > >(tee "$LOGFILE") 2>&1 &
CF_PID=$!

# Wait until URL appears in log (max 30s)
for i in $(seq 1 30); do
  sleep 1
  TUNNEL_URL=$(grep -o 'https://[a-zA-Z0-9.-]*\.trycloudflare\.com' "$LOGFILE" | head -1)
  if [[ -n "$TUNNEL_URL" ]]; then
    break
  fi
done

if [[ -z "$TUNNEL_URL" ]]; then
  echo "⚠️  Could not detect Cloudflare URL. Check output above."
else
  # Print URL banner — repeats every 10s so it's always visible
  while kill -0 $CF_PID 2>/dev/null; do
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  🔗 PUBLIC URL → $TUNNEL_URL"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    sleep 30
  done
fi

# Cleanup on exit
wait $CF_PID
kill $NODE_PID 2>/dev/null
rm -f "$LOGFILE"
