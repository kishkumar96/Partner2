# Performance Budget and Monitoring

## Overview

This document defines performance budgets and monitoring strategies for the Climate Risk Dashboard.

## Performance Budgets

### Page Weight Budgets

| Resource Type | Budget (KB) | Current | Status |
|--------------|-------------|---------|--------|
| JavaScript   | 300         | TBD     | ⚠️     |
| CSS          | 50          | TBD     | ✅     |
| Images       | 500         | TBD     | ✅     |
| Fonts        | 100         | TBD     | ✅     |
| Total        | 1000        | TBD     | ⚠️     |

### Timing Budgets

| Metric | Budget | Target |
|--------|--------|--------|
| First Contentful Paint (FCP) | < 2.0s | < 1.5s |
| Largest Contentful Paint (LCP) | < 2.5s | < 2.0s |
| First Input Delay (FID) | < 100ms | < 50ms |
| Cumulative Layout Shift (CLS) | < 0.1 | < 0.05 |
| Time to Interactive (TTI) | < 3.5s | < 3.0s |
| Total Blocking Time (TBT) | < 300ms | < 200ms |
| Speed Index | < 3.0s | < 2.5s |

### Resource Count Budgets

| Resource | Budget | Status |
|----------|--------|--------|
| JavaScript files | 15 | ✅ |
| CSS files | 5 | ✅ |
| Images | 20 | ✅ |
| Fonts | 4 | ✅ |
| Third-party scripts | 10 | ⚠️ |

## Monitoring Tools

### 1. Lighthouse CI

**Configuration**: `.lighthouserc.json`

```bash
# Run locally
npm run lighthouse

# Run in CI
npm run lighthouse:ci
```

**Features**:
- Performance scoring
- Accessibility checks
- Best practices validation
- SEO optimization
- PWA compliance

### 2. Web Vitals

**Implementation**: Automatic with Next.js

```typescript
// Track in analytics
export function reportWebVitals(metric) {
  console.log(metric);
  // Send to analytics service
}
```

**Metrics Tracked**:
- FCP, LCP, FID, CLS, TTFB
- Custom performance marks
- Resource timing

### 3. Bundle Analyzer

```bash
# Analyze bundle size
npm run analyze

# View report
open .next/analyze/client.html
```

**Checks**:
- Bundle size trends
- Chunk analysis
- Duplicate dependencies
- Tree-shaking effectiveness

### 4. Performance API

```typescript
// Custom performance monitoring
export function measurePerformance(name: string) {
  performance.mark(`${name}-start`);
  
  return {
    end: () => {
      performance.mark(`${name}-end`);
      performance.measure(name, `${name}-start`, `${name}-end`);
      const measure = performance.getEntriesByName(name)[0];
      console.log(`${name}: ${measure.duration}ms`);
    }
  };
}
```

## Optimization Strategies

### JavaScript Optimization

1. **Code Splitting**
   ```typescript
   // Dynamic imports
   const MapView = dynamic(() => import('@/components/MapView'), {
     loading: () => <LoadingSpinner />,
     ssr: false,
   });
   ```

2. **Tree Shaking**
   ```typescript
   // Import only what you need
   import { feature1 } from 'library'; // ✅
   // Not: import * as lib from 'library'; // ❌
   ```

3. **Minification**
   - Enabled by default in production
   - terser plugin configuration

### CSS Optimization

1. **Critical CSS**
   - Inline critical CSS
   - Defer non-critical CSS

2. **CSS Modules**
   - Scoped styles
   - Automatic code splitting

3. **Tailwind Purge**
   - Remove unused classes
   - JIT mode enabled

### Image Optimization

1. **Next.js Image Component**
   ```tsx
   <Image
     src="/image.jpg"
     width={800}
     height={600}
     alt="Description"
     loading="lazy"
     placeholder="blur"
   />
   ```

2. **Image Formats**
   - WebP with JPEG fallback
   - Responsive images
   - Lazy loading

3. **CDN Delivery**
   - Vercel Image Optimization
   - Cloudflare images

### Font Optimization

1. **Font Display**
   ```css
   @font-face {
     font-family: 'Custom';
     font-display: swap;
     src: url('/fonts/custom.woff2') format('woff2');
   }
   ```

