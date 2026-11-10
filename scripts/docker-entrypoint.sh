#!/bin/sh
set -e

# Docker entrypoint for Next.js with flexible mounting
# Detects if code is mounted and builds accordingly

echo "🚀 Starting Climate Risk Dashboard..."

# Check if running with mounted code
# Look for package.json AND src directory (indicates mounted source)
if [ -f "/app/package.json" ] && [ -d "/app/src" ] && [ ! -f "/app/server.js" ]; then
  echo "📦 Mounted code detected - building and running from source..."
  
  # Install dependencies if next binary is missing
  if [ ! -f "/app/node_modules/.bin/next" ]; then
    echo "📥 Installing npm packages..."
    npm ci --production=false
  else
    echo "✓ Dependencies already installed"
  fi
  
  echo "🔨 Building Next.js application..."
  npm run build
  
  echo "🎯 Starting Next.js production server (with mounted code)..."
  exec npm run start
else
  echo "📦 Standalone mode - using pre-built server..."
  # Running from standalone build (no mounted code)
  if [ ! -f "/app/server.js" ]; then
    echo "❌ Error: server.js not found!"
    echo "This image was built with standalone output but server.js is missing."
    exit 1
  fi
  exec node server.js
fi
