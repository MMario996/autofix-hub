// =====================================================================
// STYLEGUIDES FUER DEN PROMPT EDITOR (Styleguides.gs)
//
// Ein Prompt sagt, WAS Gemini tun soll (Aufgabe, Regeln, Nomenklatur).
// Ein Styleguide sagt, WIE das Ergebnis klingen und aussehen soll
// (Anrede, Tonalitaet, Schreibweisen) und gilt fuer beliebig viele
// Prompt Spaces.
//
// Gespeichert im Datenbank-Sheet, Tab "Styleguides" (eine Zeile je
// Styleguide). Spalte "types" sagt, fuer welche Prompt Spaces er gilt
// (kommagetrennt, "*" = alle). Der Text in peInstructions_<type> bleibt
// unveraendert; AutoFix haengt die Styleguides erst beim Bauen des
// Prompts an (buildPePrompt_ -> appendStyleguides_). Dadurch wirken
// Aenderungen am Styleguide sofort in allen zugeordneten Spaces, im
// naechsten Lauf und im Test des Prompt Editors.
// =====================================================================

var STYLEGUIDE_TAB_   = 'Styleguides';
var STYLEGUIDE_COLS_  = ['id', 'name', 'description', 'content', 'types', 'updatedAt', 'updatedBy', 'createdBy'];
var STYLEGUIDE_LIMIT_ = 15000;
var styleguideCache_  = null; // je Ausfuehrung einmal lesen (ein Lauf baut viele Batches)

