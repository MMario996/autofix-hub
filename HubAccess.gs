// =====================================================================
// AUTOFIX HUB - ZUGRIFF & KONFIGURATION DER OBERFLAECHE (HubAccess.gs)
//
// AutoFix Hub ist das Werkzeug der Admins: Laeufe, Poller, Run Log,
// Analysen und AutoFix-Einstellungen. Alle anderen pflegen ihre Prompts,
// Styleguides und Kontext-Dateien im Prompt Hub.
//
// Zugriff hat deshalb nur, wer in AUTOFIX_HUB_ACCESS als Admin steht.
// Wer Admin werden moechte, stellt in der App einen Antrag; ein Admin
// gibt ihn frei. Die frueheren Rollen "viewer" und "operator" gelten
// nicht mehr (alte Eintraege bleiben gespeichert, werden aber ignoriert).
//
// Solange noch kein Admin eingerichtet ist, laeuft die App im offenen
// Modus (wie bisher: jeder in der Domain darf alles) und zeigt einen
// Hinweis. Admins werden beim ersten Start aus dem alten Prompt Editor
// (PROMPT_EDITOR_ADMINS) uebernommen, sonst per bootstrapAutoFixAdmin().
// Die AutoFix-Logik (Laeufe, Poller, Prompts) bleibt unveraendert.
// =====================================================================

var HUB_ACCESS_PROP_ = 'AUTOFIX_HUB_ACCESS';
var HUB_CONFIG_PROP_ = 'AUTOFIX_HUB_CONFIG';
var HUB_LANG_PROP_   = 'AUTOFIX_HUB_UI_LANG';
var HUB_ROLE_RANK_   = { viewer: 1, operator: 2, admin: 3 };

// Einmalig im Editor ausfuehren, falls es weder Hub- noch Prompt-Editor-Admins gibt.
function bootstrapAutoFixAdmin() {
  var email = hubEmail_();
  if (!email) throw new Error('E-Mail des aktuellen Nutzers nicht lesbar.');
  var st = hubAccess_();
  if (st.admins.indexOf(email) === -1) st.admins.push(email);
  hubSaveAccess_(st);
  Logger.log('AutoFix Hub Admin gesetzt: ' + email);
}

function hubEmail_() {
  var e = '';
  try { e = Session.getActiveUser().getEmail(); } catch (err) {}
  return String(e || '').trim().toLowerCase();
}

function hubAccess_() {
  var st = null;
  try { st = JSON.parse(PropertiesService.getScriptProperties().getProperty(HUB_ACCESS_PROP_) || 'null'); } catch (e) {}
  if (!st) {
    st = { admins: [], users: [], requests: [] };
    // Admins aus dem alten Prompt Editor uebernehmen
    try {
      var legacy = JSON.parse(PropertiesService.getScriptProperties().getProperty('PROMPT_EDITOR_ADMINS') || '[]');
      if (Array.isArray(legacy) && legacy.length) {
        st.admins = legacy.map(function (x) { return String(x).toLowerCase(); });
        hubSaveAccess_(st);
      }
    } catch (e) {}
  }
  st.admins = st.admins || []; st.users = st.users || []; st.requests = st.requests || [];
  return st;
}

function hubSaveAccess_(st) {
  st.requests = (st.requests || []).slice(-100); // Property-Groesse begrenzen
  PropertiesService.getScriptProperties().setProperty(HUB_ACCESS_PROP_, JSON.stringify(st));
}

function hubOpenMode_(st) { return !(st || hubAccess_()).admins.length; }

// Nur Admins (oder jeder im offenen Modus). Die Rangfolge in
// HUB_ROLE_RANK_ bleibt, damit die bestehenden Pruefungen ('viewer',
// 'operator', 'admin') unveraendert funktionieren: ein Admin erfuellt alle.
function hubRole_(email, st) {
  st = st || hubAccess_();
  if (hubOpenMode_(st)) return 'admin';
  if (!email) return '';
  return st.admins.indexOf(email) !== -1 ? 'admin' : '';
}

function hubHasRole_(email, needed) {
  var r = hubRole_(email);
  return !!r && HUB_ROLE_RANK_[r] >= HUB_ROLE_RANK_[needed];
}

