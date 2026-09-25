// =====================================================================
// AUTOFIX HUB - DATABASE (Database.gs)
// Google Sheets: Settings, Run Log (mit Changes-Spalte), Audit Log
//
// FIX 9  ? autoFixType wird im Run Log gespeichert (Spalte 12)
// FIX 10 ? getRunLogsFiltered() f?r MQM Report Tab
//           exportMqmReportToSheet() schreibt MQM-Report ins G-Sheet
// =====================================================================

function getDbSheet_() {
  var props   = PropertiesService.getScriptProperties();
  var sheetId = props.getProperty('AUTOFIX_DB_SHEET_ID');
  var ss;

  if (sheetId) {
    try { ss = SpreadsheetApp.openById(sheetId); } catch(e) { sheetId = null; }
  }

  if (!sheetId) {
    ss = SpreadsheetApp.create('AutoFix Hub - Database');
    props.setProperty('AUTOFIX_DB_SHEET_ID', ss.getId());

    var tabs = ['Settings', 'Run Log', 'Audit Log'];
    tabs.forEach(function(t) { if (!ss.getSheetByName(t)) ss.insertSheet(t); });
    var sheet1 = ss.getSheetByName('Sheet1') || ss.getSheetByName('Tabellenblatt1');
    if (sheet1) ss.deleteSheet(sheet1);

    ss.getSheetByName('Settings').appendRow(['Key', 'Value']);

    // Run Log mit AutoFixType-Spalte (Spalte 12)
    ss.getSheetByName('Run Log').appendRow([
      'Timestamp', 'Project UID', 'Project Name', 'Job UID',
      'Target Lang', 'Success', 'Total Segments', 'Changed Segments',
      'Model', 'Message/Error', 'Changes JSON', 'AutoFix Type'
    ]);

    ss.getSheetByName('Audit Log').appendRow(['Timestamp', 'Action', 'Details']);

    tabs.forEach(function(t) {
      var sheet = ss.getSheetByName(t);
      sheet.getRange('A1:Z1').setFontWeight('bold');
      sheet.setFrozenRows(1);
    });

    ss.getSheetByName('Run Log').setColumnWidth(11, 500);

    saveAutoFixSettings_(getDefaultAutoFixSettings_(), ss);
    logAudit_('System', 'AutoFix Database Sheet erstellt.', ss);
  }
  return ss;
}

function logAudit_(action, details, ssObj) {
  try {
    var ss = ssObj || getDbSheet_();
    ss.getSheetByName('Audit Log').appendRow([new Date().toISOString(), action, details]);
  } catch(e) { Logger.log('Audit Error: ' + e.message); }
}

// =====================================================================
// RUN LOG SCHREIBEN
// =====================================================================

/**
 * Schreibt einen Run-Log-Eintrag.
 * result.changes = Array von { id, source, original, corrected, reason }
 * FIX 9: job.autoFixType wird in Spalte 12 gespeichert.
 */
function logRun_(projectUid, projectName, job, result) {
  try {
    var ss      = getDbSheet_();
    var sheet   = ss.getSheetByName('Run Log');
    var changes = result.changes || [];

    sheet.appendRow([
      new Date().toISOString(),
      projectUid,
      projectName,
      job.uid,
      job.targetLang,
      result.success ? 'TRUE' : 'FALSE',
      result.segmentsTotal   || 0,
      result.segmentsChanged || 0,
      result.model || '-',
      result.error || result.reason || 'OK',
      changes.length > 0 ? JSON.stringify(changes) : '',
      job.autoFixType || 'technical'   // FIX 9
    ]);
  } catch(e) { Logger.log('RunLog Error: ' + e.message); }
}

// =====================================================================
// RUN LOG LESEN ? Standard (neueste 200, f?r Run Log Tab)
// =====================================================================

function getRunLogs() {
  try {
    var ss    = getDbSheet_();
    var sheet = ss.getSheetByName('Run Log');
    var data  = sheet.getDataRange().getValues();
    var logs  = [];

    for (var i = data.length - 1; i >= 1; i--) {
      var row = data[i];
      if (!row[0]) continue;

      var changes = [];
      var changesRaw = row[10];
      if (changesRaw && String(changesRaw).trim() !== '') {
        try { changes = JSON.parse(String(changesRaw)); } catch(e) { changes = []; }
      }

      logs.push({
        timestamp:       String(row[0]),
        projectUid:      String(row[1] || ''),
        projectName:     String(row[2] || ''),
        jobUid:          String(row[3] || ''),
        targetLang:      String(row[4] || ''),
        success:         String(row[5]) === 'TRUE' || row[5] === true,
        segmentsTotal:   Number(row[6]) || 0,
        segmentsChanged: Number(row[7]) || 0,
        model:           String(row[8] || '-'),
        message:         String(row[9] || ''),
        changes:         changes,
        autoFixType:     String(row[11] || 'technical')  // FIX 9
      });

      if (logs.length >= 200) break;
    }

    return { success: true, logs: logs };
  } catch(e) {
    return { success: false, error: e.message, logs: [] };
  }
}

