#!/usr/bin/env bash
# deploy-zip.sh
#
# Drop this next to a project zip in a GitHub Codespace and run it - it
# extracts the zip, flattens a single-nested-folder layout if the zip has
# one (e.g. anothersky-fixed.zip -> anothersky_fixed/...), and deploys the
# result to Vercel. Works for any static/Vite-less project with a real
# index.html at its root (this project's shape - src/ + index.html, no
# build step) - if a package.json with a build script shows up later, the
# script detects it and runs the build first.
#
# Usage (from the Codespace terminal, in the same folder as the zip):
#   chmod +x deploy-zip.sh
#   ./deploy-zip.sh anothersky-fixed.zip
#
# If you omit the filename, it looks for exactly one *.zip in the current
# directory and uses that.
#
# First run will prompt you to log into Vercel (opens a device-auth link -
# click it, approve in the browser tab Codespaces gives you) and to link
# the project (pick "no" on linking to an existing one unless you already
# have a Vercel project for this, then accept the defaults). Every run
# after that redeploys straight to production with no prompts.

set -euo pipefail

# ---------- 1. figure out which zip to use ----------
ZIP_FILE="${1:-}"
if [ -z "$ZIP_FILE" ]; then
  MATCHES=(*.zip)
  if [ ${#MATCHES[@]} -ne 1 ]; then
    echo "Usage: ./deploy-zip.sh <file.zip>"
    echo "  (or leave it blank if there's exactly one .zip in this folder - found ${#MATCHES[@]})"
    exit 1
  fi
  ZIP_FILE="${MATCHES[0]}"
fi

if [ ! -f "$ZIP_FILE" ]; then
  echo "Can't find '$ZIP_FILE' in $(pwd)."
  exit 1
fi

echo "==> Deploying from: $ZIP_FILE"

# ---------- 2. extract into a clean working folder ----------
DEPLOY_DIR="deploy_$(basename "$ZIP_FILE" .zip)"
rm -rf "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"

echo "==> Extracting..."
unzip -q "$ZIP_FILE" -d "$DEPLOY_DIR"

# If the zip contains exactly one top-level folder and nothing else at its
# root (e.g. anothersky-fixed.zip -> anothersky_fixed/index.html), flatten
# it up one level so index.html ends up at DEPLOY_DIR's root, not buried -
# Vercel (and most static hosts) expect index.html at the project root.
TOP_ENTRIES=("$DEPLOY_DIR"/*)
if [ ${#TOP_ENTRIES[@]} -eq 1 ] && [ -d "${TOP_ENTRIES[0]}" ]; then
  echo "==> Flattening single top-level folder: $(basename "${TOP_ENTRIES[0]}")"
  INNER="${TOP_ENTRIES[0]}"
  TMP="${DEPLOY_DIR}_flatten_tmp"
  mv "$INNER" "$TMP"
  rmdir "$DEPLOY_DIR"
  mv "$TMP" "$DEPLOY_DIR"
fi

if [ ! -f "$DEPLOY_DIR/index.html" ]; then
  echo "!! No index.html found at $DEPLOY_DIR/index.html after extraction."
  echo "   Contents:"
  ls -la "$DEPLOY_DIR"
  exit 1
fi

cd "$DEPLOY_DIR"

# ---------- 3. build step, only if this project actually has one ----------
if [ -f package.json ] && node -e "process.exit(require('./package.json').scripts && require('./package.json').scripts.build ? 0 : 1)" 2>/dev/null; then
  echo "==> package.json has a build script - installing deps and building..."
  npm install
  npm run build
else
  echo "==> No build step detected (static project) - deploying as-is."
fi

# ---------- 4. make sure the Vercel CLI is available ----------
if ! command -v vercel >/dev/null 2>&1; then
  echo "==> Installing Vercel CLI globally..."
  npm install -g vercel
fi

# ---------- 5. deploy ----------
echo "==> Deploying to Vercel (production)..."
vercel --prod --yes

echo ""
echo "==> Done. The production URL is printed above."
echo "    Re-run this script any time you have a new zip to redeploy."
