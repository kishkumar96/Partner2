# Loading Vanuatu, Cook Islands, Tonga and Samoa reference data into a server

A new database has the tables but none of this data. These commands fill it. Run them **on the
server, inside the backend container** (`docker exec middleware_web …`), one block at a time, and
check the counts after each. Each one is safe to re-run: it skips rows it already has.

All of them now find a country by its code (VU, CK, TO, WS), so a row whose short name is `VUT`
or `COK` is found and no duplicate country is created. They need the code migrations
(country 0004/0005) applied first.

## 0. Before you start
- Code in place (see `STAGING.md`), then check what is there:
  ```bash
  docker exec middleware_web python manage.py shell -c "
  from country.models import Country
  print(list(Country.objects.order_by('id').values_list('id','short_name','code')))"
  ```
  Every country you will load needs a code. Fix blanks in the admin first.
- Back up: `docker exec middleware_db sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > ~/before_reference_data_$(date +%F).dump`
- Note the counts to compare with later:
  `curl -s localhost:8800/partner_api/v1/risk_information/?page_size=1` and the same for `hazard_information`
  (read `count`). Per country, add `&country=<id>` to `risk_information` and `hazard_information`.
  The event and track endpoints ignore that filter.
- The server needs outbound HTTPS to `pacific-disaster-api.spc.int` and `gemthreddshpc.spc.int`.

## 1. Vanuatu
```bash
docker exec middleware_web python manage.py import_legacy_risk_information --country VU      # ~19 risk tables
docker exec middleware_web python manage.py import_legacy_hazard_information --country VU
docker exec middleware_web python manage.py import_slr_hazard_information --country VU       # coastal flood, from THREDDS
docker exec middleware_web python manage.py import_fluvial_hazard_information                # rain/river flood (Vanuatu only)
docker exec middleware_web python manage.py import_vu_lola_event                             # Lola event and track
```
Expect roughly 19 risk rows and several hundred hazard rows for Vanuatu. The Lola event links hazard
layers by fixed ids from the original database. On a different database those ids will not match,
so the event is created without them and the command says so. That is expected.

## 2. Tonga and Samoa hazard layers
```bash
for c in TO WS; do
  docker exec middleware_web python manage.py import_legacy_hazard_information --country $c
  docker exec middleware_web python manage.py import_slr_hazard_information --country $c
done
```

## 3. Cook Islands scenarios and hazard catalogue (needs the 7 GB `data/` folder)
Copy `data/` (it holds `hazard_catalog.zarr` and `ck_risk_analysis/`) into the backend folder first:
```bash
rsync -a --partial --info=progress2 <local>/middleware_partner_api/data/ divesha@<server>:/home/divesha/middleware_partner_api/data/
```
Then:
```bash
docker exec middleware_web python manage.py populate_hazard_catalog --base-url https://opmthredds.gem.spc.int
docker exec middleware_web python manage.py import_ck_risk_scenarios
```
**Give `populate_hazard_catalog` the public address.** Without `--base-url` it stores
`http://localhost:8000` in every hazard row, which only works on a developer's machine.
`import_ck_risk_scenarios` relabels some rows of the combined-hazard data and reports each one; read
that output before relying on those numbers. Expect about 4,700 hazard rows and 4,700 scenarios for
the Cook Islands.

## 4. Check
```bash
docker exec middleware_web python manage.py shell -c "
from country.models import Country
print(Country.objects.count(), list(Country.objects.order_by('id').values_list('short_name','code')))"
```
The country list must be unchanged (no second Vanuatu or Tonga). Then compare the risk and hazard
counts with the ones noted in step 0, and open `/partner2/vanuatu` and `/partner2/cook-islands`.

## Undo
Restore the dump from step 0 (`pg_restore --clean`). Files these commands saved under `media/` stay
behind but are harmless.
