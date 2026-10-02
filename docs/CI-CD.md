# CI/CD

Jede Änderung wird automatisch geprüft. Was auf `main` landet, geht nach **Staging**.
Ein Versions-Tag (`v1.2.3`) geht nach **Produktion**, aber erst nach Freigabe.
AutoFix Hub und Prompt Hub nutzen dieselbe Pipeline.

```
Pull Request ─────────► CI ─────────────────────────────────────┐
nachts (04:23 UTC) ───► CI                                       │  1 Lint & Qualität
push auf main ────────► CI ──► Deploy Staging                    │  2 Logik-Tests (Node 20/22)
Tag v1.2.3 ───────────► CI ──► Freigabe ──► Deploy Produktion    │  3 Oberfläche (Chromium)
manuell (Actions) ────► CI ──► Staging oder Produktion           │  4 Mockups & Vorschau
                                                                 │  5 Sicherheit
                                                                 │  6 Abgleich mit Prompt Hub
                                                                 ┘  7 Zusammenfassung
```

| Workflow | Datei | Auslöser |
|---|---|---|
| CI | `.github/workflows/ci.yml` | Pull Requests, nachts, manuell, von CD aufgerufen |
| CD | `.github/workflows/deploy.yml` | Push auf `main`, Tags `v*.*.*`, manuell (Ziel wählbar) |
| Deploy-Aktion | `.github/actions/clasp-deploy/` | von CD genutzt: Version stempeln, `clasp push`, Bereitstellung, Gegenprobe |
| Dependabot | `.github/dependabot.yml` | wöchentliche Updates für npm und Actions |

## Was CI prüft

| Job | Befehl | Prüft |
|---|---|---|
| Lint & Qualität | `npm run lint`, `npm run check` | ESLint. `Index.html` ist aus `ui/` erzeugt und aktuell. **Zeichenkodierung:** keine neuen kaputten Umlaute (Umlaut durch `?` ersetzt, Mojibake aus falsch dekodiertem UTF-8), bekannte Altlasten stehen in `tools/encoding-baseline.json` und dürfen nur weniger werden. **Design:** keine Icon-Schriften, Logos, Bilder, Emojis oder externen Skripte; die gemeinsamen Design-Tokens sind vorhanden. |
| Logik-Tests | `npm test` | **Nur Admins:** frühere Rollen und Fremde kommen weder über die Oberfläche noch über direkte Aufrufe (`runNow`, `replayChangesForJob`, `setupAutoFixTrigger`, `forceUnlock`, `recreateDatabase`) an AutoFix. Antrag auf Admin-Zugang und Freigabe. Settings werden zeilengenau geschrieben (Prompts bleiben erhalten). Wirksame Gemini-Werte, Dashboard-Kennzahlen, Übergabe an den Prompt Hub. Konsistenz Oberfläche und Server. |
| Oberfläche | `npm run test:ui` | Echte Seite in Chromium mit Beispieldaten: keine Icons und keine Anfragen an fremde Server, Lauf starten, Run Log mit Diff und Re-Push, Analysen, Prompts nur lesen, Admin (Antrag freigeben, Einstellung speichern), kein Zugriff mit Hinweis auf den Prompt Hub, offener Modus, Sprache, Dark Mode, Mobil 390 px. |
| Mockups & Vorschau | `npm run mockups` | Alle Mockups aus `docs/mockups/` neu, dazu klickbare Vorschau-Seiten (Admin, kein Zugriff, offener Modus). Beides als Artefakt am Lauf, damit jede UI-Änderung im PR sichtbar ist. |
| Sicherheit | gitleaks, `npm audit` | Keine Secrets im Repo, keine bekannten Lücken (ab „high“). |
| Abgleich mit Prompt Hub | `tools/check-design.js --other=…` | Ist `ui/base.css` identisch mit dem Basis-Design des Prompt Hub (`src/Styles.html`)? Braucht `PROMPT_HUB_REPO_TOKEN`, sonst Hinweis statt Fehler. |
| Zusammenfassung | | Tabelle aller Ergebnisse im Job-Summary. Rot, sobald ein Job fehlschlägt. |

Lokal, vor jedem Push:

```bash
npm ci
npm run ci          # Lint + Qualität + Logik-Tests
npm run test:ui     # Browser-Tests (einmalig: npx playwright install chromium)
npm run preview     # preview/admin.html mit Beispieldaten im Browser öffnen
npm run mockups     # docs/mockups/*.png neu erzeugen
```

## Was CD macht

