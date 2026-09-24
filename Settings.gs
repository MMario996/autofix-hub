// =====================================================================
// AUTOFIX HUB - SETTINGS (Settings.gs)
// FIX 9  – Multi-Prompt: Jeder AutoFix-Typ hat einen eigenen Prompt.
//          Prompts werden im Settings-Sheet als separate Zeilen gespeichert
//          (Key: peInstructions_<type>) und sind über die UI editierbar.
// FIX 15 – resolveAutoFixType_ matched jetzt zusätzlich über den sichtbaren
//          Options-Text (z.B. "Campus") gegen die dynamisch im Prompt
//          Editor angelegten Prompt Spaces (getPromptTypesConfig_ aus
//          PromptEditorAccess.gs). Vorher fiel jede unbekannte Options-UID
//          stillschweigend auf 'technical' zurück – ein neuer Space wie
//          Campus wurde dadurch zwar gefunden, aber mit dem falschen
//          Prompt verarbeitet. Die alte AUTOFIX_OPTION_MAP_ bleibt als
//          Legacy-Fallback für die zwei historischen UIDs erhalten.
// =====================================================================

// =====================================================================
// OPTION UID – TYPE NAME MAPPING (Legacy-Fallback)
// Nur noch für die beiden historischen Optionen nötig. Neue Optionen
// werden automatisch über ihren sichtbaren Text den Prompt Spaces
// zugeordnet, siehe resolveAutoFixType_ unten.
// =====================================================================
var AUTOFIX_OPTION_MAP_ = {
  '7d95rL0n0lA894J0CRXaL9': 'technical',          // True (Legacy-Fallback)
  '2HtFqxLWLZp3126BkQ6li1': 'technical',          // Technical Documentation
  'YddgPfvnHZ8A4li6KxmYS2': 'marketing'           // Marketing
};

// =====================================================================
// DEFAULT PROMPTS
// =====================================================================