function styleguideSheet_(create) {
  var ss = getDbSheet_();
  var sh = ss.getSheetByName(STYLEGUIDE_TAB_);
  if (!sh && create) {
    sh = ss.insertSheet(STYLEGUIDE_TAB_);
    sh.getRange(1, 1, 1, STYLEGUIDE_COLS_.length).setValues([STYLEGUIDE_COLS_]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function unescapeStyleguideCell_(v) {
  v = v === undefined || v === null ? '' : String(v);
  return (v.length > 1 && v.charAt(0) === "'" && /[=+\-@*#]/.test(v.charAt(1))) ? v.substring(1) : v;
}

function readStyleguides_() {
  var sh = styleguideSheet_(false);
  if (!sh) return [];
  var rows = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (!r[0]) continue;
    var g = {};
    STYLEGUIDE_COLS_.forEach(function (c, j) { g[c] = unescapeStyleguideCell_(r[j]); });
    g.types = g.types ? g.types.split(',').map(function (x) { return x.trim(); }).filter(Boolean) : [];
    g._row = i + 1;
    out.push(g);
  }
  return out;
}

function writeStyleguide_(sh, g) {
  var row = STYLEGUIDE_COLS_.map(function (c) {
    var v = c === 'types' ? (g.types || []).join(',') : (g[c] || '');
    return escapeSheetValue_(String(v));
  });
  if (g._row) sh.getRange(g._row, 1, 1, row.length).setValues([row]);
  else sh.appendRow(row);
}

function styleguidesForType_(list, type) {
  return list.filter(function (g) { return g.types.indexOf('*') !== -1 || g.types.indexOf(type) !== -1; })
    .sort(function (a, b) { return a.name.localeCompare(b.name); });
}

// Wird von buildPePrompt_ (Code.gs) aufgerufen. Darf einen Lauf nie
// abbrechen: bei einem Fehler bleibt der Prompt wie er ist.
function appendStyleguides_(instructions, autoFixType) {
  try {
    if (!styleguideCache_) styleguideCache_ = readStyleguides_();
    var list = styleguidesForType_(styleguideCache_, autoFixType || 'technical');
    if (!list.length) return instructions;
    return instructions + list.map(function (g) {
      return '\n\n=== STYLEGUIDE: ' + g.name + ' ===\n' + g.content.trim();
    }).join('');
  } catch (e) {
    try { Logger.log('[Styleguides] ' + e.message); } catch (e2) {}
    return instructions;
  }
}

// Markdown so vorbereiten, dass es den Prompt nicht zerbricht:
// Code-Zaeune raus (das Ausgabeformat legt AutoFix fest), "===" am
// Zeilenanfang entschaerfen (reserviert fuer Abschnittsueberschriften).
function cleanStyleguideText_(text) {
  return String(text || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
    .replace(/^[ \t]*```.*(\n|$)/gm, '')
    .replace(/^(\s*)===/gm, '$1– ==')
    .replace(/\n{3,}/g, '\n\n').replace(/^\n+|\s+$/g, '');
}

function styleguideView_(g, email) {
  return {
    id: g.id, name: g.name, description: g.description, content: g.content, types: g.types,
    updatedAt: g.updatedAt, updatedBy: g.updatedBy, createdBy: g.createdBy,
    canEdit: isPromptEditorAdmin_(email) || (!!email && g.createdBy === email)
  };
}

// ---------------------------------------------------------------------
// API fuer den Prompt Editor
// ---------------------------------------------------------------------
function apiPromptEditorGetStyleguides() {
  var email = getCurrentUserEmail_();
  if (!isPromptEditorWhitelisted_(email)) return { success: false, error: 'Nicht autorisiert.' };
  try {
    return { success: true, styleguides: readStyleguides_().map(function (g) { return styleguideView_(g, email); }) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Anlegen darf jeder freigeschaltete Nutzer, aendern nur wer ihn angelegt
// hat oder ein Admin. Zuordnen zu Spaces: nur zu Spaces, die man bearbeiten darf.
function apiPromptEditorSaveStyleguide(data) {
  var email = getCurrentUserEmail_();
  if (!isPromptEditorWhitelisted_(email)) return { success: false, error: 'Nicht autorisiert.' };
  data = data || {};
  var name = String(data.name || '').trim().replace(/\s+/g, ' ');
  if (!name) return { success: false, error: 'Bitte dem Styleguide einen Namen geben.' };
  if (name.length > 60 || /[=\n]/.test(name)) return { success: false, error: 'Der Name darf höchstens 60 Zeichen lang sein und kein „=“ enthalten.' };
  var content = cleanStyleguideText_(data.content);
  if (!content) return { success: false, error: 'Der Styleguide ist leer.' };
  if (content.length > STYLEGUIDE_LIMIT_) return { success: false, error: 'Der Styleguide ist zu lang (' + content.length + ' von höchstens ' + STYLEGUIDE_LIMIT_ + ' Zeichen).' };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = styleguideSheet_(true);
    var list = readStyleguides_();
    var id = String(data.id || '');
    var clash = list.filter(function (g) { return g.id !== id && g.name.toLowerCase() === name.toLowerCase(); })[0];
    if (clash) return { success: false, error: 'Es gibt schon einen Styleguide mit diesem Namen.' };
    var g;
    if (id) {
      g = list.filter(function (x) { return x.id === id; })[0];
      if (!g) return { success: false, error: 'Styleguide nicht gefunden.' };
      if (!(isPromptEditorAdmin_(email) || g.createdBy === email)) return { success: false, error: 'Diesen Styleguide darf nur ändern, wer ihn angelegt hat, oder ein Admin.' };
    } else {
      g = { id: Utilities.getUuid().replace(/-/g, '').substring(0, 12), createdBy: email, types: [] };
    }
    if (Array.isArray(data.types)) g.types = mergeTypesForUser_(g.types, data.types, email);
    g.name = name;
    g.description = String(data.description || '').trim().substring(0, 300);
    g.content = content;
    g.updatedAt = new Date().toISOString();
    g.updatedBy = email;
    writeStyleguide_(sh, g);
    styleguideCache_ = null;
    try { logAudit_('Prompt Editor', 'Styleguide "' + name + '" ' + (id ? 'geändert' : 'angelegt') + ' von ' + email); } catch (e) {}
    return { success: true, id: g.id, styleguides: readStyleguides_().map(function (x) { return styleguideView_(x, email); }) };
  } catch (e) {
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

// Uebernimmt die gewuenschte Zuordnung nur fuer Spaces, die der Nutzer
// bearbeiten darf; alle anderen Zuordnungen bleiben, wie sie sind.
function mergeTypesForUser_(current, wanted, email) {
  var admin = isPromptEditorAdmin_(email);
  var keep = (current || []).filter(function (t) { return t === '*' ? !admin : !canEditType_(email, t); });
  var add = (wanted || []).map(String).filter(function (t) { return t === '*' ? admin : canEditType_(email, t); });
  add.forEach(function (t) { if (keep.indexOf(t) === -1) keep.push(t); });
  return keep;
}

function apiPromptEditorDeleteStyleguide(id) {
  var email = getCurrentUserEmail_();
  if (!isPromptEditorWhitelisted_(email)) return { success: false, error: 'Nicht autorisiert.' };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var g = readStyleguides_().filter(function (x) { return x.id === id; })[0];
    if (!g) return { success: false, error: 'Styleguide nicht gefunden.' };
    if (!(isPromptEditorAdmin_(email) || g.createdBy === email)) return { success: false, error: 'Diesen Styleguide darf nur löschen, wer ihn angelegt hat, oder ein Admin.' };
    styleguideSheet_(false).deleteRow(g._row);
    styleguideCache_ = null;
    try { logAudit_('Prompt Editor', 'Styleguide "' + g.name + '" gelöscht von ' + email); } catch (e) {}
    return { success: true, styleguides: readStyleguides_().map(function (x) { return styleguideView_(x, email); }) };
  } catch (e) {
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

// Setzt, welche Styleguides fuer einen Prompt Space gelten (aus der Prompt-Karte).
function apiPromptEditorSetTypeStyleguides(type, ids) {
  var email = getCurrentUserEmail_();
  if (!canEditType_(email, type)) return { success: false, error: 'Nicht autorisiert für diesen Prompt-Typ.' };
  ids = Array.isArray(ids) ? ids.map(String) : [];
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = styleguideSheet_(true);
    readStyleguides_().forEach(function (g) {
      var has = g.types.indexOf(type) !== -1, want = ids.indexOf(g.id) !== -1;
      if (has === want) return;
      g.types = want ? g.types.concat([type]) : g.types.filter(function (t) { return t !== type; });
      writeStyleguide_(sh, g);
    });
    styleguideCache_ = null;
    try { logAudit_('Prompt Editor', 'Styleguides für "' + type + '" gesetzt von ' + email + ': ' + ids.join(', ')); } catch (e) {}
    return { success: true, styleguides: readStyleguides_().map(function (x) { return styleguideView_(x, email); }) };
  } catch (e) {
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}
