'use strict';
// Oberflaeche <-> Server <-> Vorschau passen zusammen.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadGas, ROOT, SRC } = require('./lib/gas');
const { build } = require('../tools/build-index');

const app = fs.readFileSync(path.join(ROOT, 'ui', 'app.js'), 'utf8');
const shell = fs.readFileSync(path.join(ROOT, 'ui', 'shell.html'), 'utf8');
const G = loadGas();
const called = [...new Set([...app.matchAll(/call\('(\w+)'/g)].map((m) => m[1]))];

test('Index.html ist aus ui/ generiert und aktuell', () => {
  assert.equal(fs.readFileSync(path.join(SRC, 'Index.html'), 'utf8'), build());
});

test('die Oberflaeche ruft nur api*-Funktionen auf, und alle existieren', () => {
  assert.ok(called.length > 25);
  called.forEach((fn) => {
    assert.match(fn, /^apiHub/, fn + ' ist keine Oberflaechen-API');
    assert.equal(typeof G[fn], 'function', fn);
  });
});

test('jede api*-Funktion prueft eine Rolle (ausser Start, Sprache, Antrag)', () => {
  const src = fs.readFileSync(path.join(SRC, 'HubApi.gs'), 'utf8');
  const open = ['apiHubBootstrap', 'apiHubSetLang', 'apiHubRequestAccess'];
  [...src.matchAll(/^function (apiHub\w+)\(/gm)].map((m) => m[1]).forEach((fn) => {
    if (open.includes(fn)) return;
    const body = src.substring(src.indexOf('function ' + fn + '('));
    assert.match(body.substring(0, body.indexOf('\n}\n')), /hubApi_\('(viewer|operator|admin)'/, fn);
  });
});

test('jeder onclick-Handler ist in App exportiert', () => {
  const exported = app.substring(app.lastIndexOf('return {')).match(/(\w+):/g).map((x) => x.slice(0, -1));
  [...new Set([...(app + shell).matchAll(/App\.(\w+)\(/g)].map((m) => m[1]))].forEach((fn) => assert.ok(exported.includes(fn), 'App.' + fn));
});

test('alle i18n-Schluessel existieren in DE und EN', () => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'ui', 'i18n.js'), 'utf8'), ctx);
  const keys = new Set([...(app + shell).matchAll(/(?:data-i18n="|(?<![\w.])t\(')(\w+)/g)].map((m) => m[1]));
  keys.add('role_admin');
  ['pending', 'approved', 'rejected', 'mqm', 'benchmark', 'drift', 'glossary'].forEach((k) => keys.add(k));
  keys.forEach((k) => {
    if (k.endsWith('_')) return;
    assert.ok(ctx.I18N[k] && ctx.I18N[k][0] && ctx.I18N[k][1], 'fehlt/unvollstaendig: ' + k);
  });
});

test('Vorschau-Backend kennt jede aufgerufene API', () => {
  const mock = fs.readFileSync(path.join(ROOT, 'tools', 'mock-backend.js'), 'utf8');
  called.forEach((fn) => assert.match(mock, new RegExp('\\b' + fn + ':'), 'Mock fehlt: ' + fn));
});

test('doGet laedt weiterhin Index als eine Datei (keine Includes noetig)', () => {
  const code = fs.readFileSync(path.join(SRC, 'Code.gs'), 'utf8');
  assert.match(code, /createHtmlOutputFromFile\('Index'\)/);
  assert.doesNotMatch(fs.readFileSync(path.join(SRC, 'Index.html'), 'utf8'), /<\?/);
});