// =====================================================================
// FIX 10: RUN LOG LESEN ? Gefiltert (f?r MQM Report)
//
// Filter-Objekt:
//   dateFrom    {string}  ISO-Datum, z.B. "2026-01-01"
//   dateTo      {string}  ISO-Datum, z.B. "2026-12-31"
//   projectName {string}  Teilstring-Match, case-insensitive
//   autoFixType {string}  exakter Match, z.B. "technical"
//   targetLang  {string}  exakter Match, z.B. "en_gb"
//
// Gibt nur Logs mit changes.length > 0 zur?ck (nur ge?nderte Jobs).
// Max 1000 Eintr?ge.
// =====================================================================

function getRunLogsFiltered(filters) {
  try {
    filters = filters || {};
    var ss    = getDbSheet_();
    var sheet = ss.getSheetByName('Run Log');
    var data  = sheet.getDataRange().getValues();
    var logs  = [];

    var dateFrom = filters.dateFrom ? new Date(filters.dateFrom) : null;
    var dateTo   = filters.dateTo   ? new Date(filters.dateTo + 'T23:59:59') : null;

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (!row[0]) continue;

      // Datum-Filter
      var ts = new Date(String(row[0]));
      if (dateFrom && ts < dateFrom) continue;
      if (dateTo   && ts > dateTo)   continue;

      // Projektname-Filter (Teilstring)
      if (filters.projectName && filters.projectName.trim() !== '') {
        var pn = String(row[2] || '').toLowerCase();
        if (pn.indexOf(filters.projectName.toLowerCase()) === -1) continue;
      }

      // AutoFix-Typ-Filter
      var logType = String(row[11] || 'technical');
      if (filters.autoFixType && filters.autoFixType !== 'all' && logType !== filters.autoFixType) continue;

      // Zielsprache-Filter
      if (filters.targetLang && filters.targetLang !== 'all' && String(row[4]) !== filters.targetLang) continue;

      // Nur Logs mit Changes
      var changes = [];
      var changesRaw = row[10];
      if (changesRaw && String(changesRaw).trim() !== '') {
        try { changes = JSON.parse(String(changesRaw)); } catch(e) { changes = []; }
      }
      if (!changes.length) continue;

      logs.push({
        timestamp:       String(row[0]),
        projectUid:      String(row[1] || ''),
        projectName:     String(row[2] || ''),
        jobUid:          String(row[3] || ''),
        targetLang:      String(row[4] || ''),
        success:         String(row[5]) === 'TRUE' || row[5] === true,
        segmentsTotal:   Number(row[6]) || 0,
        segmentsChanged: Number(row[7]) || 0,
        model:           String(row[8] || '-'),
        changes:         changes,
        autoFixType:     logType
      });

      if (logs.length >= 1000) break;
    }

    return { success: true, logs: logs, count: logs.length };
  } catch(e) {
    return { success: false, error: e.message, logs: [] };
  }
}

/**
 * Gibt alle eindeutigen Werte f?r Filter-Dropdowns zur?ck:
 * Projektname, AutoFix-Typen, Zielsprachen ? direkt aus dem Run Log.
 */
function getRunLogFilterOptions() {
  try {
    var ss    = getDbSheet_();
    var sheet = ss.getSheetByName('Run Log');
    var data  = sheet.getDataRange().getValues();

    var projects = {}, types = {}, langs = {};

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (!row[0]) continue;
      if (row[2]) projects[String(row[2])] = true;
      if (row[4]) langs[String(row[4])]    = true;
      if (row[11]) types[String(row[11])]  = true;
    }

    return {
      success:      true,
      projectNames: Object.keys(projects).sort(),
      autoFixTypes: Object.keys(types).sort(),
      targetLangs:  Object.keys(langs).sort()
    };
  } catch(e) {
    return { success: false, error: e.message, projectNames: [], autoFixTypes: [], targetLangs: [] };
  }
}

// =====================================================================
// FIX 10: MQM REPORT ? GOOGLE SHEET EXPORT
//
// Erstellt ein neues Sheet "MQM Report YYYY-MM-DD HH:MM" im Database-
// Spreadsheet mit zwei Bereichen:
//   1. Aggregat (Kategorie ? Severity)
//   2. Detail-Tabelle (alle klassifizierten Segmente)
// =====================================================================

