// Ersatz fuer google.script.run in der Vorschau (tools/build-preview.js).
// Beispieldaten, Zustand im Speicher. SCENARIO kommt aus build-preview.
(function () {
  'use strict';
  var SC = window.SCENARIO || 'admin';
  var EMAIL = { admin: 'mario.magliano@karcher.com', operator: 'lena.fischer@karcher.com', viewer: 'sofia.rossi@karcher.com', denied: 'max.muster@karcher.com', open: 'mario.magliano@karcher.com' }[SC];
  var ROLE = { admin: 'admin', operator: 'operator', viewer: 'viewer', denied: '', open: 'admin' }[SC];
  var DAY = 24 * 3600 * 1000, NOW = Date.UTC(2026, 8, 30, 8, 0);
  function iso(daysAgo, h) { return new Date(NOW - daysAgo * DAY + (h || 0) * 3600000).toISOString(); }

  var changes = [
    { id: 'seg-12', source: 'The manager then prepares the {4>P&D Kick-Off Dialogue. <4}', original: 'Der Manager bereitet dann den {4>P&D-Kick-Off-Dialog vor. <4}', corrected: 'Anschließend bereitet die Führungskraft den {4>P&D Kick-Off Dialog<4} vor.', reason: 'Nomenklatur DE + Satzzeichen aus Tag' },
    { id: 'seg-14', source: 'Please complete your {1>P&D Self Assessment<1} by 15 March.', original: 'Bitte füllen Sie Ihre {1>P&D-Selbstbewertung<1} bis zum 15. März aus.', corrected: 'Bitte füllen Sie Ihre {1>P&D Selbsteinschätzung<1} bis zum 15. März aus.', reason: 'Nomenklatur: P&D Selbsteinschätzung' }
  ];
  var logs = [
    { timestamp: iso(0, -1), projectUid: 'uaIOjmcZIrbn7dQl8GSrR1', projectName: 'P&D Rollout Q4 – Mails', jobUid: 'GlJLRo1Iqgmfuikg0gwPJf', targetLang: 'de_de', success: true, segmentsTotal: 142, segmentsChanged: 18, model: 'gemini-3.6-flash', message: '', changes: changes, autoFixType: 'p_d_dialogue' },
    { timestamp: iso(0, -2), projectUid: 'uaIOjmcZIrbn7dQl8GSrR1', projectName: 'P&D Rollout Q4 – Mails', jobUid: 'Hk2LRo1Iqgmfuikg0gwPJa', targetLang: 'it_it', success: true, segmentsTotal: 142, segmentsChanged: 27, model: 'gemini-3.6-flash', message: '', changes: [{ id: 'seg-3', source: 'After the P&D Review, the P&D Check-In follows.', original: 'Dopo la revisione P&D, segue il controllo P&D.', corrected: 'Dopo la P&D Review, segue il P&D Check-In.', reason: 'Nomenklatur: nur Englisch' }], autoFixType: 'p_d_dialogue' },
    { timestamp: iso(1, 3), projectUid: 'kPq8ZmcZIrbn7dQl8GSrR9', projectName: 'HD 6/13 C Betriebsanleitung', jobUid: 'Pp9LRo1Iqgmfuikg0gwP11', targetLang: 'en_gb', success: true, segmentsTotal: 610, segmentsChanged: 64, model: 'gemini-3.6-flash', message: '', changes: [{ id: 'seg-88', source: 'Vor Inbetriebnahme Bedienungsanleitung lesen.', original: 'Read the operating instructions before commissioning.', corrected: 'Read the operating instructions before starting up the machine.', reason: 'Fachsprache' }], autoFixType: 'technical' },
    { timestamp: iso(1, 2), projectUid: 'kPq8ZmcZIrbn7dQl8GSrR9', projectName: 'HD 6/13 C Betriebsanleitung', jobUid: 'Qq9LRo1Iqgmfuikg0gwP12', targetLang: 'fr_fr', success: false, segmentsTotal: 610, segmentsChanged: 0, model: 'gemini-3.6-flash', message: 'Gemini Fehler 429: Resource exhausted', changes: [], autoFixType: 'technical' },
    { timestamp: iso(3, 1), projectUid: 'mM1aZmcZIrbn7dQl8GSrR4', projectName: 'Spring Campaign Website', jobUid: 'Rr9LRo1Iqgmfuikg0gwP13', targetLang: 'es_es', success: true, segmentsTotal: 88, segmentsChanged: 21, model: 'gemini-3.6-flash', message: '', changes: [{ id: 'seg-5', source: 'Kraftvoll. Zuverlässig. Kärcher.', original: 'Potente. Fiable. Kärcher.', corrected: 'Potencia. Fiabilidad. Kärcher.', reason: 'Claim an Markensprache angepasst' }], autoFixType: 'marketing' },
    { timestamp: iso(4, 1), projectUid: 'Replay', projectName: 'Replay', jobUid: 'GlJLRo1Iqgmfuikg0gwPJf', targetLang: 'de_de', success: true, segmentsTotal: 2, segmentsChanged: 2, model: '-', message: 'Replay', changes: changes, autoFixType: 'p_d_dialogue' },
    { timestamp: iso(9, 1), projectUid: 'kPq8ZmcZIrbn7dQl8GSrR9', projectName: 'K 2 Datenblatt', jobUid: 'Ss9LRo1Iqgmfuikg0gwP14', targetLang: 'pt_br', success: true, segmentsTotal: 40, segmentsChanged: 6, model: 'gemini-3.6-flash', message: '', changes: [], autoFixType: 'technical' }
  ];
  var db = {
    poller: { active: true, triggerId: 't1' }, running: false,
    access: {
      admins: ['mario.magliano@karcher.com'],
      users: [
        { email: 'lena.fischer@karcher.com', role: 'operator', active: true, addedBy: 'mario.magliano@karcher.com', addedAt: iso(20) },
        { email: 'sofia.rossi@karcher.com', role: 'viewer', active: true, addedBy: 'mario.magliano@karcher.com', addedAt: iso(12) }
      ],
      requests: [
        { id: 'r1', email: 'anna.nowak@karcher.com', role: 'operator', reason: 'Betreue die PL/CZ-Jobs und muss Re-Push auslösen', status: 'pending', createdAt: iso(0, -3) },
        { id: 'r0', email: 'max.muster@karcher.com', role: 'viewer', reason: 'Qualitätsberichte ansehen', status: 'approved', createdAt: iso(8), comment: 'ok' }
      ]
    },
    settings: { cfFieldUid: '1uw8kvE6WNhT6Gw0XeX4Z4', wfStepName: 'PE Gemini', markDoneAfterFix: true, primaryModel: 'gemini-3.6-flash', peTemperature: 0.1, maxTokens: 32768, tmThreshold: 0.7, pollerIntervalMinutes: 10 },
    config: { promptHubUrl: 'https://script.google.com/a/macros/karcher.com/s/PROMPT-HUB/exec', notifyEmails: [], chatWebhookUrl: '', allowedModels: ['gemini-3.6-flash', 'gemini-3.6-flash-lite', 'gemini-3.5-flash'] },
    runStatus: []
  };
  if (SC === 'open') db.access = { admins: [], users: [], requests: [] };
  function eff() { return { model: db.settings.primaryModel, temperature: db.settings.peTemperature, maxTokens: db.settings.maxTokens, batchSize: 25, singleBatchMax: 60, ignoredOverrides: ['geminiModel_marketing', 'geminiTemp_marketing'] }; }
  function ok(o) { o.success = true; return o; }

  var H = {
    apiHubBootstrap: function () {
      return ok({ email: EMAIL, role: ROLE, authorized: !!ROLE, openMode: !db.access.admins.length, lang: 'de', promptHubUrl: db.config.promptHubUrl,
        myRequests: ROLE ? undefined : db.access.requests.filter(function (r) { return r.email === EMAIL; }),
        pendingRequests: ROLE === 'admin' ? db.access.requests.filter(function (r) { return r.status === 'pending'; }).length : undefined });
    },
    apiHubSetLang: function (l) { return ok({ lang: l }); },
    apiHubDashboard: function () {
      var week = logs.filter(function (l) { return new Date(l.timestamp).getTime() >= NOW - 7 * DAY && l.projectName !== 'Replay'; });
      var segs = 0, ch = 0, f = 0, bt = {}, bl = {};
      week.forEach(function (l) { segs += l.segmentsTotal; ch += l.segmentsChanged; if (!l.success) f++; bt[l.autoFixType] = 1; bl[l.targetLang] = 1; });
      return ok({ poller: db.poller, running: db.running, lastRun: logs[0].timestamp, week: { jobs: week.length, failed: f, segments: segs, changed: ch, changeRate: Math.round(ch / segs * 1000) / 10, byType: bt, byLang: bl }, recent: logs.slice(0, 8), logError: '' });
    },
    apiHubPollerStart: function (m) { db.poller = { active: true }; return ok({ status: db.poller, interval: m }); },
    apiHubPollerStop: function () { db.poller = { active: false }; return ok({ status: db.poller }); },
    apiHubTestConnection: function () { return ok({ user: 'mario.magliano', model: 'gemini-3.6-flash OK' }); },
    apiHubDebugProjects: function () { return ok({ resultText: 'Projekt „P&D Rollout Q4 – Mails“ (uaIOjmcZ…): Custom Field gesetzt = P&D Dialogue → Typ p_d_dialogue\n  2 Jobs im Schritt „PE Gemini“ (NEW)' }); },
    apiHubClearRunStatus: function () { db.runStatus = []; return ok({}); },
    apiHubRunStatus: function () { return ok({ entries: db.runStatus }); },
    apiHubRunNow: function () {
      db.runStatus = [{ t: '09:41:02', level: 'INFO', msg: 'Suche Projekte mit AutoFix-Flag…' }, { t: '09:41:05', level: 'INFO', msg: '2 Projekt(e) gefunden' }, { t: '09:41:07', level: 'INFO', msg: '31 TB-Treffer geladen' }];
      return ok({ count: 2, results: [
        { success: true, projectUid: 'uaIOjmcZIrbn7dQl8GSrR1', results: [
          { success: true, filename: 'PnD_Mails_DE.xlf', jobUid: 'GlJLRo1Iqg', targetLang: 'de_de', autoFixType: 'p_d_dialogue', segmentsChanged: 18, segmentsTotal: 142 },
          { success: true, filename: 'PnD_Mails_IT.xlf', jobUid: 'Hk2LRo1Iqg', targetLang: 'it_it', autoFixType: 'p_d_dialogue', segmentsChanged: 27, segmentsTotal: 142 }] },
        { success: true, projectUid: 'kPq8ZmcZIrbn7dQl8GSrR9', results: [
          { success: true, filename: 'HD613C_BA_EN.docx', jobUid: 'Pp9LRo1Iqg', targetLang: 'en_gb', autoFixType: 'technical', segmentsChanged: 64, segmentsTotal: 610 },
          { skipped: true, filename: 'HD613C_BA_FR.docx', jobUid: 'Qq9LRo1Iqg', reason: 'Job nicht im Status NEW/ACCEPTED' }] }
      ] });
    },
    apiHubQueue: function () {
      return ok({ projects: [
        { name: 'P&D Rollout Q4 – Mails', uid: 'uaIOjmcZIrbn7dQl8GSrR1', autoFixType: 'p_d_dialogue', targetLangs: ['de_de', 'it_it', 'pt_br', 'zh_cn'], jobs: [1, 2, 3, 4] },
        { name: 'HD 6/13 C Betriebsanleitung', uid: 'kPq8ZmcZIrbn7dQl8GSrR9', autoFixType: 'technical', targetLangs: ['en_gb', 'fr_fr'], jobs: [1, 2] }
      ] });
    },
    apiHubRunLogs: function () { return ok({ logs: logs }); },
    apiHubReplay: function () { return ok({ matched: 2, totalChanges: 2, notMatched: 0, patchCount: 1 }); },
    apiHubFilterOptions: function () { return ok({ projectNames: ['HD 6/13 C Betriebsanleitung', 'K 2 Datenblatt', 'P&D Rollout Q4 – Mails', 'Spring Campaign Website'], autoFixTypes: ['marketing', 'p_d_dialogue', 'technical'], targetLangs: ['de_de', 'en_gb', 'es_es', 'fr_fr', 'it_it', 'pt_br'] }); },
    apiHubMqm: function (f, doExport) {
      return ok({ totalLogs: 6, totalSegments: 131, critical: 9, major: 47, minor: 75,
        aggregate: [
          { category: 'Terminology', subcategory: 'Termbase', critical: 4, major: 22, minor: 18, total: 44 },
          { category: 'Fluency', subcategory: 'Grammar', critical: 0, major: 9, minor: 24, total: 33 },
          { category: 'Accuracy', subcategory: 'Mistranslation', critical: 5, major: 11, minor: 6, total: 22 },
          { category: 'Style', subcategory: 'Kärcher Style', critical: 0, major: 5, minor: 17, total: 22 },
          { category: 'Locale', subcategory: 'Spelling Convention', critical: 0, major: 0, minor: 10, total: 10 }],
        details: logs.slice(0, 3).reduce(function (a, l) { return a.concat(l.changes.map(function (c) { return { timestamp: l.timestamp, projectName: l.projectName, targetLang: l.targetLang, source: c.source, original: c.original, corrected: c.corrected, mqmCategory: 'Terminology', mqmSubcategory: 'Termbase', mqmSeverity: 'major' }; })); }, []),
        detailsTotal: 131, detailsTruncated: false,
        exportResult: doExport ? { success: true, sheetName: 'MQM Report 2026-09-30 09:45', url: 'https://docs.google.com/spreadsheets/d/x/edit' } : null });
    },
    apiHubBenchmark: function () {
      return ok({ pairs: [
        { targetLang: 'it_it', errorRate: 19.0, totalErrors: 27, totalSegs: 142, totalJobs: 1, critical: 3, major: 14, minor: 10, topCategory: 'Terminology', topCategoryCount: 15 },
        { targetLang: 'es_es', errorRate: 23.9, totalErrors: 21, totalSegs: 88, totalJobs: 1, critical: 1, major: 8, minor: 12, topCategory: 'Style', topCategoryCount: 9 },
        { targetLang: 'de_de', errorRate: 12.7, totalErrors: 18, totalSegs: 142, totalJobs: 1, critical: 2, major: 9, minor: 7, topCategory: 'Terminology', topCategoryCount: 11 },
        { targetLang: 'en_gb', errorRate: 10.5, totalErrors: 64, totalSegs: 610, totalJobs: 1, critical: 3, major: 16, minor: 45, topCategory: 'Fluency', topCategoryCount: 30 }].sort(function (a, b) { return b.errorRate - a.errorRate; }) });
    },
    apiHubDrift: function () {
      return ok({ totalLogs: 6, terms: [
        { sourceTerm: 'P&D Check-In', targetLang: 'it_it', topOriginal: 'controllo P&D', topCorrected: 'P&D Check-In', driftScore: 12, projectCount: 3, projects: ['P&D Rollout Q4 – Mails', 'P&D Leader Briefing', 'P&D FAQ'], lastSeen: iso(0) },
        { sourceTerm: 'Inbetriebnahme', targetLang: 'en_gb', topOriginal: 'commissioning', topCorrected: 'starting up the machine', driftScore: 6, projectCount: 2, projects: ['HD 6/13 C Betriebsanleitung', 'K 2 Datenblatt'], lastSeen: iso(1) },
        { sourceTerm: 'manager', targetLang: 'de_de', topOriginal: 'Manager', topCorrected: 'Führungskraft', driftScore: 4, projectCount: 1, projects: ['P&D Rollout Q4 – Mails'], lastSeen: iso(0) }] });
    },
    apiHubGlossary: function () {
      return ok({ suggestions: [
        { sourceDe: 'Inbetriebnahme', targetLang: 'en_gb', targetTerm: 'start-up', confidence: 86, rationale: '6× gleich korrigiert, in 2 Projekten; „commissioning“ ist im Kärcher-Kontext unüblich.' },
        { sourceDe: 'Führungskraft', targetLang: 'it_it', targetTerm: 'responsabile', confidence: 72, rationale: 'Einheitliche Rollenbezeichnung in allen P&D-Texten.' },
        { sourceDe: 'Hochdruckreiniger', targetLang: 'pt_br', targetTerm: 'lavadora de alta pressão', confidence: 58, rationale: 'Variante pt-BR, bisher uneinheitlich (lavadora/limpadora).' }] });
    },
    apiHubPrompts: function () {
      return ok({ promptHubUrl: db.config.promptHubUrl, effective: eff(), prompts: [
        { type: 'technical', label: 'Technical Documentation', builtIn: true, managedByPromptHub: true, usesFallback: false, chars: 1653, text: '=== POST-EDITIERUNG (PE) — KÄRCHER TECHNISCHE DOKUMENTATION ===\n\nAUFTRAG: Du bist ein professioneller Übersetzer/Post-Editor bei Kärcher. …' },
        { type: 'marketing', label: 'Marketing', builtIn: true, managedByPromptHub: true, usesFallback: false, chars: 2011, text: '=== POST-EDITIERUNG (PE) — KÄRCHER MARKETING ===\n\nAUFTRAG: …' },
        { type: 'p_d_dialogue', label: 'P&D Dialogue', builtIn: false, managedByPromptHub: true, usesFallback: false, chars: 15379, text: '=== POST-EDITIERUNG (PE) — KÄRCHER P&D DIALOGUE (HR-PROZESS) ===\n\nAUFTRAG: …' },
        { type: 'campus', label: 'Campus', builtIn: false, managedByPromptHub: false, usesFallback: true, chars: 1653, text: '(Fallback: technischer Prompt)' }] });
    },
    apiHubDatabaseUrl: function () { return ok({ url: 'https://docs.google.com/spreadsheets/d/1LFoBCuz7h1xdi58djRPedAXgtj4RZ_T5EnvJbTKtkp8/edit' }); },
    apiHubRequestAccess: function (role, reason) {
      if (!reason) return { success: false, error: 'Bitte kurz begründen, wofür du den Zugriff brauchst.' };
      db.access.requests.push({ id: 'r' + Date.now(), email: EMAIL, role: role, reason: reason, status: 'pending', createdAt: new Date().toISOString() });
      return ok({ myRequests: db.access.requests.filter(function (r) { return r.email === EMAIL; }).reverse() });
    },
    apiHubAdminState: function () {
      return ok({ settings: db.settings, effective: eff(), config: db.config, admins: db.access.admins, users: db.access.users, requests: db.access.requests.slice().reverse(), openMode: !db.access.admins.length, running: db.running, settingsError: '',
        audit: [{ timestamp: iso(0, -1), action: 'Run gestartet (UI)', details: 'lena.fischer@karcher.com: ' }, { timestamp: iso(0, -3), action: 'Zugriff beantragt', details: 'anna.nowak@karcher.com: operator' }, { timestamp: iso(1), action: 'Prompt Updated', details: 'Prompt für Typ "p_d_dialogue" aktualisiert.' }] });
    },
    apiHubAdminSaveSettings: function (p) { Object.keys(p).forEach(function (k) { db.settings[k] = k === 'markDoneAfterFix' ? p[k] === 'true' : p[k]; }); return ok({ saved: Object.keys(p) }); },
    apiHubAdminSaveConfig: function (p) { Object.keys(p).forEach(function (k) { db.config[k] = p[k]; }); return ok({ config: db.config }); },
    apiHubAdminSaveUser: function (u) { db.access.users = db.access.users.filter(function (x) { return x.email !== u.email; }); u.addedAt = new Date().toISOString(); db.access.users.push(u); return ok({ users: db.access.users }); },
    apiHubAdminRemoveUser: function (e) { db.access.users = db.access.users.filter(function (x) { return x.email !== e; }); return ok({}); },
    apiHubAdminSetAdmin: function (e, make) { if (make) db.access.admins.push(e); else db.access.admins = db.access.admins.filter(function (x) { return x !== e; }); return ok({ admins: db.access.admins }); },
    apiHubAdminDecide: function (id, approve, role) {
      var r = db.access.requests.filter(function (x) { return x.id === id; })[0];
      r.status = approve ? 'approved' : 'rejected';
      if (approve) db.access.users.push({ email: r.email, role: role, active: true, addedAt: new Date().toISOString() });
      return ok({});
    },
    apiHubAdminForceUnlock: function () { db.running = false; return ok({}); },
    apiHubAdminClearCache: function () { return ok({}); },
    apiHubAdminExportToPromptHub: function () { return ok({ types: 5, users: 9, admins: 1 }); },
    apiHubAdminPreviewAs: function (e) { return ok({ email: e, role: 'viewer' }); }
  };

  function runner(okFn, failFn) {
    return new Proxy({}, {
      get: function (_, name) {
        if (name === 'withSuccessHandler') return function (fn) { return runner(fn, failFn); };
        if (name === 'withFailureHandler') return function (fn) { return runner(okFn, fn); };
        return function () {
          var args = arguments;
          setTimeout(function () {
            try {
              var res = H[name] ? H[name].apply(null, args) : { success: false, error: 'Mock fehlt: ' + name };
              if (okFn) okFn(JSON.parse(JSON.stringify(res)));
            } catch (e) { if (failFn) failFn(e); else throw e; }
          }, 30);
        };
      }
    });
  }
  window.google = { script: { run: runner(null, null) } };
  window.__mockDb = db;
})();
