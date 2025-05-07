#!/bin/bash

DOCKER_BUILDKIT=1 BUILDKIT_PROGRESS=plain COMPOSE_BAKE=true docker compose --progress=plain -f compose-dev.yaml up -d --build
