#!/usr/bin/env node
'use strict';
// Vorschau der echten Oberflaeche (Index.html) mit Beispieldaten statt google.script.run.
//   node tools/build-preview.js [--scenario=admin|operator|viewer|denied|open] [--out=datei]
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function build(scenario) {
  const html = fs.readFileSync(path.join(ROOT, 'Index.html'), 'utf8');
  const mock = '<script>window.SCENARIO = ' + JSON.stringify(scenario) + ';</script>\n<script>' + fs.readFileSync(path.join(__dirname, 'mock-backend.js'), 'utf8') + '</script>\n';
  const at = html.indexOf('<script>\n// Oberflaechentexte');
  if (at === -1) throw new Error('Einfuegepunkt fuer das Mock-Backend nicht gefunden.');
  return html.slice(0, at) + mock + html.slice(at);
}

if (require.main === module) {
  const arg = (n, d) => { const a = process.argv.find((x) => x.startsWith('--' + n + '=')); return a ? a.split('=')[1] : d; };
  const out = build(arg('scenario', 'admin'));
  const file = arg('out', '');
  if (file) fs.writeFileSync(file, out); else process.stdout.write(out);
}
module.exports = { build };
