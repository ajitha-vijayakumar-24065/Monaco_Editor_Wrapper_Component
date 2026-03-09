// ─────────────────────────────────────────────────────────────────────────────
// ToolbarManager.js — Toolbar rendering and button management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ToolbarManager
 *
 * Renders a toolbar above the editor. Each button triggers the corresponding
 * public method on the MonacoWrapper instance.
 *
 * @param {HTMLElement}  containerEl  The toolbar's parent container
 * @param {object}       toolbarOpts  From options.toolbar: { show, buttons, customButtons }
 * @param {object}       iconOverrides From options.icons
 * @param {object}       wrapperRef   Reference to the MonacoWrapper instance
 * @param {Array}        defaultButtons DEFAULT_TOOLBAR_BUTTONS from constants.js
 */
function ToolbarManager(containerEl, toolbarOpts, iconOverrides, wrapperRef, defaultButtons) {
  this._container     = containerEl;
  this._wrapperRef    = wrapperRef;
  this._iconOverrides = iconOverrides || {};
  this._defaultButtons= defaultButtons;
  this._toolbarEl     = null;
  this._buttons       = {};   // id → { el, config }
  this._customButtons = {};   // id → { el, config }

  // Merge user button overrides with defaults
  this._buttonConfigs = this._buildButtonConfigs(toolbarOpts);

  if (toolbarOpts.show !== false) {
    this._render();
  }
}

/**
 * Merge toolbarOpts.buttons (user overrides) with DEFAULT_TOOLBAR_BUTTONS.
 * @private
 */
ToolbarManager.prototype._buildButtonConfigs = function (toolbarOpts) {
  var defaults = this._defaultButtons;
  var overrides = (toolbarOpts.buttons && Array.isArray(toolbarOpts.buttons))
    ? toolbarOpts.buttons
    : [];

  // Build lookup for overrides
  var overrideMap = {};
  overrides.forEach(function (o) { overrideMap[o.id] = o; });

  return defaults.map(function (def) {
    var ov = overrideMap[def.id] || {};
    return {
      id:               def.id,
      label:            ov.label            !== undefined ? ov.label            : def.label,
      title:            ov.title            !== undefined ? ov.title            : def.title,
      keybindingLabel:  ov.keybindingLabel  !== undefined ? ov.keybindingLabel  : def.keybindingLabel,
      visible:          ov.visible          !== undefined ? ov.visible          : def.visible,
      icon:             def.icon // icon overrides handled separately via this._iconOverrides
    };
  });
};

/**
 * Return the icon HTML for a button — user override takes precedence.
 * @private
 */
ToolbarManager.prototype._getIcon = function (buttonId, fallbackIcon) {
  return this._iconOverrides[buttonId] || fallbackIcon || '';
};

/**
 * Map a button id to the wrapper method name.
 * @private
 */
ToolbarManager.prototype._getAction = function (id) {
  var actionMap = {
    undo:         function (w) { w.undo(); },
    redo:         function (w) { w.redo(); },
    cut:          function (w) { w.cut(); },
    copy:         function (w) { w.copy(); },
    indent:       function (w) { w.indent(); },
    outdent:      function (w) { w.outdent(); },
    commentLine:  function (w) { w.toggleLineComment(); },
    blockComment: function (w) { w.toggleBlockComment(); },
    deleteLine:   function (w) { w.deleteLine(); },
    duplicateLine:function (w) { w.duplicateLine(); },
    find:         function (w) { w.triggerFind(); },
    format:       function (w) { w.format(); },
    wordWrap:     function (w) { w.toggleWordWrap(); },
    theme:        function (w) { w.toggleTheme(); },
    reset:        function (w) { w.resetContent(); }
  };
  return actionMap[id] || null;
};

/**
 * Build and append the toolbar DOM.
 * @private
 */
ToolbarManager.prototype._render = function () {
  var self = this;
  var toolbar = document.createElement('div');
  toolbar.className = 'mw-toolbar';
  this._toolbarEl = toolbar;

  this._buttonConfigs.forEach(function (config) {
    var btn = self._createButtonEl(config, function () {
      var action = self._getAction(config.id);
      if (action) action(self._wrapperRef);
    });
    self._buttons[config.id] = { el: btn, config: config };
    if (!config.visible) btn.style.display = 'none';
    toolbar.appendChild(btn);
  });

  // Custom buttons
  var customBtns = (this._toolbarOpts && this._toolbarOpts.customButtons) || [];
  customBtns.forEach(function (cb) {
    self.addCustomButton(cb);
  });

  this._container.insertBefore(toolbar, this._container.firstChild);
};

/**
 * Create a toolbar button element.
 * @private
 */
