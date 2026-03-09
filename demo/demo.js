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
  var wrapper      = null;
  var currentLang  = 'javascript';
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
      'onShortcutTriggered', 'onLanguageChange', 'onTokenColorsChange'
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

    // Update UI state
    updateWordWrapBtn();
    updateThemeBtn();

    log('init', { language: options.language, theme: options.theme });
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
      'tbtn-wordwrap':  function () { wrapper && wrapper.toggleWordWrap(); updateWordWrapBtn(); }
    };

    Object.keys(actionButtons).forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('click', actionButtons[id]);
    });
  }

  // ── Entry point: called after Monaco AMD finishes loading ──────────────────
  window.initPlayground = function () {
    buildToolbarToggles();
    bindDomEvents();
    initEditor({
      value: STARTER_CODE.javascript
    });
  };

}());
