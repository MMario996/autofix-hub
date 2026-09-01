// =====================================================================
// AUTOFIX HUB - CORE BACKEND (Code.gs)
// FIX 14 ? Fallback-Modell-Liste bereinigt: "gemini-2.5-pro" ist f?r
//          unseren API-Key/Gateway nicht mehr verf?gbar (404 "no longer
//          available to new users") und wurde aus allen Fallback-/
//          Retry-Listen entfernt. Aktuell einziges freigeschaltetes
//          Modell: gemini-3.6-flash. Alle anderen FIX-Kommentare wie
//          im Original erhalten.
// =====================================================================

function doGet(e) {
  var page = (e && e.parameter && e.parameter.page) || '';
  if (page === 'prompts') {
    return renderPromptEditorPage_(); // aus PromptEditorAccess.gs
  }
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('AutoFix Hub')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// =====================================================================
// KONSTANTEN
// =====================================================================
var AUTOFIX_CF_FIELD_UID_DEFAULT_ = '1uw8kvE6WNhT6Gw0XeX4Z4';
var AUTOFIX_WF_STEP_NAME_DEFAULT_ = 'PE Gemini';
var AUTOFIX_BATCH_SIZE_           = 25;

function writeRunStatus_(msg, level) {
  try {
    var props   = PropertiesService.getScriptProperties();
    var raw     = props.getProperty('AUTOFIX_RUN_LOG');
    var entries = raw ? JSON.parse(raw) : [];
    entries.push({
      t:     new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      level: level || 'INFO',
      msg:   msg
    });
    if (entries.length > 150) entries = entries.slice(-150);
    props.setProperty('AUTOFIX_RUN_LOG', JSON.stringify(entries));
    Logger.log('[' + (level || 'INFO') + '] ' + msg);
  } catch(e) {
    Logger.log('[writeRunStatus_] Fehler: ' + e.message);
  }
}

function getRunStatus() {
  try {
    var raw     = PropertiesService.getScriptProperties().getProperty('AUTOFIX_RUN_LOG');
    var entries = raw ? JSON.parse(raw) : [];
    return { success: true, entries: entries };
  } catch(e) {
    return { success: false, entries: [] };
  }
}

function clearRunStatus() {
  try {
    PropertiesService.getScriptProperties().deleteProperty('AUTOFIX_RUN_LOG');
    return { success: true };
  } catch(e) {
    return { success: false };
  }
}

var AUTOFIX_PROJECT_CACHE_KEY_ = 'AUTOFIX_PROJECT_CACHE';
var AUTOFIX_PROJECT_CACHE_TTL_ = 15 * 60 * 1000;

function getCachedProjects_() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(AUTOFIX_PROJECT_CACHE_KEY_);
    if (!raw) return null;
    var cache = JSON.parse(raw);
    if (!cache.ts || !cache.projects) return null;
    if (Date.now() - cache.ts > AUTOFIX_PROJECT_CACHE_TTL_) {
      PropertiesService.getScriptProperties().deleteProperty(AUTOFIX_PROJECT_CACHE_KEY_);
      return null;
    }
    var ageMin = Math.round((Date.now() - cache.ts) / 60000);
    Logger.log('[Cache] Hit ? ' + cache.projects.length + ' Projekte, Alter: ' + ageMin + ' Min.');
    return cache.projects;
  } catch(e) {
    Logger.log('[Cache] Lese-Fehler: ' + e.message);
    return null;
  }
}

function setCachedProjects_(projects) {
  try {
    var payload = JSON.stringify({ ts: Date.now(), projects: projects });
    if (payload.length > 8500) {
      Logger.log('[Cache] Payload zu gro? (' + payload.length + ' Bytes) ? kein Caching.');
      return;
    }
    PropertiesService.getScriptProperties().setProperty(AUTOFIX_PROJECT_CACHE_KEY_, payload);
    Logger.log('[Cache] Gespeichert: ' + projects.length + ' Projekte.');
  } catch(e) {
    Logger.log('[Cache] Schreib-Fehler: ' + e.message);
  }
}

function clearProjectCache() {
  try {
    PropertiesService.getScriptProperties().deleteProperty(AUTOFIX_PROJECT_CACHE_KEY_);
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

var AUTOFIX_RUNNING_KEY_     = 'AUTOFIX_RUNNING';
var AUTOFIX_RUNNING_TIMEOUT_ = 25 * 60 * 1000;

function isRunning_() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(AUTOFIX_RUNNING_KEY_);
    if (!raw) return false;
    var data = JSON.parse(raw);
    if (Date.now() - data.ts > AUTOFIX_RUNNING_TIMEOUT_) {
      Logger.log('[RunLock] Stale lock ? automatisch freigegeben.');
      clearRunning_();
      return false;
    }
    var ageMin = Math.round((Date.now() - data.ts) / 60000);
    Logger.log('[RunLock] Run aktiv seit ' + ageMin + ' Min ? neuer Start ?bersprungen.');
    return true;
  } catch(e) {
    Logger.log('[RunLock] Lese-Fehler: ' + e.message);
    return false;
  }
}

function setRunning_() {
  try {
    PropertiesService.getScriptProperties().setProperty(
      AUTOFIX_RUNNING_KEY_,
      JSON.stringify({ ts: Date.now() })
    );
  } catch(e) {
    Logger.log('[RunLock] Schreib-Fehler: ' + e.message);
  }
}

function clearRunning_() {
  try {
    PropertiesService.getScriptProperties().deleteProperty(AUTOFIX_RUNNING_KEY_);
  } catch(e) {
    Logger.log('[RunLock] L?sch-Fehler: ' + e.message);
  }
}

function forceUnlock() {
  clearRunning_();
  return { success: true, message: 'RunLock manuell freigegeben.' };
}

function getPhraseToken_() {
  var token = PropertiesService.getScriptProperties().getProperty('PHRASE_API_TOKEN');
  if (!token) throw new Error('Kein PHRASE_API_TOKEN in Script Properties gefunden.');
  return 'Bearer ' + token.trim();
}

function getGeminiKey_() {
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) throw new Error('Kein GEMINI_API_KEY in Script Properties gefunden.');
  return key.trim();
}

function phraseFetch_(url, options) {
  var defaults = {
    muteHttpExceptions: true,
    headers: { 'Authorization': getPhraseToken_(), 'Accept': 'application/json' }
  };
  var opts = Object.assign({}, defaults, options || {});
  if (opts.payload && typeof opts.payload === 'object' && !opts._rawPayload) {
    opts.payload     = JSON.stringify(opts.payload);
    opts.contentType = 'application/json';
  }
  var res  = UrlFetchApp.fetch(url, opts);
  var code = res.getResponseCode();
  if (code >= 400) throw new Error('Phrase API ' + code + ': ' + res.getContentText().substring(0, 400));
  var text = res.getContentText();
  if (!text || text.trim() === '') return {};
  try { return JSON.parse(text); } catch(e) { return { _raw: text }; }
}

function getSettings_() {
  var res = getAutoFixSettings();
  return res.success ? res.settings : getDefaultAutoFixSettings_();
}

function testConnection() {
  try {
    var phrase   = phraseFetch_('https://cloud.memsource.com/web/api2/v1/auth/whoAmI');
    var settings = getSettings_();
    var key      = getGeminiKey_();
    var url      = 'https://34-111-99-134.nip.io/gemini/v1beta/models/' +
                   (settings.primaryModel || 'gemini-3.6-flash') + ':generateContent';
    var res = UrlFetchApp.fetchAll([{
      url: url, method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'x-api-key': key, 'Accept': 'application/json' },
      payload: JSON.stringify({ contents: [{ parts: [{ text: 'Hi' }] }] })
    }]);
    if (res[0].getResponseCode() >= 400) throw new Error('Gemini ' + res[0].getResponseCode());
    return { success: true, user: phrase.user.userName, model: (settings.primaryModel || 'gemini-3.6-flash') + ' OK' };
  } catch(e) { return { success: false, error: e.message }; }
}

