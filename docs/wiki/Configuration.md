# Configuration

The app is configured in two places:

- **`config/`**: *what* the dashboard serves (countries, fallback events, static layers). JSON, reviewed in a PR, validated and compiled into code.
- **Environment variables**: *where* things are and *who* may see them (API URLs, passwords, feature flags).

## `config/` (countries, events, layers)

The full contract is in [`config/README.md`](../../config/README.md). In short:

```
config/release.json            version, default country, ordered country list
config/countries/<slug>.json   names, map view, Partner API aliases, terminology
config/events/<slug>.json      fallback events (never live storms)
config/layers/<slug>.json      static THREDDS layers, each linked to an event by eventId
config/schema.mjs              the Zod schema; *.schema.json are generated for editors
```

```bash
npm run config:validate   # check
npm run config:generate   # check, then write src/generated/config-registry.ts and the JSON Schemas
npm run config:check      # fail if the generated files are stale (runs in type-check, build and CI)
```

The app reads configuration **only** through `src/config/registry.ts` (`listCountries`, `getCountryByCode`, `getCountryBySlug`, `getCountryPresentation`, `getStaticEvents`, `getStaticLayerCatalog`, `getConfigRelease`). The `CountryCode` type is generated from the files. Unknown fields are errors, so a typo or a pasted secret fails validation. `GET /api/config` and `/api/health` report the running release's `configVersion` and `contentSha256`.

### Adding a country

Follow [`config/README.md` → Adding a country](../../config/README.md#adding-a-country). The steps:

1. Create the country in the Partner API with the same two-letter **`code`**.
2. Add any static files under `public/<slug>/`.
3. Add `config/countries/<slug>.json`, list the slug in `release.json`, and bump `configVersion`.
4. Run `npm run config:generate` and commit the config and the generated files together.
5. If the country is protected, set `COUNTRY_PASSWORD_<CODE>`.
6. Deploy, then check that `/api/config` shows the new hash.

Areas (districts and provinces) and hazard and sector lists are still in `src/data/countryConfigs.ts`. Older notes, including part of `AGENTS.md`, say to edit `types/thredds.ts` and `countrySlug.ts` by hand. Do not: those now derive from `config/`.

## Environment variables

**Build-time vs run-time.** `NEXT_PUBLIC_*` variables are **inlined into the browser bundle when the image is built** (Dockerfile `ARG`s, and `docker-compose.prod.yml` `build.args`). Changing them in `.env.production` does nothing until you rebuild. The other variables are read at run time on the server.

### Data sources

| Variable | Default | Meaning |
|---|---|---|
| `NEXT_PUBLIC_ENABLE_PARTNER_API` | unset (off); image: `true` | browser uses the Partner API |
| `PARTNER_API_ENABLED` | unset | server-side switch (either one turns it on server-side) |
| `PARTNER_API_BASE_URL` | `http://localhost:8000` | API host the proxy forwards to; **production: `https://pacific-disaster-api.spc.int`** |
| `NEXT_PUBLIC_PARTNER_API_COUNTRIES` / `PARTNER_API_COUNTRIES` | all configured; image: `VU,WS,TO,CK` | countries that read the API |
| `NEXT_PUBLIC_PARTNER_API_STRICT_COUNTRIES` / `PARTNER_API_STRICT_COUNTRIES` | none; image: `VU` | countries that never fall back to local files |
| `THREDDS_BASE_URL` | `https://gemthreddshpc.spc.int` | WMS host |
| `NEXT_PUBLIC_THREDDS_WMS_URL` | | WMS URL override for the browser |
| `NEXT_PUBLIC_HAZARD_ZARR_DIRECT` | on | `false` uses server-drawn tiles, not the zarr store |
| `PARTNER_PROXY_TIMEOUT_MS`, `PARTNER_DATA_TIMEOUT_MS`, `THREDDS_WMS_TIMEOUT_MS` | 20000, 60000, 30000 | proxy timeouts |
| `NEXT_PUBLIC_DATA_VERSION` | | cache-busting tag for static data |

### Paths and identity

| Variable | Default | Meaning |
|---|---|---|
| `NEXT_PUBLIC_BASE_PATH` | empty in dev; image: `/partner2` | URL prefix; use `prependBasePath` |
| `TENANT_COUNTRY` | unset | lock the deployment to one country (code or slug) |
| `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_VERSION`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_ENVIRONMENT` | | labels and absolute links |
| `PORT`, `HOSTNAME` | 3002 (dev); 3112, `0.0.0.0` (prod) | server bind |

### Auth (see [Auth and tenancy](Auth-and-Tenancy.md))

| Variable | Meaning |
|---|---|
| `COUNTRY_PUBLIC_COUNTRIES` | unset: every country is public. Set: only these are public, the rest need a password |
| `COUNTRY_PASSWORD_<CC>` | password of a protected country (`CK`, `TO`, `WS`, `VU`) |
| `COUNTRY_AUTH_SECRET` | 32+ characters; signs session cookies |
| `COUNTRY_AUTH_SESSION_VERSION` | bump to log every session out |
| `COUNTRY_AUTH_ROTATE_ON_LOGOUT`, `COUNTRY_AUTH_AUDIT_TOKEN` | logout rotation; token for `/api/auth/security-report` |
| `AUTH_REQUIRE_REDIS`, `REDIS_URL` | rate-limit store; required in production unless `AUTH_REQUIRE_REDIS=false` (the SPC server sets `false`) |
| `DATABASE_URL` | Postgres for server-side features that use `lib/db.ts` |
| `METRICS_AUTH_TOKEN` | protects `/api/metrics` |

### Observability and extras

`NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_ENABLE_ERROR_TRACKING`, `NEXT_PUBLIC_ENABLE_ANALYTICS`, `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`. `OLLAMA_*` are only for the optional local-LLM review scripts (`npm run ollama:*`).

### Files

- `.env.example`: a template; copy it to `.env.local` for dev. It does not list every variable above.
- `.env.development`, `.env.staging`, `.env.production`: real values, **gitignored**. Never commit them, and never paste passwords or tokens into chat, issues or commits. See [`SECRETS_MANAGEMENT.md`](../../SECRETS_MANAGEMENT.md).
