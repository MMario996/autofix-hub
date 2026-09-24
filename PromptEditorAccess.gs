// =====================================================================
// PROMPT EDITOR – ACCESS CONTROL & API  (v3)
// =====================================================================
// Baut auf v2 auf und ergänzt:
//   - UI Sprache (DE/EN), pro Nutzer über UserProperties gespeichert
//   - Prompt Spaces: Admin kann neue Container für Dokumenttypen anlegen
//     (z.B. CAMPUS), nicht nur die fest eingebauten (technical, marketing)
//   - Jeder freigeschaltete Nutzer kann für seine Typen eigene Gemini
//     Einstellungen setzen (Modell, Temperature, Max Tokens), unabhängig
//     von den globalen Einstellungen und unabhängig von canManageSettings
//   - Ticket Link zum Beantragen eines neuen Prompt Space
//   - Beispiel Text pro Prompt Space, rechts im Editor einklappbar
//
// Admins haben weiterhin immer vollen Zugriff auf alle Prompt Typen,
// alle Einstellungen und die Nutzerverwaltung. Die Typ Rechte unten
// gelten nur für normale, nicht-admin Nutzer.
// =====================================================================
var PROMPT_EDITOR_ADMIN_PROP_ = 'PROMPT_EDITOR_ADMINS';   // Array von E-Mails (voller Zugriff)
var PROMPT_EDITOR_USERS_PROP_ = 'PROMPT_EDITOR_USERS';    // Array von { email, types, canManageSettings }
var PROMPT_TYPES_CONFIG_PROP_ = 'AUTOFIX_PROMPT_TYPES_CONFIG';
var UI_LANG_PROP_             = 'PROMPT_EDITOR_UI_LANG';
var PROMPT_EDITOR_TICKET_URL_ = 'https://taskbox.karcher.com/plugins/servlet/desk/portal/97/create/4030';

var BUILT_IN_TYPE_EXAMPLES_ = {
  technical: 'Quelle: "Vor Inbetriebnahme Bedienungsanleitung lesen."\n' +
    'MT Rohtext: "Read the operating instructions before commissioning."\n' +
    'Nach Post-Editing: "Read the operating instructions before starting up the machine."\n' +
    'Hier wurde "commissioning" durch die im technischen Kontext gebräuchlichere Formulierung "starting up the machine" ersetzt.',
  marketing: 'Quelle: "Kraftvoll. Zuverlässig. Kärcher."\n' +
    'MT Rohtext: "Powerful. Reliable. Kärcher."\n' +
    'Nach Post-Editing: "Powerful. Dependable. Only Kärcher."\n' +
    'Hier wurde der Claim an die Markensprache angepasst und wirkt dadurch überzeugender.'
};

// ?????????????????????????????????????????????????????????????????????
// EINMALIGES SETUP – nur nötig, falls noch nie ausgeführt.
// ?????????????????????????????????????????????????????????????????????
function bootstrapPromptEditorAdmin() {
  var myEmail = 'mario.magliano@karcher.com'; // <-- ggf. anpassen
  var props  = PropertiesService.getScriptProperties();
  var admins = getPromptEditorAdmins_();
  var e      = myEmail.trim().toLowerCase();
  if (admins.indexOf(e) === -1) admins.push(e);
  props.setProperty(PROMPT_EDITOR_ADMIN_PROP_, JSON.stringify(admins));
  Logger.log('Prompt Editor Admin gesetzt: ' + e);
}

// ?????????????????????????????????????????????????????????????????????
// HELPERS – Admins
// ?????????????????????????????????????????????????????????????????????
function getPromptEditorAdmins_() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(PROMPT_EDITOR_ADMIN_PROP_);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}
function isPromptEditorAdmin_(email) {
  if (!email) return false;
  return getPromptEditorAdmins_().indexOf(String(email).toLowerCase()) !== -1;
}

// ?????????????????????????????????????????????????????????????????????
// HELPERS – Feingranulare Nutzer (Nicht-Admins)
// entry = { email, types: ['technical','marketing'] oder ['*'] für alle,
//           canManageSettings: bool }
// ?????????????????????????????????????????????????????????????????????
function getPromptEditorUsers_() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(PROMPT_EDITOR_USERS_PROP_);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}
function savePromptEditorUsers_(list) {
  PropertiesService.getScriptProperties().setProperty(PROMPT_EDITOR_USERS_PROP_, JSON.stringify(list));
}
function findPromptEditorUser_(email) {
  var e = String(email || '').toLowerCase();
  var list = getPromptEditorUsers_();
  for (var i = 0; i < list.length; i++) if (list[i].email === e) return list[i];
  return null;
}
function isPromptEditorWhitelisted_(email) {
  if (!email) return false;
  return isPromptEditorAdmin_(email) || !!findPromptEditorUser_(email);
}
function canEditType_(email, type) {
  if (isPromptEditorAdmin_(email)) return true;
  var u = findPromptEditorUser_(email);
  if (!u || !u.types || !u.types.length) return false;
  return u.types.indexOf('*') !== -1 || u.types.indexOf(type) !== -1;
}
function canManageSettings_(email) {
  if (isPromptEditorAdmin_(email)) return true;
  var u = findPromptEditorUser_(email);
  return !!(u && u.canManageSettings);
}
var EMAIL_RE_ = /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/;
function isValidEmail_(email) { return EMAIL_RE_.test(String(email || '').trim().toLowerCase()); }

