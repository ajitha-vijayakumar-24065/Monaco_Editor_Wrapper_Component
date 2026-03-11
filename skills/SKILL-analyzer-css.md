# SKILL — CSSAnalyzer

## Purpose
Extracts selectors, variables, mixins, and keyframe names from CSS, SCSS, and Less files.

## Location
`src/analyzers/CSSAnalyzer.js`

## Dependencies
None — pure JavaScript.

## What It Extracts
| Symbol type          | Example                                    | Kind       |
|----------------------|--------------------------------------------|------------|
| Class selectors      | `.my-class {`                              | `value`    |
| ID selectors         | `#my-id {`                                 | `value`    |
| CSS custom props     | `--primary-color: #2563eb;`                | `property` |
| SCSS variables       | `$font-size: 16px;`                        | `variable` |
| Less variables       | `@primary: #2563eb;`                       | `variable` |
| SCSS mixins          | `@mixin flex-center($dir) {`               | `function` |
| Less mixins          | `.make-flex(@direction) {`                 | `function` |
| Keyframe names       | `@keyframes slideIn {`                     | `keyword`  |

## Mixin InsertText
SCSS mixins get their SCSS variable params stripped of `$` and types for use in snippets:
`@mixin flex-center($dir: row)` → params: `['dir']` → insertText: `flex-center(${1:dir})`

## CSS Custom Property InsertText
`--my-var` → insertText built by `SuggestionMapper` as `--my-var` (plain, to be used in `var(--my-var)` context)

## Public API
```javascript
var symbols = CSSAnalyzer.analyze(text, {
  filename: 'styles.scss'
});
```

## Re-running This Skill
To add CSS `@font-face` family name extraction, add a regex in `CSSAnalyzer.analyze()`:
```javascript
var reFontFace = /@font-face[\s\S]*?font-family\s*:\s*['"]?([^;'"]+)['"]?/g;
```
