// ─────────────────────────────────────────────────────────────────────────────
// ModelManager.js — Monaco model lifecycle & open-file state
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ModelManager
 *
 * Manages Monaco ITextModel instances (one per open file).
 * Works together with FileSystemManager for content persistence.
 *
 * Lifecycle:
 *   openFile(id)   → create/reuse model, set it on editor, restore view state
 *   closeFile(id)  → save view state, dispose model (unless pinned)
 *   deleteFile(id) → dispose model and view state unconditionally
 *   dispose()      → dispose all models
 *
 * @param {object} editor       monaco editor instance
 * @param {object} fsManager    FileSystemManager instance
 * @param {object} monacoCls    monaco namespace (window.monaco)
 */
function ModelManager(editor, fsManager, monacoCls) {
  this._editor     = editor;
  this._fs         = fsManager;
  this._monaco     = monacoCls;
  this._models     = {};        // fileId → ITextModel
  this._viewStates = {};        // fileId → ICodeEditorViewState
  this._dirty      = {};        // fileId → boolean
  this._listeners  = {};        // fileId → IDisposable (onDidChangeContent)
  this._activeId   = null;      // currently active file id
  this._openIds    = [];        // ordered list of open file ids
  this._onDirtyFns = [];        // listeners for dirty state change
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

ModelManager.prototype._getOrCreateModel = function (fileId) {
  if (this._models[fileId]) return this._models[fileId];
  var node = this._fs.getNode(fileId);
  if (!node || node.type !== 'file') throw new Error('[MM] Not a file: ' + fileId);
  var uri   = this._monaco.Uri.parse('vfs:///' + fileId + '/' + encodeURIComponent(node.name));
  var model = this._monaco.editor.createModel(node.content || '', node.language || 'plaintext', uri);
  this._models[fileId] = model;

  // Track dirty state
  var self = this;
  this._listeners[fileId] = model.onDidChangeContent(function () {
    if (!self._dirty[fileId]) {
      self._dirty[fileId] = true;
      var n = self._fs.getNode(fileId);
      if (n) n.isDirty = true;
      self._fireDirty(fileId, true);
    }
  });

  return model;
};

ModelManager.prototype._fireDirty = function (fileId, isDirty) {
  this._onDirtyFns.forEach(function (fn) { fn(fileId, isDirty); });
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Open a file and activate it in the editor.
 * @returns {ITextModel} the model
 */
ModelManager.prototype.openFile = function (fileId) {
  if (!fileId) return null;
  var model = this._getOrCreateModel(fileId);

  // Save current view state
  if (this._activeId && this._activeId !== fileId) {
    this._viewStates[this._activeId] = this._editor.saveViewState();
  }

  // Swap model
  this._editor.setModel(model);

  // Restore view state
  if (this._viewStates[fileId]) {
    this._editor.restoreViewState(this._viewStates[fileId]);
  }

  // Track open list
  if (this._openIds.indexOf(fileId) === -1) {
    this._openIds.push(fileId);
  }

  this._activeId = fileId;
  return model;
};

/**
 * Close a file. Removes from open list and disposes its model.
 * @returns {string|null} the id of next file to activate, or null
 */
ModelManager.prototype.closeFile = function (fileId) {
  var idx = this._openIds.indexOf(fileId);
  if (idx === -1) return null;

  // Save content back to VFS before close
  this._persistContent(fileId);

  // Save view state
  if (this._activeId === fileId) {
    this._viewStates[fileId] = this._editor.saveViewState();
  }

  // Remove from open list
  this._openIds.splice(idx, 1);

  // Dispose model
  this._disposeModel(fileId);

  // Decide next active
  if (this._activeId === fileId) {
    var nextId = this._openIds[Math.max(0, idx - 1)] || this._openIds[0] || null;
    this._activeId = null;
    return nextId;
  }
  return this._activeId;
};

/**
 * Forcefully delete a file's model + view state (e.g. when file is removed from VFS).
 */
ModelManager.prototype.deleteFile = function (fileId) {
  var idx = this._openIds.indexOf(fileId);
  if (idx !== -1) this._openIds.splice(idx, 1);
  this._disposeModel(fileId);
  delete this._viewStates[fileId];
  delete this._dirty[fileId];

  if (this._activeId === fileId) {
    this._activeId = null;
    return this._openIds[0] || null;
  }
  return this._activeId;
};

/**
 * Mark active file as saved: sync content back to VFS and clear dirty flag.
 */
ModelManager.prototype.saveActiveFile = function () {
  var fileId = this._activeId;
  if (!fileId) return;
  this._persistContent(fileId);
  this._dirty[fileId] = false;
  var node = this._fs.getNode(fileId);
  if (node) {
    node.isDirty = false;
    node.updatedAt = Date.now();
  }
  this._fireDirty(fileId, false);
};

/**
 * Persist model content to VFS node (without marking clean).
 */
ModelManager.prototype._persistContent = function (fileId) {
  var model = this._models[fileId];
  var node  = this._fs.getNode(fileId);
  if (model && node) {
    node.content = model.getValue();
  }
};

/**
 * Dispose a model and remove listeners.
 */
ModelManager.prototype._disposeModel = function (fileId) {
  if (this._listeners[fileId]) {
    this._listeners[fileId].dispose();
    delete this._listeners[fileId];
  }
  if (this._models[fileId]) {
    this._models[fileId].dispose();
    delete this._models[fileId];
  }
};

/**
 * Return the ITextModel for an open file without activating it.
 */
ModelManager.prototype.getModel = function (fileId) {
  return this._models[fileId] || null;
};

/**
 * Return the active model (the one currently shown in the editor).
 */
ModelManager.prototype.getActiveModel = function () {
  return this._activeId ? this._models[this._activeId] : null;
};

/** Currently active file id. */
ModelManager.prototype.getActiveFileId = function () {
  return this._activeId;
};

/** Ordered list of open file ids. */
ModelManager.prototype.getOpenFileIds = function () {
  return this._openIds.slice();
};

/** Whether a file has unsaved changes. */
ModelManager.prototype.isDirty = function (fileId) {
  return !!this._dirty[fileId];
};

/** Register listener for dirty state changes: fn(fileId, isDirty). */
ModelManager.prototype.onDirtyChange = function (fn) {
  if (typeof fn === 'function') this._onDirtyFns.push(fn);
};

/**
 * Re-create the model for a file (e.g. after language change / content reset).
 */
ModelManager.prototype.recreateModel = function (fileId) {
  // Save current view state if active
  if (this._activeId === fileId) {
    this._viewStates[fileId] = this._editor.saveViewState();
    this._persistContent(fileId);
  }
  this._disposeModel(fileId);
  if (this._activeId === fileId) {
    var model = this._getOrCreateModel(fileId);
    this._editor.setModel(model);
    if (this._viewStates[fileId]) {
      this._editor.restoreViewState(this._viewStates[fileId]);
    }
  }
};

/** Persist all open models back to VFS. */
ModelManager.prototype.persistAll = function () {
  var self = this;
  this._openIds.forEach(function (id) { self._persistContent(id); });
};

/** Dispose all models and clean up. */
ModelManager.prototype.dispose = function () {
  var self = this;
  Object.keys(this._models).forEach(function (id) { self._disposeModel(id); });
  this._models     = {};
  this._viewStates = {};
  this._dirty      = {};
  this._listeners  = {};
  this._openIds    = [];
  this._activeId   = null;
  this._onDirtyFns = [];
};
