# Multi-Country Impact Data: Current Status

## Summary

Regional impact overlays currently load in **single-country mode**. When `countryCode` is `null`, the current implementation falls back to **Vanuatu (`'VU'`)**.

## Confirmed Behavior in This Repo

- `RegionalImpactsLayer` computes `effectiveCountry` as `countryCode ?? 'VU'`.
- There is no `useRegionalImpactsData` hook in this repository.
- There is no `loadAllCountriesRegionalImpacts` function in `src/utils/realDataLoader.ts`.

## What This Means for Users

- Selecting a specific country (`VU`, `WS`, `TO`, `CK`) loads that country's regional impact data.
- Passing `countryCode={null}` does **not** aggregate all countries; it currently renders using Vanuatu as fallback.

## Notes for Future Multi-Country Support

If true all-country overlays are needed, implementation work is still required:

1. Add a loader that fetches all supported countries and merges features.
2. Add a data-access mode split (`single` vs `all`).
3. Add cache keys for combined data vs per-country data.
4. Update UI copy and guides only after code is implemented.
