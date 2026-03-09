// ─────────────────────────────────────────────────────────────────────────────
// ThemeManager.js — Manages theme switching and custom token colorization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ThemeManager
 *
 * Handles:
 *  - Switching between built-in Monaco themes ('vs', 'vs-dark', 'hc-black')
 *  - Registering and applying custom themes with token colorization rules
 *
 * NOTE: monaco.editor.setTheme() is GLOBAL — it affects every editor instance
 * on the page simultaneously. This is a known v0.21.3 limitation.
 */
function ThemeManager(monacoRef, emitCallback) {
  this._monaco = monacoRef;
  this._emit   = emitCallback;
  this._currentTheme = 'vs';
  this._customThemes = {}; // name → themeData
}

/**
 * Set the active theme.
 * @param {string} themeName  'vs' | 'vs-dark' | 'hc-black' | any registered custom theme
 */
ThemeManager.prototype.setTheme = function (themeName) {
  this._monaco.editor.setTheme(themeName);
  this._currentTheme = themeName;
  this._emit('onThemeChange', themeName);
};

/**
 * Get the current theme name.
 * @returns {string}
 */
ThemeManager.prototype.getTheme = function () {
  return this._currentTheme;
};

/**
 * Toggle between 'vs' (light) and 'vs-dark'. If the current theme is
 * 'hc-black' or a custom theme, it toggles to 'vs-dark'.
 */
ThemeManager.prototype.toggleTheme = function () {
  var next = this._currentTheme === 'vs' ? 'vs-dark' : 'vs';
  this.setTheme(next);
};

/**
 * Register a custom theme with Monaco, then optionally apply it.
 *
 * @param {string} name        - Unique theme name
 * @param {object} themeData   - IStandaloneThemeData:
 *   {
 *     base: 'vs' | 'vs-dark' | 'hc-black',
 *     inherit: boolean,
 *     rules: Array<{ token, foreground?, background?, fontStyle? }>,
 *     colors: { [colorId]: string }  e.g. { 'editor.background': '#1e1e1e' }
 *   }
 * @param {boolean} [apply=true]  Whether to immediately set this as the active theme
 */
ThemeManager.prototype.defineCustomTheme = function (name, themeData, apply) {
  this._monaco.editor.defineTheme(name, themeData);
  this._customThemes[name] = themeData;
  if (apply !== false) {
    this.setTheme(name);
  }
};

/**
 * Apply custom token colorization rules on top of the current theme.
 * Internally defines a new derived theme called '__custom_tokens' and applies it.
 *
 * @param {Array<{token: string, foreground?: string, background?: string, fontStyle?: string}>} rules
 */
ThemeManager.prototype.setCustomTokenColors = function (rules) {
  if (!Array.isArray(rules)) {
    console.warn('[ThemeManager] setCustomTokenColors: rules must be an array');
    return;
  }

  // Determine the base to inherit from
  var baseTheme = this._currentTheme;
  if (baseTheme !== 'vs' && baseTheme !== 'vs-dark' && baseTheme !== 'hc-black') {
    baseTheme = 'vs';
  }

  var customThemeData = {
    base:    baseTheme,
    inherit: true,
    rules:   rules,
    colors:  {}
  };

  this.defineCustomTheme('__custom_tokens', customThemeData, true);
  this._emit('onTokenColorsChange', rules);
};

/**
 * Returns an array of all registered custom theme names.
 * @returns {string[]}
 */
ThemeManager.prototype.getCustomThemeNames = function () {
  return Object.keys(this._customThemes);
};

/**
 * Dispose: no persistent resources to clean up (themes are global in Monaco)
 */
ThemeManager.prototype.dispose = function () {
  this._customThemes = {};
};
