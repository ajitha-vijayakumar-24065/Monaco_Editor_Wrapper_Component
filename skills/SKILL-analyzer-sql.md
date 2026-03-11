# SKILL — SQLAnalyzer

## Purpose
Extracts table names, column names, views, stored procedures, and SQL clause templates from SQL files.

## Location
`src/analyzers/SQLAnalyzer.js`

## Dependencies
None — pure JavaScript.

## What It Extracts
| Symbol type              | Detail                                      | Kind       |
|--------------------------|---------------------------------------------|------------|
| Table names              | `CREATE TABLE name`                         | `value`    |
| Column names             | `table.column` dot-notation                 | `property` |
| View names               | `CREATE [OR REPLACE] VIEW name`             | `value`    |
| Stored procedures/fns    | `CREATE PROCEDURE/FUNCTION name(params)`    | `function` |
| SQL clause templates     | 16 pre-built snippets (SELECT, INSERT, etc.)| `keyword`  |

## Column Extraction
Column names are extracted from the `CREATE TABLE` body by parsing each non-constraint line.
Lines starting with `PRIMARY`, `FOREIGN`, `UNIQUE`, `INDEX`, `KEY`, `CONSTRAINT`, `CHECK` are skipped.
Backtick and bracket-quoted names are supported.

## Clause Templates
Pre-built tab-stop snippets for:
`SELECT`, `SELECT JOIN`, `INSERT INTO`, `UPDATE`, `DELETE FROM`, `CREATE TABLE`,
`ALTER TABLE`, `JOIN`, `LEFT JOIN`, `RIGHT JOIN`, `GROUP BY`, `ORDER BY`,
`HAVING`, `LIMIT/OFFSET`, `WITH CTE`, `CASE WHEN`

These are stored with `_insertText` on the raw symbol and `source: 'sql-template'`.
`SuggestionMapper` reads `_insertText` to use them as-is.

## Public API
```javascript
var symbols = SQLAnalyzer.analyze(text, {
  filename: 'schema.sql',
  snippetStyle: 'tabstop'
});
```

## Re-running This Skill
To add a new clause template, append an object to the `CLAUSE_TEMPLATES` array in `SQLAnalyzer.js`:
```javascript
{
  label:      'MY CLAUSE',
  insertText: 'MY CLAUSE ${1:args}',
  detail:     'My clause description'
}
```
