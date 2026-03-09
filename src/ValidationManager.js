// ─────────────────────────────────────────────────────────────────────────────
// ValidationManager.js — Model marker management & validation loop
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ValidationManager
 *
 * Handles two related responsibilities:
 * 1. Direct marker setting via setMarkers() / clearMarkers()
 * 2. A live validation loop — on every content change, calls the user's
 *    validationFn with the current value, converts results to markers,
 *    and calls setModelMarkers.
 *
 * Severity string → numeric mapping (matches monaco.MarkerSeverity):
 *   hint=1, info=2, warning=4, error=8
 *
 * USAGE:
 *   validationFn signature: (value) => Array<{
 *     startLineNumber, startColumn, endLineNumber, endColumn, message,
 *     severity?  // 'error'|'warning'|'info'|'hint', default 'error'
 *   }>
 */
function ValidationManager(monacoRef, editorRef, emitCallback) {
  this._monaco   = monacoRef;
  this._editor   = editorRef;
  this._emit     = emitCallback;
  this._owner    = 'monaco-wrapper-validation';
  this._validationFn        = null;
  this._validationTimer     = null;
  this._validationDelay     = 300;
  this._contentChangeDisposable = null;
}

var _SEVERITY = { hint: 1, info: 2, warning: 4, error: 8 };

/**
 * Convert a user-facing severity string to the numeric value Monaco expects.
 */
ValidationManager.prototype._severityValue = function (sev) {
  if (typeof sev === 'number') return sev;
  return _SEVERITY[String(sev).toLowerCase()] || 8; // default: error
};

/**
 * Convert raw error objects from validationFn into IMarkerData format.
 */
ValidationManager.prototype._toMarkerData = function (errors) {
  return errors.map(function (e) {
    return {
      startLineNumber: e.startLineNumber || e.line || 1,
      startColumn:     e.startColumn     || e.col  || 1,
      endLineNumber:   e.endLineNumber   || e.endLine   || (e.startLineNumber || e.line || 1),
      endColumn:       e.endColumn       || e.endCol    || 100,
      message:         e.message         || 'Validation error',
      severity:        e.severity !== undefined
                         ? (typeof e.severity === 'string'
                             ? (_SEVERITY[e.severity.toLowerCase()] || 8)
                             : e.severity)
                         : 8,
      source: e.source || 'validation'
    };
  });
};

/**
 * Directly set markers on the current model.
 * @param {Array} markers  Array of IMarkerData-compatible objects
 */
ValidationManager.prototype.setMarkers = function (markers) {
  var model = this._editor.getModel();
  if (!model) return;
  var data = this._toMarkerData(Array.isArray(markers) ? markers : []);
  this._monaco.editor.setModelMarkers(model, this._owner, data);
  this._emit('onMarkersChange', data);
};

/**
 * Clear all markers owned by this manager.
 */
ValidationManager.prototype.clearMarkers = function () {
  var model = this._editor.getModel();
  if (!model) return;
  this._monaco.editor.setModelMarkers(model, this._owner, []);
  this._emit('onMarkersChange', []);
};

/**
 * Set or replace the validation function.
 * Immediately starts the change-listener loop.
 * @param {Function|null} fn
 * @param {number} [delay]  Debounce delay in ms (default 300)
 */
ValidationManager.prototype.setValidationFn = function (fn, delay) {
  this._validationFn = fn;
  if (delay !== undefined) this._validationDelay = delay;

  // Dispose previous listener
  if (this._contentChangeDisposable) {
    this._contentChangeDisposable.dispose();
    this._contentChangeDisposable = null;
  }

  if (typeof fn !== 'function') {
    this.clearMarkers();
    return;
  }

  var self = this;
  this._contentChangeDisposable = this._editor.onDidChangeModelContent(function () {
    clearTimeout(self._validationTimer);
    self._validationTimer = setTimeout(function () {
      self._runValidation();
    }, self._validationDelay);
  });

  // Run immediately against current content
  this._runValidation();
};

/**
 * Clear validation function and all markers.
 */
ValidationManager.prototype.clearValidation = function () {
  this.setValidationFn(null);
};

/**
 * Execute the validation function and apply results as markers.
 * @private
 */
ValidationManager.prototype._runValidation = function () {
  if (typeof this._validationFn !== 'function') return;
  var value = this._editor.getValue();
  var errors;
  try {
    errors = this._validationFn(value);
  } catch (e) {
    console.error('[ValidationManager] validationFn threw:', e);
    return;
  }

  if (!Array.isArray(errors)) {
    console.warn('[ValidationManager] validationFn must return an array');
    return;
  }

  var markers = this._toMarkerData(errors);
  var model   = this._editor.getModel();
  if (model) {
    this._monaco.editor.setModelMarkers(model, this._owner, markers);
  }
  this._emit('onValidation', markers);
};

/**
 * Dispose all resources.
 */
ValidationManager.prototype.dispose = function () {
  clearTimeout(this._validationTimer);
  if (this._contentChangeDisposable) {
    this._contentChangeDisposable.dispose();
    this._contentChangeDisposable = null;
  }
  this.clearMarkers();
};
