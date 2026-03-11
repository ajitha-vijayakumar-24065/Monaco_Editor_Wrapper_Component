// ─────────────────────────────────────────────────────────────────────────────
// demo.js — Playground logic for the Monaco Editor Wrapper demo page
// ─────────────────────────────────────────────────────────────────────────────
/* global MonacoWrapper, DEFAULT_TOOLBAR_BUTTONS */

(function () {
  'use strict';

  // ── Default starter content per language ──────────────────────────────────
  var STARTER_CODE = {
    javascript: [
      '// Monaco Editor Wrapper — JavaScript Playground',
      '',
      'function greet(name) {',
      '  return `Hello, ${name}!`;',
      '}',
      '',
      'const users = ["Alice", "Bob", "Charlie"];',
      'users.forEach(user => {',
      '  console.log(greet(user));',
      '});',
      '',
      '// Try: Ctrl+F to find, Shift+Alt+F to format, Ctrl+Z to undo'
    ].join('\n'),

    typescript: [
      '// Monaco Editor Wrapper — TypeScript Playground',
      '',
      'interface User {',
      '  id: number;',
      '  name: string;',
      '  email: string;',
      '}',
      '',
      'function getUser(id: number): User {',
      '  return { id, name: "Alice", email: "alice@example.com" };',
      '}',
      '',
      'const user = getUser(1);',
      'console.log(user.name);'
    ].join('\n'),

    json: '{\n  "name": "monaco-wrapper",\n  "version": "1.0.0",\n  "description": "A Monaco Editor wrapper",\n  "scripts": {\n    "demo": "serve . -p 3000"\n  },\n  "keywords": ["monaco", "editor", "wrapper"]\n}',

    sql: [
      '-- Monaco Editor Wrapper — SQL Playground',
      '',
      'SELECT',
      '  u.id,',
      '  u.name,',
      '  u.email,',
      '  COUNT(o.id) AS order_count',
      'FROM users u',
      'LEFT JOIN orders o ON o.user_id = u.id',
      'WHERE u.active = 1',
      'GROUP BY u.id, u.name, u.email',
      'ORDER BY order_count DESC',
      'LIMIT 10;'
    ].join('\n'),

    python: [
      '# Monaco Editor Wrapper — Python Playground',
      '',
      'def greet(name: str) -> str:',
      '    return f"Hello, {name}!"',
      '',
      'users = ["Alice", "Bob", "Charlie"]',
      'for user in users:',
      '    print(greet(user))',
      '',
      'class DataProcessor:',
      '    def __init__(self, data: list):',
      '        self.data = data',
      '',
      '    def process(self):',
      '        return [x * 2 for x in self.data if isinstance(x, (int, float))]'
    ].join('\n'),

    html: [
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<head>',
      '  <meta charset="UTF-8">',
      '  <title>Hello World</title>',
      '</head>',
      '<body>',
      '  <h1>Hello, World!</h1>',
      '  <p>Monaco Editor Wrapper playground</p>',
      '</body>',
      '</html>'
    ].join('\n'),

    css: [
      '/* Monaco Editor Wrapper — CSS Playground */',
      '',
      ':root {',
      '  --primary: #2563eb;',
      '  --text: #1e293b;',
      '}',
      '',
      'body {',
      '  font-family: -apple-system, sans-serif;',
      '  color: var(--text);',
      '  margin: 0;',
      '  padding: 20px;',
      '}',
      '',
      '.container {',
      '  max-width: 960px;',
      '  margin: 0 auto;',
      '}'
    ].join('\n'),

    yaml: [
      '# Monaco Editor Wrapper — YAML Playground',
      '',
      'name: my-application',
      'version: 1.0.0',
      '',
      'services:',
      '  web:',
      '    image: nginx:alpine',
      '    ports:',
      '      - "80:80"',
      '    volumes:',
      '      - ./dist:/usr/share/nginx/html',
      '',
      '  db:',
      '    image: postgres:14',
      '    environment:',
      '      POSTGRES_DB: mydb',
      '      POSTGRES_USER: admin',
      '      POSTGRES_PASSWORD: secret'
    ].join('\n'),

    markdown: [
      '# Monaco Editor Wrapper',
      '',
      'A reusable Monaco Code Editor wrapper in plain JavaScript.',
      '',
      '## Features',
      '',
      '- **30+ editor features** — undo, redo, format, find, and more',
      '- **Custom completions** — register your own IntelliSense providers',
      '- **Live validation** — supply a validation function, get squiggly underlines',
      '- **Theme support** — vs, vs-dark, hc-black, and custom themes',
      '- **Toolbar** — fully configurable with custom buttons',
      '',
      '## Usage',
      '',
      '```js',
      'const wrapper = new MonacoWrapper(container, {',
      '  value: "console.log(\\"hello\\")",',
      '  language: "javascript",',
      '  theme: "vs-dark"',
      '});',
      '```'
    ].join('\n'),

    plaintext: 'Monaco Editor Wrapper — Plain Text Playground\n\nStart typing here...'
  };

  // ── DOM refs ──────────────────────────────────────────────────────────────
  var $  = function (id) { return document.getElementById(id); };
  var $$ = function (sel) { return document.querySelectorAll(sel); };

  // ── State ─────────────────────────────────────────────────────────────────
  var wrapper          = null;
  var tabBar           = null;   // TabBar instance
  var filePanel        = null;   // FilePanel instance
  var livePreviewModal = null;   // LivePreviewModal instance
  var currentLang      = 'javascript';
  var logItems     = [];
  var MAX_LOG      = 80;

  // ── Log utilities ─────────────────────────────────────────────────────────
  function pad(n) { return n < 10 ? '0' + n : n; }

  function timestamp() {
    var d = new Date();
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function log(event, data) {
    var list = $('log-list');
    if (!list) return;

    var item = {
      time:  timestamp(),
      event: event,
      data:  data !== undefined ? JSON.stringify(data).slice(0, 120) : ''
    };
    logItems.unshift(item);
    if (logItems.length > MAX_LOG) logItems.pop();

    var li = document.createElement('li');
    li.innerHTML =
      '<span class="log-time">' + item.time + '</span>' +
      '<span class="log-event">' + escapeHtml(item.event) + '</span>' +
      (item.data ? '<span class="log-data">' + escapeHtml(item.data) + '</span>' : '');
    list.insertBefore(li, list.firstChild);

    // Trim DOM list
    while (list.children.length > MAX_LOG) {
      list.removeChild(list.lastChild);
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function clearLog() {
    logItems = [];
    var list = $('log-list');
    if (list) list.innerHTML = '';
  }

  // ── Status bar update ─────────────────────────────────────────────────────
  function updateStatus(pos, sel) {
    var posEl = $('status-pos');
    var selEl = $('status-sel');
    if (posEl && pos) {
      posEl.textContent = 'Ln ' + pos.lineNumber + ', Col ' + pos.column;
    }
    if (selEl && sel) {
      var len = sel.length || 0;
      selEl.textContent = len > 0 ? len + ' chars selected' : '';
    }
  }

  // ── Build callbacks object ─────────────────────────────────────────────────
  function buildCallbacks() {
    var events = [
      'onChange', 'onUndo', 'onRedo', 'onCut', 'onCopy',
      'onIndent', 'onOutdent', 'onDuplicateLine', 'onToggleComment',
      'onDeleteLine', 'onFind', 'onFormat', 'onReset', 'onThemeChange',
      'onFontSizeChange', 'onWordWrapChange', 'onLineNumbersChange',
      'onBracketMatchingChange', 'onFormatOnTypeChange', 'onAutoSuggestionsChange',
      'onSuggestionsRegistered', 'onMarkersChange', 'onValidation',
      'onShortcutTriggered', 'onLanguageChange', 'onTokenColorsChange',
      'onFileSwitch', 'onFileDirty', 'onFileClean',
      'onFileAdd', 'onFolderAdd', 'onNodeRename', 'onNodeDelete', 'onNodeMove'
    ];

    var cbs = {};

    events.forEach(function (ev) {
      cbs[ev] = function (data) {
        if (ev === 'onChange') {
          // Don't log the full value — just a length indicator
          log(ev, typeof data === 'string' ? '(' + data.length + ' chars)' : data);
        } else {
          log(ev, data);
        }
      };
    });

    cbs.onCursorChange = function (pos) {
      updateStatus(pos, null);
    };

    cbs.onSelectionChange = function (sel) {
      if (wrapper) {
        var selected = wrapper.getSelection();
        updateStatus(wrapper.getPosition(), { length: selected.length });
      }
    };

    return cbs;
  }

  // ── Initialize editor ─────────────────────────────────────────────────────
  function initEditor(opts) {
    // Destroy existing
    if (wrapper) {
      wrapper.destroy();
      wrapper = null;
    }

    var container = $('editor-container');

    // Collect base options from panel
    var panelOpts = collectPanelOptions();

    var options = Object.assign({
      value:    STARTER_CODE[currentLang] || '',
      language: currentLang,
      theme:    'vs',
      callbacks: buildCallbacks(),
      toolbar: {
        show: true,
        buttons: collectToolbarVisibility()
      }
    }, panelOpts, opts || {});

    wrapper = new MonacoWrapper(container, options);

    // Expose wrapper globally for inline onclick handlers in index.html
    if (typeof window.__setWrapper === 'function') {
      window.__setWrapper(wrapper);
    }
    window._wrapper = wrapper;

    // Register demo custom shortcut: Ctrl+Shift+L → log value length
    wrapper.addShortcut({
      id:         'demo.logLength',
      label:      'Log Value Length (Demo)',
      keybinding: 'Ctrl+Shift+L',
      handler:    function () {
        log('custom-shortcut', 'length=' + wrapper.getValue().length);
      }
    });

    // Live Preview shortcut: Ctrl+Shift+P
    wrapper.addShortcut({
      id:         'demo.livePreview',
      label:      'Open Live Preview',
      keybinding: 'Ctrl+Shift+P',
      handler:    function () {
        if (livePreviewModal) livePreviewModal.open(wrapper);
      }
    });

    // Update UI state
    updateWordWrapBtn();
    updateThemeBtn();

    // ── Init TabBar ─────────────────────────────────────────────────────────
    var tabBarEl = $('tab-bar');
    if (tabBarEl && wrapper._modelManager) {
      if (tabBar) { tabBar.destroy(); }
      tabBar = new TabBar(tabBarEl, wrapper._fsManager, wrapper._modelManager, {
        onSwitch: function (fileId) {
          wrapper.openFile(fileId);
          var node = wrapper.getFileNode(fileId);
          if (node) {
            // Sync language UI
            onLanguageChange(node.language || 'javascript');
          }
          if (filePanel) filePanel.setActiveFile(fileId);
          log('tabSwitch', fileId);
        },
        onClose: function (fileId) {
          if (filePanel) filePanel.refresh();
          log('tabClose', fileId);
        },
        onNewFileRequest: function () {
          if (filePanel) {
            filePanel._promptNewFile(null);
            filePanel.refresh();
          }
          if (tabBar) tabBar.refresh();
        }
      });
      tabBar.render();

      // Wire dirty notifications to tab bar
      wrapper._modelManager.onDirtyChange(function (fileId, isDirty) {
        if (tabBar) tabBar.markDirty(fileId, isDirty);
        if (filePanel) filePanel.refresh();
      });
    }

    // ── Init FilePanel ──────────────────────────────────────────────────────
    var filePanelEl = $('file-panel');
    if (filePanelEl && wrapper._fsManager) {
      if (filePanel) { filePanel.destroy(); }
      filePanel = new FilePanel(filePanelEl, wrapper._fsManager, wrapper._modelManager, {
        onOpen: function (fileId) {
          wrapper.openFile(fileId);
          var node = wrapper.getFileNode(fileId);
          if (node) onLanguageChange(node.language || 'javascript');
          if (tabBar) tabBar.refresh();
          if (tabBar) tabBar.setActiveTab(fileId);
          log('fileOpen', fileId);
        },
        onSelect: function (nodeId) {
          log('fileSelect', nodeId);
        }
      });
      filePanel.applyConfig({ visible: true });
    }

    log('init', { language: options.language, theme: options.theme });

    // Re-register any previously loaded libraries into the new wrapper instance
    if (typeof window.__reloadLibraries === 'function') {
      window.__reloadLibraries();
    }
  }

  // ── Collect current panel values ──────────────────────────────────────────
  function collectPanelOptions() {
    var opts = {};

    var fontSize = parseInt($('prop-fontSize').value, 10);
    if (!isNaN(fontSize) && fontSize > 0) opts.fontSize = fontSize;

    opts.theme       = $('prop-theme').value       || 'vs';
    opts.lineNumbers = $('prop-lineNumbers').value  || 'on';
    opts.wordWrap    = $('prop-wordWrap').value     || 'off';
    opts.minimap     = $('prop-minimap').checked;
    opts.formatOnType= $('prop-formatOnType').checked;
    opts.readOnly    = $('prop-readOnly').checked;
    opts.matchBrackets = $('prop-matchBrackets').value || 'always';

    var tabSize = parseInt($('prop-tabSize').value, 10);
    if (!isNaN(tabSize) && tabSize > 0) opts.tabSize = tabSize;

    // Auto-suggestions JSON
    var suggestJson = $('prop-suggestions').value.trim();
    if (suggestJson) {
      try {
        opts.autoSuggestions = JSON.parse(suggestJson);
      } catch (e) {
        showFieldError('prop-suggestions', 'Invalid JSON');
      }
    }

    // Validation function
    var validFnBody = $('prop-validationFn').value.trim();
    if (validFnBody) {
      try {
        /* jshint evil: true */
        opts.validationFn = new Function('value', validFnBody); // eslint-disable-line no-new-func
      } catch (e) {
        showFieldError('prop-validationFn', 'Invalid function: ' + e.message);
      }
    }

    return opts;
  }

  function collectToolbarVisibility() {
    var result = [];
    $$('.tb-vis-chk').forEach(function (chk) {
      result.push({ id: chk.dataset.btnId, visible: chk.checked });
    });
    return result;
  }

  function showFieldError(fieldId, msg) {
    var el = $(fieldId);
    if (el) {
      el.style.borderColor = 'var(--clr-error)';
      setTimeout(function () { el.style.borderColor = ''; }, 2000);
    }
    console.warn('[DemoPage]', msg);
  }

  // ── Apply Changes button ──────────────────────────────────────────────────
  function applyChanges() {
    if (!wrapper) return;

    var panelOpts = collectPanelOptions();

    // Theme
    wrapper.setTheme(panelOpts.theme || 'vs');

    // Font size
    if (panelOpts.fontSize) wrapper.setFontSize(panelOpts.fontSize);

    // Line numbers
    wrapper.setLineNumbers(panelOpts.lineNumbers || 'on');

    // Word wrap
    wrapper.setWordWrap(panelOpts.wordWrap || 'off');

    // Minimap
    wrapper.setMinimap(panelOpts.minimap !== false);

    // Format on type
    wrapper.setFormatOnType(!!panelOpts.formatOnType);

    // Read only
    wrapper.setReadOnly(!!panelOpts.readOnly);

    // Bracket matching
    wrapper.setBracketMatching(panelOpts.matchBrackets || 'always');

    // Tab size
    if (panelOpts.tabSize) wrapper.setTabSize(panelOpts.tabSize);

    // Value override
    var valueOverride = $('prop-value').value;
    if (valueOverride.trim()) {
      wrapper.setValue(valueOverride);
    }

    // Custom suggestions
    if (panelOpts.autoSuggestions && panelOpts.autoSuggestions.length > 0) {
      wrapper.registerSuggestions(wrapper.getLanguage(), panelOpts.autoSuggestions);
    } else {
      wrapper.clearSuggestions(wrapper.getLanguage());
    }

    // Validation fn
    if (panelOpts.validationFn) {
      wrapper.setValidationFn(panelOpts.validationFn);
    } else {
      wrapper.clearValidation();
    }

    // Toolbar visibility
    collectToolbarVisibility().forEach(function (item) {
      if (item.visible) wrapper.showButton(item.id);
      else              wrapper.hideButton(item.id);
    });

    updateWordWrapBtn();
    updateThemeBtn();

    // File view config
    var fvVisible = $('prop-fv-visible') ? $('prop-fv-visible').checked : true;
    if (filePanel) {
      filePanel.applyConfig({ visible: fvVisible });
    }

    log('applyChanges', 'done');
  }

  // ── Button state helpers ───────────────────────────────────────────────────
  function updateWordWrapBtn() {
    if (!wrapper) return;
    var wwVal = wrapper._options && wrapper._options.wordWrap;
    if (wrapper._toolbarManager) {
      wrapper._toolbarManager.setButtonActive('wordWrap', wwVal === 'on');
    }
  }

  function updateThemeBtn() {
    if (!wrapper) return;
    var theme = wrapper.getTheme();
    if (wrapper._toolbarManager) {
      wrapper._toolbarManager.setButtonActive('theme', theme === 'vs-dark');
    }
    // Mirror to select
    var sel = $('prop-theme');
    if (sel) sel.value = theme;
  }

  // ── Language change ────────────────────────────────────────────────────────
  function onLanguageChange(lang) {
    currentLang = lang;
    // Mirror to panel select
    var panelSel = $('prop-language');
    if (panelSel) panelSel.value = lang;

    // Update status bar
    var statusLang = $('status-lang');
    if (statusLang) statusLang.textContent = lang[0].toUpperCase() + lang.slice(1);

    if (wrapper) {
      wrapper.setLanguage(lang);
      // If editor is empty or has default starter, swap content
      var current = wrapper.getValue();
      if (!current || current === STARTER_CODE[lastLang]) {
        wrapper.setValue(STARTER_CODE[lang] || '');
        wrapper.setOriginalValue(STARTER_CODE[lang] || '');
      }
    }
    lastLang = lang;
  }

  var lastLang = 'javascript';

  // ── Build toolbar visibility checkboxes ────────────────────────────────────
  function buildToolbarToggles() {
    var container = $('toolbar-toggles');
    if (!container) return;
    DEFAULT_TOOLBAR_BUTTONS.forEach(function (btn) {
      var label = document.createElement('label');
      label.className = 'toolbar-toggle-item';
      var chk = document.createElement('input');
      chk.type     = 'checkbox';
      chk.checked  = btn.visible;
      chk.dataset.btnId = btn.id;
      chk.className = 'tb-vis-chk';
      label.appendChild(chk);
      label.appendChild(document.createTextNode(btn.label));
      container.appendChild(label);
    });
  }

  // ── Wire up DOM events ─────────────────────────────────────────────────────
  function bindDomEvents() {
    // Language dropdown (top bar)
    var langSel = $('lang-select');
    if (langSel) {
      langSel.addEventListener('change', function () {
        onLanguageChange(this.value);
      });
    }

    // Panel language select (mirrors top bar)
    var panelLangSel = $('prop-language');
    if (panelLangSel) {
      panelLangSel.addEventListener('change', function () {
        var topSel = $('lang-select');
        if (topSel) topSel.value = this.value;
        onLanguageChange(this.value);
      });
    }

    // Panel theme select — live preview
    var themeSel = $('prop-theme');
    if (themeSel) {
      themeSel.addEventListener('change', function () {
        if (wrapper) wrapper.setTheme(this.value);
        // Sync UI dark mode class
        document.body.classList.toggle('dark-ui', this.value === 'vs-dark');
        updateThemeBtn();
      });
    }

    // Apply Changes button
    var applyBtn = $('btn-apply');
    if (applyBtn) {
      applyBtn.addEventListener('click', applyChanges);
    }

    // Reset button
    var resetBtn = $('btn-reset-editor');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        if (wrapper) wrapper.resetContent();
      });
    }

    // Clear log
    var clearLogBtn = $('btn-clear-log');
    if (clearLogBtn) {
      clearLogBtn.addEventListener('click', clearLog);
    }

    // Reinit button
    var reinitBtn = $('btn-reinit');
    if (reinitBtn) {
      reinitBtn.addEventListener('click', function () {
        var lang = ($('lang-select') || { value: 'javascript' }).value;
        currentLang = lang;
        initEditor({
          value: STARTER_CODE[lang] || ''
        });
      });
    }

    // Font size quick-change in top bar
    var fontSizeInput = $('topbar-fontsize');
    if (fontSizeInput) {
      fontSizeInput.addEventListener('change', function () {
        var size = parseInt(this.value, 10);
        if (!isNaN(size) && size > 0) {
          if (wrapper) wrapper.setFontSize(size);
          var panelFS = $('prop-fontSize');
          if (panelFS) panelFS.value = size;
        }
      });
    }

    // Toolbar actions exposed as top-bar buttons
    var actionButtons = {
      'tbtn-undo':      function () { wrapper && wrapper.undo(); },
      'tbtn-redo':      function () { wrapper && wrapper.redo(); },
      'tbtn-format':    function () { wrapper && wrapper.format(); },
      'tbtn-find':      function () { wrapper && wrapper.triggerFind(); },
      'tbtn-theme':     function () { wrapper && wrapper.toggleTheme(); updateThemeBtn(); },
      'tbtn-wordwrap':  function () { wrapper && wrapper.toggleWordWrap(); updateWordWrapBtn(); },
      'tbtn-preview':   function () { livePreviewModal && livePreviewModal.open(wrapper); }
    };

    Object.keys(actionButtons).forEach(function (id) {
      var el = $(id);
      if (!el) return;
      // mousedown fires before the editor loses focus — preventDefault here
      // keeps the editor focused so trigger-based actions (undo, redo, etc.) work.
      el.addEventListener('mousedown', function (e) { e.preventDefault(); });
      el.addEventListener('click', actionButtons[id]);
    });
  }

  // ── Suggestion Generator UI ───────────────────────────────────────────────
  function bindSuggestionGenerator() {

    // ── State ─────────────────────────────────────────────────────────────────
    var sourceList           = [];
    var nextSourceId         = 0;
    var nextPasteId          = 1;  // paste-0 already in DOM
    var mergedSuggestions    = [];
    var mergeStats           = { total: 0, duplicatesRemoved: 0, sourceCount: 0, conflicts: 0 };
    var isGenerating         = false;
    var generatedSuggestions = null; // pre-edit snapshot
    var editedText           = '';
    var parsedSuggestions    = null;
    var validationError      = null;
    var isDirty              = false;
    var isApplied            = false;
    var nestedEditor         = null;
    var _validateTimer       = null;
    var MAX_SOURCES          = 20;
    var VALID_KINDS = ['function','method','variable','constant','class','interface','enum',
                       'enumMember','property','module','keyword','value','text',
                       'constructor','field','struct','event','operator','unit',
                       'color','file','reference','folder','typeParameter','snippet','decorator','type'];
    var VALID_EXTS  = ['.js','.ts','.jsx','.tsx','.mjs','.json','.css','.scss','.less',
                       '.sql','.yaml','.yml','.env','.md','.markdown','.txt'];

    // ── DOM refs ──────────────────────────────────────────────────────────────
    var sgDropZone       = $('sg-drop-zone');
    var sgFileInput      = $('sg-file-input');
    var sgPasteBlocks    = $('sg-paste-blocks');
    var sgAddPasteBtn    = $('sg-add-paste-btn');
    var sgSourceList     = $('sg-source-list');
    var sgMergeSummary   = $('sg-merge-summary');
    var sgGenerateBtn    = $('sg-generate-btn');
    var sgClearBtn       = $('sg-clear-suggestions-btn');
    var sgEditorToolbar  = $('sg-editor-toolbar');
    var sgEditorWrap     = $('sg-editor-wrap');
    var sgValidationBar  = $('sg-validation-bar');
    var sgEditorStatus   = $('sg-editor-status');
    var sgApplyBtn       = $('sg-apply-btn');
    var sgFmtBtn         = $('sg-fmt-btn');
    var sgResetBtn       = $('sg-reset-btn');
    var sgClearEditorBtn = $('sg-clear-editor-btn');
    var sgCopyBtn        = $('sg-copy-btn');
    var sgAddItemBtn     = $('sg-add-item-btn');

    if (!sgGenerateBtn) return;

    // ── Language helpers ──────────────────────────────────────────────────────
    function sniffLanguage(text) {
      var t = text.trim();
      if (!t) return 'text';
      if (t.charAt(0) === '{' || t.charAt(0) === '[') {
        try { JSON.parse(t); return 'json'; } catch (e) {}
      }
      if (/\b(SELECT|INSERT\s+INTO|CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE)\b/i.test(t)) return 'sql';
      if (/[.#][\w-]+\s*\{|--[\w-]+\s*:/.test(t)) return 'css';
      if (/\b(function\s+\w|const\s+\w|let\s+\w|var\s+\w|=>)/.test(t)) return 'js';
      return 'text';
    }

    function extToLang(filename) {
      if (typeof SuggestionGenerator !== 'undefined') {
        return SuggestionGenerator.detectLanguage(filename, '') || 'text';
      }
      var ext = (filename.match(/\.\w+$/) || [''])[0].toLowerCase();
      var map = { '.js':'js','.ts':'js','.jsx':'js','.tsx':'js','.mjs':'js',
        '.json':'json','.css':'css','.scss':'css','.less':'css',
        '.sql':'sql','.yaml':'yaml','.yml':'yaml','.env':'yaml',
        '.md':'text','.markdown':'text','.txt':'text' };
      return map[ext] || 'text';
    }

    // ── Source list management ────────────────────────────────────────────────
    function addSource(entry) {
      if (sourceList.length >= MAX_SOURCES) {
        showDropWarning('Maximum ' + MAX_SOURCES + ' sources allowed. Additional files skipped.');
        return;
      }
      if (entry.type === 'file') {
        for (var i = 0; i < sourceList.length; i++) {
          if (sourceList[i].type === 'file' && sourceList[i].name === entry.name) {
            showDropWarning('"' + entry.name + '" is already in the list.');
            return;
          }
        }
      }
      sourceList.push(entry);
      renderSourceList();
    }

    function removeSource(id) {
      for (var i = 0; i < sourceList.length; i++) {
        if (sourceList[i].id === id) { sourceList.splice(i, 1); break; }
      }
      renderSourceList();
    }

    function renderSourceList() {
      if (!sgSourceList) return;
      sgSourceList.innerHTML = '';
      if (sourceList.length === 0) {
        sgSourceList.innerHTML = '<div style="font-size:11px;color:var(--clr-text-muted);padding:4px 0">No sources added yet.</div>';
        return;
      }
      sourceList.forEach(function (src) {
        var row = document.createElement('div');
        row.className = 'sg-source-row';
        row.dataset.id = src.id;
        var icon = src.type === 'file' ? '\uD83D\uDCC4' : '\uD83D\uDCCB';
        var statusText = src.status === 'pending'     ? 'Pending'
          : src.status === 'processing' ? 'Processing\u2026'
          : src.status === 'done'       ? 'Done (' + (src.suggestions ? src.suggestions.length : 0) + ')'
          : 'Error';
        row.innerHTML =
          '<span class="sg-source-icon">' + icon + '</span>' +
          '<span class="sg-source-name" title="' + src.name + '">' + src.name + '</span>' +
          '<span class="sg-lang-chip">' + (src.language || '?').toUpperCase() + '</span>' +
          '<span class="sg-source-status sg-status-' + src.status + '">' + statusText + '</span>' +
          (src.status === 'error' && src.error
            ? '<span class="sg-source-error-msg" title="' + src.error + '">' + src.error.slice(0, 30) + '</span>'
            : '') +
          (src.status === 'done' && src.suggestions && src.suggestions.length > 0
            ? '<a href="#" class="sg-preview-link" data-id="' + src.id + '">Preview</a>'
            : '') +
          '<button class="sg-remove-btn" data-id="' + src.id + '" title="Remove">\u00D7</button>';
        sgSourceList.appendChild(row);

        // Per-source inline preview
        var previewEl = document.createElement('pre');
        previewEl.className = 'sg-source-preview-inline';
        previewEl.dataset.id = src.id;
        previewEl.style.display = 'none';
        if (src.suggestions && src.suggestions.length) {
          previewEl.textContent = JSON.stringify(src.suggestions.slice(0, 5), null, 2) +
            (src.suggestions.length > 5 ? '\n\n\u2026 and ' + (src.suggestions.length - 5) + ' more' : '');
        }
        sgSourceList.appendChild(previewEl);
      });

      sgSourceList.querySelectorAll('.sg-remove-btn').forEach(function (btn) {
        btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
        btn.addEventListener('click', function () { removeSource(parseInt(this.dataset.id, 10)); });
      });
      sgSourceList.querySelectorAll('.sg-preview-link').forEach(function (link) {
        link.addEventListener('click', function (e) {
          e.preventDefault();
          var pre = sgSourceList.querySelector('pre[data-id="' + this.dataset.id + '"]');
          if (pre) pre.style.display = pre.style.display === 'none' ? '' : 'none';
        });
      });
    }

    function showDropWarning(msg) {
      var warn = $('sg-drop-warning');
      if (!warn) return;
      warn.textContent = msg;
      warn.style.display = '';
      clearTimeout(warn._timer);
      warn._timer = setTimeout(function () { warn.style.display = 'none'; }, 4000);
    }

    // ── File reading ──────────────────────────────────────────────────────────
    function readFilesAndAdd(files) {
      Array.prototype.forEach.call(files, function (file) {
        var ext = (file.name.match(/\.\w+$/) || [''])[0].toLowerCase();
        if (VALID_EXTS.indexOf(ext) === -1) {
          showDropWarning('"' + file.name + '" has unsupported type, skipped.');
          return;
        }
        if (sourceList.length >= MAX_SOURCES) {
          showDropWarning('Maximum ' + MAX_SOURCES + ' sources allowed.'); return;
        }
        for (var i = 0; i < sourceList.length; i++) {
          if (sourceList[i].type === 'file' && sourceList[i].name === file.name) {
            showDropWarning('"' + file.name + '" is already in the list.'); return;
          }
        }
        var lang  = extToLang(file.name);
        var entry = { id: nextSourceId++, type: 'file', name: file.name,
          content: '', language: lang, status: 'pending', suggestions: [], error: null };
        var reader = new FileReader();
        reader.onload = function (e) {
          entry.content = e.target.result;
          addSource(entry);
        };
        reader.onerror = function () {
          entry.content = ''; entry.status = 'error'; entry.error = 'Could not read file';
          addSource(entry);
        };
        reader.readAsText(file);
      });
    }

    // ── Drop zone ─────────────────────────────────────────────────────────────
    if (sgDropZone) {
      sgDropZone.addEventListener('click', function () { if (sgFileInput) sgFileInput.click(); });
      sgDropZone.addEventListener('dragover', function (e) {
        e.preventDefault(); e.stopPropagation();
        sgDropZone.classList.add('drag-over');
        var lbl = $('sg-drop-label');
        if (lbl) lbl.textContent = 'Release to add files';
      });
      sgDropZone.addEventListener('dragleave', function () {
        sgDropZone.classList.remove('drag-over');
        var lbl = $('sg-drop-label');
        if (lbl) lbl.textContent = 'Drop files here or click to browse';
      });
      sgDropZone.addEventListener('drop', function (e) {
        e.preventDefault(); e.stopPropagation();
        sgDropZone.classList.remove('drag-over');
        var lbl = $('sg-drop-label');
        if (lbl) lbl.textContent = 'Drop files here or click to browse';
        readFilesAndAdd(e.dataTransfer.files);
      });
    }

    if (sgFileInput) {
      sgFileInput.addEventListener('change', function () {
        if (this.files && this.files.length) readFilesAndAdd(this.files);
        this.value = '';
      });
    }

    // ── Paste blocks ──────────────────────────────────────────────────────────
    function buildPasteBlock(pasteId) {
      var div = document.createElement('div');
      div.className = 'sg-paste-block';
      div.dataset.pasteId = pasteId;
      div.innerHTML =
        '<div class="sg-paste-block-header">' +
          '<input type="text" class="sg-paste-label" placeholder="Label (optional)" />' +
          '<select class="sg-paste-lang">' +
            '<option value="">Auto-detect</option>' +
            '<option value="js">JS / TS</option>' +
            '<option value="json">JSON</option>' +
            '<option value="css">CSS / SCSS</option>' +
            '<option value="sql">SQL</option>' +
            '<option value="yaml">YAML / ENV</option>' +
            '<option value="text">Plain Text / MD</option>' +
          '</select>' +
          '<button class="btn btn-secondary sg-paste-remove" title="Remove paste block">\u00D7</button>' +
        '</div>' +
        '<textarea class="sg-paste-text" rows="3" placeholder="Paste content here\u2026"></textarea>';
      return div;
    }

    function bindPasteBlock(blockEl) {
      var removeBtn = blockEl.querySelector('.sg-paste-remove');
      if (removeBtn) {
        removeBtn.addEventListener('mousedown', function (e) { e.preventDefault(); });
        removeBtn.addEventListener('click', function () {
          var pasteId = blockEl.dataset.pasteId;
          for (var i = 0; i < sourceList.length; i++) {
            if (sourceList[i].pasteId === pasteId) { sourceList.splice(i, 1); break; }
          }
          var blocks = sgPasteBlocks ? sgPasteBlocks.querySelectorAll('.sg-paste-block') : [];
          if (blocks.length <= 1) {
            blockEl.querySelector('.sg-paste-text').value  = '';
            blockEl.querySelector('.sg-paste-label').value = '';
            renderSourceList();
            return;
          }
          blockEl.parentNode.removeChild(blockEl);
          renderSourceList();
        });
      }

      var textArea  = blockEl.querySelector('.sg-paste-text');
      var langSel   = blockEl.querySelector('.sg-paste-lang');
      var labelIn   = blockEl.querySelector('.sg-paste-label');
      var _debTimer = null;

      function syncPasteSource() {
        var pasteId = blockEl.dataset.pasteId;
        var text    = textArea ? textArea.value : '';
        var lang    = (langSel && langSel.value) ? langSel.value : sniffLanguage(text);
        var label   = (labelIn && labelIn.value.trim()) ? labelIn.value.trim() : ('Paste ' + pasteId);
        var idx = -1;
        for (var i = 0; i < sourceList.length; i++) {
          if (sourceList[i].pasteId === pasteId) { idx = i; break; }
        }
        if (!text.trim()) {
          if (idx !== -1) { sourceList.splice(idx, 1); renderSourceList(); }
          return;
        }
        var entry = { id: idx !== -1 ? sourceList[idx].id : nextSourceId++,
          type: 'paste', name: label, content: text, language: lang,
          status: 'pending', suggestions: [], error: null, pasteId: pasteId };
        if (idx !== -1) { sourceList[idx] = entry; }
        else {
          if (sourceList.length >= MAX_SOURCES) {
            showDropWarning('Maximum ' + MAX_SOURCES + ' sources allowed.'); return;
          }
          sourceList.push(entry);
        }
        renderSourceList();
      }

      if (textArea) {
        textArea.addEventListener('input', function () {
          clearTimeout(_debTimer); _debTimer = setTimeout(syncPasteSource, 500);
        });
        textArea.addEventListener('blur', syncPasteSource);
      }
      if (langSel) langSel.addEventListener('change', syncPasteSource);
      if (labelIn) labelIn.addEventListener('blur',   syncPasteSource);
    }

    if (sgPasteBlocks) {
      var firstBlock = sgPasteBlocks.querySelector('.sg-paste-block');
      if (firstBlock) bindPasteBlock(firstBlock);
    }

    if (sgAddPasteBtn) {
      sgAddPasteBtn.addEventListener('mousedown', function (e) { e.preventDefault(); });
      sgAddPasteBtn.addEventListener('click', function () {
        var newId    = 'paste-' + nextPasteId++;
        var newBlock = buildPasteBlock(newId);
        if (sgPasteBlocks) sgPasteBlocks.appendChild(newBlock);
        bindPasteBlock(newBlock);
        newBlock.querySelector('.sg-paste-text').focus();
      });
    }

    // ── Nested Monaco editor ──────────────────────────────────────────────────
    function ensureNestedEditor() {
      if (nestedEditor) return;
      if (!sgEditorWrap || typeof monaco === 'undefined') return;
      nestedEditor = monaco.editor.create(sgEditorWrap, {
        language:             'json',
        theme:                (wrapper ? wrapper.getTheme() : 'vs-dark'),
        minimap:              { enabled: false },
        lineNumbers:          'on',
        scrollBeyondLastLine: false,
        wordWrap:             'on',
        readOnly:             false,
        automaticLayout:      true,
        fontSize:             12,
        tabSize:              2,
        folding:              true,
        glyphMargin:          false,
        renderLineHighlight:  'none',
        overviewRulerLanes:   0
      });
      nestedEditor.onDidChangeModelContent(function () {
        editedText = nestedEditor.getValue();
        isDirty    = true;
        isApplied  = false;
        clearTimeout(_validateTimer);
        _validateTimer = setTimeout(function () {
          applyValidationResult(validateSuggestionJSON(editedText));
        }, 400);
      });
    }

    // ── Validation ────────────────────────────────────────────────────────────
    function friendlyParseError(e) {
      var m   = e.message || String(e);
      var pos = m.match(/position (\d+)/);
      if (pos) {
        var lines = editedText.slice(0, parseInt(pos[1], 10)).split('\n');
        return m + ' (line ' + lines.length + ')';
      }
      return m;
    }

    function validateSuggestionJSON(text) {
      if (!text || !text.trim()) {
        return { valid: false, error: '\u274C Editor is empty \u2014 nothing to apply', parsed: null, itemErrors: [] };
      }
      var parsed;
      try { parsed = JSON.parse(text); }
      catch (e) {
        return { valid: false, error: '\u274C Invalid JSON \u2014 ' + friendlyParseError(e), parsed: null, itemErrors: [] };
      }
      if (!Array.isArray(parsed)) {
        return { valid: false, error: '\u274C Expected a JSON array, got ' + typeof parsed, parsed: null, itemErrors: [] };
      }
      if (parsed.length === 0) {
        return { valid: true, warning: '\u26A0 Array is empty \u2014 no suggestions to apply',
          error: null, parsed: parsed, itemErrors: [] };
      }
      var itemErrors = [];
      parsed.forEach(function (item, i) {
        if (!item || typeof item !== 'object') {
          itemErrors.push({ index: i, message: 'Item ' + (i+1) + ' is not an object', severity: 8 }); return;
        }
        if (!item.label || typeof item.label !== 'string' || !item.label.trim())
          itemErrors.push({ index: i, field: 'label',
            message: 'Item ' + (i+1) + ': missing required field "label"', severity: 8 });
        if (!item.insertText || typeof item.insertText !== 'string' || !item.insertText.trim())
          itemErrors.push({ index: i, field: 'insertText',
            message: 'Item ' + (i+1) + ': missing required field "insertText"', severity: 8 });
        if (item.kind !== undefined && VALID_KINDS.indexOf(item.kind) === -1)
          itemErrors.push({ index: i, field: 'kind',
            message: 'Item ' + (i+1) + ': unrecognised "kind" value "' + item.kind + '"', severity: 8 });
        if (item.detail !== undefined && typeof item.detail !== 'string')
          itemErrors.push({ index: i, field: 'detail',
            message: 'Item ' + (i+1) + ': "detail" must be a string', severity: 4 });
        if (item.documentation !== undefined && typeof item.documentation !== 'string')
          itemErrors.push({ index: i, field: 'documentation',
            message: 'Item ' + (i+1) + ': "documentation" must be a string', severity: 4 });
      });
      var hasError = itemErrors.some(function (e) { return e.severity === 8; });
      return {
        valid: !hasError,
        warning: (!hasError && itemErrors.length > 0) ? itemErrors[0].message : null,
        error: hasError ? itemErrors.filter(function (e) { return e.severity === 8; })[0].message : null,
        parsed: hasError ? null : parsed,
        itemErrors: itemErrors
      };
    }

    function applyValidationResult(result) {
      parsedSuggestions = result.parsed || null;
      validationError   = result.error  || null;

      if (sgValidationBar) {
        sgValidationBar.className = 'sg-validation-bar';
        if (result.error) {
          sgValidationBar.className += ' error';
          sgValidationBar.textContent = result.error;
        } else if (result.warning) {
          sgValidationBar.className += ' warning';
          sgValidationBar.textContent = result.warning;
        } else {
          sgValidationBar.className += ' valid';
          var cnt = result.parsed ? result.parsed.length : 0;
          sgValidationBar.textContent = '\u2705 Valid \u2014 ' + cnt + ' suggestion' + (cnt === 1 ? '' : 's') + ' ready';
        }
      }

      // Monaco markers on nested editor
      if (nestedEditor && typeof monaco !== 'undefined') {
        var model = nestedEditor.getModel();
        if (model) {
          var markers = [];
          if (result.itemErrors && result.itemErrors.length) {
            var lines     = editedText.split('\n');
            var depth     = 0;
            var itemIdx   = -1;
            var itemLines = [];
            lines.forEach(function (line, li) {
              if (depth === 1 && line.trim().charAt(0) === '{') { itemIdx++; itemLines[itemIdx] = li + 1; }
              for (var ci = 0; ci < line.length; ci++) {
                var ch = line[ci];
                if (ch === '{' || ch === '[') depth++;
                else if (ch === '}' || ch === ']') depth--;
              }
            });
            result.itemErrors.forEach(function (ie) {
              markers.push({
                startLineNumber: itemLines[ie.index] || 1, startColumn: 1,
                endLineNumber:   itemLines[ie.index] || 1, endColumn: 1000,
                message: ie.message, severity: ie.severity
              });
            });
          }
          monaco.editor.setModelMarkers(model, 'suggestion-validator', markers);
        }
      }

      if (sgApplyBtn) sgApplyBtn.disabled = !result.valid || (result.parsed !== null && result.parsed.length === 0);
      updateEditorStatus();
      updateApplyIndicator();
    }

    function updateEditorStatus() {
      if (!sgEditorStatus) return;
      var text  = editedText || '';
      var items = parsedSuggestions ? parsedSuggestions.length : '?';
      sgEditorStatus.textContent = items + ' items \u00B7 ' + text.split('\n').length + ' lines \u00B7 ' + text.length + ' chars';
    }

    function updateApplyIndicator() {
      var indicator = $('sg-unapplied-indicator');
      if (indicator) indicator.style.display = (isDirty && isApplied) ? '' : 'none';
    }

    // ── Generate ──────────────────────────────────────────────────────────────
    function processSingleSource(src) {
      // Prefer new per-language analyzers (extends SuggestionGenerator)
      if (typeof AnalyzerEngine !== 'undefined' && typeof SuggestionMapper !== 'undefined') {
        try {
          var symbols = AnalyzerEngine.analyze(src.content, {
            filename:       src.name || '',
            language:       src.language || null,
            includePrivate: true,
            snippetStyle:   'tabstop',
            maxDepth:       Infinity,
            minified:       'skip'
          });
          return Promise.resolve(SuggestionMapper.map(symbols, { snippetStyle: 'tabstop' }));
        } catch (e) {
          console.error('[processSingleSource] AnalyzerEngine error, falling back:', e);
        }
      }
      // Fallback: original SuggestionGenerator pipeline
      if (typeof SuggestionGenerator === 'undefined')
        return Promise.reject(new Error('SuggestionGenerator module not loaded'));
      return Promise.resolve(
        SuggestionGenerator.fromText(src.content, { language: src.language || null, filename: src.name || '' })
      );
    }

    sgGenerateBtn.addEventListener('mousedown', function (e) { e.preventDefault(); });
    sgGenerateBtn.addEventListener('click', function () {
      if (isGenerating) return;
      if (sourceList.length === 0) {
        showDropWarning('Add at least one file or paste block first.');
        return;
      }
      if (isDirty && generatedSuggestions !== null) {
        if (!confirm('You have unsaved edits. Regenerate and overwrite your changes?')) return;
      }
      isGenerating = true;
      sgGenerateBtn.textContent = '\u27F3 Generating\u2026';
      sgGenerateBtn.disabled    = true;

      sourceList.forEach(function (src) { src.status = 'processing'; src.suggestions = []; src.error = null; });
      renderSourceList();

      var promises = sourceList.map(function (src, idx) {
        return processSingleSource(src)
          .then(function (suggestions) {
            sourceList[idx].suggestions = suggestions;
            sourceList[idx].status      = 'done';
            renderSourceList();
          })
          .catch(function (err) {
            sourceList[idx].status = 'error';
            sourceList[idx].error  = err.message || 'Unknown error';
            sourceList[idx].suggestions = [];
            renderSourceList();
          });
      });

      Promise.all(promises).then(function () {
        isGenerating = false;
        sgGenerateBtn.textContent = 'Generate Suggestions';
        sgGenerateBtn.disabled    = false;
        mergeSources();
      });
    });

    function mergeSources() {
      // Collect per-source arrays for SuggestionMerger
      var successGroups = [];
      var successCount  = 0;
      sourceList.forEach(function (src) {
        if (src.status !== 'done' || !src.suggestions || !src.suggestions.length) return;
        successCount++;
        successGroups.push(src.suggestions);
      });

      // Use SuggestionMerger for dedup by label+kind
      var mergeResult;
      if (typeof SuggestionMerger !== 'undefined') {
        mergeResult = SuggestionMerger.merge(successGroups, {
          deduplicateBy: 'label+kind',
          tagWithSource: true,
          maxItems:      1000
        });
        mergedSuggestions = mergeResult.suggestions;
        mergeStats        = mergeResult.stats;
      } else {
        // Fallback: simple concat
        var fallback = [];
        successGroups.forEach(function (arr) { fallback = fallback.concat(arr); });
        mergedSuggestions = fallback;
        mergeStats = { total: fallback.length, duplicatesRemoved: 0, sourceCount: successCount, conflicts: 0 };
      }

      if (sgMergeSummary) {
        var txt = typeof SuggestionMerger !== 'undefined'
          ? SuggestionMerger.summaryText(mergeStats)
          : ('Merged ' + successCount + ' source' + (successCount === 1 ? '' : 's') +
             ' \u2192 ' + mergedSuggestions.length + ' suggestion' + (mergedSuggestions.length === 1 ? '' : 's'));
        sgMergeSummary.textContent = txt;
        sgMergeSummary.style.display = '';
      }

      if (sgClearBtn) sgClearBtn.style.display = '';

      if (mergedSuggestions.length === 0) {
        [sgEditorToolbar, sgEditorWrap, sgValidationBar, sgEditorStatus, sgApplyBtn].forEach(function (el) {
          if (el) el.style.display = 'none';
        });
        return;
      }

      ensureNestedEditor();
      var json = JSON.stringify(mergedSuggestions, null, 2);
      editedText = json;
      if (nestedEditor) nestedEditor.setValue(json);
      generatedSuggestions = mergedSuggestions.slice();
      isDirty   = false;
      isApplied = false;

      if (sgEditorToolbar) sgEditorToolbar.style.display = '';
      if (sgEditorWrap)    sgEditorWrap.style.display    = '';
      if (sgValidationBar) sgValidationBar.style.display = '';
      if (sgEditorStatus)  sgEditorStatus.style.display  = '';
      if (sgApplyBtn)    { sgApplyBtn.style.display = ''; sgApplyBtn.disabled = false; }

      applyValidationResult(validateSuggestionJSON(json));
      log('sgGenerate', { count: mergedSuggestions.length, sources: successCount });
    }

    // ── Toolbar buttons ───────────────────────────────────────────────────────
    [sgFmtBtn, sgResetBtn, sgClearEditorBtn, sgCopyBtn, sgAddItemBtn].forEach(function (b) {
      if (b) b.addEventListener('mousedown', function (e) { e.preventDefault(); });
    });

    if (sgFmtBtn) {
      sgFmtBtn.addEventListener('click', function () {
        var text = nestedEditor ? nestedEditor.getValue() : '';
        try {
          if (nestedEditor) nestedEditor.setValue(JSON.stringify(JSON.parse(text), null, 2));
        } catch (e) {
          if (sgValidationBar) {
            sgValidationBar.className = 'sg-validation-bar error';
            sgValidationBar.textContent = '\u274C Cannot format \u2014 fix JSON errors first';
          }
        }
      });
    }

    if (sgResetBtn) {
      sgResetBtn.addEventListener('click', function () {
        if (!generatedSuggestions) return;
        if (isDirty && !confirm('Revert to the last generated output?')) return;
        var json = JSON.stringify(generatedSuggestions, null, 2);
        if (nestedEditor) nestedEditor.setValue(json);
        isDirty = false;
        applyValidationResult(validateSuggestionJSON(json));
      });
    }

    if (sgClearEditorBtn) {
      sgClearEditorBtn.addEventListener('click', function () {
        if (nestedEditor) nestedEditor.setValue('');
        isDirty = true; isApplied = false; parsedSuggestions = null;
        if (sgApplyBtn) sgApplyBtn.disabled = true;
        if (sgValidationBar) {
          sgValidationBar.className = 'sg-validation-bar error';
          sgValidationBar.textContent = '\u274C Editor is empty \u2014 nothing to apply';
        }
        updateEditorStatus();
      });
    }

    if (sgCopyBtn) {
      sgCopyBtn.addEventListener('click', function () {
        var text = nestedEditor ? nestedEditor.getValue() : '';
        var cb   = sgCopyBtn;
        function flash() { cb.textContent = '\u2713 Copied!'; setTimeout(function () { cb.textContent = 'Copy'; }, 1500); }
        if (navigator.clipboard) {
          navigator.clipboard.writeText(text).then(flash).catch(function () {
            var t = document.createElement('textarea');
            t.value = text; document.body.appendChild(t); t.select();
            document.execCommand('copy'); document.body.removeChild(t); flash();
          });
        } else {
          var t = document.createElement('textarea');
          t.value = text; document.body.appendChild(t); t.select();
          document.execCommand('copy'); document.body.removeChild(t); flash();
        }
      });
    }

    if (sgAddItemBtn) {
      sgAddItemBtn.addEventListener('click', function () {
        var text = nestedEditor ? nestedEditor.getValue() : '';
        var parsed;
        try { parsed = JSON.parse(text); } catch (e) {
          if (sgValidationBar) {
            sgValidationBar.className = 'sg-validation-bar error';
            sgValidationBar.textContent = '\u274C Fix JSON errors before adding items';
          }
          return;
        }
        if (!Array.isArray(parsed)) parsed = [];
        parsed.push({ label: '', detail: '', insertText: '', kind: 'function', documentation: '' });
        if (nestedEditor) nestedEditor.setValue(JSON.stringify(parsed, null, 2));
      });
    }

    // ── Apply ─────────────────────────────────────────────────────────────────
    if (sgApplyBtn) {
      sgApplyBtn.addEventListener('mousedown', function (e) { e.preventDefault(); });
      sgApplyBtn.addEventListener('click', function () {
        var text   = nestedEditor ? nestedEditor.getValue() : '';
        var result = validateSuggestionJSON(text);
        if (!result.valid) { applyValidationResult(result); return; }
        if (!result.parsed || result.parsed.length === 0) {
          if (sgValidationBar) {
            sgValidationBar.className = 'sg-validation-bar warning';
            sgValidationBar.textContent = '\u26A0 No suggestions to apply \u2014 array is empty';
          }
          return;
        }
        if (!wrapper) { alert('Editor not initialised yet.'); return; }
        wrapper.registerSuggestions(wrapper.getLanguage(), result.parsed);
        isApplied = true; isDirty = false;
        log('sgApply', { count: result.parsed.length });
        sgApplyBtn.textContent = '\u2713 Applied! (' + result.parsed.length + ')';
        setTimeout(function () { sgApplyBtn.textContent = 'Apply to Editor'; }, 1800);
        if (sgValidationBar) {
          sgValidationBar.className = 'sg-validation-bar valid';
          sgValidationBar.textContent = '\u2705 ' + result.parsed.length + ' suggestions applied to editor';
        }
        updateApplyIndicator();
      });
    }

    // ── Clear All ─────────────────────────────────────────────────────────────
    if (sgClearBtn) {
      sgClearBtn.addEventListener('mousedown', function (e) { e.preventDefault(); });
      sgClearBtn.addEventListener('click', function () {
        if (wrapper) wrapper.clearSuggestions(wrapper.getLanguage());
        sourceList = [];
        renderSourceList();
        if (sgPasteBlocks) {
          sgPasteBlocks.innerHTML = '';
          nextPasteId = 1;
          var fresh = buildPasteBlock('paste-0');
          sgPasteBlocks.appendChild(fresh);
          bindPasteBlock(fresh);
        }
        if (nestedEditor) nestedEditor.setValue('');
        mergedSuggestions = []; generatedSuggestions = null;
        editedText = ''; parsedSuggestions = null; validationError = null;
        isDirty = false; isApplied = false;
        [sgEditorToolbar, sgEditorWrap, sgValidationBar, sgEditorStatus, sgApplyBtn, sgMergeSummary].forEach(function (el) {
          if (el) el.style.display = 'none';
        });
        if (sgClearBtn)  sgClearBtn.style.display  = 'none';
        if (sgFileInput) sgFileInput.value = '';
        log('sgClear', {});
      });
    }

    // Initial source list render
    renderSourceList();
  }

  // ── Bind File View panel events ──────────────────────────────────────────
  function bindFileViewEvents() {
    var visChk = $('prop-fv-visible');
    if (visChk) {
      visChk.addEventListener('change', function () {
        if (filePanel) filePanel.applyConfig({ visible: visChk.checked });
      });
    }
  }

  // ── Library Manager UI ─────────────────────────────────────────────────────
  // Persists loaded library content across editor re-inits
  var _loadedLibSources = []; // [{ libId, filename, text }]

  function bindLibraryManager() {
    var libDropZone   = $('lib-drop-zone');
    var libFileInput  = $('lib-file-input');
    var libDropWarn   = $('lib-drop-warning');

    if (!libDropZone || !libFileInput) return;

    function showLibWarn(msg) {
      if (!libDropWarn) return;
      libDropWarn.textContent = msg;
      libDropWarn.style.display = msg ? '' : 'none';
    }

    function renderLibList() {
      var listEl = $('lib-list');
      if (!listEl) return;

      if (!wrapper || !wrapper.getLoadedLibraries) {
        listEl.innerHTML = '<div style="font-size:11px;opacity:0.6">No editor active.</div>';
        return;
      }

      var libs = wrapper.getLoadedLibraries();
      if (!libs.length) {
        listEl.innerHTML = '<div style="font-size:11px;opacity:0.6">No libraries loaded yet.</div>';
        return;
      }

      listEl.innerHTML = '';
      libs.forEach(function (lib) {
        var card = document.createElement('div');
        card.className   = 'lib-card';
        card.dataset.libId = lib.libId;

        // Header
        var hdr = document.createElement('div');
        hdr.className = 'lib-card-header';
        hdr.innerHTML =
          '<span class="lib-card-name" title="' + lib.libId + '">' + lib.filename + '</span>' +
          '<span class="lib-card-badge">' + lib.symbolCount + ' symbols</span>' +
          '<span class="lib-card-dts-size">' + (lib.dtsLength > 0 ? (lib.dtsLength / 1024).toFixed(1) + ' KB' : 'empty') + ' .d.ts</span>' +
          '<button class="lib-card-remove" data-libid="' + lib.libId + '" title="Remove library">\u00D7</button>';
        card.appendChild(hdr);

        // Symbols toggle
        var details = document.createElement('details');
        var summary = document.createElement('summary');
        summary.style.cssText = 'font-size:11px;cursor:pointer;user-select:none;margin-top:4px;opacity:0.75';
        summary.textContent = 'Show symbols & .d.ts';
        details.appendChild(summary);

        // Symbol tree (built on open)
        var treeEl = document.createElement('div');
        treeEl.className = 'lib-symbol-tree';
        details.addEventListener('toggle', function () {
          if (!details.open || treeEl.dataset.loaded) return;
          treeEl.dataset.loaded = '1';
          if (!wrapper) return;

          // Symbols
          var entry = wrapper._extraLibManager && wrapper._extraLibManager.getLib(lib.libId);
          var symbols = entry ? entry.symbols : [];
          if (symbols.length) {
            var topLevel = symbols.filter(function (s) { return !s.memberOf; });
            var symHtml = topLevel.map(function (s) {
              var icon = { function: '\u0192', class: '\u25A6', variable: '\u03B1', method: '\u03BB', property: '\u25B8', module: '\uD83D\uDCE6', constant: '\u03BA' }[s.kind] || '\u25A1';
              var nested = (s.nested || []).filter(function (n) { return n.name && n.kind; });
              var nestedHtml = nested.length
                ? '<div class="lib-symbol-nested">' + nested.map(function (n) {
                    var nIcon = { method: '\u03BB', function: '\u0192', property: '\u25B8' }[n.kind] || '\u25A1';
                    var typeStr = n.returnType && n.returnType !== 'any' && n.returnType !== '' ? ': ' + n.returnType : '';
                    return '<div class="lib-symbol-item lib-symbol-child">' +
                      '<span class="lib-sym-icon">' + nIcon + '</span>' +
                      '<span class="lib-sym-name">' + n.name + '</span>' +
                      '<span class="lib-sym-type">' + typeStr + '</span>' +
                    '</div>';
                  }).join('') + '</div>'
                : '';
              return '<div class="lib-symbol-item">' +
                '<span class="lib-sym-icon">' + icon + '</span>' +
                '<span class="lib-sym-name">' + s.name + '</span>' +
                '<span class="lib-sym-kind lib-kind-' + s.kind + '">' + s.kind + '</span>' +
                '</div>' + nestedHtml;
            }).join('');
            treeEl.innerHTML = '<div style="margin-bottom:6px">' + symHtml + '</div>';
          } else {
            treeEl.innerHTML = '<div style="font-size:11px;opacity:0.6">No symbols extracted.</div>';
          }

          // DTS preview
          var dts = wrapper.getLibraryDts(lib.libId);
          if (dts) {
            var pre = document.createElement('pre');
            pre.className = 'lib-dts-preview';
            pre.textContent = dts;
            treeEl.appendChild(pre);
          }
        });
        details.appendChild(treeEl);
        card.appendChild(details);
        listEl.appendChild(card);
      });

      // Remove button handlers
      listEl.querySelectorAll('.lib-card-remove').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var libId = btn.dataset.libid;
          if (wrapper) wrapper.unloadLibrary(libId);
          _loadedLibSources = _loadedLibSources.filter(function (s) { return s.libId !== libId; });
          renderLibList();
        });
      });
    }

    function loadLibraryFile(file) {
      if (!file.name.match(/\.(js|mjs)$/i)) {
        showLibWarn('Only .js files are supported as libraries.');
        return;
      }
      showLibWarn('');
      var reader = new FileReader();
      reader.onload = function (ev) {
        var text = ev.target.result;
        if (!wrapper || !wrapper.loadLibrary) {
          showLibWarn('Editor not ready. Please initialise the editor first.');
          return;
        }
        var result = wrapper.loadLibrary(text, { filename: file.name });
        _loadedLibSources.push({ libId: result.libId, filename: file.name, text: text });
        renderLibList();
        if (result.symbolCount === 0) {
          showLibWarn('Warning: no symbols extracted from ' + file.name + '. Try a non-minified JS file.');
        }
      };
      reader.onerror = function () { showLibWarn('Error reading file: ' + file.name); };
      reader.readAsText(file);
    }

    // Click to browse
    libDropZone.addEventListener('click', function () { libFileInput.click(); });

    // Drag & drop
    libDropZone.addEventListener('dragover', function (e) {
      e.preventDefault();
      libDropZone.classList.add('sg-drop-zone--active');
    });
    libDropZone.addEventListener('dragleave', function () {
      libDropZone.classList.remove('sg-drop-zone--active');
    });
    libDropZone.addEventListener('drop', function (e) {
      e.preventDefault();
      libDropZone.classList.remove('sg-drop-zone--active');
      var files = Array.from(e.dataTransfer.files || []);
      files.forEach(loadLibraryFile);
    });

    // File input
    libFileInput.addEventListener('change', function () {
      Array.from(libFileInput.files || []).forEach(loadLibraryFile);
      libFileInput.value = '';
    });

    // Initial render
    renderLibList();

    // Re-apply saved libraries whenever the editor is (re-)initialised
    // (wrapper is already set by the time bindLibraryManager is called)
    var origInit = window.initPlayground;
    // expose a helper so initEditor can re-register libs
    window.__reloadLibraries = function () {
      if (!wrapper || !wrapper.loadLibrary) return;
      _loadedLibSources.forEach(function (src) {
        wrapper.loadLibrary(src.text, { filename: src.filename, libId: src.libId });
      });
      renderLibList();
    };
  }

  // ── Live Preview ─────────────────────────────────────────────────────────
  function bindLivePreview() {
    if (typeof LivePreviewModal === 'undefined') return;
    livePreviewModal = new LivePreviewModal();

    // Expose panel sync so LivePreviewModal's Apply buttons update the props panel
    window.__syncPropsPanel = function (config) {
      if (!config || typeof config !== 'object') return;
      var $el = function (id) { return document.getElementById(id); };
      if (config.theme         !== undefined && $el('prop-theme'))        $el('prop-theme').value          = config.theme;
      if (config.fontSize      !== undefined && $el('prop-fontSize'))     $el('prop-fontSize').value       = config.fontSize;
      if (config.fontSize      !== undefined && $el('topbar-fontsize'))   $el('topbar-fontsize').value     = config.fontSize;
      if (config.lineNumbers   !== undefined && $el('prop-lineNumbers'))  $el('prop-lineNumbers').value    = config.lineNumbers;
      if (config.wordWrap      !== undefined && $el('prop-wordWrap'))     $el('prop-wordWrap').value       = config.wordWrap;
      if (config.minimap       !== undefined && $el('prop-minimap'))      $el('prop-minimap').checked      = !!config.minimap;
      if (config.formatOnType  !== undefined && $el('prop-formatOnType')) $el('prop-formatOnType').checked = !!config.formatOnType;
      if (config.readOnly      !== undefined && $el('prop-readOnly'))     $el('prop-readOnly').checked     = !!config.readOnly;
      if (config.matchBrackets !== undefined && $el('prop-matchBrackets'))$el('prop-matchBrackets').value  = config.matchBrackets;
      if (config.tabSize       !== undefined && $el('prop-tabSize'))      $el('prop-tabSize').value        = config.tabSize;
      if (config.language      !== undefined) {
        if ($el('lang-select'))   $el('lang-select').value   = config.language;
        if ($el('prop-language')) $el('prop-language').value = config.language;
      }
      updateThemeBtn();
      updateWordWrapBtn();
    };
  }

  // ── Entry point: called after Monaco AMD finishes loading ──────────────────
  window.initPlayground = function () {
    buildToolbarToggles();
    bindDomEvents();
    bindSuggestionGenerator();
    bindFileViewEvents();
    bindLibraryManager();
    bindLivePreview();
    initEditor({
      value: STARTER_CODE.javascript
    });
  };

}());
