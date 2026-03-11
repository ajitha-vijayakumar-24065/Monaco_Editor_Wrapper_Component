# SKILL: ExtraLibManager

**File:** `src/ExtraLibManager.js`  
**Type:** Monaco sub-manager — requires `window.monaco`.

---

## Purpose

Manages the lifecycle of `monaco.languages.typescript.addExtraLib()` registrations.
Each loaded library's `.d.ts` content is registered on BOTH `javascriptDefaults` AND
`typescriptDefaults` so completions work regardless of the active language.

Also configures compiler options on construction to prevent false error squiggles
from injected declarations.

---

## Constructor

```js
var mgr = new ExtraLibManager(monaco, emitCallback);
```

On creation:
- Sets `allowJs: true`, `checkJs: false`, `allowNonTsExtensions: true` on both JS/TS defaults
- Sets `noSemanticValidation: true` on `javascriptDefaults` (keeps syntax errors only)

---

## Public API

### `addLib(libId, dts, symbols, filename)`

Registers a `.d.ts` string as an extra library.

- If `libId` already exists, the old registration is disposed first (update semantics)
- Calls `addExtraLib(dts, 'file:///libs/<libId>.d.ts')` on both JS and TS defaults
- Stores `IDisposable` handles for later cleanup
- Fires `onLibraryLoaded` event

### `removeLib(libId)`

Disposes both `IDisposable` handles and removes the entry.  
Fires `onLibraryUnloaded`.

### `hasLib(libId)` → `boolean`

### `getLib(libId)` → `{ dts, uri, symbols, filename }` or `null`

### `getLoadedLibs()` → `Array<{ libId, filename, symbolCount, dtsLength }>`

Summary info for UI rendering.

### `getDts(libId)` → `string`

### `getSymbols(libId)` → `object[]`

Raw symbols stored alongside the .d.ts.

### `dispose()`

Disposes all registrations. Called by `MonacoWrapper.destroy()`.

---

## Monaco v0.21.3 Notes

- `addExtraLib(content, uri)` returns an `IDisposable` with a `.dispose()` method
- The URI scheme `file:///libs/` is arbitrary but must be consistent
- `ScriptTarget.ESNext` = `99` (numeric fallback used if enum not available)
- Dual registration is required because `registerCompletionItemProvider` is
  language-specific but `addExtraLib` feeds the shared TS worker
