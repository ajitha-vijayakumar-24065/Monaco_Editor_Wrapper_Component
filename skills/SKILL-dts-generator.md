# SKILL: DtsGenerator

**File:** `src/analyzers/DtsGenerator.js`  
**Type:** Pure utility module — browser + Node.js, no Monaco dependency.

---

## Purpose

Converts raw symbol arrays (from `JSAnalyzer.analyze()`) into TypeScript ambient
declaration strings (`.d.ts` content) suitable for injection via `addExtraLib()`.

---

## Public API

### `DtsGenerator.generate(symbols, opts?)` → `string`

Generates a full `.d.ts` file from an array of raw symbols.

| Parameter | Type | Description |
|-----------|------|-------------|
| `symbols` | `object[]` | Raw symbols from `JSAnalyzer.analyze()` |
| `opts.header` | `string?` | Optional comment added at top of output |

Returns an empty string if `symbols` is empty or all fail.

```js
var dts = DtsGenerator.generate(symbols, { header: 'Generated from: QCSdk.js' });
```

### `DtsGenerator.generateForSymbol(sym)` → `string`

Generates a declaration for a single symbol (useful for previews).

---

## Mapping Rules

| Symbol kind | Output |
|-------------|--------|
| `function` | `declare function name(p: T): R;` |
| `class` | `declare class Name { constructor(...); methods...; }` |
| `class` with `isCtor: true` | Same — handles named constructor functions |
| `variable` with nested members | `declare var Name: { member1(): T; ... };` |
| `variable` (IIFE, `isIIFE: true`) | Same as above |
| `variable` plain | `declare var name: T;` |
| `constant` | `declare const name: T;` |
| `module` | `declare namespace Name {}` |

---

## IIFE Constructor Handling

The primary use case: `var QCSdk = new function() { var _self = this; _self.boot = function(config) {} }`.

After `JSAnalyzer` extracts symbols:
- `QCSdk` → `kind: 'variable'`, `isIIFE: true`, `nested: [boot, ...]`
- `boot`  → `kind: 'method'`, `memberOf: 'QCSdk'`

`DtsGenerator` produces:
```ts
declare var QCSdk: {
  boot(config: any): any;
};
```

---

## JSDoc Type Usage

If symbols carry `docParams` (from enhanced `extractJsDoc`), their `type` fields
are used instead of `any` for parameter type annotations.

---

## Deduplication

- Symbols with `memberOf` are skipped at top level (already rendered inside their parent)
- Duplicate names are tracked via `declared` set and skipped  
- Prototype methods without `memberOf` are folded into a matching class block when found
