// ─────────────────────────────────────────────────────────────────────────────
// JSONAnalyzer.js — JSON key/path extractor
//
// Extracts all keys at full depth as dot-notation paths.
// Handles JSON objects and arrays (extracts item keys for arrays of objects).
//
// No Monaco dependency. Works in browser and Node.js.
// ─────────────────────────────────────────────────────────────────────────────

/* global module */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.JSONAnalyzer = factory();
}(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function () {
  'use strict';

  /**
   * Recursively walk a parsed JSON node and extract key paths.
   * @param {*}        node
   * @param {string}   path        Current dot-notation path prefix
   * @param {number}   depth       Current depth (1-based)
   * @param {number}   maxDepth    Maximum depth (Infinity = no limit)
   * @param {string}   source      Filename or 'manual'
   * @param {object[]} results     Accumulator array
   */
  function walk(node, path, depth, maxDepth, source, results) {
    if (node === null || typeof node !== 'object') return;
    if (depth > maxDepth) return;

    var isArray = Array.isArray(node);
    var keys = isArray ? null : Object.keys(node);

    if (isArray) {
      // For arrays of objects, extract the shape of the first item
      for (var i = 0; i < Math.min(node.length, 3); i++) {
        if (node[i] !== null && typeof node[i] === 'object' && !Array.isArray(node[i])) {
          walk(node[i], path + '[' + i + ']', depth + 1, maxDepth, source, results);
        }
      }
      return;
    }

    keys.forEach(function (key) {
      var val = node[key];
      var fullPath = path ? path + '.' + key : key;
      var valType = Array.isArray(val) ? 'array' : (val === null ? 'null' : typeof val);

      var detail = valType;
      var documentation = '';

      if (valType === 'string' || valType === 'number' || valType === 'boolean') {
        var valStr = String(val);
        if (valStr.length <= 80) documentation = 'Value: ' + valStr;
        if (valStr.length <= 40) detail = valType + ' \u2014 ' + valStr;
        else detail = valType + ' \u2014 ' + valStr.substring(0, 37) + '\u2026';
      } else if (valType === 'object') {
        detail = 'object {' + Object.keys(val).slice(0, 4).join(', ') +
          (Object.keys(val).length > 4 ? ', \u2026' : '') + '}';
      } else if (valType === 'array') {
        detail = 'array[' + val.length + ']';
      }

      results.push({
        name:          fullPath,
        kind:          'property',
        params:        [],
        returnType:    valType,
        documentation: documentation,
        source:        source,
        line:          0,  // JSON parse does not provide line numbers
        nested:        []
      });

      if (valType === 'object' || valType === 'array') {
        walk(val, fullPath, depth + 1, maxDepth, source, results);
      }
    });
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  var JSONAnalyzer = {};

  /**
   * Analyze JSON source text.
   * @param {string} text
   * @param {object} [opts]  { filename, maxDepth }
   * @returns {object[]}  Raw symbol array
   */
  JSONAnalyzer.analyze = function (text, opts) {
    if (!text || typeof text !== 'string' || !text.trim()) return [];
    opts = opts || {};

    var source = opts.filename || 'manual';
    var maxDepth = opts.maxDepth != null ? opts.maxDepth : Infinity;

    var parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      // Try lenient parse: strip trailing commas
      try {
        var fixed = text
          .replace(/,\s*([}\]])/g, '$1')      // trailing commas
          .replace(/\/\/[^\n]*/g, '')           // line comments (non-standard but common)
          .replace(/\/\*[\s\S]*?\*\//g, '');    // block comments
        parsed = JSON.parse(fixed);
      } catch (e2) {
        console.warn('[JSONAnalyzer] Could not parse JSON from', source + ':', e2.message);
        return [];
      }
    }

    var results = [];
    walk(parsed, '', 1, maxDepth, source, results);

    console.log('[JSONAnalyzer] Extracted', results.length, 'keys from', source);
    return results;
  };

  return JSONAnalyzer;
}));
