# Getting started

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node.js | `20.19.6` (see `.nvmrc`; `package.json` accepts `>=20.9.0`) | Next.js 16 |
| npm | `>= 10` | lockfile v3 |
| Docker | any recent | only for the middleware, its tests, and production images |
| Python 3 + Postgres | only if you work on `middleware/` | Django API |

## Run the dashboard

```bash
nvm use                      # picks 20.19.6 from .nvmrc
npm ci
cp .env.example .env.local   # then edit, see below
npm run dev                  # http://localhost:3002
```

Open a country: `http://localhost:3002/cook-islands`, `/tonga`, `/samoa`, `/vanuatu`. In dev the base path is empty. In production it is `/partner2`.

### Pick a data source in `.env.local`

**Against the shared API (what production uses):**

```bash
NEXT_PUBLIC_ENABLE_PARTNER_API=true
PARTNER_API_ENABLED=true
PARTNER_API_BASE_URL=https://pacific-disaster-api.spc.int
NEXT_PUBLIC_PARTNER_API_COUNTRIES=VU,WS,TO,CK
PARTNER_API_COUNTRIES=VU,WS,TO,CK
```

**Offline, from the files in `public/data/`:** leave `NEXT_PUBLIC_ENABLE_PARTNER_API` unset or `false`. Countries without local files show "no data yet".

**Against your own middleware** (only when you are developing the API itself): run it on `localhost:8000` (see [Backend](Backend-Middleware.md#run-it-locally)) and set `PARTNER_API_BASE_URL=http://localhost:8000`.

With `COUNTRY_PUBLIC_COUNTRIES` unset, every country is public and no password is needed, which is the simplest setup for local work. Once it is set, each country *not* in the list is protected. Each protected country then needs `COUNTRY_PASSWORD_<CC>`, plus a shared `COUNTRY_AUTH_SECRET` of 32+ characters, or the app **refuses to start** (`validateSecurityConfigOrThrow`). See [Auth and tenancy](Auth-and-Tenancy.md).

Every variable is listed in [Configuration](Configuration.md#environment-variables).

## Everyday commands

```bash
npm run dev              # dev server, port 3002
npm run type-check       # config:check + tsc --noEmit
npm run lint             # eslint (flat config)
npm run format:check     # prettier over src/**   (npm run format to fix)
npm test                 # jest, jsdom
npx jest src/utils/__tests__/pdieOutputs.test.ts   # one file
npm run config:generate  # after editing anything in config/
npm run build            # production build (runs config:check first)
```

## Your first change, end to end

1. Read [`WORKING.md`](../../WORKING.md) to see which branch is in use and whether anyone is working on the same area.
2. Make the change, with a test next to the code in a `__tests__/` folder.
3. `git commit` runs type-check, lint and format-check. Use a conventional message: `fix(forecast): …`, `feat(pdie): …`.
4. `git push` runs the full jest suite and `npm run build`.
5. To put it live, follow [Deployment](Deployment.md).

## Where things are

```
src/app/                 routes (App Router) and API routes
src/proxy.ts             request proxy: country routing, auth gate, tenant lock
src/components/          UI; DashboardView.tsx is the orchestrator
src/utils/               data loading, parsing and domain logic (most of the code)
src/config/registry.ts   the only way the app reads config/
src/lib/                 auth, rate limiting, cache, db
config/                  countries, fallback events, static layers (JSON, validated)
public/data/             local fallback data files
middleware/              Django Partner API, model runners
scripts/ops/             build-and-ship and deploy scripts for the SPC server
docs/                    long-form docs; this wiki is docs/wiki/
```
