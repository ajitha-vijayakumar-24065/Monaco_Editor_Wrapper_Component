// ─────────────────────────────────────────────────────────────────────────────
// SuggestionManager.js — Custom completion item provider registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SuggestionManager
 *
 * Handles registering and disposing custom CompletionItemProviders per language.
 *
 * QUIRK (v0.21.3): Each CompletionItem MUST include a `range` field.
 * We compute it dynamically from model.getWordUntilPosition(position).
 *
 * Usage:
 *   manager.registerSuggestions('javascript', [
 *     { label: 'myFunc', detail: 'My function', insertText: 'myFunc()', kind: 'function' }
 *   ]);
 *   manager.clearSuggestions('javascript');
 */
function SuggestionManager(monacoRef, emitCallback) {
  this._monaco    = monacoRef;
  this._emit      = emitCallback;
  this._providers = {}; // languageId → IDisposable
  this._cache     = {}; // languageId → raw suggestions array
}

/**
 * Map a friendly kind string to monaco.languages.CompletionItemKind numeric value.
 * Falls back to 'text' (18) for unknown kinds.
 */
SuggestionManager.prototype._resolveKind = function (kindStr) {
  var kindMap = {
    method:        0,
    function:      1,
    constructor:   2,
    field:         3,
    variable:      4,
    class:         5,
    struct:        6,
    interface:     7,
    module:        8,
    property:      9,
    event:         10,
    operator:      11,
    unit:          12,
    value:         13,
    constant:      14,
    enum:          15,
    enumMember:    16,
    keyword:       17,
    text:          18,
    color:         19,
    file:          20,
    reference:     21,
    folder:        23,
    typeParameter: 24,
    snippet:       25
  };
  if (typeof kindStr === 'number') return kindStr;
  return (kindMap[String(kindStr).toLowerCase()] !== undefined)
    ? kindMap[String(kindStr).toLowerCase()]
    : 18; // default: 'text'
};

/**
 * Register an array of suggestion objects as a CompletionItemProvider
 * for the given language. If a provider already exists for this language,
 * it is disposed first.
 *
 * @param {string} language   Monaco language ID
 * @param {Array}  suggestions  Array of:
 *   {
 *     label:       string,
 *     detail?:     string,
 *     insertText:  string,
 *     kind?:       string | number,  (default: 'text')
 *     documentation?: string,
 *     sortText?:   string,
 *     filterText?: string,
 *     preselect?:  boolean
 *   }
 */
SuggestionManager.prototype.registerSuggestions = function (language, suggestions) {
  if (!language || !Array.isArray(suggestions)) {
    console.warn('[SuggestionManager] registerSuggestions: invalid arguments');
    return;
  }

  // Dispose previous provider for this language if it exists
  this.clearSuggestions(language);

  var self  = this;
  var monaco = this._monaco;

  var disposable = monaco.languages.registerCompletionItemProvider(language, {
    provideCompletionItems: function (model, position) {
      // QUIRK: range is required in v0.21.3
      var word  = model.getWordUntilPosition(position);
      var range = {
        startLineNumber: position.lineNumber,
        endLineNumber:   position.lineNumber,
        startColumn:     word.startColumn,
        endColumn:       word.endColumn
      };

      var items = suggestions.map(function (s) {
        var item = {
          label:      s.label,
          kind:       self._resolveKind(s.kind),
          insertText: s.insertText || s.label,
          range:      range
        };
        if (s.detail)        item.detail        = s.detail;
        if (s.documentation) item.documentation = s.documentation;
        if (s.sortText)      item.sortText      = s.sortText;
        if (s.filterText)    item.filterText    = s.filterText;
        if (s.preselect)     item.preselect     = s.preselect;

        // Snippet support
        if (s.insertTextIsSnippet) {
          item.insertTextRules = 4; // CompletionItemInsertTextRule.InsertAsSnippet
        }

        return item;
      });

      return { suggestions: items };
    }
  });

  this._providers[language] = disposable;
  this._cache[language]    = suggestions.slice(); // store raw copy
  this._emit('onSuggestionsRegistered', language);
};

/**
 * Return the raw suggestions array currently registered for a language.
 * @param {string} [language]  If omitted, returns all cached suggestions (flat array)
 * @returns {Array}
 */
SuggestionManager.prototype.getSuggestions = function (language) {
  if (language) return this._cache[language] ? this._cache[language].slice() : [];
  // Return all cached items across all languages
  var all = [];
  var langs = Object.keys(this._cache);
  for (var i = 0; i < langs.length; i++) {
    all = all.concat(this._cache[langs[i]]);
  }
  return all;
};

/**
 * Dispose the completion provider registered for a specific language.
 * @param {string} language
 */
SuggestionManager.prototype.clearSuggestions = function (language) {
  if (this._providers[language]) {
    this._providers[language].dispose();
    delete this._providers[language];
  }
  delete this._cache[language];
};

/**
 * Dispose all registered providers.
 */
SuggestionManager.prototype.dispose = function () {
  var languages = Object.keys(this._providers);
  for (var i = 0; i < languages.length; i++) {
    this._providers[languages[i]].dispose();
  }
  this._providers = {};
  this._cache     = {};
};
