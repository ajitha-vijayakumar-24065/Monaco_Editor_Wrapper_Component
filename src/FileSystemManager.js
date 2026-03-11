// ─────────────────────────────────────────────────────────────────────────────
// FileSystemManager.js — In-memory virtual file system
// ─────────────────────────────────────────────────────────────────────────────

/**
 * FileSystemManager
 *
 * Holds an in-memory tree of file and folder nodes.
 * Does NOT interact with Monaco directly — all model work is done by ModelManager.
 *
 * Node shapes:
 *   Folder: { id, type:'folder', name, parentId, children:[] }
 *   File:   { id, type:'file',   name, parentId, language, content, isDirty,
 *              createdAt, updatedAt }
 *
 * @param {Function} emitFn  Optional callback for VFS events
 */
function FileSystemManager(emitFn) {
  this._nodes   = {};   // id → node
  this._rootIds = [];   // top-level node ids
  this._emit    = typeof emitFn === 'function' ? emitFn : function () {};
  this._counter = 0;
}

// ─── UID ─────────────────────────────────────────────────────────────────────

FileSystemManager.prototype._uid = function () {
  return 'n' + (++this._counter);
};

// ─── Name validation ──────────────────────────────────────────────────────────

FileSystemManager.prototype._validateName = function (name) {
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new Error('[FSM] Name must be a non-empty string');
  }
  if (/[/\\]/.test(name)) {
    throw new Error('[FSM] Name must not contain "/" or "\\"');
  }
  return name.trim();
};

// ─── Internal: attach / detach from parent ────────────────────────────────────

FileSystemManager.prototype._attachToParent = function (id, parentId) {
  if (parentId) {
    var parent = this._nodes[parentId];
    if (!parent || parent.type !== 'folder') {
      throw new Error('[FSM] Parent ' + parentId + ' is not a folder');
    }
    parent.children.push(id);
  } else {
    this._rootIds.push(id);
  }
};

FileSystemManager.prototype._detachFromParent = function (id, parentId) {
  if (parentId) {
    var parent = this._nodes[parentId];
    if (parent) {
      parent.children = parent.children.filter(function (cid) { return cid !== id; });
    }
  } else {
    this._rootIds = this._rootIds.filter(function (rid) { return rid !== id; });
  }
};

// ─── Language detection ────────────────────────────────────────────────────────

FileSystemManager.prototype._langFromName = function (name) {
  var ext = (name.match(/\.(\w+)$/) || [])[1];
  if (!ext) return 'plaintext';
  var map = {
    'js': 'javascript', 'ts': 'typescript', 'jsx': 'javascript',
    'tsx': 'typescript', 'mjs': 'javascript', 'cjs': 'javascript',
    'json': 'json', 'css': 'css', 'scss': 'css', 'less': 'css',
    'html': 'html', 'htm': 'html', 'sql': 'sql', 'py': 'python',
    'yaml': 'yaml', 'yml': 'yaml', 'env': 'yaml', 'md': 'markdown',
    'markdown': 'markdown', 'txt': 'plaintext'
  };
  return map[ext.toLowerCase()] || 'plaintext';
};

// ─── Default content per language ─────────────────────────────────────────────

