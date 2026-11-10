#!/usr/bin/env bash
# Test the model_run/import/ endpoint on this server with a real run:
#   remove the latest advisory that was imported, then bring it back through the API.
#
#   ADVISORY=2026101900_Wati ./test_import_api.sh <share-token-of-that-run> --yes
#
# Nothing is deleted until the run's outputs are downloaded, the zip is built and the API has
# answered a harmless "already imported" check, so a problem with RiskScape, the token or the
# endpoint shows up while the data is still intact. After the delete, a failed upload is put right
# by importing the run again with `ingest_riskscape_run` (the share-link route).
#
# Needs: docker access to the backend containers, ~/tc-runner.token (the tc-runner account's token),
# python3, curl, zip support from python's zipfile.

set -euo pipefail

SHARE_TOKEN="${1:-${SHARE_TOKEN:-}}"
CONFIRM="${2:-}"
ADVISORY="${ADVISORY:-}"
COUNTRY="${COUNTRY:-CK}"
API_URL="${API_URL:-https://opmthredds.gem.spc.int/partner_api/v1}"
SITE_URL="${SITE_URL:-https://opmthredds.gem.spc.int/partner2}"
TOKEN_FILE="${TOKEN_FILE:-$HOME/tc-runner.token}"
RISKSCAPE_URL="${RISKSCAPE_URL:-https://riskscape.nz}"
WEB="${WEB:-middleware_web}"
DB="${DB:-middleware_db}"

die() { echo "ERROR: $*" >&2; exit 1; }
step() { echo; echo "== $*"; }

[ -n "$SHARE_TOKEN" ] || die "give the run's RiskScape share token (the part after /shared/results/)"
[ -n "$ADVISORY" ] || die "set ADVISORY to the advisory name to remove and re-upload, e.g. 2026101900_Wati"
[ -r "$TOKEN_FILE" ] || die "can't read $TOKEN_FILE"
SHARE_TOKEN="${SHARE_TOKEN##*/shared/results/}"   # accept a whole link too
for c in "$WEB" "$DB"; do docker inspect -f '{{.State.Running}}' "$c" 2>/dev/null | grep -q true || die "container $c is not running"; done

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
chmod 700 "$WORK"
printf 'header = "Authorization: Token %s"\n' "$(tr -d '[:space:]' < "$TOKEN_FILE")" > "$WORK/auth.curl"
chmod 600 "$WORK/auth.curl"

manage_shell() { docker exec -i -e ADVISORY="$ADVISORY" -e COUNTRY="$COUNTRY" "$WEB" python manage.py shell 2>&1 | grep -v "objects imported" || true; }

restore_via_link() {
  echo "Restoring the advisory from its share link (the other import route)..." >&2
  docker exec "$WEB" python manage.py ingest_riskscape_run "$RISKSCAPE_URL/shared/results/$SHARE_TOKEN" --country "$COUNTRY" >&2 || \
    echo "RESTORE FAILED. Restore the dump instead: $DUMP" >&2
}

# ---------------------------------------------------------------------------------------------
step "1. What is the latest imported advisory?"
LATEST="$(manage_shell <<'PY'
import os
from model.models import ModelRun
from model.management.commands.import_ref_run import Command as Imp
runs = ModelRun.objects.filter(models__name=Imp.IMPORT_MODEL_NAME, tc_track__country__code=os.environ["COUNTRY"])
latest = runs.order_by("-tc_track__issued_time", "-id").first()
print("LATEST", latest.pk if latest else "none", latest.tc_track.cyclone_name if latest else "-", latest.tc_track_id if latest else "-")
print("RUNS", ",".join(str(r.pk) for r in runs.order_by("id")))
PY
)"
echo "$LATEST" | grep -E "^(LATEST|RUNS)"
read -r _ RUN_ID TRACK_NAME TRACK_ID < <(echo "$LATEST" | grep '^LATEST')
[ "$RUN_ID" != "none" ] || die "no imported advisories found for $COUNTRY"
[ "$TRACK_NAME" = "$ADVISORY" ] || die "the latest imported advisory is $TRACK_NAME, not $ADVISORY; refusing to delete anything"

