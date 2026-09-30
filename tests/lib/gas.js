'use strict';
// Laedt alle .gs-Dateien in einen gemeinsamen vm-Kontext (wie Apps Script).
// "Doget patch.gs" ist laut eigenem Kopf nur eine Kopiervorlage und bleibt aussen vor.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const SKIP = ['Doget patch.gs'];

function loadGas(globals) {
  const context = Object.assign({ console }, globals || {});
  vm.createContext(context);
  fs.readdirSync(ROOT).filter((f) => f.endsWith('.gs') && !SKIP.includes(f)).sort().forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), context, { filename: f });
  });
  return context;
}

module.exports = { loadGas, ROOT };
