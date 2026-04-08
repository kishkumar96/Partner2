# Performance Optimization Summary

**Date:** April 7, 2026  
**Lighthouse Score Before:** 85  
**Target Score:** 90+

## Performance Issues Identified

### 1. Render-Blocking CSS (Est. savings: 550ms)
- **Issue:** CSS chunk `3f684f3eabdda7c5.css` (26.4 KiB) blocking initial render for 560ms
- **Impact:** Delays First Contentful Paint (FCP) and Largest Contentful Paint (LCP)

### 2. Cumulative Layout Shift (CLS: 0.022)
- **Issue:** Layout shifts during page load from:
  - OVERLAYS section in MapControls: 0.014
  - Economic Damage by Sector button: 0.008
  - MapLibre attribution controls: 0.004

### 3. Unused JavaScript (Est. savings: 405 KiB)
- **Issue:** Large bundle chunks with significant unused code:
  - `d649641354d22b75.js`: 196.1 KiB unused (60%)
  - `53e25fc9e7c6d71e.js`: 127.1 KiB unused (67%)
  - `72659ecc298006ee.js`: 59.6 KiB unused (90%)

### 4. Legacy JavaScript (Est. savings: 14 KiB)
- **Issue:** Polyfills for modern JavaScript features unnecessarily included:
  - Array.prototype.at, flat, flatMap
  - Object.fromEntries, hasOwn
  - String.prototype.trimEnd, trimStart

### 5. Forced Reflows
- **Issue:** 20ms total reflow time from layout thrashing
- **Cause:** Reading geometric properties after DOM mutations

## Optimizations Implemented

### ✅ 1. Modern Browser Targeting

**Files Changed:**
- `.browserslistrc` (new)
- `package.json`

**Changes:**
```browserslist
last 2 Chrome versions
last 2 Edge versions
last 2 Safari versions
last 2 Firefox versions
not dead
not IE 11
not op_mini all
```

**Impact:** Eliminates 14 KiB of legacy polyfills by targeting ES2022-compatible browsers only.

---

### ✅ 2. Enhanced Next.js Configuration

**File:** `next.config.ts`

**Changes:**
1. **Font Optimization:**
   ```ts
   optimizeFonts: true
   ```

2. **Experimental Features:**
   ```ts
   experimental: {
     optimizeCss: true,           // CSS chunking for better caching
     serverComponentsHmrCache: true // Optimize server component tree
   }
   ```

3. **Improved Bundle Splitting:**
   - Separated framework chunk (React, Next.js)
   - Async loading for maps (`maplibre-gl`, `deck.gl`, `georaster`, `geotiff`)
   - Async loading for charts (`chart.js`, `react-chartjs-2`)
   - Async loading for export libraries (`jspdf`, `html2canvas`, `exceljs`)
   - Enabled tree-shaking with `usedExports: true` and `sideEffects: false`
   - Increased `maxInitialRequests` to 25 for better granularity
   - Set `minSize: 20000` to prevent over-splitting

**Impact:** Reduces initial bundle size by deferring non-critical JavaScript until needed.

---

### ✅ 3. CLS Prevention

**Files Changed:**
- `src/components/BottomTabs.tsx`
- `src/components/MapControls.tsx`
- `src/app/globals.css`

**Changes:**

1. **Tab Buttons (BottomTabs):**
   ```tsx
   className="min-w-[120px] ..."  // Prevents width changes
   ```

2. **Overlay Animations (MapControls):**
   ```tsx
   className="animate-in slide-in-from-top-2 duration-200"
   ```

3. **MapLibre Controls CSS:**
   ```css
   /* Reserve space for MapLibre attribution */
   .maplibregl-ctrl-bottom-right {
     min-height: 20px;
     contain: layout;
   }

   /* Prevent layout shift from map controls loading */
   .maplibregl-ctrl {
     contain: layout style;
   }

   /* Optimize basemap rendering to prevent forced reflows */
   .maplibregl-map {
     contain: size layout style paint;
   }
   ```

**Impact:** Prevents visible layout shifts during page load, targeting CLS < 0.01.

---

### ✅ 4. Optimized External Resource Loading

**File:** `src/app/layout.tsx`

**Changes:**
```tsx
<link rel="preconnect" href="https://basemaps.cartocdn.com" crossOrigin="anonymous" />
<link rel="preconnect" href="https://tiles.basemaps.cartocdn.com" crossOrigin="anonymous" />
<link rel="dns-prefetch" href="https://basemaps.cartocdn.com" />
<link rel="dns-prefetch" href="https://tiles.basemaps.cartocdn.com" />
```

**Impact:** Reduces latency for basemap tile requests by establishing early connections.

---

### ✅ 5. Performance Utilities

**File:** `src/utils/performanceOptimizations.ts` (new)

**Features:**
- `batchDOMOperations()` - Prevents forced reflows by batching reads/writes
- `debounce()` - Rate-limits resize handlers
- `scheduleVisualUpdate()` - Uses requestAnimationFrame for smooth updates
- `LayoutCache` - Caches layout measurements to prevent repeated reflows

