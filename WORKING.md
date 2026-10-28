# WORKING.md

The one place that says what is current. Agents and people: read this first, update it when you start and when you finish.

## Branch
- **Working branch:** `integration/ready-to-build` (worktree `~/Partner2-merge` on the shared server). All new work lands here.
- **`main`:** protected target for PRs once the team opens one; CI must pass (`CI passed`).
- **Don't:** edit `/data/Partner2` (the user's own working tree, with uncommitted changes), or share a checkout with another session.

## Deployed
- **Live dashboard** (https://opmthredds.gem.spc.int/partner2): image built on 22 Oct from a hand-made tarball; commit not recorded. It does not contain the Zarr flood depths, the scenario fallback, the model-runs adapter or the Context header.
- **Next build:** `git archive` of the working branch head; build on WSL, ship, switch with `~/deploy-new-image.sh`. Record the commit here after the switch.
- **Data source:** the live proxy points at our API (`opmthredds.gem.spc.int`). Not yet switched to the shared API (`pacific-disaster-api.spc.int`): `event/?country=` works (checked 2026-10-28), but `risk_information` still ignores `?country=`, `?event=` and `?model_run=` and sends the whole 112 MB table; `cyclone_track` and `hazard_information` ignore `?country=` too.

## The shared API's conventions (read before testing it)
- Its filters are **routes**, not query parameters: the only one so far is `GET /event/country/{country_id}/` (found in `/partner_api/schema/`; `event/?country=` also works). Re-read the schema after he changes anything: `curl -s https://pacific-disaster-api.spc.int/partner_api/schema/`.
- `risk_information` (2026-10-28) accepts only `page` and `page_size`: tried `country`, `model_run`, `event`, `search`, `title`, `ordering`, `fields`, `id__in` and 20 more, none changes the result. A row's detail, `risk_information/{id}/`, is public and small enough; `model_run` and `model` need a token.
- To ask him for: `risk_information/event/{id}/` and `risk_information/country/{id}/` in the same style, plus a list without geometry.

## In progress
| Who | What | Branch/worktree | Since |
|---|---|---|---|
| (nobody) | | | |

## Open items
- Anuj (shared API): filters on `risk_information` (`event`, `model_run`, `country`), a light list view without geometry, link the 44 unattached risk rows to events, public read of `model_run`, a home for `risk_scenario`, correct `country` on cyclone tracks, remove track 220 and stray rows 49 and 23, rotate the API password.
- On GitHub: protect `main` and require the `CI passed` check.
- Scenario losses are on Wasabi (`spc-zarr-file/scenario_losses/v1`, Cook Islands only); rerun `publish_scenario_losses --replace` after importing new scenarios.
- Branches and worktrees (cleaned up on 2026-10-28; the old merged ones and the five that held unmerged commits are gone, and the two real changes among them were cherry-picked here):
  - `fix/forecast-sync-and-labels` (`~/Partner2-summary`) is merged, but its worktree still has 20 staged files, which are now committed on the working branch; remove it once the user confirms.
  - `feat/frontend-partner-api-model-runs` is checked out in the user's own `/data/Partner2`; leave it.
  - Leftover folders that are no longer worktrees but hold root-owned test files under `middleware/media`, so the user must run `sudo rm -rf` on them: `~/Partner2-ingest`, `~/Partner2-adminlinks`, `~/Partner2-runnames`, `~/Partner2-runnerfix`.
