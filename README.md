# Monaco Editor Wrapper

A reusable, framework-agnostic JavaScript wrapper around [monaco-editor@0.21.3](https://github.com/microsoft/monaco-editor).

## Quick Start

```
npx serve . -p 3000
```

Then open `http://localhost:3000/demo/` in your browser.

## File Structure

```
Monaco_Editor_Wrapper_Component/
├── src/
│   ├── constants.js          # Action IDs, defaults, toolbar config
│   ├── ThemeManager.js       # Theme switching + custom token colors
│   ├── SuggestionManager.js  # CompletionItemProvider registration
│   ├── ValidationManager.js  # setModelMarkers + validation loop
│   ├── KeybindingManager.js  # editor.addAction() keybinding manager
│   ├── ToolbarManager.js     # Toolbar DOM rendering + button management
│   └── MonacoWrapper.js      # Core wrapper class (public API)
├── demo/
│   ├── index.html            # Playground page
│   ├── demo.js               # Playground logic
│   └── demo.css              # Playground styles
├── PROMPT.md                 # Original implementation prompt
├── README.md
└── package.json
```

## Usage

```html
<!-- 1. Load Monaco via AMD -->
<script src="https://cdn.jsdelivr.net/npm/monaco-editor@0.21.3/min/vs/loader.js"></script>
<script>
  require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.21.3/min/vs' } });
  require(['vs/editor/editor.main'], function () {
    // 2. Load wrapper scripts
    // ... (see demo/index.html for sequential loader)
  });
</script>

<!-- 3. Container -->
<div id="editor" style="height:500px;"></div>
```

```js
var wrapper = new MonacoWrapper(document.getElementById('editor'), {
  value:    'console.log("hello")',
  language: 'javascript',
  theme:    'vs-dark',
  fontSize: 14,
  callbacks: {
    onChange: function(value) { console.log('changed:', value.length, 'chars'); },
    onFormat: function()      { console.log('formatted'); }
  }
});

// Public methods
wrapper.undo();
wrapper.redo();
wrapper.format();
wrapper.setTheme('vs-dark');
wrapper.setFontSize(16);
wrapper.setLanguage('typescript');
wrapper.getValue();
wrapper.setValue('new content');
wrapper.resetContent();
wrapper.destroy();
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `value` | `string` | `''` | Initial editor content |
| `language` | `string` | `'javascript'` | Language ID |
| `theme` | `string` | `'vs'` | `'vs'` \| `'vs-dark'` \| `'hc-black'` |
| `fontSize` | `number` | `14` | Font size in px |
| `lineNumbers` | `string` | `'on'` | `'on'`\|`'off'`\|`'relative'`\|`'interval'` |
| `wordWrap` | `string` | `'off'` | `'on'`\|`'off'` |
| `formatOnType` | `boolean` | `false` | Auto-format as user types |
| `formatOnLoad` | `boolean` | `false` | Auto-format when editor mounts |
| `readOnly` | `boolean` | `false` | Read-only mode |
| `minimap` | `boolean` | `true` | Show minimap |
| `matchBrackets` | `string` | `'always'` | `'always'`\|`'near'`\|`'never'` |
| `tabSize` | `number` | `4` | Tab size in spaces |
| `autoSuggestions` | `Array` | `[]` | Custom completion items |
| `validationFn` | `Function\|null` | `null` | Live validation function |
| `validationDelay` | `number` | `300` | Validation debounce (ms) |
| `toolbar` | `object` | see below | Toolbar configuration |
| `callbacks` | `object` | `{}` | Event callbacks |
| `icons` | `object` | `{}` | Icon HTML overrides |

### toolbar option

```js
toolbar: {
  show:          true,           // Show/hide entire toolbar
  buttons:       [...],          // Per-button visibility overrides
  customButtons: []              // Extra buttons to add
}
```

### callbacks

```js
callbacks: {
  onChange:                (value, event) => void,
  onUndo:                  () => void,
  onRedo:                  () => void,
  onCut:                   () => void,
  onCopy:                  (selectedText) => void,
  onIndent:                () => void,
  onOutdent:               () => void,
  onDuplicateLine:         () => void,
  onToggleComment:         (type) => void,  // 'line' | 'block'
  onDeleteLine:            () => void,
  onFind:                  (options) => void,
  onFormat:                () => void,
  onReset:                 () => void,
  onThemeChange:           (name) => void,
  onFontSizeChange:        (size) => void,
  onWordWrapChange:        (value) => void,
  onLineNumbersChange:     (mode) => void,
  onBracketMatchingChange: (value) => void,
  onFormatOnTypeChange:    (enabled) => void,
  onAutoSuggestionsChange: (enabled) => void,
  onSuggestionsRegistered: (language) => void,
  onMarkersChange:         (markers) => void,
  onValidation:            (errors) => void,
  onShortcutTriggered:     (id) => void,
  onCursorChange:          (position) => void,
  onSelectionChange:       (selection) => void,
  onFocus:                 () => void,
  onBlur:                  () => void,
  onLanguageChange:        (langId) => void
}
```

## Public Methods

| Method | Description |
|--------|-------------|
| `getValue()` | Get current content |
| `setValue(value)` | Set content |
| `getLanguage()` | Get current language ID |
| `setLanguage(langId)` | Change language |
| `getTheme()` | Get current theme |
| `setTheme(name)` | Set theme |
| `toggleTheme()` | Toggle vs ↔ vs-dark |
| `getFontSize()` | Get font size |
| `setFontSize(size)` | Set font size |
| `setLineNumbers(mode)` | Set line numbers mode |
| `setWordWrap(value)` | Set word wrap |
| `toggleWordWrap()` | Toggle word wrap on/off |
| `setReadOnly(flag)` | Toggle read-only |
| `setMinimap(enabled)` | Toggle minimap |
| `setBracketMatching(value)` | Set bracket matching |
| `setFormatOnType(enabled)` | Toggle format-on-type |
| `setTabSize(size)` | Set tab size |
| `updateOptions(opts)` | Pass-through to editor.updateOptions |
| `undo()` | Undo |
| `redo()` | Redo |
| `cut()` | Cut selection |
| `copy()` | Copy selection |
| `indent()` | Indent selected lines |
| `outdent()` | Outdent selected lines |
| `duplicateLine()` | Duplicate current line |
| `toggleLineComment()` | Toggle line comment |
| `toggleBlockComment()` | Toggle block comment |
| `deleteLine()` | Delete current line |
| `triggerFind(opts?)` | Open find widget |
| `format()` | Format document |
| `resetContent()` | Reset to original value |
| `setOriginalValue(value)` | Update the reset baseline |
| `getSelection()` | Get selected text |
| `getPosition()` | Get cursor position |
| `setPosition(line, col)` | Move cursor |
| `revealLine(lineNumber)` | Scroll to line |
| `focus()` | Focus the editor |
| `layout()` | Force layout recalc |
| `registerSuggestions(lang, items)` | Register custom completions |
| `clearSuggestions(lang)` | Remove custom completions |
| `setAutoSuggestionsEnabled(flag)` | Toggle built-in suggestions |
| `setMarkers(markers)` | Set model markers |
| `clearMarkers()` | Clear all markers |
| `setValidationFn(fn, delay?)` | Set live validation function |
| `clearValidation()` | Remove validation |
| `addShortcut(descriptor)` | Add custom keybinding |
| `removeShortcut(id)` | Remove custom keybinding |
| `setCustomTokenColors(rules)` | Apply token color rules |
| `defineCustomTheme(name, data, apply?)` | Register custom theme |
| `showButton(id)` | Show toolbar button |
| `hideButton(id)` | Hide toolbar button |
| `addCustomButton(config)` | Add custom toolbar button |
| `removeCustomButton(id)` | Remove custom toolbar button |
| `setIcons(iconsMap)` | Override toolbar icons |
| `on(event, handler)` | Subscribe to events |
| `off(event, handler)` | Unsubscribe from events |
| `getEditor()` | Raw Monaco editor (escape hatch) |
| `getModel()` | Raw Monaco model (escape hatch) |
| `destroy()` | Dispose all resources |

## Custom Suggestions

```js
wrapper.registerSuggestions('javascript', [
  {
    label:      'fetchData',
    detail:     'Fetch data from API',
    insertText: 'fetchData(url)',
    kind:       'function',
    documentation: 'Fetches JSON from the given URL.'
  }
]);
```

## Live Validation

```js
wrapper.setValidationFn(function (value) {
  var errors = [];
  var lines  = value.split('\n');
  lines.forEach(function (line, i) {
    if (line.length > 100) {
      errors.push({
        startLineNumber: i + 1,
        startColumn:     101,
        endLineNumber:   i + 1,
        endColumn:       line.length + 1,
        message:         'Line too long (> 100 chars)',
        severity:        'warning'
      });
    }
  });
  return errors;
}, 500); // 500ms debounce
```

## Custom Keybindings

```js
wrapper.addShortcut({
  id:         'myApp.save',
  label:      'Save File',
  keybinding: 'Ctrl+S',
  handler:    function (editor) {
    console.log('saving:', editor.getValue());
  }
});
```

## Known v0.21.3 Quirks

- `matchBrackets` is a **string enum** (`'always'`, `'near'`, `'never'`) — not a boolean.
- `CompletionItem.range` is **required** — computed from `model.getWordUntilPosition()`.
- `monaco.editor.setTheme()` is **global** — affects all editor instances.
- `editor.trigger('', 'undo', null)` — undo/redo use **unnamespaced** command IDs.
- `clipboardCutAction`/`clipboardCopyAction` do **not** access the system clipboard in browsers; wrapper additionally calls `navigator.clipboard.writeText()`.
- `editor.action.formatDocument` does nothing unless a `DocumentFormattingEditProvider` is registered; wrapper ships one for `json` out of the box.
- No bracket pair colorization (added in v0.30.0).
- No inline suggestions / ghost text (added in v0.32.0).
