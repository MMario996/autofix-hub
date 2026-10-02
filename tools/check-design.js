#!/usr/bin/env node
'use strict';
// Design-Waechter: Die Hubs sind in Google Sites eingebettet und sehen aus
// wie Terminologie-Hub und Translation Services.
//   - keine Icon-Schriften (Material Icons), keine Logos/Bilder, keine Emojis
//   - keine externen Stylesheets oder Skripte
//   - gemeinsame Design-Tokens vorhanden
//   - mit --other=<pfad>: gemeinsames Basis-Stylesheet ist in beiden Hubs gleich
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const UI_FILES = ['ui/shell.html', 'ui/base.css', 'ui/app.css', 'ui/app.js', 'ui/i18n.js'];
const BASE_CSS = 'ui/base.css';
const OTHER_BASE = 'src/Styles.html';

const FORBIDDEN = [
  { re: /material-icons|Material\+Icons|Material Icons/i, msg: 'Icon-Schrift (Material Icons)' },
  { re: /fonts\.googleapis\.com\/icon/i, msg: 'Icon-Schrift von Google Fonts' },
  { re: /<img\b|<svg\b|\.png\b|\.svg\b|data:image\//i, msg: 'Bild/Logo' },
  { re: /<link[^>]+stylesheet[^>]+https?:/i, msg: 'externes Stylesheet' },
  { re: /<script[^>]+src=["']https?:/i, msg: 'externes Skript' },
  { re: /\bbrand-mark\b|\bclass="brand\b/i, msg: 'Logo-/Titelleiste' },
  { re: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2705}\u{274C}]/u, msg: 'Emoji/Piktogramm' }
];
const TOKENS = ['--wash: #f4f4f0', '--yellow: #FFED00', '--fill: linear-gradient(135deg, #FFED00 0%, #FFD500 100%)', '--r-lg: 18px', '"Helvetica Neue", Helvetica, Arial, sans-serif'];

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function baseOf(text) { return text.includes('<style>') ? text.split('<style>')[1].split('</style>')[0].trim() : text.trim(); }

let errors = 0;
UI_FILES.forEach((f) => {
  read(f).split('\n').forEach((line, i) => {
    FORBIDDEN.forEach((rule) => {
      if (rule.re.test(line)) { errors++; console.error(f + ':' + (i + 1) + '  ' + rule.msg + ': ' + line.trim().substring(0, 120)); }
    });
  });
});
const base = baseOf(read(BASE_CSS));
TOKENS.forEach((tok) => { if (!base.includes(tok)) { errors++; console.error(BASE_CSS + ': Design-Token fehlt: ' + tok); } });

const otherArg = process.argv.find((a) => a.startsWith('--other='));
if (otherArg) {
  const other = path.resolve(otherArg.slice(8), OTHER_BASE);
  if (!fs.existsSync(other)) { errors++; console.error('Vergleichsdatei fehlt: ' + other); }
  else if (baseOf(fs.readFileSync(other, 'utf8')) !== base) {
    errors++;
    console.error('Gemeinsames Basis-Design weicht ab: ' + BASE_CSS + ' <> ' + other + '. Beide Hubs muessen dieselbe Basis nutzen.');
  } else console.log('Basis-Design identisch mit ' + other);
}

if (errors) { console.error('\n' + errors + ' Design-Verstoss/Verstoesse.'); process.exit(1); }
console.log('Design OK (' + UI_FILES.length + ' Oberflaechen-Dateien, keine Icons/Logos, Tokens vorhanden).');
