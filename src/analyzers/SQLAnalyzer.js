// ─────────────────────────────────────────────────────────────────────────────
// SQLAnalyzer.js — SQL symbol extractor
//
// Extracts:
//   • Table names (from CREATE TABLE)
//   • Column names per table (table.column dot-notation)
//   • View names (CREATE VIEW)
//   • Stored procedure / function names
//   • Common SQL clause templates as snippet suggestions
//
// No Monaco dependency. Works in browser and Node.js.
// ─────────────────────────────────────────────────────────────────────────────

/* global module */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SQLAnalyzer = factory();
}(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function () {
  'use strict';

  function lineOf(text, offset) {
    return text.substring(0, offset).split('\n').length;
  }

  /**
   * Extract column definitions from a CREATE TABLE body.
   * @param {string} body  Text between the outer ( and ) of the CREATE TABLE
   * @returns {string[]}   Column name list
   */
  function extractColumns(body) {
    var cols = [];
    body.split('\n').forEach(function (line) {
      var trimmed = line.trim();
      if (!trimmed) return;
      // Skip constraint lines
      if (/^(PRIMARY|FOREIGN|UNIQUE|INDEX|KEY|CONSTRAINT|CHECK)\s/i.test(trimmed)) return;
      // Match: `col_name` TYPE ... or col_name TYPE ...
      var cm = trimmed.match(/^[`"[]?([A-Za-z_]\w*)[`"\]]?\s+\w/);
      if (cm) cols.push(cm[1]);
    });
    return cols;
  }

  /**
   * Parse a parameter string for stored procedures/functions (strip types).
   * @param {string} paramStr  e.g. "IN p_id INT, OUT p_name VARCHAR(50)"
   * @returns {string[]}
   */
  function parseProcParams(paramStr) {
    if (!paramStr || !paramStr.trim()) return [];
    return paramStr.split(',').map(function (p) {
      // Strip IN/OUT/INOUT keywords and type info
      return p.trim()
        .replace(/^(IN|OUT|INOUT)\s+/i, '')
        .split(/\s+/)[0]
        .replace(/[`"[\]]/g, '')
        .trim();
    }).filter(function (p) { return p.length > 0; });
  }

  // ── Clause templates ─────────────────────────────────────────────────────────

  var CLAUSE_TEMPLATES = [
    { label: 'SELECT',      insertText: 'SELECT ${1:*} FROM ${2:table_name} WHERE ${3:condition}',           detail: 'SELECT query template' },
    { label: 'SELECT JOIN', insertText: 'SELECT ${1:a.*} FROM ${2:table_a} a\nJOIN ${3:table_b} b ON ${4:a.id = b.a_id}\nWHERE ${5:condition}', detail: 'SELECT with JOIN template' },
    { label: 'INSERT INTO', insertText: 'INSERT INTO ${1:table_name} (${2:col1}, ${3:col2})\nVALUES (${4:val1}, ${5:val2})',                    detail: 'INSERT statement' },
    { label: 'UPDATE',      insertText: 'UPDATE ${1:table_name}\nSET ${2:col1} = ${3:value}\nWHERE ${4:condition}',                             detail: 'UPDATE statement' },
    { label: 'DELETE FROM', insertText: 'DELETE FROM ${1:table_name} WHERE ${2:condition}',                                                      detail: 'DELETE statement' },
    { label: 'CREATE TABLE',insertText: 'CREATE TABLE ${1:table_name} (\n  ${2:id} INT PRIMARY KEY AUTO_INCREMENT,\n  ${3:created_at} TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n)', detail: 'CREATE TABLE template' },
    { label: 'ALTER TABLE', insertText: 'ALTER TABLE ${1:table_name} ADD COLUMN ${2:col_name} ${3:VARCHAR(255)}',                               detail: 'ALTER TABLE template' },
    { label: 'JOIN',        insertText: 'JOIN ${1:table_name} ON ${2:condition}',                                                                detail: 'INNER JOIN clause' },
    { label: 'LEFT JOIN',   insertText: 'LEFT JOIN ${1:table_name} ON ${2:condition}',                                                           detail: 'LEFT JOIN clause' },
    { label: 'RIGHT JOIN',  insertText: 'RIGHT JOIN ${1:table_name} ON ${2:condition}',                                                          detail: 'RIGHT JOIN clause' },
    { label: 'GROUP BY',    insertText: 'GROUP BY ${1:column}',                                                                                  detail: 'GROUP BY clause' },
    { label: 'ORDER BY',    insertText: 'ORDER BY ${1:column} ${2:ASC}',                                                                         detail: 'ORDER BY clause' },
    { label: 'HAVING',      insertText: 'HAVING ${1:aggregate_condition}',                                                                       detail: 'HAVING clause' },
    { label: 'LIMIT',       insertText: 'LIMIT ${1:10} OFFSET ${2:0}',                                                                          detail: 'LIMIT / OFFSET clause' },
    { label: 'WITH CTE',    insertText: 'WITH ${1:cte_name} AS (\n  SELECT ${2:*} FROM ${3:table_name}\n)\nSELECT * FROM ${1:cte_name}',        detail: 'Common Table Expression (CTE)' },
    { label: 'CASE WHEN',   insertText: 'CASE\n  WHEN ${1:condition} THEN ${2:result}\n  ELSE ${3:default}\nEND',                               detail: 'CASE WHEN expression' }
  ];

  // ── Public API ───────────────────────────────────────────────────────────────

  var SQLAnalyzer = {};

  /**
   * Analyze SQL source text.
   * @param {string} text
   * @param {object} [opts]  { filename, snippetStyle }
   * @returns {object[]}  Raw symbol array
   */
  SQLAnalyzer.analyze = function (text, opts) {
    if (!text || typeof text !== 'string' || !text.trim()) return [];
    opts = opts || {};
    var source = opts.filename || 'manual';
    var results = [];

    // ── Tables (CREATE TABLE) ─────────────────────────────────────────────────
    var reCreate = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"[]?(\w+)[`"\]]?\s*\(/gi;
    var m;
    while ((m = reCreate.exec(text)) !== null) {
      var tName = m[1];

      // Extract the table body
      var bodyStart = text.indexOf('(', m.index + m[0].length - 1);
      if (bodyStart === -1) continue;
      var depth = 1;
      var pos = bodyStart + 1;
      while (pos < text.length && depth > 0) {
        if (text[pos] === '(') depth++;
        else if (text[pos] === ')') depth--;
        pos++;
      }
      var body = text.substring(bodyStart + 1, pos - 1);

      results.push({
        name:          tName,
        kind:          'value',
        params:        [],
        returnType:    '',
        documentation: 'SQL table',
        source:        source,
        line:          lineOf(text, m.index),
        nested:        []
      });

      // Columns
      var cols = extractColumns(body);
      cols.forEach(function (col) {
        results.push({
          name:          tName + '.' + col,
          kind:          'property',
          params:        [],
          returnType:    '',
          documentation: 'Column in table ' + tName,
          source:        source,
          line:          lineOf(text, bodyStart),
          nested:        []
        });
      });
    }

    // ── Views (CREATE VIEW) ───────────────────────────────────────────────────
    var reView = /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+[`"[]?(\w+)[`"\]]?/gi;
    while ((m = reView.exec(text)) !== null) {
      results.push({
        name:          m[1],
        kind:          'value',
        params:        [],
        returnType:    '',
        documentation: 'SQL view',
        source:        source,
        line:          lineOf(text, m.index),
        nested:        []
      });
    }

    // ── Stored procedures / functions ─────────────────────────────────────────
    var reProcFn = /CREATE\s+(?:OR\s+REPLACE\s+)?(?:PROCEDURE|FUNCTION)\s+[`"[]?([A-Za-z_]\w*)[`"\]]?\s*\(([^)]*)\)/gi;
    while ((m = reProcFn.exec(text)) !== null) {
      var pName = m[1];
      var pParams = parseProcParams(m[2]);
      results.push({
        name:          pName,
        kind:          'function',
        params:        pParams,
        returnType:    '',
        documentation: 'SQL stored procedure/function',
        source:        source,
        line:          lineOf(text, m.index),
        nested:        []
      });
    }

    // ── Clause templates ──────────────────────────────────────────────────────
    CLAUSE_TEMPLATES.forEach(function (tpl) {
      results.push({
        name:          tpl.label,
        kind:          'keyword',
        params:        [],
        returnType:    '',
        documentation: tpl.detail,
        source:        'sql-template',
        line:          0,
        nested:        [],
        _insertText:   tpl.insertText   // mapper will consume this
      });
    });

    console.log('[SQLAnalyzer] Extracted', results.length, 'symbols from', source);
    return results;
  };

  return SQLAnalyzer;
}));
