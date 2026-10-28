#!/usr/bin/env bash
# build-and-ship-dashboard.sh - build the dashboard image on YOUR machine; send it to the server.
#
# The server can't build the dashboard (not enough free memory), so it is built here. Needs Docker with
# about 6 GB of memory available to it. Two ways to use it:
#
#   A) The machine that builds can also ssh to the server:
#        REPO=~/Partner2 bash build-and-ship-dashboard.sh
#      builds, sends the image, and switches the live dashboard (with checks and automatic rollback).
#
#   B) It can't (for example WSL when the VPN is only on Windows): build to a file, then send it from
#      a window that CAN reach the server (for example PowerShell):
#        OUT=/mnt/c/Riskscape bash /mnt/c/Riskscape/build-and-ship-dashboard.sh --save-only \
#          --source /mnt/c/Riskscape/dashboard-source.tar.gz
#        scp partner2-dashboard-new.tar.gz divesha@opmthredds.gem.spc.int:
#        ssh divesha@opmthredds.gem.spc.int "bash ~/deploy-new-image.sh ~/partner2-dashboard-new.tar.gz"
#
#   --source F   build from the source package F (dashboard-source.tar.gz, made on the server) instead of
#                your git checkout; no git, no patch, nothing else needed. This is the easiest way.
#   REPO         your checkout of Partner2, at integration/with-updates (cd28fb8) or newer, no local changes
#   PATCH        the patch file (default ./dashboard-frontend-changes.patch)
#   OUT          folder for the image file with --save-only (default: the current folder)
#   SERVER       ssh target (default divesha@opmthredds.gem.spc.int)
#   --save-only  build and write partner2-dashboard-new.tar.gz; no ssh at all (way B)
#   --no-deploy  way A, but only send the image; do not switch the live dashboard
#   --skip-tests build without running the unit tests first
#
# The switch (done by deploy-new-image.sh on the server) restarts the dashboard: about a minute down.

set -euo pipefail

SERVER="${SERVER:-divesha@opmthredds.gem.spc.int}"
REPO="${REPO:-.}"
PATCH="${PATCH:-$PWD/dashboard-frontend-changes.patch}"
OUT="${OUT:-$PWD}"
MIN_DOCKER_MB="${MIN_DOCKER_MB:-5500}"
IMAGE="partner2-partner2"
DEPLOY=1; TESTS=1; SAVE_ONLY=0; SOURCE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --save-only) SAVE_ONLY=1 ;;
    --no-deploy) DEPLOY=0 ;;
    --skip-tests) TESTS=0 ;;
    --source) [ $# -ge 2 ] || { echo "--source needs a file"; exit 2; }; SOURCE="$2"; shift ;;
    -h|--help) sed -n '2,33p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $1"; exit 2 ;;
  esac
  shift
done

for tool in git docker; do command -v "$tool" >/dev/null 2>&1 || { echo "$tool is not installed (or not available in this window)"; exit 2; }; done
docker info >/dev/null 2>&1 || { echo "Docker is not running or not reachable from this window."; exit 2; }

if [ "$SAVE_ONLY" = 0 ]; then
  command -v ssh >/dev/null 2>&1 || { echo "ssh is not installed"; exit 2; }
  host="${SERVER#*@}"
  echo "== Can this window reach $host on port 22?"
  if ! timeout 8 bash -c "exec 3<>/dev/tcp/$host/22" 2>/dev/null; then
    echo "No: the connection to $host:22 fails from here."
    echo "This is typical of WSL when the VPN runs only on Windows. Use way B instead: build here with"
    echo "--save-only, then send the file from PowerShell (see the top of this script)."
    echo "Nothing was built or changed."
    exit 2
  fi
fi

echo "== Docker memory"
DOCKER_MB="$(docker info --format '{{.MemTotal}}' | awk '{printf "%d", $1/1048576}')"
echo "Docker has ${DOCKER_MB} MB (the build needs about ${MIN_DOCKER_MB}+)"
if [ "$DOCKER_MB" -lt "$MIN_DOCKER_MB" ]; then
  echo "Too little. For Docker Desktop with WSL2, create/edit C:\\Users\\<you>\\.wslconfig:"
  echo "    [wsl2]"
  echo "    memory=8GB"
  echo "then run 'wsl --shutdown' in PowerShell, start Docker Desktop again, and re-run this."
  echo "Nothing was built or changed."
  exit 2
fi

