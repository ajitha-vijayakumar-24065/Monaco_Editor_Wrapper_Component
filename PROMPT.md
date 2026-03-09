# Monaco Editor Wrapper — Implementation Plan Prompt

You are a senior JavaScript engineer. Generate a detailed, step-by-step implementation plan for building a JavaScript (not TypeScript) wrapper around the Monaco Code Editor (monaco-editor v0.21.3).

---

## GOALS

Build a reusable, configurable Monaco Editor wrapper in plain JavaScript that:
1. Encapsulates all editor features behind a clean API
2. Exposes all actions and configuration to parent consumers
3. Fires callbacks for every action
4. Includes a demo/playground page for live configuration

---

## CONSTRAINTS

- Language: JavaScript only (no TypeScript)
- Monaco version: monaco-editor@0.21.3
- No framework required for the wrapper itself (framework-agnostic)
- The demo/playground page can use vanilla JS or a lightweight framework

---

## FEATURES TO IMPLEMENT IN THE WRAPPER

Plan the implementation for each of the following features. For each feature, describe:
  (a) the Monaco API used
  (b) the wrapper method/option exposed
  (c) the parent callback signature

### Editor Operations
1. Font Size — configurable, dynamically changeable
2. Undo
3. Redo
4. Cut
5. Copy
6. Indent
7. Outdent
8. Duplicate line
9. Comment / Uncomment (line and block)
10. Delete line
11. Find — with options: matchCase, matchWholeWord, useRegex
12. Word Wrap toggle
13. Format (manual trigger)
14. Format on Type (auto-formatting as user types)
15. Reset (restore editor to original/default content)

### Appearance
16. Dark Mode / Light Mode toggle
17. Keyword highlighting (custom token colorization)
18. Matching bracket highlighting
19. Line numbers (on/off, relative, interval)

### Intelligence & Completions
20. Intelligent code completion and auto-suggestions (built-in Monaco IntelliSense)
21. Custom auto-suggestions based on a selected "service" or "project" context — accept an array of objects (labels, details, insert text, kind) and register them as a CompletionItemProvider

### Error & Validation
22. Error highlighting (squiggly underlines via monaco.editor.setModelMarkers)
23. Error detection with inline suggestions and warnings (severity levels: error, warning, info, hint)
24. Input validation — accept a validation function; show error messages inline and/or in a message area

### Developer Experience
25. Shortcut keys support — register custom keybindings via editor.addAction or editor.addCommand
26. Prettify / format code on initial load (auto-format when editor mounts)
27. Icon configuration — allow icon overrides for toolbar buttons

### Toolbar
28. Toolbar customization — show/hide buttons, add custom buttons, optionally display keybinding labels next to each button

### Callbacks & Exposure
29. Provide a callback to the parent for every action (onChange, onFormat, onUndo, onRedo, onError, onFind, onThemeChange, onReset, etc.)
30. Expose every action as a public method on the wrapper instance so parents can call them programmatically (e.g., wrapper.undo(), wrapper.format(), wrapper.setLanguage('sql'))

---

## WRAPPER API DESIGN

Design and document the full public API of the wrapper, including:

### Constructor / Init
```js
const editor = new MonacoWrapper(containerElement, options)
```

### Options Object
Document all configurable options with types and defaults:
- value (string)
- language (string)
- theme ('vs' | 'vs-dark' | 'hc-black')
- fontSize (number)
- lineNumbers ('on' | 'off' | 'relative' | 'interval')
- wordWrap ('on' | 'off')
- formatOnType (boolean)
- readOnly (boolean)
- minimap (boolean)
- bracketMatching (boolean)
- autoSuggestions (array of suggestion objects)
- validationFn (function) — receives current value, returns array of error objects
- toolbar (object) — which buttons to show and their config
- callbacks (object) — map of event name to handler function
- icons (object) — icon overrides per action

### Public Methods
List every method the wrapper should expose (e.g., getValue, setValue, undo, redo, format, resetContent, setTheme, setLanguage, setFontSize, triggerFind, registerSuggestions, setMarkers, destroy, etc.)

---

## DEMO / PLAYGROUND PAGE

Design a demo page with the following layout:

### Top bar
- Dropdown to select editor language (e.g., javascript, typescript, json, sql, python, html, css, yaml)

### Main Area (two-column layout)
- LEFT: The Monaco Editor instance (rendered via the wrapper)
- RIGHT: Properties Panel

### Properties Panel (right side)
List all properties that can be manually configured by the user:
- value (textarea)
- language (mirrored from top dropdown)
- theme
- fontSize
- lineNumbers
- wordWrap
- minimap enabled
- formatOnType
- readOnly
- bracketMatching
- autoSuggestions (JSON textarea — paste an array of suggestion objects)
- Custom validation function (textarea — user pastes a JS function body)
- Toolbar visibility toggles per button
- Any other relevant options

At the bottom of the right panel:
- "Apply Changes" button — collects all current panel values, calls wrapper methods or re-initializes the editor with the new config, and re-renders the editor on the left

---

## DELIVERABLES IN THE PLAN

The plan should include:
1. File/folder structure
2. Step-by-step build order (what to build first, in what sequence)
3. For each feature: the Monaco API used, wrapper method name, callback name
4. The complete options object schema
5. Complete public method list with signatures
6. Properties Panel field list with types and default values
7. Notes on edge cases and known Monaco v0.21.3 quirks to watch for
8. Suggested testing approach (manual test cases per feature)

---

Generate the full plan now.

also store ur prompt in a seperate file
