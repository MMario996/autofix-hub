# AutoFix Hub

Automatisches Post-Editing mit Gemini für Phrase (Google Apps Script).
AutoFix findet Projekte mit gesetztem AutoFix-Custom-Field, post-editiert die Jobs im Workflow-Schritt „PE Gemini“ mit dem Prompt des jeweiligen Dokumenttyps und schreibt die Korrekturen zurück nach Phrase.
**AutoFix Hub ist das Werkzeug der Admins.** Prompts, Styleguides und Kontext-Dateien pflegen alle im [Prompt Hub](https://github.com/MMario996/Prompt-hub).
Oberfläche und Bedienung entsprechen Prompt Hub, Terminologie-Hub und Kärcher Translation Services; die App ist in Google Sites eingebettet (kein Logo, keine Icons).

![Dashboard](docs/mockups/01-dashboard.png)

## Oberfläche

| Bereich | Inhalt |
|---|---|
| **Dashboard** | Poller-Status (starten 5/10/30 Min., stoppen), Laufstatus, Kennzahlen der letzten 7 Tage, letzte Läufe, Schnellaktionen |
| **Live-Run** | Lauf starten, Fortschritt live (Projekte, Jobs, geänderte Segmente, Fehler), Konsole |
| **Warteschlange** | Projekte mit AutoFix-Flag und Jobs im Schritt „PE Gemini“ |
| **Run Log** | Suche und Filter, Korrekturen als Wort-Diff, Fehlermeldungen, Re-Push nach Phrase |
| **Analysen** | MQM-Report (mit Sheet-Export), Benchmark je Sprache, Term-Drift, Glossar-Vorschläge |
| **Prompts** | Was AutoFix je Dokumenttyp gerade verwendet, Herkunft (Prompt Hub / Fallback), wirksame Gemini-Werte, Link zum Bearbeiten im Prompt Hub |
| **Admin** | Anträge auf Admin-Zugang, Admins, AutoFix-Einstellungen, Konfiguration, Wartung (Run-Sperre, Cache, Projektsuche), Audit-Log |
| **Hilfe** | FAQ, ausgelieferte Version |

Dazu: Deutsch/Englisch, Dark Mode, mobil nutzbar.

## Zugriff: nur Admins

- Zugriff hat nur, wer in der Script Property `AUTOFIX_HUB_ACCESS` als Admin steht. Die früheren Rollen „Ansehen“ und „Ausführen“ gelten nicht mehr; alte Einträge bleiben gespeichert, werden aber ignoriert.
- Wer keinen Zugriff hat, sieht einen Hinweis mit Link zum Prompt Hub und kann Admin-Zugang beantragen (Benachrichtigung per E-Mail oder Google Chat). Die Freigabe macht den Antragsteller zum Admin.
- Admins werden beim ersten Start aus dem alten Prompt Editor (`PROMPT_EDITOR_ADMINS`) übernommen. Gibt es dort keine, einmal `bootstrapAutoFixAdmin()` im Editor ausführen oder in der App den ersten Admin eintragen.
- **Offener Modus:** Solange kein Admin existiert, darf jeder in der Domain alles, wie bisher. Die App zeigt dann einen Hinweis.
- Der Schutz gilt auch, wenn jemand die bestehenden Funktionen direkt aufruft, zum Beispiel über `google.script.run`. Geschützt sind `runNow`, `runAutoFixForProject`, `replayChangesForJob`, `setupAutoFixTrigger`, `removeAutoFixTrigger`, `forceUnlock` und `recreateDatabase`.
- Zeitgesteuerte Läufe (`autoFixPoller`) sind nicht betroffen.

## Aufbau

| Pfad | Inhalt |
|---|---|
| `Code.gs`, `Database.gs`, `Settings.gs` | AutoFix-Logik (Läufe, Run Log, Einstellungen); nur um die Rollenprüfung ergänzt |
| `PromptEditorAccess.gs`, `PromptEditor.html` | alter Prompt Editor (`?page=prompts`); liest zusätzlich die Spaces aus dem Prompt Hub |
| `HubAccess.gs` | Zugriff (nur Admins), Anträge, Konfiguration der Oberfläche |
| `HubApi.gs` | alle Funktionen, die die Oberfläche aufruft, jede mit Prüfung |
| `HubVersion.gs` | Versionsanzeige unter „Hilfe“; die Pipeline stempelt Tag und Commit beim Deploy |
| `ui/` | Quelle der Oberfläche (`shell.html`, `base.css` = gemeinsames Design mit dem Prompt Hub, `app.css`, `i18n.js`, `app.js`) |
| `Index.html` | **generiert** aus `ui/` mit `npm run build`, nicht von Hand ändern |
| `tools/` | Index-Generator, Vorschau mit Beispieldaten, Mockups, Kodierungs- und Design-Wächter, Versionsstempel |

**Einstellungen speichern:** Die neue Oberfläche schreibt nur die geänderten Zeilen im Tab „Settings“.
Die alte Oberfläche rief `saveAutoFixSettings()` mit 7 Werten auf. Das leert den Tab und löscht dabei alle Prompts (`peInstructions_*`) und sonstigen Werte.

**Ohne Wirkung:** `tmThreshold` und `pollerIntervalMinutes` liest der aktuelle Code nicht.
Den Poller-Takt legt der Start-Knopf fest. Die Oberfläche kennzeichnet beide Werte entsprechend.

## Entwicklung

```bash
npm ci
npm run build       # Index.html aus ui/ erzeugen
npm test            # nur Admins, Schutz, Settings, Anträge, Konsistenz
npm run check       # Index.html aktuell, Zeichenkodierung, Design
npm run test:ui     # Browser-Tests der echten Oberfläche
npm run lint
npm run preview     # preview/admin.html: klickbare Vorschau mit Beispieldaten
npm run mockups     # docs/mockups/*.png
```

## CI/CD

Gleiche Pipeline wie im Prompt Hub, ausführlich in [docs/CI-CD.md](docs/CI-CD.md).

| Workflow | Wann | Was |
|---|---|---|
| `ci.yml` | jeder PR, nachts, vor jedem Deploy | Lint, `Index.html` aktuell, Zeichenkodierung (keine neuen kaputten Umlaute), Design-Wächter, Logik-Tests (Node 20/22), Browser-Tests, Mockups und klickbare Vorschau als Artefakt, gitleaks + npm audit, Design-Abgleich mit dem Prompt Hub, Zusammenfassung |
| `deploy.yml` | Push auf `main` → **Staging**; Tag `v*.*.*` → **Produktion** (nach Freigabe) | CI komplett, Version stempeln, `clasp push` + `clasp deploy`, Gegenprobe, bei Tags GitHub-Release |
| Dependabot | wöchentlich | npm und GitHub Actions |

**Secrets:** `CLASPRC_JSON`, `STAGING_SCRIPT_ID`, `STAGING_DEPLOYMENT_ID`, `PROD_SCRIPT_ID`, `PROD_DEPLOYMENT_ID`, `PROMPT_HUB_REPO_TOKEN` (Lesezugriff auf `MMario996/Prompt-hub`). Fehlen sie, wird übersprungen.

**Bekannte Altlast:** In `Code.gs`, `Settings.gs`, `Database.gs`, `PromptEditorAccess.gs` und `PromptEditor.html` sind durch einen früheren Rück-Sync an 285 Stellen Umlaute durch `?` ersetzt, auch im Prompt-Rahmen für Gemini. Der Kodierungs-Wächter lässt keine neuen zu; Details in [docs/CI-CD.md](docs/CI-CD.md).

`clasp` lädt alle `.gs`/`.html`-Dateien außer `Doget patch.gs`. Das ist eine Kopiervorlage mit einem zweiten `doGet()` und gehört nicht ins Projekt.

## Mockups

| | |
|---|---|
| ![Dashboard](docs/mockups/01-dashboard.png) Dashboard | ![Live-Run](docs/mockups/02-live-run.png) Live-Run |
| ![Warteschlange](docs/mockups/03-warteschlange.png) Warteschlange | ![Run Log](docs/mockups/04-run-log.png) Run Log mit Diff |
| ![Re-Push](docs/mockups/05-re-push.png) Re-Push | ![MQM](docs/mockups/06-analysen-mqm.png) MQM-Report |
| ![Term-Drift](docs/mockups/07-analysen-drift.png) Term-Drift | ![Prompts](docs/mockups/08-prompts.png) Prompts |
| ![Admin](docs/mockups/09-admin.png) Admin | ![Kein Zugriff](docs/mockups/10-kein-zugriff.png) Kein Zugriff (Hinweis auf den Prompt Hub) |
| ![Dark Mode](docs/mockups/11-dark-mode.png) Dark Mode | ![Mobil](docs/mockups/12-mobil.png) Mobil |
