# Monitoring and Observability Guide

## Overview

This document describes the monitoring and observability strategy for the Climate Risk Dashboard.

## Components

### 1. Health Checks

#### API Health Endpoint

**Endpoint**: `GET /api/health`

**Response**:
```json
{
  "status": "healthy",
  "timestamp": "2026-02-14T10:30:00Z",
  "uptime": 3600,
  "version": "1.0.0",
  "environment": "production",
  "checks": {
    "database": {
      "status": "ok",
      "latency": 15
    },
    "redis": {
      "status": "ok",
      "latency": 5
    },
    "memory": {
      "used": 256,
      "total": 512,
      "percentage": 50
    }
  },
  "responseTime": "25ms"
}
```

**Status Codes**:
- `200` - System healthy
- `503` - System degraded or unhealthy

#### Kubernetes Probes

```yaml
livenessProbe:
  httpGet:
    path: /api/health
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /api/health
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 2
```

### 2. Application Performance Monitoring (APM)

#### Sentry Integration

**Setup**:
```bash
# Install Sentry
npm install @sentry/nextjs

# Configure
export NEXT_PUBLIC_SENTRY_DSN=your-dsn
export SENTRY_AUTH_TOKEN=your-token
```

**Features**:
- Error tracking and aggregation
- Performance monitoring
- Release tracking
- User feedback
- Source maps for debugging

#### Sentry Configuration

```javascript
// sentry.client.config.js
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,
  environment: process.env.NEXT_PUBLIC_ENVIRONMENT,
  enabled: process.env.NODE_ENV === 'production',
  beforeSend(event, hint) {
    // Filter out sensitive data
    return event;
  },
});
```

### 3. Metrics Collection

#### Application Metrics

**Endpoint**: `GET /api/metrics`

**Authentication**: Bearer token required

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://yourdomain.com/api/metrics
```

**Metrics Available**:
- Application uptime
- Memory usage
- CPU usage
- Request count
- Response times
- Error rates

#### Custom Metrics

```typescript
// utils/metrics.ts
export class MetricsCollector {
  private metrics: Map<string, number> = new Map();

  increment(name: string, value: number = 1) {
    const current = this.metrics.get(name) || 0;
    this.metrics.set(name, current + value);
  }

  gauge(name: string, value: number) {
    this.metrics.set(name, value);
  }

  getMetrics() {
    return Object.fromEntries(this.metrics);
  }
}

export const metrics = new MetricsCollector();
```

### 4. Logging

#### Structured Logging

```typescript
// utils/logger.ts
export const logger = {
  info: (message: string, meta?: Record<string, any>) => {
    console.log(JSON.stringify({
      level: 'info',
      message,
      timestamp: new Date().toISOString(),
      ...meta,
    }));
  },

  error: (message: string, error?: Error, meta?: Record<string, any>) => {
    console.error(JSON.stringify({
      level: 'error',
      message,
      error: error?.message,
      stack: error?.stack,
      timestamp: new Date().toISOString(),
      ...meta,
    }));
  },

  warn: (message: string, meta?: Record<string, any>) => {
    console.warn(JSON.stringify({
      level: 'warn',
      message,
      timestamp: new Date().toISOString(),
      ...meta,
    }));
  },
};
```

#### Log Aggregation

**Options**:
1. **Vercel Logs** (if using Vercel)
2. **DataDog** - Full observability platform
3. **New Relic** - APM and logging
4. **Elastic Stack** (ELK) - Self-hosted option
5. **CloudWatch Logs** (AWS)

### 5. Real User Monitoring (RUM)

#### Web Vitals

```typescript
// pages/_app.tsx
import { reportWebVitals } from 'next/web-vitals';

export function reportWebVitals(metric) {
  // Send to analytics
  if (process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === 'true') {
    // Send to Google Analytics
    window.gtag?.('event', metric.name, {
      value: Math.round(metric.value),
      event_label: metric.id,
      non_interaction: true,
    });

    // Send to custom endpoint
    fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metric),
    });
  }
}
```

**Tracked Metrics**:
- First Contentful Paint (FCP)
- Largest Contentful Paint (LCP)
- First Input Delay (FID)
- Cumulative Layout Shift (CLS)
- Time to First Byte (TTFB)

### 6. Alerting

#### Alert Configuration

```yaml
# alerts.yml
alerts:
  - name: "High Error Rate"
    condition: "error_rate > 5% for 5m"
    severity: critical
    channels:
      - slack
      - pagerduty
    
  - name: "High Response Time"
    condition: "p95_response_time > 2s for 10m"
    severity: warning
    channels:
      - slack
    
  - name: "Memory Usage High"
    condition: "memory_usage > 80% for 15m"
    severity: warning
    channels:
      - slack
    
  - name: "Service Down"
    condition: "health_check_failed for 2m"
    severity: critical
    channels:
      - slack
      - pagerduty
      - sms