2. **Preload Critical Fonts**
   ```html
   <link rel="preload" href="/fonts/custom.woff2" as="font" type="font/woff2" crossorigin>
   ```

3. **Subset Fonts**
   - Include only needed characters
   - Use variable fonts

## Continuous Monitoring

### Automated Checks

1. **GitHub Actions**
   - Lighthouse CI on every PR
   - Bundle size tracking
   - Performance regression alerts

2. **Vercel Analytics**
   - Real User Monitoring (RUM)
   - Web Vitals tracking
   - Geographic performance data

3. **Sentry Performance**
   - Transaction tracking
   - Slow query detection
   - Performance trends

### Manual Audits

**Weekly**:
- Run Lighthouse audit
- Check bundle size
- Review performance dashboards

**Monthly**:
- Comprehensive performance review
- Update budgets if needed
- Optimize bottlenecks

**Quarterly**:
- Full performance audit
- Third-party script review
- Infrastructure optimization

## Performance Targets by Page

### Homepage
- LCP: < 2.0s
- FID: < 50ms
- CLS: < 0.05
- Bundle: < 200KB

### Map View
- LCP: < 2.5s
- FID: < 100ms
- CLS: < 0.1
- Bundle: < 400KB

### Dashboard
- LCP: < 2.0s
- FID: < 50ms
- CLS: < 0.05
- Bundle: < 300KB

## Alert Thresholds

### Critical (P0)
- LCP > 4.0s
- FID > 300ms
- CLS > 0.25
- Page weight > 5MB

### Warning (P1)
- LCP > 2.5s
- FID > 100ms
- CLS > 0.1
- Bundle > budget + 20%

### Info (P2)
- Minor budget overruns
- Non-critical optimizations
- Recommendations

## Reporting

### Weekly Performance Report

```markdown
# Performance Report - Week XX

## Summary
- Overall Performance Score: 95/100
- Budget Status: 3 warnings, 0 errors
- Regressions: None

## Web Vitals
- FCP: 1.2s (↓ 0.1s)
- LCP: 2.1s (→ same)
- FID: 45ms (↓ 5ms)
- CLS: 0.06 (↑ 0.01)

## Action Items
1. Investigate CLS increase
2. Optimize third-party scripts
3. Review font loading
```

### Monthly Performance Review

- Trend analysis
- Budget adjustments
- Optimization priorities
- Infrastructure changes

## Tools and Resources

### Performance Testing
- [Lighthouse](https://developers.google.com/web/tools/lighthouse)
- [WebPageTest](https://www.webpagetest.org/)
- [PageSpeed Insights](https://pagespeed.web.dev/)
- [GTmetrix](https://gtmetrix.com/)

### Monitoring Services
- [Vercel Analytics](https://vercel.com/analytics)
- [Google Analytics](https://analytics.google.com/)
- [Sentry Performance](https://sentry.io/)
- [New Relic](https://newrelic.com/)

### Optimization Guides
- [Web.dev Performance](https://web.dev/performance/)
- [Next.js Performance](https://nextjs.org/docs/advanced-features/measuring-performance)
- [Chrome DevTools](https://developer.chrome.com/docs/devtools/)

## Best Practices

### DO ✅
- Set realistic budgets
- Monitor continuously
- Optimize progressively
- Test on real devices
- Use performance APIs
- Track business metrics
- Document optimizations

### DON'T ❌
- Ignore performance budgets
- Optimize prematurely
- Add unnecessary dependencies
- Skip testing
- Forget mobile users
- Ignore accessibility
- Over-optimize

## Performance Checklist

- [ ] Lighthouse score > 90
- [ ] All Core Web Vitals pass
- [ ] Bundle size within budget
- [ ] Images optimized
- [ ] Fonts optimized
- [ ] Code splitting implemented
- [ ] Lazy loading configured
- [ ] Caching strategies in place
- [ ] CDN configured
- [ ] Performance monitoring active
- [ ] Alerts configured
- [ ] Regular audits scheduled

## Support

For performance questions:
- Performance Team: perf@yourdomain.com
- Documentation: [Internal Wiki]
- Slack: #performance-optimization
