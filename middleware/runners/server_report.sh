#!/usr/bin/env bash
# Read-only report of the Partner API server's state. Changes nothing and prints no secrets
# (it says only whether a setting exists, never its value). Run it on the server and paste the output.
#
#   bash server_report.sh
# Settings (environment), defaults suit opmthredds:
#   REPO_DIR=/data/Partner2   BACKEND_DIR=/home/divesha/middleware_partner_api
#   WEB=middleware_web        DB=middleware_db        PORT=8800

REPO_DIR="${REPO_DIR:-/data/Partner2}"
BACKEND_DIR="${BACKEND_DIR:-/home/divesha/middleware_partner_api}"
WEB="${WEB:-middleware_web}"
DB="${DB:-middleware_db}"
PORT="${PORT:-8800}"
API="http://localhost:${PORT}/partner_api/v1"

section() { printf '\n=== %s\n' "$1"; }

section "When and where"
date -u +"%Y-%m-%d %H:%M UTC"; hostname

section "Dashboard repo ($REPO_DIR)"
git -C "$REPO_DIR" log --oneline -1 2>&1 | cut -c1-110
git -C "$REPO_DIR" status -sb 2>&1 | head -3

section "Containers (names, status, ports)"
docker ps -a --format '{{.Names}}  {{.Status}}  {{.Ports}}' 2>&1 | grep -iE 'middleware|partner2' | cut -c1-140

section "Disk space"
df -h "$BACKEND_DIR" "$REPO_DIR" 2>&1 | cut -c1-100

section "Backend folder: data and run folders"
for d in data data/ck_risk_analysis data/hazard_catalog.zarr ref_runs event/management/commands/data; do
  if [ -e "$BACKEND_DIR/$d" ]; then printf '%-40s %s\n' "$d" "$(du -sh "$BACKEND_DIR/$d" 2>/dev/null | cut -f1)"; else printf '%-40s missing\n' "$d"; fi
done

section "Where the model_run/import endpoint is defined"
grep -rn "riskscape_run\|model_run/import" "$BACKEND_DIR" --include=*.py 2>/dev/null | grep -v '/venv/\|/site-packages/' | cut -c1-160 | head -10
echo "(nothing listed above means it is not in any .py file in the backend folder)"

section "API (no login)"
for p in country/ model_run/import/ model_run/doesnotexist/; do
  printf '%-26s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$API/$p")"
done
echo "(import/ answering 403 while doesnotexist/ answers 404 means the import route exists)"

section "Settings present in $BACKEND_DIR/.env (names only)"
for k in RISKSCAPE_TOKEN PARTNER_API_URL DJANGO_SECRET_KEY DJANGO_ALLOWED_HOSTS; do
  if grep -q "^${k}=." "$BACKEND_DIR/.env" 2>/dev/null; then echo "$k: set"; else echo "$k: NOT set"; fi
done

section "Database counts"
docker exec "$WEB" python manage.py shell -c "
from country.models import Country
from event.models import Event
from hazard_information.models import HazardInformation as H
from risk_information.models import RiskInformation as R, RiskScenario as S
from model.models import ModelRun
for c in Country.objects.order_by('id'):
    print(f'{c.id} {c.short_name:4} code={str(c.code):5} risk={R.objects.filter(country=c).count():4} hazard={H.objects.filter(country=c).count():5}')
print('events:', Event.objects.count(), ' scenarios:', S.objects.count(), ' model runs:', ModelRun.objects.count())
print('latest events:', [(e.id, e.country.code, e.cyclone_track.cyclone_name if e.cyclone_track_id else e.title) for e in Event.objects.order_by('-id')[:6]])
" 2>&1 | grep -v 'objects imported' | head -20

section "Runs by status"
docker exec "$WEB" python manage.py shell -c "
from collections import Counter
from model.models import ModelRun
print(dict(Counter(ModelRun.objects.values_list('status', flat=True))))" 2>&1 | grep -v 'objects imported'

echo; echo "Done. Nothing was changed."
