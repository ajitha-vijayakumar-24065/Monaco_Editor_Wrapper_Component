// ─────────────────────────────────────────────────────────────────────────────
// MonacoWrapper.js — Core wrapper class
//
// Assumes the following are loaded before this script (in index.html):
//   1. Monaco via AMD (vs/loader.js) → window.monaco
//   2. constants.js   → ACTION_IDS, DEFAULT_OPTIONS, DEFAULT_TOOLBAR_BUTTONS, SEVERITY_MAP
//   3. ThemeManager.js
//   4. SuggestionManager.js
//   5. ValidationManager.js
//   6. KeybindingManager.js
//   7. ToolbarManager.js
// ─────────────────────────────────────────────────────────────────────────────

/**
 * MonacoWrapper
 *
 * A reusable, framework-agnostic Monaco Editor wrapper that:
 *  - Encapsulates all editor features behind a clean API
 *  - Fires callbacks for every action
 *  - Manages toolbar, validation, suggestions, keybindings, theming
 *
 * @param {HTMLElement} containerElement  The element that will contain the editor
 * @param {object}      options           Configuration options (see DEFAULT_OPTIONS)
 *
 * @example
 *   var wrapper = new MonacoWrapper(document.getElementById('editor'), {
 *     value: 'console.log("hello")',
 *     language: 'javascript',
 *     theme: 'vs-dark',
 *     callbacks: {
 *       onChange: function(value) { console.log('changed', value); }
 *     }
 *   });
 */
