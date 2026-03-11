# SKILL — AnalyzerEngine

## Purpose
Central dispatcher for the Monaco Editor Wrapper's file analysis system.
Routes source text to the correct per-language analyzer based on filename extension and/or content sniffing.

## Location
`src/analyzers/AnalyzerEngine.js`

## Dependencies
- `JSAnalyzer.js` (must be loaded first)
- `TSAnalyzer.js`
- `JSONAnalyzer.js`
- `CSSAnalyzer.js`
- `SQLAnalyzer.js`
- `YAMLAnalyzer.js`

## Public API

```javascript
// Analyze text with auto-detected language
var symbols = AnalyzerEngine.analyze(text, {
  filename:       'app.ts',   // used for extension detection + source field
  language:       null,       // override: 'js'|'ts'|'json'|'css'|'sql'|'yaml'
  maxDepth:       Infinity,   // nesting depth for JSON/YAML/object literals
  includePrivate: true,       // include _ prefixed symbols
  snippetStyle:   'tabstop',  // 'tabstop' | 'plain'
  minified:       'skip'      // 'skip' | 'attempt'
});

// Detect language only
var lang = AnalyzerEngine.detectLanguage('app.ts', text);
// → 'ts'

// List supported languages
var langs = AnalyzerEngine.supportedLanguages();
// → ['js', 'ts', 'json', 'css', 'sql', 'yaml']
```

## Language Detection Priority
1. File extension (`.ts` → `ts`, `.scss` → `css`, `.env` → `yaml`, etc.)
2. Content sniffing (first 600 chars):
   - Starts with `[` or `{` → json
   - Contains `CREATE TABLE` / `SELECT * FROM` → sql
   - `KEY=VALUE` lines → yaml (ENV)
   - `key: value` indented blocks → yaml
   - CSS selectors / SCSS vars → css
   - TypeScript keywords (`interface`, `type X =`, `enum`) → ts
   - JS patterns → js

## Minified File Detection
Files with < 10 lines where any line exceeds 500 characters are flagged as minified.
When `opts.minified = 'skip'`, returns `[]` with a `console.warn`.

## Extension Map
| Extension(s)                | Language |
|-----------------------------|----------|
| .js .mjs .cjs .jsx          | js       |
| .ts .tsx                    | ts       |
| .json                       | json     |
| .css .scss .less            | css      |
| .sql                        | sql      |
| .yaml .yml .env             | yaml     |

## Re-running This Skill
To add a new language:
1. Create `src/analyzers/XAnalyzer.js` with `XAnalyzer.analyze(text, opts) → symbol[]`
2. Add an entry to `EXT_MAP` in `AnalyzerEngine.js`
3. Add an entry to `ANALYZER_MAP`
4. Add the script tag to `demo/index.html` before `AnalyzerEngine.js`
