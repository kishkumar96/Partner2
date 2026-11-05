# Auth and tenancy

There are three separate mechanisms:

| | Who | How | Code |
|---|---|---|---|
| **Country login** | partners viewing a protected country | one shared password per country → signed session cookie | `lib/countryAuth.ts`, `app/api/auth/*`, `app/[country]/login` |
| **Operator login** | SPC staff running models | Django superuser credentials → Partner API token in an httpOnly cookie | `lib/operatorAuth.ts`, `app/api/operator/*`, `app/operator` |
| **Tenant lock** | a deployment for one country only | `TENANT_COUNTRY` env | `utils/tenantCountry.ts`, `proxy.ts` |

## Country login

- **Public by default.** With `COUNTRY_PUBLIC_COUNTRIES` unset, every country is public. Once it is set, every country *not* listed is protected.
- A protected country needs `COUNTRY_PASSWORD_<CC>` and a shared `COUNTRY_AUTH_SECRET` (32+ characters). `validateSecurityConfigOrThrow()` (`lib/securityConfig.ts`) runs when `proxy.ts` loads, and stops the server if either is missing. The proxy also returns **503** "Country access is misconfigured" for a protected country with no password.
- The session cookie is HMAC-SHA256 signed, per country, httpOnly, `Secure` in production. Bump `COUNTRY_AUTH_SESSION_VERSION` to invalidate every session.
- `proxy.ts` checks the cookie on every protected page through `/api/auth/verify-session`, and redirects to `/<slug>/login` without one. The country-scoped APIs (`/api/buildings`, `/api/roads`, `/api/regional-summary[-by-sector]`) answer **401** without a valid session.
- Login attempts are rate-limited (`lib/rateLimit.ts`). That uses Redis when `REDIS_URL` is set, and Redis is required in production unless `AUTH_REQUIRE_REDIS=false`.
- Cross-site POSTs are rejected (`isSameOriginMutation`).

## Operator login

- `/operator` posts superuser credentials to `/api/operator/login`. The server exchanges them for a Partner API token and stores the token in the `partner2_operator` cookie: httpOnly, `SameSite=strict`, 8 hours. Browser JavaScript never sees the token.
- `/api/operator/{pipelines,runs,tracks,session,logout}` forward to the middleware's `partner_api/v1/operator/*`. **Django enforces superuser access**, and the Next layer only carries the token.
- Mutations check that the Origin or Referer host equals the addressed host (`rejectCrossSite`), so this works behind Docker port mapping and a reverse proxy.
- The operator endpoints exist only on **our middleware**, not on the shared API.

## Tenant lock

`TENANT_COUNTRY=CK` (or `cook-islands`):

- `/` redirects to `/cook-islands`.
- Every other country's page and country-scoped API answers **404**.
- `generateStaticParams` emits only that country.

## Security notes

- Partner API credentials and the RiskScape token are **server-side only**. Nothing secret is inlined into `NEXT_PUBLIC_*`.
- A shared API token comes from `POST /partner_api/api-token-auth/` and lasts about two days. Never put the password in chat, commits or files in the repo.
- More: [`SECURITY.md`](../../SECURITY.md), [`SECRETS_MANAGEMENT.md`](../../SECRETS_MANAGEMENT.md).
