#!/bin/bash

# Check if argument is --prune, remove all volumes, networks and shutdown all containers

if [ "$1" == "--prune" ]; then
  docker compose -f compose-dev.yaml down --volumes --remove-orphans
else
  docker compose -f compose-dev.yaml down
fi
