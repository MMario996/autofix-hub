// =====================================================================
// AUTOFIX HUB - SETTINGS (Settings.gs)
// FIX 9  ? Multi-Prompt: Jeder AutoFix-Typ hat einen eigenen Prompt.
//          Prompts werden im Settings-Sheet als separate Zeilen gespeichert
//          (Key: peInstructions_<type>) und sind ?ber die UI editierbar.
// FIX 15 ? resolveAutoFixType_ matched jetzt zus?tzlich ?ber den sichtbaren
//          Options-Text (z.B. "Campus") gegen die dynamisch im Prompt
//          Editor angelegten Prompt Spaces (getPromptTypesConfig_ aus
//          PromptEditorAccess.gs). Vorher fiel jede unbekannte Options-UID
//          stillschweigend auf 'technical' zur?ck ? ein neuer Space wie
//          Campus wurde dadurch zwar gefunden, aber mit dem falschen
//          Prompt verarbeitet. Die alte AUTOFIX_OPTION_MAP_ bleibt als
//          Legacy-Fallback f?r die zwei historischen UIDs erhalten.
// =====================================================================

// =====================================================================
// OPTION UID ? TYPE NAME MAPPING (Legacy-Fallback)
// Nur noch f?r die beiden historischen Optionen n?tig. Neue Optionen
// werden automatisch ?ber ihren sichtbaren Text den Prompt Spaces
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

  technical: `=== POST-EDITIERUNG (PE) ? K?RCHER TECHNISCHE DOKUMENTATION ===

AUFTRAG: Du bist ein professioneller ?bersetzer/Post-Editor bei K?rcher.
Du erh?ltst maschinell ?bersetzte Segmente (DeepL) aus technischen Dokumenten
(Servicehandb?cher, Bedienungsanleitungen, Datenbl?tter) und verbesserst diese
aktiv auf Publikationsqualit?t.

PFLICHT-KORREKTUREN (immer pr?fen und ggf. korrigieren):
1. TERMINOLOGIE: Alle tbHits (Termbase-Eintr?ge) M?SSEN exakt ?bernommen werden ? kein Kompromiss.
2. PRODUKTNAMEN: "K?rcher" immer mit Umlaut. Produktnamen wie "K 2", "HD 6/13" strukturell unver?ndert.
3. ZAHLEN & EINHEITEN: Niemals Zahlen, Ma?einheiten (bar, ?C, l/h, kW), Produktnummern ver?ndern.
4. TAGS & PLATZHALTER: Alle {0}, %s, <x/>, <g> etc. 1:1 beibehalten.
5. VOLLST?NDIGKEIT: Pr?fen ob Source-Inhalt vollst?ndig im Target vorhanden ist.
6. BEDEUTUNG: Mistranslations und falsche Bedeutungen korrigieren.

AKTIVE VERBESSERUNGEN:
7. NAT?RLICHKEIT: W?rtliche, unnat?rliche Konstruktionen in idiomatische Zielsprache ?berf?hren.
8. STIL & REGISTER: Technisch-pr?zise, sachlich, direkt. Kein Marketing-Ton.
9. FL?SSIGKEIT: S?tze die holprig klingen gl?tten ? auch wenn die Bedeutung korrekt ist.
10. KOH?RENZ: Gleiche Begriffe und Strukturen konsistent halten.
11. FACHSPRACHE: Technische Terme in der Zielsprache korrekt und fachgerecht formulieren.

NICHT VER?NDERN:
- Zahlen, Ma?einheiten, Produktcodes
- Korrekte TM 100%-Matches ohne inhaltliche Fehler
- Tags und Platzhalter
- Warnhinweis-Schl?sselw?rter (WARNING, ATTENTION, DANGER, NOTICE)

WICHTIG: Sei aktiv und verbessere. Wenn du eine bessere Formulierung siehst: verwende sie.`,

  marketing: `=== POST-EDITIERUNG (PE) ? K?RCHER MARKETING ===

AUFTRAG: Du bist ein professioneller ?bersetzer/Post-Editor bei K?rcher.
Du erh?ltst maschinell ?bersetzte Segmente (DeepL) aus Marketing-Materialien
(Kampagnen, Produktbeschreibungen, Website-Texte, Social Media) und verbesserst
diese aktiv auf Publikationsqualit?t.

PFLICHT-KORREKTUREN (immer pr?fen und ggf. korrigieren):
1. TERMINOLOGIE: Alle tbHits (Termbase-Eintr?ge) M?SSEN exakt ?bernommen werden ? kein Kompromiss.
2. PRODUKTNAMEN: "K?rcher" immer mit Umlaut. Produktnamen strukturell unver?ndert.
3. ZAHLEN & EINHEITEN: Ma?einheiten und Produktnummern niemals ver?ndern.
4. TAGS & PLATZHALTER: Alle {0}, %s, <x/>, <g> etc. 1:1 beibehalten.
5. VOLLST?NDIGKEIT: Pr?fen ob Source-Inhalt vollst?ndig im Target vorhanden ist.
6. BEDEUTUNG: Mistranslations und falsche Bedeutungen korrigieren.

AKTIVE VERBESSERUNGEN:
7. TONALIT?T: K?rcher Marketing-Tonalit?t: kraftvoll, inspirierend, kundennah.
   Aktive Sprache bevorzugen. Direkte Ansprache wo passend.
8. NAT?RLICHKEIT: Idiomatische Zielsprache ? nicht w?rtlich ?bersetzen.
   Texte sollen sich anf?hlen als w?ren sie original in der Zielsprache verfasst.
9. WERBEWIRKUNG: Emotionale St?rke und Call-to-Action beibehalten.
   Slogans, Headlines und Claims besonders sorgf?ltig behandeln.
10. LOKALANPASSUNG: Kulturell passende Formulierungen f?r den Zielmarkt.
    Was im Deutschen funktioniert, muss nicht 1:1 in jede Sprache ?bertragbar sein.
11. KONSISTENZ: Gleiche Kernbotschaften einheitlich kommunizieren.

NICHT VER?NDERN:
- Produktcodes und technische Spezifikationen
- Tags und Platzhalter
- Eingetragene Markennamen und Slogans (nur wenn explizit lokalisiert)
- Kampagnen-Hashtags und Social-Media-Handles

WICHTIG: Marketing-Texte brauchen Energie und ?berzeugungskraft.
Eine korrekte aber flache ?bersetzung ist nicht ausreichend ? sei mutig und
w?hle die Formulierung die in der Zielsprache wirklich ?berzeugt.`

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

  // Prompts als separate Keys einf?gen
  Object.keys(DEFAULT_PROMPTS_).forEach(function(type) {
    settings['peInstructions_' + type] = DEFAULT_PROMPTS_[type];
  });

  return settings;
}

