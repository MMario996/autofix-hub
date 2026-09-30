// =====================================================================
// AUTOFIX HUB - API FUER DIE OBERFLAECHE (HubApi.gs)
//
// Die Oberflaeche (Index.html) ruft nur diese api*-Funktionen auf. Jede
// prueft die Rolle und ruft dann die bestehende AutoFix-Funktion auf -
// an deren Logik aendert sich nichts. Antwortformat immer { success, ... }.
// =====================================================================

function hubApi_(needed, fn) {
  try {
    var email = hubRequire_(needed);
    var res = fn(email);
    if (res && typeof res === 'object' && res.success === undefined) res.success = true;
    return res;
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ---------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------
function apiHubBootstrap() {
  try {
    var email = hubEmail_();
    var st = hubAccess_();
    var role = hubRole_(email, st);
    var lang = 'de';
    try { lang = PropertiesService.getUserProperties().getProperty(HUB_LANG_PROP_) === 'en' ? 'en' : 'de'; } catch (e) {}
    var cfg = hubConfig_();
    var out = { success: true, email: email, role: role, authorized: !!role, openMode: hubOpenMode_(st), lang: lang, promptHubUrl: cfg.promptHubUrl };
    if (!role) out.myRequests = st.requests.filter(function (r) { return r.email === email; }).slice(-10).reverse();
    if (role === 'admin') out.pendingRequests = st.requests.filter(function (r) { return r.status === 'pending'; }).length;
    return out;
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function apiHubSetLang(lang) {
  try {
    var l = lang === 'en' ? 'en' : 'de';
    PropertiesService.getUserProperties().setProperty(HUB_LANG_PROP_, l);
    return { success: true, lang: l };
  } catch (e) { return { success: false, error: e.message }; }
}

// ---------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------
function apiHubDashboard() {
  return hubApi_('viewer', function () {
    var trig = getAutoFixTriggerStatus();
    var logsRes = getRunLogs();
    var logs = logsRes.success ? logsRes.logs : [];
    var weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
    var week = logs.filter(function (l) { var t = new Date(l.timestamp).getTime(); return !isNaN(t) && t >= weekAgo && l.projectName !== 'Replay'; });
    var segs = 0, changed = 0, failed = 0, byType = {}, byLang = {};
    week.forEach(function (l) {
      segs += l.segmentsTotal; changed += l.segmentsChanged;
      if (!l.success) failed++;
      byType[l.autoFixType] = (byType[l.autoFixType] || 0) + 1;
      byLang[l.targetLang] = (byLang[l.targetLang] || 0) + 1;
    });
    var running = false;
    try { running = !!PropertiesService.getScriptProperties().getProperty('AUTOFIX_RUNNING'); } catch (e) {}
    return {
      poller: trig,
      running: running,
      lastRun: logs.length ? logs[0].timestamp : '',
      week: {
        jobs: week.length, failed: failed, segments: segs, changed: changed,
        changeRate: segs ? Math.round(changed / segs * 1000) / 10 : 0,
        byType: byType, byLang: byLang
      },
      recent: logs.slice(0, 8).map(function (l) {
        return { timestamp: l.timestamp, projectName: l.projectName, targetLang: l.targetLang, autoFixType: l.autoFixType, success: l.success, segmentsTotal: l.segmentsTotal, segmentsChanged: l.segmentsChanged };
      }),
      logError: logsRes.success ? '' : logsRes.error
    };
  });
}

// ---------------------------------------------------------------------
// Poller, Test, Lauf
// ---------------------------------------------------------------------
function apiHubPollerStart(mins) {
  return hubApi_('operator', function (email) {
    var m = parseInt(mins, 10);
    if ([5, 10, 15, 30].indexOf(m) === -1) throw new Error('Intervall muss 5, 10, 15 oder 30 Minuten sein.');
    var res = setupAutoFixTrigger(m);
    hubAudit_(email, 'Poller gestartet', 'alle ' + m + ' Min.');
    return res && res.success === false ? res : { success: true, status: getAutoFixTriggerStatus() };
  });
}
function apiHubPollerStop() {
  return hubApi_('operator', function (email) {
    var res = removeAutoFixTrigger();
    hubAudit_(email, 'Poller gestoppt', '');
    return res && res.success === false ? res : { success: true, status: getAutoFixTriggerStatus() };
  });
}
function apiHubTestConnection() { return hubApi_('operator', function () { return testConnection(); }); }
function apiHubDebugProjects() { return hubApi_('admin', function () { return testProjectSearch(); }); }

function apiHubRunNow() {
  return hubApi_('operator', function (email) {
    hubAudit_(email, 'Run gestartet (UI)', '');
    return runNow();
  });
}
function apiHubRunStatus() { return hubApi_('viewer', function () { return getRunStatus(); }); }
function apiHubClearRunStatus() { return hubApi_('operator', function () { return clearRunStatus() || { success: true }; }); }

// ---------------------------------------------------------------------
// Warteschlange, Run Log, Re-Push
// ---------------------------------------------------------------------
function apiHubQueue() { return hubApi_('viewer', function () { return getAutoFixProjects(); }); }
function apiHubRunLogs() { return hubApi_('viewer', function () { return getRunLogs(); }); }
function apiHubReplay(projectUid, jobUid, changesJson) {
  return hubApi_('operator', function (email) {
    if (!/^[A-Za-z0-9]{10,40}$/.test(String(projectUid || '')) || !/^[A-Za-z0-9]{10,40}$/.test(String(jobUid || ''))) throw new Error('Project UID oder Job UID ist ungültig.');
    try { JSON.parse(changesJson); } catch (e) { throw new Error('Changes JSON ist kein gültiges JSON.'); }
    hubAudit_(email, 'Re-Push', projectUid + ' / ' + jobUid);
    return replayChangesForJob(projectUid, jobUid, changesJson);
  });
}

// ---------------------------------------------------------------------
// Analysen
// ---------------------------------------------------------------------
function apiHubFilterOptions() { return hubApi_('viewer', function () { return getRunLogFilterOptions(); }); }
function apiHubMqm(filters, doExport) {
  return hubApi_('operator', function (email) {
    if (doExport) hubAudit_(email, 'MQM-Export', JSON.stringify(filters));
    return generateMqmReportFull(filters || {}, !!doExport);
  });
}
function apiHubBenchmark(filters) { return hubApi_('operator', function () { return getBenchmarkData(filters || {}, null); }); }
function apiHubDrift(filters) { return hubApi_('operator', function () { return getTerminologyDrift(filters || {}, 0.3); }); }
function apiHubGlossary(filters) { return hubApi_('operator', function () { return getGlossarySuggestions(filters || {}); }); }

// ---------------------------------------------------------------------
// Prompts (nur lesen; bearbeitet wird im Prompt Hub)
// ---------------------------------------------------------------------
function apiHubPrompts() {
  return hubApi_('viewer', function () {
    var settings = getSettings_();
    // getAutoFixSettings() fuellt fehlende Prompts mit dem Standard aus dem Code auf.
    // Ob ein Space wirklich einen eigenen Prompt hat, steht nur in den rohen Zeilen.
    var raw = {};
    try {
      getDbSheet_().getSheetByName('Settings').getDataRange().getValues().forEach(function (r) { raw[String(r[0])] = String(r[1] || ''); });
    } catch (e) {}
    var hubTypes = {};
    try { readPromptHubSpaces_().forEach(function (s) { hubTypes[s.type] = s.active; }); } catch (e) {}
    var list = getPromptTypesConfig_().map(function (t) {
      var text = getPeInstructions_(settings, t.type);
      var own = raw['peInstructions_' + t.type];
      return {
        type: t.type, label: t.label, builtIn: !!t.builtIn,
        managedByPromptHub: t.type in hubTypes,
        usesFallback: !own || !String(own).trim(),
        chars: text.length,
        text: text
      };
    });
    return { prompts: list, promptHubUrl: hubConfig_().promptHubUrl, effective: hubEffectiveGemini_(settings) };
  });
}

// Werte, die ein echter Lauf nutzt (runGeminiPeBatchesParallel_ in Code.gs)
function hubEffectiveGemini_(settings) {
  var ignored = Object.keys(settings).filter(function (k) { return /^gemini(Model|Temp|MaxTokens|TmThreshold|Thinking)_/.test(k) && String(settings[k]) !== ''; });
  return {
    model: settings.primaryModel || 'gemini-3.6-flash',
    temperature: parseFloat(settings.peTemperature) || 0.3,
    maxTokens: parseInt(settings.maxTokens, 10) || 32768,
    batchSize: AUTOFIX_BATCH_SIZE_, singleBatchMax: AUTOFIX_SINGLE_BATCH_MAX_,
    ignoredOverrides: ignored
  };
}

function apiHubDatabaseUrl() { return hubApi_('viewer', function () { return getDatabaseUrl(); }); }

// ---------------------------------------------------------------------
// Zugriff beantragen
// ---------------------------------------------------------------------
function apiHubRequestAccess(role, reason) {
  try {
    var email = hubEmail_();
    if (!email) throw new Error('Deine E-Mail-Adresse ist nicht lesbar. Bist du mit dem Firmenkonto angemeldet?');
    if (!HUB_ROLE_RANK_[role] || role === 'admin') throw new Error('Bitte „Ansehen“ oder „Ausführen“ wählen.');
    reason = String(reason || '').trim().substring(0, 1000);
    if (!reason) throw new Error('Bitte kurz begründen, wofür du den Zugriff brauchst.');
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var st = hubAccess_();
      if (st.requests.some(function (r) { return r.email === email && r.status === 'pending'; })) throw new Error('Du hast bereits einen offenen Antrag.');
      st.requests.push({ id: Utilities.getUuid().substring(0, 12), email: email, role: role, reason: reason, status: 'pending', createdAt: new Date().toISOString() });
      hubSaveAccess_(st);
    } finally { lock.releaseLock(); }
    hubAudit_(email, 'Zugriff beantragt', role);
    hubNotifyAdmins_('Neuer Zugriffsantrag', email + ' beantragt die Rolle „' + role + '“.\nBegründung: ' + reason);
    return { success: true, myRequests: hubAccess_().requests.filter(function (r) { return r.email === email; }).slice(-10).reverse() };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ---------------------------------------------------------------------
// ADMIN
// ---------------------------------------------------------------------
var HUB_EDITABLE_SETTINGS_ = ['cfFieldUid', 'wfStepName', 'markDoneAfterFix', 'primaryModel', 'peTemperature', 'maxTokens', 'tmThreshold', 'pollerIntervalMinutes'];

function apiHubAdminState() {
  return hubApi_('admin', function () {
    var res = getAutoFixSettings();
    var s = res.settings || {};
    var picked = {};
    HUB_EDITABLE_SETTINGS_.forEach(function (k) { picked[k] = s[k]; });
    var st = hubAccess_();
    var audit = [];
    try {
      var sh = getDbSheet_().getSheetByName('Audit Log');
      var rows = sh.getDataRange().getValues();
      for (var i = rows.length - 1; i >= 1 && audit.length < 200; i--) {
        if (rows[i][0]) audit.push({ timestamp: String(rows[i][0]), action: String(rows[i][1] || ''), details: String(rows[i][2] || '') });
      }
    } catch (e) {}
    return {
      settings: picked, effective: hubEffectiveGemini_(s), config: hubConfig_(),
      admins: st.admins, users: st.users, requests: st.requests.slice().reverse(),
      openMode: hubOpenMode_(st), audit: audit,
      running: !!PropertiesService.getScriptProperties().getProperty('AUTOFIX_RUNNING'),
      settingsError: res.success ? '' : res.error
    };
  });
}

// Schreibt nur die geaenderten Zeilen im Settings-Tab. Die alte Oberflaeche
// hat saveAutoFixSettings() mit 7 Werten aufgerufen; das leert den Tab und
// loescht dabei alle Prompts (peInstructions_*) und sonstigen Werte.
function hubWriteSetting_(key, value) {
  var sh = getDbSheet_().getSheetByName('Settings');
  var rows = sh.getDataRange().getValues();
  var cell = escapeSheetValue_(String(value));
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === key) { sh.getRange(i + 1, 2).setValue(cell); return; }
  }
  sh.appendRow([key, cell]);
}

function apiHubAdminSaveSettings(patch) {
  return hubApi_('admin', function (email) {
    patch = patch || {};
    var clean = {};
    if (patch.cfFieldUid !== undefined) {
      if (!/^[A-Za-z0-9]{10,40}$/.test(String(patch.cfFieldUid))) throw new Error('Custom Field UID ist ungültig.');
      clean.cfFieldUid = String(patch.cfFieldUid);
    }
    if (patch.wfStepName !== undefined) {
      var w = String(patch.wfStepName).trim();
      if (!w) throw new Error('Workflow-Step-Name darf nicht leer sein.');
      clean.wfStepName = w.substring(0, 100);
    }
    if (patch.markDoneAfterFix !== undefined) clean.markDoneAfterFix = (patch.markDoneAfterFix === true || patch.markDoneAfterFix === 'true') ? 'true' : 'false';
    if (patch.primaryModel !== undefined) {
      if (hubConfig_().allowedModels.indexOf(patch.primaryModel) === -1) throw new Error('Modell ist nicht freigegeben.');
      clean.primaryModel = patch.primaryModel;
    }
    if (patch.peTemperature !== undefined && patch.peTemperature !== '') {
      var t = parseFloat(patch.peTemperature);
      if (isNaN(t) || t <= 0 || t > 2) throw new Error('Temperature muss größer 0 und höchstens 2 sein (0 liest AutoFix als „nicht gesetzt“).');
      clean.peTemperature = String(t);
    }
    if (patch.maxTokens !== undefined && patch.maxTokens !== '') {
      var m = parseInt(patch.maxTokens, 10);
      if (isNaN(m) || m < 1024 || m > 65536) throw new Error('Max Tokens muss zwischen 1024 und 65536 liegen.');
      clean.maxTokens = String(m);
    }
    if (patch.tmThreshold !== undefined && patch.tmThreshold !== '') {
      var th = parseFloat(patch.tmThreshold);
      if (isNaN(th) || th < 0 || th > 1) throw new Error('TM Threshold muss zwischen 0 und 1 liegen.');
      clean.tmThreshold = String(th);
    }
    if (patch.pollerIntervalMinutes !== undefined && patch.pollerIntervalMinutes !== '') {
      var p = parseInt(patch.pollerIntervalMinutes, 10);
      if (isNaN(p) || p < 1 || p > 60) throw new Error('Poller-Intervall muss zwischen 1 und 60 liegen.');
      clean.pollerIntervalMinutes = String(p);
    }
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try { Object.keys(clean).forEach(function (k) { hubWriteSetting_(k, clean[k]); }); }
    finally { lock.releaseLock(); }
    hubAudit_(email, 'Settings geändert (UI)', JSON.stringify(clean));
    return { success: true, saved: Object.keys(clean) };
  });
}

function apiHubAdminSaveConfig(patch) {
  return hubApi_('admin', function (email) {
    var cfg = hubSaveConfig_(patch || {});
    hubAudit_(email, 'Hub-Konfiguration geändert', Object.keys(patch || {}).join(', '));
    return { config: cfg };
  });
}

function apiHubAdminSaveUser(entry) {
  return hubApi_('admin', function (email) {
    var e = String(entry && entry.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error('Ungültige E-Mail.');
    if (entry.role !== 'viewer' && entry.role !== 'operator') throw new Error('Rolle muss „viewer“ oder „operator“ sein.');
    var st = hubAccess_();
    st.users = st.users.filter(function (u) { return u.email !== e; });
    st.users.push({ email: e, role: entry.role, active: entry.active !== false, addedBy: email, addedAt: new Date().toISOString() });
    hubSaveAccess_(st);
    hubAudit_(email, 'Nutzer gespeichert', e + ' = ' + entry.role);
    return { users: st.users };
  });
}

function apiHubAdminRemoveUser(target) {
  return hubApi_('admin', function (email) {
    var e = String(target || '').toLowerCase();
    var st = hubAccess_();
    st.users = st.users.filter(function (u) { return u.email !== e; });
    hubSaveAccess_(st);
    hubAudit_(email, 'Nutzer entfernt', e);
    return { users: st.users };
  });
}

function apiHubAdminSetAdmin(target, makeAdmin) {
  return hubApi_('admin', function (email) {
    var e = String(target || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error('Ungültige E-Mail.');
    var st = hubAccess_();
    if (makeAdmin) {
      if (st.admins.indexOf(e) === -1) st.admins.push(e);
      // Wer den ersten Admin setzt, muss sich nicht selbst aussperren
      if (st.admins.indexOf(email) === -1 && email && st.admins.length === 1 && e !== email) st.admins.push(email);
    } else {
      if (st.admins.length <= 1) throw new Error('Der letzte Admin kann nicht entfernt werden.');
      st.admins = st.admins.filter(function (x) { return x !== e; });
    }
    hubSaveAccess_(st);
    hubAudit_(email, makeAdmin ? 'Admin hinzugefügt' : 'Admin entfernt', e);
    return { admins: st.admins };
  });
}

function apiHubAdminDecide(id, approve, role, comment) {
  return hubApi_('admin', function (email) {
    var st = hubAccess_();
    var r = st.requests.filter(function (x) { return x.id === id; })[0];
    if (!r) throw new Error('Antrag nicht gefunden.');
    if (r.status !== 'pending') throw new Error('Dieser Antrag wurde bereits entschieden.');
    var finalRole = role || r.role;
    if (approve) {
      if (finalRole !== 'viewer' && finalRole !== 'operator') throw new Error('Ungültige Rolle.');
      st.users = st.users.filter(function (u) { return u.email !== r.email; });
      st.users.push({ email: r.email, role: finalRole, active: true, addedBy: email, addedAt: new Date().toISOString() });
    }
    r.status = approve ? 'approved' : 'rejected';
    r.decidedBy = email; r.decidedAt = new Date().toISOString(); r.comment = String(comment || '').substring(0, 500);
    if (approve) r.role = finalRole;
    hubSaveAccess_(st);
    hubAudit_(email, approve ? 'Antrag freigegeben' : 'Antrag abgelehnt', r.email + ' (' + finalRole + ')');
    hubMail_(r.email, approve ? 'Zugriff freigegeben' : 'Antrag abgelehnt',
      'Dein Antrag auf Zugriff auf AutoFix Hub wurde ' + (approve ? 'freigegeben (Rolle: ' + finalRole + ').' : 'abgelehnt.') + (comment ? '\nKommentar: ' + comment : ''));
    return { requests: st.requests.slice().reverse() };
  });
}

function apiHubAdminForceUnlock() {
  return hubApi_('admin', function (email) { hubAudit_(email, 'RunLock freigegeben', ''); return forceUnlock(); });
}
function apiHubAdminClearCache() {
  return hubApi_('admin', function (email) { hubAudit_(email, 'Projekt-Cache geleert', ''); return clearProjectCache(); });
}
function apiHubAdminExportToPromptHub() {
  return hubApi_('admin', function (email) {
    hubAudit_(email, 'An Prompt Hub übergeben', '');
    return exportPromptEditorToPromptHub();
  });
}
function apiHubAdminPreviewAs(target) {
  return hubApi_('admin', function () {
    var e = String(target || '').trim().toLowerCase();
    return { email: e, role: hubRole_(e) };
  });
}