function testProjectSearch() {
  try {
    var settings     = getSettings_();
    var cfFieldUid   = settings.cfFieldUid || AUTOFIX_CF_FIELD_UID_DEFAULT_;
    var wfStepName   = settings.wfStepName || AUTOFIX_WF_STEP_NAME_DEFAULT_;
    var data    = phraseFetch_('https://cloud.memsource.com/web/api2/v1/projects?pageSize=5&sort=DATE_CREATED&order=DESC');
    var logs    = [];
    var content = data.content || [];
    for (var i = 0; i < content.length; i++) {
      var p   = content[i];
      var log = 'Projekt: ' + p.name + ' (' + p.uid + ', ' + p.status + ', ' + (p.sourceLang || '?') + ')\n';
      try {
        var cfData = phraseFetch_('https://cloud.memsource.com/web/api2/v1/projects/' + p.uid + '/customFields');
        var f = (cfData.content || []).find(function(cf) {
          return cf.customField && cf.customField.uid === cfFieldUid;
        });
        if (!f) {
          log += '  Custom Field fehlt\n';
        } else {
          var opts = f.selectedOptions || [];
          if (!opts.length) {
            log += '  AutoFix nicht gesetzt\n';
          } else {
            var type = resolveAutoFixType_(opts[0].uid, opts[0].value);
            log += '  AutoFix = "' + opts[0].value + '" -> Typ: ' + type + '\n';
          }
        }
      } catch(e) { log += '  CF: ' + e.message + '\n'; }
      try {
        var pd = phraseFetch_('https://cloud.memsource.com/web/api2/v1/projects/' + p.uid);
        var ts = (pd.workflowSteps || []).find(function(s) { return String(s.name || '').trim().toLowerCase() === String(wfStepName || '').trim().toLowerCase(); });
        if (!ts) { log += '  Step "' + wfStepName + '" nicht gefunden\n'; }
        else {
          log += '  Step "' + wfStepName + '" Level ' + ts.workflowLevel + '\n';
          var jd = phraseFetch_('https://cloud.memsource.com/web/api2/v1/projects/' + p.uid +
                                '/jobs?pageSize=50&workflowLevel=' + ts.workflowLevel);
          (jd.content || []).forEach(function(j) {
            log += '    ' + ((j.status === 'NEW' || j.status === 'ACCEPTED') ? 'OK' : 'WARN') +
                   ' ' + j.filename + ' (' + j.status + ')\n';
          });
        }
      } catch(e) { log += '  Jobs: ' + e.message + '\n'; }
      logs.push(log);
    }
    return { success: true, resultText: logs.join('\n' + '-'.repeat(50) + '\n') };
  } catch(e) { return { success: false, error: e.message }; }
}

