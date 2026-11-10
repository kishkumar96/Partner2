# Deployment

## What runs where

| Piece | Where | How |
|---|---|---|
| Dashboard | SPC server `opmthredds` (`opmthredds.gem.spc.int`), container `partner2-dashboard` | `docker-compose.prod.yml` in `/data/Partner2`, image `partner2-partner2`, port 3112, base path `/partner2` |
| Its data | `pacific-disaster-api.spc.int` (shared API, Anuj) | `PARTNER_API_BASE_URL` in `.env.production` |
| Our middleware | same server, `middleware_web` / `middleware_db` (port 8800) | `middleware/docker-compose.prod.yml` |

What is live now (commit, build id, rollback tag) is recorded in [`WORKING.md`](../../WORKING.md) → *Deployed*. Update it after every deploy.

## Shipping a new dashboard build (the SPC server)

**The server cannot run `next build`.** It runs out of memory. So the image is built on a PC (WSL + Docker Desktop with about 6 GB of memory) from an archive of a commit, and loaded on the server. Always build from a commit, never from a hand-made tarball.

```bash
# 1. On the server: archive the commit to ship
cd ~/Partner2-merge
git archive --format=tar.gz -o ~/dashboard-source-<hash>.tar.gz <hash>
md5sum ~/dashboard-source-<hash>.tar.gz
```

```powershell
# 2. PowerShell on the PC: fetch the archive and the build script
cd C:\Riskscape
scp divesha@opmthredds.gem.spc.int:dashboard-source-<hash>.tar.gz .
scp divesha@opmthredds.gem.spc.int:build-and-ship-dashboard.sh .
```

```bash
# 3. WSL: build the image to a file (several minutes)
md5sum /mnt/c/Riskscape/dashboard-source-<hash>.tar.gz          # must match step 1
OUT=/mnt/c/Riskscape bash /mnt/c/Riskscape/build-and-ship-dashboard.sh --save-only \
  --source /mnt/c/Riskscape/dashboard-source-<hash>.tar.gz
# writes C:\Riskscape\partner2-dashboard-new.tar.gz
```

```powershell
# 4. PowerShell: send it, check it, switch
cd C:\Riskscape
scp partner2-dashboard-new.tar.gz divesha@opmthredds.gem.spc.int:
ssh divesha@opmthredds.gem.spc.int "CHECK_ONLY=1 bash ~/deploy-new-image.sh ~/partner2-dashboard-new.tar.gz"
ssh divesha@opmthredds.gem.spc.int "bash ~/deploy-new-image.sh"
```

`deploy-new-image.sh` (a copy is in `scripts/ops/`):

- With a file, it **loads** the image first. Without one, it uses `partner2-partner2:new`, which is already loaded.
- It **refuses an old image** before changing anything: every string in `REQUIRE` must be in the compiled build, or it exits with code 3. When a release adds a feature, add one of its strings, e.g. `REQUIRE='…|event-loss-admin1-area-map'`, so a stale image cannot be shipped by mistake.
- It tags the live image as `rollback-<stamp>`, restarts the dashboard (about a minute down), and checks health, HTTP 200 and that the served build id is the new one. If any check fails it **rolls back by itself**.
- `DRY_RUN=1` prints every step and changes nothing. `CHECK_ONLY=1` only tests the image.

```bash
# 5. On the server: record what is live
docker exec partner2-dashboard cat .next/BUILD_ID      # → WORKING.md with the commit
```

**Common mistakes:**

- **`scp: stat local "partner2-dashboard-new.tar.gz": No such file`.** You are not in `C:\Riskscape`, or step 3 was not run.
- **Running the switch before sending the new file.** The server keeps the previous `partner2-dashboard-new.tar.gz`, so the script loads the **old** build. Use a `REQUIRE` string from the new release so the check catches it.
- **Changing a `NEXT_PUBLIC_*` value and only restarting.** Those are baked into the image, so rebuild.

### Roll back by hand

The script prints the exact command. In general:

```bash
docker tag partner2-partner2:rollback-<stamp> partner2-partner2:latest
cd /data/Partner2 && docker compose -f docker-compose.prod.yml up -d --no-build
```

## Other targets

[`DEPLOYMENT.md`](../../DEPLOYMENT.md) covers Vercel, AWS, plain Docker, PM2 and NGINX. `k8s/`, `terraform/`, `Jenkinsfile` and `vercel.json` are there for those. They are not what SPC uses today.

## The middleware

Follow [`middleware/runners/STAGING.md`](../../middleware/runners/STAGING.md):

1. Back up the database.
2. Migrate.
3. Verify the country codes.
4. Deploy the web containers.
5. Set the runner env.
6. Run `setup_tc_pipelines`.
7. Start **one** runner and run `check_runner_health`.
8. Smoke-test one advisory.

To roll back, stop the runner first, then redeploy the previous web image. The migrations only add columns and tables, so they can stay applied.

## After a deploy

- Open `https://opmthredds.gem.spc.int/partner2/<country>` for each country and check that the pages load, the advisory list looks right, and the Network tab shows no request larger than a few MB.
- `GET /partner2/api/health` and `/partner2/api/config`: check the release hash is the one you meant to ship.
- Update `WORKING.md`.
