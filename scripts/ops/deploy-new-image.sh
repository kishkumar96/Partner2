#!/usr/bin/env bash
# deploy-new-image.sh [image.tar.gz] - switch the live dashboard to an image that was built elsewhere.
#
# Run on the server. With a file, it loads the image first (the file is what `docker save | gzip` made on
# your laptop). Without one, it uses the image `partner2-partner2:new` that is already loaded.
#
#   bash ~/deploy-new-image.sh ~/partner2-dashboard-new.tar.gz
#   DRY_RUN=1 bash ~/deploy-new-image.sh      show every change it would make, change nothing
#   CHECK_ONLY=1 bash ~/deploy-new-image.sh   only test that the new image really is the new build; switch nothing
#
# It tags the image that is live now as a rollback, switches to the new one, and checks that the
# dashboard is healthy, answers HTTP 200 AND serves the new build (its Forecast setup panel). If any check fails it
# switches back by itself. The switch restarts the dashboard: about a minute down.

set -u
IMAGE="${IMAGE:-partner2-partner2}"
REPO="${REPO:-/data/Partner2}"
DRY="${DRY_RUN:-0}"
# Text that must be in the compiled new image: ALL of it, or the switch is refused before anything changes.
# Each string is from a recent feature and is absent from the 22 Oct build (flood depths from Wasabi, the
# storm filters, the Context header). Override with REQUIRE="a|b" when a later release should be checked for others.
REQUIRE="${REQUIRE:-.zmetadata|hazard-depth-chip|scenario_losses/v1|Search storms|Only advisories with results|Hide context}"
CHECK_ONLY="${CHECK_ONLY:-0}"
STAMP="$(date +%Y%m%d%H%M)"

say() { echo "$*"; }
act() { if [ "$DRY" = 1 ]; then echo "WOULD: $*"; else "$@"; fi; }

TARBALL="${1:-}"
if [ -n "$TARBALL" ]; then
  [ -f "$TARBALL" ] || { say "No such file: $TARBALL"; exit 2; }
  say "== Loading $TARBALL"
  if [ "$DRY" = 1 ]; then say "WOULD: gunzip -c $TARBALL | docker load"; else gunzip -c "$TARBALL" | docker load || { say "docker load failed"; exit 1; }; fi
fi
if [ "$DRY" != 1 ]; then
  docker image inspect "$IMAGE:new" >/dev/null 2>&1 || { say "There is no $IMAGE:new image here. Build and send one first."; exit 1; }
fi
docker image inspect "$IMAGE:latest" >/dev/null 2>&1 || { say "No live image $IMAGE:latest to keep as a rollback; refusing."; exit 1; }

# Is the image really the new build? Look for every required string in its compiled files (read-only).
new_id=""
if docker image inspect "$IMAGE:new" >/dev/null 2>&1; then
  say "== Checking that $IMAGE:new is the new build"
  missing=0
  while IFS= read -r m; do
    [ -n "$m" ] || continue
    n="$(docker run --rm --entrypoint sh "$IMAGE:new" -c 'grep -rlF -- "$1" .next/static | wc -l' _ "$m" 2>/dev/null || echo 0)"
    if [ "${n:-0}" -gt 0 ]; then say "  found    $m"; else say "  MISSING  $m"; missing=1; fi
  done <<EOF
$(echo "$REQUIRE" | tr '|' '\n')
EOF
  new_id="$(docker run --rm --entrypoint cat "$IMAGE:new" .next/BUILD_ID 2>/dev/null || true)"
  say "  build id: ${new_id:-unknown}   (live now: $(docker exec partner2-dashboard cat .next/BUILD_ID 2>/dev/null || echo unknown))"
  if [ "$missing" = 1 ]; then
    say "REFUSING: $IMAGE:new is missing text the new build must contain, so it is an old or incomplete image. Nothing was changed."
    exit 3
  fi
  say "  OK: every required string is in the image."
  [ "$CHECK_ONLY" = 1 ] && { say "CHECK_ONLY: nothing switched."; exit 0; }
elif [ "$CHECK_ONLY" = 1 ]; then
  say "There is no $IMAGE:new image here."; exit 1
fi

say "== Switching the live dashboard (rollback tag first)"
act docker tag "$IMAGE:latest" "$IMAGE:rollback-$STAMP"
act docker tag "$IMAGE:new" "$IMAGE:latest"
( cd "$REPO" && act docker compose -f docker-compose.prod.yml up -d --no-build )

state=none
for i in $(seq 1 45); do
  state="$(docker inspect -f '{{.State.Health.Status}}' partner2-dashboard 2>/dev/null || echo none)"
  [ "$state" = healthy ] && break
  [ "$DRY" = 1 ] && break
  sleep 2
done
code="$(curl -s -m 10 -o /dev/null -w '%{http_code}' http://127.0.0.1:3112/partner2/cook-islands || true)"

# Is the NEW build what is being served? The served page carries its build id.
served=no
page="$(curl -s -m 20 http://127.0.0.1:3112/partner2/cook-islands || true)"
if [ -n "$new_id" ]; then
  echo "$page" | grep -qF -- "$new_id" && served=yes
elif [ "$DRY" = 1 ]; then
  served=yes
fi

if [ "$state" = healthy ] && [ "$code" = 200 ] && [ "$served" = yes ]; then
  say "LIVE: healthy, HTTP 200, and serving the new build ($new_id)."
  say "Rollback if ever needed:  docker tag $IMAGE:rollback-$STAMP $IMAGE:latest && cd $REPO && docker compose -f docker-compose.prod.yml up -d --no-build"
  exit 0
fi
say "The new dashboard failed its checks (health: $state, HTTP $code, new text served: $served). Rolling back."
act docker tag "$IMAGE:rollback-$STAMP" "$IMAGE:latest"
( cd "$REPO" && act docker compose -f docker-compose.prod.yml up -d --no-build )
say "Rolled back to $IMAGE:rollback-$STAMP."
exit 1