function getCurrentUserEmail_() {
  try { var e = Session.getActiveUser().getEmail(); if (e) return e; } catch (err) {}
  try { return Session.getEffectiveUser().getEmail() || ''; } catch (err) { return ''; }
}

// ─────────────────────────────────────────────────────────────────────
// ZUGRIFFSSCHUTZ AutoFix Hub (Index.html)
// Jede öffentliche Funktion (ohne "_" am Ende) ist per google.script.run
// für JEDEN Nutzer der Domain aufrufbar – auch ohne die UI. Deshalb muss
// jede Hub-Funktion selbst prüfen, ob der Aufrufer berechtigt ist.
// Berechtigt: Prompt-Editor-Admins und Nutzer mit canManageSettings.
// ─────────────────────────────────────────────────────────────────────
function hasHubAccess_(email) {
  return canManageSettings_(email);
}
function requireHubAccess_() {
  var email = getCurrentUserEmail_();
  if (!hasHubAccess_(email)) {
    throw new Error('Nicht autorisiert: Der AutoFix Hub ist nur für freigeschaltete Admins verfügbar.');
  }
  return email;
}

/** Wird von Index.html beim Start aufgerufen, um die Zugriffsseite zu zeigen. */
function apiHubGetAccess() {
  var email = getCurrentUserEmail_();
  var ok = hasHubAccess_(email);
  return {
    authorized: ok,
    email: email,
    isAdmin: ok && isPromptEditorAdmin_(email),
    ticketUrl: PROMPT_EDITOR_TICKET_URL_,
    models: ok ? ALLOWED_GEMINI_MODELS_.slice() : [],
    appUrl: (function () { try { return ScriptApp.getService().getUrl() || ''; } catch (e) { return ''; } })()
  };
}

// ?????????????????????????????????????????????????????????????????????
// HELPERS – UI Sprache (pro Google Account, über UserProperties)
// ?????????????????????????????????????????????????????????????????????
function getUiLang_() {
  try {
    var v = PropertiesService.getUserProperties().getProperty(UI_LANG_PROP_);
    return v === 'en' ? 'en' : 'de';
  } catch (e) { return 'de'; }
}
function apiPromptEditorSetUiLang(lang) {
  try {
    var l = (lang === 'en') ? 'en' : 'de';
    PropertiesService.getUserProperties().setProperty(UI_LANG_PROP_, l);
    return { success: true, uiLang: l };
  } catch (e) { return { success: false, error: e.message }; }
}

// ?????????????????????????????????????????????????????????????????????
// HELPERS – Prompt Spaces (Typen), dynamisch erweiterbar durch Admin
// ?????????????????????????????????????????????????????????????????????
function getPromptTypesConfig_() {
  var raw  = PropertiesService.getScriptProperties().getProperty(PROMPT_TYPES_CONFIG_PROP_);
  var list = raw ? JSON.parse(raw) : null;
  if (!list) {
    // Erststart: aus den bisher bekannten Typen (Settings.gs) initialisieren
    list = getKnownAutoFixTypes_().map(function (type) {
      return {
        type: type,
        label: typeToLabel_(type),
        example: BUILT_IN_TYPE_EXAMPLES_[type] || '',
        builtIn: true
      };
    });
    savePromptTypesConfig_(list);
  }
  return list;
}
function savePromptTypesConfig_(list) {
  PropertiesService.getScriptProperties().setProperty(PROMPT_TYPES_CONFIG_PROP_, JSON.stringify(list));
}
function sanitizeTypeKey_(label) {
  return String(label || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 40);
}
function labelForType_(type) {
  var cfg = getPromptTypesConfig_().find(function (t) { return t.type === type; });
  return cfg ? cfg.label : typeToLabel_(type);
}
function exampleForType_(type) {
  var cfg = getPromptTypesConfig_().find(function (t) { return t.type === type; });
  return cfg ? (cfg.example || '') : (BUILT_IN_TYPE_EXAMPLES_[type] || '');
}

// ?????????????????????????????????????????????????????????????????????
// HELPER – Effektive Gemini Konfiguration für einen Prompt Typ.
// Nimmt die Typ-eigenen Werte (geminiModel_<type> etc.), fällt für
// alles was nicht gesetzt ist auf die globalen Settings zurück.
// ?????????????????????????????????????????????????????????????????????
// Aktuell freigeschaltete Modelle für euren API-Key/Gateway. Muss synchron
// zu GEMINI_MODELS im Frontend (PromptEditor.html) gehalten werden. Nur
// Modelle aus dieser Liste können tatsächlich verwendet werden – ein alter,
// im Sheet gespeicherter Modellname (z.B. "gemini-2.5-pro") fällt sonst
// automatisch auf das erste Listenelement zurück.
var ALLOWED_GEMINI_MODELS_ = [
  'gemini-3.6-flash',
  'gemini-3.6-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3-flash-preview'
];
function sanitizeGeminiModel_(model) {
  return (model && ALLOWED_GEMINI_MODELS_.indexOf(model) !== -1) ? model : ALLOWED_GEMINI_MODELS_[0];
}
function parseBoolSetting_(raw, fallback) {
  if (raw === undefined || raw === '') return fallback;
  return raw === true || raw === 'true';
}

