// =====================================================================
// AUTOFIX HUB - VERSION (HubVersion.gs)
//
// Wird beim Deploy von der Pipeline ueberschrieben (Tag/Commit/Zeit).
// So sieht man in der App unter "Hilfe", welcher Stand live ist.
// =====================================================================

var HUB_VERSION_INFO_ = { version: 'dev', commit: '', builtAt: '' };

function hubAppVersion_() {
  return HUB_VERSION_INFO_;
}
