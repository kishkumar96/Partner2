# Map 3D Visual Regression Checklist

Use this checklist to validate 3D map realism after changes to camera/extrusion logic in MapView.

## Scope

- File under test: src/components/MapView.tsx
- Features under test:
  - 3D camera pitch/bearing behavior
  - Basemap building extrusions
  - Regional impacts extrusion heights
  - Zoom-based extrusion damping
  - Extrusion opacity and visual weight

## Test Preconditions

1. Start app in development mode.
2. Open a view with regional impacts available.
3. Enable 3D view.
4. Ensure map style and data are fully loaded before capture.
5. Use a consistent viewport for all captures:
   - Desktop: 1440x900
   - Browser zoom: 100%

## Required Snapshot Set

Capture screenshots at the same map center for these zoom levels:

1. Zoom 5 (country-scale context)
2. Zoom 9 (regional detail)
3. Zoom 13 (local detail)

For each zoom level, capture:

1. Loss extrusion mode
2. Wind extrusion mode
3. 3D basemap buildings visible

Suggested naming:

- z5-loss.png
- z5-wind.png
- z9-loss.png
- z9-wind.png
- z13-loss.png
- z13-wind.png

## Visual Pass/Fail Checks

### A) Camera realism

1. Pass: Perspective feels natural, not overly tilted or distorted.
2. Pass: Labels and geometry remain legible while panning.
3. Fail: "Toy city" look returns (excessive tilt/foreshortening).

### B) Basemap building realism

1. Pass: Most buildings appear plausible in height range.
2. Pass: No widespread needle-like spikes or flat slabs.
3. Fail: Frequent extreme outliers that dominate the scene.

### C) Data extrusion scaling

1. Pass: Bars are visible but not overwhelming at zoom 5.
2. Pass: Bars gain useful detail at zoom 9 and zoom 13.
3. Fail: Country-scale view dominated by very tall spikes.

### D) Opacity and layering

1. Pass: Extrusions are readable without hiding all basemap context.
2. Pass: Layer stacking remains understandable during pan/zoom.
3. Fail: Heavy/blocky wall effect across large areas.

### E) Interaction stability

1. Pass: Switching 2D/3D does not leave stale extrusion states.
2. Pass: Basemap style changes re-apply expected 3D behavior.
3. Fail: Missing layers, flicker loops, or persistent wrong visibility.

## Quick Manual Script

1. Load map and wait for all tiles/layers.
2. Toggle 3D on.
3. Set extrusion mode to loss and capture z5, z9, z13.
4. Set extrusion mode to wind and capture z5, z9, z13.
5. Toggle 3D off then on again; verify no visual regressions.
6. Switch basemap once; verify 3D settings still apply.

## Merge Gate Recommendation

Treat as regression if any of these occur:

1. Camera angle introduces obvious visual distortion.
2. Building or data extrusions look exaggerated relative to prior baseline.
3. Zoom damping no longer reduces low-zoom bar dominance.
4. Opacity causes severe occlusion of map context.

## Optional Automation Hook

If you later automate visual tests (Playwright or Percy), use the same zoom/capture matrix in this file as the baseline contract.
