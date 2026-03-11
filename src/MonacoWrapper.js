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
//   8. ExtraLibManager.js
//   9. LibraryProviderManager.js
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
  this._themeManager            = null;
  this._suggestionManager       = null;
  this._validationManager       = null;
  this._keybindingManager       = null;
  this._toolbarManager          = null;
  this._fsManager               = null;  // FileSystemManager
  this._modelManager            = null;  // ModelManager
  this._extraLibManager         = null;  // ExtraLibManager
  this._libraryProviderManager  = null;  // LibraryProviderManager

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

  // Library managers — addExtraLib pipeline
  if (typeof ExtraLibManager !== 'undefined') {
    this._extraLibManager = new ExtraLibManager(monaco, function (event, data) {
      self._fireCallback(event, data);
      self._emitEvent(event, data);
    });
  }
  if (typeof LibraryProviderManager !== 'undefined') {
    this._libraryProviderManager = new LibraryProviderManager(monaco, function (event, data) {
      self._fireCallback(event, data);
      self._emitEvent(event, data);
    });
  }

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

  // FileSystemManager + ModelManager
  this._fsManager    = new FileSystemManager(function (event, data) {
    self._fireCallback(event, data);
    self._emitEvent(event, data);
  });
  this._modelManager = new ModelManager(this._editor, this._fsManager, monaco);

  // Dispose the ad-hoc model Monaco created with editor.create()
  // (ModelManager will create and manage its own models via createModel)
  var origModel = this._model;

  // Create and open the default file
  var defaultNode = this._fsManager.addFile(
    this._options.initialFileName || 'main.js',
    null,
    this._options.value || '',
    this._options.language || 'javascript'
  );
  this._modelManager.openFile(defaultNode.id);
  if (origModel) { origModel.dispose(); }
  // Keep _model in sync so existing API continues to work
  this._model = this._editor.getModel();

  // Wire dirty notification
  var self2 = self;
  this._modelManager.onDirtyChange(function (fileId, isDirty) {
    self2._fireCallback(isDirty ? 'onFileDirty' : 'onFileClean', { fileId: fileId });
    self2._emitEvent(isDirty ? 'onFileDirty' : 'onFileClean', { fileId: fileId });
  });

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
  if (!this._model) return;
  // Use pushEditOperations instead of setValue so the undo stack is preserved
  this._model.pushEditOperations(
    [],
    [{ range: this._model.getFullModelRange(), text: String(value) }],
    function () { return null; }
  );
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
  // Sync VFS node language for the active file
  if (this._fsManager && this._modelManager) {
    var activeId = this._modelManager.getActiveFileId();
    var node = activeId ? this._fsManager.getNode(activeId) : null;
    if (node) node.language = langId;
  }
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
  this._editor.focus(); // restore focus lost when toolbar button was clicked
  this._editor.trigger('keyboard', ACTION_IDS.undo, null);
  this._fireCallback('onUndo');
  this._emitEvent('onUndo');
};

