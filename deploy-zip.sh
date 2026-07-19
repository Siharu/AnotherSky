#!/usr/bin/env bash
# deploy-zip.sh
#
# Run this from the ROOT of your repo in the Codespace (the folder that
# already has your git history in it). It extracts the given zip and
# OVERWRITES matching files directly in the repo - new/changed files from
# the zip land on top of what's already there, anything not in the zip is
# left alone - then deploys to Vercel from the repo root.
#
# Usage:
#   chmod +x deploy-zip.sh
#   ./deploy-zip.sh anothersky-fixed.zip
#
# If you omit the filename, it looks for exactly one *.zip in the current
# directory and uses that.
#
# First run will prompt you to log into Vercel (opens a device-auth link -
# click it, approve in the browser tab Codespaces gives you) and to link
# the project (pick "no" on linking to an existing one unless you already
# have a Vercel project for this repo, then accept the defaults). Every
# run after that redeploys straight to production with no prompts.

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

REPO_ROOT="$(pwd)"
echo "==> Deploying from: $ZIP_FILE"
echo "==> Target repo root: $REPO_ROOT"

# ---------- 2. extract into a scratch folder first (never straight into
#               the repo - that way a flatten step can't touch real files) ----------
SCRATCH_DIR="$(mktemp -d)"
trap 'rm -rf "$SCRATCH_DIR"' EXIT

echo "==> Extracting..."
unzip -q "$ZIP_FILE" -d "$SCRATCH_DIR"

# If the zip's actual content is nested one or more folders deep (e.g.
# anothersky-fixed.zip -> anothersky_fixed/index.html, or even two levels
# deep if a previously-extracted folder got re-zipped), keep unwrapping
# single-child directories until we hit index.html or run out of
# single-child levels to unwrap.
while [ ! -f "$SCRATCH_DIR/index.html" ]; do
  TOP_ENTRIES=("$SCRATCH_DIR"/*)
  if [ ${#TOP_ENTRIES[@]} -ne 1 ] || [ ! -d "${TOP_ENTRIES[0]}" ]; then
    break
  fi
  echo "==> Flattening single top-level folder: $(basename "${TOP_ENTRIES[0]}")"
  INNER="${TOP_ENTRIES[0]}"
  TMP="${SCRATCH_DIR}_flatten_tmp"
  mv "$INNER" "$TMP"
  rmdir "$SCRATCH_DIR"
  mv "$TMP" "$SCRATCH_DIR"
done

if [ ! -f "$SCRATCH_DIR/index.html" ]; then
  echo "!! No index.html found after extraction/flattening. Contents:"
  ls -la "$SCRATCH_DIR"
  exit 1
fi

# ---------- 3. overwrite matching files directly in the repo ----------
# rsync -a copies file-by-file and overwrites anything that already
# exists at that path; anything already in the repo but NOT in the zip
# is left untouched (no --delete), so this only ever adds/updates files,
# never silently removes something the zip didn't happen to include.
echo "==> Copying files into the repo (overwriting matches)..."
if command -v rsync >/dev/null 2>&1; then
  rsync -a --exclude '.git' "$SCRATCH_DIR"/ "$REPO_ROOT"/
else
  # rsync isn't installed on this image - fall back to cp, still overwrites
  echo "   (rsync not found, using cp -rf instead)"
  cp -rf "$SCRATCH_DIR"/. "$REPO_ROOT"/
fi

echo "==> Files updated in $REPO_ROOT"

# ---------- 4. build step, only if this project actually has one ----------
cd "$REPO_ROOT"
if [ -f package.json ] && node -e "process.exit(require('./package.json').scripts && require('./package.json').scripts.build ? 0 : 1)" 2>/dev/null; then
  echo "==> package.json has a build script - installing deps and building..."
  npm install
  npm run build
else
  echo "==> No build step detected (static project) - deploying as-is."
fi

# ---------- 5. make sure the Vercel CLI is available ----------
if ! command -v vercel >/dev/null 2>&1; then
  echo "==> Installing Vercel CLI globally..."
  npm install -g vercel
fi

# ---------- 6. deploy ----------
echo "==> Deploying to Vercel (production)..."
vercel --prod --yes

echo ""
echo "==> Done. The production URL is printed above."
echo "    Repo files were overwritten in place - if this repo is tracked by"
echo "    git, remember to 'git add -A && git commit' if you want the"
echo "    update saved to history (this script doesn't commit for you)."
echo "    Re-run this script any time you have a new zip to redeploy."