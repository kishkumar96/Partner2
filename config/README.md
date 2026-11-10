# Configuration

Which countries the dashboard serves, how they are named and where the map opens.
JSON here is reviewed in a pull request and takes effect only when deployed: there is no
runtime editor. The Partner API stays the source of live data; nothing here is a risk
record, a credential or a URL to an upstream service.

```
config/release.json            version, default country, and the countries to include, in order
config/countries/<slug>.json   one file per country: names, map view, Partner API aliases, terminology
config/events/<slug>.json      a country's approved fallback events
config/layers/<slug>.json      a country's static map layers (THREDDS datasets) and their dataset path
config/*.schema.json           JSON Schemas for those files (editor IntelliSense; generated)
config/schema.mjs              the contract, defined once with Zod
```

Unknown fields are errors, so a typo or a pasted secret fails validation instead of being ignored.

## Commands

| | |
|---|---|
| `npm run config:validate` | check the files against the schema and the rules that span files |
| `npm run config:generate` | validate, then write `src/generated/config-registry.ts` and the JSON Schemas |
| `npm run config:check` | fail if the generated files are not what `config:generate` would write |

`config:check` runs in `npm run type-check` (so in the commit hook), before every build, and in CI.
Commit the generated files with the config change.

The app reads configuration only through `src/config/registry.ts` (`listCountries`,
`getCountryByCode`, `getCountryBySlug`, `getCountryPresentation`, `getStaticEvents`,
`getStaticLayerCatalog`, `getConfigRelease`). The
`CountryCode` type is generated from the files, so a country is added without editing a code list.

## What belongs in events and layers, and what does not

- **`events/`** holds *fallback* events: the curated historical storm a country shows when the Partner API has
  no event of its own. **Live storms and their advisories are never here.** They come from the Partner API, which
  stays authoritative for anything operational (status, runs, issue times, which advisory is newest). A fallback
  event cannot pin a stale default over a live one.
- **`layers/`** holds *static* hazard layers: a THREDDS dataset file under the country's `datasetBasePath`, with its
  bounding box and map style. A layer names its event with `eventId`; an event's layers are found from that link
  (there is no hand-kept list on the event to go stale). Scenario catalogues (sea level x return period) come from
  the Partner API, not from here.
- **Never in these files:** risk records, geometry, credentials, database ids, or a URL to an upstream service. Paths
  are checked: a layer file is a relative path with no `..`; `datasetBasePath` is a server path, not a URL.
- `"enabled": false` hides an approved event or layer without deleting it.
- Each country needs exactly one enabled default event if it has an events file, and every layer's `eventId` must be
  one of that country's events. A country may have neither file; it then shows "no data yet".

## Which release is running

`GET /api/config` returns `{ configVersion, schemaVersion, contentSha256, countries }` (no database,
no secrets), and `/api/health` includes the same `config` block. After a deploy, compare the hash with
the one in the release you meant to ship.

## Adding a country

1. **Django:** create the country record in the Partner API and set its **`code`** to the same two-letter code as the
   config file (e.g. `FJ`). The dashboard finds a country's record by that code, which means the same in every
   deployment; ids and names do not (Cook Islands is id 3 live and 1 locally, and Tonga's short name is "Ton").
   Against an API that has no codes yet it falls back to matching names, but never matches a record that carries a
   different code, so "American Samoa" (`AS`) cannot be taken for Samoa (`WS`).
2. **Assets:** add the country's approved data under `public/<slug>/` if it has static files.
3. **Config:** copy a file in `config/countries/`, rename it `<slug>.json`, fill it in, and add the
   slug to `countries` in `release.json` (its position is its place in the country list). Bump `configVersion`.
4. `npm run config:generate`, then commit the config and the generated files together.
5. **If the country is password-protected:** provision `COUNTRY_PASSWORD_<CODE>` and the auth secret in the
   environment. Passwords never go in these files.
6. Review, deploy, and check `/api/config` shows the new hash and the country code.

A new country appears in the routes, the country list, the comparison and authentication lookups from steps 1 to 4.
It shows as "no data yet" (`dataAvailable: false`) until it has data. To give it a fallback event and static layers, add
`config/events/<slug>.json` and `config/layers/<slug>.json` (copy another country's; the scientific datasets
themselves are provisioned on the THREDDS server, not here). Its areas (districts, provinces) and its hazard and
sector lists still live in `src/data/countryConfigs.ts` and are the next piece to move.

## Notes on individual countries

- **Cook Islands** (`cook-islands.json`): the map opens centred on Rarotonga at zoom 11, because Rarotonga is the only
  island the hazard and risk catalogue covers. A whole-EEZ zoom (6) rendered the island and its flood overlay as a few
  invisible pixels.
