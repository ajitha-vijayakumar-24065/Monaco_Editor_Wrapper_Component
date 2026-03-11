# SKILL — SuggestionMapper

## Purpose
Converts raw symbol objects (produced by per-language analyzers) into the flat suggestion format
accepted by `SuggestionManager.registerSuggestions()`.
Also flattens nested symbols (class methods, interface members, enum members) to top-level entries.

## Location
`src/SuggestionMapper.js`

## Dependencies
None — pure JavaScript, no Monaco dependency.

## Input (Raw Symbol)
```javascript
{
  name:          'myFunction',
  kind:          'function',
  params:        ['url', 'opts'],
  returnType:    'Promise',
  documentation: 'Fetches data from the given URL',
  source:        'api.js',
  line:          42,
  nested:        [],
  _insertText:   'optional pre-built insertText (used by SQLAnalyzer)'
}
```

## Output (Suggestion Item)
```javascript
{
  label:               'myFunction',
  detail:              'myFunction(url, opts) — (api.js)',
  insertText:          'myFunction(${1:url}, ${2:opts})',
  insertTextIsSnippet: true,
  kind:                'function',
  documentation:       'Fetches data from the given URL',
  source:              'api.js',
  sortText:            '1myfunction',   // '1' prefix = highest priority tier
  filterText:          'myFunction'
}
```

## Sort Priority Tiers
| Kind              | Sort prefix |
|-------------------|-------------|
| function, method  | 1 (top)     |
| class, interface, enum | 2     |
| type, variable, constant | 3   |
| module            | 4           |
| property, enumMember | 5        |
| decorator         | 6           |
| value             | 7           |
| keyword           | 8           |

## InsertText Rules
- Functions/methods with params → `name(${1:p1}, ${2:p2})` (tabstop) or `name(p1, p2)` (plain)
- Functions/methods with no params → `name()` (no snippet markers)
- Classes → `new ClassName(${1:args})` (tabstop) or `new ClassName()` (plain)
- Properties → name as-is (dot-notation path)
- Keywords → use `_insertText` if present (SQL templates), else name as-is

## Public API
```javascript
// Map an array of symbols
var suggestions = SuggestionMapper.map(symbols, { snippetStyle: 'tabstop' });

// Map a single symbol
var item = SuggestionMapper.mapOne(symbol, { snippetStyle: 'plain' });
```

## Re-running This Skill
To change insertText style for a specific kind, modify the `buildInsertText()` switch statement in `SuggestionMapper.js`.
To add a new kind, add an entry to `KIND_SORT` and a case in `buildInsertText()` and `buildDetail()`.