```

#### Notification Channels

**Slack Integration**:
```bash
# Set webhook URL
export SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK

# Send alert
curl -X POST $SLACK_WEBHOOK_URL \
  -H 'Content-Type: application/json' \
  -d '{
    "text": "🚨 Alert: High error rate detected",
    "blocks": [
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": "*Error Rate*: 8.5%\n*Duration*: 5 minutes\n*Environment*: production"
        }
      }
    ]
  }'
```

### 7. Dashboards

#### Recommended Dashboards

1. **System Health Dashboard**
   - Uptime status
   - Health check results
   - Error rates
   - Response times

2. **Performance Dashboard**
   - Web Vitals
   - API response times
   - Database query times
   - Cache hit rates

3. **Business Metrics Dashboard**
   - Active users
   - Page views
   - Feature usage
   - Conversion rates

4. **Infrastructure Dashboard**
   - CPU usage
   - Memory usage
   - Network I/O
   - Disk usage

#### Grafana Dashboard Template

```json
{
  "dashboard": {
    "title": "Climate Dashboard Monitoring",
    "panels": [
      {
        "title": "Request Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(http_requests_total[5m])",
            "legendFormat": "{{method}} {{path}}"
          }
        ]
      },
      {
        "title": "Error Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(http_requests_total{status=~\"5..\"}[5m])",
            "legendFormat": "5xx errors"
          }
        ]
      }
    ]
  }
}
```

### 8. Monitoring Best Practices

#### DO ✅

- Monitor the four golden signals (latency, traffic, errors, saturation)
- Set up alerts for critical issues
- Use structured logging
- Track business metrics
- Monitor user experience (RUM)
- Regular dashboard reviews
- Document runbooks for alerts
- Test alerting channels regularly

#### DON'T ❌

- Alert on every minor issue
- Ignore warning signs
- Log sensitive data
- Overlook performance degradation
- Forget to monitor dependencies
- Set unrealistic SLOs
- Alert without actionable information

### 9. SLIs and SLOs

#### Service Level Indicators (SLIs)

- **Availability**: 99.9% uptime
- **Latency**: p95 < 500ms, p99 < 1s
- **Error Rate**: < 0.1%
- **Throughput**: > 1000 req/s

#### Service Level Objectives (SLOs)

```yaml
slos:
  - name: "API Availability"
    target: 99.9%
    window: 30d
    
  - name: "Page Load Time"
    target: "p95 < 2s"
    window: 7d
    
  - name: "Error Rate"
    target: "< 0.5%"
    window: 24h
```

### 10. Incident Response

#### On-Call Rotation

```yaml
# oncall-schedule.yml
teams:
  - name: "Platform Team"
    schedule:
      - week: 1
        primary: "engineer-1"
        backup: "engineer-2"
      - week: 2
        primary: "engineer-3"
        backup: "engineer-4"
```

#### Incident Runbook

1. **Acknowledge** - Confirm receipt of alert
2. **Assess** - Check dashboards and logs
3. **Mitigate** - Take immediate action
4. **Communicate** - Update stakeholders
5. **Resolve** - Fix root cause
6. **Document** - Create post-mortem

## Implementation Checklist

- [ ] Set up health check endpoint
- [ ] Configure Sentry error tracking
- [ ] Implement structured logging
- [ ] Set up metrics collection
- [ ] Configure Web Vitals tracking
- [ ] Create monitoring dashboards
- [ ] Set up alerting rules
- [ ] Configure notification channels
- [ ] Define SLIs and SLOs
- [ ] Document incident procedures
- [ ] Test monitoring stack
- [ ] Train team on monitoring tools

## Resources

- [Sentry Documentation](https://docs.sentry.io/)
- [Grafana Dashboards](https://grafana.com/)
- [Prometheus Monitoring](https://prometheus.io/)
- [Site Reliability Engineering Book](https://sre.google/books/)