// Fuer die bestehenden oeffentlichen Funktionen: liefert ein Fehlerobjekt
// im ueblichen AutoFix-Format, wenn der Aufrufer die Rolle nicht hat.
// Trigger laufen nicht ueber diese Funktionen und sind nicht betroffen.
function hubDenied_(needed) {
  var email = hubEmail_();
  if (hubHasRole_(email, needed)) return null;
  return { success: false, error: 'Keine Berechtigung (' + needed + ' erforderlich) für ' + (email || 'unbekannten Nutzer') + '.' };
}

function hubRequire_(needed) {
  var email = hubEmail_();
  if (!hubHasRole_(email, needed)) throw new Error('Keine Berechtigung (' + needed + ' erforderlich).');
  return email;
}

// ---------------------------------------------------------------------
// Konfiguration der Oberflaeche (keine AutoFix-Laufzeitwerte)
// ---------------------------------------------------------------------
function hubDefaultConfig_() {
  return {
    promptHubUrl: '',
    notifyEmails: [],
    chatWebhookUrl: '',
    allowedModels: typeof ALLOWED_GEMINI_MODELS_ !== 'undefined' ? ALLOWED_GEMINI_MODELS_.slice() : ['gemini-3.6-flash']
  };
}

function hubConfig_() {
  var cfg = hubDefaultConfig_();
  try {
    var saved = JSON.parse(PropertiesService.getScriptProperties().getProperty(HUB_CONFIG_PROP_) || '{}');
    Object.keys(saved).forEach(function (k) { if (k in cfg && saved[k] !== null && saved[k] !== undefined) cfg[k] = saved[k]; });
  } catch (e) {}
  return cfg;
}

function hubSaveConfig_(patch) {
  var cfg = hubConfig_();
  if (patch.promptHubUrl !== undefined) {
    var u = String(patch.promptHubUrl || '').trim();
    if (u && !/^https:\/\//.test(u)) throw new Error('Prompt-Hub-Link muss mit https:// beginnen.');
    cfg.promptHubUrl = u;
  }
  if (patch.chatWebhookUrl !== undefined) {
    var w = String(patch.chatWebhookUrl || '').trim();
    if (w && !/^https:\/\/chat\.googleapis\.com\//.test(w)) throw new Error('Nur Google-Chat-Webhooks (https://chat.googleapis.com/...) sind erlaubt.');
    cfg.chatWebhookUrl = w;
  }
  if (patch.notifyEmails !== undefined) {
    cfg.notifyEmails = (Array.isArray(patch.notifyEmails) ? patch.notifyEmails : String(patch.notifyEmails || '').split(/[\s,;]+/))
      .map(function (e) { return String(e).trim().toLowerCase(); })
      .filter(function (e) { return /^[^@\s]+@[^@\s]+$/.test(e); });
  }
  if (patch.allowedModels !== undefined) {
    var list = (Array.isArray(patch.allowedModels) ? patch.allowedModels : String(patch.allowedModels || '').split(/[\s,]+/))
      .map(function (m) { return String(m).trim(); })
      .filter(function (m) { return /^[a-z0-9.-]+$/i.test(m); });
    if (!list.length) throw new Error('Mindestens ein Modell muss freigegeben sein.');
    cfg.allowedModels = list;
  }
  PropertiesService.getScriptProperties().setProperty(HUB_CONFIG_PROP_, JSON.stringify(cfg));
  return cfg;
}

function hubNotifyAdmins_(subject, text) {
  var cfg = hubConfig_();
  var url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (e) {}
  if (cfg.chatWebhookUrl) {
    try {
      UrlFetchApp.fetch(cfg.chatWebhookUrl, {
        method: 'post', contentType: 'application/json; charset=UTF-8', muteHttpExceptions: true,
        payload: JSON.stringify({ text: '*AutoFix Hub* · ' + subject + '\n' + text + (url ? '\n' + url : '') })
      });
    } catch (e) { Logger.log('[Hub notify chat] ' + e.message); }
  }
  var to = cfg.notifyEmails.length ? cfg.notifyEmails : hubAccess_().admins;
  if (to.length) hubMail_(to.join(','), subject, text + (url ? '\n\n' + url : ''));
}

function hubMail_(to, subject, body) {
  try { MailApp.sendEmail({ to: to, subject: '[AutoFix Hub] ' + subject, body: body }); }
  catch (e) { Logger.log('[Hub mail] ' + e.message); }
}

function hubAudit_(email, action, details) {
  try { logAudit_(action, (email ? email + ': ' : '') + String(details || '').substring(0, 1800)); } catch (e) {}
}
