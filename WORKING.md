# WORKING.md

The one place that says what is current. Agents and people: read this first, update it when you start and when you finish.

## Branch
- **Working branch:** `integration/ready-to-build` (worktree `~/Partner2-merge` on the shared server). All new work lands here.
- **`main`:** protected target for PRs once the team opens one; CI must pass (`CI passed`).
- **Don't:** edit `/data/Partner2` (the user's own working tree, with uncommitted changes), or share a checkout with another session.

## Deployed
- **Live dashboard** (https://opmthredds.gem.spc.int/partner2): deployed **30 Oct 16:53** from `5c11468` on `integration/ready-to-build` (archive md5 `636ff8f452d7a721510d0dee624fbeb5`), build id `qI_OVGzDBykMsRkvJMmZA`. Still reads our own API (`PARTNER_API_BASE_URL` unchanged). Rollback tag: `partner2-partner2:rollback-202610301653` (the 22 Oct build).
- **How to deploy** (the server cannot run `next build`): see "Deploying a prebuilt image" in `DEPLOYMENT.md`. The switch script `~/deploy-new-image.sh` (copy in `scripts/ops/`) refuses an old image before changing anything, and checks the served build id after.
- **After a deploy:** write the commit and the new build id here.
- **Data source:** the live proxy points at our API (`opmthredds.gem.spc.int`). Not switched to the shared API: see `docs/SHARED_API.md` (risk data is 112 MB per page there).

## The shared API's conventions (read before testing it)
- Its filters are **routes**, not query parameters: the only one so far is `GET /event/country/{country_id}/` (found in `/partner_api/schema/`; `event/?country=` also works). Re-read the schema after he changes anything: `curl -s https://pacific-disaster-api.spc.int/partner_api/schema/`.
- `risk_information` (2026-10-28) accepts only `page` and `page_size`: tried `country`, `model_run`, `event`, `search`, `title`, `ordering`, `fields`, `id__in` and 20 more, none changes the result. A row's detail, `risk_information/{id}/`, is public and small enough; `model_run` and `model` need a token.
- What to ask him for, in order, and how to test his API yourself: `docs/SHARED_API.md`. Short form: embed each run (with its `risks` ids) in the event, or make `GET model_run` public; a run filter on risk data in his route style; link the 44 runless rows; a list without geometry.

## In progress
| Who | What | Branch/worktree | Since |
|---|---|---|---|
| (nobody) | | | |

## Open items
- Anuj (shared API): filters on `risk_information` (`event`, `model_run`, `country`), a light list view without geometry, link the 44 unattached risk rows to events, public read of `model_run`, a home for `risk_scenario`, correct `country` on cyclone tracks, remove track 220 and give rows 49 (Wati run 4, real data, do not delete) and 23 a country, rotate the API password.
- On GitHub: protect `main` and require the `CI passed` check.
- Scenario losses are on Wasabi (`spc-zarr-file/scenario_losses/v1`, Cook Islands only); rerun `publish_scenario_losses --replace` after importing new scenarios.
- Branches and worktrees (cleaned up on 2026-10-28; the old merged ones and the five that held unmerged commits are gone, and the two real changes among them were cherry-picked here):
  - `fix/forecast-sync-and-labels` (`~/Partner2-summary`) is merged, but its worktree still has 20 staged files, which are now committed on the working branch; remove it once the user confirms.
  - `feat/frontend-partner-api-model-runs` is checked out in the user's own `/data/Partner2`; leave it.
  - Leftover folders that are no longer worktrees but hold root-owned test files under `middleware/media`, so the user must run `sudo rm -rf` on them: `~/Partner2-ingest`, `~/Partner2-adminlinks`, `~/Partner2-runnames`, `~/Partner2-runnerfix`.