function getEffectiveGeminiConfig_(settings, type) {
  var rawModel = settings['geminiModel_' + type] || settings.primaryModel || 'gemini-3.6-flash';
  var model = sanitizeGeminiModel_(rawModel);
  var temperature = (settings['geminiTemp_' + type] !== undefined && settings['geminiTemp_' + type] !== '')
    ? parseFloat(settings['geminiTemp_' + type])
    : parseFloat(settings.peTemperature) || 0.1;
  var maxTokens = (settings['geminiMaxTokens_' + type] !== undefined && settings['geminiMaxTokens_' + type] !== '')
    ? parseInt(settings['geminiMaxTokens_' + type], 10)
    : parseInt(settings.maxTokens, 10) || 32768;
  var tmThreshold = (settings['geminiTmThreshold_' + type] !== undefined && settings['geminiTmThreshold_' + type] !== '')
    ? parseFloat(settings['geminiTmThreshold_' + type])
    : parseFloat(settings.tmThreshold) || 0.7;
  var globalThinking = parseBoolSetting_(settings.primaryThinking, true);
  var thinking = (settings['geminiThinking_' + type] !== undefined && settings['geminiThinking_' + type] !== '')
    ? parseBoolSetting_(settings['geminiThinking_' + type], true)
    : globalThinking;
  return { model: model, temperature: temperature, maxTokens: maxTokens, tmThreshold: tmThreshold, thinking: thinking };
}
// Baut das generationConfig-Objekt für einen Gemini-Call. Thinking wird nur
// dann explizit ausgeschaltet, wenn der Nutzer es deaktiviert hat – läuft es
// an, wird gar kein thinkingConfig mitgeschickt und das Modell entscheidet
// selbst (dynamisches Thinking), das ist der sicherste Default.
function buildGenerationConfig_(eff, extra) {
  var cfg = Object.assign({ temperature: eff.temperature, maxOutputTokens: eff.maxTokens }, extra || {});
  if (eff.thinking === false) cfg.thinkingConfig = { thinkingBudget: 0 };
  return cfg;
}