function MonacoWrapper(containerElement, options) {
  if (!containerElement || !(containerElement instanceof HTMLElement)) {
    throw new Error('[MonacoWrapper] containerElement must be an HTMLElement');
  }
  if (typeof window.monaco === 'undefined') {
    throw new Error('[MonacoWrapper] Monaco is not loaded. Ensure monaco-editor AMD loader has run.');
  }

  this._container   = containerElement;
  this._monaco      = window.monaco;
  this._editor      = null;
  this._model       = null;
  this._options     = this._mergeOptions(options || {});
  this._originalValue = this._options.value;
  this._wordWrapState = this._options.wordWrap;
  this._listeners   = {}; // event name → [handler, ...]
  this._disposables = []; // IDisposable[] for editor event subscriptions

  // Sub-managers (set after editor creation)
  this._themeManager      = null;
  this._suggestionManager = null;
  this._validationManager = null;
  this._keybindingManager = null;
  this._toolbarManager    = null;

  // Bootstrap
  this._createEditor();
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deep-merge user options with DEFAULT_OPTIONS.
 * @private
 */
MonacoWrapper.prototype._mergeOptions = function (userOpts) {
  var defaults = DEFAULT_OPTIONS;
  var result   = {};

  // Shallow-copy defaults
  for (var k in defaults) {
    if (Object.prototype.hasOwnProperty.call(defaults, k)) {
      result[k] = defaults[k];
    }
  }

  // Apply user overrides (shallow for top-level, deep for known objects)
  for (var key in userOpts) {
    if (!Object.prototype.hasOwnProperty.call(userOpts, key)) continue;
    if (key === 'toolbar' && userOpts.toolbar && typeof userOpts.toolbar === 'object') {
      result.toolbar = Object.assign({}, defaults.toolbar, userOpts.toolbar);
    } else if (key === 'callbacks' && userOpts.callbacks && typeof userOpts.callbacks === 'object') {
      result.callbacks = Object.assign({}, userOpts.callbacks);
    } else if (key === 'icons' && userOpts.icons && typeof userOpts.icons === 'object') {
      result.icons = Object.assign({}, userOpts.icons);
    } else {
      result[key] = userOpts[key];
    }
  }

  return result;
};

/**
 * Normalize matchBrackets: accept boolean or string, always return string.
 * @private
 */
MonacoWrapper.prototype._normalizeBracketMatching = function (val) {
  if (val === true  || val === 'always')  return 'always';
  if (val === false || val === 'never')   return 'never';
  if (val === 'near')                     return 'near';
  return 'always';
};

/**
 * Build the options object to pass to monaco.editor.create().
 * @private
 */
MonacoWrapper.prototype._buildEditorOptions = function () {
  var o = this._options;
  return {
    value:              o.value,
    language:           o.language,
    theme:              o.theme,
    fontSize:           o.fontSize,
    fontFamily:         o.fontFamily,
    lineNumbers:        o.lineNumbers,
    wordWrap:           o.wordWrap,
    formatOnType:       o.formatOnType,
    readOnly:           o.readOnly,
    minimap:            { enabled: o.minimap },
    matchBrackets:      this._normalizeBracketMatching(o.matchBrackets),
    tabSize:            o.tabSize,
    insertSpaces:       o.insertSpaces,
    scrollBeyondLastLine: o.scrollBeyondLastLine,
    automaticLayout:    o.automaticLayout,
    quickSuggestions:   true,
    parameterHints:     { enabled: true },
    suggestOnTriggerCharacters: true,
    contextmenu:        true,
    folding:            true,
    glyphMargin:        true
  };
};

/**
 * Instantiate the Monaco editor and all sub-managers.
 * @private
 */
MonacoWrapper.prototype._createEditor = function () {
  var self    = this;
  var monaco  = this._monaco;
  var editorOpts = this._buildEditorOptions();

  // Set initial theme before creating
  monaco.editor.setTheme(this._options.theme);

  // Set up the wrapper layout
  this._container.classList.add('monaco-wrapper');
  this._container.style.display = 'flex';
  this._container.style.flexDirection = 'column';

  // Create an inner div for the actual editor (toolbar sits above it)
  this._editorEl = document.createElement('div');
  this._editorEl.className = 'monaco-wrapper__editor';
  this._editorEl.style.flex = '1';
  this._editorEl.style.minHeight = '0';
  this._container.appendChild(this._editorEl);

  // Create the Monaco editor
  this._editor = monaco.editor.create(this._editorEl, editorOpts);
  this._model  = this._editor.getModel();

  // Register a default DocumentFormattingEditProvider for json & javascript
  this._registerDefaultFormatProvider('json');
  this._registerDefaultFormatProvider('javascript');

  // Initialize sub-managers
  this._themeManager = new ThemeManager(monaco, function (event, data) {
    self._fireCallback(event, data);
    self._emitEvent(event, data);
  });
  this._themeManager._currentTheme = this._options.theme;

  this._suggestionManager = new SuggestionManager(monaco, function (event, data) {
    self._fireCallback(event, data);
    self._emitEvent(event, data);
  });

  this._validationManager = new ValidationManager(monaco, this._editor, function (event, data) {
    self._fireCallback(event, data);
    self._emitEvent(event, data);
  });

  this._keybindingManager = new KeybindingManager(monaco, this._editor, function (event, data) {
    self._fireCallback(event, data);
    self._emitEvent(event, data);
  });

  // Toolbar
  var toolbarOpts = this._options.toolbar || {};
  if (toolbarOpts.show !== false) {
    this._toolbarManager = new ToolbarManager(
      this._container,
      toolbarOpts,
      this._options.icons,
      this,
      DEFAULT_TOOLBAR_BUTTONS
    );
    // Move toolbar to top (before editorEl)
    if (this._toolbarManager._toolbarEl) {
      this._container.insertBefore(this._toolbarManager._toolbarEl, this._editorEl);
    }
  }

  // Register initial custom suggestions
  if (this._options.autoSuggestions && this._options.autoSuggestions.length > 0) {
    this._suggestionManager.registerSuggestions(this._options.language, this._options.autoSuggestions);
  }

  // Register validation fn
  if (typeof this._options.validationFn === 'function') {
    this._validationManager.setValidationFn(
      this._options.validationFn,
      this._options.validationDelay
    );
  }

  // Bind editor events
  this._bindEvents();

  // Format on load
  if (this._options.formatOnLoad) {
    var edRef = this._editor;
    setTimeout(function () {
      var action = edRef.getAction('editor.action.formatDocument');
      if (action && action.isSupported()) {
        action.run();
      }
    }, 300);
  }
};

/**
 * Register a simple pass-through formatting provider so that
 * 'editor.action.formatDocument' works for json and javascript out of the box.
 * @private
 */
MonacoWrapper.prototype._registerDefaultFormatProvider = function (language) {
  var monaco = this._monaco;

  if (language === 'json') {
    monaco.languages.registerDocumentFormattingEditProvider('json', {
      provideDocumentFormattingEdits: function (model) {
        try {
          var text     = model.getValue();
          var parsed   = JSON.parse(text);
          var formatted= JSON.stringify(parsed, null, 2);
          return [{
            range: model.getFullModelRange(),
            text:  formatted
          }];
        } catch (e) {
          return [];
        }
      }
    });
  }

  if (language === 'javascript') {
    // Use Monaco's built-in JS formatting via the TypeScript worker
    // (already registered by Monaco). Only provide a fallback if needed.
    // We don't override it here; Monaco handles JS formatting natively.
  }
};

/**
 * Subscribe to all relevant editor events and forward to callbacks.
 * @private
 */
MonacoWrapper.prototype._bindEvents = function () {
  var self = this;
  var ed   = this._editor;

  this._disposables.push(
    ed.onDidChangeModelContent(function (e) {
      var value = ed.getValue();
      self._fireCallback('onChange', value, e);
      self._emitEvent('onChange', { value: value, event: e });
    }),

    ed.onDidChangeCursorPosition(function (e) {
      self._fireCallback('onCursorChange', e.position);
      self._emitEvent('onCursorChange', e.position);
    }),

    ed.onDidChangeCursorSelection(function (e) {
      self._fireCallback('onSelectionChange', e.selection);
      self._emitEvent('onSelectionChange', e.selection);
    }),

    ed.onDidFocusEditorText(function () {
      self._fireCallback('onFocus');
      self._emitEvent('onFocus');
    }),

    ed.onDidBlurEditorText(function () {
      self._fireCallback('onBlur');
      self._emitEvent('onBlur');
    })
  );
};

/**
 * Fire a named callback from options.callbacks.
 * @private
 */
MonacoWrapper.prototype._fireCallback = function (name) {
  var cb = this._options.callbacks && this._options.callbacks[name];
  if (typeof cb === 'function') {
    var args = Array.prototype.slice.call(arguments, 1);
    cb.apply(null, args);
  }
};

/**
 * Emit an event to listeners registered via .on()
 * @private
 */
MonacoWrapper.prototype._emitEvent = function (name, data) {
  var handlers = this._listeners[name];
  if (!handlers) return;
  for (var i = 0; i < handlers.length; i++) {
    try { handlers[i](data); } catch (e) { /* swallow */ }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API — Content
// ─────────────────────────────────────────────────────────────────────────────

/** @returns {string} Current editor content */
MonacoWrapper.prototype.getValue = function () {
  return this._editor ? this._editor.getValue() : '';
};

/**
 * Set editor content.
 * @param {string} value
 */
MonacoWrapper.prototype.setValue = function (value) {
  if (this._model) {
    this._model.setValue(String(value));
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API — Language & Theme
// ─────────────────────────────────────────────────────────────────────────────

/** @returns {string} Current language ID */
MonacoWrapper.prototype.getLanguage = function () {
  return this._model ? this._model.getModeId() : this._options.language;
};

/**
 * Change the editor language.
 * @param {string} langId
 */
MonacoWrapper.prototype.setLanguage = function (langId) {
  if (!this._model) return;
  this._monaco.editor.setModelLanguage(this._model, langId);
  this._options.language = langId;
  this._fireCallback('onLanguageChange', langId);
  this._emitEvent('onLanguageChange', langId);
};

/** @returns {string} Current theme name */
MonacoWrapper.prototype.getTheme = function () {
  return this._themeManager ? this._themeManager.getTheme() : this._options.theme;
};

/**
 * Set the editor theme.
 * @param {string} themeName  'vs' | 'vs-dark' | 'hc-black' | custom
 */
MonacoWrapper.prototype.setTheme = function (themeName) {
  if (this._themeManager) {
    this._themeManager.setTheme(themeName);
  } else {
    this._monaco.editor.setTheme(themeName);
    this._fireCallback('onThemeChange', themeName);
  }
  this._options.theme = themeName;
};

/** Toggle between 'vs' and 'vs-dark' */
MonacoWrapper.prototype.toggleTheme = function () {
  if (this._themeManager) {
    this._themeManager.toggleTheme();
    this._options.theme = this._themeManager.getTheme();
    // Update toolbar button state
    if (this._toolbarManager) {
      this._toolbarManager.setButtonActive('theme', this._options.theme === 'vs-dark');
    }
  }
};

/**
 * Define a custom Monaco theme.
 * @param {string} name
 * @param {object} themeData  IStandaloneThemeData
 * @param {boolean} [apply=true]
 */
MonacoWrapper.prototype.defineCustomTheme = function (name, themeData, apply) {
  if (this._themeManager) {
    this._themeManager.defineCustomTheme(name, themeData, apply);
  }
};

/**
 * Apply custom token color rules to the active theme.
 * @param {Array} rules
 */
MonacoWrapper.prototype.setCustomTokenColors = function (rules) {
  if (this._themeManager) {
    this._themeManager.setCustomTokenColors(rules);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API — Editor Options
// ─────────────────────────────────────────────────────────────────────────────

/** @returns {number} */
MonacoWrapper.prototype.getFontSize = function () {
  return this._options.fontSize;
};

/**
 * @param {number} size
 */
MonacoWrapper.prototype.setFontSize = function (size) {
  size = Number(size);
  if (isNaN(size) || size < 1) return;
  this._editor.updateOptions({ fontSize: size });
  this._options.fontSize = size;
  this._fireCallback('onFontSizeChange', size);
  this._emitEvent('onFontSizeChange', size);
};

/**
 * @param {string|Function} mode  'on'|'off'|'relative'|'interval'|function
 */
MonacoWrapper.prototype.setLineNumbers = function (mode) {
  this._editor.updateOptions({ lineNumbers: mode });
  this._options.lineNumbers = mode;
  this._fireCallback('onLineNumbersChange', mode);
  this._emitEvent('onLineNumbersChange', mode);
};

/**
 * @param {string} value  'on'|'off'|'wordWrapColumn'|'bounded'
 */
MonacoWrapper.prototype.setWordWrap = function (value) {
  this._editor.updateOptions({ wordWrap: value });
  this._options.wordWrap  = value;
  this._wordWrapState     = value;
  this._fireCallback('onWordWrapChange', value);
  this._emitEvent('onWordWrapChange', value);
  if (this._toolbarManager) {
    this._toolbarManager.setButtonActive('wordWrap', value === 'on');
  }
};

/** Toggle word wrap between 'on' and 'off' */
MonacoWrapper.prototype.toggleWordWrap = function () {
  var next = (this._wordWrapState === 'on') ? 'off' : 'on';
  this.setWordWrap(next);
};

/**
 * @param {boolean} flag
 */
MonacoWrapper.prototype.setReadOnly = function (flag) {
  this._editor.updateOptions({ readOnly: !!flag });
  this._options.readOnly = !!flag;
};

/**
 * @param {boolean} enabled
 */
MonacoWrapper.prototype.setMinimap = function (enabled) {
  this._editor.updateOptions({ minimap: { enabled: !!enabled } });
  this._options.minimap = !!enabled;
};

/**
 * @param {string|boolean} value  'always'|'near'|'never'|true|false
 */
MonacoWrapper.prototype.setBracketMatching = function (value) {
  var normalized = this._normalizeBracketMatching(value);
  this._editor.updateOptions({ matchBrackets: normalized });
  this._options.matchBrackets = normalized;
  this._fireCallback('onBracketMatchingChange', normalized);
  this._emitEvent('onBracketMatchingChange', normalized);
};

/**
 * @param {boolean} enabled
 */
MonacoWrapper.prototype.setFormatOnType = function (enabled) {
  this._editor.updateOptions({ formatOnType: !!enabled });
  this._options.formatOnType = !!enabled;
  this._fireCallback('onFormatOnTypeChange', !!enabled);
  this._emitEvent('onFormatOnTypeChange', !!enabled);
};

/**
 * @param {number} size
 */
MonacoWrapper.prototype.setTabSize = function (size) {
  if (this._model) {
    this._model.updateOptions({ tabSize: Number(size) });
  }
  this._options.tabSize = Number(size);
};

/**
 * Pass-through to editor.updateOptions() for arbitrary options.
 * @param {object} opts
 */
MonacoWrapper.prototype.updateOptions = function (opts) {
  this._editor.updateOptions(opts);
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API — Editor Operations (Features 2-15)
// ─────────────────────────────────────────────────────────────────────────────

/** Undo */
MonacoWrapper.prototype.undo = function () {
  this._editor.trigger('wrapper', ACTION_IDS.undo, null);
  this._fireCallback('onUndo');
  this._emitEvent('onUndo');
};

/** Redo */
MonacoWrapper.prototype.redo = function () {
  this._editor.trigger('wrapper', ACTION_IDS.redo, null);
  this._fireCallback('onRedo');
  this._emitEvent('onRedo');
};

/**
 * Cut selection to clipboard.
 * Triggers Monaco's internal cut, then also tries navigator.clipboard.
 */
MonacoWrapper.prototype.cut = function () {
  var selected = this.getSelection();
  this._editor.trigger('wrapper', ACTION_IDS.cut, null);
  if (selected && typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(selected).catch(function () { /* silently ignore */ });
  }
  this._fireCallback('onCut');
  this._emitEvent('onCut');
};

/**
 * Copy selection to clipboard.
 * @returns {string} The selected text
 */
MonacoWrapper.prototype.copy = function () {
  var selected = this.getSelection();
  this._editor.trigger('wrapper', ACTION_IDS.copy, null);
  if (selected && typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(selected).catch(function () { /* silently ignore */ });
  }
  this._fireCallback('onCopy', selected);
  this._emitEvent('onCopy', selected);
  return selected;
};

/** Indent selected lines */
MonacoWrapper.prototype.indent = function () {
  this._editor.trigger('wrapper', ACTION_IDS.indent, null);
  this._fireCallback('onIndent');
  this._emitEvent('onIndent');
};

/** Outdent selected lines */
MonacoWrapper.prototype.outdent = function () {
  this._editor.trigger('wrapper', ACTION_IDS.outdent, null);
  this._fireCallback('onOutdent');
  this._emitEvent('onOutdent');
};

/** Duplicate current line/selection downward */
MonacoWrapper.prototype.duplicateLine = function () {
  this._editor.trigger('wrapper', ACTION_IDS.duplicateLine, null);
  this._fireCallback('onDuplicateLine');
  this._emitEvent('onDuplicateLine');
};

/** Toggle line comment on selected lines */
MonacoWrapper.prototype.toggleLineComment = function () {
  this._editor.trigger('wrapper', ACTION_IDS.commentLine, null);
  this._fireCallback('onToggleComment', 'line');
  this._emitEvent('onToggleComment', 'line');
};

/** Toggle block comment on selection */
MonacoWrapper.prototype.toggleBlockComment = function () {
  this._editor.trigger('wrapper', ACTION_IDS.blockComment, null);
  this._fireCallback('onToggleComment', 'block');
  this._emitEvent('onToggleComment', 'block');
};

/** Delete current line */
MonacoWrapper.prototype.deleteLine = function () {
  this._editor.trigger('wrapper', ACTION_IDS.deleteLine, null);
  this._fireCallback('onDeleteLine');
  this._emitEvent('onDeleteLine');
};

/**
 * Open the Monaco find widget.
 * @param {object} [options]  { searchString?, matchCase?, matchWholeWord?, useRegex? }
 */
MonacoWrapper.prototype.triggerFind = function (options) {
  this._editor.trigger('wrapper', ACTION_IDS.find, null);
  this._fireCallback('onFind', options || {});
  this._emitEvent('onFind', options || {});
};

/**
 * Format the document using the registered DocumentFormattingEditProvider.
 * @returns {Promise|undefined}
 */
MonacoWrapper.prototype.format = function () {
  var self   = this;
  var action = this._editor.getAction('editor.action.formatDocument');
  if (!action) {
    console.warn('[MonacoWrapper] No formatDocument action found');
    return;
  }
  if (!action.isSupported()) {
    console.warn('[MonacoWrapper] formatDocument is not supported for language: ' + this.getLanguage());
    return;
  }
  var result = action.run();
  var afterFormat = function () {
    self._fireCallback('onFormat');
    self._emitEvent('onFormat');
  };
  if (result && typeof result.then === 'function') {
    return result.then(afterFormat);
  }
  afterFormat();
};

/** Reset editor content to the original value supplied at construction time */
MonacoWrapper.prototype.resetContent = function () {
  this.setValue(this._originalValue);
  this._fireCallback('onReset');
  this._emitEvent('onReset');
};

/**
 * Update the "original" value used by resetContent().
 * Useful when the editor is reused with new initial content.
 * @param {string} value
 */
MonacoWrapper.prototype.setOriginalValue = function (value) {
  this._originalValue = String(value);
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API — Cursor & Selection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @returns {string} Currently selected text
 */
MonacoWrapper.prototype.getSelection = function () {
  var sel = this._editor.getSelection();
  if (!sel) return '';
  return this._model.getValueInRange(sel);
};

/**
 * @returns {{ lineNumber: number, column: number }}
 */
MonacoWrapper.prototype.getPosition = function () {
  return this._editor.getPosition();
};

/**
 * @param {number} lineNumber
 * @param {number} column
 */
MonacoWrapper.prototype.setPosition = function (lineNumber, column) {
  this._editor.setPosition({ lineNumber: lineNumber, column: column });
};

/**
 * Scroll editor so the given line is in the center.
 * @param {number} lineNumber
 */
MonacoWrapper.prototype.revealLine = function (lineNumber) {
  this._editor.revealLineInCenter(lineNumber);
};

/** Focus the editor */
MonacoWrapper.prototype.focus = function () {
  this._editor.focus();
};

/** Force the editor to recalculate its layout (useful after container resize) */
MonacoWrapper.prototype.layout = function () {
  this._editor.layout();
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API — Intelligence & Completions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register custom auto-suggestions for a language.
 * @param {string} language
 * @param {Array}  suggestions
 */
MonacoWrapper.prototype.registerSuggestions = function (language, suggestions) {
  if (this._suggestionManager) {
    this._suggestionManager.registerSuggestions(language, suggestions);
  }
};

/**
 * Clear registered custom suggestions for a language.
 * @param {string} language
 */
MonacoWrapper.prototype.clearSuggestions = function (language) {
  if (this._suggestionManager) {
    this._suggestionManager.clearSuggestions(language);
  }
};

/**
 * Toggle Monaco's built-in quick suggestions.
 * @param {boolean} enabled
 */
MonacoWrapper.prototype.setAutoSuggestionsEnabled = function (enabled) {
  this._editor.updateOptions({
    quickSuggestions:           !!enabled,
    suggestOnTriggerCharacters: !!enabled
  });
  this._fireCallback('onAutoSuggestionsChange', !!enabled);
  this._emitEvent('onAutoSuggestionsChange', !!enabled);
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API — Error & Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Directly set model markers (error/warning squiggles).
 * @param {Array} markers  Array of marker objects (see ValidationManager._toMarkerData)
 */
MonacoWrapper.prototype.setMarkers = function (markers) {
  if (this._validationManager) {
    this._validationManager.setMarkers(markers);
  }
};

/** Clear all markers */
MonacoWrapper.prototype.clearMarkers = function () {
  if (this._validationManager) {
    this._validationManager.clearMarkers();
  }
};

/**
 * Set the live validation function.
 * @param {Function|null} fn  (value: string) => Array<errorObjects>
 * @param {number} [delay]    Debounce delay in ms
 */
MonacoWrapper.prototype.setValidationFn = function (fn, delay) {
  if (this._validationManager) {
    this._validationManager.setValidationFn(fn, delay);
  }
};

/** Remove validation function and clear all validation markers */
MonacoWrapper.prototype.clearValidation = function () {
  if (this._validationManager) {
    this._validationManager.clearValidation();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API — Keybindings
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register a custom keyboard shortcut.
 * @param {{ id, label, keybinding, handler }} descriptor
 */
MonacoWrapper.prototype.addShortcut = function (descriptor) {
  if (this._keybindingManager) {
    this._keybindingManager.addShortcut(descriptor);
  }
};

/**
 * Remove a custom keyboard shortcut.
 * @param {string} id
 */
MonacoWrapper.prototype.removeShortcut = function (id) {
  if (this._keybindingManager) {
    this._keybindingManager.removeShortcut(id);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API — Toolbar
// ─────────────────────────────────────────────────────────────────────────────

/** @param {string} id  Button id */
MonacoWrapper.prototype.showButton = function (id) {
  if (this._toolbarManager) this._toolbarManager.showButton(id);
};

/** @param {string} id  Button id */
MonacoWrapper.prototype.hideButton = function (id) {
  if (this._toolbarManager) this._toolbarManager.hideButton(id);
};

/**
 * @param {{ id, label, icon, onClick, title? }} config
 */
MonacoWrapper.prototype.addCustomButton = function (config) {
  if (this._toolbarManager) this._toolbarManager.addCustomButton(config);
};

/** @param {string} id */
MonacoWrapper.prototype.removeCustomButton = function (id) {
  if (this._toolbarManager) this._toolbarManager.removeCustomButton(id);
};

/**
 * Override default toolbar icons.
 * @param {{ [buttonId]: string }} iconsMap  HTML strings (SVG or img)
 */
MonacoWrapper.prototype.setIcons = function (iconsMap) {
  if (this._toolbarManager) this._toolbarManager.setIcons(iconsMap);
  // Merge into options for future re-renders
  Object.assign(this._options.icons, iconsMap);
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API — Events
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Subscribe to an event post-initialization.
 * @param {string}   eventName
 * @param {Function} handler
 */
MonacoWrapper.prototype.on = function (eventName, handler) {
  if (typeof handler !== 'function') return;
  if (!this._listeners[eventName]) this._listeners[eventName] = [];
  this._listeners[eventName].push(handler);
};

/**
 * Unsubscribe from an event.
 * @param {string}   eventName
 * @param {Function} handler
 */
MonacoWrapper.prototype.off = function (eventName, handler) {
  var handlers = this._listeners[eventName];
  if (!handlers) return;
  var idx = handlers.indexOf(handler);
  if (idx !== -1) handlers.splice(idx, 1);
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API — Escape Hatches
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the raw Monaco editor instance.
 * @returns {IStandaloneCodeEditor}
 */
MonacoWrapper.prototype.getEditor = function () {
  return this._editor;
};

/**
 * Returns the raw Monaco model.
 * @returns {ITextModel}
 */
MonacoWrapper.prototype.getModel = function () {
  return this._model;
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API — Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Destroy the editor and clean up all resources.
 * Call this when the editor is unmounted / removed from the page.
 */
MonacoWrapper.prototype.destroy = function () {
  // Dispose event subscriptions
  for (var i = 0; i < this._disposables.length; i++) {
    this._disposables[i].dispose();
  }
  this._disposables = [];

  // Dispose sub-managers
  if (this._toolbarManager)    this._toolbarManager.dispose();
  if (this._keybindingManager) this._keybindingManager.dispose();
  if (this._validationManager) this._validationManager.dispose();
  if (this._suggestionManager) this._suggestionManager.dispose();
  if (this._themeManager)      this._themeManager.dispose();

  // Dispose the editor
  if (this._editor) {
    this._editor.dispose();
    this._editor = null;
  }

  // Dispose the model
  if (this._model) {
    this._model.dispose();
    this._model = null;
  }

  // Clean up container
  this._container.classList.remove('monaco-wrapper');
  this._container.innerHTML = '';

  // Clear listeners
  this._listeners = {};
};