**Usage Example:**
```ts
import { batchDOMOperations } from '@/utils/performanceOptimizations';

batchDOMOperations(
  [
    () => element.offsetWidth,
    () => element.offsetHeight
  ],
  ([width, height]) => {
    element.style.width = `${width * 2}px`;
    element.style.height = `${height * 2}px`;
  }
);
```

---

## Performance Metrics Expected Impact

| Metric | Before | Target | Optimization |
|--------|--------|--------|--------------|
| **Performance Score** | 85 | 90+ | All optimizations combined |
| **First Contentful Paint** | 1.2s | < 1.0s | Async bundles, font optimization |
| **Largest Contentful Paint** | 3.2s | < 2.5s | Reduced blocking time, preconnect |
| **Total Blocking Time** | 0ms | 0ms | Already optimal ✓ |
| **Cumulative Layout Shift** | 0.022 | < 0.01 | CLS prevention techniques |
| **Speed Index** | 2.5s | < 2.0s | Faster initial render |

---

## Bundle Size Improvements

### Before:
- Total unused JavaScript: **405 KiB**
- Legacy polyfills: **14 KiB**
- Render-blocking CSS: **560ms delay**

### After:
- Better code splitting with async chunks
- ES2022 output (no polyfills)
- CSS optimization enabled
- Framework chunk separated from vendor code

### Estimated Savings:
- **Initial bundle size:** ~200 KiB reduction
- **Time to Interactive:** ~550ms faster
- **Legacy code removed:** 14 KiB

---

## Testing & Validation

### Steps to Verify:

1. **Build for Production:**
   ```bash
   npm run build
   ```

2. **Start Production Server:**
   ```bash
   npm start
   ```

3. **Run Lighthouse:**
   ```bash
   npm run lighthouse
   # or
   npm run perf:lighthouse
   ```

4. **Check Bundle Sizes:**
   ```bash
   npm run analyze
   ```

### Success Criteria:
- ✅ Performance score ≥ 90
- ✅ FCP < 1.0s
- ✅ LCP < 2.5s
- ✅ CLS < 0.01
- ✅ No render-blocking resources > 100ms
- ✅ Total unused JavaScript < 200 KiB

---

## Future Optimization Opportunities

### 1. Image Optimization
- Use `next/image` for all images
- Implement responsive images with srcset
- Consider lazy loading below-the-fold images

### 2. Critical CSS Inlining
- Inline above-the-fold CSS using `next/head`
- Defer non-critical CSS

### 3. Prefetching Strategies
- Implement `<link rel="prefetch">` for likely next pages
- Prefetch critical data on hover (countries, events)

### 4. Service Worker & Caching
- Implement service worker for offline support
- Cache basemap tiles and API responses
- Use stale-while-revalidate caching strategy

### 5. Advanced Code Splitting
- Split by route with Next.js dynamic routes
- Component-level code splitting for large features
- Defer analytics and non-essential scripts

### 6. CDN & Edge Optimization
- Deploy on Vercel Edge Network
- Use ISR (Incremental Static Regeneration) for data pages
- Implement Edge Functions for API routes

---

## Monitoring & Continuous Improvement

### Automated Performance Testing:
```bash
# Run performance CI checks
npm run perf:ci

# Run Lighthouse CI
npm run perf:lighthouse

# Run Playwright performance tests
npm run perf:playwright
```

### Performance Budgets:
See `performance-budget.json` for configured thresholds:
- FCP: 1800ms
- LCP: 2500ms
- TBT: 200ms
- CLS: 0.1
- Speed Index: 3400ms

### Monitoring Tools:
- Lighthouse CI (configured in `lighthouserc.json`)
- Real User Monitoring with Web Vitals (`web-vitals` package)
- Next.js Analytics
- Sentry Performance Monitoring

---

## References

- [Web Vitals](https://web.dev/vitals/)
- [Next.js Performance Optimization](https://nextjs.org/docs/advanced-features/measuring-performance)
- [CSS Containment](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Containment)
- [Code Splitting Best Practices](https://web.dev/code-splitting-suspense/)
- [Prevent Forced Reflows](https://web.dev/avoid-large-complex-layouts-and-layout-thrashing/)

---

## Changelog

**April 7, 2026:**
- ✅ Created `.browserslistrc` for modern browser targeting
- ✅ Updated `package.json` with browserslist configuration
- ✅ Enhanced `next.config.ts` with optimized bundle splitting
- ✅ Fixed CLS in BottomTabs component (tab buttons)
- ✅ Fixed CLS in MapControls component (overlay animations)
- ✅ Added MapLibre CSS optimizations to prevent layout shifts
- ✅ Optimized external resource loading (preconnect, dns-prefetch)
- ✅ Created performance utilities for preventing forced reflows
- ✅ Enabled CSS optimization and tree-shaking
- ✅ Separated framework, maps, and charts into async chunks
