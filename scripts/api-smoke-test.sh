#!/usr/bin/env bash
# End-to-end check of the JSON API used by the Apple app.
#   OWNER_PASSWORD=... scripts/api-smoke-test.sh http://localhost:3000 you@example.com path/to/new-photo.jpg
# Requires curl + python3. Uploads the given photo (use one that isn't in the library yet).
set -euo pipefail
B=${1:?base url}; EMAIL=${2:?email}; IMG=${3:?image path}; PASS=${OWNER_PASSWORD:?set OWNER_PASSWORD}
J='Content-Type: application/json'
py() { python3 -c "import json,sys; d=json.load(sys.stdin); $1"; }
check() { if [ "$2" = "$3" ]; then echo "PASS $1"; else echo "FAIL $1 (got $2, want $3)"; exit 1; fi; }

check "unauthenticated today is 401" "$(curl -s -o /dev/null -w '%{http_code}' "$B/api/today")" 401
check "form-encoded login refused" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/auth/login" -d 'email=a&password=b')" 415
BODY=$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":sys.argv[2]}))' "$EMAIL" "$PASS")
TOKEN=$(curl -s -X POST "$B/api/auth/login" -H "$J" -d "$BODY" | py 'print(d["token"])')
A="Authorization: Bearer $TOKEN"
check "today with token" "$(curl -s -o /dev/null -w '%{http_code}' "$B/api/today" -H "$A")" 200
ID=$(curl -s -X POST "$B/api/media/upload" -H "$A" -F "files=@$IMG" | py 'print(d["results"][0]["assetId"])')
echo "PASS upload → $ID"
for _ in $(seq 1 20); do
  STATUS=$(curl -s "$B/api/media/$ID" -H "$A" | py 'print(d["asset"]["status"])')
  [ "$STATUS" = analyzed ] || [ "$STATUS" = unusable ] && break; sleep 1
done
echo "PASS analysis finished: $STATUS"
PURL=$(curl -s "$B/api/media/$ID" -H "$A" | py 'print(d["previewUrl"])')
check "preview with token" "$(curl -s -o /dev/null -w '%{http_code}' "$B$PURL" -H "$A")" 200
check "preview without token" "$(curl -s -o /dev/null -w '%{http_code}' "$B$PURL")" 401
check "cookie mutation from foreign origin" "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$B/api/media/$ID" -H "Cookie: ip_session=$TOKEN" -H 'Origin: https://evil.example' -H "$J" -d '{"excluded":true}')" 403
curl -s -X POST "$B/api/auth/logout" -H "$A" >/dev/null
check "token revoked after logout" "$(curl -s -o /dev/null -w '%{http_code}' "$B/api/today" -H "$A")" 401
