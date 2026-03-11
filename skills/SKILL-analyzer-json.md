# SKILL — JSONAnalyzer

## Purpose
Extracts all keys from JSON files as full dot-notation paths (e.g. `server.database.host`).
Handles arrays of objects by extracting the shape of each item.

## Location
`src/analyzers/JSONAnalyzer.js`

## Dependencies
None — pure JavaScript.

## What It Extracts
- Every key at every nesting level as a dot-notation path
- For arrays, extracts the shape of up to the first 3 items
- Array index notation: `users[0].name`, `users[1].name`
- `returnType` field contains the JSON value type: `string|number|boolean|array|object|null`
- `documentation` contains `Value: <value>` for primitives ≤ 80 chars

## Public API
```javascript
var symbols = JSONAnalyzer.analyze(text, {
  filename: 'config.json',
  maxDepth: Infinity   // Infinity = full depth (default)
});
```

## Lenient Parsing
If strict `JSON.parse` fails, the analyzer attempts a second pass after:
- Stripping trailing commas
- Stripping `//` line comments (non-standard)
- Stripping `/* */` block comments

If both attempts fail, returns `[]` with a `console.warn`.

## Example Output
For `{ "server": { "host": "localhost", "port": 3000 } }`:
```javascript
[
  { name: 'server',      kind: 'property', returnType: 'object' },
  { name: 'server.host', kind: 'property', returnType: 'string', documentation: 'Value: localhost' },
  { name: 'server.port', kind: 'property', returnType: 'number', documentation: 'Value: 3000' }
]
```

## Re-running This Skill
To change depth limit: pass `{ maxDepth: 3 }` in opts — no code change needed.