var DEFAULT_PROMPTS_ = {

  technical: `=== POST-EDITIERUNG (PE) – KÄRCHER TECHNISCHE DOKUMENTATION ===

AUFTRAG: Du bist ein professioneller Übersetzer/Post-Editor bei Kärcher.
Du erhältst maschinell übersetzte Segmente (DeepL) aus technischen Dokumenten
(Servicehandbücher, Bedienungsanleitungen, Datenblätter) und verbesserst diese
aktiv auf Publikationsqualität.

PFLICHT-KORREKTUREN (immer prüfen und ggf. korrigieren):
1. TERMINOLOGIE: Alle tbHits (Termbase-Einträge) MÜSSEN exakt übernommen werden – kein Kompromiss.
2. PRODUKTNAMEN: "Kärcher" immer mit Umlaut. Produktnamen wie "K 2", "HD 6/13" strukturell unverändert.
3. ZAHLEN & EINHEITEN: Niemals Zahlen, Maßeinheiten (bar, °C, l/h, kW), Produktnummern verändern.
4. TAGS & PLATZHALTER: Alle {0}, %s, <x/>, <g> etc. 1:1 beibehalten.
5. VOLLSTÄNDIGKEIT: Prüfen ob Source-Inhalt vollständig im Target vorhanden ist.
6. BEDEUTUNG: Mistranslations und falsche Bedeutungen korrigieren.

AKTIVE VERBESSERUNGEN:
7. NATÜRLICHKEIT: Wörtliche, unnatürliche Konstruktionen in idiomatische Zielsprache überführen.
8. STIL & REGISTER: Technisch-präzise, sachlich, direkt. Kein Marketing-Ton.
9. FLÜSSIGKEIT: Sätze die holprig klingen glätten – auch wenn die Bedeutung korrekt ist.
10. KOHÄRENZ: Gleiche Begriffe und Strukturen konsistent halten.
11. FACHSPRACHE: Technische Terme in der Zielsprache korrekt und fachgerecht formulieren.

NICHT VERÄNDERN:
- Zahlen, Maßeinheiten, Produktcodes
- Korrekte TM 100%-Matches ohne inhaltliche Fehler
- Tags und Platzhalter
- Warnhinweis-Schlüsselwörter (WARNING, ATTENTION, DANGER, NOTICE)

WICHTIG: Sei aktiv und verbessere. Wenn du eine bessere Formulierung siehst: verwende sie.`,

  marketing: `=== POST-EDITIERUNG (PE) – KÄRCHER MARKETING ===

AUFTRAG: Du bist ein professioneller Übersetzer/Post-Editor bei Kärcher.
Du erhältst maschinell übersetzte Segmente (DeepL) aus Marketing-Materialien
(Kampagnen, Produktbeschreibungen, Website-Texte, Social Media) und verbesserst
diese aktiv auf Publikationsqualität.

PFLICHT-KORREKTUREN (immer prüfen und ggf. korrigieren):
1. TERMINOLOGIE: Alle tbHits (Termbase-Einträge) MÜSSEN exakt übernommen werden – kein Kompromiss.
2. PRODUKTNAMEN: "Kärcher" immer mit Umlaut. Produktnamen strukturell unverändert.
3. ZAHLEN & EINHEITEN: Maßeinheiten und Produktnummern niemals verändern.
4. TAGS & PLATZHALTER: Alle {0}, %s, <x/>, <g> etc. 1:1 beibehalten.
5. VOLLSTÄNDIGKEIT: Prüfen ob Source-Inhalt vollständig im Target vorhanden ist.
6. BEDEUTUNG: Mistranslations und falsche Bedeutungen korrigieren.

AKTIVE VERBESSERUNGEN:
7. TONALITÄT: Kärcher Marketing-Tonalität: kraftvoll, inspirierend, kundennah.
   Aktive Sprache bevorzugen. Direkte Ansprache wo passend.
8. NATÜRLICHKEIT: Idiomatische Zielsprache – nicht wörtlich übersetzen.
   Texte sollen sich anfühlen als wären sie original in der Zielsprache verfasst.
9. WERBEWIRKUNG: Emotionale Stärke und Call-to-Action beibehalten.
   Slogans, Headlines und Claims besonders sorgfältig behandeln.
10. LOKALANPASSUNG: Kulturell passende Formulierungen für den Zielmarkt.
    Was im Deutschen funktioniert, muss nicht 1:1 in jede Sprache übertragbar sein.
11. KONSISTENZ: Gleiche Kernbotschaften einheitlich kommunizieren.

NICHT VERÄNDERN:
- Produktcodes und technische Spezifikationen
- Tags und Platzhalter
- Eingetragene Markennamen und Slogans (nur wenn explizit lokalisiert)
- Kampagnen-Hashtags und Social-Media-Handles

WICHTIG: Marketing-Texte brauchen Energie und Überzeugungskraft.
Eine korrekte aber flache Übersetzung ist nicht ausreichend – sei mutig und
wähle die Formulierung die in der Zielsprache wirklich überzeugt.`

};

// =====================================================================
// DEFAULT SETTINGS
// =====================================================================

function getDefaultAutoFixSettings_() {
  var settings = {
    // Phrase Custom Field UIDs
    cfFieldUid:   '1uw8kvE6WNhT6Gw0XeX4Z4',
    wfStepName:   'PE Gemini',

    // Gemini
    primaryModel:   'gemini-3.6-flash',
    peTemperature:  0.1,
    maxTokens:      32768,

    // TM
    tmThreshold: 0.7,

    // Poller
    pollerIntervalMinutes: 10,

    // Verhalten nach Fix
    markDoneAfterFix: true
  };

  // Prompts als separate Keys einfügen
  Object.keys(DEFAULT_PROMPTS_).forEach(function(type) {
    settings['peInstructions_' + type] = DEFAULT_PROMPTS_[type];
  });

  return settings;
}

