#!/bin/bash
# Backend Setup Script
# Sets up PostgreSQL, Redis, and imports data

set -e

echo "🚀 Climate Risk Dashboard - Backend Setup"
echo "==========================================="

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed. Please install Docker first.${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${RED}❌ Docker Compose is not installed. Please install Docker Compose first.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Docker is installed${NC}"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed. Please install Node.js first.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Node.js is installed ($(node --version))${NC}"

# Stop existing containers
echo ""
echo "📦 Stopping existing containers..."
docker compose down 2>/dev/null || true

# Start services
echo ""
echo "🐳 Starting backend services..."
docker compose up -d postgres redis tileserver

# Wait for PostgreSQL to be ready
echo ""
echo "⏳ Waiting for PostgreSQL to be ready..."
max_attempts=30
attempt=0

until docker-compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; do
    attempt=$((attempt + 1))
    if [ $attempt -eq $max_attempts ]; then
        echo -e "${RED}❌ PostgreSQL failed to start${NC}"
        exit 1
    fi
    echo -n "."
    sleep 1
done

echo -e "\n${GREEN}✓ PostgreSQL is ready${NC}"

# Wait for Redis to be ready
echo ""
echo "⏳ Waiting for Redis to be ready..."
max_attempts=30
attempt=0

until docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; do
    attempt=$((attempt + 1))
    if [ $attempt -eq $max_attempts ]; then
        echo -e "${RED}❌ Redis failed to start${NC}"
        exit 1
    fi
    echo -n "."
    sleep 1
done

echo -e "\n${GREEN}✓ Redis is ready${NC}"

# Install npm dependencies if needed
if [ ! -d "node_modules" ] || [ ! -d "node_modules/pg" ]; then
    echo ""
    echo "📦 Installing dependencies..."
    npm install
fi

# Import data
echo ""
echo "📊 Importing data into PostgreSQL..."
npm run db:import

# Check tile server
echo ""
echo "🗺️  Checking tile server..."
sleep 3
if curl -s http://localhost:7800 > /dev/null; then
    echo -e "${GREEN}✓ Tile server is running${NC}"
else
    echo -e "${YELLOW}⚠ Tile server may not be ready yet${NC}"
fi

# Show service status
echo ""
echo "✅ Setup Complete!"
echo "==================="
echo ""
echo "Services running:"
echo "  • PostgreSQL: localhost:5432"
echo "  • Redis:      localhost:6379"
echo "  • Tile Server: http://localhost:7800"
echo ""
echo "Useful commands:"
echo "  • View logs:        docker-compose logs -f"
echo "  • Stop services:    docker-compose down"
echo "  • Restart services: docker-compose restart"
echo "  • Import data:      npm run db:import"
echo ""
echo "Next steps:"
echo "  1. Run 'npm run dev' to start the development server"
echo "  2. Open http://localhost:3002 in your browser"
echo "  3. Check API health: http://localhost:3002/partner2/api/health"
echo ""
