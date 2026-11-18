#!/bin/bash
set -euo pipefail
# Prefer stopping this optional service to competing with the course website.
available=$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)
if (( available < 184320 )) && systemctl is-active --quiet meow-api; then
    logger -t meow-memory-guard 'Available RAM below 180 MiB; stopping meow-api. Manual restart required.'
    systemctl stop meow-api
fi
