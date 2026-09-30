'use strict';
// Browser-Tests der echten Oberflaeche (Index.html) mit dem Vorschau-Backend.
// Lokal: CHROMIUM_PATH=/pfad/zu/chrome npm run test:ui
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { build } = require('../tools/build-preview');

const TMP = path.join(__dirname, '..', 'preview');
let browser;

test.before(async () => { browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}); });
test.after(async () => { if (browser) await browser.close(); });

async function open(scenario, opts) {
  fs.mkdirSync(TMP, { recursive: true });
  const file = path.join(TMP, 'ui-' + scenario + '.html');
  fs.writeFileSync(file, build(scenario));
  const ctx = await browser.newContext({ viewport: (opts && opts.viewport) || { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto('file://' + file);
  await page.waitForSelector('#tabNav:not(.hidden), #tab-denied .denied');
  return page;
}
const visibleTabs = (p) => p.$$eval('.tab-btn:not(.hidden)', (b) => b.map((x) => x.getAttribute('data-tab')));

test('Ansehen: Dashboard ohne Start-Knoepfe, kein Admin-Tab', async () => {
  const p = await open('viewer');
  await p.waitForSelector('.kpi-grid');
  assert.deepEqual(await visibleTabs(p), ['dashboard', 'liverun', 'queue', 'runlog', 'analysis', 'prompts', 'help']);
  assert.equal(await p.$('button:has-text("AutoFix jetzt starten")'), null);
  assert.equal(await p.$('button:has-text("10 Min")'), null);
  await p.click('#tabbtn-runlog');
  await p.waitForSelector('#logTable table');
  assert.equal(await p.$('#logTable button:has-text("Re-Push")'), null);
  assert.deepEqual(p.errors, []);
});

test('Ausfuehren: Lauf starten, Fortschritt im Live-Run', async () => {
  const p = await open('operator');
  await p.waitForSelector('.kpi-grid');
  await p.click('button:has-text("AutoFix jetzt starten")');
  await p.waitForSelector('.run-dot.done');
  const log = await p.textContent('#lrConsole');
  assert.match(log, /PnD_Mails_DE\.xlf/);
  assert.match(log, /Übersprungen/);
  assert.equal(await p.textContent('#tab-liverun .kpi:nth-child(2) .kpi-val'), '4/4');
  assert.deepEqual(p.errors, []);
});

test('Run Log: Filter, Diff und Re-Push', async () => {
  const p = await open('operator');
  await p.click('#tabbtn-runlog');
  await p.waitForSelector('#logTable table');
  await p.selectOption('#tab-runlog select >> nth=0', 'fail');
  assert.match(await p.textContent('#logCount'), /^1 \/ 7$/);
  await p.selectOption('#tab-runlog select >> nth=0', 'all');
  await p.fill('#logQ', 'Spring');
  assert.match(await p.textContent('#logCount'), /^1 \/ 7$/);
  await p.fill('#logQ', '');
  await p.click('#logTable .row-toggle >> nth=0');
  assert.ok(await p.$('#logTable .diff-ins'), 'Korrektur hervorgehoben');
  await p.click('#logTable button:has-text("Re-Push") >> nth=0');
  assert.equal(await p.inputValue('#rpJob'), 'GlJLRo1Iqgmfuikg0gwPJf');
  await p.click('#rpGo');
  await p.waitForSelector('#rpResult .notice.ok');
  assert.deepEqual(p.errors, []);
});

test('Analysen: MQM-Report und Unterbereiche', async () => {
  const p = await open('operator');
  await p.click('#tabbtn-analysis');
  await p.click('#tab-analysis button:has-text("Erzeugen") >> nth=0');
  await p.waitForSelector('#anResult .kpi-grid');
  assert.match(await p.textContent('#anResult'), /Terminology/);
  await p.click('.sub-nav button:has-text("Benchmark")');
  assert.equal(await p.$('#an-projectName'), null, 'Benchmark hat keinen Projektfilter');
  await p.click('#tab-analysis button:has-text("Erzeugen") >> nth=0');
  await p.waitForSelector('#anResult table');
  assert.match(await p.textContent('#anResult tbody tr:first-child'), /es_es/i);
  assert.deepEqual(p.errors, []);
});

test('Prompts: nur lesen, Link in den Prompt Hub', async () => {
  const p = await open('viewer');
  await p.click('#tabbtn-prompts');
  await p.waitForSelector('.space-grid');
  assert.equal(await p.$$eval('.space-tile', (t) => t.length), 4);
  const href = await p.getAttribute('.space-tile:nth-child(3) a', 'href');
  assert.match(href, /PROMPT-HUB\/exec#p_d_dialogue$/);
  assert.equal(await p.$('#tab-prompts textarea'), null, 'nicht editierbar');
});

test('Admin: Antrag freigeben und Einstellung speichern', async () => {
  const p = await open('admin');
  assert.equal(await p.textContent('#adminCount'), '1');
  await p.click('#tabbtn-admin');
  await p.waitForSelector('#tab-admin .admin-grid');
  await p.click('button:has-text("Freigeben")');
  await p.waitForSelector('#tab-admin td b:has-text("anna.nowak@karcher.com")');
  await p.fill('#st-maxTokens', '16384');
  await p.click('#tab-admin button:has-text("Speichern") >> nth=0');
  await p.waitForFunction(() => /1 Wert/.test(document.getElementById('toast').textContent));
  assert.deepEqual(p.errors, []);
});

test('Kein Zugriff: Antrag in der App', async () => {
  const p = await open('denied');
  await p.click('button:has-text("Absenden")');
  await p.waitForSelector('#toast.show');
  assert.match(await p.textContent('#toast'), /begründen/);
  await p.fill('#rqReason', 'Berichte ansehen');
  await p.click('button:has-text("Absenden")');
  await p.waitForSelector('#tab-denied .status-badge:has-text("Offen")');
});

test('Offener Modus zeigt Hinweis; Sprache und Dark Mode', async () => {
  const p = await open('open');
  assert.equal(await p.isVisible('#openModeBanner'), true);
  await p.click('.lang-btn[data-lang="en"]');
  assert.equal(await p.textContent('#tabbtn-queue'), 'Queue');
  await p.click('#themeBtn');
  assert.equal(await p.getAttribute('html', 'data-theme'), 'dark');
  assert.deepEqual(p.errors, []);
});

test('Mobil: kein horizontales Scrollen', async () => {
  for (const tab of ['dashboard', 'runlog', 'analysis', 'admin']) {
    const p = await open('admin', { viewport: { width: 390, height: 844 } });
    await p.click('#tabbtn-' + tab);
    await p.waitForTimeout(200);
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, tab + ': Ueberlauf ' + overflow + 'px');
  }
});
