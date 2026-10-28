# WORKING.md

The one place that says what is current. Agents and people: read this first, update it when you start and when you finish.

## Branch
- **Working branch:** `integration/ready-to-build` (worktree `~/Partner2-merge` on the shared server). All new work lands here.
- **`main`:** protected target for PRs once the team opens one; CI must pass (`CI passed`).
- **Don't:** edit `/data/Partner2` (the user's own working tree, with uncommitted changes), or share a checkout with another session.

## Deployed
- **Live dashboard** (https://opmthredds.gem.spc.int/partner2): image built on 22 Oct from a hand-made tarball; commit not recorded. It does not contain the Zarr flood depths, the scenario fallback, the model-runs adapter or the Context header.
- **Next build:** `git archive` of the working branch head; build on WSL, ship, switch with `~/deploy-new-image.sh`. Record the commit here after the switch.
- **Data source:** the live proxy points at our API (`opmthredds.gem.spc.int`). Not yet switched to the shared API (`pacific-disaster-api.spc.int`): it ignores `?country=`, `?event=` and `?model_run=` and sends the whole 112 MB risk table.

## In progress
| Who | What | Branch/worktree | Since |
|---|---|---|---|
| (nobody) | | | |

## Open items
- Anuj (shared API): filters on `risk_information` (`event`, `model_run`, `country`), a light list view without geometry, link the 44 unattached risk rows to events, public read of `model_run`, a home for `risk_scenario`, correct `country` on cyclone tracks, remove track 220 and stray rows 49 and 23, rotate the API password.
- On GitHub: protect `main` and require the `CI passed` check.
- Scenario losses are on Wasabi (`spc-zarr-file/scenario_losses/v1`, Cook Islands only); rerun `publish_scenario_losses --replace` after importing new scenarios.
- Old branches/worktrees (merged ones can go; five hold unmerged commits to review): `feat/admin-event-run-links`, `feat/analysis-mode-full-names`, `fix/forecast-filter-panel`, `fix/forecast-run-names`, `fix/runner-name-run`.
