// =====================================================================
// doGet_Patch.gs ? NUR ANLEITUNG, KEINE ECHTE PROJEKTDATEI
// =====================================================================
// WICHTIG: Falls du bereits eine Datei "Doget patch.gs" (oder ?hnlich)
// im Projekt angelegt hast ? BITTE L?SCHEN. Diese Datei hier ist nur
// eine Kopiervorlage, kein eigenst?ndiges Skript. Zwei Dateien mit
// jeweils einer eigenen doGet()-Funktion im selben Projekt f?hren zu
// unvorhersehbarem Verhalten (undefiniert, welche gewinnt).
//
// So gehst du vor:
//   1. Code.gs ?ffnen.
//   2. Die dort vorhandene Funktion doGet() KOMPLETT durch den Block
//      unten ersetzen (copy & paste).
//   3. Falls im Projekt eine separate Datei "Doget patch" o.?. existiert:
//      Rechtsklick auf die Datei im Dateibaum ? L?schen.
//   4. Neu bereitstellen (siehe README).
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