# ---------------------------------------------------------------------------------------------
step "2. Fetch the run from RiskScape (nothing is deleted yet)"
HEADERS="$(curl -s -m 60 -i -X POST -H 'Content-Type: text/plain' --data "$SHARE_TOKEN" "$RISKSCAPE_URL/api/model-runs/guest-link/auth" | tr -d '\r')"
COOKIE="$(echo "$HEADERS" | grep -i '^set-cookie: rs-session=' | sed -E 's/^set-cookie: (rs-session=[^;]*).*/\1/I')"
[ -n "$COOKIE" ] || die "RiskScape did not accept the share token"
echo "$HEADERS" | sed -n '/^{/,$p' > "$WORK/run.json"
python3 - "$WORK/run.json" "$WORK/outputs.txt" "$WORK/track_url.txt" <<'PY'
import json, sys
run = json.load(open(sys.argv[1]))
if run.get("state") != "COMPLETE":
    sys.exit(f"the run is {run.get('state')}, not COMPLETE")
ext = {"text/csv": "csv", "application/geo+json": "geojson", "application/geopackage+sqlite3": "gpkg"}
with open(sys.argv[2], "w") as out:
    for o in run["outputs"]:
        if o.get("state") == "COMPLETE" and o["mediaType"] in ext:
            out.write(f"{o['uri']} {o['name']}.{ext[o['mediaType']]}\n")
track = next(p["value"] for p in run["parameters"].values() if "/cyclone_track/" in str(p.get("value")))
open(sys.argv[3], "w").write(track)
print(f"run {run['id']} '{run['name']}' complete, {len(run['outputs'])} outputs")
PY
TRACK_URL="$(cat "$WORK/track_url.txt")"
echo "track: $TRACK_URL"
mkdir -p "$WORK/out/$ADVISORY"
while read -r uri name; do
  curl -sf -m 300 -H "Cookie: $COOKIE" -o "$WORK/out/$ADVISORY/$name" "$RISKSCAPE_URL$uri/download" || die "couldn't download $name"
done < "$WORK/outputs.txt"
python3 - "$WORK" "$ADVISORY" <<'PY'
import os, sys, zipfile
work, adv = sys.argv[1:3]
folder = os.path.join(work, "out", adv)
with zipfile.ZipFile(os.path.join(work, "run.zip"), "w", zipfile.ZIP_DEFLATED) as z:
    for name in sorted(os.listdir(folder)):
        z.write(os.path.join(folder, name), f"outputs/{adv}_run/{name}")
print("zip:", os.path.getsize(os.path.join(work, "run.zip")), "bytes,", len(os.listdir(folder)), "files")
PY

api_post() {   # api_post <label> [extra curl args]; prints HTTP status, leaves the body in $WORK/resp.json
  local label="$1"; shift
  local code
  code="$(curl -s -m 180 -K "$WORK/auth.curl" -o "$WORK/resp.json" -w '%{http_code}' -X POST "$API_URL/model_run/import/" \
    -F country="$COUNTRY" -F track_url="$TRACK_URL" -F outputs=@"$WORK/run.zip" "$@")"
  echo "$label -> HTTP $code $(head -c 300 "$WORK/resp.json")" >&2
  echo "$code"
}

# ---------------------------------------------------------------------------------------------
step "3. Pre-flight: the API must recognise the advisory as already imported (changes nothing)"
[ "$(api_post "pre-flight")" = "200" ] && grep -q '"already_imported":true' "$WORK/resp.json" \
  || die "the API did not answer 'already imported'; fix that before deleting anything"

if [ "$CONFIRM" != "--yes" ]; then
  echo
  echo "Everything checks out. Run $RUN_ID ($ADVISORY, track $TRACK_ID) would now be deleted and sent again through the API."
  echo "Run again with --yes to do it."
  exit 0
fi

# ---------------------------------------------------------------------------------------------
step "4. Back up the database"
DUMP="$HOME/partner_api_before_api_test_$(date +%F_%H%M).dump"
docker exec "$DB" sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$DUMP"
echo "dump: $DUMP ($(du -h "$DUMP" | cut -f1))"