// ?????????????????????????????????????????????????????????????????????
// PAGE ENTRY – wird aus doGet(e) in Code.gs aufgerufen
// ?????????????????????????????????????????????????????????????????????
function renderPromptEditorPage_() {
  return HtmlService.createHtmlOutputFromFile('PromptEditor')
    .setTitle('AutoFix Prompt Editor')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ?????????????????????????????????????????????????????????????????????
// API – Konfiguration / Prompts
// ?????????????????????????????????????????????????????????????????????
function apiPromptEditorGetConfig() {
  return buildConfigForEmail_(getCurrentUserEmail_(), getUiLang_());
}

// Baut denselben Konfigurations-Payload wie apiPromptEditorGetConfig, aber
// für eine beliebige E-Mail. Wird sowohl vom eigentlichen Aufruf als auch
// von der Admin-Vorschau ("So sieht User X das") genutzt, damit beide Wege
// garantiert exakt dieselbe Logik durchlaufen.
function buildConfigForEmail_(email, uiLang) {
  if (!isPromptEditorWhitelisted_(email)) {
    return { authorized: false, email: email, ticketUrl: PROMPT_EDITOR_TICKET_URL_, uiLang: uiLang };
  }
  var admin        = isPromptEditorAdmin_(email);
  var user         = findPromptEditorUser_(email);
  var allowedTypes = admin ? ['*'] : ((user && user.types) || []);
  var canSettings  = admin || !!(user && user.canManageSettings);

  var typesConfig = getPromptTypesConfig_(); // dynamisch, inkl. admin-angelegter Spaces
  var settings    = getSettings_();          // aus Code.gs, einmal laden

  var visible = typesConfig
    .filter(function (tp) { return allowedTypes.indexOf('*') !== -1 || allowedTypes.indexOf(tp.type) !== -1; })
    .map(function (tp) {
      var hasOverride = !!(settings['geminiModel_' + tp.type] || settings['geminiTemp_' + tp.type] || settings['geminiMaxTokens_' + tp.type] || settings['geminiTmThreshold_' + tp.type] || settings['geminiThinking_' + tp.type]);
      return {
        type: tp.type,
        label: tp.label,
        instructions: getPeInstructions_(settings, tp.type), // aus Settings.gs, funktioniert für jeden Typ
        example: tp.example || '',
        canEdit: canEditType_(email, tp.type),
        geminiOverride: getEffectiveGeminiConfig_(settings, tp.type),
        geminiHasOverride: hasOverride
      };
    });
  visible.sort(function (a, b) {
    if (a.type === 'technical') return -1;
    if (b.type === 'technical') return 1;
    return 0;
  });

  var geminiSettings = null;
  if (canSettings) {
    geminiSettings = {
      primaryModel: sanitizeGeminiModel_(settings.primaryModel),
      peTemperature: settings.peTemperature,
      maxTokens: settings.maxTokens,
      tmThreshold: settings.tmThreshold,
      primaryThinking: parseBoolSetting_(settings.primaryThinking, true)
    };
  }

  return {
    authorized: true,
    isAdmin: admin,
    email: email,
    canManageSettings: canSettings,
    prompts: visible,
    geminiSettings: geminiSettings,
    ticketUrl: PROMPT_EDITOR_TICKET_URL_,
    uiLang: uiLang,
    error: null
  };
}

// ?????????????????????????????????????????????????????????????????????
// API – ADMIN-ONLY: Vorschau, wie ein anderer freigeschalteter Nutzer den
// Prompt Editor sehen würde (welche Typen, welche Rechte, welche Gemini-
// Werte). Rein lesend – nichts davon lässt sich aus der Vorschau heraus
// speichern.
// ?????????????????????????????????????????????????????????????????????
function apiPromptEditorPreviewAsUser(targetEmail) {
  var email = getCurrentUserEmail_();
  if (!isPromptEditorAdmin_(email)) return { authorized: false, error: 'Nur für Admins.' };
  var target = String(targetEmail || '').trim().toLowerCase();
  if (!isValidEmail_(target)) return { authorized: false, error: 'Bitte eine gültige E-Mail-Adresse angeben.' };
  var cfg = buildConfigForEmail_(target, getUiLang_());
  cfg.previewOf = target;
  return cfg;
}

function apiPromptEditorSave(autoFixType, text) {
  var email = getCurrentUserEmail_();
  if (!canEditType_(email, autoFixType)) return { success: false, error: 'Nicht autorisiert für diesen Prompt-Typ.' };
  if (!autoFixType || typeof text !== 'string' || text.trim() === '') {
    return { success: false, error: 'Prompt darf nicht leer sein.' };
  }
  var res = saveSinglePrompt_(autoFixType, text); // aus Settings.gs
  if (res.success) {
    try { logAudit_('Prompt Editor', 'Prompt "' + autoFixType + '" bearbeitet von ' + email); } catch (e) {}
  }
  return res;
}
function apiPromptEditorReset(autoFixType) {
  var email = getCurrentUserEmail_();
  if (!canEditType_(email, autoFixType)) return { success: false, error: 'Nicht autorisiert für diesen Prompt-Typ.' };
  var res = resetPromptForType_(autoFixType); // aus Settings.gs
  if (res.success) {
    try { logAudit_('Prompt Editor', 'Prompt "' + autoFixType + '" zurückgesetzt von ' + email); } catch (e) {}
  }
  return res;
}

// ?????????????????????????????????????????????????????????????????????
// API – "Mit Gemini verbessern"
// ?????????????????????????????????????????????????????????????????????
function apiPromptEditorHelpMeWrite(autoFixType, currentText, likes, dislikes, freeText) {
  var email = getCurrentUserEmail_();
  if (!canEditType_(email, autoFixType)) return { success: false, error: 'Nicht autorisiert für diesen Prompt-Typ.' };
  if (!currentText || !currentText.trim()) return { success: false, error: 'Kein aktueller Prompt-Text vorhanden.' };
  try {
    var settings = getSettings_();
    var key      = getGeminiKey_();
    var eff      = getEffectiveGeminiConfig_(settings, autoFixType);
    var url      = getGeminiUrl_(eff.model);
    var metaPrompt = buildHelpMeWritePrompt_(currentText, likes, dislikes, freeText);
    var res = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'x-api-key': key, 'Accept': 'application/json' },
      payload: JSON.stringify({
        contents: [{ parts: [{ text: metaPrompt }] }],
        generationConfig: buildGenerationConfig_(eff, { temperature: 0.4, maxOutputTokens: 4096 })
      })
    });
    var code = res.getResponseCode();
    if (code >= 400) return { success: false, error: 'Gemini Fehler ' + code + ': ' + res.getContentText().substring(0, 300) };
    var json = JSON.parse(res.getContentText());
    var text = (json.candidates && json.candidates[0].content.parts[0].text) || '';
    text = text.replace(/^```[a-zA-Z]*\s*/, '').replace(/```\s*$/, '').trim();
    if (!text) return { success: false, error: 'Gemini hat keinen Vorschlag geliefert.' };
    try { logAudit_('Prompt Editor', 'Gemini-Vorschlag für "' + autoFixType + '" generiert von ' + email); } catch (e) {}
    return { success: true, suggestion: text };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
function buildHelpMeWritePrompt_(currentText, likes, dislikes, freeText) {
  var parts = [];
  parts.push('Du hilfst dabei, einen bestehenden Post-Editing-Prompt für ein Übersetzungstool (Kärcher, Gemini-basiert) zu überarbeiten.');
  parts.push('');
  parts.push('=== AKTUELLER PROMPT ===');
  parts.push(currentText);
  parts.push('');
  parts.push('=== GEWÜNSCHTE ANPASSUNGEN ===');
  var hasAny = false;
  if (likes && likes.trim())       { parts.push('BEIBEHALTEN / VERSTÄRKEN: ' + likes.trim()); hasAny = true; }
  if (dislikes && dislikes.trim()) { parts.push('ENTFERNEN / ÄNDERN: ' + dislikes.trim()); hasAny = true; }
  if (freeText && freeText.trim()) { parts.push('ZUSÄTZLICHE ANWEISUNG: ' + freeText.trim()); hasAny = true; }
  if (!hasAny) parts.push('(keine spezifischen Angaben, allgemein verbessern und klarer strukturieren)');
  parts.push('');
  parts.push('=== AUFGABE ===');
  parts.push('Gib eine überarbeitete Version des KOMPLETTEN Prompts zurück. Behalte Format, Struktur ' +
    '(Nummerierung, Abschnitte wie "PFLICHT-KORREKTUREN", "NICHT VERÄNDERN" etc.) und die Sprache (Deutsch) bei. ' +
    'ändere nur, was durch die obigen Angaben verlangt wird. Antworte AUSSCHLIESSLICH mit dem neuen Prompt-Text, ' +
    'kein Markdown, keine Code-Fences, keine Erklärung davor oder danach.');
  return parts.join('\n');
}

