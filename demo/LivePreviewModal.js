// ─────────────────────────────────────────────────────────────────────────────
// LivePreviewModal.js — Live Preview modal for the Monaco Editor Wrapper demo
//
// Opens a full-screen modal with:
//   Column 1 — Monaco JSON editor showing the current file's config
//   Column 2 — Monaco editor rendering that config + file content (editable)
//   Tab Bar  — one tab per workspace file; switching updates both columns
//
// Usage:
//   var modal = new LivePreviewModal();
//   modal.open(wrapperInstance);
//   modal.close();
//   modal.destroy();
// ─────────────────────────────────────────────────────────────────────────────

/* global monaco */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.LivePreviewModal = factory();
}(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this),
function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────────

  /** Known config keys → expected typeof value */
  var KNOWN_KEYS = {
    // ── Identity ───────────────────────────────────────────────────────────
    language:             'string',
    theme:                'string',

    // ── Text rendering ─────────────────────────────────────────────────────
    fontSize:             'number',
    fontFamily:           'string',
    fontWeight:           'string',
    letterSpacing:        'number',
    lineHeight:           'number',

    // ── Line display ────────────────────────────────────────────────────────
    lineNumbers:          'string',

    // ── Indentation ─────────────────────────────────────────────────────────
    tabSize:              'number',
    insertSpaces:         'boolean',

    // ── Wrapping & layout ───────────────────────────────────────────────────
    wordWrap:             'string',
    scrollBeyondLastLine: 'boolean',

    // ── Access ──────────────────────────────────────────────────────────────
    readOnly:             'boolean',

    // ── Auto-formatting ─────────────────────────────────────────────────────
    formatOnType:         'boolean',
    formatOnPaste:        'boolean',
    autoIndent:           'string',

    // ── Decorations ─────────────────────────────────────────────────────────
    minimap:              'boolean',
    matchBrackets:        'string',
    colorDecorators:      'boolean'
  };

  /** Fallback / "Reset Defaults" config (matches DEFAULT_OPTIONS in constants.js) */
  var DEFAULTS = {
    // ── Identity ───────────────────────────────────────────────────────────
    language:             'javascript',
    theme:                'vs',

    // ── Text rendering ─────────────────────────────────────────────────────
    fontSize:             14,
    fontFamily:           "Consolas, 'Courier New', monospace",
    fontWeight:           'normal',
    letterSpacing:        0,
    lineHeight:           0,      // 0 = Monaco auto-computes from fontSize

    // ── Line display ────────────────────────────────────────────────────────
    lineNumbers:          'on',

    // ── Indentation ─────────────────────────────────────────────────────────
    tabSize:              4,
    insertSpaces:         true,

    // ── Wrapping & layout ───────────────────────────────────────────────────
    wordWrap:             'off',
    scrollBeyondLastLine: false,

    // ── Access ──────────────────────────────────────────────────────────────
    readOnly:             false,

    // ── Auto-formatting ─────────────────────────────────────────────────────
    formatOnType:         false,
    formatOnPaste:        false,
    autoIndent:           'advanced',

    // ── Decorations ─────────────────────────────────────────────────────────
    minimap:              true,
    matchBrackets:        'always',
    colorDecorators:      true
  };

  // ── Constructor ────────────────────────────────────────────────────────────

  function LivePreviewModal() {
    // DOM refs (created lazily on first open)
    this._overlay        = null;
    this._modal          = null;
    this._tabBarEl       = null;
    this._col1El         = null;  // container div for config editor
    this._col2El         = null;  // container div for preview editor
    this._statusBarEl    = null;

    // Monaco editor instances (created lazily on first open)
    this._configEditor   = null;
    this._previewEditor  = null;
    this._configDisposable = null;

    // State
    this._wrapper        = null;   // reference to mainMonacoWrapper
    this._activeTabId    = null;
    this._lastTabId      = null;   // persists across open/close cycles
    this._previewContentCache = {}; // fileId → string (user edits Column 2)

    // Flags
    this._suppressConfigChange = false;
    this._isOpen         = false;

    // Timers / handlers
    this._debounceTimer  = null;
    this._statusTimer    = null;
    this._keyHandler     = null;
    this._resizeHandler  = null;
  }

  // ── DOM Creation ───────────────────────────────────────────────────────────

  LivePreviewModal.prototype._createDom = function () {
    var self = this;

    // Overlay (backdrop)
    var overlay = document.createElement('div');
    overlay.className = 'lp-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Live Preview');

    // Click on backdrop to close
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) self.close();
    });

    // Modal container
    var modal = document.createElement('div');
    modal.className = 'lp-modal';

    // ── Header ────────────────────────────────────────────────────────────────
    var header = document.createElement('div');
    header.className = 'lp-header';
    header.innerHTML = [
      '<div class="lp-header-title">',
      '  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"',
      '    fill="none" stroke="currentColor" stroke-width="2"',
      '    stroke-linecap="round" stroke-linejoin="round">',
      '    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>',
      '    <circle cx="12" cy="12" r="3"/>',
      '  </svg>',
      '  Live Preview',
      '</div>',
      '<div class="lp-header-actions">',
      '  <button class="lp-btn lp-btn--secondary" id="lp-btn-reset"',
      '    title="Reset Column 1 to DEFAULT_OPTIONS">Reset Defaults</button>',
      '  <button class="lp-btn lp-btn--primary"   id="lp-btn-apply"',
      '    title="Apply Column 1 config to the active file in the main editor">Apply to File</button>',
      '  <button class="lp-btn lp-btn--secondary" id="lp-btn-apply-all"',
      '    title="Apply Column 1 config (except language) to all workspace files">Apply to All</button>',
      '  <button class="lp-btn lp-btn--close"     id="lp-btn-close"',
      '    title="Close preview (Esc)" aria-label="Close">',
      '    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"',
      '      fill="none" stroke="currentColor" stroke-width="2.5"',
      '      stroke-linecap="round" stroke-linejoin="round">',
      '      <line x1="18" y1="6" x2="6" y2="18"/>',
      '      <line x1="6"  y1="6" x2="18" y2="18"/>',
      '    </svg>',
      '  </button>',
      '</div>'
    ].join('');

    // ── File tab bar ──────────────────────────────────────────────────────────
    var tabBar = document.createElement('div');
    tabBar.className = 'lp-tab-bar';

    // ── Two-column body ───────────────────────────────────────────────────────
    var cols = document.createElement('div');
    cols.className = 'lp-columns';

    var col1 = document.createElement('div');
    col1.className = 'lp-col lp-col--config';
    var col1Hdr = document.createElement('div');
    col1Hdr.className = 'lp-col-header';
    col1Hdr.textContent = 'Configuration JSON';
    var col1Ed = document.createElement('div');
    col1Ed.className = 'lp-editor-container';
    col1Ed.id = 'lp-config-editor';
    col1.appendChild(col1Hdr);
    col1.appendChild(col1Ed);

    var col2 = document.createElement('div');
    col2.className = 'lp-col lp-col--preview';
    var col2Hdr = document.createElement('div');
    col2Hdr.className = 'lp-col-header';
    col2Hdr.textContent = 'Preview  (editable — changes cached per tab)';
    var col2Ed = document.createElement('div');
    col2Ed.className = 'lp-editor-container';
    col2Ed.id = 'lp-preview-editor';
    col2.appendChild(col2Hdr);
    col2.appendChild(col2Ed);

    cols.appendChild(col1);
    cols.appendChild(col2);

    // ── Status bar ────────────────────────────────────────────────────────────
    var statusBar = document.createElement('div');
    statusBar.className = 'lp-status-bar';
    statusBar.id = 'lp-status-bar';
    statusBar.innerHTML = '<span class="lp-status-ready">Ready</span>';

    // ── Assemble ──────────────────────────────────────────────────────────────
    modal.appendChild(header);
    modal.appendChild(tabBar);
    modal.appendChild(cols);
    modal.appendChild(statusBar);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Store refs
    this._overlay     = overlay;
    this._modal       = modal;
    this._tabBarEl    = tabBar;
    this._col1El      = col1Ed;
    this._col2El      = col2Ed;
    this._statusBarEl = statusBar;

    // Wire header buttons
    modal.querySelector('#lp-btn-close').addEventListener('click', function () { self.close(); });
    modal.querySelector('#lp-btn-reset').addEventListener('click', function () { self._resetDefaults(); });
    modal.querySelector('#lp-btn-apply').addEventListener('click', function () { self._applyToFile(); });
    modal.querySelector('#lp-btn-apply-all').addEventListener('click', function () { self._applyToAll(); });
  };

  // ── Monaco editor initialisation (lazy — first open only) ─────────────────

  LivePreviewModal.prototype._initEditors = function () {
    if (this._configEditor) return;   // already created
    if (typeof window.monaco === 'undefined') return;

    var monaco      = window.monaco;
    var currentTheme = this._wrapper ? this._wrapper.getTheme() : 'vs';

    // Column 1: JSON config editor
    this._configEditor = monaco.editor.create(this._col1El, {
      value:               '{}',
      language:            'json',
      theme:               currentTheme,
      fontSize:            13,
      lineNumbers:         'on',
      minimap:             { enabled: false },
      scrollBeyondLastLine: false,
      automaticLayout:     false,
      wordWrap:            'on',
      tabSize:             2,
      insertSpaces:        true,
      folding:             true,
      glyphMargin:         false,
      quickSuggestions:    true,
      contextmenu:         true
    });

    // Column 2: Preview editor (user-editable)
    this._previewEditor = monaco.editor.create(this._col2El, {
      value:               '',
      language:            'javascript',
      theme:               currentTheme,
      fontSize:            14,
      lineNumbers:         'on',
      minimap:             { enabled: false },
      scrollBeyondLastLine: false,
      automaticLayout:     false,
      readOnly:            false,
      tabSize:             4,
      wordWrap:            'off',
      folding:             true,
      glyphMargin:         true,
      contextmenu:         true
    });

    // Wire Column 1 onChange → debounced preview update
    var self = this;
    this._configDisposable = this._configEditor.onDidChangeModelContent(function () {
      if (self._suppressConfigChange) return;
      clearTimeout(self._debounceTimer);
      self._debounceTimer = setTimeout(function () {
        self._applyConfigToPreview();
      }, 400);
    });
  };

  // ── Apply config JSON → Column 2 preview ─────────────────────────────────

  LivePreviewModal.prototype._applyConfigToPreview = function () {
    if (!this._configEditor || !this._previewEditor) return;

    var raw = this._configEditor.getValue();
    var config;
    try {
      config = JSON.parse(raw);
    } catch (e) {
      var lineMatch = e.message.match(/line (\d+)/i);
      var atLine = lineMatch ? ' at line ' + lineMatch[1] : '';
      this._setStatus('error', 'JSON parse error' + atLine + ': ' + e.message);
      return;
    }

    var result = this._validateConfig(config);
    var clean  = result.clean;
    var monaco = window.monaco;

    // Language
    if (clean.language) {
      monaco.editor.setModelLanguage(this._previewEditor.getModel(), clean.language);
    }

    // Theme (global — affects both editors; restored when modal closes)
    if (clean.theme) {
      monaco.editor.setTheme(clean.theme);
    }

    // All other editor options
    var opts = {};
    if (typeof clean.fontSize            === 'number'  && clean.fontSize > 0)
                                                          opts.fontSize             = clean.fontSize;
    if (typeof clean.fontFamily          === 'string')  opts.fontFamily           = clean.fontFamily;
    if (typeof clean.fontWeight          === 'string')  opts.fontWeight           = clean.fontWeight;
    if (typeof clean.letterSpacing       === 'number')  opts.letterSpacing        = clean.letterSpacing;
    if (typeof clean.lineHeight          === 'number')  opts.lineHeight           = clean.lineHeight;
    if (typeof clean.lineNumbers         === 'string')  opts.lineNumbers          = clean.lineNumbers;
    if (typeof clean.wordWrap            === 'string')  opts.wordWrap             = clean.wordWrap;
    if (typeof clean.readOnly            === 'boolean') opts.readOnly             = clean.readOnly;
    if (typeof clean.tabSize             === 'number'  && clean.tabSize > 0)
                                                          opts.tabSize              = clean.tabSize;
    if (typeof clean.insertSpaces        === 'boolean') opts.insertSpaces         = clean.insertSpaces;
    if (typeof clean.formatOnType        === 'boolean') opts.formatOnType         = clean.formatOnType;
    if (typeof clean.formatOnPaste       === 'boolean') opts.formatOnPaste        = clean.formatOnPaste;
    if (typeof clean.autoIndent          === 'string')  opts.autoIndent           = clean.autoIndent;
    if (typeof clean.minimap             === 'boolean') opts.minimap              = { enabled: clean.minimap };
    if (typeof clean.matchBrackets       === 'string')  opts.matchBrackets        = clean.matchBrackets;
    if (typeof clean.scrollBeyondLastLine=== 'boolean') opts.scrollBeyondLastLine = clean.scrollBeyondLastLine;
    if (typeof clean.colorDecorators     === 'boolean') opts.colorDecorators      = clean.colorDecorators;

    if (Object.keys(opts).length > 0) {
      this._previewEditor.updateOptions(opts);
    }

    if (result.messages.length > 0) {
      this._setStatus('warn', '⚠ ' + result.messages.join('; '));
    } else {
      this._setStatus('ok', '✓ Config valid');
    }
  };

  // ── Config validation ─────────────────────────────────────────────────────

  /** Validate a parsed config object. Returns { clean, messages }. */
  LivePreviewModal.prototype._validateConfig = function (config) {
    var clean    = {};
    var messages = [];
    var unknown  = [];

    Object.keys(config).forEach(function (key) {
      if (!KNOWN_KEYS.hasOwnProperty(key)) {
        unknown.push(key);
        return;
      }
      var expected = KNOWN_KEYS[key];
      var val      = config[key];
      if (typeof val !== expected) {
        messages.push(key + ' must be ' + expected + ' (got ' + (typeof val) + ')');
        return;
      }
      if ((key === 'fontSize' || key === 'tabSize') && val <= 0) {
        messages.push(key + ' must be > 0');
        return;
      }
      clean[key] = val;
    });

    if (unknown.length > 0) {
      messages.push('Unknown keys ignored: ' + unknown.join(', '));
    }

    return { clean: clean, messages: messages };
  };

  // ── File tab bar ──────────────────────────────────────────────────────────

  LivePreviewModal.prototype._buildTabs = function () {
    if (!this._tabBarEl || !this._wrapper) return;
    var self  = this;
    var files = this._wrapper._fsManager ? this._wrapper._fsManager.getAllFiles() : [];

    this._tabBarEl.innerHTML = '';

    if (files.length === 0) {
      var empty = document.createElement('span');
      empty.className = 'lp-tab-empty';
      empty.textContent = 'No files in workspace — add files using the file panel';
      this._tabBarEl.appendChild(empty);
      this._activeTabId = null;
      return;
    }

    files.forEach(function (file) {
      var tab = document.createElement('button');
      tab.className   = 'lp-tab';
      tab.dataset.fileId = file.id;

      // Truncate long names in the label; full name in title tooltip
      var name = file.name || '(untitled)';
      tab.textContent = name.length > 28 ? name.slice(0, 25) + '…' : name;
      tab.title = file.name;

      if (file.id === self._activeTabId) {
        tab.classList.add('lp-tab--active');
      }
      if (self._previewContentCache.hasOwnProperty(file.id)) {
        tab.classList.add('lp-tab--edited');
      }

      tab.addEventListener('click', function () { self._switchTab(file.id); });
      self._tabBarEl.appendChild(tab);
    });
  };

  LivePreviewModal.prototype._switchTab = function (fileId) {
    if (!this._wrapper) return;

    // Save Column 2 content to cache before switching
    if (this._activeTabId && this._previewEditor) {
      this._previewContentCache[this._activeTabId] = this._previewEditor.getValue();
    }

    // Cancel any pending config-change debounce
    clearTimeout(this._debounceTimer);

    // Update tracking vars
    this._activeTabId = fileId;
    this._lastTabId   = fileId;

    // Update tab bar highlight
    var tabs = this._tabBarEl.querySelectorAll('.lp-tab');
    tabs.forEach(function (t) {
      t.classList.toggle('lp-tab--active', t.dataset.fileId === fileId);
    });

    // Get the VFS node
    var node = this._wrapper._fsManager ? this._wrapper._fsManager.getNode(fileId) : null;

    if (!node) {
      // File was deleted while modal was open
      if (this._previewEditor) {
        this._previewEditor.setValue('// File not found in workspace');
      }
      this._setStatus('warn', 'File not found: id ' + fileId);
      return;
    }

    // Load config into Column 1 (suppress onChange to avoid double-apply)
    var config = (this._wrapper.getFileConfig)
      ? this._wrapper.getFileConfig(fileId)
      : null;

    if (config && this._configEditor) {
      this._suppressConfigChange = true;
      this._configEditor.setValue(JSON.stringify(config, null, 2));
      this._suppressConfigChange = false;
    }

    // Load content into Column 2 (cached edits take priority over VFS content)
    if (this._previewEditor) {
      var content = this._previewContentCache.hasOwnProperty(fileId)
        ? this._previewContentCache[fileId]
        : (node.content || '');

      this._suppressConfigChange = true;  // preview editor doesn't trigger config debounce
      this._previewEditor.setValue(content);
      this._suppressConfigChange = false;
    }

    // Apply config to preview immediately (no debounce on tab switch)
    this._applyConfigToPreview();
  };

  // ── Status bar ────────────────────────────────────────────────────────────

  function _escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  LivePreviewModal.prototype._setStatus = function (type, message) {
    if (!this._statusBarEl) return;
    clearTimeout(this._statusTimer);

    var classMap = {
      ok:    'lp-status-ok',
      warn:  'lp-status-warn',
      error: 'lp-status-error',
      ready: 'lp-status-ready'
    };
    var cls = classMap[type] || 'lp-status-ready';

    this._statusBarEl.innerHTML = '<span class="' + cls + '">' + _escapeHtml(message) + '</span>';

    // Auto-clear green "ok" messages after 2s
    if (type === 'ok') {
      var bar = this._statusBarEl;
      this._statusTimer = setTimeout(function () {
        bar.innerHTML = '<span class="lp-status-ready">Ready</span>';
      }, 2000);
    }
  };

  // ── Apply / Reset buttons ─────────────────────────────────────────────────

  LivePreviewModal.prototype._applyToFile = function () {
    if (!this._wrapper || !this._configEditor) return;

    var raw = this._configEditor.getValue();
    var config;
    try {
      config = JSON.parse(raw);
    } catch (e) {
      this._setStatus('error', 'Cannot apply — JSON parse error: ' + e.message);
      return;
    }

    var result = this._validateConfig(config);

    // Block on type errors (not just unknown-key warnings)
    var typeErrors = result.messages.filter(function (m) {
      return m.indexOf('must be') !== -1;
    });
    if (typeErrors.length > 0) {
      this._setStatus('error', '✗ ' + typeErrors.join('; '));
      return;
    }

    // Apply to main editor
    this._wrapper.applyFileConfig(result.clean);

    // Sync the properties panel
    if (typeof window.__syncPropsPanel === 'function') {
      window.__syncPropsPanel(result.clean);
    }

    this._setStatus('ok', '✓ Applied to file');
  };

  LivePreviewModal.prototype._applyToAll = function () {
    if (!this._wrapper || !this._configEditor) return;

    var raw = this._configEditor.getValue();
    var config;
    try {
      config = JSON.parse(raw);
    } catch (e) {
      this._setStatus('error', 'Cannot apply — JSON parse error: ' + e.message);
      return;
    }

    var result = this._validateConfig(config);

    var typeErrors = result.messages.filter(function (m) {
      return m.indexOf('must be') !== -1;
    });
    if (typeErrors.length > 0) {
      this._setStatus('error', '✗ ' + typeErrors.join('; '));
      return;
    }

    var files = this._wrapper._fsManager ? this._wrapper._fsManager.getAllFiles() : [];
    var count = files.length;

    if (!window.confirm(
      'Apply this configuration to all ' + count + ' file(s)?\n\n' +
      'Note: the "language" key is ignored when applying to all files — ' +
      'each file keeps its own language.'
    )) {
      return;
    }

    // Strip language from the global apply (language is per-file)
    var globalConfig = {};
    Object.keys(result.clean).forEach(function (k) {
      if (k !== 'language') globalConfig[k] = result.clean[k];
    });

    this._wrapper.applyFileConfig(globalConfig);

    if (typeof window.__syncPropsPanel === 'function') {
      window.__syncPropsPanel(globalConfig);
    }

    this._setStatus('ok', '✓ Applied to all ' + count + ' file(s)');
  };

  LivePreviewModal.prototype._resetDefaults = function () {
    if (!this._configEditor) return;
    this._suppressConfigChange = true;
    this._configEditor.setValue(JSON.stringify(DEFAULTS, null, 2));
    this._suppressConfigChange = false;
    // Apply immediately so Column 2 reflects the reset config
    this._applyConfigToPreview();
    this._setStatus('ready', 'Config reset to defaults');
  };

  // ── Open ──────────────────────────────────────────────────────────────────

  LivePreviewModal.prototype.open = function (wrapper) {
    this._wrapper = wrapper;

    // Create DOM on first open
    if (!this._overlay) {
      this._createDom();
    }

    // Show overlay (display:flex, then trigger CSS transition)
    this._overlay.style.display = 'flex';
    /* force reflow */ void this._overlay.offsetHeight; // eslint-disable-line
    this._overlay.classList.add('lp-overlay--open');
    this._isOpen = true;

    // Create Monaco instances on first open (lazy)
    this._initEditors();

    // Determine which tab to open
    var targetId = this._lastTabId;   // may be null first time
    var files    = wrapper._fsManager ? wrapper._fsManager.getAllFiles() : [];
    var validIds = files.map(function (f) { return f.id; });

    if (!targetId || validIds.indexOf(targetId) === -1) {
      // Fall back to the tab currently open in the main editor
      targetId = wrapper._modelManager ? wrapper._modelManager.getActiveFileId() : null;
    }
    if (!targetId && files.length > 0) {
      targetId = files[0].id;
    }

    // Build tab bar and switch to the target tab
    this._activeTabId = null;   // reset so _buildTabs doesn't select stale highlight
    this._buildTabs();

    if (targetId) {
      this._switchTab(targetId);
    } else {
      // No files in workspace
      if (this._configEditor) {
        this._suppressConfigChange = true;
        this._configEditor.setValue(JSON.stringify(DEFAULTS, null, 2));
        this._suppressConfigChange = false;
      }
      if (this._previewEditor) {
        this._previewEditor.setValue('// No files in workspace.\n// Add files using the file panel, then reopen Live Preview.');
      }
      this._setStatus('warn', 'No files in workspace');
    }

    // Call layout() after the CSS open-transition completes
    var self      = this;
    var layoutFn  = function () {
      if (self._configEditor)  self._configEditor.layout();
      if (self._previewEditor) self._previewEditor.layout();
    };
    var triggered = false;
    this._modal.addEventListener('transitionend', function onEnd() {
      triggered = true;
      layoutFn();
      self._modal.removeEventListener('transitionend', onEnd);
    });
    setTimeout(function () { if (!triggered) layoutFn(); }, 250);

    // Resize handler: re-layout both editors when the window is resized
    this._resizeHandler = function () { layoutFn(); };
    window.addEventListener('resize', this._resizeHandler);

    // Keyboard: Escape closes the modal (but not when focus is inside a Monaco widget)
    this._keyHandler = function (e) {
      if (e.key !== 'Escape') return;
      var active = document.activeElement;
      if (active &&
          (self._col1El && self._col1El.contains(active)) ||
          (self._col2El && self._col2El.contains(active))) {
        return; // let Monaco handle it
      }
      self.close();
    };
    document.addEventListener('keydown', this._keyHandler);
  };

  // ── Close ─────────────────────────────────────────────────────────────────

  LivePreviewModal.prototype.close = function () {
    if (!this._overlay || !this._isOpen) return;

    this._overlay.classList.remove('lp-overlay--open');
    this._isOpen = false;

    // Remove global listeners
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }

    // Hide overlay after transition
    var overlay = this._overlay;
    setTimeout(function () { overlay.style.display = 'none'; }, 220);

    // Restore the main editor's theme (monaco.editor.setTheme is global)
    if (this._wrapper && window.monaco) {
      window.monaco.editor.setTheme(this._wrapper.getTheme());
    }

    clearTimeout(this._debounceTimer);
  };

  // ── Destroy ───────────────────────────────────────────────────────────────

  LivePreviewModal.prototype.destroy = function () {
    if (this._isOpen) this.close();

    clearTimeout(this._debounceTimer);
    clearTimeout(this._statusTimer);

    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }

    if (this._configDisposable) {
      this._configDisposable.dispose();
      this._configDisposable = null;
    }
    if (this._configEditor) {
      this._configEditor.dispose();
      this._configEditor = null;
    }
    if (this._previewEditor) {
      this._previewEditor.dispose();
      this._previewEditor = null;
    }
    if (this._overlay && this._overlay.parentNode) {
      this._overlay.parentNode.removeChild(this._overlay);
    }

    this._overlay   = null;
    this._modal     = null;
    this._wrapper   = null;
    this._previewContentCache = {};
  };

  return LivePreviewModal;
}));
