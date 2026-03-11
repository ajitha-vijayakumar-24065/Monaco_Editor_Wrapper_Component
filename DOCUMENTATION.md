# Monaco Editor Wrapper — Comprehensive Documentation

> **Version:** 1.0.0 | **Monaco:** v0.21.3 | **Environment:** Browser-only, plain JS, AMD CDN, no build tools

---

## Table of Contents

1. [Overview](#1-overview)
2. [Project Structure](#2-project-structure)
3. [Quick Start](#3-quick-start)
4. [Configuration Options (JSON Structure)](#4-configuration-options-json-structure)
5. [Public API Reference](#5-public-api-reference)
   - [Content](#51-content)
   - [Language & Theme](#52-language--theme)
   - [Editor Options](#53-editor-options)
   - [Editor Operations](#54-editor-operations)
   - [Cursor & Selection](#55-cursor--selection)
   - [Intelligence & Completions](#56-intelligence--completions)
   - [Error & Validation](#57-error--validation)
   - [Keybindings](#58-keybindings)
   - [Toolbar](#59-toolbar)
   - [Events](#510-events)
   - [File System (VFS)](#511-file-system-vfs)
   - [Library / IntelliSense Pipeline](#512-library--intellisense-pipeline)
   - [Lifecycle](#513-lifecycle)
   - [Escape Hatches](#514-escape-hatches)
6. [Callbacks & Events Reference](#6-callbacks--events-reference)
7. [Toolbar Buttons Reference](#7-toolbar-buttons-reference)
8. [Supported Languages](#8-supported-languages)
9. [Suggestion Kind Values](#9-suggestion-kind-values)
10. [Validation Markers](#10-validation-markers)
11. [Virtual File System (VFS)](#11-virtual-file-system-vfs)
12. [Library IntelliSense Pipeline](#12-library-intellisense-pipeline)
13. [Language Analyzers](#13-language-analyzers)
14. [Architecture Overview](#14-architecture-overview)
15. [Code Examples & Recipes](#15-code-examples--recipes)
16. [FAQ](#16-faq)

---

## 1. Overview

The **Monaco Editor Wrapper** is a reusable, framework-agnostic JavaScript component built on top of [Monaco Editor](https://microsoft.github.io/monaco-editor/) v0.21.3 — the same engine that powers VS Code.

It wraps the raw Monaco API behind a clean, callback-driven interface with:

- **30+ features** out of the box (themes, toolbar, validation, suggestions, keybindings, etc.)
- A **Virtual File System (VFS)** for multi-file editing with tab management
- A **library IntelliSense pipeline** that analyzes a JS source file, generates a `.d.ts` declaration, and injects it into Monaco so dot-completion works
- **6 language analyzers** (JS, TS, JSON, CSS, SQL, YAML) for symbol extraction
- Zero dependencies beyond Monaco itself — plain JS, works in any browser

---

## 2. Project Structure

```
Monaco_Editor_Wrapper_Component/
├── index.html                        # Entry point (loads all scripts)
├── src/
│   ├── constants.js                  # DEFAULT_OPTIONS, ACTION_IDS, toolbar config, etc.
│   ├── MonacoWrapper.js              # Core wrapper class (62 public methods)
│   ├── ThemeManager.js               # Theme switching & custom theme definition
│   ├── SuggestionManager.js          # Custom completion item provider
│   ├── SuggestionGenerator.js        # Generates suggestion items from symbols
│   ├── ValidationManager.js          # Marker (squiggle) & live validation
│   ├── KeybindingManager.js          # Custom keyboard shortcut registration
│   ├── ToolbarManager.js             # Toolbar render & button event wiring
│   ├── FileSystemManager.js          # In-memory VFS (files & folders)
│   ├── ModelManager.js               # Monaco model lifecycle & tab tracking
│   ├── TabBar.js                     # Tab bar UI component
│   ├── FilePanel.js                  # File explorer panel UI
│   ├── ExtraLibManager.js            # addExtraLib registry (for d.ts injection)
│   ├── LibraryProviderManager.js     # Dot-trigger completion provider
│   ├── DtsGenerator.js               # Converts raw symbols → TypeScript d.ts
│   ├── SuggestionMapper.js           # Maps raw symbols → Monaco CompletionItems
│   ├── SuggestionMerger.js           # Merges multiple suggestion sources
│   └── analyzers/
│       ├── AnalyzerEngine.js         # Routes source text to the right analyzer
│       ├── JSAnalyzer.js             # JavaScript / JSX symbol extractor
│       ├── TSAnalyzer.js             # TypeScript symbol extractor
│       ├── JSONAnalyzer.js           # JSON key extractor
│       ├── CSSAnalyzer.js            # CSS selector / variable extractor
│       ├── SQLAnalyzer.js            # SQL token extractor
│       └── YAMLAnalyzer.js           # YAML key extractor
├── demo/
│   ├── index.html                    # Full interactive demo page
│   ├── demo.js                       # Demo initialization & event wiring
│   └── demo.css                      # Demo page styles
└── api/
    └── suggestion-api.js             # REST suggestion API helper
```

---

## 3. Quick Start

### 1. Load Monaco AMD loader in your HTML

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.21.3/min/vs/loader.min.js"></script>
<script>
  require.config({
    paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.21.3/min/vs' }
  });
  require(['vs/editor/editor.main'], function () {
    // Monaco is ready — load wrapper scripts here
  });
</script>
```

### 2. Load the wrapper scripts (in order)

```html
<script src="src/constants.js"></script>
<script src="src/ThemeManager.js"></script>
<script src="src/SuggestionManager.js"></script>
<script src="src/ValidationManager.js"></script>
<script src="src/KeybindingManager.js"></script>
<script src="src/ToolbarManager.js"></script>
<script src="src/FileSystemManager.js"></script>
<script src="src/ModelManager.js"></script>
<script src="src/TabBar.js"></script>
<script src="src/FilePanel.js"></script>
<script src="src/ExtraLibManager.js"></script>
<script src="src/LibraryProviderManager.js"></script>
<script src="src/DtsGenerator.js"></script>
<script src="src/SuggestionMapper.js"></script>
<script src="src/SuggestionMerger.js"></script>
<script src="src/SuggestionGenerator.js"></script>
<script src="src/analyzers/JSAnalyzer.js"></script>
<script src="src/analyzers/TSAnalyzer.js"></script>
<script src="src/analyzers/JSONAnalyzer.js"></script>
<script src="src/analyzers/CSSAnalyzer.js"></script>
<script src="src/analyzers/SQLAnalyzer.js"></script>
<script src="src/analyzers/YAMLAnalyzer.js"></script>
<script src="src/analyzers/AnalyzerEngine.js"></script>
<script src="src/MonacoWrapper.js"></script>
```

### 3. Create the wrapper

```html
<div id="editor" style="width: 100%; height: 500px;"></div>

<script>
  var editor = new MonacoWrapper(document.getElementById('editor'), {
    value:    'console.log("Hello, Monaco!");',
    language: 'javascript',
    theme:    'vs-dark',
    callbacks: {
      onChange: function(value) {
        console.log('Content changed:', value.length, 'chars');
      }
    }
  });
</script>
```

---

## 4. Configuration Options (JSON Structure)

This is the full options object you can pass to `new MonacoWrapper(container, options)`.

```json
{
  "value": "",
  "language": "javascript",
  "theme": "vs",
  "fontSize": 14,
  "fontFamily": "Consolas, 'Courier New', monospace",
  "lineNumbers": "on",
  "wordWrap": "off",
  "formatOnType": false,
  "formatOnLoad": false,
  "readOnly": false,
  "minimap": true,
  "matchBrackets": "always",
  "tabSize": 4,
  "insertSpaces": true,
  "scrollBeyondLastLine": false,
  "automaticLayout": true,
  "autoSuggestions": [],
  "validationFn": null,
  "validationDelay": 300,
  "initialFileName": "main.js",
  "toolbar": {
    "show": true,
    "buttons": null,
    "customButtons": []
  },
  "callbacks": {
    "onChange": null,
    "onCursorChange": null,
    "onSelectionChange": null,
    "onFocus": null,
    "onBlur": null,
    "onLanguageChange": null,
    "onThemeChange": null,
    "onFontSizeChange": null,
    "onLineNumbersChange": null,
    "onWordWrapChange": null,
    "onBracketMatchingChange": null,
    "onFormatOnTypeChange": null,
    "onUndo": null,
    "onRedo": null,
    "onCut": null,
    "onCopy": null,
    "onIndent": null,
    "onOutdent": null,
    "onDuplicateLine": null,
    "onToggleComment": null,
    "onDeleteLine": null,
    "onFind": null,
    "onFormat": null,
    "onReset": null,
    "onAutoSuggestionsChange": null,
    "onFileSwitch": null,
    "onFileDirty": null,
    "onFileClean": null
  },
  "icons": {}
}
```

### Option Descriptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `value` | `string` | `''` | Initial editor content |
| `language` | `string` | `'javascript'` | Language mode ID |
| `theme` | `string` | `'vs'` | Editor theme (`'vs'`, `'vs-dark'`, `'hc-black'`, or custom name) |
| `fontSize` | `number` | `14` | Editor font size in pixels |
| `fontFamily` | `string` | `"Consolas, 'Courier New', monospace"` | Editor font family |
| `lineNumbers` | `string\|function` | `'on'` | `'on'` \| `'off'` \| `'relative'` \| `'interval'` \| custom function |
| `wordWrap` | `string` | `'off'` | `'on'` \| `'off'` \| `'wordWrapColumn'` \| `'bounded'` |
| `formatOnType` | `boolean` | `false` | Auto-format as you type |
| `formatOnLoad` | `boolean` | `false` | Format document automatically after editor loads |
| `readOnly` | `boolean` | `false` | Make the editor read-only |
| `minimap` | `boolean` | `true` | Show/hide the minimap pane |
| `matchBrackets` | `string\|boolean` | `'always'` | `'always'` \| `'near'` \| `'never'` \| `true` \| `false` |
| `tabSize` | `number` | `4` | Number of spaces per tab stop |
| `insertSpaces` | `boolean` | `true` | Insert spaces instead of tab characters |
| `scrollBeyondLastLine` | `boolean` | `false` | Allow scrolling past the last line |
| `automaticLayout` | `boolean` | `true` | Auto-resize when container size changes |
| `autoSuggestions` | `array` | `[]` | Array of custom suggestion items (see §5.6) |
| `validationFn` | `function\|null` | `null` | Live validation function `(value) => errorArray` |
| `validationDelay` | `number` | `300` | Milliseconds to debounce validation after typing |
| `initialFileName` | `string` | `'main.js'` | Filename for the initial VFS file |
| `toolbar.show` | `boolean` | `true` | Show or hide the entire toolbar |
| `toolbar.buttons` | `array\|null` | `null` | Custom button list; `null` uses all built-in buttons |
| `toolbar.customButtons` | `array` | `[]` | Extra buttons to append to the toolbar |
| `callbacks` | `object` | `{}` | Map of callback name → handler function |
| `icons` | `object` | `{}` | Override toolbar button icons with custom SVG/HTML strings |

---

## 5. Public API Reference

All methods are on the `MonacoWrapper` prototype.

### 5.1 Content

#### `getValue() → string`
Returns the current full text content of the editor.

```js
var code = editor.getValue();
```

#### `setValue(value: string)`
Replaces the editor content while preserving the undo stack (uses `pushEditOperations` internally).

```js
editor.setValue('function hello() { return "world"; }');
```

#### `resetContent()`
Resets the editor to the value originally passed at construction time (`options.value`). This **clears the undo stack**.

```js
editor.resetContent();
```

#### `setOriginalValue(value: string)`
Updates the "original" snapshot used by `resetContent()`. Call this when reusing the editor with new content.

```js
editor.setOriginalValue(newStartingContent);
```

---

### 5.2 Language & Theme

#### `getLanguage() → string`
Returns the current language ID.

#### `setLanguage(langId: string)`
Changes the syntax highlighting and language services.

```js
editor.setLanguage('typescript');
```

Supported values: `javascript`, `typescript`, `json`, `sql`, `python`, `html`, `css`, `yaml`, `markdown`, `plaintext`

#### `getTheme() → string`
Returns the current theme name.

#### `setTheme(themeName: string)`
Applies a named theme.

```js
editor.setTheme('vs-dark');   // dark
editor.setTheme('vs');        // light
editor.setTheme('hc-black');  // high contrast
```

#### `toggleTheme()`
Toggles between `'vs'` (light) and `'vs-dark'` (dark).

#### `defineCustomTheme(name: string, themeData: object, apply?: boolean)`
Defines a custom Monaco theme. Pass `apply = true` to immediately apply it.

```js
editor.defineCustomTheme('my-theme', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'keyword', foreground: 'ff79c6', fontStyle: 'bold' },
    { token: 'string',  foreground: 'f1fa8c' }
  ],
  colors: {
    'editor.background': '#282a36'
  }
}, true);
```

#### `setCustomTokenColors(rules: array)`
Applies additional token color rules to the currently active theme.

```js
editor.setCustomTokenColors([
  { token: 'comment', foreground: '6272a4', fontStyle: 'italic' }
]);
```

---

### 5.3 Editor Options

#### `getFontSize() → number`
#### `setFontSize(size: number)`

```js
editor.setFontSize(16);
```

#### `setLineNumbers(mode: string|function)`
Values: `'on'`, `'off'`, `'relative'`, `'interval'`, or a function `(lineNumber) => string`.

#### `setWordWrap(value: string)`
Values: `'on'`, `'off'`, `'wordWrapColumn'`, `'bounded'`.

#### `toggleWordWrap()`
Toggles between `'on'` and `'off'`.

#### `setReadOnly(flag: boolean)`
Sets or clears read-only mode.

#### `setMinimap(enabled: boolean)`
Shows or hides the minimap.

#### `setBracketMatching(value: string|boolean)`
Values: `'always'`, `'near'`, `'never'`, `true` (= `'always'`), `false` (= `'never'`).

#### `setFormatOnType(enabled: boolean)`
Enables or disables auto-formatting while typing.

#### `setTabSize(size: number)`
Sets the tab stop width.

#### `updateOptions(opts: object)`
Direct pass-through to `editor.updateOptions()` for any Monaco option not covered by the above helpers.

```js
editor.updateOptions({ cursorStyle: 'block', renderWhitespace: 'all' });
```

---

### 5.4 Editor Operations

All operations fire the corresponding callback (see §6).

| Method | Description | Default Keybinding |
|--------|-------------|-------------------|
| `undo()` | Undo last change | `Ctrl+Z` |
| `redo()` | Redo last undone change | `Ctrl+Y` |
| `cut()` | Cut selection to clipboard | `Ctrl+X` |
| `copy() → string` | Copy selection to clipboard; returns selected text | `Ctrl+C` |
| `indent()` | Indent selected lines | `Tab` |
| `outdent()` | Outdent selected lines | `Shift+Tab` |
| `duplicateLine()` | Duplicate current line downward | `Shift+Alt+↓` |
| `toggleLineComment()` | Toggle `//` line comment | `Ctrl+/` |
| `toggleBlockComment()` | Toggle `/* */` block comment | `Shift+Alt+A` |
| `deleteLine()` | Delete the current line | `Ctrl+Shift+K` |
| `triggerFind(options?)` | Open the Find widget | `Ctrl+F` |
| `format() → Promise?` | Format the full document | `Shift+Alt+F` |

---

### 5.5 Cursor & Selection

#### `getSelection() → string`
Returns the currently selected text.

#### `getPosition() → { lineNumber: number, column: number }`
Returns the current cursor position.

#### `setPosition(lineNumber: number, column: number)`
Moves the cursor to the specified position.

```js
editor.setPosition(10, 1); // line 10, column 1
```

#### `revealLine(lineNumber: number)`
Scrolls the editor so the given line is centered in the viewport.

#### `focus()`
Gives keyboard focus to the editor.

#### `layout()`
Forces the editor to recalculate its layout. Call this after programmatically resizing the container.

---

### 5.6 Intelligence & Completions

#### `registerSuggestions(language: string, suggestions: array)`
Registers custom auto-completion items for a language. Items can be provided inline at creation time via `options.autoSuggestions`.

**Suggestion item shape:**

```json
{
  "label": "myFunction",
  "kind": "function",
  "insertText": "myFunction(${1:arg})",
  "documentation": "Calls myFunction with the given arg",
  "detail": "MyLibrary"
}
```

- `kind` is a string key from the [Suggestion Kind Values table](#9-suggestion-kind-values)
- `insertText` supports snippet syntax (`${1:placeholder}`)

```js
editor.registerSuggestions('javascript', [
  { label: 'log', kind: 'function', insertText: 'console.log(${1:value})', documentation: 'Log to console' },
  { label: 'MAX_SIZE', kind: 'constant', insertText: 'MAX_SIZE', documentation: '1024' }
]);
```

#### `clearSuggestions(language: string)`
Removes all registered custom suggestions for a language.

#### `getSuggestions(language?: string) → array`
Returns the currently registered suggestions. Defaults to the active language.

#### `setAutoSuggestionsEnabled(enabled: boolean)`
Toggles Monaco's built-in quick-suggestion popup and trigger-character suggestions.

---

### 5.7 Error & Validation

#### `setMarkers(markers: array)`
Directly sets error/warning squiggles on the editor.

**Marker object shape:**

```json
{
  "startLineNumber": 3,
  "startColumn": 1,
  "endLineNumber": 3,
  "endColumn": 20,
  "message": "Undefined variable 'foo'",
  "severity": "error"
}
```

Severity values: `"hint"` (1), `"info"` (2), `"warning"` (4), `"error"` (8)

```js
editor.setMarkers([
  {
    startLineNumber: 5, startColumn: 1,
    endLineNumber: 5,   endColumn: 15,
    message: 'Missing semicolon',
    severity: 'warning'
  }
]);
```

#### `clearMarkers()`
Removes all markers from the editor.

#### `setValidationFn(fn: function, delay?: number)`
Installs a live validation function that runs automatically after each change (debounced by `delay` ms, default 300).

The function receives the current editor value and must return an array of error objects.

```js
editor.setValidationFn(function(value) {
  var errors = [];
  if (value.includes('eval(')) {
    errors.push({
      startLineNumber: 1, startColumn: 1,
      endLineNumber: 1, endColumn: value.indexOf('eval(') + 5,
      message: 'eval() is not allowed',
      severity: 'error'
    });
  }
  return errors;
}, 500);
```

#### `clearValidation()`
Removes the validation function and clears all validation markers.

---

### 5.8 Keybindings

#### `addShortcut(descriptor: object)`
Registers a custom keyboard shortcut using Monaco's `addCommand` API.

**Descriptor shape:**

```json
{
  "id": "my-action",
  "label": "My Custom Action",
  "keybinding": "Ctrl+Shift+P",
  "handler": null
}
```

- `keybinding` is a string combining modifier keys and a key name, joined with `+`
- Supported modifiers: `Ctrl`, `Shift`, `Alt`, `Meta`
- Handler is a function `() => void`

```js
editor.addShortcut({
  id:          'save-action',
  label:       'Save File',
  keybinding:  'Ctrl+S',
  handler:     function() { saveToServer(editor.getValue()); }
});
```

#### `removeShortcut(id: string)`
Removes a previously registered shortcut by its ID.

---

### 5.9 Toolbar

The toolbar sits above the editor and provides quick access to common operations.

#### `showButton(id: string)`
Makes a hidden toolbar button visible.

#### `hideButton(id: string)`
Hides a toolbar button (it remains registered but invisible).

#### `addCustomButton(config: object)`
Adds a new button to the toolbar.

```js
editor.addCustomButton({
  id:      'my-btn',
  label:   'Run',
  title:   'Run Code (Ctrl+Enter)',
  icon:    '<svg ...>...</svg>',
  onClick: function() { runCode(editor.getValue()); }
});
```

#### `removeCustomButton(id: string)`
Removes a custom button from the toolbar.

#### `setIcons(iconsMap: object)`
Overrides the SVG icons for built-in toolbar buttons.

```js
editor.setIcons({
  format: '<img src="my-format-icon.png" width="16" height="16">',
  theme:  '<svg>...</svg>'
});
```

---

### 5.10 Events

Two parallel event systems are supported: constructor callbacks and post-init listeners.

#### Constructor callbacks (recommended for initial setup)

Pass a `callbacks` object in the options:

```js
new MonacoWrapper(container, {
  callbacks: {
    onChange:       function(value) { ... },
    onCursorChange: function(position) { ... }
  }
});
```

#### Post-init event listeners

#### `on(eventName: string, handler: function)`
Subscribe to an event after construction.

```js
editor.on('onChange', function(data) {
  console.log('New value:', data.value);
});
```

#### `off(eventName: string, handler: function)`
Unsubscribe a specific handler.

```js
var handler = function(data) { ... };
editor.on('onChange', handler);
// later:
editor.off('onChange', handler);
```

> **Note:** Callback functions receive raw arguments. `.on()` handlers receive a single `data` object.

---

### 5.11 File System (VFS)

The wrapper maintains an in-memory Virtual File System (VFS) with folder/file nodes and per-file Monaco models.

#### `addFile(name, parentId, content, language) → node`
Creates a new file in the VFS.

```js
var file = editor.addFile('utils.js', null, '// utilities\n', 'javascript');
console.log(file.id); // auto-generated UUID
```

#### `addFolder(name, parentId) → node`
Creates a new folder.

```js
var folder = editor.addFolder('components', null);
editor.addFile('Button.js', folder.id, '// Button component\n', 'javascript');
```

#### `openFile(fileId) → ITextModel`
Switches the editor to display the file with the given ID. Fires `onFileSwitch`.

#### `closeFile(fileId) → string|null`
Closes the file's tab and returns the next active file ID, or `null` if no files remain.

#### `deleteNode(id)`
Deletes a file or folder (and all its children) from the VFS.

#### `renameNode(id, newName) → node`
Renames a file or folder. Automatically re-creates the Monaco model if the extension changes.

#### `duplicateFile(id) → node`
Creates a copy of a file with a new unique name.

#### `getAllFiles() → node[]`
Returns all file nodes in the VFS (flat array).

#### `getFileNode(id) → node|null`
Returns the VFS node for the given ID.

#### `getActiveFileId() → string|null`
Returns the ID of the currently open file.

#### `getOpenFileIds() → string[]`
Returns IDs of all open tabs in order.

#### `saveActiveFile()`
Persists the current model content to the VFS node and clears the dirty flag.

#### `isFileDirty(fileId) → boolean`
Returns `true` if the file has unsaved changes.

#### `exportVFS() → object`
Serializes the entire VFS to a plain JSON object. Persists all open models first.

```js
var snapshot = editor.exportVFS();
localStorage.setItem('vfs', JSON.stringify(snapshot));
```

#### `importVFS(data: object)`
Replaces the current VFS with data returned by `exportVFS()`.

```js
var saved = JSON.parse(localStorage.getItem('vfs'));
editor.importVFS(saved);
```

---

### 5.12 Library / IntelliSense Pipeline

#### `loadLibrary(text: string, opts?: object) → { libId, symbolCount, dts }`
Analyzes a JS source string, generates a `.d.ts` declaration file, and injects it into the Monaco TypeScript worker so typing `LibName.` shows auto-completions.

```js
var result = editor.loadLibrary(myLibrarySourceCode, {
  filename: 'myLib.js',
  libId:    'myLib'
});
console.log(result.symbolCount); // number of symbols found
console.log(result.dts);         // the generated TypeScript declaration string
```

#### `unloadLibrary(libId: string)`
Removes a loaded library and disposes its IntelliSense registrations.

#### `getLibraryDts(libId: string) → string`
Returns the generated `.d.ts` string for an already-loaded library.

#### `getLoadedLibraries() → array`
Returns summary info for all loaded libraries:

```js
[
  { libId: 'myLib', filename: 'myLib.js', symbolCount: 42, dtsLength: 3200 }
]
```

#### `analyzeLibrary(text: string, opts?: object) → symbol[]`
Runs the JS analyzer on a source string and returns raw symbols **without** loading the library. Useful for previewing what will be extracted.

---

### 5.13 Lifecycle

#### `destroy()`
Cleans up all resources: disposes all event subscriptions, sub-managers, Monaco editor, and Monaco model. Removes all DOM elements added to the container.

Always call `destroy()` when removing the editor from the page:

```js
editor.destroy();
```

---

### 5.14 Escape Hatches

#### `getEditor() → IStandaloneCodeEditor`
Returns the raw Monaco editor instance for direct API access.

```js
var monacoEditor = editor.getEditor();
monacoEditor.addAction({ ... }); // raw Monaco API
```

#### `getModel() → ITextModel`
Returns the raw Monaco text model.

```js
var model = editor.getModel();
var lineCount = model.getLineCount();
```

---

## 6. Callbacks & Events Reference

All 33 events are available both as constructor `callbacks` and as `.on()` listeners.

| Event Name | Fired When | Callback Args | `.on()` Data |
|------------|-----------|---------------|--------------|
| `onChange` | Content changes | `(value, monacoEvent)` | `{ value, event }` |
| `onCursorChange` | Cursor moves | `(position)` | `position` |
| `onSelectionChange` | Selection changes | `(selection)` | `selection` |
| `onFocus` | Editor gains focus | `()` | `undefined` |
| `onBlur` | Editor loses focus | `()` | `undefined` |
| `onLanguageChange` | Language changed | `(langId)` | `langId` |
| `onThemeChange` | Theme changed | `(themeName)` | `themeName` |
| `onFontSizeChange` | Font size changed | `(size)` | `size` |
| `onLineNumbersChange` | Line numbers mode changed | `(mode)` | `mode` |
| `onWordWrapChange` | Word wrap changed | `(value)` | `value` |
| `onBracketMatchingChange` | Bracket matching changed | `(value)` | `value` |
| `onFormatOnTypeChange` | Format-on-type toggled | `(enabled)` | `enabled` |
| `onUndo` | Undo triggered | `()` | `undefined` |
| `onRedo` | Redo triggered | `()` | `undefined` |
| `onCut` | Cut triggered | `()` | `undefined` |
| `onCopy` | Copy triggered | `(selectedText)` | `selectedText` |
| `onIndent` | Indent triggered | `()` | `undefined` |
| `onOutdent` | Outdent triggered | `()` | `undefined` |
| `onDuplicateLine` | Duplicate line triggered | `()` | `undefined` |
| `onToggleComment` | Comment toggled | `('line'\|'block')` | `'line'\|'block'` |
| `onDeleteLine` | Delete line triggered | `()` | `undefined` |
| `onFind` | Find widget opened | `(options)` | `options` |
| `onFormat` | Format completed | `()` | `undefined` |
| `onReset` | Content reset to original | `()` | `undefined` |
| `onAutoSuggestionsChange` | Auto suggestions toggled | `(enabled)` | `enabled` |
| `onFileSwitch` | Active file changed | `({ fileId, name })` | `{ fileId, name }` |
| `onFileDirty` | File has unsaved changes | `({ fileId })` | `{ fileId }` |
| `onFileClean` | File saved / no changes | `({ fileId })` | `{ fileId }` |

---

## 7. Toolbar Buttons Reference

The toolbar contains 15 built-in buttons. `visible` indicates whether the button is shown by default.

| ID | Label | Default Keybinding | Visible |
|----|-------|--------------------|---------|
| `undo` | Undo | `Ctrl+Z` | ✓ |
| `redo` | Redo | `Ctrl+Y` | ✓ |
| `cut` | Cut | `Ctrl+X` | ✓ |
| `copy` | Copy | `Ctrl+C` | ✓ |
| `indent` | Indent | `Tab` | ✓ |
| `outdent` | Outdent | `Shift+Tab` | ✓ |
| `commentLine` | Comment | `Ctrl+/` | ✓ |
| `blockComment` | Block Comment | `Shift+Alt+A` | ✗ |
| `deleteLine` | Delete Line | `Ctrl+Shift+K` | ✗ |
| `duplicateLine` | Duplicate | `Shift+Alt+↓` | ✗ |
| `find` | Find | `Ctrl+F` | ✓ |
| `format` | Format | `Shift+Alt+F` | ✓ |
| `wordWrap` | Word Wrap | `Alt+Z` | ✓ |
| `theme` | Dark Mode | — | ✓ |
| `reset` | Reset | — | ✓ |

### Showing hidden buttons

```js
editor.showButton('deleteLine');
editor.showButton('duplicateLine');
editor.showButton('blockComment');
```

### Specifying a custom subset

```js
new MonacoWrapper(container, {
  toolbar: {
    show: true,
    buttons: ['undo', 'redo', 'format', 'theme']  // only these four
  }
});
```

---

## 8. Supported Languages

| Language ID | File Extensions |
|-------------|----------------|
| `javascript` | `.js`, `.mjs`, `.cjs`, `.jsx` |
| `typescript` | `.ts`, `.tsx` |
| `json` | `.json` |
| `css` | `.css`, `.scss`, `.less` |
| `html` | `.html`, `.htm` |
| `sql` | `.sql` |
| `python` | `.py` |
| `yaml` | `.yaml`, `.yml`, `.env` |
| `markdown` | `.md`, `.markdown` |
| `plaintext` | `.txt` |

---

## 9. Suggestion Kind Values

Used in `registerSuggestions()` item `kind` field and in the `COMPLETION_KIND_MAP`.

| String Key | Numeric Value | Icon Shown |
|------------|:---:|-----------|
| `method` | 0 | Method symbol |
| `function` | 1 | Function symbol |
| `constructor` | 2 | Constructor symbol |
| `field` | 3 | Field symbol |
| `variable` | 4 | Variable symbol |
| `class` | 5 | Class symbol |
| `struct` | 6 | Struct symbol |
| `interface` | 7 | Interface symbol |
| `module` | 8 | Module symbol |
| `property` | 9 | Property symbol |
| `event` | 10 | Event symbol |
| `operator` | 11 | Operator symbol |
| `unit` | 12 | Unit symbol |
| `value` | 13 | Value symbol |
| `constant` | 14 | Constant symbol |
| `enum` | 15 | Enum symbol |
| `enumMember` | 16 | Enum member symbol |
| `keyword` | 17 | Keyword symbol |
| `text` | 18 | Text symbol |
| `color` | 19 | Color swatch |
| `file` | 20 | File icon |
| `reference` | 21 | Reference icon |
| `customcolor` | 22 | Custom color |
| `folder` | 23 | Folder icon |
| `typeParameter` | 24 | Type parameter |
| `snippet` | 25 | Snippet icon |

---

## 10. Validation Markers

The validation system uses Monaco's `editor.setModelMarkers` under the hood.

### Marker severity values

| String | Numeric | Meaning |
|--------|:-------:|---------|
| `'hint'` | 1 | Hint (gray dot) |
| `'info'` | 2 | Information (blue dot) |
| `'warning'` | 4 | Warning (yellow squiggle) |
| `'error'` | 8 | Error (red squiggle) |

### Full marker object shape

```js
{
  startLineNumber: 1,     // 1-based
  startColumn:    1,      // 1-based
  endLineNumber:  1,      // 1-based
  endColumn:      10,     // 1-based (exclusive)
  message:        'Description of the issue',
  severity:       'error' // 'hint' | 'info' | 'warning' | 'error'
}
```

### Example: Multiple markers

```js
editor.setMarkers([
  {
    startLineNumber: 2, startColumn: 5,
    endLineNumber:   2, endColumn:   12,
    message:  'Unused variable',
    severity: 'warning'
  },
  {
    startLineNumber: 7, startColumn: 1,
    endLineNumber:   7, endColumn:   30,
    message:  'Syntax error: unexpected token',
    severity: 'error'
  }
]);
```

---

## 11. Virtual File System (VFS)

The VFS stores files and folders in memory as a tree of nodes.

### Node shapes

**File node:**

```js
{
  id:       'uuid-string',
  type:     'file',
  name:     'index.js',
  language: 'javascript',
  content:  '// file content',
  parentId: null           // null = root level
}
```

**Folder node:**

```js
{
  id:       'uuid-string',
  type:     'folder',
  name:     'components',
  parentId: null
}
```

### Working with the VFS

```js
// Create a folder tree
var srcFolder = editor.addFolder('src', null);
var utilsFile = editor.addFile('utils.js', srcFolder.id, '// utils\n', 'javascript');
var mainFile  = editor.addFile('main.js',  srcFolder.id, '// main\n',  'javascript');

// Switch files
editor.openFile(utilsFile.id);

// Check state
console.log(editor.getActiveFileId()); // utilsFile.id
console.log(editor.isFileDirty(mainFile.id)); // false

// Export for persistence
var vfsSnapshot = editor.exportVFS();

// Import from snapshot
editor.importVFS(vfsSnapshot);
```

---

## 12. Library IntelliSense Pipeline

The library pipeline lets you feed a raw JavaScript source file to the editor and get full dot-completion for its exported members.

### How it works

1. **JSAnalyzer** parses the source and extracts symbols (functions, classes, methods, variables)
2. **DtsGenerator** converts those symbols into a TypeScript `.d.ts` declaration string
3. **ExtraLibManager** registers the `.d.ts` with Monaco via `addExtraLib`
4. **LibraryProviderManager** registers a completion provider that fires when you type `LibName.`

### Usage

```js
// Load a library from source text
var src = '/* my lib */\nvar MyLib = {\n  doSomething: function(x) { return x; }\n};';

var result = editor.loadLibrary(src, {
  filename: 'myLib.js',
  libId:    'MyLib'
});

console.log(result.symbolCount); // 2
console.log(result.dts);
// Output:
// // Generated from: myLib.js
// declare var MyLib: {
//   doSomething(x: any): any;
// };
```

After loading, typing `MyLib.` in the editor will show `doSomething` in the completion list.

### Previewing symbols without loading

```js
var symbols = editor.analyzeLibrary(librarySourceCode, { filename: 'lib.js' });
symbols.forEach(function(s) {
  console.log(s.name, s.kind, s.params);
});
```

### Symbol object shape

```js
{
  name:          'doSomething',
  kind:          'function',   // 'function'|'variable'|'class'|'method'|'property'|'constant'
  params:        ['x'],        // parameter name list
  returnType:    '',           // extracted from JSDoc @returns if present
  documentation: '',           // extracted from /** JSDoc comment */
  source:        'myLib.js',
  line:          3,            // 1-based line number
  nested:        []            // child symbols (class methods, object keys)
}
```

---

## 13. Language Analyzers

Each analyzer receives a source text string and returns an array of raw symbols.

### JSAnalyzer

Extracts from JavaScript/JSX:

- Named function declarations (`function foo() {}`)
- Arrow functions (`const foo = (x) => {}`)
- Class declarations + all methods (including static, getter, setter)
- Prototype method assignments (`Foo.prototype.bar = function() {}`)
- IIFE constructor objects (`var Lib = new function() { var _self = this; _self.fn = ... }`)
- Named constructor functions (`function MyClass() { this.x = ... }`)
- Object literals (all nested keys up to `maxDepth`)
- `module.exports` assignments
- ES6 `import`/`export` statements
- CommonJS `require()` calls
- JSDoc extraction (`@param`, `@returns`, description)

```js
var symbols = JSAnalyzer.analyze(sourceCode, {
  filename:       'myFile.js',
  includePrivate: true,   // include _ and # prefixed members (default: true)
  maxDepth:       5       // max nesting depth for object key extraction
});
```

### AnalyzerEngine

Routes source text to the appropriate language analyzer:

```js
var symbols = AnalyzerEngine.analyze(sourceCode, {
  language: 'javascript',
  filename: 'myFile.js'
});
```

---

## 14. Architecture Overview

```
MonacoWrapper (constructor)
│
├── ThemeManager          — defineTheme, setTheme, toggleTheme, custom token colors
├── SuggestionManager     — registerCompletionItemProvider per language
├── ValidationManager     — setModelMarkers, debounced live validation
├── KeybindingManager     — editor.addCommand / removeCommand
├── ToolbarManager        — renders toolbar DOM, routes button clicks → wrapper methods
├── FileSystemManager     — in-memory node tree (files + folders)
├── ModelManager          — Monaco ITextModel lifecycle, tab tracking, dirty state
├── ExtraLibManager       — addExtraLib registry (.d.ts injection)
└── LibraryProviderManager — dot-trigger completion provider

Analysis Pipeline:
  JSAnalyzer / TSAnalyzer / JSONAnalyzer / CSSAnalyzer / SQLAnalyzer / YAMLAnalyzer
    → AnalyzerEngine (routes by language)
      → SuggestionMapper (raw symbols → CompletionItems)
        → SuggestionMerger (combines multiple sources)
          → DtsGenerator (symbols → .d.ts string)
            → ExtraLibManager (registers with Monaco)
```

---

## 15. Code Examples & Recipes

### Recipe 1: Minimal editor with dark theme

```js
var editor = new MonacoWrapper(document.getElementById('editor'), {
  value:    '// Start coding here\n',
  language: 'javascript',
  theme:    'vs-dark'
});
```

### Recipe 2: Read-only viewer

```js
var viewer = new MonacoWrapper(document.getElementById('viewer'), {
  value:       someCode,
  language:    'typescript',
  readOnly:    true,
  minimap:     false,
  lineNumbers: 'off',
  toolbar:     { show: false }
});
```

### Recipe 3: Live JSON validator

```js
var jsonEditor = new MonacoWrapper(document.getElementById('json-editor'), {
  language: 'json',
  validationFn: function(value) {
    try {
      JSON.parse(value);
      return [];
    } catch (e) {
      return [{
        startLineNumber: 1, startColumn: 1,
        endLineNumber:   1, endColumn:   1,
        message:  e.message,
        severity: 'error'
      }];
    }
  },
  validationDelay: 200
});
```

### Recipe 4: Multi-file editor with VFS

```js
var editor = new MonacoWrapper(document.getElementById('editor'), {
  toolbar: { show: true }
});

var srcFolder    = editor.addFolder('src', null);
var indexFile    = editor.addFile('index.js',  srcFolder.id, '// entry point\n',   'javascript');
var utilsFile    = editor.addFile('utils.js',  srcFolder.id, '// utilities\n',     'javascript');
var stylesFile   = editor.addFile('styles.css', srcFolder.id, '/* main styles */\n', 'css');

editor.openFile(indexFile.id);

// Switch between files
document.getElementById('open-utils').onclick = function() {
  editor.openFile(utilsFile.id);
};
```

### Recipe 5: Custom keyboard shortcut

```js
editor.addShortcut({
  id:         'save-file',
  label:      'Save File',
  keybinding: 'Ctrl+S',
  handler:    function() {
    editor.saveActiveFile();
    console.log('Saved!', editor.getValue());
  }
});
```

### Recipe 6: Load a library for IntelliSense

```js
fetch('/path/to/myLibrary.js')
  .then(function(r) { return r.text(); })
  .then(function(src) {
    var result = editor.loadLibrary(src, {
      filename: 'myLibrary.js',
      libId:    'MyLibrary'
    });
    console.log('Loaded', result.symbolCount, 'symbols');
    // Now typing "MyLibrary." in the editor shows completions
  });
```

### Recipe 7: Subscribe to events post-init

```js
var editor = new MonacoWrapper(container, { language: 'javascript' });

editor.on('onChange', function(data) {
  document.getElementById('char-count').textContent = data.value.length + ' chars';
});

editor.on('onCursorChange', function(position) {
  document.getElementById('position').textContent =
    'Line ' + position.lineNumber + ', Col ' + position.column;
});
```

### Recipe 8: Custom theme

```js
editor.defineCustomTheme('dracula', {
  base:    'vs-dark',
  inherit: true,
  rules: [
    { token: 'keyword',  foreground: 'ff79c6', fontStyle: 'bold' },
    { token: 'string',   foreground: 'f1fa8c' },
    { token: 'number',   foreground: 'bd93f9' },
    { token: 'comment',  foreground: '6272a4', fontStyle: 'italic' },
    { token: 'function', foreground: '50fa7b' }
  ],
  colors: {
    'editor.background':          '#282a36',
    'editor.foreground':          '#f8f8f2',
    'editor.lineHighlightBackground': '#44475a',
    'editorCursor.foreground':    '#f8f8f0'
  }
}, true /* apply immediately */);
```

### Recipe 9: Full configuration example

```js
var editor = new MonacoWrapper(document.getElementById('editor'), {
  value:           'function hello() {\n  console.log("world");\n}\n',
  language:        'javascript',
  theme:           'vs-dark',
  fontSize:        14,
  fontFamily:      "Fira Code, Consolas, monospace",
  lineNumbers:     'on',
  wordWrap:        'off',
  formatOnType:    false,
  formatOnLoad:    true,
  readOnly:        false,
  minimap:         true,
  matchBrackets:   'always',
  tabSize:         2,
  insertSpaces:    true,
  scrollBeyondLastLine: false,
  automaticLayout: true,
  autoSuggestions: [
    { label: 'greet',   kind: 'function', insertText: 'greet(${1:name})',  documentation: 'Greet someone' },
    { label: 'VERSION', kind: 'constant', insertText: '\'1.0.0\'',         documentation: 'App version' }
  ],
  validationDelay: 400,
  initialFileName: 'app.js',
  toolbar: {
    show:    true,
    buttons: ['undo', 'redo', 'cut', 'copy', 'format', 'theme', 'find', 'wordWrap'],
    customButtons: [
      {
        id:      'run',
        label:   'Run',
        title:   'Run Code',
        icon:    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
        onClick: function() { eval(editor.getValue()); }
      }
    ]
  },
  callbacks: {
    onChange:       function(v)   { console.log('changed, length:', v.length); },
    onFocus:        function()    { console.log('editor focused'); },
    onBlur:         function()    { console.log('editor blurred'); },
    onFormat:       function()    { console.log('formatted'); },
    onFileSwitch:   function(d)   { console.log('switched to', d.name); }
  }
});
```

---

## 16. FAQ

**Q: How do I get the current editor content?**
```js
var code = editor.getValue();
```

**Q: How do I set new content without losing undo history?**
```js
editor.setValue(newContent); // preserves undo stack
```

**Q: How do I set content AND clear the undo stack?**
```js
editor.resetContent(); // resets to options.value
// or, to set arbitrary content and clear undo:
editor.setOriginalValue(newContent);
editor.resetContent();
```

**Q: What themes are available by default?**
- `'vs'` — Light (default)
- `'vs-dark'` — Dark
- `'hc-black'` — High Contrast

Use `defineCustomTheme()` for custom themes.

**Q: How do I disable the toolbar?**
```js
new MonacoWrapper(container, { toolbar: { show: false } });
```

**Q: How do I show the "Delete Line" button that's hidden by default?**
```js
editor.showButton('deleteLine');
```

**Q: Can I use this with React/Vue/Angular?**
Yes. The wrapper is framework-agnostic. Pass an `HTMLElement` reference (e.g., from a React `ref`) and call `destroy()` in your component's unmount/destroy lifecycle hook.

**Q: How do I resize the editor?**
After changing the container dimensions, call:
```js
editor.layout();
```
If `automaticLayout: true` is set (default), this happens automatically.

**Q: How do I add custom syntax highlighting rules?**
```js
editor.setCustomTokenColors([
  { token: 'keyword.myLang', foreground: 'ff0000', fontStyle: 'bold' }
]);
```

**Q: How do I make the editor full height?**
```css
#editor {
  width: 100%;
  height: 100vh; /* or any fixed height */
}
```
The wrapper uses `display: flex; flex-direction: column` so the editor fills the container.

**Q: How do I export and restore the VFS?**
```js
// Export
var snapshot = editor.exportVFS();
localStorage.setItem('vfs-backup', JSON.stringify(snapshot));

// Restore
var saved = JSON.parse(localStorage.getItem('vfs-backup'));
editor.importVFS(saved);
```

**Q: How do I run a dev server?**
```bash
python3 -m http.server 3000
# or
npx serve . -p 3000
```

**Q: When should I call `destroy()`?**
Call it whenever the editor is removed from the DOM — in React's `componentWillUnmount`, Vue's `beforeDestroy`, or Angular's `ngOnDestroy`.
```js
editor.destroy();
```

**Q: Can I have multiple editor instances on one page?**
Yes. Each `new MonacoWrapper(...)` call creates an independent instance with its own model, VFS, and managers.

---

*Generated from source — Monaco Editor Wrapper v1.0.0*
