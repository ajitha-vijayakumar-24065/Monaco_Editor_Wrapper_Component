// ─────────────────────────────────────────────────────────────────────────────
// FilePanel.js — Left panel: tree view for the virtual file system
// ─────────────────────────────────────────────────────────────────────────────

/**
 * FilePanel
 *
 * Renders a tree view of the VFS.
 * Handles inline rename, context menu, drag-and-drop upload, new-file/folder dialogs.
 *
 * Usage:
 *   var fp = new FilePanel(container, fsManager, modelManager, callbacks);
 *   fp.applyConfig({ visible: true });
 *
 * @param {HTMLElement} container   #file-panel element
 * @param {FileSystemManager} fs
 * @param {ModelManager} mm
 * @param {object} callbacks
 *   .onOpen(fileId)           file opened / tab activated
 *   .onSelect(nodeId)         selection changed (file or folder)
 */
function FilePanel(container, fs, mm, callbacks) {
  this._container = container;
  this._fs        = fs;
  this._mm        = mm;
  this._cb        = callbacks || {};

  // State
  this._config          = { visible: true };
  this._expandedFolders = {};   // folderId → true/false
  this._selectedId      = null;
  this._contextMenuEl   = null;
  this._renameTarget    = null;

  // Elements
  this._header    = null;
  this._body      = null;
  this._toolbar   = null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

FilePanel.prototype.applyConfig = function (cfg) {
  if (!cfg) return;
  if (cfg.visible !== undefined) this._config.visible = cfg.visible;
  this._container.style.display = this._config.visible ? '' : 'none';
  this.render();
};

FilePanel.prototype.render = function () {
  this._dismissContextMenu();
  this._container.innerHTML = '';

  this._buildHeader();
  this._buildToolbar();
  this._buildBody();
  this._bindGlobalEvents();
};

FilePanel.prototype.refresh = function () {
  this._dismissContextMenu();
  if (this._body) this._renderList();
};

FilePanel.prototype.setActiveFile = function (fileId) {
  if (!this._body) return;
  this._body.querySelectorAll('.fp-item').forEach(function (el) {
    el.classList.toggle('fp-item--active', el.dataset.nodeId === fileId);
  });
};

FilePanel.prototype.destroy = function () {
  this._dismissContextMenu();
  this._container.innerHTML = '';
};

// ─── Internal build ───────────────────────────────────────────────────────────

FilePanel.prototype._buildHeader = function () {
  var hdr = document.createElement('div');
  hdr.className = 'fp-header';

  var title = document.createElement('span');
  title.className = 'fp-header-title';
  title.textContent = 'FILES';
  hdr.appendChild(title);

  this._container.appendChild(hdr);
  this._header = hdr;
};

FilePanel.prototype._buildToolbar = function () {
  var bar = document.createElement('div');
  bar.className = 'fp-toolbar';

  var self = this;
  var btns = [
    { icon: '+F', title: 'New file',   action: function () { self._promptNewFile(self._getCwdFolderId()); } },
    { icon: '+D', title: 'New folder', action: function () { self._promptNewFolder(self._getCwdFolderId()); } },
    { icon: '↑',  title: 'Upload files', action: function () { self._triggerUpload(); } }
  ];

  btns.forEach(function (b) {
    var btn = document.createElement('button');
    btn.className = 'fp-toolbar-btn';
    btn.title = b.title;
    btn.textContent = b.icon;
    btn.setAttribute('aria-label', b.title);
    btn.addEventListener('click', b.action);
    bar.appendChild(btn);
  });

  // Collapse all (tree only)
  var collapseBtn = document.createElement('button');
  collapseBtn.className = 'fp-toolbar-btn fp-collapse-btn';
  collapseBtn.title = 'Collapse all';
  collapseBtn.textContent = '⊟';
  collapseBtn.addEventListener('click', function () {
    self._expandedFolders = {};
    self._renderList();
  });
  bar.appendChild(collapseBtn);

  this._container.appendChild(bar);
  this._toolbar = bar;
};

FilePanel.prototype._buildBody = function () {
  var body = document.createElement('div');
  body.className = 'fp-body';
  this._container.appendChild(body);
  this._body = body;

  this._renderList();
  this._bindBodyEvents();
  this._bindDragAndDrop();
};

// ─── Rendering ────────────────────────────────────────────────────────────────

FilePanel.prototype._renderList = function () {
  if (!this._body) return;
  this._body.innerHTML = '';
  this._renderTreeView();
};

FilePanel.prototype._renderTreeView = function () {
  var self     = this;
  var rootNodes = this._fs.getChildren(null);

  if (rootNodes.length === 0) {
    this._body.appendChild(this._makeEmptyState());
    return;
  }

  var ul = document.createElement('ul');
  ul.className = 'fp-tree';
  self._renderTreeLevel(rootNodes, ul, 0);
  this._body.appendChild(ul);
};

FilePanel.prototype._renderTreeLevel = function (nodes, ul, depth) {
  var self = this;
  // Folders first, then files
  var sorted = nodes.slice().sort(function (a, b) {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  sorted.forEach(function (node) {
    var li = document.createElement('li');
    li.className = 'fp-tree-item';

    var row = document.createElement('div');
    row.className = 'fp-item fp-item--' + node.type;
    if (node.id === self._selectedId)  row.classList.add('fp-item--selected');
    if (node.id === self._mm.getActiveFileId()) row.classList.add('fp-item--active');
    if (node.type === 'file' && self._mm.isDirty(node.id)) row.classList.add('fp-item--dirty');
    row.dataset.nodeId = node.id;
    row.dataset.nodeType = node.type;
    row.style.paddingLeft = (12 + depth * 16) + 'px';

    // Chevron for folder
    if (node.type === 'folder') {
      var chevron = document.createElement('span');
      chevron.className = 'fp-chevron';
      chevron.textContent = self._expandedFolders[node.id] ? '▾' : '▸';
      row.appendChild(chevron);
    } else {
      var spacer = document.createElement('span');
      spacer.className = 'fp-chevron-spacer';
      row.appendChild(spacer);
    }

    // Icon
    var icon = document.createElement('span');
    icon.className = 'fp-node-icon';
    icon.textContent = node.type === 'folder'
      ? (self._expandedFolders[node.id] ? '📂' : '📁')
      : self._fileIcon(node.language);
    row.appendChild(icon);

    // Name
    var nameEl = document.createElement('span');
    nameEl.className = 'fp-node-name';
    nameEl.textContent = node.name;
    row.appendChild(nameEl);

    // Dirty indicator
    if (node.type === 'file') {
      var dot = document.createElement('span');
      dot.className = 'fp-dirty-dot';
      row.appendChild(dot);
    }

    li.appendChild(row);

    // Expanded children
    if (node.type === 'folder' && self._expandedFolders[node.id]) {
      var childNodes = self._fs.getChildren(node.id);
      var childUl = document.createElement('ul');
      childUl.className = 'fp-tree fp-tree--nested';
      if (childNodes.length === 0) {
        var emptyLi = document.createElement('li');
        var emptyEl = document.createElement('div');
        emptyEl.className = 'fp-item-empty';
        emptyEl.style.paddingLeft = (12 + (depth + 1) * 16) + 'px';
        emptyEl.textContent = 'Empty folder';
        emptyLi.appendChild(emptyEl);
        childUl.appendChild(emptyLi);
      } else {
        self._renderTreeLevel(childNodes, childUl, depth + 1);
      }
      li.appendChild(childUl);
    }

    ul.appendChild(li);
  });
};

FilePanel.prototype._makeEmptyState = function () {
  var el = document.createElement('div');
  el.className = 'fp-empty';
  el.innerHTML = '<p>No files yet</p><small>Click <strong>+F</strong> to create one or drag &amp; drop files here.</small>';
  return el;
};

// ─── Events ───────────────────────────────────────────────────────────────────

FilePanel.prototype._getCwdFolderId = function () {
  if (this._selectedId) {
    var n = this._fs.getNode(this._selectedId);
    if (n && n.type === 'folder') return this._selectedId;
    if (n && n.parentId) return n.parentId;
  }
  return null;
};

FilePanel.prototype._bindBodyEvents = function () {
  var self = this;

  this._body.addEventListener('click', function (e) {
    self._dismissContextMenu();
    var item = e.target.closest('[data-node-id]');
    if (!item) return;
    var id   = item.dataset.nodeId;
    var type = item.dataset.nodeType;
    self._selectedId = id;

    if (type === 'folder') {
      self._expandedFolders[id] = !self._expandedFolders[id];
      self._renderList();
    } else {
      // Open file
      self._mm.openFile(id);
      self._renderList();
      if (typeof self._cb.onOpen === 'function') self._cb.onOpen(id);
    }

    if (typeof self._cb.onSelect === 'function') self._cb.onSelect(id);
  });

  this._body.addEventListener('contextmenu', function (e) {
    e.preventDefault();
    var item = e.target.closest('[data-node-id]');
    self._showContextMenu(e.clientX, e.clientY, item ? item.dataset.nodeId : null);
  });

  // Blank context menu (right-click on body but not on item)
  this._container.addEventListener('contextmenu', function (e) {
    if (e.target.closest('[data-node-id]')) return;
    e.preventDefault();
    self._showContextMenu(e.clientX, e.clientY, null);
  });
};

FilePanel.prototype._bindGlobalEvents = function () {
  var self = this;
  document.addEventListener('click', function () { self._dismissContextMenu(); });
};

// ─── Context Menu ─────────────────────────────────────────────────────────────

FilePanel.prototype._showContextMenu = function (x, y, nodeId) {
  this._dismissContextMenu();
  var node = nodeId ? this._fs.getNode(nodeId) : null;
  var self = this;

  var menu = document.createElement('div');
  menu.className = 'fp-context-menu';
  menu.style.left = x + 'px';
  menu.style.top  = y + 'px';

  var items = [];

  if (!node) {
    items = [
      { label: 'New file',   action: function () { self._promptNewFile(self._getCwdFolderId()); } },
      { label: 'New folder', action: function () { self._promptNewFolder(self._getCwdFolderId()); } },
      { label: 'Upload',     action: function () { self._triggerUpload(); } }
    ];
  } else if (node.type === 'file') {
    items = [
      { label: 'Open',      action: function () { self._mm.openFile(nodeId); self._renderList(); if (typeof self._cb.onOpen === 'function') self._cb.onOpen(nodeId); } },
      { label: 'Rename',    action: function () { self._startRename(nodeId); } },
      { label: 'Duplicate', action: function () {
          var newNode = self._fs.duplicateFile(nodeId);
          self._renderList();
          self._mm.openFile(newNode.id);
          if (typeof self._cb.onOpen === 'function') self._cb.onOpen(newNode.id);
        }
      },
      { separator: true },
      { label: 'Delete',    action: function () { self._confirmDelete(nodeId); }, className: 'fp-menu-item--danger' }
    ];
  } else {
    items = [
      { label: 'New file in folder',   action: function () { self._promptNewFile(nodeId); self._expandedFolders[nodeId] = true; self._renderList(); } },
      { label: 'New subfolder',        action: function () { self._promptNewFolder(nodeId); self._expandedFolders[nodeId] = true; self._renderList(); } },
      { label: 'Rename',               action: function () { self._startRename(nodeId); } },
      { separator: true },
      { label: 'Delete folder',        action: function () { self._confirmDelete(nodeId); }, className: 'fp-menu-item--danger' }
    ];
  }

  items.forEach(function (item) {
    if (item.separator) {
      var sep = document.createElement('div');
      sep.className = 'fp-menu-sep';
      menu.appendChild(sep);
      return;
    }
    var li = document.createElement('div');
    li.className = 'fp-menu-item' + (item.className ? ' ' + item.className : '');
    li.textContent = item.label;
    li.addEventListener('click', function (e) {
      e.stopPropagation();
      self._dismissContextMenu();
      item.action();
    });
    menu.appendChild(li);
  });

  document.body.appendChild(menu);
  this._contextMenuEl = menu;

  // Adjust so menu doesn't overflow viewport
  var rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth)  menu.style.left = (x - rect.width)  + 'px';
  if (rect.bottom > window.innerHeight) menu.style.top = (y - rect.height) + 'px';
};

FilePanel.prototype._dismissContextMenu = function () {
  if (this._contextMenuEl) {
    this._contextMenuEl.remove();
    this._contextMenuEl = null;
  }
};

// ─── Inline Rename ────────────────────────────────────────────────────────────

FilePanel.prototype._startRename = function (nodeId) {
  var node = this._fs.getNode(nodeId);
  if (!node) return;
  var self = this;

  // Find the label element in the panel
  var nameEl = this._body.querySelector('[data-node-id="' + nodeId + '"] .fp-node-name, [data-node-id="' + nodeId + '"] .fp-card-name');
  if (!nameEl) return;

  var input = document.createElement('input');
  input.type = 'text';
  input.className = 'fp-rename-input';
  input.value = node.name;
  nameEl.replaceWith(input);
  input.focus();
  input.select();
  this._renameTarget = nodeId;

  function commit() {
    var newName = input.value.trim();
    if (newName && newName !== node.name) {
      try {
        self._fs.renameNode(nodeId, newName);
        // If a Monaco model exists for this file, recreate it to update URI
        if (node.type === 'file' && self._mm.getModel(nodeId)) {
          self._mm.recreateModel(nodeId);
        }
      } catch (err) {
        console.warn('[FilePanel] Rename error:', err.message);
      }
    }
    self._renameTarget = null;
    self._renderList();
  }

  input.addEventListener('blur',  commit);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.value = node.name; input.blur(); }
  });
};