function getAutoFixProjects() {
  try {
    var settings   = getSettings_();
    var cfFieldUid = settings.cfFieldUid || AUTOFIX_CF_FIELD_UID_DEFAULT_;

    var cached = getCachedProjects_();
    if (cached !== null) return { success: true, projects: cached, fromCache: true };

    Logger.log('[AutoFix] Cache-Miss ? lade Projekte von Phrase (ASSIGNED + NEW)?');
    var url  = 'https://cloud.memsource.com/web/api2/v1/projects' +
               '?pageSize=50&status=ASSIGNED&status=NEW&sort=DATE_CREATED&order=DESC';
    var data = phraseFetch_(url);
    var content = data.content || [];
    Logger.log('[AutoFix] Projekte gesamt (ASSIGNED+NEW): ' + content.length);

    var result = [];
    for (var i = 0; i < content.length; i++) {
      var p = content[i];
      try {
        var cfData = phraseFetch_(
          'https://cloud.memsource.com/web/api2/v1/projects/' + p.uid + '/customFields'
        );
        var f = (cfData.content || []).find(function(cf) {
          return cf.customField && cf.customField.uid === cfFieldUid;
        });

        if (!f || !f.selectedOptions || !f.selectedOptions.length) continue;

        var selectedOptionUid   = f.selectedOptions[0].uid;
        var selectedOptionValue = f.selectedOptions[0].value;
        var autoFixType         = resolveAutoFixType_(selectedOptionUid, selectedOptionValue);

        if (!autoFixType) continue;

        var jobs = getAutoFixJobsForProject_(p.uid, settings);
        if (!jobs.length) continue;

        result.push({
          uid:           p.uid,
          name:          p.name,
          sourceLang:    p.sourceLang || 'de_de',
          targetLangs:   p.targetLangs || [],
          status:        p.status,
          jobs:          jobs,
          cfInstanceUid: f.uid,
          autoFixType:   autoFixType
        });
      } catch(e) {
        Logger.log('[AutoFix] Fehler Projekt ' + p.uid + ': ' + e.message);
      }
    }

    Logger.log('[AutoFix] Projekte mit AutoFix-Flag: ' + result.length);
    setCachedProjects_(result);
    return { success: true, projects: result, fromCache: false };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

function getAutoFixJobsForProject_(projectUid, settings) {
  var wfStepName = (settings && settings.wfStepName) || AUTOFIX_WF_STEP_NAME_DEFAULT_;
  var pd = phraseFetch_('https://cloud.memsource.com/web/api2/v1/projects/' + projectUid);
  var ts = (pd.workflowSteps || []).find(function(s) { return String(s.name || '').trim().toLowerCase() === String(wfStepName || '').trim().toLowerCase(); });
  if (!ts) return [];
  var data = phraseFetch_(
    'https://cloud.memsource.com/web/api2/v1/projects/' + projectUid +
    '/jobs?pageSize=50&workflowLevel=' + ts.workflowLevel
  );
  return (data.content || [])
    .filter(function(j) { return j.status === 'NEW' || j.status === 'ACCEPTED'; })
    .map(function(j) {
      return {
        uid: j.uid, filename: j.filename, targetLang: j.targetLang,
        status: j.status, wordsCount: j.wordsCount || 0,
        workflowStep: ts.name, workflowLevel: ts.workflowLevel
      };
    });
}

function downloadBilingualMxliff_(projectUid, jobUid) {
  var res = UrlFetchApp.fetch(
    'https://cloud.memsource.com/web/api2/v1/projects/' + projectUid +
    '/jobs/bilingualFile?format=MXLF&preview=false',
    {
      method: 'post', muteHttpExceptions: true,
      headers: {
        'Authorization': getPhraseToken_(),
        'Content-Type':  'application/json',
        'Accept':        'application/octet-stream, application/mxliff, */*'
      },
      payload: JSON.stringify({ jobs: [{ uid: jobUid }] })
    }
  );
  if (res.getResponseCode() >= 400) {
    throw new Error('MXLIFF Download ' + res.getResponseCode() + ': ' + res.getContentText().substring(0, 300));
  }
  var cd = res.getHeaders()['Content-Disposition'] || res.getHeaders()['content-disposition'] || '';
  return { content: res.getContentText(), filename: extractFilename_(cd, jobUid) };
}

function extractFilename_(cd, jobUid) {
  var utf8   = cd.match(/filename\*=UTF-8''([^\s;]+)/i);
  if (utf8) { try { return decodeURIComponent(utf8[1]); } catch(e) {} }
  var simple = cd.match(/filename="?([^";\r\n]+)"?/i);
  if (simple) return simple[1].trim();
  return 'autofix_' + jobUid + '.mxliff';
}

function extractSegmentsFromMxliff_(xmlString) {
  var segments = [];
  var tuRegex  = /<trans-unit\s[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/trans-unit>/g;
  var match;
  while ((match = tuRegex.exec(xmlString)) !== null) {
    var id     = match[1];
    var tuBody = match[2];
    var tuTag  = match[0].substring(0, match[0].indexOf('>') + 1);
    if (/translate\s*=\s*"no"/i.test(tuTag)) continue;
    var sourceMatch = tuBody.match(/<source[^>]*>([\s\S]*?)<\/source>/);
    var source = sourceMatch ? stripTags_(sourceMatch[1]).trim() : '';
    if (!source) continue;
    var targetMatch = tuBody.match(/<target[^>]*>([\s\S]*?)<\/target>/);
    var target = targetMatch ? stripTags_(targetMatch[1]).trim() : '';
    segments.push({ id: id, source: source, target: target, _tuBody: tuBody, _tuFull: match[0] });
  }
  Logger.log('[Extract] ' + segments.length + ' Segmente gefunden.');
  return segments;
}

function stripTags_(html) {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function patchMxliffString_(xmlString, corrections, segments) {
  var patched    = xmlString;
  var patchCount = 0;
  for (var i = 0; i < segments.length; i++) {
    var seg       = segments[i];
    var corrected = corrections[seg.id];
    if (!corrected || corrected.trim() === seg.target.trim()) continue;
    var idPattern = new RegExp(
      '(<trans-unit\\s[^>]*id="' + escapeRegex_(seg.id) + '"[^>]*>)([\\s\\S]*?)(<\\/trans-unit>)'
    );
    var tuMatch = idPattern.exec(patched);
    if (!tuMatch) continue;
    var tuOpen  = tuMatch[1], tuBody = tuMatch[2], tuClose = tuMatch[3];
    var targetTagMatch = tuBody.match(/<target([^>]*)>([\s\S]*?)<\/target>/);
    if (!targetTagMatch) continue;
    var targetAttrs = targetTagMatch[1], originalTarget = targetTagMatch[0];
    var newTargetAttrs = targetAttrs;
    if (/state\s*=/.test(newTargetAttrs)) {
      newTargetAttrs = newTargetAttrs.replace(/state\s*=\s*"[^"]*"/, 'state="translated"');
    } else {
      newTargetAttrs = ' state="translated"' + newTargetAttrs;
    }
    var newTarget = '<target' + newTargetAttrs + '>' + escapeXml_(corrected) + '</target>';
    var newTuBody = tuBody.replace(originalTarget, newTarget);
    if (tuOpen + tuBody + tuClose !== tuOpen + newTuBody + tuClose) {
      patched = patched.replace(tuOpen + tuBody + tuClose, tuOpen + newTuBody + tuClose);
      patchCount++;
    }
  }
  Logger.log('[Patch] ' + patchCount + ' Segmente gepatcht.');
  return { xliff: patched, patchCount: patchCount };
}

function escapeRegex_(str) { return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function escapeXml_(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function uploadBilingualFile_(xliffString, filename) {
  var url      = 'https://cloud.memsource.com/web/api2/v2/bilingualFiles?saveToTransMemory=Confirmed&setCompleted=true';
  var fname    = filename ? filename.replace(/\.(xliff|mxlf|mxliff)$/i, '') + '.mxliff' : 'autofix.mxliff';
  var boundary = '----AutoFixHubBoundary' + Date.now();
  var CRLF     = '\r\n';
  var preStr   = '--' + boundary + CRLF +
    'Content-Disposition: form-data; name="file"; filename="' + fname + '"' + CRLF +
    'Content-Type: application/octet-stream' + CRLF + CRLF;
  var postStr  = CRLF + '--' + boundary + '--' + CRLF;
  var bodyBytes = [].concat(
    Utilities.newBlob(preStr, 'text/plain').getBytes(),
    Utilities.newBlob(xliffString, 'application/octet-stream', fname).getBytes(),
    Utilities.newBlob(postStr, 'text/plain').getBytes()
  );
  var res  = UrlFetchApp.fetch(url, {
    method: 'post', muteHttpExceptions: true,
    headers: { 'Authorization': getPhraseToken_(), 'Content-Type': 'multipart/form-data; boundary=' + boundary },
    payload: bodyBytes
  });
  var code = res.getResponseCode();
  var body = res.getContentText();
  if (code >= 400) throw new Error('Upload Fehler ' + code + ': ' + body.substring(0, 400));
  try { return JSON.parse(body); } catch(e) { return { _raw: body }; }
}

function getTbHitsForAllSegments_(projectUid, jobUid, segments, sourceLang) {
  if (!segments || !segments.length) return [];
  try {
    var combinedText = segments.map(function(s) { return s.source; }).join(' | ');
    var lang       = (sourceLang || 'de_de').toLowerCase();
    var isDeSource = lang === 'de_de' || lang === 'de_at' || lang === 'de_ch' ||
                     lang.indexOf('de') === 0;
    var reverseFlag = !isDeSource;
    Logger.log('[TB] sourceLang=' + lang + ' ? reverse=' + reverseFlag);

    var data = phraseFetch_(
      'https://cloud.memsource.com/web/api2/v2/projects/' + projectUid +
      '/jobs/' + jobUid + '/termBases/searchInTextByJob',
      { method: 'post', payload: { text: combinedText, reverse: reverseFlag } }
    );
    var hits = [], seen = new Set();
    (data.searchResults || []).forEach(function(res) {
      var src = res.sourceTerm && res.sourceTerm.text ? res.sourceTerm.text : '';
      (res.translationTerms || []).forEach(function(tgt) {
        var key = src + '|||' + tgt.text;
        if (!seen.has(key) && src && tgt.text) { seen.add(key); hits.push({ src: src, tgt: tgt.text }); }
      });
    });
    Logger.log('[TB] Global TB Hits: ' + hits.length);
    return hits;
  } catch(e) {
    Logger.log('[TB] Fehler: ' + e.message);
    return [];
  }
}

function filterTbHitsForSegment_(globalTbHits, sourceText) {
  var lower = sourceText.toLowerCase();
  return globalTbHits.filter(function(h) { return lower.indexOf(h.src.toLowerCase()) !== -1; });
}

function buildPePrompt_(settings, sourceLang, targetLang, segments, batchInfo, autoFixType) {
  var batchBlock = batchInfo
    ? '\n=== BATCH ' + batchInfo.current + '/' + batchInfo.total +
      ' (Seg ' + batchInfo.from + '?' + batchInfo.to + ') ===\n'
    : '';
  var allIds = segments.map(function(s) { return '"' + s.id + '"'; }).join(', ');

  var peInstructions = getPeInstructions_(settings, autoFixType);

  return 'Du bist ein professioneller Post-Editor f?r Alfred K?rcher SE & Co. KG.\n' +
    'Quellsprache: ' + sourceLang + ' | Zielsprache: ' + targetLang + '\n' +
    'Dokumenttyp: ' + typeToLabel_(autoFixType || 'technical') + '\n' +
    batchBlock + '\n' +
    '=== PE-ANWEISUNGEN ===\n' +
    peInstructions + '\n\n' +
    '=== TERMBASE (verbindlich) ===\n' +
    'Jedes Segment enth?lt "tbHits". Wenn tbHit.src im Source vorkommt: IMMER tbHit.tgt im Target verwenden.\n\n' +
    '=== SEGMENTE ===\n' +
    JSON.stringify(segments, null, 2) + '\n\n' +
    '=== AUSGABE ===\n' +
    'KRITISCHE REGELN ZUR SEGMENT-ISOLATION UND TAGS (NO BOUNDARY BLEEDING!):\n' +
    '1. Jede "id" ist eine physische Systemgrenze. Du darfst NIEMALS den Text aus einem Segment kopieren und in die ?bersetzung eines anderen Segments einf?gen.\n' +
    '2. Die Tags im Text haben das Format {1>...<1} oder <1/>. Diese Tags sind heilige Platzhalter! Sie d?rfen weder gel?scht, noch verschoben, noch ver?ndert werden. Du darfst keine eigenen Tags erfinden.\n' +
    '3. ANKER-REGEL: Um sicherzustellen, dass du nicht im Segment verrutschst, MUSST du im Feld "source_reference" die ersten 3 W?rter des Quellsatzes eintragen. Das zwingt dich, beim richtigen Satz zu bleiben!\n' +
    '4. Das Verschmelzen oder Zusammenfassen von zwei Segmenten f?hrt zu einem kritischen Datenbankabsturz. Halte dich an die exakte Fragmentierung des Originals.\n\n' +
    'VOLLST?NDIGKEIT: Du MUSST f?r JEDES der ' + segments.length + ' Segmente exakt einen Eintrag liefern.\n' +
    'Erwartete IDs: [' + allIds + ']\n\n' +
    'FORMAT (nur valides JSON, kein Markdown):\n' +
    '{\n  "results": [\n    {\n      "id": "<id>",\n      "source_reference": "<erste 3 W?rter des Source-Texts>",\n      "corrected": "<text>",\n      "changed": true/false,\n      "reason": "<max 80 Zeichen Begr?ndung>"\n    }\n  ]\n}\n' +
    '- bei changed=false: corrected identisch mit target lassen\n' +
    '- Zahlen, Produktnamen, Ma?einheiten NICHT ?ndern';
}

function runGeminiPeBatchesParallel_(settings, sourceLang, targetLang, enrichedSegments, autoFixType) {
  var totalBatches = Math.ceil(enrichedSegments.length / AUTOFIX_BATCH_SIZE_);
  var key          = getGeminiKey_();
  var primaryModel = settings.primaryModel || 'gemini-3.6-flash';
  var geminiUrl    = 'https://34-111-99-134.nip.io/gemini/v1beta/models/' + primaryModel + ':generateContent';

  var batches = [];
  for (var b = 0; b < totalBatches; b++) {
    var bStart = b * AUTOFIX_BATCH_SIZE_;
    var bEnd   = Math.min(bStart + AUTOFIX_BATCH_SIZE_, enrichedSegments.length);
    var slice  = enrichedSegments.slice(bStart, bEnd);

    var prompt = buildPePrompt_(settings, sourceLang, targetLang, slice, {
      current: b + 1, total: totalBatches, from: bStart + 1, to: bEnd
    }, autoFixType);

    batches.push({
      index: b, from: bStart + 1, to: bEnd, segments: slice,
      request: {
        url: geminiUrl, method: 'post', contentType: 'application/json',
        muteHttpExceptions: true,
        headers: { 'x-api-key': key, 'Accept': 'application/json' },
        payload: JSON.stringify({
          contents:         [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature:      parseFloat(settings.peTemperature) || 0.3,
            responseMimeType: 'application/json',
            maxOutputTokens:  parseInt(settings.maxTokens) || 32768
          }
        })
      }
    });
  }

  writeRunStatus_(enrichedSegments.length + ' Segmente ? ' + totalBatches +
    ' Batch(es) parallel [' + typeToLabel_(autoFixType) + ']', 'INFO');
  Logger.log('[PE parallel] Feuere ' + totalBatches + ' Batches f?r Typ "' + autoFixType + '"?');

  var requests  = batches.map(function(b) { return b.request; });
  var responses = UrlFetchApp.fetchAll(requests);

  var allCorrections = {}, allChanges = [], usedModel = primaryModel;
  var retryBatches   = [];

  for (var i = 0; i < responses.length; i++) {
    var batch = batches[i];
    var res   = responses[i];
    var code  = res.getResponseCode();
    var body  = res.getContentText();

    if (code === 429) {
      Logger.log('[PE parallel] Batch ' + (batch.index + 1) + ' Rate Limit ? Retry geplant.');
      writeRunStatus_('Batch ' + (batch.index + 1) + ' Rate Limit ? Retry?', 'WARN');
      retryBatches.push(batch);
      continue;
    }
    if (code >= 400) {
      Logger.log('[PE parallel] Batch ' + (batch.index + 1) + ' Fehler ' + code);
      writeRunStatus_('Batch ' + (batch.index + 1) + ' Fehler ' + code, 'ERR');
      continue;
    }

    var parsed = parseBatchResponse_(body, batch.index + 1);
    if (!parsed) continue;
    var batchChanged = applyBatchResults_(parsed, batch.segments, allCorrections, allChanges);
    writeRunStatus_('Batch ' + (batch.index + 1) + '/' + totalBatches + ' fertig: ' + batchChanged + ' ?nderungen', 'OK');
  }

  if (retryBatches.length > 0) {
    Logger.log('[PE parallel] Retry ' + retryBatches.length + ' Batch(es) sequenziell?');
    Utilities.sleep(3000);
    for (var r = 0; r < retryBatches.length; r++) {
      var retryBatch = retryBatches[r];
      writeRunStatus_('Retry Batch ' + (retryBatch.index + 1) + '?', 'INFO');
      try {
        // FIX 14: nur noch Modelle, die f?r unseren Key tats?chlich verf?gbar
        // sind. "gemini-2.5-pro" wurde entfernt (f?hrte zu 404 "no longer
        // available to new users").
        var fallbackModels = [primaryModel, 'gemini-3.6-flash'];
        var retryBody = null;
        for (var m = 0; m < fallbackModels.length; m++) {
          var fallbackUrl = 'https://34-111-99-134.nip.io/gemini/v1beta/models/' + fallbackModels[m] + ':generateContent';
          var retryRes = UrlFetchApp.fetch(fallbackUrl, Object.assign({}, retryBatch.request, { url: fallbackUrl }));
          if (retryRes.getResponseCode() < 400) { retryBody = retryRes.getContentText(); usedModel = fallbackModels[m]; break; }
          if (m < fallbackModels.length - 1) Utilities.sleep(2000);
        }
        if (!retryBody) { writeRunStatus_('Retry Batch ' + (retryBatch.index + 1) + ' endg?ltig fehlgeschlagen.', 'ERR'); continue; }
        var retryParsed  = parseBatchResponse_(retryBody, retryBatch.index + 1);
        if (!retryParsed) continue;
        var retryChanged = applyBatchResults_(retryParsed, retryBatch.segments, allCorrections, allChanges);
        writeRunStatus_('Retry Batch ' + (retryBatch.index + 1) + ' fertig: ' + retryChanged + ' ?nderungen', 'OK');
      } catch(e) {
        writeRunStatus_('Retry Batch ' + (retryBatch.index + 1) + ' Exception: ' + e.message, 'ERR');
      }
      if (r < retryBatches.length - 1) Utilities.sleep(1500);
    }
  }

  Logger.log('[PE parallel] Gesamt: ' + allChanges.length + '/' + enrichedSegments.length + ' | Model: ' + usedModel);
  return { corrections: allCorrections, changes: allChanges, usedModel: usedModel };
}

function parseBatchResponse_(body, batchNum) {
  try {
    var json    = JSON.parse(body);
    var rawText = json.candidates[0].content.parts[0].text;
    rawText     = rawText.replace(/^```(json)?\s*/gi, '').replace(/```\s*$/gi, '').trim();
    return JSON.parse(rawText).results || [];
  } catch(e) {
    Logger.log('[PE parallel] Batch ' + batchNum + ' Parse-Fehler: ' + e.message);
    return null;
  }
}

// =====================================================================
// FIX 16: ANKER-VERIFIKATION GEGEN VERRUTSCHTE SEGMENT-ZUORDNUNG
//
// Der Prompt (buildPePrompt_) verlangt von Gemini pro Segment ein Feld
// "source_reference" mit den ersten Worten des Source-Texts, genau damit
// sich pr?fen l?sst, ob die zur?ckgegebene "id" wirklich zum richtigen
// Segment geh?rt. Bisher wurde dieses Feld nie ausgewertet ? applyBatchResults_
// hat jede id blind ?bernommen. Bei gro?en Batches (mehrere hundert Segmente,
// mehrere Batches parallel) kann das Modell bei der id "verrutschen":
// die Korrektur ist inhaltlich f?r Segment N gedacht, wird aber mit der id
// von Segment N+2 oder N-3 zur?ckgegeben ? die Korrektur landet dann auf
// dem falschen Segment, ohne dass irgendwo ein Fehler auftaucht.
//
// isAnchorMatch_ pr?ft nur das erste Wort des Source-Texts gegen den
// mitgelieferten Anker (bewusst locker, um keine legitimen Korrekturen wegen
// kleiner Tokenisierungs-Unterschiede zu verwerfen) ? bei einer echten
// Verschiebung ist das erste Wort so gut wie nie identisch, bei korrekter
// Zuordnung so gut wie immer.
// =====================================================================
function isAnchorMatch_(sourceText, anchorText) {
  var firstWord_ = function(s) {
    var m = String(s || '').trim().match(/[\p{L}\p{N}]+/u);
    return m ? m[0].toLowerCase() : '';
  };
  var srcFirst    = firstWord_(sourceText);
  var anchorFirst = firstWord_(anchorText);
  if (!srcFirst || !anchorFirst) return true; // nichts zum Pr?fen da ? nicht blockieren
  return srcFirst === anchorFirst;
}

function applyBatchResults_(results, batchSegments, allCorrections, allChanges) {
  var changed = 0;
  results.forEach(function(r) {
    if (!r.id || !r.changed || !r.corrected) return;
    var segId = String(r.id);
    // FIX 16a: id muss zu einem Segment IN DIESEM BATCH geh?ren. Eine id, die
    // im Batch gar nicht vorkommt, ist per Definition eine Fehlzuordnung.
    var orig = batchSegments.find(function(s) { return String(s.id) === segId; });
    if (!orig) {
      Logger.log('[PE parallel] Segment-id "' + segId + '" geh?rt nicht zum aktuellen Batch ? verworfen.');
      return;
    }
    // FIX 16b: Anker-Verifikation gegen den echten Source-Text des Segments.
    if (!isAnchorMatch_(orig.source, r.source_reference)) {
      Logger.log('[PE parallel] Anker-Mismatch bei Segment ' + segId + ' ? Korrektur verworfen. ' +
        'Source: "' + orig.source.substring(0, 50) + '" | Anker von Gemini: "' + (r.source_reference || '') + '"');
      try { writeRunStatus_('Anker-Mismatch bei Segment ' + segId + ' ? Korrektur sicherheitshalber verworfen', 'WARN'); } catch(e) {}
      return;
    }
    allCorrections[segId] = r.corrected;
    allChanges.push({
      id: segId, source: orig.source,
      original: orig.target, corrected: r.corrected, reason: r.reason || ''
    });
    changed++;
  });
  return changed;
}

function replayChangesForJob(projectUid, jobUid, changesJson) {
  try {
    var changes = changesJson;
    if (typeof changes === 'string') {
      try { changes = JSON.parse(changes); }
      catch(e) { return { success: false, error: 'Changes JSON konnte nicht geparst werden: ' + e.message }; }
    }
    if (!Array.isArray(changes) || !changes.length) return { success: false, error: 'Keine Changes vorhanden.' };
    var sourceMap = new Map();
    changes.forEach(function(c) {
      sourceMap.set(normalizeText_(c.source), { corrected: c.corrected, original: c.original, reason: c.reason });
    });
    var download = downloadBilingualMxliff_(projectUid, jobUid);
    var segments = extractSegmentsFromMxliff_(download.content);
    var corrections = {}, matchedChanges = [];
    segments.forEach(function(seg) {
      var match = sourceMap.get(normalizeText_(seg.source));
      if (match) {
        corrections[seg.id] = match.corrected;
        matchedChanges.push({ id: seg.id, source: seg.source, original: seg.target, corrected: match.corrected, reason: '[Replay] ' + (match.reason || '') });
      }
    });
    var notMatched = changes.length - matchedChanges.length;
    if (!matchedChanges.length) return { success: false, error: 'Keine Segmente konnten gematcht werden.' };
    var patchResult  = patchMxliffString_(download.content, corrections, segments);
    var uploadResult = uploadBilingualFile_(patchResult.xliff, download.filename);
    logRun_(projectUid, 'Replay', { uid: jobUid, targetLang: (uploadResult.jobs && uploadResult.jobs[0]) ? uploadResult.jobs[0].targetLang : '?' }, {
      success: true, segmentsTotal: segments.length, segmentsChanged: matchedChanges.length,
      model: 'replay (no AI)', changes: matchedChanges
    });
    return { success: true, jobUid: jobUid, matched: matchedChanges.length, notMatched: notMatched, totalChanges: changes.length, patchCount: patchResult.patchCount, changes: matchedChanges };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

function normalizeText_(text) {
  if (!text) return '';
  return text.trim().replace(/\s+/g, ' ');
}

function applyFixAndCompleteJob_(projectUid, job, settings) {
  var autoFixType = job.autoFixType || 'technical';
  var sourceLang  = job.sourceLang  || 'de_de';
  Logger.log('[AutoFix] Job: ' + job.uid + ' | ' + job.filename +
             ' | ' + sourceLang + '?' + job.targetLang + ' | Typ: ' + autoFixType);
  writeRunStatus_('Job: ' + job.filename +
    ' (' + sourceLang + '?' + job.targetLang + ') [' + typeToLabel_(autoFixType) + ']', 'INFO');

  writeRunStatus_('MXLIFF herunterladen?', 'INFO');
  var download = downloadBilingualMxliff_(projectUid, job.uid);

  var segments = extractSegmentsFromMxliff_(download.content);
  writeRunStatus_(segments.length + ' Segmente gefunden', 'INFO');
  if (!segments.length) {
    writeRunStatus_('Keine Segmente ? Job ?bersprungen', 'WARN');
    return { success: true, jobUid: job.uid, segmentsTotal: 0, segmentsChanged: 0, changes: [], skipped: true, reason: 'Keine Segmente' };
  }

  var translated = segments.filter(function(s) { return s.target && s.target.trim() !== ''; });

  writeRunStatus_('Termbase laden?', 'INFO');
  var globalTbHits = getTbHitsForAllSegments_(projectUid, job.uid, translated, sourceLang);
  writeRunStatus_(globalTbHits.length + ' TB-Treffer geladen', 'INFO');

  var enriched = translated.map(function(s) {
    return { id: s.id, source: s.source, target: s.target, tmMatches: [], tbHits: filterTbHitsForSegment_(globalTbHits, s.source) };
  });

  var peResult = runGeminiPeBatchesParallel_(settings, sourceLang, job.targetLang, enriched, autoFixType);

  writeRunStatus_(peResult.changes.length + '/' + enriched.length + ' Segmente ge?ndert', 'INFO');

  writeRunStatus_('MXLIFF patchen & hochladen?', 'INFO');
  var patchResult  = patchMxliffString_(download.content, peResult.corrections, segments);
  var uploadResult = uploadBilingualFile_(patchResult.xliff, download.filename);
  if (uploadResult.jobs) uploadResult.jobs.forEach(function(j) { Logger.log('[AutoFix] Job ' + j.uid + ': ' + j.status); });

  writeRunStatus_('Job abgeschlossen: ' + job.filename + ' | ' + peResult.changes.length + ' Seg ge?ndert', 'OK');

  return {
    success: true, jobUid: job.uid, filename: job.filename, targetLang: job.targetLang,
    sourceLang: sourceLang,
    autoFixType: autoFixType,
    segmentsTotal: enriched.length, segmentsChanged: peResult.changes.length,
    batchCount: Math.ceil(enriched.length / AUTOFIX_BATCH_SIZE_),
    model: peResult.usedModel, changes: peResult.changes
  };
}

function processNextJob_() {
  var settings = getSettings_();
  var res      = getAutoFixProjects();
  if (!res.success || !res.projects.length) {
    writeRunStatus_('Keine Projekte mit AutoFix-Flag.', 'INFO');
    return { processed: false };
  }

  var project     = res.projects[0];
  var job         = project.jobs[0];
  job.sourceLang  = project.sourceLang || 'de_de';
  job.autoFixType = project.autoFixType || 'technical';

  Logger.log('[AutoFix] N?chster Job: ' + job.filename + ' | ' + job.sourceLang +
             '?' + job.targetLang + ' | Projekt: ' + project.name + ' | Typ: ' + job.autoFixType);
  writeRunStatus_('Projekt: ' + project.name + ' ? Job: ' + job.filename +
                  ' (' + job.sourceLang + '?' + job.targetLang + ') [' + typeToLabel_(job.autoFixType) + ']', 'INFO');

  var result;
  try {
    result = applyFixAndCompleteJob_(project.uid, job, settings);
  } catch(e) {
    Logger.log('[AutoFix] Job Fehler: ' + e.message);
    writeRunStatus_('Job Fehler: ' + e.message, 'ERR');
    result = { success: false, jobUid: job.uid, filename: job.filename, targetLang: job.targetLang, error: e.message, changes: [] };
  }

  logRun_(project.uid, project.name, job, result);
  clearProjectCache();

  try {
    var remainingJobs = getAutoFixJobsForProject_(project.uid, settings);
    if (!remainingJobs.length) {
      writeRunStatus_('Alle Jobs in "' + project.name + '" abgeschlossen.', 'OK');
      if (settings.markDoneAfterFix) markProjectAutofixDone_(project.uid, settings);
    } else {
      writeRunStatus_(remainingJobs.length + ' Job(s) noch offen ? n?chster Tick.', 'INFO');
    }
  } catch(e) {
    Logger.log('[AutoFix] Remaining-Check Fehler: ' + e.message);
  }

  return { processed: true, project: project.name, job: job.filename, result: result };
}

function runAllJobsForAllProjects_() {
  var settings = getSettings_();
  var res      = getAutoFixProjects();
  if (!res.success) return { success: false, error: res.error };
  var projects = res.projects || [];
  if (!projects.length) return { success: true, count: 0, results: [] };

  writeRunStatus_(projects.length + ' Projekt(e) gefunden.', 'INFO');
  var allResults = [];

  for (var i = 0; i < projects.length; i++) {
    var project = projects[i];
    writeRunStatus_('Projekt: ' + project.name + ' [' + typeToLabel_(project.autoFixType) + '] ? ' + project.jobs.length + ' Job(s)', 'INFO');
    var projectResults = [];

    for (var j = 0; j < project.jobs.length; j++) {
      var job         = project.jobs[j];
      job.sourceLang  = project.sourceLang || 'de_de';
      job.autoFixType = project.autoFixType || 'technical';
      var result;
      try {
        result = applyFixAndCompleteJob_(project.uid, job, settings);
      } catch(e) {
        writeRunStatus_('Job Fehler: ' + job.filename + ' ? ' + e.message, 'ERR');
        result = { success: false, jobUid: job.uid, filename: job.filename, targetLang: job.targetLang, error: e.message, changes: [] };
      }
      logRun_(project.uid, project.name, job, result);
      projectResults.push(result);
      if (j < project.jobs.length - 1) Utilities.sleep(500);
    }

    if (projectResults.every(function(r) { return r.success; }) && settings.markDoneAfterFix) {
      try { markProjectAutofixDone_(project.uid, settings); } catch(e) {}
    }
    clearProjectCache();
    var projectSuccess = projectResults.every(function(r) { return r.success; });
    var projectError    = projectSuccess ? null : projectResults.filter(function(r) { return !r.success; }).map(function(r) { return (r.filename || r.jobUid) + ': ' + r.error; }).join(' | ');
    allResults.push({
      projectUid: project.uid, projectName: project.name, autoFixType: project.autoFixType,
      success: projectSuccess, error: projectError, results: projectResults
    });
  }

  return { success: true, count: projects.length, results: allResults };
}

function markProjectAutofixDone_(projectUid, settings) {
  phraseFetch_(
    'https://cloud.memsource.com/web/api2/v1/projects/' + projectUid + '/customFields',
    { method: 'put', payload: { customFields: [{ customField: { uid: settings.cfFieldUid || AUTOFIX_CF_FIELD_UID_DEFAULT_ }, selectedOptions: [] }] } }
  );
  Logger.log('[AutoFix] Custom Field zur?ckgesetzt: ' + projectUid);
  writeRunStatus_('AutoFix-Flag zur?ckgesetzt', 'OK');
}

function runAutoFixForProject(projectUid) {
  try {
    var settings    = getSettings_();
    var jobs        = getAutoFixJobsForProject_(projectUid, settings);
    if (!jobs.length) return { success: true, projectUid: projectUid, message: 'Keine Jobs.', results: [] };
    var projectInfo = phraseFetch_('https://cloud.memsource.com/web/api2/v1/projects/' + projectUid);
    var sourceLang  = projectInfo.sourceLang || 'de_de';
    var results     = [];
    jobs.forEach(function(job) {
      job.sourceLang  = sourceLang;
      job.autoFixType = 'technical';
      try {
        var res = applyFixAndCompleteJob_(projectUid, job, settings);
        results.push(res); logRun_(projectUid, projectInfo.name, job, res);
      } catch(e) {
        var err = { success: false, jobUid: job.uid, filename: job.filename, targetLang: job.targetLang, error: e.message, changes: [] };
        results.push(err); logRun_(projectUid, projectInfo.name, job, err);
      }
      Utilities.sleep(500);
    });
    if (results.every(function(r) { return r.success; }) && settings.markDoneAfterFix) {
      try { markProjectAutofixDone_(projectUid, settings); } catch(e) {}
    }
    clearProjectCache();
    return { success: true, projectUid: projectUid, projectName: projectInfo.name, results: results };
  } catch(e) {
    return { success: false, projectUid: projectUid, error: e.message };
  }
}

function autoFixPoller() {
  var lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(5000)) { Logger.log('[Poller] Bereits aktiv (Script Lock).'); return; }
    if (isRunning_()) { Logger.log('[Poller] Vorheriger Run noch aktiv ? Tick ?bersprungen.'); return; }
    setRunning_();
    Logger.log('[Poller] Start: ' + new Date().toISOString());
    processNextJob_();
    Logger.log('[Poller] Ende: ' + new Date().toISOString());
  } finally {
    clearRunning_();
    try { lock.releaseLock(); } catch(e) {}
  }
}

function setupAutoFixTrigger(intervalMinutes) {
  try {
    removeAutoFixTrigger();
    var mins = parseInt(intervalMinutes) || 10;
    ScriptApp.newTrigger('autoFixPoller').timeBased().everyMinutes(mins).create();
    logAudit_('Trigger Setup', 'Poller alle ' + mins + ' Min.');
    return { success: true, interval: mins };
  } catch(e) { return { success: false, error: e.message }; }
}

function setupAutoFixTrigger5Min()  { return setupAutoFixTrigger(5);  }
function setupAutoFixTrigger10Min() { return setupAutoFixTrigger(10); }
function setupAutoFixTrigger30Min() { return setupAutoFixTrigger(30); }

function removeAutoFixTrigger() {
  try {
    var removed = 0;
    ScriptApp.getProjectTriggers().forEach(function(t) {
      if (t.getHandlerFunction() === 'autoFixPoller') { ScriptApp.deleteTrigger(t); removed++; }
    });
    if (removed) logAudit_('Trigger Removed', removed + ' Trigger entfernt.');
    return { success: true, removed: removed };
  } catch(e) { return { success: false, error: e.message }; }
}

function getAutoFixTriggerStatus() {
  try {
    var t = ScriptApp.getProjectTriggers().find(function(t) { return t.getHandlerFunction() === 'autoFixPoller'; });
    return t ? { active: true, triggerId: t.getUniqueId() } : { active: false };
  } catch(e) { return { active: false, error: e.message }; }
}

function runNow() {
  try {
    if (isRunning_()) {
      var msg = 'Ein Run ist bereits aktiv ? bitte warten oder forceUnlock() aufrufen.';
      writeRunStatus_(msg, 'WARN');
      return { success: false, error: msg };
    }
    setRunning_();
    clearProjectCache();
    writeRunStatus_('Suche Projekte mit AutoFix-Flag?', 'INFO');
    var res = runAllJobsForAllProjects_();
    if (!res.success) { writeRunStatus_('Fehler: ' + res.error, 'ERR'); return res; }
    if (!res.count)   { writeRunStatus_('Keine Projekte mit AutoFix-Flag gefunden.', 'WARN'); return { success: true, message: 'Keine Projekte.', count: 0 }; }
    writeRunStatus_('Run abgeschlossen.', 'OK');
    return { success: true, count: res.count, results: res.results };
  } catch(e) {
    writeRunStatus_('Kritischer Fehler: ' + e.message, 'ERR');
    return { success: false, error: e.message };
  } finally {
    clearRunning_();
  }
}

var MQM_SCHEMA_ = {
  categories: [
    { category: 'Accuracy',     subcategories: ['Mistranslation', 'Omission', 'Addition', 'Untranslated'] },
    { category: 'Terminology',  subcategories: ['Termbase', 'Inconsistency'] },
    { category: 'Fluency',      subcategories: ['Grammar', 'Spelling', 'Register', 'Punctuation'] },
    { category: 'Style',        subcategories: ['K?rcher Style', 'Formatting'] },
    { category: 'Locale',       subcategories: ['Spelling Convention', 'Date/Number Format'] }
  ],
  severities: ['minor', 'major', 'critical']
};

function generateMqmReport(filters, doExport) {
  try {
    Logger.log('[MQM] Start Report. Filter: ' + JSON.stringify(filters));

    var logsResult = getRunLogsFiltered(filters);
    if (!logsResult.success) return { success: false, error: logsResult.error };
    if (!logsResult.logs.length) {
      return { success: true, empty: true, message: 'Keine Logs f?r diese Filter gefunden.' };
    }

    Logger.log('[MQM] ' + logsResult.logs.length + ' Logs geladen.');

    var reasonItems = [];
    logsResult.logs.forEach(function(log) {
      (log.changes || []).forEach(function(c) {
        if (!c.reason || c.reason.trim() === '') return;
        reasonItems.push({
          key:         log.projectUid + '|' + log.jobUid + '|' + c.id,
          reason:      c.reason,
          timestamp:   log.timestamp,
          projectName: log.projectName,
          autoFixType: log.autoFixType,
          targetLang:  log.targetLang,
          segId:       String(c.id),
          source:      c.source    || '',
          original:    c.original  || '',
          corrected:   c.corrected || ''
        });
      });
    });

    if (!reasonItems.length) {
      return { success: true, empty: true, message: 'Keine Changes mit reason-Texten gefunden.' };
    }

    Logger.log('[MQM] ' + reasonItems.length + ' Segmente zur Klassifizierung.');

    var MQM_BATCH_SIZE = 50;
    var totalBatches   = Math.ceil(reasonItems.length / MQM_BATCH_SIZE);
    var classifiedMap  = {};

    Logger.log('[MQM] ' + totalBatches + ' Klassifizierungs-Batch(es) parallel?');

    var settings    = getSettings_();
    var key         = getGeminiKey_();
    var model       = settings.primaryModel || 'gemini-3.6-flash';
    var geminiUrl   = 'https://34-111-99-134.nip.io/gemini/v1beta/models/' + model + ':generateContent';

    var batchRequests = [];
    var batchMeta     = [];

    for (var b = 0; b < totalBatches; b++) {
      var bStart = b * MQM_BATCH_SIZE;
      var bEnd   = Math.min(bStart + MQM_BATCH_SIZE, reasonItems.length);
      var slice  = reasonItems.slice(bStart, bEnd);
      batchMeta.push(slice);

      var prompt = buildMqmClassificationPrompt_(slice);
      batchRequests.push({
        url: geminiUrl, method: 'post', contentType: 'application/json',
        muteHttpExceptions: true,
        headers: { 'x-api-key': key, 'Accept': 'application/json' },
        payload: JSON.stringify({
          contents:         [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature:      0.1,
            responseMimeType: 'application/json',
            maxOutputTokens:  8192
          }
        })
      });
    }

    var responses   = UrlFetchApp.fetchAll(batchRequests);
    var retryItems  = [];

    for (var i = 0; i < responses.length; i++) {
      var res  = responses[i];
      var code = res.getResponseCode();
      var body = res.getContentText();

      if (code === 429) {
        Logger.log('[MQM] Batch ' + (i+1) + ' Rate Limit ? Retry.');
        retryItems.push({ items: batchMeta[i], request: batchRequests[i] });
        continue;
      }
      if (code >= 400) {
        Logger.log('[MQM] Batch ' + (i+1) + ' Fehler ' + code);
        continue;
      }

      parseMqmBatchResponse_(body, batchMeta[i], classifiedMap);
    }

    if (retryItems.length) {
      Utilities.sleep(3000);
      retryItems.forEach(function(rb) {
        try {
          var retryRes = UrlFetchApp.fetch(geminiUrl, rb.request);
          if (retryRes.getResponseCode() < 400) {
            parseMqmBatchResponse_(retryRes.getContentText(), rb.items, classifiedMap);
          }
        } catch(e) { Logger.log('[MQM] Retry Fehler: ' + e.message); }
      });
    }

    Logger.log('[MQM] Klassifiziert: ' + Object.keys(classifiedMap).length + '/' + reasonItems.length);

    var details = reasonItems.map(function(item) {
      var cls = classifiedMap[item.key] || { mqmCategory: 'Uncategorized', mqmSubcategory: '', mqmSeverity: 'minor' };
      return {
        timestamp:       item.timestamp,
        projectName:     item.projectName,
        autoFixType:     item.autoFixType,
        targetLang:      item.targetLang,
        segId:           item.segId,
        source:          item.source,
        original:        item.original,
        corrected:       item.corrected,
        reason:          item.reason,
        mqmCategory:     cls.mqmCategory,
        mqmSubcategory:  cls.mqmSubcategory,
        mqmSeverity:     cls.mqmSeverity
      };
    });

    var aggMap = {};
    details.forEach(function(d) {
      var aggKey = d.mqmCategory + '||' + d.mqmSubcategory;
      if (!aggMap[aggKey]) {
        aggMap[aggKey] = { category: d.mqmCategory, subcategory: d.mqmSubcategory, critical: 0, major: 0, minor: 0, total: 0 };
      }
      aggMap[aggKey][d.mqmSeverity] = (aggMap[aggKey][d.mqmSeverity] || 0) + 1;
      aggMap[aggKey].total++;
    });

    var aggregate = Object.values(aggMap).sort(function(a, b) { return b.total - a.total; });

    var totalErrors   = details.length;
    var criticalCount = details.filter(function(d) { return d.mqmSeverity === 'critical'; }).length;
    var majorCount    = details.filter(function(d) { return d.mqmSeverity === 'major'; }).length;
    var minorCount    = details.filter(function(d) { return d.mqmSeverity === 'minor'; }).length;

    var reportData = {
      filters:        filters || {},
      totalLogs:      logsResult.logs.length,
      totalSegments:  totalErrors,
      critical:       criticalCount,
      major:          majorCount,
      minor:          minorCount,
      aggregate:      aggregate,
      details:        details
    };

    var exportResult = null;
    if (doExport) {
      exportResult = exportMqmReportToSheet(reportData);
      Logger.log('[MQM] Sheet-Export: ' + (exportResult.success ? exportResult.sheetName : exportResult.error));
    }

    Logger.log('[MQM] Report fertig. ' + totalErrors + ' Fehler ('+criticalCount+' critical, '+majorCount+' major, '+minorCount+' minor).');

    var detailsForFrontend = details.slice(0, 300).map(function(d) {
      return {
        timestamp:      d.timestamp,
        projectName:    d.projectName,
        autoFixType:    d.autoFixType,
        targetLang:     d.targetLang,
        segId:          d.segId,
        source:         (d.source    || '').substring(0, 80),
        original:       (d.original  || '').substring(0, 80),
        corrected:      (d.corrected || '').substring(0, 80),
        reason:         (d.reason    || '').substring(0, 120),
        mqmCategory:    d.mqmCategory,
        mqmSubcategory: d.mqmSubcategory,
        mqmSeverity:    d.mqmSeverity
      };
    });

    return {
      success:          true,
      totalLogs:        logsResult.logs.length,
      totalSegments:    totalErrors,
      critical:         criticalCount,
      major:            majorCount,
      minor:            minorCount,
      aggregate:        aggregate,
      details:          detailsForFrontend,
      detailsTruncated: details.length > 300,
      detailsTotal:     details.length,
      exportResult:     exportResult
    };

  } catch(e) {
    Logger.log('[MQM] Kritischer Fehler: ' + e.message);
    return { success: false, error: e.message };
  }
}

function buildMqmClassificationPrompt_(items) {
  var schemaText = MQM_SCHEMA_.categories.map(function(c) {
    return '- ' + c.category + ': ' + c.subcategories.join(', ');
  }).join('\n');

  var itemsText = items.map(function(item) {
    return '{ "key": ' + JSON.stringify(item.key) + ', "reason": ' + JSON.stringify(item.reason) + ' }';
  }).join(',\n');

  return 'Du bist ein MQM-Qualit?tsspezialist f?r K?rcher-?bersetzungen.\n\n' +
    'Klassifiziere jeden der folgenden Korrektur-Gr?nde ("reason") nach dem MQM-Framework.\n\n' +
    '=== MQM KATEGORIEN ===\n' + schemaText + '\n\n' +
    '=== SEVERITY ===\n' +
    '- critical: Bedeutungsver?nderung, Sicherheitsrelevanz, komplett falsche ?bersetzung\n' +
    '- major: Terminologie-Fehler, klare Grammatikfehler, wichtige Auslassungen\n' +
    '- minor: Stilverbesserung, Fl?ssigkeit, kleinere Formulierungsanpassungen\n\n' +
    '=== ITEMS ===\n[\n' + itemsText + '\n]\n\n' +
    '=== AUSGABE ===\n' +
    'Nur valides JSON, kein Markdown. F?r jeden Item exakt einen Eintrag:\n' +
    '{\n  "results": [\n' +
    '    { "key": "<key>", "mqmCategory": "<category>", "mqmSubcategory": "<subcategory>", "mqmSeverity": "<severity>" }\n' +
    '  ]\n}';
}

function parseMqmBatchResponse_(body, batchItems, classifiedMap) {
  try {
    var json    = JSON.parse(body);
    var rawText = json.candidates[0].content.parts[0].text;
    rawText     = rawText.replace(/^```(json)?\s*/gi, '').replace(/```\s*$/gi, '').trim();
    var parsed  = JSON.parse(rawText);
    (parsed.results || []).forEach(function(r) {
      if (r.key) {
        classifiedMap[r.key] = {
          mqmCategory:    r.mqmCategory    || 'Uncategorized',
          mqmSubcategory: r.mqmSubcategory || '',
          mqmSeverity:    r.mqmSeverity    || 'minor'
        };
      }
    });
  } catch(e) {
    Logger.log('[MQM] Parse-Fehler: ' + e.message);
    batchItems.forEach(function(item) {
      classifiedMap[item.key] = { mqmCategory: 'Uncategorized', mqmSubcategory: '', mqmSeverity: 'minor' };
    });
  }
}

function getBenchmarkData(filters, mqmDetails) {
  try {
    Logger.log('[Benchmark] Start. Filter: ' + JSON.stringify(filters));

    var details = mqmDetails || null;

    if (!details) {
      var mqmResult = generateMqmReport(filters, false);
      if (!mqmResult.success) return { success: false, error: mqmResult.error };
      if (mqmResult.empty)    return { success: true, empty: true, message: mqmResult.message };
      details = mqmResult.details;
    }

    if (!details || !details.length) {
      return { success: true, empty: true, message: 'Keine klassifizierten Segmente gefunden.' };
    }

    var logsResult = getRunLogsFiltered(filters);
    var totalSegsByLang = {};
    var totalJobsByLang = {};
    (logsResult.logs || []).forEach(function(log) {
      var lang = log.targetLang || 'unknown';
      totalSegsByLang[lang] = (totalSegsByLang[lang] || 0) + (log.segmentsTotal || 0);
      totalJobsByLang[lang] = (totalJobsByLang[lang] || 0) + 1;
    });

    var pairMap = {};
    details.forEach(function(d) {
      var lang = d.targetLang || 'unknown';
      if (!pairMap[lang]) {
        pairMap[lang] = {
          targetLang:   lang,
          totalErrors:  0,
          critical:     0,
          major:        0,
          minor:        0,
          categories:   {}
        };
      }
      var p = pairMap[lang];
      p.totalErrors++;
      p[d.mqmSeverity] = (p[d.mqmSeverity] || 0) + 1;
      var catKey = d.mqmCategory || 'Uncategorized';
      p.categories[catKey] = (p.categories[catKey] || 0) + 1;
    });

    var pairs = Object.values(pairMap).map(function(p) {
      var totalSegs   = totalSegsByLang[p.targetLang] || 1;
      var totalJobs   = totalJobsByLang[p.targetLang] || 0;
      var errorRate   = totalSegs > 0 ? (p.totalErrors / totalSegs * 100) : 0;
      var topCatEntry = Object.entries(p.categories).sort(function(a,b) { return b[1]-a[1]; })[0];
      return {
        targetLang:   p.targetLang,
        totalErrors:  p.totalErrors,
        totalSegs:    totalSegs,
        totalJobs:    totalJobs,
        errorRate:    Math.round(errorRate * 10) / 10,
        critical:     p.critical || 0,
        major:        p.major    || 0,
        minor:        p.minor    || 0,
        topCategory:  topCatEntry ? topCatEntry[0] : '?',
        topCategoryCount: topCatEntry ? topCatEntry[1] : 0,
        categories:   p.categories
      };
    }).sort(function(a, b) { return b.errorRate - a.errorRate; });

    Logger.log('[Benchmark] ' + pairs.length + ' Sprachpaare analysiert.');
    return { success: true, pairs: pairs };

  } catch(e) {
    Logger.log('[Benchmark] Fehler: ' + e.message);
    return { success: false, error: e.message };
  }
}

function getTerminologyDrift(filters, threshold) {
  try {
    threshold = threshold || 0.3;
    Logger.log('[Drift] Start. Filter: ' + JSON.stringify(filters));

    var logsResult = getRunLogsFiltered(filters);
    if (!logsResult.success) return { success: false, error: logsResult.error };
    if (!logsResult.logs.length) return { success: true, terms: [], empty: true };

    var termMap = {};

    logsResult.logs.forEach(function(log) {
      var lang = log.targetLang || 'unknown';
      (log.changes || []).forEach(function(c) {
        if (!c.source || !c.reason) return;

        var reason = (c.reason || '').toLowerCase();
        var isTermCorrection = reason.indexOf('term') !== -1 ||
                               reason.indexOf('tb') !== -1 ||
                               reason.indexOf('glossar') !== -1 ||
                               reason.indexOf('terminolog') !== -1;

        var isProductCorrection = reason.indexOf('product') !== -1 ||
                                  reason.indexOf('rcw') !== -1 ||
                                  reason.indexOf('geh?use') !== -1;

        if (!isTermCorrection && !isProductCorrection) return;

        var sourceNorm = normalizeText_(c.source).substring(0, 80);
        var key        = sourceNorm + '|||' + lang;

        if (!termMap[key]) {
          termMap[key] = {
            sourceTerm:    sourceNorm,
            targetLang:    lang,
            occurrences:   0,
            corrections:   0,
            correctedForms: {},
            originalForms:  {},
            projects:      {},
            lastSeen:      ''
          };
        }

        var entry = termMap[key];
        entry.occurrences++;
        entry.corrections++;
        if (c.corrected) entry.correctedForms[normalizeText_(c.corrected).substring(0,80)] = (entry.correctedForms[normalizeText_(c.corrected).substring(0,80)] || 0) + 1;
        if (c.original)  entry.originalForms[normalizeText_(c.original).substring(0,80)]   = (entry.originalForms[normalizeText_(c.original).substring(0,80)]   || 0) + 1;
        if (log.projectName) entry.projects[log.projectName] = true;
        if (!entry.lastSeen || log.timestamp > entry.lastSeen) entry.lastSeen = log.timestamp;
      });
    });

    var terms = Object.values(termMap)
      .filter(function(t) { return t.corrections >= 2; })
      .map(function(t) {
        var topCorrected = Object.entries(t.correctedForms).sort(function(a,b) { return b[1]-a[1]; })[0];
        var topOriginal  = Object.entries(t.originalForms).sort(function(a,b)  { return b[1]-a[1]; })[0];
        return {
          sourceTerm:      t.sourceTerm,
          targetLang:      t.targetLang,
          corrections:     t.corrections,
          topCorrected:    topCorrected ? topCorrected[0] : '',
          topOriginal:     topOriginal  ? topOriginal[0]  : '',
          projectCount:    Object.keys(t.projects).length,
          projects:        Object.keys(t.projects).slice(0, 5),
          lastSeen:        t.lastSeen,
          driftScore:      t.corrections
        };
      })
      .sort(function(a, b) { return b.driftScore - a.driftScore })
      .slice(0, 100);

    Logger.log('[Drift] ' + terms.length + ' Drift-Terme gefunden.');
    return { success: true, terms: terms, totalLogs: logsResult.logs.length };

  } catch(e) {
    Logger.log('[Drift] Fehler: ' + e.message);
    return { success: false, error: e.message };
  }
}

function getGlossarySuggestions(filters) {
  try {
    Logger.log('[Glossary] Start. Filter: ' + JSON.stringify(filters));

    var logsResult = getRunLogsFiltered(filters);
    if (!logsResult.success) return { success: false, error: logsResult.error };
    if (!logsResult.logs.length) return { success: true, suggestions: [], empty: true };

    var candidates = [];
    var seenKeys   = new Set();

    logsResult.logs.forEach(function(log) {
      (log.changes || []).forEach(function(c) {
        if (!c.source || !c.original || !c.corrected) return;
        if (c.original.trim() === c.corrected.trim()) return;

        var reason     = (c.reason || '').toLowerCase();
        var sourceTrim = normalizeText_(c.source).substring(0, 60);
        var key        = sourceTrim + '|||' + log.targetLang;

        if (seenKeys.has(key)) return;

        var wordCount = c.source.split(/\s+/).length;
        if (wordCount > 6) return;

        var alreadyTb = reason.indexOf('termbase') !== -1 && reason.indexOf('apply') !== -1;
        if (alreadyTb) return;

        seenKeys.add(key);
        candidates.push({
          sourceTerm:  c.source,
          original:    c.original,
          corrected:   c.corrected,
          targetLang:  log.targetLang,
          reason:      c.reason || '',
          projectName: log.projectName
        });
      });
    });

    if (!candidates.length) {
      return { success: true, suggestions: [], empty: true, message: 'Keine Kandidaten f?r neue Termbase-Eintr?ge gefunden.' };
    }

    candidates = candidates.slice(0, 200);
    Logger.log('[Glossary] ' + candidates.length + ' Kandidaten f?r Gemini.');

    var GLOSS_BATCH = 40;
    var totalBatches = Math.ceil(candidates.length / GLOSS_BATCH);
    var settings     = getSettings_();
    var key_         = getGeminiKey_();
    var model        = settings.primaryModel || 'gemini-3.6-flash';
    var geminiUrl    = 'https://34-111-99-134.nip.io/gemini/v1beta/models/' + model + ':generateContent';

    var batchRequests = [], batchMeta = [];
    for (var b = 0; b < totalBatches; b++) {
      var bStart = b * GLOSS_BATCH;
      var bEnd   = Math.min(bStart + GLOSS_BATCH, candidates.length);
      var slice  = candidates.slice(bStart, bEnd);
      batchMeta.push(slice);
      batchRequests.push({
        url: geminiUrl, method: 'post', contentType: 'application/json',
        muteHttpExceptions: true,
        headers: { 'x-api-key': key_, 'Accept': 'application/json' },
        payload: JSON.stringify({
          contents: [{ parts: [{ text: buildGlossaryPrompt_(slice) }] }],
          generationConfig: { temperature: 0.1, responseMimeType: 'application/json', maxOutputTokens: 4096 }
        })
      });
    }

    var responses   = UrlFetchApp.fetchAll(batchRequests);
    var suggestions = [];

    for (var i = 0; i < responses.length; i++) {
      var res  = responses[i];
      var code = res.getResponseCode();
      if (code >= 400) { Logger.log('[Glossary] Batch ' + (i+1) + ' Fehler ' + code); continue; }
      parseGlossaryResponse_(res.getContentText(), suggestions);
    }

    var seen2  = new Set();
    var unique = suggestions.filter(function(s) {
      var k = normalizeText_(s.sourceDe) + '|||' + s.targetLang;
      if (seen2.has(k)) return false;
      seen2.add(k); return true;
    });

    unique.sort(function(a, b) { return b.confidence - a.confidence; });

    Logger.log('[Glossary] ' + unique.length + ' Vorschl?ge generiert.');
    return { success: true, suggestions: unique };

  } catch(e) {
    Logger.log('[Glossary] Fehler: ' + e.message);
    return { success: false, error: e.message };
  }
}

function buildGlossaryPrompt_(candidates) {
  var itemsText = candidates.map(function(c, idx) {
    return JSON.stringify({
      idx:        idx,
      sourceDe:   c.sourceTerm,
      original:   c.original,
      corrected:  c.corrected,
      targetLang: c.targetLang,
      reason:     c.reason
    });
  }).join(',\n');

  return 'Du bist ein Terminologie-Experte f?r K?rcher-?bersetzungen.\n\n' +
    'Analysiere die folgenden Korrekturen und entscheide ob sie einen neuen Termbase-Eintrag rechtfertigen.\n' +
    'Ein Termbase-Eintrag ist sinnvoll wenn:\n' +
    '- Der Source-Term kurz und eindeutig ist (1?5 W?rter)\n' +
    '- Die Korrektur konsistent eine bessere ?bersetzung darstellt\n' +
    '- Der Term wahrscheinlich in vielen Dokumenten vorkommt\n' +
    '- Es sich um Fachvokabular, Produktterminologie oder Markenbegriffe handelt\n\n' +
    'NICHT vorschlagen wenn:\n' +
    '- Es sich um Satz-Umformulierungen handelt\n' +
    '- Der Unterschied nur Stil ist (nicht Terminologie)\n' +
    '- Source oder Target zu lang sind (>6 W?rter)\n\n' +
    '=== KANDIDATEN ===\n[\n' + itemsText + '\n]\n\n' +
    '=== AUSGABE ===\n' +
    'Nur valides JSON. Nur die Kandidaten zur?ckgeben die wirklich als Termbase-Eintrag sinnvoll sind:\n' +
    '{\n  "suggestions": [\n' +
    '    {\n' +
    '      "idx": <original idx>,\n' +
    '      "sourceDe": "<deutscher Source-Term, bereinigt>",\n' +
    '      "targetTerm": "<empfohlene Zielsprachen-?bersetzung>",\n' +
    '      "targetLang": "<Sprachcode>",\n' +
    '      "confidence": <0.0-1.0>,\n' +
    '      "rationale": "<max 60 Zeichen Begr?ndung>"\n' +
    '    }\n' +
    '  ]\n}';
}

function parseGlossaryResponse_(body, suggestions) {
  try {
    var json    = JSON.parse(body);
    var rawText = json.candidates[0].content.parts[0].text;
    rawText     = rawText.replace(/^```(json)?\s*/gi, '').replace(/```\s*$/gi, '').trim();
    var parsed  = JSON.parse(rawText);
    (parsed.suggestions || []).forEach(function(s) {
      if (s.sourceDe && s.targetTerm && s.targetLang) {
        suggestions.push({
          sourceDe:   s.sourceDe,
          targetTerm: s.targetTerm,
          targetLang: s.targetLang,
          confidence: Math.round((s.confidence || 0.5) * 100),
          rationale:  s.rationale || ''
        });
      }
    });
  } catch(e) {
    Logger.log('[Glossary] Parse-Fehler: ' + e.message);
  }
}

function generateMqmReportFull(filters, doExport) {
  try {
    var mqmResult = generateMqmReport(filters, doExport);
    if (!mqmResult.success || mqmResult.empty) return mqmResult;

    var driftResult = getTerminologyDrift(filters);
    mqmResult.drift = driftResult.success ? driftResult : { terms: [] };

    return mqmResult;
  } catch(e) {
    Logger.log('[MQM Full] Fehler: ' + e.message);
    return { success: false, error: e.message };
  }
}