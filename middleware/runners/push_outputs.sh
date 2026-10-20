#!/usr/bin/env bash
# Send finished RiskScape runs to the Partner API, one request per run folder.
#
#   export PARTNER_API_TOKEN=...            # a Partner API token; never write it in this file
#   ./push_outputs.sh --dry-run             # show what would be sent
#   ./push_outputs.sh                       # send every run folder in ./outputs
#   ./push_outputs.sh outputs/2026101906_Wati_20261019T060000Z   # or just one
#
# A run folder is named <track name>_<time>Z, e.g. 2026101906_Wati_20261019T060000Z. The track
# name is looked up on the Partner API: the run must have been made from a track that exists there,
# otherwise the server answers 404. Optional inputs, per run:
#   <run folder>/run_url.txt   the RiskScape run's address, stored as the run's external link
# Settings (environment): PARTNER_API_URL, COUNTRY (default CK), OUTPUTS_DIR (default outputs).

set -u

API="${PARTNER_API_URL:-https://opmthredds.gem.spc.int/partner_api/v1}"
COUNTRY="${COUNTRY:-CK}"
OUTPUTS_DIR="${OUTPUTS_DIR:-outputs}"
DRY_RUN=false
RUNS=()

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) RUNS+=("${arg%/}") ;;
  esac
done

if [ -z "${PARTNER_API_TOKEN:-}" ]; then
  echo "Set PARTNER_API_TOKEN first (export PARTNER_API_TOKEN=...). Do not put it in the script." >&2
  exit 1
fi
command -v python3 >/dev/null || { echo "python3 is not installed" >&2; exit 1; }

# zip if it is installed, otherwise Python's own zip
make_zip() {
  if command -v zip >/dev/null; then zip -qr "$1" "$2"; else python3 -m zipfile -c "$1" "$2"; fi
}

if [ ${#RUNS[@]} -eq 0 ]; then
  while IFS= read -r dir; do RUNS+=("$dir"); done < <(find "$OUTPUTS_DIR" -mindepth 1 -maxdepth 1 -type d | sort)
fi
[ ${#RUNS[@]} -gt 0 ] || { echo "No run folders found in $OUTPUTS_DIR" >&2; exit 1; }

# The track id on the Partner API for a track name: its id, "" if there is no such track, or
# "HTTP <code>" if the API could not be read (wrong token, server down).
track_id_for() {
  local out code
  out=$(mktemp)
  code=$(curl -s -o "$out" -w '%{http_code}' -H "Authorization: Token ${PARTNER_API_TOKEN}" \
    "${API}/cyclone_track/?page_size=500")
  if [ "$code" != "200" ]; then echo "HTTP $code"; rm -f "$out"; return; fi
  python3 -c '
import json, sys
name = sys.argv[2]
try:
    data = json.load(open(sys.argv[1]))
except ValueError:
    print("HTTP 200 but not JSON"); sys.exit(0)
rows = data if isinstance(data, list) else data.get("results", [])
ids = [str(r["id"]) for r in rows if r.get("cyclone_name") == name]
print(ids[-1] if ids else "")
' "$out" "$1"
  rm -f "$out"
}

sent=0; failed=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

for dir in "${RUNS[@]}"; do
  run=$(basename "$dir")
  name="${run%_*}"                       # drop the trailing _<time>Z
  if [ ! -d "$dir" ]; then echo "[$run] not a folder, skipping"; failed=$((failed + 1)); continue; fi

  track_id=$(track_id_for "$name")
  if [[ "$track_id" == HTTP* ]]; then
    echo "[$run] could not read the track list from $API ($track_id). Check the token and the address."
    failed=$((failed + 1)); continue
  fi
  if [ -z "$track_id" ]; then
    echo "[$run] no track named '$name' on $API. The run must be made from a track that exists there; skipping."
    failed=$((failed + 1)); continue
  fi
  track_url="${API}/cyclone_track/${track_id}/?format=json"

  run_url=""
  [ -f "$dir/run_url.txt" ] && run_url=$(tr -d '\r\n' < "$dir/run_url.txt")

  if $DRY_RUN; then
    echo "[$run] would send: country=$COUNTRY track_url=$track_url riskscape_run=${run_url:-<none>} outputs=$run.zip"
    continue
  fi

  make_zip "$tmp/$run.zip" "$dir" || { echo "[$run] could not zip"; failed=$((failed + 1)); continue; }
  args=(-F "country=${COUNTRY}" -F "track_url=${track_url}" -F "outputs=@${tmp}/${run}.zip")
  [ -n "$run_url" ] && args+=(-F "riskscape_run=${run_url}")

  # -s without -f, so the server's own error message is shown instead of being hidden
  resp=$(curl -s -w '\n%{http_code}' -H "Authorization: Token ${PARTNER_API_TOKEN}" "${args[@]}" "${API}/model_run/import/")
  code="${resp##*$'\n'}"
  body="${resp%$'\n'*}"
  if [[ "$code" == 2* ]]; then
    echo "[$run] sent (HTTP $code)"
    sent=$((sent + 1))
  else
    echo "[$run] FAILED: HTTP $code ${body:0:400}"
    failed=$((failed + 1))
  fi
done

$DRY_RUN || echo "Done: $sent sent, $failed failed."
[ "$failed" -eq 0 ]
