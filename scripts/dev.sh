#!/bin/bash
# Development script that runs CSS watcher, Routes watcher and Deno server in parallel

# Trap to cleanup background processes on exit
trap 'kill $(jobs -p) 2>/dev/null' EXIT

# Start CSS watcher in background
deno run -A npm:postcss-cli src/view/assets/app.css -o public/css/app.css --watch &

# Start Routes watcher in background
deno run -A scripts/watch_routes.ts &

# Start Deno server (foreground)
deno run -A --watch --env main.ts

# Wait for all background processes
wait