FileSystemManager.prototype._defaultContent = function (language) {
  var map = {
    javascript: '// New file\n',
    typescript: '// New file\n',
    json: '{\n  \n}\n',
    sql: '-- New query\n',
    python: '# New file\n',
    html: '<!DOCTYPE html>\n<html>\n<head></head>\n<body>\n\n</body>\n</html>\n',
    css: '/* New stylesheet */\n',
    yaml: '# New config\n',
    markdown: '# New document\n',
    plaintext: ''
  };
  return map[language] || '';
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Add a file node.
 * @returns {object} The new node
 */
FileSystemManager.prototype.addFile = function (name, parentId, content, language) {
  name = this._validateName(name);
  var lang = language || this._langFromName(name);
  var id   = this._uid();
  var now  = Date.now();
  var node = {
    id: id, type: 'file', name: name, parentId: parentId || null,
    language: lang,
    content: (content !== undefined && content !== null) ? content : this._defaultContent(lang),
    isDirty: false, createdAt: now, updatedAt: now
  };
  this._nodes[id] = node;
  this._attachToParent(id, parentId || null);
  this._emit('onFileAdd', node);
  return node;
};

/**
 * Add a folder node.
 * @returns {object} The new node
 */
FileSystemManager.prototype.addFolder = function (name, parentId) {
  name = this._validateName(name);
  var id   = this._uid();
  var node = {
    id: id, type: 'folder', name: name, parentId: parentId || null,
    children: [], createdAt: Date.now()
  };
  this._nodes[id] = node;
  this._attachToParent(id, parentId || null);
  this._emit('onFolderAdd', node);
  return node;
};

/**
 * Rename a node.
 */
FileSystemManager.prototype.renameNode = function (id, newName) {
  newName = this._validateName(newName);
  var node = this._nodes[id];
  if (!node) throw new Error('[FSM] Node not found: ' + id);
  node.name = newName;
  node.updatedAt = Date.now();
  if (node.type === 'file') {
    node.language = this._langFromName(newName);
  }
  this._emit('onNodeRename', node);
  return node;
};

/**
 * Delete a node recursively.
 * Returns the list of deleted file ids (for model disposal by ModelManager).
 */
FileSystemManager.prototype.deleteNode = function (id) {
  var node = this._nodes[id];
  if (!node) return [];
  var self = this;
  var deletedFileIds = [];

  function recurse(nodeId) {
    var n = self._nodes[nodeId];
    if (!n) return;
    if (n.type === 'folder') {
      var children = (n.children || []).slice();
      children.forEach(recurse);
    } else {
      deletedFileIds.push(nodeId);
    }
    delete self._nodes[nodeId];
  }

  recurse(id);
  this._detachFromParent(id, node.parentId);
  this._emit('onNodeDelete', { id: id, deletedFileIds: deletedFileIds });
  return deletedFileIds;
};

/**
 * Duplicate a file. Returns the new node.
 */
FileSystemManager.prototype.duplicateFile = function (id) {
  var node = this._nodes[id];
  if (!node || node.type !== 'file') throw new Error('[FSM] Not a file: ' + id);
  var base = node.name.replace(/(\.\w+)$/, '');
  var ext  = (node.name.match(/(\.\w+)$/) || [''])[0];
  var candidate = 'Copy of ' + base + ext;
  var siblings = this.getChildren(node.parentId).map(function (c) { return c.name; });
  var num = 2;
  while (siblings.indexOf(candidate) !== -1) {
    candidate = 'Copy of ' + base + ' (' + num + ')' + ext;
    num++;
  }
  return this.addFile(candidate, node.parentId, node.content, node.language);
};

/**
 * Move a node to a new parent.
 */
FileSystemManager.prototype.moveNode = function (id, newParentId) {
  var node = this._nodes[id];
  if (!node) throw new Error('[FSM] Node not found: ' + id);
  this._detachFromParent(id, node.parentId);
  node.parentId = newParentId || null;
  this._attachToParent(id, newParentId || null);
  this._emit('onNodeMove', node);
};

/**
 * Get a node by id.
 */
FileSystemManager.prototype.getNode = function (id) {
  return this._nodes[id] || null;
};

/**
 * Get immediate children of a folder (null/undefined = root).
 */
FileSystemManager.prototype.getChildren = function (parentId) {
  var self = this;
  var ids = parentId ? (this._nodes[parentId] ? this._nodes[parentId].children : []) : this._rootIds;
  return ids.map(function (id) { return self._nodes[id]; }).filter(Boolean);
};

/**
 * Compute full virtual path like /src/auth.js
 */
FileSystemManager.prototype.getPath = function (id) {
  var parts = [];
  var current = this._nodes[id];
  while (current) {
    parts.unshift(current.name);
    current = current.parentId ? this._nodes[current.parentId] : null;
  }
  return '/' + parts.join('/');
};

/**
 * Flat list of all file nodes.
 */
FileSystemManager.prototype.getAllFiles = function () {
  return Object.values(this._nodes).filter(function (n) { return n.type === 'file'; });
};

/**
 * Flat list of all folder nodes.
 */
FileSystemManager.prototype.getAllFolders = function () {
  return Object.values(this._nodes).filter(function (n) { return n.type === 'folder'; });
};

/**
 * Get all descendant file ids for a folder (recursive).
 */
FileSystemManager.prototype.getDescendantFileIds = function (folderId) {
  var self = this;
  var result = [];
  function recurse(id) {
    var n = self._nodes[id];
    if (!n) return;
    if (n.type === 'file') { result.push(id); }
    else (n.children || []).forEach(recurse);
  }
  recurse(folderId);
  return result;
};

/**
 * Export the full VFS as a plain serializable object.
 */
FileSystemManager.prototype.toJSON = function () {
  return {
    nodes: JSON.parse(JSON.stringify(this._nodes)),
    rootIds: this._rootIds.slice(),
    counter: this._counter
  };
};

/**
 * Replace the VFS with data from a toJSON() export.
 */
FileSystemManager.prototype.fromJSON = function (obj) {
  this._nodes   = obj.nodes   || {};
  this._rootIds = obj.rootIds || [];
  this._counter = obj.counter || 0;
};

/**
 * Check if a filename conflicts in a given parent (for upload dedup).
 */
FileSystemManager.prototype.hasNameConflict = function (name, parentId) {
  var siblings = this.getChildren(parentId || null);
  var lower = name.toLowerCase();
  return siblings.some(function (c) { return c.name.toLowerCase() === lower; });
};

/**
 * Resolve a name conflict by appending a numeric suffix.
 */
FileSystemManager.prototype.resolveNameConflict = function (name, parentId) {
  if (!this.hasNameConflict(name, parentId)) return name;
  var base = name.replace(/(\.\w+)$/, '');
  var ext  = (name.match(/(\.\w+)$/) || [''])[0];
  var num  = 2;
  var candidate;
  do {
    candidate = base + ' (' + num + ')' + ext;
    num++;
  } while (this.hasNameConflict(candidate, parentId));
  return candidate;
};