function exportMqmReportToSheet(reportData) {
  try {
    if (!reportData || !reportData.details || !reportData.aggregate) {
      return { success: false, error: 'Keine Report-Daten ?bergeben.' };
    }

    var sheetName = 'MQM Report ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
    var ss        = SpreadsheetApp.create(sheetName);

    // Standard-Sheet umbenennen
    var sheet = ss.getActiveSheet();
    sheet.setName('MQM Report');

    // ?? Metadaten ????????????????????????????????????????????????????
    sheet.appendRow(['AutoFix Hub ? MQM Quality Report']);
    sheet.appendRow(['Generated:', new Date().toISOString()]);
    sheet.appendRow(['Filters:', JSON.stringify(reportData.filters || {})]);
    sheet.appendRow(['Total logs analysed:', reportData.totalLogs || 0]);
    sheet.appendRow(['Total segments changed:', reportData.totalSegments || 0]);
    sheet.appendRow(['?', '?', '?', '?', '?', '?', '?']);

    // ?? Aggregat ?????????????????????????????????????????????????????
    sheet.appendRow(['=== AGGREGAT ===']);
    sheet.appendRow(['Category', 'Subcategory', 'Critical', 'Major', 'Minor', 'Total', '% of all errors']);

    var aggRows  = reportData.aggregate || [];
    var totalErr = aggRows.reduce(function(s, r) { return s + (r.total || 0); }, 0);

    aggRows.forEach(function(r) {
      var pct = totalErr > 0 ? ((r.total / totalErr) * 100).toFixed(1) + '%' : '0%';
      sheet.appendRow([
        r.category || '', r.subcategory || '',
        r.critical || 0, r.major || 0, r.minor || 0, r.total || 0, pct
      ]);
    });

    sheet.appendRow(['?', '?', '?', '?', '?', '?', '?']);
    sheet.appendRow(['=== DETAIL ===']);
    sheet.appendRow([
      'Timestamp', 'Project', 'AutoFix Type', 'Target Lang',
      'Seg ID', 'Source', 'Original', 'Corrected',
      'Reason', 'MQM Category', 'MQM Subcategory', 'Severity'
    ]);

    // ?? Detail-Zeilen ?????????????????????????????????????????????????
    var details = reportData.details || [];
    details.forEach(function(d) {
      sheet.appendRow([
        d.timestamp    || '',
        d.projectName  || '',
        d.autoFixType  || '',
        d.targetLang   || '',
        d.segId        || '',
        d.source       || '',
        d.original     || '',
        d.corrected    || '',
        d.reason       || '',
        d.mqmCategory  || '',
        d.mqmSubcategory || '',
        d.mqmSeverity  || ''
      ]);
    });

    // ?? Formatierung ??????????????????????????????????????????????????
    // Header-Zeile Aggregat
    var aggHeaderRow = 8;
    sheet.getRange(aggHeaderRow, 1, 1, 7).setFontWeight('bold').setBackground('#FFD100');

    // Header-Zeile Detail
    var detHeaderRow = aggHeaderRow + aggRows.length + 3;
    sheet.getRange(detHeaderRow, 1, 1, 12).setFontWeight('bold').setBackground('#FFD100');

    // Titelzeile
    sheet.getRange(1, 1, 1, 7).setFontWeight('bold').setFontSize(13);

    // Spaltenbreiten
    [200, 200, 80, 80, 80, 80, 80].forEach(function(w, i) {
      sheet.setColumnWidth(i + 1, w);
    });

    // Freeze Header-Zeilen
    sheet.setFrozenRows(1);

    logAudit_('MQM Export', 'Neues Sheet "' + sheetName + '" erstellt. ' + details.length + ' Segmente.');

    return { success: true, sheetName: sheetName, url: ss.getUrl() };
  } catch(e) {
    Logger.log('[MQM Export] Fehler: ' + e.message);
    return { success: false, error: e.message };
  }
}

// =====================================================================
// SHEET URL
// =====================================================================

function getDatabaseUrl() {
  try { return { success: true, url: getDbSheet_().getUrl() }; }
  catch(e) { return { success: false, error: e.message }; }
}

function recreateDatabase() {
  try {
    PropertiesService.getScriptProperties().deleteProperty('AUTOFIX_DB_SHEET_ID');
    var ss = getDbSheet_();
    return { success: true, url: ss.getUrl() };
  } catch(e) { return { success: false, error: e.message }; }
}