#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
if [ ! -d .venv ]; then python3 -m venv .venv; fi
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
rm -f .backend_port
python run_backend.py & BACKEND_PID=$!
trap 'kill $BACKEND_PID 2>/dev/null || true' EXIT
for i in {1..20}; do
  BP=$(cat .backend_port 2>/dev/null || echo 8001)
  if curl -fsS http://127.0.0.1:$BP/health >/dev/null 2>&1; then break; fi
  sleep 1
done
BP=$(cat .backend_port 2>/dev/null || echo 8001)
URL="http://127.0.0.1:$BP"
if command -v xdg-open >/dev/null; then xdg-open "$URL" >/dev/null 2>&1 || true
elif command -v open >/dev/null; then open "$URL" >/dev/null 2>&1 || true
fi
echo "IronTrack: $URL"
echo "API docs: $URL/docs"
echo "Non aprire frontend/index.html direttamente."
wait $BACKEND_PID
