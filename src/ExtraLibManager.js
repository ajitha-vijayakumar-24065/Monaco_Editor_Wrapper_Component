// ─────────────────────────────────────────────────────────────────────────────
// ExtraLibManager.js — Manage monaco.languages.typescript addExtraLib() lifecycle
//
// Registers .d.ts content on BOTH javascriptDefaults AND typescriptDefaults
// so that completions work regardless of active language.
//
// Usage:
//   var mgr = new ExtraLibManager(monaco, emitFn);
//   mgr.addLib('myLib', dtsContent, symbols, 'QCSdk.js');
//   mgr.removeLib('myLib');
//   mgr.getLoadedLibs();  // → [{ libId, filename, symbolCount, dtsLength }]
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ExtraLibManager
 *
 * @param {object}   monacoRef    window.monaco reference
 * @param {Function} emitCallback Function(eventName, data) for event forwarding
 */
function ExtraLibManager(monacoRef, emitCallback) {
  this._monaco = monacoRef;
  this._emit   = emitCallback || function () {};
  this._libs   = {}; // libId → { dts, uri, dispJS, dispTS, symbols, filename }

  this._configureCompilerOptions();
}

/**
 * Set compiler options on both JS and TS defaults to allow injected .d.ts
 * without producing false error squiggles in the editor.
 * @private
 */
ExtraLibManager.prototype._configureCompilerOptions = function () {
  var ts = this._monaco.languages.typescript;
  if (!ts) return;

  var opts = {
    allowJs:               true,
    checkJs:               false,
    allowNonTsExtensions:  true,
    noLib:                 false,
    target:                ts.ScriptTarget ? ts.ScriptTarget.ESNext : 99
  };

  if (ts.javascriptDefaults) {
    ts.javascriptDefaults.setCompilerOptions(opts);
    // Suppress semantic errors — keep syntax errors only
    ts.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation:   false
    });
  }
  if (ts.typescriptDefaults) {
    ts.typescriptDefaults.setCompilerOptions(opts);
  }
};

/**
 * Add (or replace) a TypeScript ambient declaration for a library.
 *
 * @param {string}   libId     Unique identifier key for the library
 * @param {string}   dts       TypeScript declaration string (.d.ts content)
 * @param {object[]} symbols   Raw symbols from JSAnalyzer (for metadata)
 * @param {string}   filename  Original filename (for display)
 */
ExtraLibManager.prototype.addLib = function (libId, dts, symbols, filename) {
  if (!libId) { console.warn('[ExtraLibManager] addLib: libId required'); return; }

  // Dispose existing entry first (update semantics)
  if (this._libs[libId]) {
    this._disposeEntry(this._libs[libId]);
  }

  if (!dts || !dts.trim()) {
    console.warn('[ExtraLibManager] addLib: empty dts for', libId);
    this._libs[libId] = { dts: '', uri: '', dispJS: null, dispTS: null, symbols: symbols || [], filename: filename || libId };
    return;
  }

  var uri  = 'file:///libs/' + libId + '.d.ts';
  var ts   = this._monaco.languages.typescript;
  var dispJS = null;
  var dispTS = null;

  if (ts && ts.javascriptDefaults) {
    dispJS = ts.javascriptDefaults.addExtraLib(dts, uri);
  }
  if (ts && ts.typescriptDefaults) {
    dispTS = ts.typescriptDefaults.addExtraLib(dts, uri);
  }

  this._libs[libId] = {
    dts:      dts,
    uri:      uri,
    dispJS:   dispJS,
    dispTS:   dispTS,
    symbols:  symbols  || [],
    filename: filename || libId
  };

  this._emit('onLibraryLoaded', { libId: libId, filename: filename, symbolCount: (symbols || []).length });
  console.log('[ExtraLibManager] addLib:', libId, '(' + (symbols || []).length + ' symbols, ' + dts.length + ' chars)');
};

/**
 * Remove a library and dispose its addExtraLib registrations.
 * @param {string} libId
 */
ExtraLibManager.prototype.removeLib = function (libId) {
  if (!this._libs[libId]) return;
  this._disposeEntry(this._libs[libId]);
  delete this._libs[libId];
  this._emit('onLibraryUnloaded', { libId: libId });
  console.log('[ExtraLibManager] removeLib:', libId);
};

/** @private */
ExtraLibManager.prototype._disposeEntry = function (entry) {
  if (entry.dispJS && typeof entry.dispJS.dispose === 'function') entry.dispJS.dispose();
  if (entry.dispTS && typeof entry.dispTS.dispose === 'function') entry.dispTS.dispose();
};

/**
 * Check if a library is currently loaded.
 * @param {string} libId
 * @returns {boolean}
 */
ExtraLibManager.prototype.hasLib = function (libId) {
  return !!this._libs[libId];
};

/**
 * Get the stored entry for a library.
 * @param {string} libId
 * @returns {{ dts, uri, symbols, filename } | null}
 */
ExtraLibManager.prototype.getLib = function (libId) {
  return this._libs[libId] || null;
};

/**
 * Get summary info for all loaded libraries.
 * @returns {Array<{ libId, filename, symbolCount, dtsLength }>}
 */
ExtraLibManager.prototype.getLoadedLibs = function () {
  return Object.keys(this._libs).map(function (libId) {
    var e = this._libs[libId];
    return {
      libId:       libId,
      filename:    e.filename,
      symbolCount: e.symbols.length,
      dtsLength:   e.dts.length
    };
  }, this);
};

/**
 * Get the .d.ts content for a specific library.
 * @param {string} libId
 * @returns {string}
 */
ExtraLibManager.prototype.getDts = function (libId) {
  var entry = this._libs[libId];
  return entry ? entry.dts : '';
};

/**
 * Get the raw symbols for a library.
 * @param {string} libId
 * @returns {object[]}
 */
ExtraLibManager.prototype.getSymbols = function (libId) {
  var entry = this._libs[libId];
  return entry ? entry.symbols : [];
};

/**
 * Remove all loaded libraries and dispose resources.
 */
ExtraLibManager.prototype.dispose = function () {
  var self = this;
  Object.keys(this._libs).forEach(function (libId) {
    self._disposeEntry(self._libs[libId]);
  });
  this._libs = {};
};