if [ -n "$SOURCE" ]; then
  [ -f "$SOURCE" ] || { echo "Can't find the source package at $SOURCE"; exit 2; }
  echo "== Unpacking the source package"
  WORK="$(mktemp -d "${TMPDIR:-/tmp}/p2src.XXXXXX")"
  case "$WORK" in */p2src.*) ;; *) echo "unexpected work dir $WORK"; exit 1 ;; esac
  trap 'rm -rf "$WORK"' EXIT
  tar xzf "$SOURCE" -C "$WORK" 2>/dev/null || { echo "$SOURCE is not a valid .tar.gz (did the copy finish? re-run the scp)."; exit 1; }
  cd "$WORK"
  [ -f Dockerfile ] && [ -d src ] || { echo "That file doesn't look like the dashboard source package."; exit 1; }
  [ -f BUILD_INFO.txt ] && sed 's/^/   /' BUILD_INFO.txt
  TESTS=0
else
  [ -f "$PATCH" ] || { echo "Can't find the patch at $PATCH"; exit 2; }
  cd "$REPO"
  git rev-parse --git-dir >/dev/null 2>&1 || { echo "$REPO is not a git checkout of Partner2"; exit 2; }

  echo "== Checking the checkout"
  if ! git merge-base --is-ancestor cd28fb8 HEAD 2>/dev/null; then
    echo "This checkout doesn't contain commit cd28fb8 (integration/with-updates). Pull that branch first,"
    echo "or use --source with the source package, which needs no git checkout at all."; exit 2
  fi
  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    echo "You have uncommitted changes here. Stash or commit them first, so the build is exactly branch + patch."; exit 2
  fi

  echo "== Applying the patch"
  if git apply --check "$PATCH" 2>/dev/null; then
    git apply "$PATCH"
    echo "   applied"
  elif git apply --check -R "$PATCH" 2>/dev/null; then
    echo "   already applied; building the checkout as it is"
  else
    echo "   the patch does not apply to this checkout. Is it at integration/with-updates (cd28fb8) or newer?"; exit 1
  fi

  if [ "$TESTS" = 1 ] && command -v npm >/dev/null 2>&1; then
    echo "== Unit tests (skip with --skip-tests)"
    [ -d node_modules ] || npm ci --no-audit --no-fund
    npx jest src/components/__tests__/AnalysisModeSwitch.test.tsx src/components/__tests__/ForecastSetupPanel.test.tsx \
      src/components/__tests__/ModeFilterPanel.test.tsx src/utils/__tests__/forecastFilters.test.ts src/utils/__tests__/partnerEvents.test.ts
  fi
fi

echo "== Building the image for linux/amd64 (the server's architecture); this takes several minutes"
docker build --platform linux/amd64 --target runner -t "$IMAGE:new" \
  --build-arg NEXT_PUBLIC_ENABLE_PARTNER_API=true \
  --build-arg NEXT_PUBLIC_PARTNER_API_COUNTRIES=VU,WS,TO,CK \
  --build-arg NEXT_PUBLIC_PARTNER_API_STRICT_COUNTRIES=VU \
  --build-arg NEXT_PUBLIC_BASE_PATH=/partner2 .

if [ "$SAVE_ONLY" = 1 ]; then
  echo "== Saving the image to a file"
  mkdir -p "$OUT"
  docker save "$IMAGE:new" | gzip > "$OUT/partner2-dashboard-new.tar.gz"
  echo "Written: $OUT/partner2-dashboard-new.tar.gz ($(du -h "$OUT/partner2-dashboard-new.tar.gz" | cut -f1))"
  echo
  echo "Now, from a window that can reach the server (PowerShell), in the folder holding that file:"
  echo "    scp partner2-dashboard-new.tar.gz divesha@opmthredds.gem.spc.int:"
  echo "    ssh divesha@opmthredds.gem.spc.int \"bash ~/deploy-new-image.sh ~/partner2-dashboard-new.tar.gz\""
  exit 0
fi

echo "== Sending the image to $SERVER"
docker save "$IMAGE:new" | gzip | ssh "$SERVER" 'gunzip | docker load'
if [ "$DEPLOY" = 0 ]; then
  echo "Sent. It is on the server as $IMAGE:new and is NOT live. Switch with:  ssh $SERVER 'bash ~/deploy-new-image.sh'"
  exit 0
fi
echo "== Switching the live dashboard"
ssh "$SERVER" 'bash ~/deploy-new-image.sh'
