# Production Deployment Guide

This guide covers deploying the Climate Risk Dashboard to production environments.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [Deployment Platforms](#deployment-platforms)
  - [Vercel (Recommended)](#vercel-recommended)
  - [AWS (EC2/ECS)](#aws-ec2ecs)
  - [Docker](#docker)
  - [Self-Hosted](#self-hosted)
- [Post-Deployment](#post-deployment)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)

## Prerequisites

Before deploying, ensure you have:

- ✅ Node.js 18+ installed
- ✅ Production environment variables configured
- ✅ Build passes locally (`npm run build`)
- ✅ All tests passing (`npm test`)
- ✅ Code linted and formatted (`npm run lint && npm run format:check`)

## Environment Configuration

### 1. Copy Environment Template

```bash
cp .env.example .env.production
```

### 2. Configure Production Variables

Edit `.env.production` with your production values:

```bash
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://yourdomain.com
NEXT_PUBLIC_ENABLE_ANALYTICS=true
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
NEXT_PUBLIC_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
```

### 3. Security Checklist

- [ ] All sensitive data in environment variables (not in code)
- [ ] API keys secured
- [ ] HTTPS enforced
- [ ] Security headers enabled (already configured in next.config.ts)
- [ ] Rate limiting configured (if applicable)

## Deployment Platforms

### Vercel (Recommended)

Vercel is the easiest way to deploy Next.js applications.

> **Base-path note:** This app uses `basePath: '/partner2'` in production, so
> the live URL will be `https://your-project.vercel.app/partner2`.  
> Set `NEXT_PUBLIC_APP_URL` to that full URL (including `/partner2`).

A `vercel.json` is already included in the repository with sensible defaults.  
After deploying, update `NEXT_PUBLIC_APP_URL` in the Vercel dashboard (or CLI)
to replace the placeholder `your-project.vercel.app` with your actual Vercel
project URL (or custom domain).

#### Option 1: Deploy via CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy to production
vercel --prod
```

#### Option 2: Deploy via Git

1. Push code to GitHub
2. Visit [vercel.com](https://vercel.com) → **Add New Project**
3. Import the `kishkumar96/Partner2` repository
4. Configure environment variables in the Vercel dashboard (see below)
5. Click **Deploy**

#### Configure Environment Variables in Vercel

```bash
# Via CLI
vercel env add NEXT_PUBLIC_APP_URL production
# Enter: https://your-project.vercel.app/partner2

vercel env add NEXT_PUBLIC_GA_MEASUREMENT_ID production
vercel env add NEXT_PUBLIC_SENTRY_DSN production

# Or via Dashboard:
# Go to Project Settings → Environment Variables
```

#### Custom Domain

1. Go to Project Settings → Domains
2. Add your custom domain
3. Configure DNS settings as instructed
4. Update `NEXT_PUBLIC_APP_URL` to `https://yourdomain.com/partner2`

#### Build Settings

Vercel auto-detects Next.js. Default settings work well (also captured in
`vercel.json`):

- **Build Command**: `npm run build`
- **Output Directory**: `.next`
- **Install Command**: `npm ci`
- **Development Command**: `npm run dev`

### AWS (EC2/ECS)

#### EC2 Deployment

```bash
# 1. SSH into EC2 instance
ssh -i your-key.pem ec2-user@your-instance

# 2. Install Node.js
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# 3. Clone repository
git clone your-repo-url
cd climate-dashboard

# 4. Install dependencies
npm ci --production

# 5. Build application
npm run build

# 6. Start with PM2
npm install -g pm2
pm2 start npm --name "climate-dashboard" -- start
pm2 save
pm2 startup
```

#### Using AWS Elastic Beanstalk

Create `Dockerfile`:

```dockerfile
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package*.json ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED 1

RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
```

Then deploy:

```bash
# Initialize EB
eb init -p docker climate-dashboard

# Create environment
eb create climate-dashboard-prod

# Deploy
eb deploy
```

### Docker

> **Important:** This application is served under the `/partner2` base-path in
> production (configured in `next.config.ts`). All URLs must include this prefix,
> e.g. `http://localhost:3112/partner2`.

#### Build Docker Image

```bash
# Build
docker build -t partner2-dashboard:latest .

# Run locally to test (app available at http://localhost:3112/partner2)
docker run -p 3112:3112 \
  -e NODE_ENV=production \
  -e NEXT_PUBLIC_APP_URL=http://localhost:3112/partner2 \
  partner2-dashboard:latest

# Push to a registry
docker tag partner2-dashboard:latest your-registry/partner2-dashboard:latest
docker push your-registry/partner2-dashboard:latest
```

#### Docker Compose (quickstart)

A `docker-compose.yml` is included in the repository. Start it with:

```bash
docker compose up -d --build
# Dashboard → http://localhost:3112/partner2
```

#### Docker Compose (with NGINX reverse proxy)

```yaml
version: '3.8'

services:
  app:
    build: .
    environment:
      - NODE_ENV=production
      - PORT=3112
      - HOSTNAME=0.0.0.0
      - NEXT_PUBLIC_APP_URL=https://yourdomain.com/partner2
    restart: unless-stopped
    networks:
      - app-network

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - app
    restart: unless-stopped
    networks:
      - app-network

networks:
  app-network:
    driver: bridge
```

Example NGINX `location` block to proxy `/partner2`:

```nginx
location /partner2 {
    proxy_pass         http://app:3112;
    proxy_set_header   Host $host;
    proxy_set_header   X-Real-IP $remote_addr;
    proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
}
```

Deploy:

```bash
docker compose up -d
```

### Self-Hosted (Standalone Server)

#### Option 1: Using Node.js directly

```bash
# Build production bundle
npm run build

# Start server
NODE_ENV=production npm start
```

#### Option 2: Using PM2

```bash
# Install PM2
npm install -g pm2

# Create ecosystem file
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'climate-dashboard',
    script: 'npm',
    args: 'start',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
}
EOF

# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

#### NGINX Configuration

Create `/etc/nginx/sites-available/climate-dashboard`:

```nginx
upstream climate_dashboard {
    server 127.0.0.1:3000;
}

server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Redirect to HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    location / {
        proxy_pass http://climate_dashboard;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Cache static assets
    location /_next/static {
        proxy_pass http://climate_dashboard;
        proxy_cache_valid 200 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

Enable site:

```bash
sudo ln -s /etc/nginx/sites-available/climate-dashboard /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Post-Deployment

### 1. Verify Deployment

- [ ] Application loads successfully
- [ ] All routes work correctly
- [ ] Map renders properly
- [ ] Data loads correctly
- [ ] No console errors
- [ ] Mobile responsive

### 2. Performance Testing

```bash
# Run Lighthouse audit
npm run lighthouse

# Check bundle size
npm run analyze
```

### 3. Security Scan

```bash
# Audit dependencies
npm audit

# Fix vulnerabilities
npm audit fix
```

### 4. Setup SSL/HTTPS

#### Using Let's Encrypt (Certbot)

```bash
# Install Certbot
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renewal (cron job)
sudo certbot renew --dry-run
```

### 5. Configure CDN (Optional but Recommended)

Use Cloudflare or AWS CloudFront for:
- DDoS protection
- Global CDN
- Cache optimization
- SSL termination

## Monitoring

### Application Monitoring

1. **Vercel Analytics** (if using Vercel)
   - Automatic Web Vitals tracking
   - Real User Monitoring

2. **Sentry** (Error Tracking)
   ```bash
   # Configure in .env.production
   NEXT_PUBLIC_SENTRY_DSN=your-sentry-dsn
   ```

3. **Google Analytics**
   ```bash
   # Configure in .env.production
   NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
   ```

### Server Monitoring

1. **PM2 Monitoring**
   ```bash
   pm2 monit
   pm2 logs climate-dashboard
   ```

2. **System Monitoring**
   - Setup Datadog, New Relic, or Prometheus
   - Monitor CPU, memory, disk usage
   - Setup alerts for downtime

### Health Checks

Create API route `/api/health`:

```typescript
// src/app/api/health/route.ts
export async function GET() {
  return Response.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
}
```

## Troubleshooting

### Build Failures

```bash
# Clear cache and rebuild
rm -rf .next node_modules
npm install
npm run build
```

### Memory Issues

Increase Node.js memory:

```bash
NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

### Port Already in Use

```bash
# Find process using port 3000
lsof -i :3000

# Kill process
kill -9 <PID>
```

### NGINX Not Starting

```bash
# Check configuration
sudo nginx -t

# Check error logs
sudo tail -f /var/log/nginx/error.log
```

## Rollback Plan

### Vercel

```bash
# List deployments
vercel ls

# Rollback to previous
vercel rollback [deployment-url]
```

### PM2

```bash
# Save current state
pm2 save

# If issues arise, revert code and restart
git checkout <previous-commit>
npm install
npm run build
pm2 restart climate-dashboard
```

## Continuous Deployment

### GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Run tests
        run: npm test
        
      - name: Build
        run: npm run build
        
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
```

## Support

For deployment issues:
- 📧 Email: support@yourdomain.com
- 📖 Documentation: https://docs.yourdomain.com
- 🐛 Issues: https://github.com/yourorg/climate-dashboard/issues
