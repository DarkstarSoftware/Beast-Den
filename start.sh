#!/bin/sh
cd "$(dirname "$0")"
# Daily Microsoft/Bing photos for Where in the World are ON by default in this launcher.
# To run fully offline instead: DEN_DAILY_PHOTOS=0 ./start.sh
export DEN_DAILY_PHOTOS="${DEN_DAILY_PHOTOS:-1}"
if ! command -v node >/dev/null 2>&1; then echo "Node.js was not found. Install it from https://nodejs.org (LTS) or with: brew install node"; exit 1; fi
(sleep 2; (open http://localhost:4180 || xdg-open http://localhost:4180) >/dev/null 2>&1) &
node server.js
