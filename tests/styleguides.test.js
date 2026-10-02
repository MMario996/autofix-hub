'use strict';
// Styleguides im Prompt Editor: Bibliothek, Rechte, Zuordnung zu Prompt
// Spaces und Wirkung im Prompt, den AutoFix an Gemini schickt.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGas } = require('./lib/gas');
const { makeServices, autofixSheet } = require('./lib/fakes');

const DB = 'AFDB';
const ADMIN = 'admin@karcher.com';
const plain = (x) => JSON.parse(JSON.stringify(x));

function setup() {
  const { services, state } = makeServices({ activeUser: ADMIN });
  state.spreadsheets[DB] = autofixSheet(DB, { peInstructions_technical: 'TECHNIK-PROMPT', peInstructions_marketing: 'MARKETING-PROMPT' });
  state.scriptProps.AUTOFIX_DB_SHEET_ID = DB;
  state.scriptProps.PROMPT_EDITOR_ADMINS = JSON.stringify([ADMIN]);
  state.scriptProps.PROMPT_EDITOR_USERS = JSON.stringify([
    { email: 'lena@karcher.com', types: ['marketing'], canManageSettings: false },
    { email: 'max@karcher.com', types: ['marketing'], canManageSettings: false }
  ]);
  const G = loadGas(services);
  const as = (e) => { state.activeUser = e; G.styleguideCache_ = null; };
  const prompt = (type) => G.buildPePrompt_(G.getSettings_(), 'de_de', 'en_us', [{ id: 's1', source: 'x', target: 'x', tmMatches: [], tbHits: [] }], null, type);
  return { G, state, as, prompt };
}
function ok(r) { assert.equal(r.success, true, r.error || JSON.stringify(r)); return r; }

test('Ohne Styleguides bleibt der Prompt genau wie bisher', () => {
  const { prompt } = setup();
  assert.match(prompt('technical'), /=== PE-ANWEISUNGEN ===\nTECHNIK-PROMPT\n\n=== TERMBASE/);
});

test('Anlegen, Zuordnen, Wirkung im AutoFix-Prompt', () => {
  const { G, as, prompt, state } = setup();
  as('lena@karcher.com');
  assert.equal(G.apiPromptEditorSaveStyleguide({ name: '', content: 'x' }).success, false, 'Name ist Pflicht');
  assert.equal(G.apiPromptEditorSaveStyleguide({ name: 'Leer', content: '  ' }).success, false, 'Inhalt ist Pflicht');
  const r = ok(G.apiPromptEditorSaveStyleguide({ name: 'Du-Form', description: 'Kampagnen', content: '# Anrede\r\n```\n- Wir duzen.\n```\n=== kaputt', types: ['marketing', 'technical'] }));
  const g = r.styleguides[0];
  assert.equal(g.content, '# Anrede\n- Wir duzen.\n– == kaputt', 'Code-Zäune und === entschärft');
  assert.deepEqual(plain(g.types), ['marketing'], 'nur Spaces, die Lena bearbeiten darf');
  assert.equal(g.canEdit, true);
  assert.ok(state.spreadsheets[DB].getSheetByName('Styleguides'), 'eigener Tab im Datenbank-Sheet');

  assert.match(prompt('marketing'), /MARKETING-PROMPT\n\n=== STYLEGUIDE: Du-Form ===\n# Anrede\n- Wir duzen\.\n– == kaputt\n\n=== TERMBASE/);
  assert.doesNotMatch(prompt('technical'), /STYLEGUIDE/);
  assert.equal(G.getSettings_().peInstructions_marketing, 'MARKETING-PROMPT', 'gespeicherter Prompt bleibt unverändert');

  // Zuordnung über die Prompt-Karte
  assert.equal(G.apiPromptEditorSetTypeStyleguides('technical', [g.id]).success, false, 'fremder Space');
  ok(G.apiPromptEditorSetTypeStyleguides('marketing', []));
  assert.doesNotMatch(prompt('marketing'), /STYLEGUIDE/);
  ok(G.apiPromptEditorSetTypeStyleguides('marketing', [g.id]));
  assert.match(prompt('marketing'), /STYLEGUIDE: Du-Form/);
});

test('Rechte: ändern/löschen nur Ersteller oder Admin; Admin kann "alle" zuordnen', () => {
  const { G, as, prompt } = setup();
  as('lena@karcher.com');
  const g = ok(G.apiPromptEditorSaveStyleguide({ name: 'Du-Form', content: 'Wir duzen.', types: ['marketing'] })).styleguides[0];
  as('max@karcher.com');
  assert.equal(ok(G.apiPromptEditorGetStyleguides()).styleguides[0].canEdit, false);
  assert.equal(G.apiPromptEditorSaveStyleguide({ id: g.id, name: 'Du-Form', content: 'neu' }).success, false);
  assert.equal(G.apiPromptEditorDeleteStyleguide(g.id).success, false);
  assert.equal(G.apiPromptEditorSaveStyleguide({ name: 'du-form', content: 'x' }).success, false, 'Name eindeutig');
  as('fremd@karcher.com');
  assert.equal(G.apiPromptEditorGetStyleguides().success, false, 'nicht freigeschaltet');
  assert.equal(G.apiPromptEditorSaveStyleguide({ name: 'X', content: 'y' }).success, false);

  as(ADMIN);
  ok(G.apiPromptEditorSaveStyleguide({ id: g.id, name: 'Du-Form', content: 'Wir duzen immer.', types: ['*'] }));
  assert.match(prompt('technical'), /=== STYLEGUIDE: Du-Form ===\nWir duzen immer\./, '"alle" wirkt in jedem Space');
  // Lena entfernt marketing: "*" bleibt erhalten, weil sie es nicht setzen darf
  as('lena@karcher.com');
  ok(G.apiPromptEditorSaveStyleguide({ id: g.id, name: 'Du-Form', content: 'Wir duzen immer.', types: [] }));
  as(ADMIN);
  assert.deepEqual(plain(ok(G.apiPromptEditorGetStyleguides()).styleguides[0].types), ['*']);
  ok(G.apiPromptEditorDeleteStyleguide(g.id));
  assert.equal(ok(G.apiPromptEditorGetStyleguides()).styleguides.length, 0);
  assert.doesNotMatch(prompt('technical'), /STYLEGUIDE/);
});

test('Ein kaputter Styleguide-Tab bricht keinen Lauf ab', () => {
  const { G, state, prompt } = setup();
  state.spreadsheets[DB].getSheetByName = () => { throw new Error('Sheet weg'); };
  assert.equal(G.appendStyleguides_('PROMPT', 'technical'), 'PROMPT');
  assert.ok(prompt);
});

test('Styleguides werden in der Reihenfolge des Namens angehängt, Zellen sind formelsicher', () => {
  const { G, as, prompt, state } = setup();
  as(ADMIN);
  ok(G.apiPromptEditorSaveStyleguide({ name: 'Zahlen', content: '- 1.000 statt 1000', types: ['technical'] }));
  ok(G.apiPromptEditorSaveStyleguide({ name: 'Anrede', content: '=Sie-Form', types: ['technical'] }));
  as(ADMIN);
  const p = prompt('technical');
  assert.ok(p.indexOf('STYLEGUIDE: Anrede') < p.indexOf('STYLEGUIDE: Zahlen'));
  assert.match(p, /=== STYLEGUIDE: Anrede ===\n=Sie-Form/);
  const rows = state.spreadsheets[DB].getSheetByName('Styleguides').rows;
  assert.deepEqual(plain(rows[0]), ['id', 'name', 'description', 'content', 'types', 'updatedAt', 'updatedBy', 'createdBy']);
});