// ?????????????????????????????????????????????????????????????????????
// API – Test / Playground: schickt den aktuellen Prompt-Text (auch wenn
// noch nicht gespeichert) zusammen mit einem selbst eingegebenen Text
// an Gemini und liefert die echte Post-Editing-Antwort zurück. Nutzt
// dieselbe buildPePrompt_() wie ein echter AutoFix-Lauf (aus Code.gs),
// nur mit einem einzelnen Test-Segment ohne Termbase-Treffer.
// ?????????????????????????????????????????????????????????????????????
function apiPromptEditorTestPrompt(type, promptText, sourceLang, targetLang, sourceText) {
  var email = getCurrentUserEmail_();
  if (!canEditType_(email, type)) return { success: false, error: 'Nicht autorisiert für diesen Prompt-Typ.' };
  if (!promptText || !promptText.trim()) return { success: false, error: 'Der Prompt darf nicht leer sein.' };
  if (!sourceText || !sourceText.trim()) return { success: false, error: 'Bitte einen Testtext eingeben.' };
  try {
    var settings = getSettings_();          // aus Code.gs
    var eff      = getEffectiveGeminiConfig_(settings, type);
    var key      = getGeminiKey_();          // aus Code.gs
    // Kopie der Settings, in der der Prompt-Typ auf den gerade eingegebenen,
    // eventuell noch nicht gespeicherten Text zeigt.
    var testSettings = Object.assign({}, settings);
    testSettings['peInstructions_' + type] = promptText;
    var segment = { id: 'test-1', source: sourceText.trim(), target: sourceText.trim(), tmMatches: [], tbHits: [] };
    var prompt  = buildPePrompt_(testSettings, sourceLang || 'de_de', targetLang || 'en_us', [segment], null, type); // aus Code.gs
    var url     = getGeminiUrl_(eff.model);
    var res = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'x-api-key': key, 'Accept': 'application/json' },
      payload: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: buildGenerationConfig_(eff, { responseMimeType: 'application/json' })
      })
    });
    var code = res.getResponseCode();
    if (code >= 400) return { success: false, error: 'Gemini Fehler ' + code + ': ' + res.getContentText().substring(0, 300) };
    var json = JSON.parse(res.getContentText());
    var raw  = (json.candidates && json.candidates[0].content.parts[0].text) || '';
    raw = raw.replace(/^```(json)?\s*/gi, '').replace(/```\s*$/gi, '').trim();
    var parsed = JSON.parse(raw);
    var r = (parsed.results || [])[0];
    if (!r) return { success: false, error: 'Gemini hat keine verwertbare Antwort geliefert.' };
    try { logAudit_('Prompt Editor', 'Prompt-Test für Typ "' + type + '" ausgeführt von ' + email); } catch (e) {}
    return {
      success: true,
      output: r.corrected || sourceText,
      changed: !!r.changed,
      reason: r.reason || '',
      model: eff.model
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ?????????????????????????????????????????????????????????????????????
// API – Globale Gemini-Einstellungen (nur canManageSettings)
// ?????????????????????????????????????????????????????????????????????
function apiPromptEditorGetGeminiSettings() {
  var email = getCurrentUserEmail_();
  if (!canManageSettings_(email)) return { success: false, error: 'Nicht autorisiert.' };
  var s = getSettings_();
  return {
    success: true,
    settings: { primaryModel: sanitizeGeminiModel_(s.primaryModel), peTemperature: s.peTemperature, maxTokens: s.maxTokens, tmThreshold: s.tmThreshold, primaryThinking: parseBoolSetting_(s.primaryThinking, true) }
  };
}
function apiPromptEditorSaveGeminiSettings(payload) {
  var email = getCurrentUserEmail_();
  if (!canManageSettings_(email)) return { success: false, error: 'Nicht autorisiert.' };
  var res = getAutoFixSettings_();
  if (!res.success) return { success: false, error: res.error };
  var settings = res.settings;
  if (payload.primaryModel) settings.primaryModel = sanitizeGeminiModel_(payload.primaryModel);
  if (payload.peTemperature !== undefined && payload.peTemperature !== '') settings.peTemperature = parseFloat(payload.peTemperature);
  if (payload.maxTokens     !== undefined && payload.maxTokens     !== '') settings.maxTokens     = parseInt(payload.maxTokens, 10);
  if (payload.tmThreshold   !== undefined && payload.tmThreshold   !== '') settings.tmThreshold   = parseFloat(payload.tmThreshold);
  if (payload.primaryThinking !== undefined) settings.primaryThinking = payload.primaryThinking ? 'true' : 'false';
  var saveRes = saveAutoFixSettingsAudited_(settings);
  if (saveRes.success) {
    try { logAudit_('Prompt Editor', 'Globale Gemini-Settings geändert von ' + email + ': ' + JSON.stringify(payload)); } catch (e) {}
  }
  return saveRes;
}

// ?????????????????????????????????????????????????????????????????????
// API – Gemini-Einstellungen PRO PROMPT TYP, für jeden mit Editier-
// recht auf diesen Typ, unabhängig von canManageSettings.
// ?????????????????????????????????????????????????????????????????????
function apiPromptEditorGetTypeGeminiSettings(type) {
  var email = getCurrentUserEmail_();
  if (!canEditType_(email, type)) return { success: false, error: 'Nicht autorisiert für diesen Prompt-Typ.' };
  var s = getSettings_();
  var hasOverride = !!(s['geminiModel_' + type] || s['geminiTemp_' + type] || s['geminiMaxTokens_' + type] || s['geminiTmThreshold_' + type] || s['geminiThinking_' + type]);
  return { success: true, hasOverride: hasOverride, effective: getEffectiveGeminiConfig_(s, type) };
}
function apiPromptEditorSaveTypeGeminiSettings(type, payload) {
  var email = getCurrentUserEmail_();
  if (!canEditType_(email, type)) return { success: false, error: 'Nicht autorisiert für diesen Prompt-Typ.' };
  var res = getAutoFixSettings_();
  if (!res.success) return { success: false, error: res.error };
  var settings = res.settings;
  if (payload.model) settings['geminiModel_' + type] = sanitizeGeminiModel_(payload.model);
  if (payload.temperature !== undefined && payload.temperature !== '') settings['geminiTemp_' + type] = parseFloat(payload.temperature);
  if (payload.maxTokens   !== undefined && payload.maxTokens   !== '') settings['geminiMaxTokens_' + type] = parseInt(payload.maxTokens, 10);
  if (payload.tmThreshold !== undefined && payload.tmThreshold !== '') settings['geminiTmThreshold_' + type] = parseFloat(payload.tmThreshold);
  if (payload.thinking !== undefined) settings['geminiThinking_' + type] = payload.thinking ? 'true' : 'false';
  var saveRes = saveAutoFixSettingsAudited_(settings);
  if (saveRes.success) {
    try { logAudit_('Prompt Editor', 'Gemini-Settings für Typ "' + type + '" geändert von ' + email); } catch (e) {}
  }
  return saveRes;
}
function apiPromptEditorClearTypeGeminiSettings(type) {
  var email = getCurrentUserEmail_();
  if (!canEditType_(email, type)) return { success: false, error: 'Nicht autorisiert für diesen Prompt-Typ.' };
  var res = getAutoFixSettings_();
  if (!res.success) return { success: false, error: res.error };
  var settings = res.settings;
  delete settings['geminiModel_' + type];
  delete settings['geminiTemp_' + type];
  delete settings['geminiMaxTokens_' + type];
  delete settings['geminiTmThreshold_' + type];
  delete settings['geminiThinking_' + type];
  var saveRes = saveAutoFixSettingsAudited_(settings);
  if (saveRes.success) {
    try { logAudit_('Prompt Editor', 'Gemini-Settings für Typ "' + type + '" auf global zurückgesetzt von ' + email); } catch (e) {}
  }
  return saveRes;
}

// ?????????????????????????????????????????????????????????????????????
// API – ADMIN-ONLY: Prompt Spaces anlegen / löschen
// ?????????????????????????????????????????????????????????????????????
function apiPromptEditorAddType(label, exampleText, seedInstructions) {
  var email = getCurrentUserEmail_();
  if (!isPromptEditorAdmin_(email)) return { success: false, error: 'Nur für Admins.' };
  var cleanLabel = String(label || '').trim();
  if (!cleanLabel) return { success: false, error: 'Bitte einen Namen für den neuen Prompt Space angeben.' };
  var type = sanitizeTypeKey_(cleanLabel);
  if (!type) return { success: false, error: 'Aus diesem Namen lässt sich kein gültiger interner Schlüssel bilden. Bitte Buchstaben oder Zahlen verwenden.' };
  var list = getPromptTypesConfig_();
  if (list.some(function (t) { return t.type === type; })) {
    return { success: false, error: 'Es gibt bereits einen Prompt Space mit diesem Namen.' };
  }
  list.push({ type: type, label: cleanLabel, example: exampleText || '', builtIn: false });
  savePromptTypesConfig_(list);
  var baseInstructions = (seedInstructions && seedInstructions.trim()) ? seedInstructions : (DEFAULT_PROMPTS_['technical'] || '');
  try { saveSinglePrompt_(type, baseInstructions); } catch (e) {}
  try { logAudit_('Prompt Editor', 'Neuer Prompt Space "' + cleanLabel + '" (' + type + ') angelegt von ' + email); } catch (e) {}
  return { success: true, type: type, types: list };
}
function apiPromptEditorRemoveType(type) {
  var email = getCurrentUserEmail_();
  if (!isPromptEditorAdmin_(email)) return { success: false, error: 'Nur für Admins.' };
  var list  = getPromptTypesConfig_();
  var entry = list.find(function (t) { return t.type === type; });
  if (!entry) return { success: false, error: 'Prompt Space nicht gefunden.' };
  if (entry.builtIn) return { success: false, error: 'Fest eingebaute Prompt Spaces können nicht gelöscht werden.' };
  list = list.filter(function (t) { return t.type !== type; });
  savePromptTypesConfig_(list);
  try { logAudit_('Prompt Editor', 'Prompt Space "' + type + '" gelöscht von ' + email); } catch (e) {}
  return { success: true, types: list };
}
function apiPromptEditorGetTypesConfig() {
  var email = getCurrentUserEmail_();
  if (!isPromptEditorAdmin_(email)) return { success: false, error: 'Nur für Admins.' };
  return { success: true, types: getPromptTypesConfig_() };
}

// ?????????????????????????????????????????????????????????????????????
// API – ADMIN-ONLY: Nutzerverwaltung
// ?????????????????????????????????????????????????????????????????????
function apiPromptEditorGetUsers() {
  var email = getCurrentUserEmail_();
  if (!isPromptEditorAdmin_(email)) return { success: false, error: 'Nur für Admins.' };
  var knownTypes = getPromptTypesConfig_().map(function (t) { return { type: t.type, label: t.label }; });
  return { success: true, admins: getPromptEditorAdmins_(), users: getPromptEditorUsers_(), knownTypes: knownTypes };
}
function apiPromptEditorSaveUser(entry) {
  var email = getCurrentUserEmail_();
  if (!isPromptEditorAdmin_(email)) return { success: false, error: 'Nur für Admins.' };
  if (!entry || !isValidEmail_(entry.email)) return { success: false, error: 'Ungültige E-Mail.' };
  var e = entry.email.trim().toLowerCase();
  var users = getPromptEditorUsers_().filter(function (u) { return u.email !== e; });
  var knownKeys = getPromptTypesConfig_().map(function (t) { return t.type; });
  var types = entry.allTypes ? ['*'] : (Array.isArray(entry.types) ? entry.types : []).filter(function (t) { return knownKeys.indexOf(t) !== -1; });
  users.push({ email: e, types: types, canManageSettings: !!entry.canManageSettings });
  savePromptEditorUsers_(users);
  try { logAudit_('Prompt Editor', 'Nutzer ' + e + ' gespeichert von ' + email + ': ' + JSON.stringify(entry)); } catch (err) {}
  return { success: true, users: users };
}
function apiPromptEditorRemoveUser(rmEmail) {
  var email = getCurrentUserEmail_();
  if (!isPromptEditorAdmin_(email)) return { success: false, error: 'Nur für Admins.' };
  var e = String(rmEmail).toLowerCase();
  var users = getPromptEditorUsers_().filter(function (u) { return u.email !== e; });
  savePromptEditorUsers_(users);
  try { logAudit_('Prompt Editor', 'Nutzer ' + e + ' entfernt von ' + email); } catch (err) {}
  return { success: true, users: users };
}
function apiPromptEditorAddAdmin(newEmail) {
  var email = getCurrentUserEmail_();
  if (!isPromptEditorAdmin_(email)) return { success: false, error: 'Nur für Admins.' };
  if (!isValidEmail_(newEmail)) return { success: false, error: 'Ungültige E-Mail.' };
  var admins = getPromptEditorAdmins_();
  var e = newEmail.trim().toLowerCase();
  if (admins.indexOf(e) === -1) {
    admins.push(e);
    PropertiesService.getScriptProperties().setProperty(PROMPT_EDITOR_ADMIN_PROP_, JSON.stringify(admins));
    try { logAudit_('Prompt Editor', 'Admin ' + e + ' hinzugefügt von ' + email); } catch (err) {}
  }
  return { success: true, admins: admins };
}
function apiPromptEditorRemoveAdmin(rmEmail) {
  var email = getCurrentUserEmail_();
  if (!isPromptEditorAdmin_(email)) return { success: false, error: 'Nur für Admins.' };
  var e = String(rmEmail).toLowerCase();
  var admins = getPromptEditorAdmins_().filter(function (x) { return x !== e; });
  if (!admins.length) return { success: false, error: 'Der letzte Admin kann nicht entfernt werden.' };
  PropertiesService.getScriptProperties().setProperty(PROMPT_EDITOR_ADMIN_PROP_, JSON.stringify(admins));
  try { logAudit_('Prompt Editor', 'Admin ' + e + ' entfernt von ' + email); } catch (err) {}
  return { success: true, admins: admins };
}

// ?????????????????????????????????????????????????????????????????????
// API – ADMIN-ONLY: Export / Import der kompletten Prompt-Konfiguration
// als JSON. Beides lässt sich nach Typ filtern, der Import läuft zweistufig
// (erst analysieren, dann gezielt anwenden), damit man nie versehentlich
// alles auf einmal überschreibt.
// ?????????????????????????????????????????????????????????????????????
function apiPromptEditorExportConfig(typeKeys, includeGlobal) {
  var email = getCurrentUserEmail_();
  if (!isPromptEditorAdmin_(email)) return { success: false, error: 'Nur für Admins.' };
  var settings    = getSettings_();
  var typesConfig = getPromptTypesConfig_();
  var wanted      = (Array.isArray(typeKeys) && typeKeys.length) ? typeKeys : typesConfig.map(function (t) { return t.type; });

  var exportedTypes = typesConfig
    .filter(function (tp) { return wanted.indexOf(tp.type) !== -1; })
    .map(function (tp) {
      var hasOverride = !!(settings['geminiModel_' + tp.type] || settings['geminiTemp_' + tp.type] || settings['geminiMaxTokens_' + tp.type] || settings['geminiTmThreshold_' + tp.type] || settings['geminiThinking_' + tp.type]);
      var entry = {
        type: tp.type,
        label: tp.label,
        builtIn: !!tp.builtIn,
        example: tp.example || '',
        instructions: getPeInstructions_(settings, tp.type)
      };
      if (hasOverride) {
        var eff = getEffectiveGeminiConfig_(settings, tp.type);
        entry.geminiOverride = { model: eff.model, temperature: eff.temperature, tmThreshold: eff.tmThreshold, thinking: eff.thinking };
      }
      return entry;
    });

  var payload = { exportedAt: new Date().toISOString(), exportedBy: email, types: exportedTypes };
  if (includeGlobal) {
    payload.global = {
      primaryModel: sanitizeGeminiModel_(settings.primaryModel),
      peTemperature: settings.peTemperature,
      tmThreshold: settings.tmThreshold,
      primaryThinking: parseBoolSetting_(settings.primaryThinking, true)
    };
  }
  try { logAudit_('Prompt Editor', 'Export von ' + exportedTypes.length + ' Typ(en)' + (includeGlobal ? ' inkl. globaler Settings' : '') + ' durch ' + email); } catch (e) {}
  return { success: true, data: payload };
}

// Analysiert nur, wendet nichts an. Liefert pro gefundenem Typ zurück, ob er
// schon existiert (würde beim Import überschrieben) und ob er Gemini-
// Overrides mitbringt, damit die UI vorab eine Checkliste zeigen kann.
function apiPromptEditorPreviewImport(jsonText) {
  var email = getCurrentUserEmail_();
  if (!isPromptEditorAdmin_(email)) return { success: false, error: 'Nur für Admins.' };
  var parsed;
  try { parsed = JSON.parse(jsonText); } catch (e) { return { success: false, error: 'Kein gültiges JSON.' }; }
  if (!parsed || !Array.isArray(parsed.types)) return { success: false, error: 'Keine "types"-Liste im JSON gefunden.' };
  var existing = getPromptTypesConfig_().map(function (t) { return t.type; });
  var list = parsed.types
    .filter(function (tp) { return tp && sanitizeTypeKey_(tp.type) && typeof tp.instructions === 'string'; })
    .map(function (tp) {
      tp.type = sanitizeTypeKey_(tp.type);
      return { type: tp.type, label: tp.label || tp.type, exists: existing.indexOf(tp.type) !== -1, hasOverride: !!tp.geminiOverride };
    });
  return { success: true, types: list, hasGlobal: !!parsed.global };
}

// Wendet den Import gefiltert auf die ausgewählten Typen an. Neue Typen
// werden als eigener Prompt Space angelegt, bestehende werden überschrieben
// (Instruktionen, Beispiel, Gemini-Overrides). Globale Settings werden nur
// übernommen, wenn applyGlobal explizit gesetzt ist.
function apiPromptEditorApplyImport(jsonText, typeKeys, applyGlobal) {
  var email = getCurrentUserEmail_();
  if (!isPromptEditorAdmin_(email)) return { success: false, error: 'Nur für Admins.' };
  var parsed;
  try { parsed = JSON.parse(jsonText); } catch (e) { return { success: false, error: 'Kein gültiges JSON.' }; }
  if (!parsed || !Array.isArray(parsed.types)) return { success: false, error: 'Keine "types"-Liste im JSON gefunden.' };
  var wanted = Array.isArray(typeKeys) ? typeKeys : [];
  var res = getAutoFixSettings_();
  if (!res.success) return { success: false, error: res.error };
  var settings    = res.settings;
  var typesConfig = getPromptTypesConfig_();
  var applied     = [];

  parsed.types.forEach(function (tp) {
    if (!tp || typeof tp.instructions !== 'string' || !tp.instructions.trim()) return;
    tp.type = sanitizeTypeKey_(tp.type);   // Typ-Keys landen in HTML-IDs/onclick – nie ungeprüft übernehmen
    if (!tp.type) return;
    if (wanted.indexOf(tp.type) === -1) return;
    var idx = -1;
    for (var i = 0; i < typesConfig.length; i++) if (typesConfig[i].type === tp.type) { idx = i; break; }
    if (idx === -1) {
      typesConfig.push({ type: tp.type, label: tp.label || tp.type, example: tp.example || '', builtIn: false });
    } else if (!typesConfig[idx].builtIn) {
      typesConfig[idx].example = tp.example || typesConfig[idx].example;
    }
    settings['peInstructions_' + tp.type] = tp.instructions;
    if (tp.geminiOverride) {
      if (tp.geminiOverride.model) settings['geminiModel_' + tp.type] = sanitizeGeminiModel_(tp.geminiOverride.model);
      if (tp.geminiOverride.temperature !== undefined) settings['geminiTemp_' + tp.type] = parseFloat(tp.geminiOverride.temperature);
      if (tp.geminiOverride.tmThreshold !== undefined) settings['geminiTmThreshold_' + tp.type] = parseFloat(tp.geminiOverride.tmThreshold);
      if (tp.geminiOverride.thinking !== undefined) settings['geminiThinking_' + tp.type] = tp.geminiOverride.thinking ? 'true' : 'false';
    }
    applied.push(tp.type);
  });

  if (applyGlobal && parsed.global) {
    if (parsed.global.primaryModel) settings.primaryModel = sanitizeGeminiModel_(parsed.global.primaryModel);
    if (parsed.global.peTemperature !== undefined) settings.peTemperature = parseFloat(parsed.global.peTemperature);
    if (parsed.global.tmThreshold !== undefined) settings.tmThreshold = parseFloat(parsed.global.tmThreshold);
    if (parsed.global.primaryThinking !== undefined) settings.primaryThinking = parsed.global.primaryThinking ? 'true' : 'false';
  }

  savePromptTypesConfig_(typesConfig);
  var saveRes = saveAutoFixSettingsAudited_(settings);
  if (saveRes.success) {
    try { logAudit_('Prompt Editor', 'Import angewendet: ' + applied.join(', ') + (applyGlobal && parsed.global ? ' + global' : '') + ' durch ' + email); } catch (e) {}
  }
  return { success: !!saveRes.success, error: saveRes.error, applied: applied };
}