1. Komplette CI.
2. **Version stempeln:** `tools/stamp-version.js` schreibt Tag (oder `staging`), Commit und Zeit in `HubVersion.gs`. Die App zeigt das unter **Hilfe**.
3. `clasp push` in das Apps-Script-Projekt der Umgebung.
4. Web-App-Bereitstellung auf die neue Version umstellen (wenn eine Deployment-ID gesetzt ist).
5. **Gegenprobe:** Zeigt die Bereitstellung wirklich auf die neue Version? Sonst schlägt der Job fehl.
6. Bei Tags: GitHub-Release mit automatischen Release-Notes.
7. Ergebnis im Job-Summary.

Fehlen die Secrets einer Umgebung, wird der Deploy mit einem Hinweis übersprungen statt fehlzuschlagen.

## Einrichtung (einmalig)

1. **Apps Script API einschalten** für das Deploy-Konto: <https://script.google.com/home/usersettings> → „Google Apps Script API“ an. Am besten ein Funktions- oder Team-Konto mit Bearbeitungsrechten am Projekt.
2. **clasp-Anmeldung erzeugen** (lokal):
   ```bash
   npx @google/clasp@2.4.2 login
   cat ~/.clasprc.json      # Inhalt kommt in das Secret CLASPRC_JSON
   ```
3. **Umgebungen anlegen:** GitHub → Settings → Environments → `staging` und `production`. Bei `production` unter „Required reviewers“ die Personen eintragen, die Releases freigeben. Unter „Deployment branches and tags“ `main` und Tags `v*.*.*` erlauben.
4. **Secrets:**

   | Secret | Wo | Inhalt |
   |---|---|---|
   | `CLASPRC_JSON` | Repository oder je Umgebung | Inhalt von `~/.clasprc.json` |
   | `STAGING_SCRIPT_ID`, `STAGING_DEPLOYMENT_ID` | Repository oder `staging` | Script-ID und Web-App-Bereitstellung für Staging |
   | `PROD_SCRIPT_ID`, `PROD_DEPLOYMENT_ID` | Repository oder `production` | dasselbe für Produktion |
   | `PROMPT_HUB_REPO_TOKEN` | Repository | Fine-grained Token, nur Lesezugriff auf `MMario996/Prompt-hub` (Design-Abgleich) |

   Staging ist am besten ein **eigenes Apps-Script-Projekt** mit eigener Datenbank (Script Property `AUTOFIX_DB_SHEET_ID`) und ohne aktiven Poller, damit Staging nie echte Phrase-Jobs bearbeitet. Apps Script erlaubt höchstens 200 Versionen pro Projekt; für Staging reicht deshalb oft keine Deployment-ID (dann zeigt die Test-URL `/dev` den neuen Stand).
5. **Branch-Schutz für `main`** (Settings → Branches): Pull Request erforderlich, Status-Check „Zusammenfassung“ muss grün sein.

## Release und Zurückrollen

```bash
git checkout main && git pull
npm version minor            # setzt package.json und legt den Tag v1.x.0 an
git push origin main --follow-tags
```

Danach läuft CI, anschließend wartet „Deploy Produktion“ auf die Freigabe.

Zurückrollen geht auf zwei Wegen:

- im Apps-Script-Editor unter „Bereitstellungen verwalten“ die vorige Version wählen, oder
- Actions → CD → „Run workflow“ → als Ref den vorigen Tag, Ziel `production`.

## Wichtig: Code-Quelle ist GitHub

`clasp push` ersetzt den Code im Apps-Script-Projekt vollständig (außer `Doget patch.gs`, siehe `.claspignore`). Änderungen direkt im Apps-Script-Editor gehen beim nächsten Deploy verloren.

Ein Rück-Sync aus dem Editor hat in den Alt-Dateien (`Code.gs`, `Settings.gs`, `Database.gs`, `PromptEditorAccess.gs`, `PromptEditor.html`) an 285 Stellen Umlaute durch `?` ersetzt, darunter im Prompt-Rahmen, den Gemini bei jedem Lauf bekommt (die Firmenbezeichnung „Alfred Kärcher“ steht dort mit Fragezeichen statt „ä“). Diese Stellen stehen als Altlast in `tools/encoding-baseline.json`. Der Wächter verhindert, dass neue dazukommen. Werden sie bereinigt, mit `node tools/check-encoding.js --update` die Baseline senken. Achtung: Eine Bereinigung im Prompt-Rahmen ändert, was Gemini sieht, und muss im Prompt Hub mit `node tools/check-mirror.js --autofix=../autofix-hub --write` nachgezogen werden.