# ---------------------------------------------------------------------------------------------
step "5. Delete the advisory (run $RUN_ID and its track) and put the Event back on the previous one"
DELETED="$(manage_shell <<'PY'
import os
from django.db import transaction
from model.models import ModelRun
from model.queueing import publish_run_to_event
from model.management.commands.import_ref_run import Command as Imp
from event.models import Event
runs = ModelRun.objects.filter(models__name=Imp.IMPORT_MODEL_NAME, tc_track__country__code=os.environ["COUNTRY"])
latest = runs.order_by("-tc_track__issued_time", "-id").first()
assert latest.tc_track.cyclone_name == os.environ["ADVISORY"], "latest advisory changed"
track, run_id, country_id = latest.tc_track, latest.pk, latest.tc_track.country_id
track_id = track.pk
with transaction.atomic():
    event = Event.objects.filter(model_run=latest).first()
    Imp().remove_run(latest)
    previous = runs.exclude(pk=run_id).order_by("-tc_track__issued_time", "-id").first()
    if previous:
        publish_run_to_event(previous, country_id=country_id)
    if not track.events.exists() and not ModelRun.objects.filter(tc_track=track).exists():
        track.track_file.delete(save=False)
        track.delete()
event = Event.objects.get(pk=event.pk) if event else None
print("DELETED run", run_id, "track", track_id, "| event", event.pk if event else "-", "now shows run", event.model_run_id if event else "-")
PY
)"
echo "$DELETED" | grep -E "^DELETED" || { echo "$DELETED"; die "the delete step failed; restore the dump if anything looks wrong: $DUMP"; }

# ---------------------------------------------------------------------------------------------
step "6. Upload it through the API"
CODE="$(api_post "upload")"
if [ "$CODE" != "201" ]; then
  restore_via_link
  die "the API answered HTTP $CODE instead of 201 (advisory restored through the link route; dump: $DUMP)"
fi
python3 - "$WORK/resp.json" <<'PY'
import json, sys
r = json.load(open(sys.argv[1]))
print({k: r[k] for k in ("advisory", "event", "run", "track", "outputs", "shown")})
assert r["outputs"] == 9, f"expected 9 outputs, got {r['outputs']}"
assert r["shown"] is True, "the new run is not the one the Event shows"
PY

# ---------------------------------------------------------------------------------------------
step "7. Check the result, and that sending it again is harmless"
CHECKS="$(manage_shell <<'PY'
import os
from model.models import ModelRun
from event.models import Event
from risk_information.models import RiskInformation
from cyclone_track.models import CycloneTrack
adv = os.environ["ADVISORY"]
track = CycloneTrack.objects.get(cyclone_name=adv)
run = ModelRun.objects.get(tc_track=track)
event = Event.objects.get(model_run=run)
print("CHECK", f"track {track.pk} points={len(track.geometry['features'])} computed={track.geometry_computed} notify={track.notify}")
print("CHECK", f"run {run.pk} status={run.status} outputs={run.risk_information.count()} external_url={run.external_url!r}")
print("CHECK", f"event {event.pk} '{event.title}' shows run {event.model_run_id}; event risks={event.risks.count()}")
print("CHECK", "geometry_computed on every output:", all(r.geometry_computed for r in run.risk_information.all()))
PY
)"
echo "$CHECKS" | grep '^CHECK'
[ "$(echo "$CHECKS" | grep -c '^CHECK')" = 4 ] || { echo "$CHECKS"; die "the result check did not run cleanly; dump: $DUMP"; }
echo "$CHECKS" | grep -q "outputs=9" || die "the run does not have 9 outputs; dump: $DUMP"
echo "$CHECKS" | grep -q "every output: True" || die "an output has no computed geometry; dump: $DUMP"
AGAIN="$(api_post "repeat")"
[ "$AGAIN" = "200" ] && grep -q '"already_imported":true' "$WORK/resp.json" || die "sending the run again was not a no-op (HTTP $AGAIN)"
SITE="$(curl -s -m 30 -o /dev/null -w '%{http_code}' "$SITE_URL/cook-islands")"
echo "dashboard page: HTTP $SITE"

echo
echo "PASS: $ADVISORY was removed and imported again through $API_URL/model_run/import/ (dump kept at $DUMP)"
