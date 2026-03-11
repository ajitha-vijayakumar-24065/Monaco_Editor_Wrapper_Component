// ─────────────────────────────────────────────────────────────────────────────
// TabBar.js — File tab strip above the Monaco editor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TabBar
 *
 * Renders a horizontal strip of file tabs inside the provided container element.
 * Talks to ModelManager and FileSystemManager to open/close/switch files.
 *
 * Usage:
 *   var tb = new TabBar(container, fsManager, modelManager, callbacks);
 *   tb.render();
 *
 * @param {HTMLElement} container   #tab-bar div
 * @param {FileSystemManager} fs
 * @param {ModelManager} mm
 * @param {object} callbacks
 *   .onSwitch(fileId)         called when a tab is activated
 *   .onClose(fileId)          called when a tab is closed
 *   .onNewFileRequest()       called when "+" button is clicked
 */
function TabBar(container, fs, mm, callbacks) {
  this._container = container;
  this._fs        = fs;
  this._mm        = mm;
  this._cb        = callbacks || {};
  this._el        = null;  // inner scroll wrapper
}

// ─── Public API ───────────────────────────────────────────────────────────────

TabBar.prototype.render = function () {
  this._container.innerHTML = '';
  var wrap = document.createElement('div');
  wrap.className = 'tab-bar-inner';
  this._container.appendChild(wrap);
  this._el = wrap;

  this._buildTabs();
  this._bindEvents();
};

TabBar.prototype.refresh = function () {
  if (!this._el) { this.render(); return; }
  this._buildTabs();
};

TabBar.prototype.setActiveTab = function (fileId) {
  if (!this._el) return;
  var tabs = this._el.querySelectorAll('.tab');
  tabs.forEach(function (tab) {
    tab.classList.toggle('tab--active', tab.dataset.fileId === fileId);
  });
  this._scrollToActive();
};

TabBar.prototype.markDirty = function (fileId, isDirty) {
  if (!this._el) return;
  var tab = this._el.querySelector('.tab[data-file-id="' + fileId + '"]');
  if (tab) tab.classList.toggle('tab--dirty', isDirty);
};

TabBar.prototype.destroy = function () {
  if (this._container) this._container.innerHTML = '';
  this._el = null;
};

// ─── Build DOM ────────────────────────────────────────────────────────────────

TabBar.prototype._buildTabs = function () {
  this._el.innerHTML = '';
  var openIds  = this._mm.getOpenFileIds();
  var activeId = this._mm.getActiveFileId();
  var self     = this;

  openIds.forEach(function (fileId) {
    var node = self._fs.getNode(fileId);
    if (!node) return;

    var tab = document.createElement('div');
    tab.className = 'tab';
    tab.dataset.fileId = fileId;
    if (fileId === activeId) tab.classList.add('tab--active');
    if (self._mm.isDirty(fileId)) tab.classList.add('tab--dirty');

    // Icon
    var icon = document.createElement('span');
    icon.className = 'tab-icon';
    icon.textContent = self._langIcon(node.language);
    tab.appendChild(icon);

    // Label
    var label = document.createElement('span');
    label.className = 'tab-label';
    label.textContent = node.name;
    label.title = self._fs.getPath(fileId);
    tab.appendChild(label);

    // Dirty dot
    var dot = document.createElement('span');
    dot.className = 'tab-dirty-dot';
    dot.title = 'Unsaved changes';
    tab.appendChild(dot);

    // Close button
    var closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close';
    closeBtn.title = 'Close';
    closeBtn.setAttribute('aria-label', 'Close ' + node.name);
    closeBtn.textContent = '×';
    tab.appendChild(closeBtn);

    self._el.appendChild(tab);
  });

  // Add-file button
  var addBtn = document.createElement('button');
  addBtn.className = 'tab-add-btn';
  addBtn.title = 'New file';
  addBtn.setAttribute('aria-label', 'New file');
  addBtn.textContent = '+';
  this._el.appendChild(addBtn);
};

TabBar.prototype._bindEvents = function () {
  var self = this;

  this._el.addEventListener('click', function (e) {
    // Close button
    var closeBtn = e.target.closest('.tab-close');
    if (closeBtn) {
      var tab = closeBtn.closest('.tab');
      if (tab) {
        e.stopPropagation();
        self._closeTab(tab.dataset.fileId);
      }
      return;
    }

    // Add button
    if (e.target.closest('.tab-add-btn')) {
      if (typeof self._cb.onNewFileRequest === 'function') {
        self._cb.onNewFileRequest();
      }
      return;
    }

    // Switch tab
    var tab = e.target.closest('.tab');
    if (tab) {
      self._switchTab(tab.dataset.fileId);
    }
  });

  // Middle-click to close
  this._el.addEventListener('mousedown', function (e) {
    if (e.button === 1) {
      var tab = e.target.closest('.tab');
      if (tab) { e.preventDefault(); self._closeTab(tab.dataset.fileId); }
    }
  });

  // Keyboard: Ctrl+W to close active tab
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
      var active = self._mm.getActiveFileId();
      if (active) { e.preventDefault(); self._closeTab(active); }
    }
  });
};

TabBar.prototype._switchTab = function (fileId) {
  if (!fileId || fileId === this._mm.getActiveFileId()) return;
  this._mm.openFile(fileId);
  this.setActiveTab(fileId);
  if (typeof this._cb.onSwitch === 'function') this._cb.onSwitch(fileId);
};

TabBar.prototype._closeTab = function (fileId) {
  if (!fileId) return;
  var nextId = this._mm.closeFile(fileId);
  this.refresh();
  if (nextId) {
    this._mm.openFile(nextId);
    this.setActiveTab(nextId);
    if (typeof this._cb.onSwitch === 'function') this._cb.onSwitch(nextId);
  }
  if (typeof this._cb.onClose === 'function') this._cb.onClose(fileId);
};

TabBar.prototype._scrollToActive = function () {
  if (!this._el) return;
  var active = this._el.querySelector('.tab--active');
  if (active) { active.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
};

TabBar.prototype._langIcon = function (language) {
  var icons = {
    javascript: 'JS', typescript: 'TS', json: '{}', sql: 'DB',
    python: 'PY', html: '<>', css: '#', yaml: 'YL',
    markdown: 'MD', plaintext: 'TXT'
  };
  return icons[language] || '·';
};
