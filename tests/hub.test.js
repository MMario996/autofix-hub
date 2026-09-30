'use strict';
// Oberflaechen-API von AutoFix Hub gegen simulierte Google-Dienste:
// Rollen, offener Modus, Schutz der bestehenden Funktionen, Antraege,
// zeilengenaues Speichern der Settings, wirksame Gemini-Werte.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGas } = require('./lib/gas');
const { makeServices, autofixSheet } = require('./lib/fakes');

const DB = 'AFDB';
const ADMIN = 'admin@karcher.com';
const plain = (x) => JSON.parse(JSON.stringify(x));

function setup(opts) {
  opts = opts || {};
  const { services, state } = makeServices({ activeUser: ADMIN });
  state.spreadsheets[DB] = autofixSheet(DB, Object.assign({
    primaryModel: 'gemini-3.6-flash', peTemperature: '0.1', maxTokens: '32768', cfFieldUid: '1uw8kvE6WNhT6Gw0XeX4Z4', wfStepName: 'PE Gemini',
    peInstructions_technical: '=== MEIN TECHNIK-PROMPT ===', peInstructions_marketing: 'MARKETING', geminiModel_marketing: 'gemini-3.5-flash'
  }, opts.settings || {}));
  state.spreadsheets[DB].getSheetByName('Run Log').appendRow(['Timestamp', 'Project UID', 'Project Name', 'Job UID', 'Target Lang', 'Success', 'Total', 'Changed', 'Model', 'Msg', 'Changes', 'Type']);
  state.spreadsheets[DB].getSheetByName('Audit Log').appendRow(['Timestamp', 'Action', 'Details']);
  state.scriptProps.AUTOFIX_DB_SHEET_ID = DB;
  if (opts.legacyAdmins) state.scriptProps.PROMPT_EDITOR_ADMINS = JSON.stringify(opts.legacyAdmins);
  const G = loadGas(services);
  const as = (e) => { state.activeUser = e; };
  const rows = () => { const o = {}; state.spreadsheets[DB].getSheetByName('Settings').rows.slice(1).forEach((r) => { o[r[0]] = r[1]; }); return o; };
  return { G, state, as, rows };
}
function ok(r) { assert.equal(r.success, true, r.error || JSON.stringify(r)); return r; }

test('Offener Modus ohne Admins: alle duerfen alles, Hinweis wird gemeldet', () => {
  const { G, as } = setup();
  as('irgendwer@karcher.com');
  const b = ok(G.apiHubBootstrap());
  assert.equal(b.openMode, true);
  assert.equal(b.role, 'admin');
  ok(G.apiHubAdminState());
});

test('Admins werden aus dem alten Prompt Editor uebernommen', () => {
  const { G, as } = setup({ legacyAdmins: ['Admin@karcher.com'] });
  const b = ok(G.apiHubBootstrap());
  assert.equal(b.openMode, false);
  assert.equal(b.role, 'admin');
  as('fremd@karcher.com');
  const f = ok(G.apiHubBootstrap());
  assert.equal(f.authorized, false);
  assert.equal(G.apiHubDashboard().success, false);
});

test('Rollen: Ansehen darf lesen, aber nicht starten; Ausfuehren darf starten, aber nicht administrieren', () => {
  const { G, as, state } = setup({ legacyAdmins: [ADMIN] });
  ok(G.apiHubAdminSaveUser({ email: 'view@karcher.com', role: 'viewer' }));
  ok(G.apiHubAdminSaveUser({ email: 'op@karcher.com', role: 'operator' }));

  as('view@karcher.com');
  ok(G.apiHubDashboard());
  ok(G.apiHubRunLogs());
  ok(G.apiHubPrompts());
  assert.match(G.apiHubRunNow().error, /Berechtigung/);
  assert.match(G.apiHubPollerStart(10).error, /Berechtigung/);
  assert.match(G.apiHubMqm({}).error, /Berechtigung/);
  // auch der direkte Aufruf der bestehenden Funktionen ist geschuetzt
  assert.match(G.runNow().error, /Berechtigung/);
  assert.match(G.replayChangesForJob('a', 'b', '[]').error, /Berechtigung/);
  assert.match(G.setupAutoFixTrigger(5).error, /Berechtigung/);
  assert.equal(state.triggers.length, 0);

  as('op@karcher.com');
  ok(G.apiHubPollerStart(10));
  assert.deepEqual(plain(state.triggers), ['autoFixPoller']);
  assert.equal(state.triggerMinutes, 10);
  assert.equal(G.apiHubPollerStart(7).success, false, 'nur erlaubte Intervalle');
  ok(G.apiHubPollerStop());
  assert.equal(state.triggers.length, 0);
  assert.match(G.apiHubAdminState().error, /Berechtigung/);
  assert.match(G.forceUnlock().error, /Berechtigung/, 'Run-Sperre nur fuer Admins');
  assert.match(G.recreateDatabase().error, /Berechtigung/);
});