/** Redo */
MonacoWrapper.prototype.redo = function () {
  this._editor.focus(); // restore focus lost when toolbar button was clicked
  this._editor.trigger('keyboard', ACTION_IDS.redo, null);
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
  // Intentionally use model.setValue (not this.setValue) to wipe the undo
  // stack — after a reset, undoing back to a broken state is undesirable.
  if (this._model) {
    this._model.setValue(String(this._originalValue));
  }
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
 * Return the raw suggestions array currently registered for a language.
 * @param {string} [language]  Defaults to current editor language
 * @returns {Array}
 */
MonacoWrapper.prototype.getSuggestions = function (language) {
  if (!this._suggestionManager) return [];
  return this._suggestionManager.getSuggestions(language || this.getLanguage());
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
// Public API — Config snapshot & apply
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Public API — Full option snapshot & apply (single source of truth)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map lineNumbers renderType integer → string accepted by updateOptions().
 * @private
 */
MonacoWrapper.prototype._lineNumbersToString = function (renderType) {
  switch (renderType) {
    case 0:  return 'off';
    case 1:  return 'on';
    case 2:  return 'relative';
    case 3:  return 'interval';
    default: return 'on';
  }
};

/**
 * Map autoIndent integer enum → string accepted by updateOptions().
 * @private
 */
MonacoWrapper.prototype._autoIndentToString = function (val) {
  switch (val) {
    case 0:  return 'none';
    case 1:  return 'keep';
    case 2:  return 'brackets';
    case 3:  return 'advanced';
    case 4:  return 'full';
    default: return 'advanced';
  }
};

/**
 * Return a complete, JSON-serialisable snapshot of the current editor state.
 * Reads live values from the Monaco editor instance and model — this is the
 * single source of truth used by getFileConfig(), the preview modal, and
 * any future export features.
 *
 * Excludes non-serialisable state: autoSuggestions, validationFn, toolbar.
 *
 * @returns {object}
 */
MonacoWrapper.prototype.getAllOptions = function () {
  var EO  = (this._monaco && this._monaco.editor && this._monaco.editor.EditorOption) || null;
  var ed  = this._editor;
  var mdl = this._model;

  // Helper: safely call editor.getOption(), fall back to this._options[key]
  var _get = function (enumVal, fallback) {
    try {
      if (EO !== null && enumVal !== undefined) {
        return ed.getOption(enumVal);
      }
    } catch (e) { /* ignore */ }
    return fallback;
  };

  // ── lineNumbers ──────────────────────────────────────────────────────────
  var lineNumbersRaw = _get(EO ? EO.lineNumbers : undefined, null);
  var lineNumbers;
  if (lineNumbersRaw && typeof lineNumbersRaw === 'object' && lineNumbersRaw.renderType !== undefined) {
    lineNumbers = this._lineNumbersToString(lineNumbersRaw.renderType);
  } else if (typeof lineNumbersRaw === 'string') {
    lineNumbers = lineNumbersRaw;
  } else {
    lineNumbers = this._options.lineNumbers || 'on';
  }

  // ── minimap ──────────────────────────────────────────────────────────────
  var minimapRaw = _get(EO ? EO.minimap : undefined, null);
  var minimap;
  if (minimapRaw && typeof minimapRaw === 'object' && minimapRaw.enabled !== undefined) {
    minimap = !!minimapRaw.enabled;
  } else if (typeof minimapRaw === 'boolean') {
    minimap = minimapRaw;
  } else {
    minimap = this._options.minimap !== false;
  }

  // ── autoIndent ───────────────────────────────────────────────────────────
  var autoIndentRaw = _get(EO ? EO.autoIndent : undefined, null);
  var autoIndent;
  if (typeof autoIndentRaw === 'number') {
    autoIndent = this._autoIndentToString(autoIndentRaw);
  } else if (typeof autoIndentRaw === 'string') {
    autoIndent = autoIndentRaw;
  } else {
    autoIndent = 'advanced';
  }

  // ── model options (tabSize, insertSpaces) ────────────────────────────────
  var modelOpts  = mdl ? mdl.getOptions() : null;
  var tabSize    = modelOpts ? modelOpts.tabSize    : (this._options.tabSize    || 4);
  var insertSpaces = modelOpts ? modelOpts.insertSpaces : (this._options.insertSpaces !== false);

  // ── straightforward scalar options ────────────────────────────────────────
  var fontSize    = _get(EO ? EO.fontSize    : undefined, this._options.fontSize    || 14);
  var fontFamily  = _get(EO ? EO.fontFamily  : undefined, this._options.fontFamily  || "Consolas, 'Courier New', monospace");
  var fontWeight  = _get(EO ? EO.fontWeight  : undefined, this._options.fontWeight  || 'normal');
  var letterSpacing = _get(EO ? EO.letterSpacing : undefined, this._options.letterSpacing || 0);
  var lineHeight  = _get(EO ? EO.lineHeight  : undefined, this._options.lineHeight  || 0);
  var wordWrap    = _get(EO ? EO.wordWrap    : undefined, this._options.wordWrap    || 'off');
  var readOnly    = _get(EO ? EO.readOnly    : undefined, !!this._options.readOnly);
  var formatOnType  = _get(EO ? EO.formatOnType  : undefined, !!this._options.formatOnType);
  var formatOnPaste = _get(EO ? EO.formatOnPaste : undefined, !!this._options.formatOnPaste);
  var matchBrackets = _get(EO ? EO.matchBrackets : undefined, this._options.matchBrackets || 'always');
  var scrollBeyondLastLine = _get(EO ? EO.scrollBeyondLastLine : undefined, !!this._options.scrollBeyondLastLine);
  var colorDecorators = _get(EO ? EO.colorDecorators : undefined, this._options.colorDecorators !== false);

  return {
    // ── Identity ─────────────────────────────────────────────────────────
    theme:                this.getTheme(),
    language:             this.getLanguage() || this._options.language || 'javascript',

    // ── Text rendering ────────────────────────────────────────────────────
    fontSize:             typeof fontSize    === 'number' ? fontSize    : 14,
    fontFamily:           typeof fontFamily  === 'string' ? fontFamily  : "Consolas, 'Courier New', monospace",
    fontWeight:           typeof fontWeight  === 'string' ? fontWeight  : 'normal',
    letterSpacing:        typeof letterSpacing === 'number' ? letterSpacing : 0,
    lineHeight:           typeof lineHeight  === 'number' ? lineHeight  : 0,

    // ── Line display ──────────────────────────────────────────────────────
    lineNumbers:          lineNumbers,

    // ── Indentation ───────────────────────────────────────────────────────
    tabSize:              typeof tabSize === 'number' && tabSize > 0 ? tabSize : 4,
    insertSpaces:         typeof insertSpaces === 'boolean' ? insertSpaces : true,

    // ── Wrapping & layout ─────────────────────────────────────────────────
    wordWrap:             typeof wordWrap === 'string' ? wordWrap : 'off',
    scrollBeyondLastLine: typeof scrollBeyondLastLine === 'boolean' ? scrollBeyondLastLine : false,

    // ── Access ────────────────────────────────────────────────────────────
    readOnly:             typeof readOnly === 'boolean' ? readOnly : false,

    // ── Auto-formatting ───────────────────────────────────────────────────
    formatOnType:         typeof formatOnType  === 'boolean' ? formatOnType  : false,
    formatOnPaste:        typeof formatOnPaste === 'boolean' ? formatOnPaste : false,
    autoIndent:           autoIndent,

    // ── Decorations ───────────────────────────────────────────────────────
    minimap:              minimap,
    matchBrackets:        typeof matchBrackets === 'string' ? matchBrackets : 'always',
    colorDecorators:      typeof colorDecorators === 'boolean' ? colorDecorators : true
  };
};

/**
 * Apply a plain options object (as returned by getAllOptions()) back to the
 * live editor.  Unknown keys and type mismatches are silently skipped.
 * This is the single apply path used by applyFileConfig() and the preview
 * modal's "Apply to File" / "Apply to All" actions.
 *
 * @param {object} opts
 */
MonacoWrapper.prototype.applyAllOptions = function (opts) {
  if (!opts || typeof opts !== 'object') return;

  // ── Monaco editor-level options (batch into one updateOptions call) ──────
  var monacoOpts = {};

  if (typeof opts.fontSize    === 'number'  && opts.fontSize > 0)  monacoOpts.fontSize    = opts.fontSize;
  if (typeof opts.fontFamily  === 'string'  && opts.fontFamily)    monacoOpts.fontFamily  = opts.fontFamily;
  if (typeof opts.fontWeight  === 'string')                        monacoOpts.fontWeight  = opts.fontWeight;
  if (typeof opts.letterSpacing === 'number')                      monacoOpts.letterSpacing = opts.letterSpacing;
  if (typeof opts.lineHeight  === 'number')                        monacoOpts.lineHeight  = opts.lineHeight;
  if (typeof opts.lineNumbers === 'string')                        monacoOpts.lineNumbers = opts.lineNumbers;
  if (typeof opts.wordWrap    === 'string')                        monacoOpts.wordWrap    = opts.wordWrap;
  if (typeof opts.readOnly    === 'boolean')                       monacoOpts.readOnly    = opts.readOnly;
  if (typeof opts.formatOnType  === 'boolean')                     monacoOpts.formatOnType  = opts.formatOnType;
  if (typeof opts.formatOnPaste === 'boolean')                     monacoOpts.formatOnPaste = opts.formatOnPaste;
  if (typeof opts.autoIndent  === 'string')                        monacoOpts.autoIndent  = opts.autoIndent;
  if (typeof opts.minimap     === 'boolean')                       monacoOpts.minimap     = { enabled: opts.minimap };
  if (typeof opts.matchBrackets === 'string')                      monacoOpts.matchBrackets = opts.matchBrackets;
  if (typeof opts.scrollBeyondLastLine === 'boolean')              monacoOpts.scrollBeyondLastLine = opts.scrollBeyondLastLine;
  if (typeof opts.colorDecorators === 'boolean')                   monacoOpts.colorDecorators = opts.colorDecorators;

  if (Object.keys(monacoOpts).length > 0) {
    this._editor.updateOptions(monacoOpts);
  }

  // ── Model-level options ──────────────────────────────────────────────────
  if (this._model) {
    var modelUpdate = {};
    if (typeof opts.tabSize      === 'number'  && opts.tabSize > 0) modelUpdate.tabSize      = opts.tabSize;
    if (typeof opts.insertSpaces === 'boolean')                      modelUpdate.insertSpaces = opts.insertSpaces;
    if (Object.keys(modelUpdate).length > 0) this._model.updateOptions(modelUpdate);
  }

  // ── Separate API calls ───────────────────────────────────────────────────
  if (typeof opts.theme    === 'string') this.setTheme(opts.theme);
  if (typeof opts.language === 'string') this.setLanguage(opts.language);

  // ── Mirror into this._options so future reads stay consistent ───────────
  var self = this;
  var mirrorKeys = [
    'fontSize', 'fontFamily', 'fontWeight', 'letterSpacing', 'lineHeight',
    'lineNumbers', 'wordWrap', 'readOnly', 'formatOnType', 'formatOnPaste',
    'autoIndent', 'minimap', 'matchBrackets', 'scrollBeyondLastLine',
    'colorDecorators', 'tabSize', 'insertSpaces', 'theme', 'language'
  ];
  mirrorKeys.forEach(function (k) {
    if (opts[k] !== undefined) self._options[k] = opts[k];
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API — Config snapshot & apply (delegate to getAllOptions/applyAllOptions)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return a plain, JSON-serialisable config snapshot for the given file.
 * Delegates to getAllOptions() then overrides language with the file's own
 * language from the VFS.
 *
 * @param {string|null} fileId  VFS file ID; null/undefined → active file
 * @returns {object}  Config object (never null — falls back to global options)
 */
MonacoWrapper.prototype.getFileConfig = function (fileId) {
  var config = this.getAllOptions();

  // Override language with the specific file's language if available
  var id   = fileId || (this._modelManager ? this._modelManager.getActiveFileId() : null);
  var node = (id && this._fsManager) ? this._fsManager.getNode(id) : null;
  if (node && node.language) {
    config.language = node.language;
  }

  return config;
};

/**
 * Apply a config object (as returned by getFileConfig / getAllOptions) to
 * the live editor.  Delegates to applyAllOptions().
 *
 * @param {object} config
 */
MonacoWrapper.prototype.applyFileConfig = function (config) {
  this.applyAllOptions(config);
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API — File System (VFS) methods
// ─────────────────────────────────────────────────────────────────────────────

/** Add a file to the VFS. Returns the new node. */
MonacoWrapper.prototype.addFile = function (name, parentId, content, language) {
  return this._fsManager.addFile(name, parentId, content, language);
};

/** Add a folder to the VFS. Returns the new node. */
MonacoWrapper.prototype.addFolder = function (name, parentId) {
  return this._fsManager.addFolder(name, parentId);
};

/** Open a file in the editor by id. Returns the Monaco ITextModel. */
MonacoWrapper.prototype.openFile = function (fileId) {
  var model = this._modelManager.openFile(fileId);
  this._model = this._editor.getModel();
  var node = this._fsManager.getNode(fileId);
  if (node) this._fireCallback('onFileSwitch', { fileId: fileId, name: node.name });
  return model;
};

/** Close a file tab. Returns the next active fileId or null. */
MonacoWrapper.prototype.closeFile = function (fileId) {
  return this._modelManager.closeFile(fileId);
};

/** Delete a VFS node (file or folder). Cleans up open models. */
MonacoWrapper.prototype.deleteNode = function (id) {
  var self = this;
  var fileIds = this._fsManager.deleteNode(id);
  fileIds.forEach(function (fid) {
    var next = self._modelManager.deleteFile(fid);
    if (next) self.openFile(next);
  });
  this._model = this._editor.getModel();
};

/** Rename a VFS node. */
MonacoWrapper.prototype.renameNode = function (id, newName) {
  var node = this._fsManager.renameNode(id, newName);
  if (node.type === 'file' && this._modelManager.getModel(id)) {
    this._modelManager.recreateModel(id);
    this._model = this._editor.getModel();
  }
  return node;
};

/** Duplicate a file. Returns the new node. */
MonacoWrapper.prototype.duplicateFile = function (id) {
  return this._fsManager.duplicateFile(id);
};

/** Get all file nodes in the VFS. */
MonacoWrapper.prototype.getAllFiles = function () {
  return this._fsManager.getAllFiles();
};

/** Get VFS node by id. */
MonacoWrapper.prototype.getFileNode = function (id) {
  return this._fsManager.getNode(id);
};

/** Get the currently active file id. */
MonacoWrapper.prototype.getActiveFileId = function () {
  return this._modelManager.getActiveFileId();
};

/** Get array of open file ids (in tab order). */
MonacoWrapper.prototype.getOpenFileIds = function () {
  return this._modelManager.getOpenFileIds();
};

/** Save the active file: persist model content to VFS and clear dirty flag. */
MonacoWrapper.prototype.saveActiveFile = function () {
  this._modelManager.saveActiveFile();
};

/** Check if a file has unsaved changes. */
MonacoWrapper.prototype.isFileDirty = function (fileId) {
  return this._modelManager.isDirty(fileId);
};

/** Export the full VFS as a JSON-serializable object. */
MonacoWrapper.prototype.exportVFS = function () {
  this._modelManager.persistAll();
  return this._fsManager.toJSON();
};

/** Replace the VFS with data from exportVFS(). */
MonacoWrapper.prototype.importVFS = function (data) {
  this._fsManager.fromJSON(data);
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API — Libraries (addExtraLib / .d.ts pipeline)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Analyze a JavaScript source string, generate a .d.ts declaration, and inject
 * it into Monaco via addExtraLib so that typing "LibName." shows members.
 *
 * @param {string} text   JavaScript source content
 * @param {object} opts   { filename?: string, libId?: string }
 * @returns {{ libId: string, symbolCount: number, dts: string }}
 */
MonacoWrapper.prototype.loadLibrary = function (text, opts) {
  opts = opts || {};
  var filename  = opts.filename || 'library.js';
  var libId     = opts.libId || filename.replace(/[^A-Za-z0-9_$]/g, '_');

  if (!this._extraLibManager || !this._libraryProviderManager) {
    console.warn('[MonacoWrapper] Library managers not available.');
    return { libId: libId, symbolCount: 0, dts: '' };
  }

  // Analyze
  var symbols = [];
  if (typeof JSAnalyzer !== 'undefined') {
    symbols = JSAnalyzer.analyze(text, { filename: filename, includePrivate: false });
  }

  // Generate .d.ts
  var dts = '';
  if (typeof DtsGenerator !== 'undefined') {
    dts = DtsGenerator.generate(symbols, { header: 'Generated from: ' + filename });
  }

  // Register with ExtraLibManager (addExtraLib)
  this._extraLibManager.addLib(libId, dts, symbols, filename);

  // Register with dot-trigger provider
  this._libraryProviderManager.registerLibrarySymbols(libId, symbols);

  return { libId: libId, symbolCount: symbols.length, dts: dts };
};

/**
 * Remove a loaded library and dispose its addExtraLib registration.
 * @param {string} libId
 */
MonacoWrapper.prototype.unloadLibrary = function (libId) {
  if (this._extraLibManager)       this._extraLibManager.removeLib(libId);
  if (this._libraryProviderManager) this._libraryProviderManager.unregisterLibrarySymbols(libId);
};

/**
 * Return the generated .d.ts string for a loaded library.
 * @param {string} libId
 * @returns {string}
 */
MonacoWrapper.prototype.getLibraryDts = function (libId) {
  return this._extraLibManager ? this._extraLibManager.getDts(libId) : '';
};

/**
 * Return summary info for all currently loaded libraries.
 * @returns {Array<{ libId, filename, symbolCount, dtsLength }>}
 */
MonacoWrapper.prototype.getLoadedLibraries = function () {
  return this._extraLibManager ? this._extraLibManager.getLoadedLibs() : [];
};

/**
 * Analyze a JavaScript source string and return raw symbols WITHOUT loading
 * the library (useful for previewing before committing).
 *
 * @param {string} text
 * @param {object} [opts]  { filename? }
 * @returns {object[]}  Raw symbol array
 */
MonacoWrapper.prototype.analyzeLibrary = function (text, opts) {
  if (typeof JSAnalyzer === 'undefined') return [];
  return JSAnalyzer.analyze(text, Object.assign({ includePrivate: false }, opts || {}));
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
  if (this._libraryProviderManager) this._libraryProviderManager.dispose();
  if (this._extraLibManager)        this._extraLibManager.dispose();
  if (this._modelManager)           this._modelManager.dispose();
  if (this._toolbarManager)         this._toolbarManager.dispose();
  if (this._keybindingManager)      this._keybindingManager.dispose();
  if (this._validationManager)      this._validationManager.dispose();
  if (this._suggestionManager)      this._suggestionManager.dispose();
  if (this._themeManager)           this._themeManager.dispose();

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
  this._listeners               = {};
  this._fsManager               = null;
  this._modelManager            = null;
  this._extraLibManager         = null;
  this._libraryProviderManager  = null;
};