// =====================================================================
// FIX 15: OPTION UID/TEXT ? TYPE AUFL?SEN
//
// Reihenfolge:
//   1. Legacy-UID-Map (AUTOFIX_OPTION_MAP_) ? f?r die beiden historischen
//      Optionen, die schon vor den dynamischen Prompt Spaces existierten.
//   2. Sichtbarer Options-Text gegen das Label eines Prompt Spaces
//      matchen (case-insensitive) ? das ist der Normalfall f?r alles,
//      was ?ber den Prompt Editor neu angelegt wurde, z.B. "Campus".
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
 * Gibt alle bekannten AutoFix-Typen zur?ck ? jetzt aus der dynamischen
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
  // Fallback, falls PromptEditorAccess.gs aus irgendeinem Grund nicht verf?gbar ist
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
    settings.peTemperature         = parseFloat(settings.peTemperature)         || 0.1;
    settings.maxTokens             = parseInt(settings.maxTokens)               || 32768;
    settings.tmThreshold           = parseFloat(settings.tmThreshold)           || 0.7;
    settings.pollerIntervalMinutes = parseInt(settings.pollerIntervalMinutes)   || 10;
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
 * Gibt den Prompt f?r einen bestimmten AutoFix-Typ zur?ck.
 * Fallback: technical ? default
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

function saveAutoFixSettings_(settings, ssObj) {
  var ss    = ssObj || getDbSheet_();
  var sheet = ss.getSheetByName('Settings');
  sheet.clearContents();
  sheet.appendRow(['Key', 'Value']);
  Object.keys(settings).forEach(function(k) {
    var raw = settings[k];
    var val = escapeSheetValue_(raw === null || raw === undefined ? '' : String(raw));
    sheet.appendRow([k, val]);
  });
}

function saveAutoFixSettings(settings) {
  try {
    saveAutoFixSettings_(settings);
    logAudit_('Settings Updated', 'AutoFix Settings aktualisiert.');
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

/**
 * Speichert einen einzelnen Prompt f?r einen Typ.
 * Wird vom Frontend aufgerufen wenn ein einzelner Prompt-Editor gespeichert wird.
 */
function saveSinglePrompt(autoFixType, promptText) {
  try {
    if (!autoFixType || typeof promptText !== 'string') {
      return { success: false, error: 'Ung?ltige Parameter.' };
    }
    var res      = getAutoFixSettings();
    var settings = res.settings;
    settings['peInstructions_' + autoFixType] = promptText;
    saveAutoFixSettings_(settings);
    logAudit_('Prompt Updated', 'Prompt f?r Typ "' + autoFixType + '" aktualisiert.');
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

/**
 * Setzt den Prompt eines Typs auf den Default zur?ck.
 */
function resetPromptForType(autoFixType) {
  try {
    var type    = autoFixType || 'technical';
    var res     = getAutoFixSettings();
    var settings = res.settings;
    settings['peInstructions_' + type] = DEFAULT_PROMPTS_[type] || DEFAULT_PROMPTS_['technical'];
    saveAutoFixSettings_(settings);
    return { success: true, prompt: settings['peInstructions_' + type] };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

/**
 * Legacy-Kompatibilit?t: resetPeInstructions setzt technical zur?ck.
 */
function resetPeInstructions() {
  return resetPromptForType('technical');
}

/**
 * Gibt alle Prompt-Typen mit ihren aktuellen Prompts zur?ck.
 * Wird vom Frontend f?r die dynamische Prompt-Card-Liste verwendet.
 */
function getAllPrompts() {
  try {
    var res      = getAutoFixSettings();
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