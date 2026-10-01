/* global t, applyI18n, LANG:writable, google */
// AutoFix Hub - Oberflaeche. Ruft ausschliesslich die api*-Funktionen aus HubApi.gs auf.
var App = (function () {
  'use strict';

  var S = {
    boot: null, tab: 'dashboard',
    dash: null, queue: null, logs: null, logFilter: { q: '', status: 'all', type: 'all' }, openDiffs: {},
    lr: { running: false, logs: [], seen: 0, stats: { projects: 0, projTotal: 0, jobs: 0, jobTotal: 0, segs: 0, errors: 0 }, state: '', text: '', error: '' },
    analysis: { sub: 'mqm', options: null, result: {}, busy: false, filters: {} },
    prompts: null, admin: null
  };
  var timers = {};
  var RANK = { viewer: 1, operator: 2, admin: 3 };

  // ------------------------------------------------------------------
  // Grundlagen
  // ------------------------------------------------------------------
  function call(name) {
    var args = Array.prototype.slice.call(arguments, 1);
    return new Promise(function (resolve) {
      google.script.run
        .withSuccessHandler(function (res) { resolve(res || { success: false, error: 'Leere Antwort' }); })
        .withFailureHandler(function (err) { resolve({ success: false, error: (err && err.message) || String(err) }); })[name].apply(null, args);
    });
  }
  function h(s) {
    return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(id) { return document.getElementById(id); }
  function badge(cls, text) { return '<span class="status-badge ' + cls + '">' + h(text) + '</span>'; }
  function can(role) { return !!S.boot && RANK[S.boot.role] >= RANK[role]; }
  function toast(msg, isErr) {
    var el = $('toast');
    el.textContent = msg;
    el.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(timers.toast);
    timers.toast = setTimeout(function () { el.className = 'toast'; }, isErr ? 6000 : 3000);
  }
  function fmtDate(iso, dateOnly) {
    if (!iso) return '–';
    var d = new Date(iso);
    if (isNaN(d)) return String(iso);
    var loc = LANG === 'en' ? 'en-GB' : 'de-DE';
    return dateOnly ? d.toLocaleDateString(loc) : d.toLocaleString(loc, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function ts() { return new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  function loader() { return '<div class="loader"></div>'; }
  function errBox(msg) { return '<div class="notice err">' + h(msg) + '</div>'; }
  function empty(msg) { return '<div class="empty">' + h(msg) + '</div>'; }
  function typeBadge(type) { return type ? badge('b-blue', type) : badge('b-gray', '–'); }

  function dialog(html) { $('dialogBody').innerHTML = html; $('dialog').classList.add('show'); }
  function closeDialog() { $('dialog').classList.remove('show'); }
  function confirmDialog(title, text, okLabel) {
    return new Promise(function (resolve) {
      dialog('<h3>' + h(title) + '</h3><p style="line-height:1.6">' + text + '</p><div class="btn-row" style="justify-content:flex-end;margin-top:20px">' +
        '<button class="btn btn-secondary" id="dlgNo">' + t('cancel') + '</button><button class="btn btn-primary" id="dlgYes">' + h(okLabel || t('confirm')) + '</button></div>');
      $('dlgNo').onclick = function () { closeDialog(); resolve(false); };
      $('dlgYes').onclick = function () { closeDialog(); resolve(true); };
    });
  }

  // Wortweiser Diff fuer Original -> Korrektur (wie im Prompt Hub)
  function diffWords(a, b) {
    var A = String(a || '').split(/(\s+)/), B = String(b || '').split(/(\s+)/);
    if (A.length * B.length > 250000) return [{ op: 'del', text: a }, { op: 'ins', text: b }];
    var n = A.length, m = B.length, dp = [], i, j;
    for (i = 0; i <= n; i++) dp.push(new Array(m + 1).fill(0));
    for (i = n - 1; i >= 0; i--) for (j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    var out = [];
    function push(op, tx) { if (out.length && out[out.length - 1].op === op) out[out.length - 1].text += tx; else out.push({ op: op, text: tx }); }
    i = 0; j = 0;
    while (i < n && j < m) {
      if (A[i] === B[j]) { push('eq', A[i]); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) { push('del', A[i]); i++; } else { push('ins', B[j]); j++; }
    }
    while (i < n) push('del', A[i++]);
    while (j < m) push('ins', B[j++]);
    return out;
  }
  function diffHtml(a, b) {
    return diffWords(a, b).map(function (p) { return p.op === 'eq' ? h(p.text) : '<span class="diff-' + p.op + '">' + h(p.text) + '</span>'; }).join('');
  }

  // ------------------------------------------------------------------
  // Start
  // ------------------------------------------------------------------
  function init() {
    updateThemeLabel();
    call('apiHubBootstrap').then(function (res) {
      $('boot').classList.add('hidden');
      if (!res.success) { $('boot').classList.remove('hidden'); $('boot').innerHTML = errBox(res.error); return; }
      S.boot = res;
      LANG = res.lang || 'de';
      markLang(); applyI18n(); updateThemeLabel();
      $('userChip').textContent = res.email || '';
      if (!res.authorized) { renderDenied(); return; }
      $('tabNav').classList.remove('hidden');
      if (res.openMode) {
        var b = $('openModeBanner');
        b.innerHTML = '<b>Zugriffsschutz ist noch nicht eingerichtet.</b> Aktuell darf jeder in der Domain alles. Lege unter Admin → Admins den ersten Admin fest – danach ist AutoFix Hub nur noch für Admins.';
        b.classList.remove('hidden');
      }
      if (can('admin')) {
        $('tabbtn-admin').classList.remove('hidden');
        if (res.pendingRequests) { $('adminCount').textContent = res.pendingRequests; $('adminCount').classList.remove('hidden'); }
      }
      var hash = (location.hash || '').replace('#', '');
      showTab(['dashboard', 'liverun', 'queue', 'runlog', 'analysis', 'prompts', 'admin', 'help'].indexOf(hash) !== -1 ? hash : 'dashboard');
    });
  }
  function setLang(l) { LANG = l; markLang(); applyI18n(); updateThemeLabel(); rerender(); call('apiHubSetLang', l); }
  function markLang() {
    document.querySelectorAll('.lang-btn').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-lang') === LANG); });
    document.documentElement.lang = LANG;
  }
  function toggleTheme() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (dark) document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', 'dark');
    try { localStorage.setItem('afh_theme', dark ? 'light' : 'dark'); } catch (e) {}
    updateThemeLabel();
  }
  function updateThemeLabel() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    var b = $('themeBtn'); if (b) b.textContent = t(dark ? 'theme_light' : 'theme_dark');
  }
  function showTab(tab) {
    if (tab === 'admin' && !can('admin')) tab = 'dashboard';
    S.tab = tab;
    try { history.replaceState(null, '', '#' + tab); } catch (e) {}
    document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-tab') === tab); });
    document.querySelectorAll('.tab-content').forEach(function (c) { c.classList.toggle('active', c.id === 'tab-' + tab); });
    rerender(true);
  }
  function rerender(load) {
    if (!S.boot || !S.boot.authorized) { if (S.boot) renderDenied(); return; }
    ({ dashboard: renderDashboard, liverun: renderLiveRun, queue: renderQueue, runlog: renderRunLog, analysis: renderAnalysis, prompts: renderPrompts, admin: renderAdmin, help: renderHelp })[S.tab](load);
  }

  // ------------------------------------------------------------------
  // DASHBOARD
  // ------------------------------------------------------------------
  function renderDashboard(load) {
    if (load || !S.dash) {
      if (!S.dash) $('tab-dashboard').innerHTML = loader();
      call('apiHubDashboard').then(function (res) { S.dash = res; if (S.tab === 'dashboard') drawDashboard(); });
      if (S.dash) drawDashboard();
      return;
    }
    drawDashboard();
  }
  function drawDashboard() {
    var d = S.dash;
    if (!d.success) { $('tab-dashboard').innerHTML = errBox(d.error); return; }
    var w = d.week;
    var html = '<div class="kpi-grid">' +
      '<div class="kpi ' + (d.poller.active ? 'green' : 'gray') + '"><div class="kpi-val">' + (d.poller.active ? t('active') : t('inactive')) + '</div><div class="kpi-label">' + t('poller') + '</div>' +
      (can('operator') ? '<div class="btn-row" style="margin-top:10px">' + [5, 10, 30].map(function (m) { return '<button class="btn btn-sm btn-secondary" onclick="App.pollerStart(' + m + ')">' + m + ' Min</button>'; }).join('') +
        (d.poller.active ? '<button class="btn btn-sm btn-red" onclick="App.pollerStop()">' + t('stop') + '</button>' : '') + '</div>' : '') + '</div>' +
      '<div class="kpi ' + (d.running ? '' : 'gray') + '"><div class="kpi-val">' + (d.running ? t('running') : t('ready')) + '</div><div class="kpi-label">' + t('run_state') + '</div><div class="kpi-sub">Letzter Lauf: ' + h(fmtDate(d.lastRun)) + '</div></div>' +
      '<div class="kpi"><div class="kpi-val">' + w.jobs + '</div><div class="kpi-label">' + t('jobs_7d') + '</div><div class="kpi-sub">' + Object.keys(w.byLang).length + ' Sprachen · ' + Object.keys(w.byType).length + ' Typen</div></div>' +
      '<div class="kpi"><div class="kpi-val">' + w.changed.toLocaleString() + '</div><div class="kpi-label">' + t('changed_7d') + '</div><div class="kpi-sub">' + w.changeRate + ' % von ' + w.segments.toLocaleString() + '</div></div>' +
      '<div class="kpi ' + (w.failed ? 'red' : 'green') + '"><div class="kpi-val">' + w.failed + '</div><div class="kpi-label">' + t('errors_7d') + '</div></div>' +
      '</div>';
    html += '<div class="admin-grid"><div class="card black span4"><div class="section-title"><span>' + t('recent_runs') + '</span><button class="btn btn-sm btn-secondary" onclick="App.showTab(\'runlog\')">' + t('tab_runlog') + '</button></div>' +
      (d.logError ? errBox(d.logError) : '') +
      (d.recent.length ? '<div class="table-wrap"><table class="history-table"><thead><tr><th>' + t('date') + '</th><th>' + t('project') + '</th><th>' + t('type') + '</th><th>' + t('language') + '</th><th>' + t('status') + '</th><th>' + t('segs_changed') + '</th></tr></thead><tbody>' +
        d.recent.map(function (l) {
          return '<tr><td style="white-space:nowrap">' + h(fmtDate(l.timestamp)) + '</td><td>' + h(l.projectName) + '</td><td>' + typeBadge(l.autoFixType) + '</td><td>' + badge('b-gray', l.targetLang) + '</td><td>' + (l.success ? badge('b-green', 'OK') : badge('b-red', 'Fehler')) + '</td><td><b>' + l.segmentsChanged + '</b> / ' + l.segmentsTotal + '</td></tr>';
        }).join('') + '</tbody></table></div>' : empty('Noch keine Läufe.')) + '</div>';
    html += '<div class="card yellow span2"><div class="section-title"><span>' + t('quick_actions') + '</span></div><div class="action-list">' +
      (can('operator') ? '<button class="btn btn-primary" onclick="App.runManual()">' + t('run_now') + '</button><button class="btn btn-secondary" onclick="App.testConnection()">' + t('test_connection') + '</button>' : '') +
      '<button class="btn btn-secondary" onclick="App.openSheet()">' + t('open_sheet') + '</button>' +
      (S.boot.promptHubUrl ? '<a class="btn btn-secondary" href="' + h(S.boot.promptHubUrl) + '" target="_blank" rel="noopener">' + t('open_prompt_hub') + '</a>' : '') +
      '<div id="connResult"></div></div></div></div>';
    $('tab-dashboard').innerHTML = html;
  }
  function pollerStart(m) {
    call('apiHubPollerStart', m).then(function (res) { if (!res.success) return toast(res.error, true); toast('Poller läuft alle ' + m + ' Minuten.'); S.dash = null; renderDashboard(true); });
  }
  function pollerStop() {
    confirmDialog('Poller stoppen', 'AutoFix verarbeitet dann keine Projekte mehr automatisch, bis der Poller wieder gestartet wird.', t('stop')).then(function (ok) {
      if (ok) call('apiHubPollerStop').then(function (res) { if (!res.success) return toast(res.error, true); toast('Poller gestoppt.'); S.dash = null; renderDashboard(true); });
    });
  }
  function testConnection() {
    var el = $('connResult'); if (el) el.innerHTML = '<span class="spin-sm"></span>';
    call('apiHubTestConnection').then(function (r) {
      var html = r.success ? '<div class="issue ok">' + '<div>Phrase: <b>' + h(r.user) + '</b><br>Gemini: <b>' + h(r.model) + '</b></div></div>' : '<div class="issue error">' + '<div>' + h(r.error) + '</div></div>';
      if ($('connResult')) $('connResult').innerHTML = html; else toast(r.success ? 'Verbindung OK' : r.error, !r.success);
    });
  }
  function openSheet() {
    call('apiHubDatabaseUrl').then(function (r) { if (r.success && r.url) window.open(r.url, '_blank'); else toast(r.error || 'Sheet nicht gefunden', true); });
  }

  // ------------------------------------------------------------------
  // LIVE-RUN
  // ------------------------------------------------------------------
  function renderLiveRun() {
    var L = S.lr, st = L.stats;
    var pct = function (a, b) { return b > 0 ? Math.round(a / b * 100) : 0; };
    var html = '<div class="kpi-grid">' +
      '<div class="kpi"><div class="kpi-val">' + (st.projTotal || '–') + '</div><div class="kpi-label">' + t('projects') + '</div><div class="progress"><span style="width:' + pct(st.projects, st.projTotal) + '%"></span></div></div>' +
      '<div class="kpi"><div class="kpi-val">' + (st.jobTotal ? st.jobs + '/' + st.jobTotal : '–') + '</div><div class="kpi-label">' + t('jobs') + '</div><div class="progress"><span style="width:' + pct(st.jobs, st.jobTotal) + '%"></span></div></div>' +
      '<div class="kpi"><div class="kpi-val">' + (st.segs || '–') + '</div><div class="kpi-label">' + t('segs_changed') + '</div></div>' +
      '<div class="kpi ' + (st.errors ? 'red' : 'gray') + '"><div class="kpi-val">' + (st.errors || '–') + '</div><div class="kpi-label">' + t('errors') + '</div></div></div>';
    html += '<div class="card black"><div class="section-title"><span class="run-state"><span class="run-dot ' + L.state + '"></span>' + h(L.text || t('ready')) + '</span><div class="btn-row">' +
      (can('operator') ? '<button class="btn btn-primary" id="lrRunBtn" onclick="App.runManual()"' + (L.running ? ' disabled' : '') + '>' + (L.running ? '<span class="spin-sm"></span>' : '') + t('run_now') + '</button>' : '') +
      '<button class="btn btn-secondary" onclick="App.lrClear()"' + (L.running ? ' disabled' : '') + '>' + t('clear') + '</button></div></div>' +
      '<div class="console" id="lrConsole">' + consoleHtml() + '</div>' +
      (L.error ? '<div class="notice err" style="margin-top:14px">' + '<pre style="margin:0;white-space:pre-wrap">' + h(L.error) + '</pre></div>' : '') +
      '</div>';
    $('tab-liverun').innerHTML = html;
    var c = $('lrConsole'); c.scrollTop = c.scrollHeight;
  }
  function consoleHtml() {
    if (!S.lr.logs.length) return '<div><span class="t">--:--:--</span><span class="l INFO">INFO</span>Bereit. „' + t('run_now') + '“ startet einen Lauf über alle Projekte mit AutoFix-Flag.</div>';
    return S.lr.logs.map(function (e) {
      return '<div><span class="t">' + h(e.t) + '</span><span class="l ' + h(e.level) + '">' + h(e.level) + '</span>' + h(e.msg) + (e.sub ? ' <span class="sub">· ' + h(e.sub) + '</span>' : '') + '</div>';
    }).join('');
  }
  function lrLog(level, msg, sub) {
    S.lr.logs.push({ t: ts(), level: level, msg: msg, sub: sub || '' });
    if (S.tab === 'liverun') { var c = $('lrConsole'); if (c) { c.innerHTML = consoleHtml(); c.scrollTop = c.scrollHeight; } }
  }
  function lrClear() {
    S.lr = { running: false, logs: [], seen: 0, stats: { projects: 0, projTotal: 0, jobs: 0, jobTotal: 0, segs: 0, errors: 0 }, state: '', text: '', error: '' };
    renderLiveRun();
  }
  function runManual() {
    if (S.lr.running) return showTab('liverun');
    lrClear();
    S.lr.running = true; S.lr.state = 'active'; S.lr.text = t('running');
    showTab('liverun');
    lrLog('INFO', 'Starte AutoFix-Lauf …');
    call('apiHubClearRunStatus').then(function () {
      timers.poll = setInterval(function () {
        if (!S.lr.running) return clearInterval(timers.poll);
        call('apiHubRunStatus').then(function (r) {
          if (!r || !r.entries) return;
          var fresh = r.entries.slice(S.lr.seen);
          S.lr.seen = r.entries.length;
          fresh.forEach(function (e) { S.lr.logs.push({ t: e.t || ts(), level: e.level || 'INFO', msg: e.msg || '', sub: '' }); });
          if (fresh.length && S.tab === 'liverun') { var c = $('lrConsole'); if (c) { c.innerHTML = consoleHtml(); c.scrollTop = c.scrollHeight; } }
        });
      }, 2000);
    });
    call('apiHubRunNow').then(function (r) {
      clearInterval(timers.poll);
      var L = S.lr; L.running = false;
      if (!r.success) { lrLog('ERR', r.error); L.state = 'error'; L.text = 'Fehlgeschlagen'; L.error = r.error; renderIf('liverun'); return; }
      var projects = r.results || [];
      L.stats.projTotal = L.stats.projects = r.count || projects.length;
      if (!L.stats.projTotal) { lrLog('WARN', 'Keine Projekte mit AutoFix-Flag.'); L.state = 'done'; L.text = 'Fertig – nichts zu tun'; renderIf('liverun'); return; }
      var hasErr = false;
      projects.forEach(function (p) {
        if (!p.success) { lrLog('ERR', 'Projekt-Fehler: ' + (p.projectUid || '?'), p.error); L.stats.errors++; hasErr = true; return; }
        (p.results || []).forEach(function (job) {
          L.stats.jobTotal++; L.stats.jobs++;
          if (job.skipped) lrLog('WARN', 'Übersprungen: ' + (job.filename || job.jobUid), job.reason);
          else if (!job.success) { L.stats.errors++; hasErr = true; lrLog('ERR', 'Job-Fehler: ' + (job.filename || job.jobUid), job.targetLang); L.error = job.error || 'Unbekannter Fehler'; }
          else { L.stats.segs += job.segmentsChanged || 0; lrLog('OK', job.filename || job.jobUid, job.targetLang + (job.autoFixType ? ' [' + job.autoFixType + ']' : '') + ' | ' + (job.segmentsChanged || 0) + '/' + (job.segmentsTotal || 0) + ' Seg'); }
        });
      });
      L.state = hasErr ? 'error' : 'done';
      L.text = hasErr ? 'Beendet mit Fehlern' : 'Erfolgreich beendet';
      toast(hasErr ? 'Lauf beendet – mit Fehlern.' : 'AutoFix abgeschlossen.', hasErr);
      S.logs = null; S.dash = null;
      renderIf('liverun');
    });
  }
  function renderIf(tab) { if (S.tab === tab) rerender(); }

  // ------------------------------------------------------------------
  // WARTESCHLANGE
  // ------------------------------------------------------------------
  function renderQueue(load) {
    if (load || !S.queue) {
      $('tab-queue').innerHTML = loader();
      call('apiHubQueue').then(function (r) { S.queue = r; renderIf('queue'); });
      if (!S.queue) return;
    }
    var r = S.queue;
    var html = '<div class="card yellow"><div class="section-title"><span>' + t('tab_queue') + '</span><div class="btn-row">' +
      (can('operator') ? '<button class="btn btn-sm btn-primary" onclick="App.runManual()">' + t('run_now') + '</button>' : '') +
      '<button class="btn btn-sm btn-secondary" onclick="App.reloadQueue()">' + t('refresh') + '</button></div></div>' +
      '<p class="hint">Projekte in Phrase mit gesetztem AutoFix-Custom-Field und Jobs im Workflow-Schritt „PE Gemini“.</p>';
    if (!r.success) html += errBox(r.error);
    else if (!r.projects.length) html += empty('Die Warteschlange ist leer.');
    else {
      html += '<div class="table-wrap"><table class="history-table"><thead><tr><th>' + t('project') + '</th><th>UID</th><th>' + t('type') + '</th><th>Zielsprachen</th><th>Jobs</th></tr></thead><tbody>' +
        r.projects.map(function (p) {
          return '<tr><td><b>' + h(p.name) + '</b></td><td class="mono-sm">' + h(p.uid) + '</td><td>' + typeBadge(p.autoFixType) + '</td><td>' +
            (p.targetLangs || []).map(function (l) { return badge('b-gray', l); }).join(' ') + '</td><td><b>' + (p.jobs || []).length + '</b></td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    $('tab-queue').innerHTML = html + '</div>';
  }
  function reloadQueue() { S.queue = null; renderQueue(true); }

  // ------------------------------------------------------------------
  // RUN LOG
  // ------------------------------------------------------------------
  function renderRunLog(load) {
    if (load || !S.logs) {
      if (!S.logs) $('tab-runlog').innerHTML = loader();
      call('apiHubRunLogs').then(function (r) { S.logs = r; renderIf('runlog'); });
      if (!S.logs) return;
    }
    var r = S.logs, F = S.logFilter;
    var html = '<div class="card black"><div class="section-title"><span>' + t('tab_runlog') + '</span><div class="btn-row">' +
      '<button class="btn btn-sm btn-secondary" onclick="App.openSheet()">' + t('open_sheet') + '</button>' +
      '<button class="btn btn-sm btn-secondary" onclick="App.reloadLogs()">' + t('refresh') + '</button></div></div>';
    if (!r.success) { $('tab-runlog').innerHTML = html + errBox(r.error) + '</div>'; return; }
    var types = {}; r.logs.forEach(function (l) { types[l.autoFixType] = true; });
    html += '<div class="toolbar"><input class="grow" id="logQ" placeholder="' + t('search') + '" value="' + h(F.q) + '" oninput="App.setLogFilter(\'q\', this.value)" style="max-width:360px">' +
      '<select style="width:auto" onchange="App.setLogFilter(\'status\', this.value)">' + [['all', t('all')], ['ok', 'OK'], ['fail', 'Fehler'], ['replay', 'Replay']].map(function (o) { return '<option value="' + o[0] + '"' + (F.status === o[0] ? ' selected' : '') + '>' + t('status') + ': ' + o[1] + '</option>'; }).join('') + '</select>' +
      '<select style="width:auto" onchange="App.setLogFilter(\'type\', this.value)"><option value="all">' + t('type') + ': ' + t('all') + '</option>' + Object.keys(types).sort().map(function (x) { return '<option' + (F.type === x ? ' selected' : '') + '>' + h(x) + '</option>'; }).join('') + '</select>' +
      '<span class="muted" id="logCount"></span></div><div id="logTable">' + logTableHtml() + '</div></div>';
    $('tab-runlog').innerHTML = html;
    updateLogCount();
  }
  function filteredLogs() {
    var F = S.logFilter, q = F.q.toLowerCase();
    return S.logs.logs.map(function (l, i) { l._idx = i; return l; }).filter(function (l) {
      var isReplay = l.projectName === 'Replay';
      if (F.status === 'ok' && !l.success) return false;
      if (F.status === 'fail' && l.success) return false;
      if (F.status === 'replay' && !isReplay) return false;
      if (F.type !== 'all' && l.autoFixType !== F.type) return false;
      if (q && (l.projectName + ' ' + l.targetLang + ' ' + l.jobUid + ' ' + l.message).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
  }
  function logTableHtml() {
    var list = filteredLogs();
    if (!list.length) return empty('Keine passenden Einträge.');
    return '<div class="table-wrap"><table class="history-table"><thead><tr><th>' + t('date') + '</th><th>' + t('project') + '</th><th>' + t('type') + '</th><th>' + t('language') + '</th><th>' + t('status') + '</th><th>Segmente</th><th>' + t('changes') + '</th><th></th></tr></thead><tbody>' +
      list.map(function (l) {
        var i = l._idx, isReplay = l.projectName === 'Replay', n = (l.changes || []).length;
        var row = '<tr><td style="white-space:nowrap">' + h(fmtDate(l.timestamp)) + '</td><td><b>' + h(l.projectName) + '</b><div class="mono-sm">' + h(l.jobUid) + '</div></td><td>' + typeBadge(l.autoFixType) + '</td><td>' + badge('b-gray', l.targetLang) + '</td>' +
          '<td>' + (l.success ? badge('b-green', 'OK') : badge('b-red', 'Fehler')) + (isReplay ? ' ' + badge('b-yellow', 'Replay') : '') + '</td><td><b>' + l.segmentsChanged + '</b> / ' + l.segmentsTotal + '</td>' +
          '<td>' + (n ? '<button class="row-toggle" onclick="App.toggleDiff(' + i + ')">' + (S.openDiffs[i] ? '– ' : '+ ') + n + ' ' + t('changes') + '</button>' : '<span class="muted">–</span>') + '</td>' +
          '<td style="white-space:nowrap">' + (n && !isReplay && can('operator') ? '<button class="btn btn-sm btn-secondary" onclick="App.openReplay(' + i + ')">' + t('repush') + '</button>' : '') + '</td></tr>';
        if (l.message && !l.success) row += '<tr><td colspan="8"><div class="notice err" style="margin:0">' + h(l.message) + '</div></td></tr>';
        if (S.openDiffs[i] && n) {
          row += '<tr><td colspan="8"><div class="diff-grid"><div class="hd">Seg</div><div class="hd">Source</div><div class="hd">Original → Korrigiert</div>' +
            l.changes.map(function (c) {
              return '<div class="mono-sm">' + h(c.id) + '</div><div>' + h(c.source) + '</div><div>' + diffHtml(c.original, c.corrected) + (c.reason ? '<div class="muted" style="margin-top:4px">' + h(c.reason) + '</div>' : '') + '</div>';
            }).join('') + '</div></td></tr>';
        }
        return row;
      }).join('') + '</tbody></table></div>';
  }
  function updateLogCount() { var c = $('logCount'); if (c && S.logs && S.logs.success) c.textContent = filteredLogs().length + ' / ' + S.logs.logs.length; }
  function setLogFilter(k, v) { S.logFilter[k] = v; $('logTable').innerHTML = logTableHtml(); updateLogCount(); }
  function toggleDiff(i) { S.openDiffs[i] = !S.openDiffs[i]; $('logTable').innerHTML = logTableHtml(); }
  function reloadLogs() { S.logs = null; renderRunLog(true); }
  function openReplay(i) {
    var l = S.logs.logs[i];
    dialog('<h3>' + t('repush') + ' nach Phrase</h3>' +
      '<div class="notice info">' + '<div>Die gespeicherten Änderungen werden per <b>Source-Text-Abgleich</b> auf den Job angewendet – ohne neuen Gemini-Aufruf.</div></div>' +
      '<div class="notice warn">' + '<div>Der Job muss im Schritt „PE Gemini“ den Status <b>NEW oder ACCEPTED</b> haben.</div></div>' +
      '<div class="form-grid"><div class="form-row"><label>Project UID</label><input id="rpProject" value="' + h(l.projectUid) + '"></div><div class="form-row"><label>Job UID</label><input id="rpJob" value="' + h(l.jobUid) + '"></div></div>' +
      '<div class="form-row"><label>Changes JSON</label><textarea id="rpChanges" class="mono" rows="8">' + h(JSON.stringify(l.changes, null, 2)) + '</textarea></div><div id="rpResult"></div>' +
      '<div class="btn-row" style="justify-content:flex-end"><button class="btn btn-secondary" onclick="App.closeDialog()">' + t('cancel') + '</button><button class="btn btn-primary" id="rpGo">' + t('repush') + '</button></div>');
    $('rpGo').onclick = function () {
      $('rpGo').disabled = true; $('rpResult').innerHTML = '<span class="spin-sm"></span>';
      call('apiHubReplay', $('rpProject').value.trim(), $('rpJob').value.trim(), $('rpChanges').value.trim()).then(function (r) {
        $('rpGo').disabled = false;
        if (!r.success) { $('rpResult').innerHTML = errBox(r.error); return; }
        $('rpResult').innerHTML = '<div class="notice ok">' + '<div><b>Re-Push erfolgreich.</b> Gematcht: ' + r.matched + ' / ' + r.totalChanges + ' · nicht gefunden: ' + r.notMatched + ' · Patches: ' + r.patchCount + '</div></div>';
        toast('Re-Push abgeschlossen: ' + r.matched + ' Segmente.'); S.logs = null;
      });
    };
  }

  // ------------------------------------------------------------------
  // ANALYSEN
  // ------------------------------------------------------------------
  var SUBS = [
    { key: 'mqm', fields: ['dateFrom', 'dateTo', 'projectName', 'autoFixType', 'targetLang'], days: 30, hint: 'Gemini ordnet jede Korrektur einer MQM-Kategorie und einem Schweregrad zu.' },
    { key: 'benchmark', fields: ['dateFrom', 'dateTo', 'autoFixType'], days: 90, hint: 'Fehlerquote je Zielsprache auf Basis der MQM-Klassifizierung.' },
    { key: 'drift', fields: ['dateFrom', 'dateTo', 'targetLang'], days: 90, hint: 'Begriffe, die AutoFix immer wieder gleich korrigiert – Kandidaten für Termbase oder Prompt.' },
    { key: 'glossary', fields: ['dateFrom', 'dateTo', 'targetLang'], days: 90, hint: 'Gemini schlägt neue Termbase-Einträge vor. Nur zur manuellen Übernahme in Phrase.' }
  ];
  function renderAnalysis() {
    var A = S.analysis;
    if (!A.options) {
      call('apiHubFilterOptions').then(function (r) { A.options = r.success ? r : { projectNames: [], autoFixTypes: [], targetLangs: [] }; renderIf('analysis'); });
    }
    var sub = SUBS.filter(function (x) { return x.key === A.sub; })[0];
    var f = A.filters[sub.key] || (A.filters[sub.key] = defaultFilters(sub.days));
    var o = A.options || { projectNames: [], autoFixTypes: [], targetLangs: [] };
    var sel = function (id, label, values, cur, allVal) {
      return '<div class="form-row"><label>' + label + '</label><select id="an-' + id + '"><option value="' + allVal + '">' + t('all') + '</option>' +
        values.map(function (v) { return '<option' + (v === cur ? ' selected' : '') + '>' + h(v) + '</option>'; }).join('') + '</select></div>';
    };
    var fields = {
      dateFrom: '<div class="form-row"><label>' + t('date_from') + '</label><input type="date" id="an-dateFrom" value="' + h(f.dateFrom) + '"></div>',
      dateTo: '<div class="form-row"><label>' + t('date_to') + '</label><input type="date" id="an-dateTo" value="' + h(f.dateTo) + '"></div>',
      projectName: sel('projectName', t('project'), o.projectNames, f.projectName, ''),
      autoFixType: sel('autoFixType', t('type'), o.autoFixTypes, f.autoFixType, 'all'),
      targetLang: sel('targetLang', t('language'), o.targetLangs, f.targetLang, 'all')
    };
    var html = '<div class="sub-nav">' + SUBS.map(function (x) { return '<button class="' + (x.key === A.sub ? 'active' : '') + '" onclick="App.setSub(\'' + x.key + '\')">' + t(x.key) + '</button>'; }).join('') + '</div>' +
      '<div class="card yellow"><div class="section-title"><span>' + t(sub.key) + '</span></div><p class="hint">' + h(sub.hint) + '</p>' +
      '<div class="filter-grid">' + sub.fields.map(function (k) { return fields[k]; }).join('') + '</div><div class="btn-row">' +
      (can('operator') ? '<button class="btn btn-primary" onclick="App.runAnalysis(false)"' + (A.busy ? ' disabled' : '') + '>' + (A.busy ? '<span class="spin-sm"></span>' : '') + t('generate') + '</button>' +
        (sub.key === 'mqm' ? '<button class="btn btn-black" onclick="App.runAnalysis(true)"' + (A.busy ? ' disabled' : '') + '>' + t('export_sheet') + '</button>' : '')
        : '') +
      '</div></div><div id="anResult">' + analysisResultHtml(sub.key) + '</div>';
    $('tab-analysis').innerHTML = html;
  }
  function defaultFilters(days) {
    var d = new Date(); d.setDate(d.getDate() - days);
    return { dateFrom: d.toISOString().split('T')[0], dateTo: new Date().toISOString().split('T')[0], projectName: '', autoFixType: 'all', targetLang: 'all' };
  }
  function setSub(k) { readFilters(); S.analysis.sub = k; renderAnalysis(); }
  function readFilters() {
    var A = S.analysis, f = A.filters[A.sub];
    if (!f) return;
    ['dateFrom', 'dateTo', 'projectName', 'autoFixType', 'targetLang'].forEach(function (k) { var el = $('an-' + k); if (el) f[k] = el.value; });
  }
  function runAnalysis(doExport) {
    readFilters();
    var A = S.analysis, key = A.sub, f = A.filters[key];
    A.busy = true; A.result[key] = { loading: true }; renderAnalysis();
    var p = key === 'mqm' ? call('apiHubMqm', f, !!doExport) : key === 'benchmark' ? call('apiHubBenchmark', f) : key === 'drift' ? call('apiHubDrift', f) : call('apiHubGlossary', f);
    p.then(function (r) { A.busy = false; A.result[key] = r; r._export = !!doExport; renderIf('analysis'); });
  }
  function sevCell(n, cls) { return n > 0 ? '<span class="' + cls + '">' + n + '</span>' : '<span class="muted">0</span>'; }
  function analysisResultHtml(key) {
    var r = S.analysis.result[key];
    if (!r) return '';
    if (r.loading) return '<div class="card">' + loader() + '<p class="hint" style="text-align:center">Gemini analysiert die Korrekturen …</p></div>';
    if (!r.success) return errBox(r.error);
    if (r.empty) return '<div class="card">' + empty(r.message || 'Keine Daten im gewählten Zeitraum.') + '</div>';
    if (key === 'mqm') {
      var total = r.totalSegments || 0, agg = r.aggregate || [], max = agg.length ? agg[0].total : 1;
      var html = '<div class="kpi-grid">' +
        [[r.totalLogs, 'Logs'], [total, 'Fehler gesamt'], [r.critical || 0, 'Critical', 'red'], [r.major || 0, 'Major'], [r.minor || 0, 'Minor', 'green']].map(function (k) {
          return '<div class="kpi ' + (k[2] || '') + '"><div class="kpi-val">' + k[0] + '</div><div class="kpi-label">' + k[1] + '</div></div>';
        }).join('') + '</div>';
      if (r._export && r.exportResult) html += r.exportResult.success ? '<div class="notice ok">' + '<div>Sheet erstellt: <b>' + h(r.exportResult.sheetName) + '</b> – <a href="' + h(r.exportResult.url) + '" target="_blank" rel="noopener">öffnen</a></div></div>' : errBox('Export-Fehler: ' + r.exportResult.error);
      html += '<div class="card black"><div class="section-title"><span>Fehlerverteilung</span></div><div class="table-wrap"><table class="history-table"><thead><tr><th>Kategorie</th><th>Unterkategorie</th><th>Critical</th><th>Major</th><th>Minor</th><th>Gesamt</th><th>%</th><th></th></tr></thead><tbody>' +
        agg.map(function (row) {
          return '<tr><td>' + badge('b-blue', row.category) + '</td><td>' + h(row.subcategory || '–') + '</td><td>' + sevCell(row.critical, 'sev-critical') + '</td><td>' + sevCell(row.major, 'sev-major') + '</td><td>' + sevCell(row.minor, 'sev-minor') + '</td><td><b>' + row.total + '</b></td><td>' + (total ? (row.total / total * 100).toFixed(1) : 0) + ' %</td><td><span class="bar" style="width:' + Math.round(row.total / max * 110) + 'px"></span></td></tr>';
        }).join('') + '</tbody></table></div></div>';
      var det = r.details || [];
      html += '<div class="card black"><div class="section-title"><span>Segmente (' + (r.detailsTotal || det.length) + ')</span></div>' +
        (r.detailsTruncated ? '<div class="notice info">' + '<div>Zeige 300 von ' + r.detailsTotal + '. Vollständige Liste im exportierten Sheet.</div></div>' : '') +
        '<div class="table-wrap" style="max-height:520px;overflow:auto"><table class="history-table"><thead><tr><th>' + t('date') + '</th><th>' + t('project') + '</th><th>' + t('language') + '</th><th>Source</th><th>Original → Korrigiert</th><th>Kategorie</th><th>Schwere</th></tr></thead><tbody>' +
        det.map(function (d) {
          return '<tr><td style="white-space:nowrap">' + h(fmtDate(d.timestamp, true)) + '</td><td>' + h(d.projectName) + '</td><td>' + badge('b-gray', d.targetLang) + '</td><td>' + h(d.source) + '</td><td>' + diffHtml(d.original, d.corrected) + '</td><td>' + badge('b-blue', d.mqmCategory) + '<div class="muted">' + h(d.mqmSubcategory || '') + '</div></td><td><span class="sev-' + h(d.mqmSeverity) + '">' + h(d.mqmSeverity) + '</span></td></tr>';
        }).join('') + '</tbody></table></div></div>';
      return html;
    }
    if (key === 'benchmark') {
      var pairs = r.pairs || [], maxRate = pairs.length ? pairs[0].errorRate || 1 : 1;
      return '<div class="card black"><div class="table-wrap"><table class="history-table"><thead><tr><th>' + t('language') + '</th><th>Fehlerquote</th><th>Fehler / Segmente / Jobs</th><th>Critical</th><th>Major</th><th>Minor</th><th>Häufigste Kategorie</th><th></th></tr></thead><tbody>' +
        pairs.map(function (p) {
          var cls = p.errorRate > 20 ? 'sev-critical' : p.errorRate > 10 ? 'sev-major' : 'sev-minor';
          return '<tr><td>' + badge('b-gray', p.targetLang) + '</td><td><span class="' + cls + '" style="font-size:16px">' + p.errorRate + ' %</span></td><td>' + p.totalErrors + ' / ' + p.totalSegs + ' / ' + p.totalJobs + '</td><td>' + sevCell(p.critical, 'sev-critical') + '</td><td>' + sevCell(p.major, 'sev-major') + '</td><td>' + sevCell(p.minor, 'sev-minor') + '</td><td>' + badge('b-blue', p.topCategory) + ' <span class="muted">×' + p.topCategoryCount + '</span></td><td><span class="bar" style="width:' + Math.round(p.errorRate / maxRate * 110) + 'px"></span></td></tr>';
        }).join('') + '</tbody></table></div></div>';
    }
    if (key === 'drift') {
      var terms = r.terms || [];
      if (!terms.length) return '<div class="card">' + empty('Kein signifikanter Terminologie-Drift gefunden.') + '</div>';
      return '<div class="card black"><p class="hint">' + terms.length + ' Begriffe mit wiederholten Korrekturen (aus ' + r.totalLogs + ' Logs). Kandidaten für die Termbase oder die Nomenklatur im Prompt Hub.</p><div class="table-wrap"><table class="history-table"><thead><tr><th>Source-Begriff</th><th>' + t('language') + '</th><th>MT (häufigste Form) → Empfehlung</th><th>Korrekturen</th><th>' + t('projects') + '</th><th>Zuletzt</th></tr></thead><tbody>' +
        terms.map(function (x) {
          var cls = x.driftScore >= 10 ? 'sev-critical' : x.driftScore >= 5 ? 'sev-major' : 'sev-minor';
          return '<tr><td class="mono">' + h(x.sourceTerm) + '</td><td>' + badge('b-gray', x.targetLang) + '</td><td>' + diffHtml(x.topOriginal, x.topCorrected) + '</td><td><span class="' + cls + '">' + x.driftScore + '×</span></td><td title="' + h((x.projects || []).join(', ')) + '">' + x.projectCount + '</td><td>' + h(fmtDate(x.lastSeen, true)) + '</td></tr>';
        }).join('') + '</tbody></table></div></div>';
    }
    var sug = r.suggestions || [];
    if (!sug.length) return '<div class="card">' + empty(r.message || 'Keine Vorschläge gefunden.') + '</div>';
    return '<div class="card black"><p class="hint">' + sug.length + ' Vorschläge für neue Termbase-Einträge. <b>Nur zur manuellen Übernahme in Phrase.</b></p><div class="table-wrap"><table class="history-table"><thead><tr><th>Source</th><th>' + t('language') + '</th><th>Empfohlener Begriff</th><th>Konfidenz</th><th>Begründung</th></tr></thead><tbody>' +
      sug.map(function (s) {
        var cls = s.confidence >= 80 ? 'b-green' : s.confidence >= 60 ? 'b-yellow' : 'b-gray';
        return '<tr><td class="mono"><b>' + h(s.sourceDe) + '</b></td><td>' + badge('b-gray', s.targetLang) + '</td><td class="mono"><b>' + h(s.targetTerm) + '</b></td><td>' + badge(cls, s.confidence + ' %') + '</td><td>' + h(s.rationale) + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
  }

  // ------------------------------------------------------------------
  // PROMPTS (nur lesen)
  // ------------------------------------------------------------------
  function renderPrompts(load) {
    if (load || !S.prompts) {
      if (!S.prompts) $('tab-prompts').innerHTML = loader();
      call('apiHubPrompts').then(function (r) { S.prompts = r; renderIf('prompts'); });
      if (!S.prompts) return;
    }
    var r = S.prompts;
    if (!r.success) { $('tab-prompts').innerHTML = errBox(r.error); return; }
    var e = r.effective, hub = r.promptHubUrl;
    var html = '<div class="notice info">' + '<div>' + t('prompt_readonly') +
      (hub ? ' <a href="' + h(hub) + '" target="_blank" rel="noopener"><b>' + t('open_prompt_hub') + '</b></a>' : (can('admin') ? ' Den Link zum Prompt Hub trägst du unter Admin → Konfiguration ein.' : '')) + '</div></div>' +
      '<div class="card black"><div class="section-title"><span>' + ' Gemini in einem echten Lauf</span></div><div class="kv"><b>Modell</b><span>' + h(e.model) + '</span><b>Temperature</b><span>' + h(e.temperature) + '</span><b>Max Tokens</b><span>' + h(e.maxTokens) + '</span><b>Batches</b><span>bis ' + e.singleBatchMax + ' Segmente in einem Batch, darüber je ' + e.batchSize + '</span></div>' +
      (e.ignoredOverrides.length ? '<div class="notice warn" style="margin-top:12px">' + '<div>Werte pro Space im Sheet (' + h(e.ignoredOverrides.join(', ')) + ') liest ein Lauf nicht – sie stammen aus dem alten Prompt Editor.</div></div>' : '') + '</div>' +
      '<div class="space-grid">';
    r.prompts.forEach(function (p) {
      html += '<div class="space-tile" style="cursor:default"><h3>' + h(p.label) + '</h3><div class="mono-sm">peInstructions_' + h(p.type) + '</div><div class="badges">' +
        (p.managedByPromptHub ? badge('b-green', 'Prompt Hub') : badge('b-yellow', 'Nicht im Prompt Hub')) + (p.builtIn ? badge('b-gray', 'eingebaut') : '') +
        (p.usesFallback ? badge('b-red', 'nutzt Fallback') : '') + badge('b-gray', p.chars.toLocaleString() + ' Zeichen') + '</div>' +
        '<details><summary class="muted" style="cursor:pointer">Prompt anzeigen</summary><pre class="prompt-view" style="max-height:360px">' + h(p.text) + '</pre></details>' +
        (hub ? '<a class="btn btn-sm btn-secondary" href="' + h(hub + '#' + p.type) + '" target="_blank" rel="noopener">' + t('edit_in_hub') + '</a>' : '') + '</div>';
    });
    $('tab-prompts').innerHTML = html + '</div>';
  }

  // ------------------------------------------------------------------
  // ADMIN
  // ------------------------------------------------------------------
  function renderAdmin() {
    if (!can('admin')) return;
    if (!S.admin) {
      $('tab-admin').innerHTML = loader();
      call('apiHubAdminState').then(function (r) { if (!r.success) { $('tab-admin').innerHTML = errBox(r.error); return; } S.admin = r; renderIf('admin'); });
      return;
    }
    var A = S.admin;
    $('tab-admin').innerHTML = '<div class="admin-grid">' + adminRequests(A) + adminAdmins(A) + adminSettings(A) + adminConfig(A) + adminMaintenance(A) + adminAudit(A) + '</div>';
  }
  function reloadAdmin(msg) {
    S.admin = null; if (msg) toast(msg);
    call('apiHubBootstrap').then(function (b) {
      if (b.success) { S.boot = b; $('adminCount').textContent = b.pendingRequests || ''; $('adminCount').classList.toggle('hidden', !b.pendingRequests); $('openModeBanner').classList.toggle('hidden', !b.openMode); }
      renderAdmin();
    });
  }
  function adminRequests(A) {
    var open = A.requests.filter(function (r) { return r.status === 'pending'; });
    var html = '<div class="card wide"><div class="section-title"><span>Offene Anträge auf Admin-Zugang (' + open.length + ')</span></div>';
    if (!open.length) return html + empty('Keine offenen Anträge.') + '</div>';
    return html + '<div class="table-wrap"><table class="history-table"><thead><tr><th>' + t('date') + '</th><th>Wer</th><th>' + t('reason') + '</th><th>Kommentar</th><th></th></tr></thead><tbody>' +
      open.map(function (r) {
        return '<tr><td>' + h(fmtDate(r.createdAt)) + '</td><td>' + h(r.email) + '</td><td>' + h(r.reason) + '</td><td><textarea id="rq-cm-' + h(r.id) + '" rows="2"></textarea></td>' +
          '<td style="white-space:nowrap"><button class="btn btn-sm btn-primary" onclick="App.decide(\'' + h(r.id) + '\',true)">' + t('approve') + '</button> <button class="btn btn-sm btn-red" onclick="App.decide(\'' + h(r.id) + '\',false)">' + t('reject') + '</button></td></tr>';
      }).join('') + '</tbody></table></div></div>';
  }
  function decide(id, approve) {
    call('apiHubAdminDecide', id, approve, $('rq-cm-' + id).value).then(function (r) { if (!r.success) return toast(r.error, true); reloadAdmin(approve ? 'Freigegeben – ist jetzt Admin' : 'Abgelehnt'); });
  }
  function adminAdmins(A) {
    return '<div class="card wide"><div class="section-title"><span>Admins</span><span class="sub">AutoFix Hub ist nur für Admins. Alle anderen arbeiten im Prompt Hub.</span></div>' +
      (A.openMode ? '<div class="notice warn">Noch kein Admin: Solange darf jeder alles. Trage den ersten Admin ein, danach ist AutoFix Hub geschützt.</div>' : '') +
      '<div class="table-wrap"><table class="history-table"><tbody>' +
      A.admins.map(function (a) { return '<tr><td><b>' + h(a) + '</b></td><td style="text-align:right"><button class="btn btn-sm btn-ghost" onclick="App.setAdmin(\'' + h(a) + '\',false)">' + t('remove') + '</button></td></tr>'; }).join('') +
      (A.admins.length ? '' : '<tr><td class="muted">Noch keine Admins.</td><td></td></tr>') +
      '</tbody></table></div><div class="add-row"><input id="newAdmin" placeholder="name@karcher.com" style="max-width:320px"><button class="btn btn-sm btn-secondary" onclick="App.setAdmin(document.getElementById(\'newAdmin\').value,true)">Admin hinzufügen</button></div></div>';
  }
  function setAdmin(email, make) {
    if (!make) {
      return confirmDialog('Admin entfernen', h(email) + ' verliert den Zugriff auf AutoFix Hub.', t('remove')).then(function (ok) {
        if (ok) call('apiHubAdminSetAdmin', email, false).then(function (r) { if (!r.success) return toast(r.error, true); reloadAdmin('Admins aktualisiert'); });
      });
    }
    call('apiHubAdminSetAdmin', email, true).then(function (r) { if (!r.success) return toast(r.error, true); reloadAdmin('Admins aktualisiert'); });
  }

  function adminSettings(A) {
    var s = A.settings, e = A.effective;
    return '<div class="card black"><div class="section-title"><span>' + ' AutoFix-Einstellungen</span></div>' +
      (A.settingsError ? errBox(A.settingsError) : '') +
      '<p class="hint">Gespeichert werden nur die geänderten Zeilen im Tab „Settings“. Prompts und andere Werte bleiben unberührt.</p>' +
      '<div class="mini-label muted" style="font-weight:800;text-transform:uppercase;margin-bottom:8px">Phrase &amp; Workflow</div>' +
      '<div class="form-grid"><div class="form-row"><label>Custom Field UID</label><input id="st-cfFieldUid" value="' + h(s.cfFieldUid) + '"></div>' +
      '<div class="form-row"><label>Workflow-Schritt</label><input id="st-wfStepName" value="' + h(s.wfStepName) + '"></div></div>' +
      '<div class="form-row"><label>Custom Field nach dem Fix zurücksetzen</label><select id="st-markDoneAfterFix"><option value="true"' + (s.markDoneAfterFix ? ' selected' : '') + '>Ja – auf leer setzen</option><option value="false"' + (!s.markDoneAfterFix ? ' selected' : '') + '>Nein</option></select></div>' +
      '<div class="mini-label muted" style="font-weight:800;text-transform:uppercase;margin:6px 0 8px">Gemini (wirksam in jedem Lauf)</div>' +
      '<div class="form-row"><label>Modell</label><select id="st-primaryModel">' + A.config.allowedModels.map(function (m) { return '<option' + (m === e.model ? ' selected' : '') + '>' + h(m) + '</option>'; }).join('') + '</select></div>' +
      '<div class="form-grid"><div class="form-row"><label>Temperature</label><input id="st-peTemperature" type="number" step="0.05" min="0.01" max="2" value="' + h(s.peTemperature) + '"></div>' +
      '<div class="form-row"><label>Max Output Tokens</label><input id="st-maxTokens" type="number" step="1024" min="1024" max="65536" value="' + h(s.maxTokens) + '"></div></div>' +
      '<div class="mini-label muted" style="font-weight:800;text-transform:uppercase;margin:6px 0 8px">Ohne Wirkung auf einen Lauf</div>' +
      '<div class="form-grid"><div class="form-row"><label>TM Threshold</label><input id="st-tmThreshold" type="number" step="0.05" min="0" max="1" value="' + h(s.tmThreshold) + '"></div>' +
      '<div class="form-row"><label>Poller-Intervall (Min.)</label><input id="st-pollerIntervalMinutes" type="number" min="1" max="60" value="' + h(s.pollerIntervalMinutes) + '"></div></div>' +
      '<p class="hint">Diese beiden Werte liest der aktuelle Code nicht. Den Poller-Takt legst du beim Starten im Dashboard fest.</p>' +
      '<button class="btn btn-primary" onclick="App.saveSettings()">' + t('save') + '</button></div>';
  }
  function saveSettings() {
    var patch = {};
    ['cfFieldUid', 'wfStepName', 'markDoneAfterFix', 'primaryModel', 'peTemperature', 'maxTokens', 'tmThreshold', 'pollerIntervalMinutes'].forEach(function (k) {
      var v = $('st-' + k).value, cur = S.admin.settings[k];
      if (k === 'primaryModel') cur = S.admin.effective.model;
      if (String(v) !== String(cur === undefined ? '' : cur)) patch[k] = v;
    });
    if (!Object.keys(patch).length) return toast('Keine Änderungen.');
    call('apiHubAdminSaveSettings', patch).then(function (r) { if (!r.success) return toast(r.error, true); S.prompts = null; reloadAdmin(r.saved.length + ' Wert(e) gespeichert'); });
  }
  function adminConfig(A) {
    var c = A.config;
    return '<div class="card black"><div class="section-title"><span>' + ' Konfiguration</span></div>' +
      '<div class="form-row"><label>Link zum Prompt Hub</label><input id="cf-promptHubUrl" value="' + h(c.promptHubUrl) + '" placeholder="https://script.google.com/a/macros/karcher.com/s/…/exec"></div>' +
      '<div class="form-row"><label>Freigegebene Gemini-Modelle (je Zeile)</label><textarea id="cf-allowedModels" rows="4" class="mono">' + h(c.allowedModels.join('\n')) + '</textarea></div>' +
      '<div class="form-row"><label>E-Mails für neue Anträge (leer = alle Admins)</label><input id="cf-notifyEmails" value="' + h(c.notifyEmails.join(', ')) + '"></div>' +
      '<div class="form-row"><label>Google-Chat-Webhook für neue Anträge</label><input id="cf-chatWebhookUrl" value="' + h(c.chatWebhookUrl) + '" placeholder="https://chat.googleapis.com/v1/spaces/…"></div>' +
      '<button class="btn btn-primary" onclick="App.saveConfig()">' + t('save') + '</button></div>';
  }
  function saveConfig() {
    call('apiHubAdminSaveConfig', { promptHubUrl: $('cf-promptHubUrl').value, allowedModels: $('cf-allowedModels').value.split('\n'), notifyEmails: $('cf-notifyEmails').value, chatWebhookUrl: $('cf-chatWebhookUrl').value })
      .then(function (r) { if (!r.success) return toast(r.error, true); S.boot.promptHubUrl = r.config.promptHubUrl; S.prompts = null; reloadAdmin('Konfiguration gespeichert'); });
  }
  function adminMaintenance(A) {
    return '<div class="card red"><div class="section-title"><span>' + ' Wartung</span></div>' +
      '<div class="kv" style="margin-bottom:14px"><b>Run-Sperre</b><span>' + (A.running ? badge('b-yellow', 'gesetzt') : badge('b-green', 'frei')) + '</span></div>' +
      '<div class="btn-row"><button class="btn btn-sm btn-secondary" onclick="App.forceUnlock()">' + 'Run-Sperre lösen</button>' +
      '<button class="btn btn-sm btn-secondary" onclick="App.clearCache()">' + 'Projekt-Cache leeren</button>' +
      '<button class="btn btn-sm btn-secondary" onclick="App.debugProjects()">' + 'Projektsuche testen</button>' +
      '<button class="btn btn-sm btn-secondary" onclick="App.openSheet()">' + t('open_sheet') + '</button>' +
      '<button class="btn btn-sm btn-secondary" onclick="App.exportToPromptHub()">' + 'An Prompt Hub übergeben</button></div>' +
      '<p class="hint" style="margin-top:10px">„An Prompt Hub übergeben“ schreibt Spaces, Nutzer und Admins des alten Prompt Editors in den Tab „Prompt Hub Import“. Der Prompt Hub übernimmt sie daraus.</p><div id="mtResult" style="margin-top:12px"></div></div>';
  }
  function forceUnlock() {
    confirmDialog('Run-Sperre lösen', 'Nur lösen, wenn sicher kein Lauf mehr aktiv ist. Sonst können zwei Läufe dieselben Jobs bearbeiten.', 'Lösen').then(function (ok) {
      if (ok) call('apiHubAdminForceUnlock').then(function (r) { if (!r.success) return toast(r.error, true); reloadAdmin('Run-Sperre gelöst'); });
    });
  }
  function exportToPromptHub() {
    call('apiHubAdminExportToPromptHub').then(function (r) {
      if (!r.success) return toast(r.error, true);
      toast('Übergeben: ' + r.types + ' Space(s), ' + r.users + ' Nutzer, ' + r.admins + ' Admin(s). Jetzt im Prompt Hub unter Admin → Spaces übernehmen.');
    });
  }
  function clearCache() { call('apiHubAdminClearCache').then(function (r) { toast(r.success ? 'Cache geleert' : r.error, !r.success); }); }
  function debugProjects() {
    $('mtResult').innerHTML = '<span class="spin-sm"></span>';
    call('apiHubDebugProjects').then(function (r) { $('mtResult').innerHTML = r.success ? '<pre class="prompt-view">' + h(r.resultText) + '</pre>' : errBox(r.error); });
  }
  function adminAudit(A) {
    return '<div class="card black wide"><div class="section-title"><span>' + ' Audit-Log</span></div><div class="table-wrap" style="max-height:420px;overflow:auto"><table class="history-table"><thead><tr><th>Zeit</th><th>Aktion</th><th>Details</th></tr></thead><tbody>' +
      A.audit.map(function (a) { return '<tr><td style="white-space:nowrap">' + h(fmtDate(a.timestamp)) + '</td><td>' + h(a.action) + '</td><td>' + h(a.details) + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
  }

  // ------------------------------------------------------------------
  // KEIN ZUGRIFF / HILFE
  // ------------------------------------------------------------------
  function renderDenied() {
    var b = S.boot;
    $('tab-denied').classList.add('active');
    $('tab-denied').innerHTML = '<div class="denied"><div class="eyebrow">AutoFix Hub</div><h1>' + t('denied_title') + '</h1><p class="page-sub" style="font-size:15px">' + t('denied_text') + '</p>' +
      (b.promptHubUrl ? '<div class="btn-row" style="margin-top:16px"><a class="btn btn-primary" href="' + h(b.promptHubUrl) + '" target="_blank" rel="noopener">' + t('open_prompt_hub') + '</a></div>' : '') + '</div>' +
      '<div class="admin-grid" style="max-width:1100px;margin:24px auto 0"><div class="card"><div class="section-title"><span>' + t('request_access') + '</span></div>' +
      '<p class="hint">Nur nötig, wenn du AutoFix selbst betreust: Läufe, Poller, Run Log, Einstellungen.</p>' +
      '<div class="form-row"><label>' + t('reason') + ' <span style="color:var(--red)">*</span></label><textarea id="rqReason" rows="3"></textarea></div>' +
      '<button class="btn btn-secondary" onclick="App.requestAccess()">' + t('send') + '</button></div>' +
      '<div class="card"><div class="section-title"><span>' + t('my_requests') + '</span></div>' +
      ((b.myRequests || []).length ? '<div class="table-wrap"><table class="history-table"><tbody>' + b.myRequests.map(function (r) {
        return '<tr><td>' + h(fmtDate(r.createdAt)) + '</td><td>' + badge(r.status === 'approved' ? 'b-green' : r.status === 'rejected' ? 'b-red' : 'b-yellow', t(r.status)) + '</td><td>' + h(r.comment || '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' : empty('Noch keine Anträge.')) + '</div></div>';
  }
  function requestAccess() {
    call('apiHubRequestAccess', $('rqReason').value).then(function (r) {
      if (!r.success) return toast(r.error, true);
      toast('Antrag gesendet. Du bekommst eine E-Mail, sobald er entschieden ist.');
      S.boot.myRequests = r.myRequests; renderDenied();
    });
  }
  function renderHelp() {
    var faq = [
      ['Was macht AutoFix?', 'AutoFix sucht in Phrase Projekte mit gesetztem AutoFix-Custom-Field und Jobs im Workflow-Schritt „PE Gemini“. Gemini post-editiert die maschinelle Übersetzung mit dem Prompt des jeweiligen Dokumenttyps. Die Korrekturen landen direkt im Job, jede Änderung steht im Run Log.'],
      ['Wo ändere ich die Prompts?', 'Im Prompt Hub. Dort sind die Prompts strukturiert, werden vor dem Veröffentlichen geprüft, lassen sich live testen und sind versioniert. Der Reiter „Prompts“ hier zeigt, was AutoFix gerade verwendet.'],
      ['Was ist der Unterschied zwischen Poller und „AutoFix jetzt starten“?', 'Der Poller läuft im Hintergrund alle 5, 10 oder 30 Minuten. „Jetzt starten“ löst sofort einen Lauf aus und zeigt den Fortschritt im Live-Run. Beide nutzen dieselbe Logik und dieselbe Run-Sperre, es läuft nie mehr als ein Lauf gleichzeitig.'],
      ['Was bedeutet Re-Push?', 'Die gespeicherten Änderungen eines Laufs werden erneut in einen Job geschrieben, zum Beispiel nach einem erneuten Import. Der Abgleich läuft über den Source-Text, Gemini wird nicht erneut aufgerufen.'],
      ['Wer hat Zugriff auf AutoFix Hub?', 'Nur Admins. AutoFix Hub ist das Werkzeug zum Betreuen von AutoFix: Läufe, Poller, Run Log, Analysen, Einstellungen und Wartung. Prompts, Styleguides und Kontext-Dateien pflegen alle im Prompt Hub. Wer Admin werden möchte, stellt den Antrag direkt in der App.'],
      ['Warum sind TM Threshold und Poller-Intervall „ohne Wirkung“?', 'Der aktuelle AutoFix-Code liest diese beiden Werte nicht. Den Poller-Takt bestimmst du beim Starten; TM-Treffer werden derzeit nicht an Gemini übergeben.']
    ];
    var v = S.boot.version || {};
    $('tab-help').innerHTML = '<div class="page-head"><div><div class="eyebrow">' + t('tab_help') + '</div><h1 class="page-title">Fragen und Antworten</h1></div></div>' +
      faq.map(function (f) { return '<details class="faq-item"><summary>' + f[0] + '</summary><div class="faq-answer">' + f[1] + '</div></details>'; }).join('') +
      '<div class="version-line">AutoFix Hub ' + h(v.version || 'dev') + (v.commit ? ' · ' + h(String(v.commit).substring(0, 7)) : '') + (v.builtAt ? ' · ' + h(fmtDate(v.builtAt)) : '') + '</div>';
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    setLang: setLang, toggleTheme: toggleTheme, showTab: showTab, closeDialog: closeDialog,
    pollerStart: pollerStart, pollerStop: pollerStop, testConnection: testConnection, openSheet: openSheet,
    runManual: runManual, lrClear: lrClear, reloadQueue: reloadQueue,
    reloadLogs: reloadLogs, setLogFilter: setLogFilter, toggleDiff: toggleDiff, openReplay: openReplay,
    setSub: setSub, runAnalysis: runAnalysis,
    decide: decide, setAdmin: setAdmin,
    saveSettings: saveSettings, saveConfig: saveConfig, forceUnlock: forceUnlock, clearCache: clearCache, exportToPromptHub: exportToPromptHub, debugProjects: debugProjects,
    requestAccess: requestAccess, _state: S
  };
})();
