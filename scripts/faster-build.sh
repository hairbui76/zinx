#!/bin/bash
# Script for faster Zinx Gateway builds by forcing proper caching

# Set environment variables for optimized build
export DOCKER_BUILDKIT=1
export BUILDKIT_PROGRESS=plain
export COMPOSE_BUILD_PARALLEL=true

# Disable sourcemaps for faster builds
export GENERATE_SOURCEMAP=false

# Create necessary data directories if they don't exist
mkdir -p ./data/zinx-gateway
mkdir -p ./data/tls
mkdir -p ./data/crowdsec

# Set permissions - this prevents permission errors inside container
# Use mkdir with permissions instead of separate chmod to avoid sudo
mkdir -p -m 777 ./data/zinx-gateway
mkdir -p -m 777 ./data/tls
mkdir -p -m 777 ./data/crowdsec

# Options:
# --build-only: Only build images without starting containers
# --rebuild: Force rebuild of all stages
# --help: Show this help

if [ "$1" == "--help" ]; then
  echo "Usage: ./faster-build.sh [--build-only] [--rebuild]"
  echo "  --build-only: Only build images without starting containers"
  echo "  --rebuild: Force rebuild of all stages"
  echo "  --help: Show this help"
  exit 0
fi

if [ "$1" == "--rebuild" ] || [ "$2" == "--rebuild" ]; then
  echo "Forcing rebuild of all stages..."
  docker compose -f compose-dev.yaml build --no-cache --progress=plain
elif [ "$1" == "--build-only" ] || [ "$2" == "--build-only" ]; then
  echo "Building images only..."
  docker compose -f compose-dev.yaml build --progress=plain
else
  echo "Building and starting containers..."
  docker compose -f compose-dev.yaml up -d --build
fi

echo "Build completed!"
