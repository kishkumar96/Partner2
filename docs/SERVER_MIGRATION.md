# Moving to a new server

Build the new host next to the old one and switch only once it passes the checks below.
Backend files: `middleware/docker-compose.prod.yml`, `middleware/.env.example`,
`middleware/runners/STAGING.md`. Dashboard files: `Dockerfile`, `docker-compose.prod.yml`.

The new code reads `Country.code`. Migrations must run before the web container serves
traffic, or every country request returns 500.

## 1. Before you start
- [ ] Lower the DNS TTL a day ahead.
- [ ] Note what runs on the old host: how the database is run, where `media/` lives, and
      whether a worker is running (only one worker may ever run).
- [ ] Decide the new host's TLS front (host nginx, Caddy or a load balancer). The stack
      listens on `NGINX_PORT` (default 8089), plain HTTP.

## 2. New host: secrets and code
- [ ] Install Docker and compose; open only 80/443 (and SSH from known addresses).
- [ ] Create **new** values for every secret. Do not copy old `.env` files or the old SQL
      dumps (they hold `auth_user` rows).
  - Backend `.env` (from `middleware/.env.example`): DB user/password/name,
    `DJANGO_SECRET_KEY`, `DJANGO_DEBUG=False`, `DJANGO_ALLOWED_HOSTS`,
    `DJANGO_CSRF_TRUSTED_ORIGINS`, `CORS_ALLOW_ALL_ORIGINS=False`, plus
    `RISKSCAPE_TOKEN` (service account, not a personal token).
  - Dashboard env: `PARTNER_API_BASE_URL`, `THREDDS_BASE_URL`,
    `NEXT_PUBLIC_ENABLE_PARTNER_API`, `NEXT_PUBLIC_BASE_PATH=/partner2`,
    `COUNTRY_AUTH_SECRET`, `COUNTRY_PASSWORD_<CC>`, `REDIS_URL`, `AUTH_REQUIRE_REDIS`,
    and `TENANT_COUNTRY` if one instance serves one country.
- [ ] Check out the repo at the release commit.

## 3. New host: bring up the backend (worker stopped)
```bash
cd middleware
docker compose -f docker-compose.prod.yml --env-file .env up -d --build db web nginx
```
Leave `runner` stopped until the data is restored.

## 4. Move the data
On the **old** host:
```bash
pg_dump -Fc -U <user> <database> > partner_api.dump
tar czf media.tgz media/        # uploaded tracks and risk files, not in git
```
Copy both to the new host over SSH, then:
```bash
docker compose -f docker-compose.prod.yml exec -T db pg_restore -U <user> -d <database> --clean --if-exists < partner_api.dump
docker compose -f docker-compose.prod.yml exec web python manage.py migrate
docker compose -f docker-compose.prod.yml exec web python manage.py showmigrations | grep '\[ \]'   # expect nothing
docker compose -f docker-compose.prod.yml exec web python manage.py shell -c \
  "from country.models import Country; print(list(Country.objects.values_list('short_name','code')))"
```
Every live country needs a code (CK, VU, TO, WS). Fix blanks in the admin. Unpack
`media.tgz` into the `media_volume`, and create fresh admin users instead of reusing old ones.

## 5. Rehearse (the old host still serves users)
- [ ] `curl https://<new-host>/…/partner_api/v1/country/` returns 200 with every country.
- [ ] Deploy the dashboard against the new backend and open each country page: the advisory
      picker lists the advisories, the map draws the track and swaths, the tables fill.
- [ ] Admin login works; Django admin shows the run queue and heartbeat model.

## 6. Cutover
1. Stop the worker on the old host (`docker compose stop runner`, or kill `run_model_queue`).
2. Put the old backend in maintenance or read-only.
3. Take a final `pg_dump`, restore it on the new host, and run `migrate` again.
4. Start the worker on the new host:
   `docker compose -f docker-compose.prod.yml up -d runner`, then
   `docker compose -f docker-compose.prod.yml exec web python manage.py check_runner_health`.
5. Switch DNS (or the proxy upstream) to the new host.
6. Watch logs and the runner heartbeat for an hour; confirm the dashboard still shows the
   latest advisory.

## 7. Afterwards
- [ ] Keep the old host and its dump for a few days, then retire it.
- [ ] Revoke the old database, Redis and RiskScape credentials.
- [ ] Remove the SQL dumps from the old repository's history.
- [ ] Back up the new database on a schedule and test a restore.

## Rollback
Stop the new worker, point DNS back at the old host, and restart the old worker. The
migrations only add columns and tables, so nothing needs undoing on the old database.
