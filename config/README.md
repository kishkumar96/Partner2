# Configuration

Which countries the dashboard serves, how they are named and where the map opens.
JSON here is reviewed in a pull request and takes effect only when deployed: there is no
runtime editor. The Partner API stays the source of live data; nothing here is a risk
record, a credential or a URL to an upstream service.

```
config/release.json        version, default country, and the countries to include, in order
config/countries/<slug>.json   one file per country
config/schema.json         JSON Schema for a country file (editor IntelliSense; generated)
config/schema.mjs          the contract, defined once with Zod
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
`getCountryByCode`, `getCountryBySlug`, `getCountryPresentation`, `getConfigRelease`). The
`CountryCode` type is generated from the files, so a country is added without editing a code list.

## Which release is running

`GET /api/config` returns `{ configVersion, schemaVersion, contentSha256, countries }` (no database,
no secrets), and `/api/health` includes the same `config` block. After a deploy, compare the hash with
the one in the release you meant to ship.

## Adding a country

1. **Django:** create the country record in the Partner API (the dashboard matches it by name or code).
2. **Assets:** add the country's approved data under `public/<slug>/` if it has static files.
3. **Config:** copy a file in `config/countries/`, rename it `<slug>.json`, fill it in, and add the
   slug to `countries` in `release.json` (its position is its place in the country list). Bump `configVersion`.
4. `npm run config:generate`, then commit the config and the generated files together.
5. **If the country is password-protected:** provision `COUNTRY_PASSWORD_<CODE>` and the auth secret in the
   environment. Passwords never go in these files.
6. Review, deploy, and check `/api/config` shows the new hash and the country code.

A new country appears in the routes, the country list, the comparison and authentication lookups from steps 1 to 4.
It shows as "no data yet" (`dataAvailable: false`) until its events, layers and districts exist; those tables
(`src/data/`) are the next phase of this work.

## Notes on individual countries

- **Cook Islands** (`cook-islands.json`): the map opens centred on Rarotonga at zoom 11, because Rarotonga is the only
  island the hazard and risk catalogue covers. A whole-EEZ zoom (6) rendered the island and its flood overlay as a few
  invisible pixels.
