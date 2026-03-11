// ─────────────────────────────────────────────────────────────────────────────
// LibraryProviderManager.js — Dot-triggered context-aware CompletionItemProvider
//
// Works as a fallback to Monaco's built-in TS language service.
// When the user types "LibName.", it returns all known members of LibName.
//
// Indexes symbols from all loaded libraries.  Only fires for
// "IDENTIFIER." trigger patterns; non-dot completions fall through to
// the default provider.
//
// QUIRK (Monaco v0.21.3): Each CompletionItem must include a `range` field.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LibraryProviderManager
 *
 * @param {object}   monacoRef    window.monaco reference
 * @param {Function} emitCallback Function(eventName, data)
 */
function LibraryProviderManager(monacoRef, emitCallback) {
  this._monaco      = monacoRef;
  this._emit        = emitCallback || function () {};
  this._index       = {}; // varName → { libId, members: symbol[] }
  this._disposables = []; // IDisposable[]

  this._registerProvider('javascript');
  this._registerProvider('typescript');
}

// ── Kind mapping (matches SuggestionManager) ────────────────────────────────

var LPM_KIND_MAP = {
  method:    0,
  function:  1,
  constructor: 2,
  field:     3,
  variable:  4,
  class:     5,
  interface: 7,
  module:    8,
  property:  9,
  constant:  14,
  text:      18
};

LibraryProviderManager.prototype._resolveKind = function (kindStr) {
  var k = (kindStr || 'text').toLowerCase();
  return LPM_KIND_MAP[k] !== undefined ? LPM_KIND_MAP[k] : 18;
};

/** @private Register a CompletionItemProvider for one language. */
LibraryProviderManager.prototype._registerProvider = function (language) {
  var self   = this;
  var monaco = this._monaco;

  var disp = monaco.languages.registerCompletionItemProvider(language, {
    triggerCharacters: ['.'],

    provideCompletionItems: function (model, position) {
      // Get text on the line up to the cursor
      var lineText  = model.getLineContent(position.lineNumber);
      var lineUpTo  = lineText.substring(0, position.column - 1);

      // Match "Identifier." at the end of the typed text
      var dotMatch = lineUpTo.match(/([A-Za-z_$][\w$]*)\.$/);
      if (!dotMatch) return { suggestions: [] };

      var varName = dotMatch[1];
      var entry   = self._index[varName];
      if (!entry || !entry.members.length) return { suggestions: [] };

      // Range covers the empty string after the dot (insertion point)
      var range = {
        startLineNumber: position.lineNumber,
        endLineNumber:   position.lineNumber,
        startColumn:     position.column,
        endColumn:       position.column
      };

      var items = entry.members.map(function (sym) {
        var insertText = sym.name;
        var insertTextRules;

        if (sym.kind === 'method' || sym.kind === 'function') {
          if (sym.params && sym.params.length > 0) {
            // Build snippet with tab stops for each parameter
            var tabs = sym.params.map(function (p, i) {
              return '${' + (i + 1) + ':' + p + '}';
            }).join(', ');
            insertText      = sym.name + '(' + tabs + ')';
            insertTextRules = 4; // InsertAsSnippet
          } else {
            insertText = sym.name + '()';
          }
        }

        var doc = sym.documentation || '';
        var detail = sym.kind;
        if (sym.returnType && sym.returnType !== 'any' && sym.returnType !== '') {
          detail += ' → ' + sym.returnType;
        }

        var item = {
          label:      sym.name,
          kind:       self._resolveKind(sym.kind),
          insertText: insertText,
          detail:     detail,
          range:      range,
          sortText:   '0_' + sym.name  // sort library members first
        };
        if (doc)              item.documentation = doc;
        if (insertTextRules)  item.insertTextRules = insertTextRules;

        return item;
      });

      return { suggestions: items };
    }
  });

  this._disposables.push(disp);
};

// ── Symbol indexing ──────────────────────────────────────────────────────────

/**
 * Register symbols from a loaded library into the dot-trigger index.
 * Top-level symbols with nested members are indexed by their name.
 * Symbols with memberOf are indexed under their parent.
 *
 * @param {string}   libId
 * @param {object[]} symbols  Raw symbols from JSAnalyzer
 */
LibraryProviderManager.prototype.registerLibrarySymbols = function (libId, symbols) {
  if (!libId || !Array.isArray(symbols)) return;

  // First pass: build a parent → children map from memberOf
  var parentMap = {}; // parentName → symbol[]
  symbols.forEach(function (sym) {
    if (sym.memberOf) {
      if (!parentMap[sym.memberOf]) parentMap[sym.memberOf] = [];
      parentMap[sym.memberOf].push(sym);
    }
  });

  // Second pass: index top-level symbols that have nested members
  symbols.forEach(function (sym) {
    if (sym.memberOf) return; // skip nested — they're indexed under the parent

    // Collect members from nested array + memberOf index
    var members = [];
    if (Array.isArray(sym.nested) && sym.nested.length > 0) {
      members = members.concat(sym.nested);
    }
    if (parentMap[sym.name]) {
      // Add memberOf children not already in nested
      parentMap[sym.name].forEach(function (ms) {
        if (!members.some(function (m) { return m.name === ms.name; })) {
          members.push(ms);
        }
      });
    }

    if (members.length > 0) {
      this._index[sym.name] = { libId: libId, members: members };
    }
  }, this);

  console.log('[LibraryProviderManager] Indexed', Object.keys(parentMap).length, 'objects from', libId);
};

/**
 * Remove all index entries that belong to a specific library.
 * @param {string} libId
 */
LibraryProviderManager.prototype.unregisterLibrarySymbols = function (libId) {
  var self = this;
  Object.keys(this._index).forEach(function (key) {
    if (self._index[key].libId === libId) {
      delete self._index[key];
    }
  });
};

/**
 * Get list of all indexed top-level names.
 * @returns {string[]}
 */
LibraryProviderManager.prototype.getIndexedNames = function () {
  return Object.keys(this._index);
};

/**
 * Dispose all registered providers.
 */
LibraryProviderManager.prototype.dispose = function () {
  this._disposables.forEach(function (d) {
    if (d && typeof d.dispose === 'function') d.dispose();
  });
  this._disposables = [];
  this._index = {};
};
