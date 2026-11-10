# 🚀 Backend Quick Reference

## One-Command Setup

```bash
./scripts/setup-backend.sh
```

Then start dev server:
```bash
npm run dev
```

---

## Service URLs

- **App**: http://localhost:3002
- **API Health**: http://localhost:3002/partner2/api/health
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379
- **Tile Server**: http://localhost:7800

---

## Common Commands

```bash
# Docker management
npm run docker:up          # Start all services
npm run docker:down        # Stop all services
npm run docker:logs        # View logs

# Database
npm run db:import          # Import data
npm run db:setup           # Setup + import

# Development
npm run dev                # Start dev server
npm run build              # Build for production
```

---

## API Endpoints

### Buildings (with spatial filtering)
```bash
GET /api/buildings?bbox=166.8,-15.5,167.1,-15.2&damage_level=Severe
```

### Roads
```bash
GET /api/roads?bbox=166.8,-15.5,167.1,-15.2
```

### Regions
```bash
GET /api/regions?min_damage_ratio=0.3
```

### Exposure Clusters
```bash
GET /api/exposure?min_exposure=1000000
```

### Cyclone Track
```bash
GET /api/cyclone
GET /api/cyclone?include_forecast=false
```

### Statistics
```bash
GET /api/stats?type=national
GET /api/stats?type=sector
GET /api/stats?type=regional&group_by=region_name
GET /api/stats?type=asset_type
GET /api/stats?type=damage_level
```

See [API_COVERAGE.md](API_COVERAGE.md) for complete documentation.

---

## Quick Checks

```bash
# Database connection
docker-compose exec postgres pg_isready -U postgres

# Redis connection
docker-compose exec redis redis-cli ping

# View data
docker-compose exec postgres psql -U postgres -d climate_risk -c \
  "SELECT COUNT(*) FROM damaged_buildings;"

# Cache stats
docker-compose exec redis redis-cli INFO stats
```

---

## Troubleshooting

### Reset Everything
```bash
docker-compose down -v
./scripts/setup-backend.sh
```

### View Logs
```bash
docker-compose logs -f postgres
docker-compose logs -f redis
docker-compose logs -f tileserver
```

### Clear Cache
```bash
docker-compose exec redis redis-cli FLUSHDB
```

---

## Performance Benefits

| Operation | Before | After | Speedup |
|-----------|--------|-------|---------|
| Initial load | 35MB, 10-30s | 50KB, 0.2s | **150x** |
| Filter data | 2-5s | 50ms | **100x** |
| Map interaction | Parse 35MB | 20KB tiles | **1750x** |

---

See [BACKEND_SETUP.md](BACKEND_SETUP.md) for complete documentation.
