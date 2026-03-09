// ─────────────────────────────────────────────────────────────────────────────
// KeybindingManager.js — Custom keybinding registration via editor.addAction()
// ─────────────────────────────────────────────────────────────────────────────

/**
 * KeybindingManager
 *
 * Allows registering and removing custom keyboard shortcuts on the editor.
 * Uses editor.addAction() so shortcuts appear in the Command Palette.
 *
 * Keybinding string format (case-insensitive):
 *   "Ctrl+Shift+F"    → CtrlCmd | Shift | KEY_F
 *   "Alt+Enter"       → Alt | Enter
 *   "Ctrl+K Ctrl+D"   → chord(CtrlCmd | KEY_K, CtrlCmd | KEY_D)  [NOT SUPPORTED — use single chord]
 *
 * Available modifier tokens: Ctrl, CtrlCmd, Shift, Alt, WinCtrl
 * Available key tokens: any single letter A-Z, F1-F12,
 *   Enter, Escape, Backspace, Delete, Tab, Space, Home, End,
 *   PageUp, PageDown, Insert, ArrowUp, ArrowDown, ArrowLeft, ArrowRight,
 *   Slash, Minus, Period, Comma, Semicolon, Quote, BackQuote,
 *   BracketLeft, BracketRight, Backslash, Equal
 */
function KeybindingManager(monacoRef, editorRef, emitCallback) {
  this._monaco  = monacoRef;
  this._editor  = editorRef;
  this._emit    = emitCallback;
  this._actions = {}; // id → IDisposable
}

/**
 * Parse a human-friendly keybinding string into a Monaco numeric keybinding.
 *
 * @param {string} keybindingStr  e.g. "Ctrl+Shift+S"
 * @returns {number|null}
 */
KeybindingManager.prototype._parseKeybinding = function (keybindingStr) {
  if (!keybindingStr) return null;

  var monaco = this._monaco;
  var KM = monaco.KeyMod;
  var KC = monaco.KeyCode;

  // Key name → KeyCode mapping
  var keyMap = {
    'A': KC.KEY_A, 'B': KC.KEY_B, 'C': KC.KEY_C, 'D': KC.KEY_D, 'E': KC.KEY_E,
    'F': KC.KEY_F, 'G': KC.KEY_G, 'H': KC.KEY_H, 'I': KC.KEY_I, 'J': KC.KEY_J,
    'K': KC.KEY_K, 'L': KC.KEY_L, 'M': KC.KEY_M, 'N': KC.KEY_N, 'O': KC.KEY_O,
    'P': KC.KEY_P, 'Q': KC.KEY_Q, 'R': KC.KEY_R, 'S': KC.KEY_S, 'T': KC.KEY_T,
    'U': KC.KEY_U, 'V': KC.KEY_V, 'W': KC.KEY_W, 'X': KC.KEY_X, 'Y': KC.KEY_Y,
    'Z': KC.KEY_Z,
    'F1': KC.F1,   'F2': KC.F2,   'F3': KC.F3,   'F4': KC.F4,
    'F5': KC.F5,   'F6': KC.F6,   'F7': KC.F7,   'F8': KC.F8,
    'F9': KC.F9,   'F10': KC.F10, 'F11': KC.F11, 'F12': KC.F12,
    'ENTER':       KC.Enter,
    'ESCAPE':      KC.Escape,
    'BACKSPACE':   KC.Backspace,
    'DELETE':      KC.Delete,
    'TAB':         KC.Tab,
    'SPACE':       KC.Space,
    'HOME':        KC.Home,
    'END':         KC.End,
    'PAGEUP':      KC.PageUp,
    'PAGEDOWN':    KC.PageDown,
    'INSERT':      KC.Insert,
    'ARROWUP':     KC.UpArrow,
    'ARROWDOWN':   KC.DownArrow,
    'ARROWLEFT':   KC.LeftArrow,
    'ARROWRIGHT':  KC.RightArrow,
    'UP':          KC.UpArrow,
    'DOWN':        KC.DownArrow,
    'LEFT':        KC.LeftArrow,
    'RIGHT':       KC.RightArrow,
    'SLASH':       KC.US_SLASH,
    'MINUS':       KC.US_MINUS,
    'PERIOD':      KC.US_DOT,
    'COMMA':       KC.US_COMMA,
    'SEMICOLON':   KC.US_SEMICOLON,
    'QUOTE':       KC.US_QUOTE,
    'BACKTICK':    KC.US_BACKTICK,
    'BRACKETLEFT': KC.US_OPEN_SQUARE_BRACKET,
    'BRACKETRIGHT':KC.US_CLOSE_SQUARE_BRACKET,
    'BACKSLASH':   KC.US_BACKSLASH,
    'EQUAL':       KC.US_EQUAL,
    '/':           KC.US_SLASH
  };

  var parts = keybindingStr.toUpperCase().split('+').map(function (p) { return p.trim(); });
  var result = 0;

  for (var i = 0; i < parts.length; i++) {
    var part = parts[i];
    if (part === 'CTRL' || part === 'CTRLCMD') {
      result = result | KM.CtrlCmd;
    } else if (part === 'SHIFT') {
      result = result | KM.Shift;
    } else if (part === 'ALT') {
      result = result | KM.Alt;
    } else if (part === 'WIN' || part === 'WINCTRL' || part === 'META') {
      result = result | KM.WinCtrl;
    } else {
      // Key code
      if (keyMap[part] !== undefined) {
        result = result | keyMap[part];
      } else {
        console.warn('[KeybindingManager] Unknown key token:', part);
        return null;
      }
    }
  }

  return result;
};

/**
 * Register a custom keybinding.
 *
 * @param {object} descriptor
 *   {
 *     id:          string   — unique ID
 *     label:       string   — shown in Command Palette
 *     keybinding:  string   — e.g. "Ctrl+Shift+S" (optional)
 *     handler:     Function — called with the editor instance
 *     contextMenuGroupId?: string   — e.g. 'navigation'
 *     contextMenuOrder?:   number
 *   }
 */
KeybindingManager.prototype.addShortcut = function (descriptor) {
  if (!descriptor || !descriptor.id || typeof descriptor.handler !== 'function') {
    console.warn('[KeybindingManager] addShortcut: id and handler are required');
    return;
  }

  // Remove existing action with same id
  this.removeShortcut(descriptor.id);

  var self       = this;
  var keybinding = this._parseKeybinding(descriptor.keybinding);
  var actionDesc = {
    id:    descriptor.id,
    label: descriptor.label || descriptor.id,
    run:   function (editor) {
      descriptor.handler(editor);
      self._emit('onShortcutTriggered', descriptor.id);
    }
  };

  if (keybinding !== null && keybinding !== 0) {
    actionDesc.keybindings = [keybinding];
  }
  if (descriptor.contextMenuGroupId) {
    actionDesc.contextMenuGroupId = descriptor.contextMenuGroupId;
    actionDesc.contextMenuOrder   = descriptor.contextMenuOrder || 1;
  }

  var disposable = this._editor.addAction(actionDesc);
  this._actions[descriptor.id] = disposable;
};

/**
 * Remove a custom keybinding by id.
 * @param {string} id
 */
KeybindingManager.prototype.removeShortcut = function (id) {
  if (this._actions[id]) {
    this._actions[id].dispose();
    delete this._actions[id];
  }
};

/**
 * Dispose all registered shortcuts.
 */
KeybindingManager.prototype.dispose = function () {
  var ids = Object.keys(this._actions);
  for (var i = 0; i < ids.length; i++) {
    this._actions[ids[i]].dispose();
  }
  this._actions = {};
};
