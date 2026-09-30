#!/usr/bin/env node
'use strict';
// Setzt Index.html aus ui/shell.html, ui/app.css, ui/i18n.js und ui/app.js zusammen.
// Apps Script bekommt so weiterhin EINE Datei (doGet laedt Index unveraendert).
//   node tools/build-index.js          schreibt Index.html
//   node tools/build-index.js --check  prueft, ob Index.html aktuell ist
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, 'ui', f), 'utf8');

function build() {
  return read('shell.html')
    .replace('/*%%CSS%%*/', () => read('app.css'))
    .replace('/*%%I18N%%*/', () => read('i18n.js'))
    .replace('/*%%APP%%*/', () => read('app.js'));
}

if (require.main === module) {
  const target = path.join(ROOT, 'Index.html');
  if (process.argv.includes('--check')) {
    if (fs.readFileSync(target, 'utf8') !== build()) {
      console.error('Index.html ist veraltet. Bitte "node tools/build-index.js" ausfuehren.');
      process.exit(1);
    }
    console.log('Index.html ist aktuell.');
  } else {
    fs.writeFileSync(target, build());
    console.log('Index.html geschrieben.');
  }
}
module.exports = { build };
