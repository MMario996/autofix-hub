#!/usr/bin/env node
'use strict';
// Schreibt die Versionsinfo fuer die App (Anzeige unter "Hilfe"), bevor die
// Pipeline den Code per clasp hochlaedt. Lokal nicht noetig.
//   node tools/stamp-version.js --version=v1.2.3 --commit=<sha>
const fs = require('fs');
const path = require('path');

const TARGET = path.join(__dirname, '..', 'HubVersion.gs');
const VAR = 'HUB_VERSION_INFO_';

function arg(name) {
  const a = process.argv.find((x) => x.startsWith('--' + name + '='));
  return a ? a.slice(name.length + 3) : '';
}
const info = {
  version: (arg('version') || 'dev').replace(/[^\w.+-]/g, '').substring(0, 40),
  commit: (arg('commit') || '').replace(/[^0-9a-f]/gi, '').substring(0, 40),
  builtAt: new Date().toISOString()
};
const src = fs.readFileSync(TARGET, 'utf8');
const re = new RegExp('var ' + VAR + ' = \\{[^\\n]*\\};');
if (!re.test(src)) { console.error('Versionszeile in ' + TARGET + ' nicht gefunden.'); process.exit(1); }
fs.writeFileSync(TARGET, src.replace(re, 'var ' + VAR + ' = ' + JSON.stringify(info).replace(/,"/g, ', "').replace(/":/g, '": ') + ';'));
console.log('Version gesetzt: ' + JSON.stringify(info));
