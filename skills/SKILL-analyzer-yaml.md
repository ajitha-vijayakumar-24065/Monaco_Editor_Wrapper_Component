# SKILL — YAMLAnalyzer

## Purpose
Extracts keys from YAML files as full dot-notation paths, and variables from `.env` files.

## Location
`src/analyzers/YAMLAnalyzer.js`

## Dependencies
None — pure JavaScript.

## Format Detection
The first non-empty line is checked:
- If it matches `KEY=VALUE` (all-caps key) → treated as ENV file
- Otherwise → treated as YAML

## What It Extracts

### YAML mode
| Symbol type      | Example                        | Kind       |
|------------------|--------------------------------|------------|
| Key paths        | `server.database.host`         | `property` |
| YAML anchors     | `&default-settings` → `*default-settings` | `constant` |

Path tracking uses indentation levels. A stack is maintained; when a new line is at the same or lower indent than the top of the stack, entries are popped to find the correct parent.

### ENV mode
| Symbol type      | Example                        | Kind       |
|------------------|--------------------------------|------------|
| Env variables    | `DATABASE_URL`                 | `variable` |

Value is stored in `documentation` if ≤ 80 chars.

## Public API
```javascript
var symbols = YAMLAnalyzer.analyze(text, {
  filename: 'docker-compose.yml',
  maxDepth: Infinity
});
```

## Re-running This Skill
To support multi-document YAML (separated by `---`), split the text on `---` before passing each section to `parseYAML()`.