ToolbarManager.prototype._createButtonEl = function (config, onClick) {
  var btn = document.createElement('button');
  btn.className   = 'mw-toolbar-btn';
  btn.title       = config.title || config.label || config.id;
  btn.dataset.id  = config.id;

  var iconHtml = this._getIcon(config.id, config.icon);
  var labelHtml = '';

  // Keybinding label (optional display)
  if (config.keybindingLabel) {
    labelHtml = '<span class="mw-keybinding-label">' +
      this._escapeHtml(config.keybindingLabel) + '</span>';
  }

  btn.innerHTML = iconHtml + '<span class="mw-btn-label">' +
    this._escapeHtml(config.label) + '</span>' + labelHtml;

  btn.addEventListener('click', function (e) {
    e.preventDefault();
    onClick();
  });

  return btn;
};

ToolbarManager.prototype._escapeHtml = function (str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

/**
 * Show a built-in toolbar button by id.
 * @param {string} id
 */
ToolbarManager.prototype.showButton = function (id) {
  if (this._buttons[id]) {
    this._buttons[id].el.style.display = '';
    this._buttons[id].config.visible = true;
  }
};

/**
 * Hide a built-in toolbar button by id.
 * @param {string} id
 */
ToolbarManager.prototype.hideButton = function (id) {
  if (this._buttons[id]) {
    this._buttons[id].el.style.display = 'none';
    this._buttons[id].config.visible = false;
  }
};

/**
 * Toggle the visual active/pressed state of a button (e.g., word wrap toggle).
 * @param {string}  id
 * @param {boolean} active
 */
ToolbarManager.prototype.setButtonActive = function (id, active) {
  if (this._buttons[id]) {
    if (active) {
      this._buttons[id].el.classList.add('mw-toolbar-btn--active');
    } else {
      this._buttons[id].el.classList.remove('mw-toolbar-btn--active');
    }
  }
};

/**
 * Add a custom button to the toolbar.
 * @param {{ id: string, label: string, icon?: string, onClick: Function, title?: string }} config
 */
ToolbarManager.prototype.addCustomButton = function (config) {
  if (!config || !config.id || typeof config.onClick !== 'function') {
    console.warn('[ToolbarManager] addCustomButton: id and onClick are required');
    return;
  }
  if (this._customButtons[config.id]) {
    this.removeCustomButton(config.id);
  }

  var self = this;
  var btnConfig = {
    id:    config.id,
    label: config.label || config.id,
    title: config.title || config.label || config.id,
    icon:  config.icon || '',
    keybindingLabel: '',
    visible: true
  };

  var btn = this._createButtonEl(btnConfig, function () {
    config.onClick(self._wrapperRef);
  });
  btn.classList.add('mw-toolbar-btn--custom');

  this._customButtons[config.id] = { el: btn, config: config };

  if (this._toolbarEl) {
    this._toolbarEl.appendChild(btn);
  }
};

/**
 * Remove a custom button from the toolbar.
 * @param {string} id
 */
ToolbarManager.prototype.removeCustomButton = function (id) {
  if (this._customButtons[id]) {
    var el = this._customButtons[id].el;
    if (el.parentNode) el.parentNode.removeChild(el);
    delete this._customButtons[id];
  }
};

/**
 * Update icon overrides and re-render button icons.
 * @param {object} iconsMap  { buttonId: '<svg>...' }
 */
ToolbarManager.prototype.setIcons = function (iconsMap) {
  if (!iconsMap || typeof iconsMap !== 'object') return;
  var self = this;
  Object.keys(iconsMap).forEach(function (id) {
    self._iconOverrides[id] = iconsMap[id];
    if (self._buttons[id]) {
      // Re-set icon part of the button HTML
      var btn   = self._buttons[id];
      var label = btn.config.label || '';
      var kb    = btn.config.keybindingLabel || '';
      btn.el.innerHTML =
        iconsMap[id] +
        '<span class="mw-btn-label">' + self._escapeHtml(label) + '</span>' +
        (kb ? '<span class="mw-keybinding-label">' + self._escapeHtml(kb) + '</span>' : '');
    }
  });
};

/**
 * Show or hide the entire toolbar.
 * @param {boolean} visible
 */
ToolbarManager.prototype.setVisible = function (visible) {
  if (this._toolbarEl) {
    this._toolbarEl.style.display = visible ? '' : 'none';
  }
};

/**
 * Dispose the toolbar — remove DOM element.
 */
ToolbarManager.prototype.dispose = function () {
  if (this._toolbarEl && this._toolbarEl.parentNode) {
    this._toolbarEl.parentNode.removeChild(this._toolbarEl);
  }
  this._toolbarEl = null;
  this._buttons   = {};
  this._customButtons = {};
};
