'use strict';
// Minimale, zustandsbehaftete Nachbauten der Apps-Script-Dienste, die der
// Prompt Hub nutzt. Genug Verhalten, um Rechte, Speicher und die AutoFix-
// Anbindung ohne Google-Konto zu testen.

class FakeRange {
  constructor(sheet, row, col, nr, nc) { Object.assign(this, { sheet, row, col, nr, nc }); }
  getValues() {
    const out = [];
    for (let r = 0; r < this.nr; r++) {
      const line = [];
      for (let c = 0; c < this.nc; c++) line.push(((this.sheet.rows[this.row - 1 + r] || [])[this.col - 1 + c]) ?? '');
      out.push(line);
    }
    return out;
  }
  setValues(values) {
    values.forEach((line, r) => line.forEach((v, c) => this.sheet.set(this.row + r, this.col + c, v)));
    return this;
  }
  setValue(v) { this.sheet.set(this.row, this.col, v); return this; }
  setFontWeight() { return this; }
}

class FakeSheet {
  constructor(name) { this.name = name; this.rows = []; }
  getName() { return this.name; }
  // Wie Google Sheets: ein fuehrendes Apostroph macht den Wert zu Text und wird nicht gespeichert
  set(row, col, v) {
    while (this.rows.length < row) this.rows.push([]);
    const line = this.rows[row - 1];
    while (line.length < col) line.push('');
    if (typeof v === 'string' && v.startsWith("'")) v = v.substring(1);
    else if (typeof v === 'string' && /^[=+\-@]/.test(v)) throw new Error('Formel-Injektion: ' + v.substring(0, 20));
    line[col - 1] = v;
  }
  width() { return this.rows.reduce((m, r) => Math.max(m, r.length), 0); }
  getDataRange() { return new FakeRange(this, 1, 1, Math.max(1, this.rows.length), Math.max(1, this.width())); }
  getRange(row, col, nr, nc) {
    if (typeof row === 'string') return new FakeRange(this, 1, 1, 1, 1);
    return new FakeRange(this, row, col, nr || 1, nc || 1);
  }
  appendRow(values) { const r = this.rows.length + 1; values.forEach((v, i) => this.set(r, i + 1, v)); }
  deleteRow(r) { this.rows.splice(r - 1, 1); }
  clearContents() { this.rows = []; }
  setFrozenRows() {}
  getLastRow() { return this.rows.length; }
}

class FakeSpreadsheet {
  constructor(id, name) { this.id = id; this.name = name || id; this.sheets = {}; }
  getName() { return this.name; }
  getSheetByName(n) { return this.sheets[n] || null; }
  insertSheet(n) { this.sheets[n] = new FakeSheet(n); return this.sheets[n]; }
}

function makeServices(opts) {
  opts = opts || {};
  const state = {
    spreadsheets: {},
    scriptProps: {}, userProps: {}, cache: {},
    activeUser: opts.activeUser || 'owner@karcher.com',
    effectiveUser: opts.effectiveUser || 'owner@karcher.com',
    fetches: [], mails: [], triggers: [],
    fetchResponder: opts.fetchResponder || (() => ({ code: 200, body: '{}' }))
  };
  function props(store) {
    return {
      getProperty: (k) => (k in store ? store[k] : null),
      setProperty: (k, v) => { store[k] = String(v); },
      deleteProperty: (k) => { delete store[k]; }
    };
  }
  function response(r) { return { getResponseCode: () => r.code, getContentText: () => r.body }; }
  const services = {
    SpreadsheetApp: {
      openById: (id) => {
        if (!state.spreadsheets[id]) throw new Error('Sheet ' + id + ' nicht gefunden');
        return state.spreadsheets[id];
      }
    },
    PropertiesService: { getScriptProperties: () => props(state.scriptProps), getUserProperties: () => props(state.userProps) },
    Session: {
      getActiveUser: () => ({ getEmail: () => state.activeUser }),
      getEffectiveUser: () => ({ getEmail: () => state.effectiveUser })
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
    CacheService: { getScriptCache: () => ({ get: (k) => state.cache[k] || null, put: (k, v) => { state.cache[k] = v; } }) },
    UrlFetchApp: {
      fetch: (url, o) => { state.fetches.push({ url, options: o }); return response(state.fetchResponder(url, o)); },
      fetchAll: (reqs) => reqs.map((r) => { state.fetches.push({ url: r.url, options: r }); return response(state.fetchResponder(r.url, r)); })
    },
    MailApp: { sendEmail: (m) => state.mails.push(m) },
    Utilities: { getUuid: () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, () => Math.floor(Math.random() * 16).toString(16)) },
    Logger: { log: () => {} },
    ScriptApp: {
      getService: () => ({ getUrl: () => 'https://script.google.com/a/macros/karcher.com/s/TEST/exec' }),
      getProjectTriggers: () => state.triggers.map((h) => ({ getHandlerFunction: () => h, getUniqueId: () => 'trig-' + h })),
      deleteTrigger: (tr) => { state.triggers = state.triggers.filter((h) => h !== tr.getHandlerFunction()); },
      newTrigger: (h) => ({ timeBased: () => ({ everyMinutes: (m) => ({ create: () => { state.triggers.push(h); state.triggerMinutes = m; } }) }) })
    },
    HtmlService: {}
  };
  return { services, state, FakeSpreadsheet };
}

// AutoFix-Sheet wie von AutoFix angelegt (Settings mit Key/Value)
function autofixSheet(id, settings) {
  const ss = new FakeSpreadsheet(id, 'AutoFix Hub - Database');
  const sh = ss.insertSheet('Settings');
  sh.appendRow(['Key', 'Value']);
  Object.keys(settings || {}).forEach((k) => sh.appendRow([k, /^[=+\-@*#]/.test(settings[k]) ? "'" + settings[k] : settings[k]]));
  ss.insertSheet('Run Log');
  ss.insertSheet('Audit Log');
  return ss;
}

module.exports = { makeServices, autofixSheet, FakeSpreadsheet };