// =====================================================================
// FIX 15: OPTION UID/TEXT – TYPE AUFLÖSEN
//
// Reihenfolge:
//   1. Legacy-UID-Map (AUTOFIX_OPTION_MAP_) – für die beiden historischen
//      Optionen, die schon vor den dynamischen Prompt Spaces existierten.
//   2. Sichtbarer Options-Text gegen das Label eines Prompt Spaces
//      matchen (case-insensitive) – das ist der Normalfall für alles,
//      was über den Prompt Editor neu angelegt wurde, z.B. "Campus".
//   3. Sichtbarer Options-Text gegen den internen Typ-Key matchen,
//      falls Label und Key auseinanderlaufen.
//   4. Fallback: 'technical'.
//
// optionValue ist der sichtbare Text der Custom-Field-Option in Phrase
// (z.B. "Campus"), wird von getAutoFixProjects_/testProjectSearch mitgegeben.
// =====================================================================
function resolveAutoFixType_(optionUid, optionValue) {
  if (AUTOFIX_OPTION_MAP_[optionUid]) return AUTOFIX_OPTION_MAP_[optionUid];
  try {
    var typesConfig = getPromptTypesConfig_(); // aus PromptEditorAccess.gs
    var val = String(optionValue || '').trim().toLowerCase();
    if (val) {
      var byLabel = typesConfig.find(function(t) { return String(t.label || '').trim().toLowerCase() === val; });
      if (byLabel) return byLabel.type;
      var key = sanitizeTypeKey_(optionValue); // aus PromptEditorAccess.gs
      var byKey = typesConfig.find(function(t) { return t.type === key; });
      if (byKey) return byKey.type;
    }
  } catch (e) {
    Logger.log('[resolveAutoFixType_] Fehler beim dynamischen Matching: ' + e.message);
  }
  return 'technical';
}

/**
 * Gibt alle bekannten AutoFix-Typen zurück – jetzt aus der dynamischen
 * Prompt-Space-Konfiguration (getPromptTypesConfig_), nicht mehr nur aus
 * der alten Legacy-UID-Map. So tauchen neu angelegte Spaces wie Campus
 * auch hier automatisch auf.
 */
function getKnownAutoFixTypes_() {
  try {
    var typesConfig = getPromptTypesConfig_(); // aus PromptEditorAccess.gs
    if (typesConfig && typesConfig.length) {
      return typesConfig.map(function(t) { return t.type; });
    }
  } catch (e) {}
  // Fallback, falls PromptEditorAccess.gs aus irgendeinem Grund nicht verfügbar ist
  var types = [], seen = {};
  Object.keys(AUTOFIX_OPTION_MAP_).forEach(function(uid) {
    var t = AUTOFIX_OPTION_MAP_[uid];
    if (!seen[t]) { seen[t] = true; types.push(t); }
  });
  return types;
}

// =====================================================================
// SHEET ESCAPE/UNESCAPE
// =====================================================================

function escapeSheetValue_(val) {
  if (typeof val !== 'string') return val;
  if (val.startsWith('=') || val.startsWith('+') || val.startsWith('-') ||
      val.startsWith('@') || val.startsWith('*') || val.startsWith('#')) {
    return "'" + val;
  }
  return val;
}

function unescapeSheetValue_(val) {
  if (typeof val === 'string' && val.startsWith("'") && val.length > 1) {
    var second = val.charAt(1);
    if (second === '=' || second === '+' || second === '-' ||
        second === '@' || second === '*' || second === '#') {
      return val.substring(1);
    }
  }
  return val;
}

// =====================================================================
// SETTINGS LESEN
// =====================================================================

function getAutoFixSettings() {
  requireHubAccess_();
  return getAutoFixSettings_();
}

