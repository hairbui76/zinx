#!/bin/bash

app=$1

if [ -z "$app" ]; then
  docker compose -f compose-dev.yaml logs zinx-gateway
else
  docker compose -f compose-dev.yaml logs $app
fi
