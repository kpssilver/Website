#!/bin/bash
# KPS Print Relay launcher (macOS / Linux)
# Double-click on macOS (or run from a terminal). Keep the window open while printing.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "Node.js was not found on this computer."
  echo "Install it once from https://nodejs.org (LTS version), then run this file again."
  echo
  read -r -p "Press Enter to exit..."
  exit 1
fi

node ./relay.cjs
echo
echo "The relay has stopped."
read -r -p "Press Enter to exit..."
