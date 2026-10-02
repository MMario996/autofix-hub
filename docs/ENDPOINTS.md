# Schnittstellen: AutoFix Hub

> Alle Endpunkte, die diese Anwendung aufruft oder anbietet, aus dem Code abgeleitet (Stand 2026-10-02).
> Gesamtübersicht aller Anwendungen: [`ENDPOINTS-GESAMT.md`](https://github.com/MMario996/kaerchertranslationservices/blob/main/docs/gesamt/ENDPOINTS-GESAMT.md) (Ordner `docs/gesamt/` im Repository kaerchertranslationservices).

## 1. Phrase TMS (REST)

| | |
|---|---|
| Basis | `https://cloud.memsource.com/web/api2/<version>` |
| Token | PHRASE_API_TOKEN (Bearer) |
| Aufruf-Helfer | `phraseFetch_` in `src/Code.gs` (GET, wenn keine Optionen) |

| Methode | Version | Pfad | Zweck | Datei (`src/`) |
|---|---|---|---|---|
| GET | v1 | `/auth/whoAmI` | Verbindungstest | Code.gs |
| GET | v1 | `/projects?pageSize=50&statuses=ASSIGNED&statuses=NEW&sort=DATE_CREATED&order=DESC` | Kandidaten für den Poller (15 min Cache) | Code.gs |
| GET | v1 | `/projects?pageSize=5&sort=DATE_CREATED&order=DESC` | Diagnose (letzte Projekte) | Code.gs |
| GET | v1 | `/projects/{projectUid}` | Projekt, Workflow-Schritte (Level von „PE Gemini“) | Code.gs |
| GET | v1 | `/projects/{projectUid}/customFields` | Custom Field „AutoFix“ lesen (Option → Prompt Space) | Code.gs |
| PUT | v1 | `/projects/{projectUid}/customFields` | Flag nach dem Lauf zurücksetzen (`markDoneAfterFix`) | Code.gs |
| GET | v1 | `/projects/{projectUid}/jobs?pageSize=50&workflowLevel={n}` | Jobs im Schritt „PE Gemini“ (NEW/ACCEPTED) | Code.gs |
| POST | v1 | `/projects/{projectUid}/jobs/bilingualFile?format=MXLF&preview=false` | MXLIFF herunterladen | Code.gs |
| POST | v2 | `/projects/{projectUid}/jobs/{jobUid}/termBases/searchInTextByJob` | Termbase-Treffer je Segment | Code.gs |
| POST | v2 | `/bilingualFiles?saveToTransMemory=Confirmed&setCompleted=true` | Korrigierte MXLIFF hochladen, Job abschließen (auch Re-Push) | Code.gs |

Web-Links (keine API): Projekt `https://cloud.memsource.com/web/project2/show/{projectUid}` bzw. `/web/project/show/{projectUid}`, Job `https://cloud.memsource.com/web/job/{jobUid}/translate`.

## 2. Weitere ausgehende Schnittstellen

| Dienst | Endpunkt | Zweck | Authentifizierung |
|---|---|---|---|
| Gemini (Apigee-Proxy) | POST https://34-111-99-134.nip.io/gemini/v1beta/models/{model}:generateContent (Header `x-api-key: GEMINI_API_KEY`) | Post-Editing (`primaryModel`, Fallback-Modelle), MQM-Klassifikation, Glossar-Vorschläge, Test im alten Prompt Editor | GEMINI_API_KEY |
| Google Chat Webhook | POST https://chat.googleapis.com/v1/spaces/…/messages?key=… (`AUTOFIX_HUB_CONFIG.chatWebhookUrl`) | Zugriffsanträge an Admins | Webhook-URL |
| MailApp | – | Zugriffsanträge per E-Mail | Ausführender Nutzer |
| Google Sheets | SpreadsheetApp.openById(`AUTOFIX_DB_SHEET_ID`) | Settings, Run Log, Audit Log, Prompt Spaces | Ausführender Nutzer |

## 3. Eingehende Einstiege

| Einstieg | Aufrufer | Beschreibung |
|---|---|---|
| GET <Web-App-URL> (`doGet`) | Browser / Google Sites | Hub-Oberfläche; `?page=prompts` alter Prompt Editor |
| `google.script.run.apiHub…` | Oberfläche | Funktionen in `src/HubApi.gs`, jede mit Rollenprüfung |
| Zeit-Trigger | Apps Script | `autoFixPoller` (5/10/30 min, je Tick ein Job) |
