#!/bin/bash
set -e

# Local production deployment script (simulates Ubuntu server)
# This is the exact same script you'll use on your Ubuntu server

IMAGE_NAME="climate-dashboard"
CONTAINER_NAME="partner2-prod"
PORT=3112

echo "🔄 Building Docker image..."
docker build -t $IMAGE_NAME:latest .

echo "🛑 Stopping existing container (if any)..."
docker stop $CONTAINER_NAME 2>/dev/null || true
docker rm $CONTAINER_NAME 2>/dev/null || true

echo "🚀 Starting new container..."
docker run -d \
  --name $CONTAINER_NAME \
  --restart unless-stopped \
  -p $PORT:$PORT \
  --env-file .env.production \
  -e NODE_ENV=production \
  -e PORT=$PORT \
  -e HOSTNAME=0.0.0.0 \
  $IMAGE_NAME:latest

echo ""
echo "✅ Deployment complete!"
echo "📊 Container status:"
docker ps | grep $CONTAINER_NAME

echo ""
echo "🌐 Application URL: http://localhost:$PORT/partner2"
echo ""
echo "📝 View logs: docker logs -f $CONTAINER_NAME"
echo "🛑 Stop: docker stop $CONTAINER_NAME"
echo "🗑️  Remove: docker rm $CONTAINER_NAME"
