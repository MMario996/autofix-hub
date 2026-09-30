#!/usr/bin/env node
'use strict';
// Mockups in docs/mockups/ aus der echten Oberflaeche mit Beispieldaten. Aufruf: npm run mockups
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { build } = require('./build-preview');

const OUT = path.join(__dirname, '..', 'docs', 'mockups');
const TMP = path.join(__dirname, '..', 'preview');

async function open(browser, scenario, opts) {
  fs.mkdirSync(TMP, { recursive: true });
  const file = path.join(TMP, scenario + '.html');
  fs.writeFileSync(file, build(scenario));
  const ctx = await browser.newContext({ viewport: (opts && opts.viewport) || { width: 1480, height: 1000 }, colorScheme: opts && opts.dark ? 'dark' : 'light', ignoreHTTPSErrors: !!process.env.IGNORE_HTTPS_ERRORS });
  const p = await ctx.newPage();
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(e.message));
  await p.goto('file://' + file);
  await p.waitForSelector('#tabNav:not(.hidden), #tab-denied .denied');
  return p;
}

async function shot(p, name, full) {
  fs.mkdirSync(OUT, { recursive: true });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForFunction(() => { const s = document.querySelector('.material-icons-outlined'); return !s || getComputedStyle(s).fontFamily.indexOf('Material') === -1 || document.fonts.check('24px "Material Icons Outlined"'); }, null, { timeout: 15000 }).catch(() => console.warn('  (Icon-Schrift nicht geladen)'));
  await p.evaluate(() => document.fonts.load('24px "Material Icons Outlined"')).catch(() => {});
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(OUT, name + '.png'), fullPage: !!full });
  console.log('  ' + name + '.png');
}

async function main() {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const errors = [];
  try {
    let p = await open(browser, 'operator');
    await p.waitForSelector('.kpi-grid');
    await shot(p, '01-dashboard');
    await p.click('#tabbtn-liverun');
    await p.click('#lrRunBtn');
    await p.waitForSelector('.run-dot.done');
    await shot(p, '02-live-run');
    await p.click('#tabbtn-queue');
    await p.waitForSelector('#tab-queue table');
    await shot(p, '03-warteschlange');
    await p.click('#tabbtn-runlog');
    await p.waitForSelector('#logTable table');
    await p.click('#logTable .row-toggle >> nth=0');
    await shot(p, '04-run-log');
    await p.click('#logTable button:has-text("Re-Push") >> nth=0');
    await shot(p, '05-re-push');
    await p.click('#dialog button:has-text("Abbrechen")');
    await p.click('#tabbtn-analysis');
    await p.click('button:has-text("Erzeugen") >> nth=0');
    await p.waitForSelector('#anResult .kpi-grid');
    await shot(p, '06-analysen-mqm');
    await p.click('.sub-nav button:has-text("Term-Drift")');
    await p.click('button:has-text("Erzeugen") >> nth=0');
    await p.waitForSelector('#anResult table');
    await shot(p, '07-analysen-drift');
    await p.click('#tabbtn-prompts');
    await p.waitForSelector('.space-grid');
    await shot(p, '08-prompts');
    errors.push(...p.errors);

    p = await open(browser, 'admin');
    await p.click('#tabbtn-admin');
    await p.waitForSelector('#tab-admin .admin-grid');
    await shot(p, '09-admin', true);
    errors.push(...p.errors);

    p = await open(browser, 'denied');
    await shot(p, '10-kein-zugriff');
    errors.push(...p.errors);

    p = await open(browser, 'viewer', { dark: true });
    await p.waitForSelector('.kpi-grid');
    await shot(p, '11-dark-mode-ansehen');
    errors.push(...p.errors);

    p = await open(browser, 'operator', { viewport: { width: 390, height: 844 } });
    await p.waitForSelector('.kpi-grid');
    await shot(p, '12-mobil');
    errors.push(...p.errors);
  } finally {
    await browser.close();
  }
  if (errors.length) { console.error('JS-Fehler:\n' + errors.join('\n')); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