function getAutoFixSettings_() {
  try {
    var ss       = getDbSheet_();
    var sheet    = ss.getSheetByName('Settings');
    var data     = sheet.getDataRange().getValues();
    var settings = getDefaultAutoFixSettings_();

    for (var i = 1; i < data.length; i++) {
      var key = data[i][0];
      if (!key) continue;
      var val = data[i][1];
      val = unescapeSheetValue_(String(val === null || val === undefined ? '' : val));
      if (val === '' && typeof settings[key] !== 'string') continue;
      settings[key] = val;
    }

    // Typkonvertierungen
    // Bewusst kein "|| default": sonst wäre z.B. Temperature 0 nicht speicherbar.
    settings.peTemperature         = numOr_(parseFloat(settings.peTemperature), 0.1);
    settings.maxTokens             = numOr_(parseInt(settings.maxTokens, 10), 32768);
    settings.tmThreshold           = numOr_(parseFloat(settings.tmThreshold), 0.7);
    settings.pollerIntervalMinutes = numOr_(parseInt(settings.pollerIntervalMinutes, 10), 10);
    settings.markDoneAfterFix      = settings.markDoneAfterFix === 'true' || settings.markDoneAfterFix === true;

    // Sicherstellen dass alle bekannten Typen einen Prompt haben
    getKnownAutoFixTypes_().forEach(function(type) {
      var key = 'peInstructions_' + type;
      if (!settings[key] || settings[key].trim() === '') {
        settings[key] = DEFAULT_PROMPTS_[type] || DEFAULT_PROMPTS_['technical'];
      }
    });

    return { success: true, settings: settings };
  } catch(e) {
    return { success: false, error: e.message, settings: getDefaultAutoFixSettings_() };
  }
}

/**
 * Gibt den Prompt für einen bestimmten AutoFix-Typ zurück.
 * Fallback: technical – default
 */
function getPeInstructions_(settings, autoFixType) {
  var type    = autoFixType || 'technical';
  var key     = 'peInstructions_' + type;
  var prompt  = settings[key];
  if (!prompt || prompt.trim() === '') {
    // Fallback auf technical
    prompt = settings['peInstructions_technical'];
  }
  if (!prompt || prompt.trim() === '') {
    prompt = DEFAULT_PROMPTS_['technical'];
  }
  return prompt;
}

// =====================================================================
// SETTINGS SCHREIBEN
// =====================================================================

function numOr_(n, fallback) { return (typeof n === 'number' && !isNaN(n)) ? n : fallback; }

// Schreibt das komplette Settings-Objekt in EINEM setValues-Aufruf (statt
// clearContents + appendRow pro Key). Vorher gab es zwischen clearContents
// und dem letzten appendRow ein Fenster, in dem parallele Leser ein leeres
// Sheet sahen und mit Default-Prompts weiterarbeiteten.
function saveAutoFixSettings_(settings, ssObj) {
  var ss    = ssObj || getDbSheet_();
  var sheet = ss.getSheetByName('Settings');
  var rows  = [['Key', 'Value']];
  Object.keys(settings).forEach(function(k) {
    var raw = settings[k];
    rows.push([k, escapeSheetValue_(raw === null || raw === undefined ? '' : String(raw))]);
  });
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    sheet.clearContents();
    sheet.getRange(1, 1, rows.length, 2).setNumberFormat('@').setValues(rows);
  } finally {
    lock.releaseLock();
  }
}

