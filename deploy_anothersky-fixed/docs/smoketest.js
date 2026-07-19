#!/usr/bin/env node
// Static smoke test for src/ (the deployed build - see docs/ARCHITECTURE.md
// and HANDOFF.md for why anothersky-horror.html is archived to old/ and not
// covered here).
//
// This is NOT a real browser/runtime test - it can't be, without a headless
// browser (Playwright/Puppeteer), which isn't available in every
// environment this might run in. What it DOES catch, cheaply and with zero
// dependencies beyond Node itself:
//
//   1. Syntax errors in every .js file under src/ (node --check).
//   2. Broken relative import paths - './foo.js' that doesn't actually
//      exist on disk. This is a very real, very easy mistake to make in a
//      hand-split ES-module codebase like this one (a typo, a file that
//      got renamed without updating its importers, a path that's correct
//      relative to the wrong directory) - and it's exactly the kind of
//      thing that reads fine on a manual code trace and only breaks at
//      actual page-load time in a browser.
//
// What this deliberately does NOT catch (be honest about the gap, not
// silently pretend to cover it): whether the game actually runs, whether
// DOM element IDs referenced in JS exist in index.html, whether anything
// visually works. That's still the standing "needs a real live playtest"
// gap tracked in HANDOFF.md's Phase 1 entry - this script narrows what
// that playtest has to catch, it doesn't replace it.
//
// Usage: node docs/smoketest.js   (run from anywhere; paths are relative
// to this file's own location, not the current working directory)

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SRC_ROOT = path.join(__dirname, '..', 'src');

function walk(dir){
  let out = [];
  for(const entry of fs.readdirSync(dir, { withFileTypes:true })){
    const full = path.join(dir, entry.name);
    if(entry.isDirectory()) out = out.concat(walk(full));
    else if(entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const files = walk(SRC_ROOT);
console.log(`Found ${files.length} .js files under src/\n`);

let failures = 0;

// --- 1. syntax check every file ---
for(const file of files){
  try{
    execFileSync(process.execPath, ['--check', file], { stdio:'pipe' });
  }catch(err){
    failures++;
    console.error(`✗ SYNTAX ERROR: ${path.relative(SRC_ROOT, file)}`);
    console.error('  ' + (err.stderr ? err.stderr.toString().trim().split('\n').join('\n  ') : err.message));
  }
}

// --- 2. every relative import/export path actually resolves ---
// Comments are stripped first (naively - doesn't account for // or /* */
// appearing inside a string/template literal, which is a real but rare
// edge case for this codebase's style) so that doc comments quoting
// example import syntax from other files - a real pattern this codebase
// uses in several header comments - don't produce false-positive reports.
function stripComments(src){
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const IMPORT_RE = /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"](\.[^'"]+)['"]/g;
for(const file of files){
  const src = stripComments(fs.readFileSync(file, 'utf8'));
  let m;
  while((m = IMPORT_RE.exec(src))){
    const importPath = m[1];
    const resolved = path.resolve(path.dirname(file), importPath);
    if(!fs.existsSync(resolved)){
      failures++;
      console.error(`✗ BROKEN IMPORT: ${path.relative(SRC_ROOT, file)} imports '${importPath}'`);
      console.error(`  resolved to ${resolved} - file does not exist`);
    }
  }
}

console.log();
if(failures === 0){
  console.log(`✓ All ${files.length} files pass syntax check and every relative import resolves.`);
  console.log('  (Reminder: this only proves the files are internally consistent - see the');
  console.log('   header comment for what it does NOT catch. Still need a real playtest.)');
  process.exitCode = 0;
}else{
  console.error(`${failures} problem(s) found.`);
  process.exitCode = 1;
}