test('Trigger laufen weiter: autoFixPoller ist nicht an eine Rolle gebunden', () => {
  const { G } = setup({ legacyAdmins: [ADMIN] });
  const src = G.autoFixPoller.toString();
  assert.doesNotMatch(src, /hubDenied_/);
});

test('Antrag -> Freigabe mit angepasster Rolle -> Zugriff', () => {
  const { G, as, state } = setup({ legacyAdmins: [ADMIN] });
  as('neu@karcher.com');
  assert.equal(G.apiHubRequestAccess('operator', '').success, false, 'Begruendung ist Pflicht');
  assert.equal(G.apiHubRequestAccess('admin', 'x').success, false, 'Admin kann man nicht beantragen');
  ok(G.apiHubRequestAccess('operator', 'Betreue PL'));
  assert.equal(G.apiHubRequestAccess('viewer', 'nochmal').success, false, 'nur ein offener Antrag');
  assert.ok(state.mails.some((m) => /Zugriffsantrag/.test(m.subject)));
  as(ADMIN);
  const st = ok(G.apiHubAdminState());
  const req = st.requests.find((r) => r.email === 'neu@karcher.com');
  ok(G.apiHubAdminDecide(req.id, true, 'viewer', 'erstmal lesen'));
  assert.equal(G.apiHubAdminDecide(req.id, true, 'viewer', '').success, false);
  assert.ok(state.mails.some((m) => m.to === 'neu@karcher.com' && /freigegeben/.test(m.subject)));
  as('neu@karcher.com');
  assert.equal(ok(G.apiHubBootstrap()).role, 'viewer');
});

test('Settings: nur geaenderte Zeilen, Prompts bleiben erhalten (alter Fehler der UI)', () => {
  const { G, rows } = setup({ legacyAdmins: [ADMIN] });
  const before = rows();
  const r = ok(G.apiHubAdminSaveSettings({ wfStepName: 'PE Gemini 2', peTemperature: '0.2', maxTokens: '16384', markDoneAfterFix: 'false' }));
  assert.deepEqual(plain(r.saved).sort(), ['markDoneAfterFix', 'maxTokens', 'peTemperature', 'wfStepName']);
  const after = rows();
  assert.equal(after.wfStepName, 'PE Gemini 2');
  assert.equal(after.peTemperature, '0.2');
  assert.equal(after.maxTokens, '16384');
  assert.equal(after.markDoneAfterFix, 'false');
  assert.equal(after.peInstructions_technical, before.peInstructions_technical, 'Prompt unveraendert');
  assert.equal(after.peInstructions_marketing, 'MARKETING');
  assert.equal(after.geminiModel_marketing, 'gemini-3.5-flash');
  assert.equal(G.apiHubAdminSaveSettings({ peTemperature: '0' }).success, false, '0 liest AutoFix als nicht gesetzt');
  assert.equal(G.apiHubAdminSaveSettings({ primaryModel: 'gpt-5' }).success, false);
  assert.equal(G.apiHubAdminSaveSettings({ cfFieldUid: 'x y' }).success, false);
});

