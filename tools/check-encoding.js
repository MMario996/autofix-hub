#!/usr/bin/env node
'use strict';
// Waechter gegen kaputte Zeichenkodierung (gleiches Muster wie im Terminologie-Hub).
// Hintergrund: Ein Sync aus dem Apps-Script-Editor hat in aelteren Dateien
// Umlaute durch '?' ersetzt ("K?rcher", "f?r"). Der Check schlaegt an, bevor
// so etwas deployt wird.
//
// Altlasten stehen in tools/encoding-baseline.json (Datei -> Anzahl). Sie
// duerfen weniger werden, aber nie mehr; neue Dateien muessen sauber sein.
//   node tools/check-encoding.js            pruefen
//   node tools/check-encoding.js --update   Baseline neu schreiben (nur nach Bereinigung!)
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIRS = ['.', 'src', 'ui', 'tools', 'tests', 'tests-ui', 'docs'];
const EXT = /\.(gs|html|js|json|md|css)$/;
const SKIP = /(^|\/)(node_modules|preview|dist|\.git)(\/|$)|package-lock\.json$|encoding-baseline\.json$|check-encoding\.js$/;
const BASELINE_FILE = path.join(__dirname, 'encoding-baseline.json');

const BROKEN_WORDS = /(?<![A-Za-z])(?:f\?r|F\?r|K\?rcher|K\?RCHER|\?ber\w*|\?bersetz\w*|zur\?ck\w*|\w*\?nderung\w*|w\?hl\w*|pr\?f\w*|Pr\?f\w*|l\?dt|l\?uft|Eintr\?g\w*|Ger\?t\w*|m\?ss\w*|k\?nn\w*|m\?glich\w*|S\?tze|gel\?scht|Schl\?ssel\w*|gr\?\?\w*|hei\?t|wei\?|Stra\?e|Zubeh\?r|unver\?ndert\w*|\?hnlich\w*|t\?glich\w*|n\?tig|daf\?r|Schlie\?en|Hinzuf\?gen|Ausgew\?hlt\w*)(?![A-Za-z])/g;
const MOJIBAKE = /Ã[¤¶¼„–œŸ©]|â€[™œ”“–—¦]|�/g;
const BROKEN_RULE = /^\s*(?:\/\/|\*|<!--).*\?{4,}/;

function files() {
  const out = [];
  (function walk(rel) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) return;
    if (fs.statSync(abs).isDirectory()) {
      fs.readdirSync(abs).forEach((f) => { const r = rel ? rel + '/' + f : f; if (!SKIP.test(r)) walk(r); });
    } else if (EXT.test(rel) && !SKIP.test(rel)) out.push(rel);
  })('');
  return out.filter((f) => DIRS.some((d) => d === '.' ? !f.includes('/') : f === d || f.startsWith(d + '/'))).sort();
}

function scan(file) {
  const hits = [];
  fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n').forEach((line, i) => {
    const found = [];
    let m;
    BROKEN_WORDS.lastIndex = 0;
    while ((m = BROKEN_WORDS.exec(line))) found.push(m[0]);
    MOJIBAKE.lastIndex = 0;
    while ((m = MOJIBAKE.exec(line))) found.push(JSON.stringify(m[0]));
    if (BROKEN_RULE.test(line)) found.push('????-Trennlinie');
    if (found.length) hits.push({ line: i + 1, found });
  });
  return hits;
}

const list = files();
const result = {};
list.forEach((f) => { const h = scan(f); if (h.length) result[f] = h; });
const counts = Object.fromEntries(Object.entries(result).map(([f, h]) => [f, h.reduce((a, x) => a + x.found.length, 0)]));

if (process.argv.includes('--update')) {
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(counts, null, 2) + '\n');
  console.log('Baseline geschrieben: ' + Object.keys(counts).length + ' Datei(en) mit Altlasten.');
  process.exit(0);
}

const baseline = fs.existsSync(BASELINE_FILE) ? JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')) : {};
let failed = false;
Object.keys(counts).forEach((f) => {
  const allowed = baseline[f] || 0;
  if (counts[f] > allowed) {
    failed = true;
    console.error(f + ': ' + counts[f] + ' kaputte Stelle(n), erlaubt ' + allowed + ':');
    result[f].forEach((h) => console.error('  ' + f + ':' + h.line + '  ' + h.found.join(', ')));
  }
});
Object.keys(baseline).forEach((f) => {
  if ((counts[f] || 0) < baseline[f]) console.log('Hinweis: ' + f + ' hat weniger Altlasten (' + (counts[f] || 0) + ' statt ' + baseline[f] + '). Baseline mit --update senken.');
});
if (failed) {
  console.error('\nNeue kaputte Zeichenkodierung. Dateien als UTF-8 speichern; nie aus dem Apps-Script-Editor zurueck-syncen.');
  process.exit(1);
}
const legacy = Object.values(baseline).reduce((a, n) => a + n, 0);
console.log('Kodierung OK (' + list.length + ' Dateien' + (legacy ? ', ' + legacy + ' bekannte Altlast(en) in ' + Object.keys(baseline).length + ' Datei(en)' : '') + ').');
