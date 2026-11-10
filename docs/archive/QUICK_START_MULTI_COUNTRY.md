# Quick Start: Regional Impact Data (Current Behavior)

## Current State

The current map data flow is **single-country oriented**.

- `countryCode='VU' | 'WS' | 'TO' | 'CK'` → loads that specific country.
- `countryCode={null}` → currently falls back to **Vanuatu (`'VU'`)**.

> This repository does not currently include an all-country aggregation mode.

## How to Use Today

### 1) Run the app

```bash
npm run dev
```

### 2) Test country-specific overlays

Set a concrete country code where `MapView` / `RegionalImpactsLayer` is used:

```tsx
<MapView selectedCountry="WS" mapStyle="loss" ... />
```

Then verify:
- Samoa regions render shading in `loss` mode.
- Switching to `wind` changes the shading metric.
- Popups show region-level impact values.

### 3) Understand `null` behavior

If you set:

```tsx
<MapView selectedCountry={null} ... />
```

the current implementation resolves to Vanuatu as fallback (not combined VU/WS/TO/CK).

## Recommended Next Work (if all-country mode is required)

1. Implement a combined data loader for all supported countries.
2. Introduce explicit `all` vs `single` loading mode.
3. Add cache and UI behavior for combined datasets.
4. Update docs after implementation lands.
