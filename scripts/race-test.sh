#!/usr/bin/env bash
# Fires N booking requests for the SAME slot at the same moment and checks that exactly one wins.
# Needs: API running with DEV_AUTH_STUB=true, `pnpm prisma:seed` done, curl >= 7.66, node.
#   bash scripts/race-test.sh            5 patients
#   N=10 bash scripts/race-test.sh       up to 10 seeded patients
#   KEEP=1 bash scripts/race-test.sh     keep the winning appointment
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
N="${N:-5}"
KEEP="${KEEP:-0}"
RUN_ID="$RANDOM$RANDOM"
TMP=".race-tmp"

rm -rf "$TMP" && mkdir -p "$TMP"
trap 'rm -rf "$TMP"' EXIT

# 1. The doctor (Dr House from the seed)
DOCTOR_ID=$(curl -fsS "$BASE_URL/doctors?q=house" | node -e '
  let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
    const j = JSON.parse(s);
    const list = Array.isArray(j) ? j : (j.items ?? j.data ?? []);
    if (!list.length) process.exit(1);
    console.log(list[0].id);
  });') || { echo "Doctor not found. Is the API running and the DB seeded?"; exit 1; }

# 2. The first free slot between 3 and 10 days from now (a fresh one on every run)
FROM=$(node -e 'console.log(new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10))')
TO=$(node -e 'console.log(new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10))')
SLOT=$(curl -fsS "$BASE_URL/doctors/$DOCTOR_ID/slots?from=$FROM&to=$TO" | node -e '
  let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
    const j = JSON.parse(s);
    if (!j.slots.length) process.exit(1);
    console.log(j.slots[0].start);
  });') || { echo "No free slot. Did you set the doctor availability (seed does it)?"; exit 1; }

echo "Doctor : $DOCTOR_ID"
echo "Slot   : $SLOT"
echo "Racers : $N patients (race1..race$N@example.com)"
echo

# 3. One curl config with N requests, all sent in parallel on separate connections
CFG="$TMP/requests.cfg"
: > "$CFG"
for i in $(seq 1 "$N"); do
  if [ "$i" -gt 1 ]; then echo "next" >> "$CFG"; fi
  cat >> "$CFG" <<EOF
url = "$BASE_URL/appointments"
request = "POST"
header = "X-Debug-User: race$i@example.com"
header = "Idempotency-Key: race-$RUN_ID-$i"
header = "Content-Type: application/json"
data = "{\"doctorId\":\"$DOCTOR_ID\",\"start\":\"$SLOT\"}"
output = "$TMP/body$i.json"
write-out = "race$i %{http_code}\n"
EOF
done

curl -sS --parallel --parallel-immediate --parallel-max "$N" -K "$CFG" > "$TMP/results.txt"

# 4. Report
printf '%-8s %-7s %s\n' PATIENT STATUS MESSAGE
for i in $(seq 1 "$N"); do
  code=$(awk -v k="race$i" '$1 == k { print $2 }' "$TMP/results.txt")
  msg=$(node -e 'const b = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); console.log(b.message ?? "appointment " + b.id)' "$TMP/body$i.json")
  printf '%-8s %-7s %s\n' "race$i" "$code" "$msg"
done

WINNERS=$(awk '$2 == 201' "$TMP/results.txt" | wc -l | tr -d ' ')
CONFLICTS=$(awk '$2 == 409' "$TMP/results.txt" | wc -l | tr -d ' ')
STILL_OFFERED=$(curl -fsS "$BASE_URL/doctors/$DOCTOR_ID/slots?from=$FROM&to=$TO" | grep -c "$SLOT" || true)

echo
echo "201 (winners)  : $WINNERS"
echo "409 (conflicts): $CONFLICTS"
echo "Slot still offered afterwards: $([ "$STILL_OFFERED" = "0" ] && echo no || echo YES)"

if [ "$WINNERS" -eq 1 ] && [ "$CONFLICTS" -eq $((N - 1)) ] && [ "$STILL_OFFERED" = "0" ]; then
  echo "PASS: exactly one winner."
  if [ "$KEEP" != "1" ]; then
    W=$(awk '$2 == 201 { print substr($1, 5) }' "$TMP/results.txt")
    ID=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).id)' "$TMP/body$W.json")
    curl -fsS -o /dev/null -X POST "$BASE_URL/appointments/$ID/cancel" \
      -H "X-Debug-User: race$W@example.com" -H "Content-Type: application/json" -d '{}'
    echo "Cleaned up: the winner's appointment is cancelled, so the slot is free again."
  fi
else
  echo "FAIL: expected 1 winner and $((N - 1)) conflicts."
  exit 1
fi