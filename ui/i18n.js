// Oberflaechentexte DE/EN (gleiches Muster wie im Prompt Hub). Fehlende EN-Texte fallen auf DE zurueck.
var I18N = {
  brand_sub: ['Automatisches Post-Editing mit Gemini für Phrase', 'Automatic post-editing with Gemini for Phrase'],
  tab_dashboard: ['Dashboard', 'Dashboard'], tab_liverun: ['Live-Run', 'Live run'], tab_queue: ['Warteschlange', 'Queue'],
  tab_runlog: ['Run Log', 'Run log'], tab_analysis: ['Analysen', 'Analytics'], tab_prompts: ['Prompts', 'Prompts'],
  tab_admin: ['Admin', 'Admin'], tab_help: ['Hilfe', 'Help'],
  role_admin: ['Admin', 'Admin'], role_operator: ['Ausführen', 'Operator'], role_viewer: ['Ansehen', 'Viewer'],
  poller: ['Hintergrund-Poller', 'Background poller'], active: ['Aktiv', 'Active'], inactive: ['Inaktiv', 'Inactive'],
  run_state: ['Laufstatus', 'Run state'], running: ['Läuft', 'Running'], ready: ['Bereit', 'Ready'],
  jobs_7d: ['Jobs (7 Tage)', 'Jobs (7 days)'], changed_7d: ['Segmente geändert (7 Tage)', 'Segments changed (7 days)'], errors_7d: ['Fehler (7 Tage)', 'Errors (7 days)'],
  recent_runs: ['Letzte Läufe', 'Recent runs'], quick_actions: ['Schnellaktionen', 'Quick actions'],
  run_now: ['AutoFix jetzt starten', 'Run AutoFix now'], test_connection: ['Verbindung testen', 'Test connection'],
  open_sheet: ['Datenbank-Sheet', 'Database sheet'], open_prompt_hub: ['Prompt Hub öffnen', 'Open Prompt Hub'],
  start_every: ['Start alle', 'Start every'], stop: ['Stoppen', 'Stop'], clear: ['Leeren', 'Clear'], refresh: ['Aktualisieren', 'Refresh'],
  projects: ['Projekte', 'Projects'], jobs: ['Jobs', 'Jobs'], segs_changed: ['Segmente geändert', 'Segments changed'], errors: ['Fehler', 'Errors'],
  project: ['Projekt', 'Project'], type: ['Typ', 'Type'], language: ['Sprache', 'Language'], status: ['Status', 'Status'], date: ['Datum', 'Date'],
  changes: ['Änderungen', 'Changes'], info: ['Info', 'Info'], repush: ['Re-Push', 'Re-push'],
  search: ['Suchen …', 'Search …'], all: ['Alle', 'All'],
  mqm: ['MQM-Report', 'MQM report'], benchmark: ['Benchmark', 'Benchmark'], drift: ['Term-Drift', 'Term drift'], glossary: ['Glossar-Vorschläge', 'Glossary suggestions'],
  date_from: ['Von', 'From'], date_to: ['Bis', 'To'], generate: ['Erzeugen', 'Generate'], export_sheet: ['Erzeugen & ins Sheet exportieren', 'Generate & export to sheet'],
  prompt_readonly: ['Prompts werden im Prompt Hub gepflegt: strukturiert, geprüft, versioniert und live getestet. Hier siehst du, was AutoFix gerade verwendet.', 'Prompts are maintained in Prompt Hub. This shows what AutoFix currently uses.'],
  edit_in_hub: ['Im Prompt Hub bearbeiten', 'Edit in Prompt Hub'],
  cancel: ['Abbrechen', 'Cancel'], confirm: ['Bestätigen', 'Confirm'], close: ['Schließen', 'Close'], save: ['Speichern', 'Save'], send: ['Absenden', 'Submit'],
  approve: ['Freigeben', 'Approve'], reject: ['Ablehnen', 'Reject'], pending: ['Offen', 'Pending'], approved: ['Freigegeben', 'Approved'], rejected: ['Abgelehnt', 'Rejected'],
  denied_title: ['Kein Zugriff', 'Access denied'],
  denied_text: ['Du bist für AutoFix Hub noch nicht freigeschaltet. Beantrage hier den Zugriff, ein Admin gibt ihn frei.', 'You are not yet authorized for AutoFix Hub. Request access below; an admin will approve it.'],
  reason: ['Begründung', 'Reason'], my_requests: ['Meine Anträge', 'My requests'], request_access: ['Zugriff beantragen', 'Request access']
};
var LANG = 'de';
function t(key) {
  var e = I18N[key];
  if (!e) return key;
  return (LANG === 'en' && e[1]) ? e[1] : e[0];
}
function applyI18n(root) {
  (root || document).querySelectorAll('[data-i18n]').forEach(function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
}