function saveAutoFixSettingsAudited_(settings) {
  try {
    saveAutoFixSettings_(settings);
    logAudit_('Settings Updated', 'AutoFix Settings aktualisiert von ' + getCurrentUserEmail_() + '.');
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

// Felder, die der Hub-Settings-Tab ändern darf. Alles andere (Prompts,
// Typ-Overrides, primaryThinking …) bleibt unangetastet. Vorher hat
// saveAutoFixSettings das übergebene Objekt 1:1 ins Sheet geschrieben –
// der Settings-Tab schickt aber nur 7 Felder, dadurch wurden bei jedem
// Speichern ALLE eigenen Prompts und Gemini-Overrides gelöscht.
var HUB_EDITABLE_SETTINGS_ = ['cfFieldUid', 'wfStepName', 'primaryModel', 'tmThreshold',
                              'pollerIntervalMinutes', 'peTemperature', 'markDoneAfterFix'];

function saveAutoFixSettings(patch) {
  requireHubAccess_();
  var res = getAutoFixSettings_();
  if (!res.success) return { success: false, error: res.error };
  var settings = res.settings;
  HUB_EDITABLE_SETTINGS_.forEach(function(k) {
    if (patch && patch[k] !== undefined && patch[k] !== null && String(patch[k]).trim() !== '') {
      settings[k] = String(patch[k]).trim();
    }
  });
  settings.primaryModel = sanitizeGeminiModel_(settings.primaryModel);
  var t = parseFloat(settings.peTemperature);
  if (isNaN(t) || t < 0 || t > 2) return { success: false, error: 'PE Temperature muss zwischen 0 und 2 liegen.' };
  var tm = parseFloat(settings.tmThreshold);
  if (isNaN(tm) || tm < 0 || tm > 1) return { success: false, error: 'TM Threshold muss zwischen 0 und 1 liegen.' };
  var iv = parseInt(settings.pollerIntervalMinutes, 10);
  if ([1, 5, 10, 15, 30].indexOf(iv) === -1) return { success: false, error: 'Poller-Intervall muss 1, 5, 10, 15 oder 30 Minuten sein.' };
  return saveAutoFixSettingsAudited_(settings);
}

/**
 * Speichert einen einzelnen Prompt für einen Typ.
 * Wird vom Frontend aufgerufen wenn ein einzelner Prompt-Editor gespeichert wird.
 */
function saveSinglePrompt(autoFixType, promptText) {
  requireHubAccess_();
  return saveSinglePrompt_(autoFixType, promptText);
}

function saveSinglePrompt_(autoFixType, promptText) {
  try {
    if (!autoFixType || typeof promptText !== 'string') {
      return { success: false, error: 'Ungültige Parameter.' };
    }
    var res      = getAutoFixSettings_();
    if (!res.success) return { success: false, error: res.error };
    var settings = res.settings;
    settings['peInstructions_' + autoFixType] = promptText;
    saveAutoFixSettings_(settings);
    logAudit_('Prompt Updated', 'Prompt für Typ "' + autoFixType + '" aktualisiert.');
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

/**
 * Setzt den Prompt eines Typs auf den Default zurück.
 */
function resetPromptForType(autoFixType) {
  requireHubAccess_();
  return resetPromptForType_(autoFixType);
}

function resetPromptForType_(autoFixType) {
  try {
    var type    = autoFixType || 'technical';
    var res     = getAutoFixSettings_();
    if (!res.success) return { success: false, error: res.error };
    var settings = res.settings;
    settings['peInstructions_' + type] = DEFAULT_PROMPTS_[type] || DEFAULT_PROMPTS_['technical'];
    saveAutoFixSettings_(settings);
    return { success: true, prompt: settings['peInstructions_' + type] };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

/**
 * Legacy-Kompatibilität: resetPeInstructions setzt technical zurück.
 */
function resetPeInstructions() {
  return resetPromptForType('technical');
}

/**
 * Gibt alle Prompt-Typen mit ihren aktuellen Prompts zurück.
 * Wird vom Frontend für die dynamische Prompt-Card-Liste verwendet.
 */
function getAllPrompts() {
  requireHubAccess_();
  try {
    var res      = getAutoFixSettings_();
    var settings = res.settings;
    var types    = getKnownAutoFixTypes_();
    var prompts  = types.map(function(type) {
      return {
        type:         type,
        label:        typeToLabel_(type),
        instructions: settings['peInstructions_' + type] || DEFAULT_PROMPTS_[type] || ''
      };
    });
    return { success: true, prompts: prompts };
  } catch(e) {
    return { success: false, error: e.message, prompts: [] };
  }
}

/** Konvertiert einen internen Typ-Key in ein lesbares Label. */
function typeToLabel_(type) {
  var map = {
    'technical': 'Technical Documentation',
    'marketing': 'Marketing'
  };
  if (map[type]) return map[type];
  try {
    var typesConfig = getPromptTypesConfig_(); // aus PromptEditorAccess.gs
    var found = typesConfig.find(function(t) { return t.type === type; });
    if (found && found.label) return found.label;
  } catch (e) {}
  return type.charAt(0).toUpperCase() + type.slice(1);
}