// =====================================================================
// AUTOFIX HUB - UEBERGABE AN DEN PROMPT HUB (PromptHubExport.gs)
//
// Der alte Prompt Editor speichert Spaces (Name, Beispiel), Nutzer mit
// ihren Rechten und Admins in den Script Properties DIESES Projekts. Der
// Prompt Hub ist ein eigenes Projekt und kann sie nicht lesen. Diese
// Funktion schreibt sie deshalb in den Tab "Prompt Hub Import" des
// AutoFix-Sheets. Der Prompt Hub uebernimmt daraus beim ersten Oeffnen
// automatisch alle Spaces, Nutzer und Admins.
//
// Einmal ausfuehren: im Editor exportPromptEditorToPromptHub waehlen ->
// Ausfuehren. Oder in der AutoFix-Oberflaeche: Admin -> Wartung.
// Die Datei ist eigenstaendig und kann auch allein in ein bestehendes
// AutoFix-Projekt kopiert werden (nutzt nur getDbSheet_ aus Database.gs).
// Aendert nichts an Prompts, Einstellungen oder Laeufen.
// =====================================================================

var PROMPT_HUB_IMPORT_TAB_ = 'Prompt Hub Import';

function exportPromptEditorToPromptHub() {
  var props = PropertiesService.getScriptProperties();
  var read = function (key) {
    try { var v = JSON.parse(props.getProperty(key) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  };
  // Rohwerte, nicht getPromptTypesConfig_(): die mischt Spaces aus dem Prompt Hub dazu
  var types = read('AUTOFIX_PROMPT_TYPES_CONFIG');
  var users = read('PROMPT_EDITOR_USERS');
  var admins = read('PROMPT_EDITOR_ADMINS');

  var rows = [['kind', 'key', 'json']];
  types.forEach(function (t) {
    if (!t || !t.type) return;
    rows.push(['type', String(t.type), JSON.stringify({ type: t.type, label: t.label || t.type, example: t.example || '', builtIn: !!t.builtIn })]);
  });
  users.forEach(function (u) {
    if (!u || !u.email) return;
    rows.push(['user', String(u.email).toLowerCase(), JSON.stringify({ email: String(u.email).toLowerCase(), types: u.types || [], canManageSettings: !!u.canManageSettings })]);
  });
  admins.forEach(function (a) { if (a) rows.push(['admin', String(a).toLowerCase(), '{}']); });
  rows.push(['meta', 'exportedAt', JSON.stringify({ at: new Date().toISOString() })]);

  var ss = getDbSheet_();
  var sh = ss.getSheetByName(PROMPT_HUB_IMPORT_TAB_) || ss.insertSheet(PROMPT_HUB_IMPORT_TAB_);
  sh.clearContents();
  // Beispiele koennen mit "=" beginnen -> als Text schreiben
  sh.getRange(1, 1, rows.length, 3).setNumberFormat('@').setValues(rows);
  try { sh.setFrozenRows(1); } catch (e) {}
  var summary = types.length + ' Space(s), ' + users.length + ' Nutzer, ' + admins.length + ' Admin(s)';
  try { logAudit_('Prompt Hub Export', summary); } catch (e) {}
  Logger.log('An Prompt Hub uebergeben: ' + summary);
  return { success: true, types: types.length, users: users.length, admins: admins.length };
}