test('Wirksame Gemini-Werte und wirkungslose Space-Werte', () => {
  const { G } = setup({ legacyAdmins: [ADMIN], settings: { peTemperature: '0.4', maxTokens: 'abc' } });
  const e = ok(G.apiHubPrompts()).effective;
  assert.equal(e.model, 'gemini-3.6-flash');
  assert.equal(e.temperature, 0.4);
  assert.equal(e.maxTokens, 32768);
  assert.deepEqual(plain(e.ignoredOverrides), ['geminiModel_marketing']);
  assert.equal(e.batchSize, 25);
  assert.equal(e.singleBatchMax, 60);
});

test('Prompts-Ansicht zeigt Herkunft und Fallback', () => {
  const { G, state } = setup({ legacyAdmins: [ADMIN] });
  const tab = state.spreadsheets[DB].insertSheet('Prompt Spaces');
  [['type', 'label', 'example', 'active'], ['p_d_dialogue', 'P&D Dialogue', '', 'true']].forEach((r) => tab.appendRow(r));
  const list = ok(G.apiHubPrompts()).prompts;
  const pnd = list.find((p) => p.type === 'p_d_dialogue');
  assert.equal(pnd.managedByPromptHub, true);
  assert.equal(pnd.usesFallback, true, 'noch kein eigener Prompt');
  // AutoFix nimmt dann den fest im Code hinterlegten Standard, nicht den technischen Prompt aus dem Sheet
  assert.equal(pnd.text, G.DEFAULT_PROMPTS_.technical);
  assert.equal(list.find((p) => p.type === 'technical').usesFallback, false);
  assert.equal(list.find((p) => p.type === 'technical').managedByPromptHub, false);
});

test('Konfiguration wird bereinigt', () => {
  const { G } = setup({ legacyAdmins: [ADMIN] });
  assert.equal(G.apiHubAdminSaveConfig({ promptHubUrl: 'http://unsicher' }).success, false);
  assert.equal(G.apiHubAdminSaveConfig({ chatWebhookUrl: 'https://evil.example/x' }).success, false);
  const c = ok(G.apiHubAdminSaveConfig({ promptHubUrl: 'https://script.google.com/x/exec', notifyEmails: 'a@karcher.com; kaputt', allowedModels: ['gemini-3.6-flash', 'bad model!'] })).config;
  assert.equal(c.promptHubUrl, 'https://script.google.com/x/exec');
  assert.deepEqual(plain(c.notifyEmails), ['a@karcher.com']);
  assert.deepEqual(plain(c.allowedModels), ['gemini-3.6-flash']);
});

test('Letzter Admin bleibt; erster Admin im offenen Modus sperrt sich nicht aus', () => {
  const { G } = setup();
  ok(G.apiHubAdminSetAdmin('chef@karcher.com', true));
  const st = ok(G.apiHubAdminState());
  assert.deepEqual(plain(st.admins).sort(), ['admin@karcher.com', 'chef@karcher.com']);
  ok(G.apiHubAdminSetAdmin('chef@karcher.com', false));
  assert.equal(G.apiHubAdminSetAdmin(ADMIN, false).success, false);
});

test('Dashboard-Kennzahlen aus dem Run Log', () => {
  const { G, state } = setup({ legacyAdmins: [ADMIN] });
  const log = state.spreadsheets[DB].getSheetByName('Run Log');
  const now = new Date().toISOString();
  log.appendRow([now, 'P1', 'Projekt A', 'J1', 'de_de', 'TRUE', 100, 10, 'm', '', '[]', 'technical']);
  log.appendRow([now, 'P1', 'Projekt A', 'J2', 'it_it', 'FALSE', 50, 0, 'm', 'Fehler', '', 'technical']);
  log.appendRow(['2020-01-01T00:00:00Z', 'P0', 'Alt', 'J0', 'fr_fr', 'TRUE', 10, 1, 'm', '', '', 'marketing']);
  const d = ok(G.apiHubDashboard());
  assert.equal(d.week.jobs, 2);
  assert.equal(d.week.failed, 1);
  assert.equal(d.week.segments, 150);
  assert.equal(d.week.changed, 10);
  assert.equal(d.week.changeRate, 6.7);
  assert.equal(d.recent.length, 3);
});
