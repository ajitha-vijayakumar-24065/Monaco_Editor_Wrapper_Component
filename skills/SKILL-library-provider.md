# SKILL: LibraryProviderManager

**File:** `src/LibraryProviderManager.js`  
**Type:** Monaco sub-manager — requires `window.monaco`.

---

## Purpose

Provides dot-triggered context-aware completions for loaded library symbols.
Acts as a **fallback** to Monaco's built-in TypeScript language service — it
indexes top-level symbol names and returns their members when the user types
`LibName.` in the editor.

Registered for both `javascript` and `typescript` languages with
`triggerCharacters: ['.']`.

---

## Constructor

```js
var mgr = new LibraryProviderManager(monaco, emitCallback);
```

Immediately registers a `CompletionItemProvider` for `javascript` and `typescript`.

---

## How Dot-Completion Works

1. On every completion trigger, get the current line text up to the cursor column
2. Match `([A-Za-z_$][\w$]*)\.$` at the end of the line text
3. Look up the captured identifier in the symbol index
4. If found, return the indexed members as `CompletionItem[]`
5. Members are rendered with parameter snippets (tab stops) for method calls

Items include the `range` field required by Monaco v0.21.3.

---

## Symbol Index Structure

```js
_index = {
  'QCSdk': {
    libId: 'QCSdk_js',
    members: [
      { name: 'boot', kind: 'method', params: ['config'], returnType: 'any', ... },
      { name: 'shutdown', kind: 'method', params: [], ... }
    ]
  }
}
```

---

## Public API

### `registerLibrarySymbols(libId, symbols)`

Indexes all top-level symbols from a library that have nested members or appear
as children (via `memberOf`) of another symbol.

### `unregisterLibrarySymbols(libId)`

Removes all index entries belonging to `libId`.

### `getIndexedNames()` → `string[]`

All currently indexed top-level names.

### `dispose()`

Disposes all `CompletionItemProvider` registrations.

---

## Why a Separate Provider?

`ExtraLibManager` + `addExtraLib` feeds Monaco's TS worker, which handles
`.` completions natively for typed code. `LibraryProviderManager` provides an
additional, more reliable fallback that:
- Works for IIFE patterns that the TS worker may not fully resolve
- Provides custom sort order (`sortText: '0_name'` — sorts above built-ins)
- Gives richer `detail` display (kind + return type)
- Works offline without a TS worker
