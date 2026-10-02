#!/usr/bin/env node
'use strict';
// Struktur-Waechter: alle Kaercher-Translation-Repositories sind gleich aufgebaut
// (Vorbild: Prompt Hub). Diese Datei ist in jedem Repository identisch.
//
//   src/            Apps-Script-Code (clasp rootDir), inkl. appsscript.json
//   tests/          Node-Tests, Einstieg tests/run-all.js
//   tools/          Build- und Pruef-Skripte (u. a. diese Datei)
//   docs/           DOKUMENTATION.md, ENDPOINTS.md, CI-CD.md (+ optional mockups/)
//   .github/        workflows/ci.yml, workflows/deploy.yml, actions/clasp-deploy,
//                   dependabot.yml, CODEOWNERS, pull_request_template.md
//
//   node tools/check-structure.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const errors = [];

const REQUIRED = [
  'README.md', 'package.json', 'eslint.config.js', '.gitignore', '.claspignore', '.gitleaks.toml',
  'src/appsscript.json',
  'tests/run-all.js',
  'tools/check-structure.js',
  'docs/DOKUMENTATION.md', 'docs/ENDPOINTS.md', 'docs/CI-CD.md',
  '.github/workflows/ci.yml', '.github/workflows/deploy.yml', '.github/actions/clasp-deploy/action.yml',
  '.github/dependabot.yml', '.github/CODEOWNERS', '.github/pull_request_template.md'
];
REQUIRED.forEach((p) => { if (!exists(p)) errors.push('fehlt: ' + p); });

// Apps-Script-Code liegt ausschliesslich in src/
if (exists('src') && !fs.readdirSync(path.join(ROOT, 'src')).some((f) => f.endsWith('.gs'))) errors.push('src/ enthaelt keine .gs-Datei');
fs.readdirSync(ROOT).forEach((f) => {
  if (f.endsWith('.gs') || f === 'appsscript.json') errors.push('gehoert nach src/: ' + f);
});

// clasp schiebt src/
if (exists('.github/actions/clasp-deploy/action.yml')) {
  const action = fs.readFileSync(path.join(ROOT, '.github/actions/clasp-deploy/action.yml'), 'utf8');
  if (!/"rootDir":"src"/.test(action)) errors.push('clasp-deploy: rootDir muss "src" sein');
}

// einheitliche npm-Skripte
if (exists('package.json')) {
  const scripts = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts || {};
  ['test', 'lint', 'check', 'ci'].forEach((s) => { if (!scripts[s]) errors.push('package.json: Skript "' + s + '" fehlt'); });
  if (scripts.check && !/check-structure/.test(scripts.check)) errors.push('package.json: "check" muss tools/check-structure.js ausfuehren');
}

// README verweist auf die Dokumentation
if (exists('README.md')) {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  ['docs/DOKUMENTATION.md', 'docs/ENDPOINTS.md'].forEach((d) => { if (!readme.includes(d)) errors.push('README.md verlinkt ' + d + ' nicht'); });
}

if (errors.length) {
  console.error('Struktur weicht vom Standard ab:\n  - ' + errors.join('\n  - '));
  process.exit(1);
}
console.log('Struktur entspricht dem Standard.');
