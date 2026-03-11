# SKILL — TSAnalyzer

## Purpose
Extracts TypeScript-specific symbols from `.ts` / `.tsx` source files.
Runs `JSAnalyzer` first, then appends TypeScript-specific constructs.

## Location
`src/analyzers/TSAnalyzer.js`

## Dependencies
- `JSAnalyzer.js` (must be loaded before `TSAnalyzer.js`)

## What It Extracts (in addition to everything JSAnalyzer extracts)
| Symbol type              | Pattern matched                                          |
|--------------------------|----------------------------------------------------------|
| Interface declarations   | `interface Name [extends ...] { ... }`                   |
| Interface properties     | Property signatures inside interface body                |
| Interface methods        | Method signatures inside interface body                  |
| Type aliases             | `type Name<T> = ...`                                     |
| Enum declarations        | `enum Name { ... }` or `const enum Name { ... }`         |
| Enum members             | Each member inside enum body                             |
| Decorators               | `@DecoratorName(args)` anywhere in source                |

## Raw Symbol Kinds Added
`'interface'` | `'type'` | `'enum'` | `'enumMember'` | `'decorator'`

## Public API
```javascript
var symbols = TSAnalyzer.analyze(text, {
  filename:       'auth.service.ts',
  includePrivate: true,
  maxDepth:       5,
  snippetStyle:   'tabstop'
});
```

## Decorator Filtering
The following JSDoc tag names are excluded from decorator extraction to avoid false positives:
`@param`, `@returns`, `@type`, `@typedef`, `@example`, `@see`, `@deprecated`

## Re-running This Skill
To add generic type parameter extraction:
1. Add a regex in `TSAnalyzer.js` matching `<T extends ...>` on function/interface/class
2. Push extracted `T` names as `kind: 'typeParameter'`
3. Re-run `node --check src/analyzers/TSAnalyzer.js`
