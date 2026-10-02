'use strict';
// Standard-Test aller Kaercher-Translation-Repositories (identisch in jedem Repo):
// Jede src/*.gs ist gueltiges JavaScript, das Manifest ist gueltig, und kein
// Top-Level-Name ist in zwei Dateien deklariert. Apps Script legt alle .gs-Dateien
// in einen gemeinsamen Namensraum; eine doppelte Funktion ueberschreibt still
// die andere (je nach Ladereihenfolge).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src');
const gs = fs.readdirSync(SRC).filter((f) => f.endsWith('.gs')).sort();
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
let KNOWN = {};
try { KNOWN = require('./known-duplicates.json'); } catch { /* keine Altlasten */ }

test('src/ enthaelt Apps-Script-Code', () => {
  assert.ok(gs.length > 0, 'keine .gs-Datei in src/');
});

for (const f of gs) {
  test('Syntax: ' + f, () => {
    assert.doesNotThrow(() => new vm.Script(read(f), { filename: f }));
  });
}

test('appsscript.json ist gueltig (Zeitzone, V8)', () => {
  const m = JSON.parse(read('appsscript.json'));
  assert.ok(m.timeZone, 'timeZone fehlt');
  assert.equal(m.runtimeVersion, 'V8');
});

test('kein Top-Level-Name doppelt deklariert (ausser bekannten Altlasten)', () => {
  const where = {};
  const re = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(|^(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=/gm;
  for (const f of gs) {
    const src = read(f);
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(src))) (where[m[1] || m[2]] = where[m[1] || m[2]] || []).push(f);
  }
  const dupes = Object.keys(where).filter((n) => where[n].length > 1 && !KNOWN[n]).map((n) => n + ': ' + where[n].join(', '));
  assert.deepEqual(dupes, [], 'neue doppelte Deklarationen');
});
