# SKILL — JSAnalyzer

## Purpose
Extracts symbols from JavaScript and JSX source files.
Produces a raw symbol array for consumption by `SuggestionMapper`.

## Location
`src/analyzers/JSAnalyzer.js`

## Dependencies
None — pure JavaScript, no Monaco dependency.

## What It Extracts
| Symbol type              | Pattern matched                                         |
|--------------------------|---------------------------------------------------------|
| Named functions          | `function name(params) {}`                              |
| Async/generator fns      | `async function* name(params) {}`                       |
| Arrow functions          | `const name = (params) => {}`                           |
| Class declarations       | `class Name extends Base { ... }`                       |
| Class methods            | All methods inside the class body (including static)    |
| Constructor              | `constructor(params)` inside class                      |
| Prototype methods        | `Name.prototype.method = function(params) {}`           |
| Object literals          | `const obj = { key: value, nested: { ... } }`          |
| **IIFE constructor**     | `var X = new function() { var _self = this; _self.x = function(){} }` |
| **Named constructor fn** | `function Name() { this.x = function(){}; this.y = 1; }` |
| Top-level variables      | `const|let|var name = <non-function value>` + RHS type inference |
| ES6 named imports        | `import { a, b as c } from 'module'`                    |
| ES6 default imports      | `import Name from 'module'`                             |
| ES6 namespace imports    | `import * as Ns from 'module'`                          |
| CommonJS require         | `const x = require('module')`                           |
| module.exports.name      | `module.exports.name = ...`                             |
| JSDoc comments           | `/** @param {Type} name */ /** @returns {Type} */` → typed documentation |

## New Symbol Shape Fields (v2)
- `memberOf: string` — parent variable name for IIFE/constructor members
- `isIIFE: true` — marks IIFE constructor variables
- `isCtor: true` — marks named constructor function entries
- `returnType: string` — populated from JSDoc `@returns` or RHS type inference

## Type Inference (`inferType`)
Applied to RHS of variable assignments:
| RHS value | Inferred type |
|-----------|---------------|
| `true`/`false` | `boolean` |
| number literal | `number` |
| string literal | `string` |
| `[...]` | `any[]` |
| `new ClassName()` | `ClassName` |
| `{...}` | `object` |
| anything else | `any` |

## IIFE Self-Alias Detection
Scans for: `var _self = this`, `var self = this`, `var that = this`, `var me = this`.
Uses whichever alias appears first in the IIFE body.

## JSDoc Parsing (Enhanced)
`extractJsDoc()` now returns `{ documentation, params: [{name, type, description}], returnType }`.
`@param {Type} name` and `@returns {Type}` are parsed and stored on the symbol.

## Raw Symbol Shape
```javascript
{
  name:          'myFunction',
  kind:          'function',   // function|variable|class|method|property|constant|module
  params:        ['url', 'opts'],
  returnType:    '',           // not detectable from regex
  documentation: 'JSDoc text or import source',
  source:        'auth.js',
  line:          42,           // 1-based line number
  nested:        []            // class → methods; object → keys
}
```

## Public API
```javascript
var symbols = JSAnalyzer.analyze(text, {
  filename:       'auth.js',
  includePrivate: true,   // include symbols starting with _
  maxDepth:       5,      // max object literal nesting depth
  snippetStyle:   'tabstop'
});
```

## Edge Cases
- Minified detection is handled upstream by `AnalyzerEngine`
- Empty or non-string input returns `[]`, never throws
- Arrow function assigned to a name already captured as a named function is skipped (no duplicate)
- Object keys that are already in results (variable of the same name) are incorporated as `.nested[]`

## Re-running This Skill
To extend extraction (e.g. add `for...of` loop variable extraction):
1. Add a new regex block inside the `analyze()` function in `JSAnalyzer.js`
2. Push results in the same raw symbol shape
3. Re-run `node --check src/analyzers/JSAnalyzer.js` to verify syntax