// ─── Delete ───────────────────────────────────────────────────────────────────

FilePanel.prototype._confirmDelete = function (nodeId) {
  var node = this._fs.getNode(nodeId);
  if (!node) return;
  var type = node.type === 'folder' ? 'folder and all its contents' : 'file';
  if (!confirm('Delete ' + type + ' "' + node.name + '"?\nThis cannot be undone.')) return;

  var self = this;
  var deletedFileIds = this._fs.deleteNode(nodeId);
  deletedFileIds.forEach(function (fid) {
    var nextId = self._mm.deleteFile(fid);
    if (nextId) {
      self._mm.openFile(nextId);
      if (typeof self._cb.onOpen === 'function') self._cb.onOpen(nextId);
    }
  });
  this._renderList();
};

// ─── New File / Folder ────────────────────────────────────────────────────────

FilePanel.prototype._promptNewFile = function (parentId) {
  var name = prompt('New file name:', 'untitled.js');
  if (!name || !name.trim()) return;
  name = name.trim();
  try {
    name = this._fs.resolveNameConflict(name, parentId);
    var node = this._fs.addFile(name, parentId);
    if (parentId) this._expandedFolders[parentId] = true;
    this._renderList();
    this._mm.openFile(node.id);
    if (typeof this._cb.onOpen === 'function') this._cb.onOpen(node.id);
    // Trigger a rename so user can change the name inline
    // (optional — just leave the file created with the prompt name)
  } catch (err) {
    alert(err.message);
  }
};

