# Testing and quality

## Gates

| When | What runs | Defined in |
|---|---|---|
| `git commit` | `type-check` (includes `config:check`), `lint`, `format:check` | `.husky/pre-commit` |
| commit message | conventional style: `feat(scope): …`, `fix(scope): …`, `docs: …` | `.husky/commit-msg` |
| `git push` | full `jest` suite, then `npm run build` | `.husky/pre-push` |
| CI (push, PR) | quality (config:check, type-check, lint, format), tests with coverage, build | `.github/workflows/ci-cd.yml` |

The hooks never run on the server's deploy path, so run the checks on a checkout before you build an image.

## Frontend tests (Jest, jsdom)

```bash
npm test                                               # everything
npx jest src/utils/__tests__/forecastRuns.test.ts      # one file
npx jest -t "newest advisory"                          # by test name
npm run test:coverage
```

- Tests live in `__tests__/` next to the code (`src/**/__tests__`), plus `src/__tests__` and `tests/`. There are about 100 test files.
- `@/` maps to `src/`. `__mocks__/` stubs maplibre-gl, lucide-react, CSS and images.
- **Prefer real data in fixtures.** The PDIE tests use values from the Tonga example run, so a misread column fails loudly. Type loose fixtures as `Record<string, unknown>`, or `tsc` narrows their literal types and the pre-commit hook fails.
- Put the logic in `utils/` and test it there. Components are thin, and the large ones (`DashboardView`, `MapView`) are hard to test directly.

## Backend tests (Django)

See [Backend → Tests](Backend-Middleware.md#tests). They need Postgres, then `python manage.py test` and `python manage.py makemigrations --check`.

## Performance

```bash
npm run build
npm run perf:lighthouse      # Lighthouse CI against :3002 (manages its own server)
npm run perf:playwright      # user-flow timings; needs a server on :3002
npm run perf:ci              # build check → LHCI → Playwright
```

Budgets: `performance-budget.json`, `lighthouserc.json`. `npm run analyze` opens the bundle analyser. `npm run warm:thredds` pre-warms THREDDS caches before a demo.

## Style

- Prettier and ESLint (flat config, `eslint.config.mjs`) are enforced on commit. `npm run format` and `npm run lint:fix` fix what they can.
- Comments are sparse and explain *why*.
- Match the surrounding code's naming and idiom.
- Optional: `npm run ollama:*` runs local-LLM review helpers (`docs/OLLAMA_*.md`). Nothing depends on them.