FilePanel.prototype._promptNewFolder = function (parentId) {
  var name = prompt('New folder name:', 'NewFolder');
  if (!name || !name.trim()) return;
  name = name.trim();
  try {
    name = this._fs.resolveNameConflict(name, parentId);
    var node = this._fs.addFolder(name, parentId);
    if (parentId) this._expandedFolders[parentId] = true;
    this._expandedFolders[node.id] = true;
    this._renderList();
  } catch (err) {
    alert(err.message);
  }
};

// ─── Upload ───────────────────────────────────────────────────────────────────

FilePanel.prototype._triggerUpload = function () {
  var self = this;
  var input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = '.js,.ts,.jsx,.tsx,.json,.html,.css,.scss,.sql,.py,.yaml,.yml,.md,.txt,.env';
  input.addEventListener('change', function () {
    self._handleFileList(input.files, self._getCwdFolderId());
  });
  input.click();
};

FilePanel.prototype._handleFileList = function (fileList, parentId) {
  var self = this;
  Array.prototype.forEach.call(fileList, function (file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var content = e.target.result;
      var name = self._fs.resolveNameConflict(file.name, parentId);
      var node = self._fs.addFile(name, parentId, content);
      if (parentId) self._expandedFolders[parentId] = true;
      self._renderList();
      // Auto-open the first uploaded file
      if (!self._mm.getActiveFileId()) {
        self._mm.openFile(node.id);
        if (typeof self._cb.onOpen === 'function') self._cb.onOpen(node.id);
      }
    };
    reader.readAsText(file);
  });
};

FilePanel.prototype._bindDragAndDrop = function () {
  var self = this;
  var body = this._container;

  body.addEventListener('dragover', function (e) {
    if (e.dataTransfer && e.dataTransfer.types.indexOf('Files') !== -1) {
      e.preventDefault();
      body.classList.add('fp-drag-over');
    }
  });

  body.addEventListener('dragleave', function (e) {
    if (!body.contains(e.relatedTarget)) {
      body.classList.remove('fp-drag-over');
    }
  });

  body.addEventListener('drop', function (e) {
    e.preventDefault();
    body.classList.remove('fp-drag-over');
    if (e.dataTransfer && e.dataTransfer.files.length) {
      self._handleFileList(e.dataTransfer.files, self._getCwdFolderId());
    }
  });
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

FilePanel.prototype._fileIcon = function (language) {
  var icons = {
    javascript: '🟨', typescript: '🔷', json: '📋', sql: '🗄️',
    python: '🐍', html: '🌐', css: '🎨', yaml: '⚙️',
    markdown: '📝', plaintext: '📄'
  };
  return icons[language] || '📄';
};
