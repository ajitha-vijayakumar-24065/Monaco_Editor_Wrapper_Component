// ─────────────────────────────────────────────────────────────────────────────
// YAMLAnalyzer.js — YAML / ENV symbol extractor
//
// Extracts:
//   • All YAML keys as full dot-notation paths (full depth)
//   • ENV file variables (KEY=value format)
//   • Anchor / alias names (&anchor, *alias)
//
// No Monaco dependency. Works in browser and Node.js.
// ─────────────────────────────────────────────────────────────────────────────

/* global module */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.YAMLAnalyzer = factory();
}(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function () {
  'use strict';

  /**
   * Detect if the text is an ENV file (KEY=VALUE format).
   * @param {string} firstLine
   * @returns {boolean}
   */
  function isEnvFile(firstLine) {
    return /^[A-Z_][A-Z0-9_]*\s*=/.test(firstLine.trim());
  }

  /**
   * Parse ENV file and return raw symbols.
   * @param {string[]} lines
   * @param {string}   source
   * @returns {object[]}
   */
  function parseEnv(lines, source) {
    var results = [];
    lines.forEach(function (line, idx) {
      var raw = line.trim();
      if (!raw || raw.charAt(0) === '#') return;
      var eqIdx = raw.indexOf('=');
      if (eqIdx === -1) return;
      var key = raw.substring(0, eqIdx).trim();
      var val = raw.substring(eqIdx + 1).trim().replace(/^["']|["']$/g, '');

      if (!key) return;
      results.push({
        name:          key,
        kind:          'variable',
        params:        [],
        returnType:    'string',
        documentation: val.length <= 80 ? 'Value: ' + val : '',
        source:        source,
        line:          idx + 1,
        nested:        []
      });
    });
    return results;
  }

  /**
   * Parse YAML file line-by-line using indentation stacking.
   * Builds full dot-notation paths for all keys.
   * @param {string[]} lines
   * @param {string}   source
   * @param {number}   maxDepth
   * @returns {object[]}
   */
  function parseYAML(lines, source, maxDepth) {
    var results = [];
    // Stack entries: { key: string, indent: number }
    var pathStack = [];

    lines.forEach(function (line, idx) {
      var raw = line;
      var trimmed = raw.trim();

      // Skip blank lines, comments, and document separators
      if (!trimmed || trimmed.charAt(0) === '#' || trimmed === '---' || trimmed === '...') return;

      // Match YAML key: "  key: value" or "  key:" (multiline)
      // Must start with optional whitespace then a valid key character
      var keyMatch = raw.match(/^(\s*)([A-Za-z_$][\w$.:-]*|"[^"]*"|'[^']*')\s*:\s*(.*)?$/);
      if (!keyMatch) return;

      var indent  = keyMatch[1].length;
      var rawKey  = keyMatch[2].replace(/^["']|["']$/g, '');  // strip quotes
      var valPart = (keyMatch[3] || '').trim();

      // Pop stack entries at same or deeper indent level
      while (pathStack.length > 0 && pathStack[pathStack.length - 1].indent >= indent) {
        pathStack.pop();
      }

      var fullPath = pathStack.map(function (s) { return s.key; }).concat(rawKey).join('.');
      var depth = pathStack.length + 1;

      if (depth <= maxDepth) {
        // Determine value type
        var valType = 'string';
        if (!valPart || valPart === '|' || valPart === '>') {
          valType = 'object'; // likely a nested mapping or block scalar
        } else if (/^(true|false|yes|no|on|off)$/i.test(valPart)) {
          valType = 'boolean';
        } else if (/^-?\d+(\.\d+)?$/.test(valPart)) {
          valType = 'number';
        } else if (valPart.charAt(0) === '[' || valPart.charAt(0) === '{') {
          valType = valPart.charAt(0) === '[' ? 'array' : 'object';
        }

        var documentation = '';
        if (valType === 'string' || valType === 'number' || valType === 'boolean') {
          if (valPart.length <= 80) documentation = 'Value: ' + valPart;
        }

        results.push({
          name:          fullPath,
          kind:          'property',
          params:        [],
          returnType:    valType,
          documentation: documentation,
          source:        source,
          line:          idx + 1,
          nested:        []
        });
      }

      pathStack.push({ key: rawKey, indent: indent });
    });

    return results;
  }

  /**
   * Extract YAML anchors and aliases.
   * @param {string} text
   * @param {string} source
   * @returns {object[]}
   */
  function parseAnchors(text, source) {
    var results = [];
    var reAnchor = /&([A-Za-z_][\w-]*)/g;
    var seen = {};
    var m;
    while ((m = reAnchor.exec(text)) !== null) {
      var aName = m[1];
      if (seen[aName]) continue;
      seen[aName] = true;
      results.push({
        name:          '*' + aName,
        kind:          'constant',
        params:        [],
        returnType:    '',
        documentation: 'YAML anchor &' + aName,
        source:        source,
        line:          text.substring(0, m.index).split('\n').length,
        nested:        []
      });
    }
    return results;
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  var YAMLAnalyzer = {};

  /**
   * Analyze YAML or ENV source text.
   * @param {string} text
   * @param {object} [opts]  { filename, maxDepth }
   * @returns {object[]}  Raw symbol array
   */
  YAMLAnalyzer.analyze = function (text, opts) {
    if (!text || typeof text !== 'string' || !text.trim()) return [];
    opts = opts || {};

    var source   = opts.filename || 'manual';
    var maxDepth = opts.maxDepth != null ? opts.maxDepth : Infinity;
    var lines    = text.split('\n');
    var results;

    if (isEnvFile(lines[0] || '')) {
      results = parseEnv(lines, source);
    } else {
      results = parseYAML(lines, source, maxDepth);
      results = results.concat(parseAnchors(text, source));
    }

    console.log('[YAMLAnalyzer] Extracted', results.length, 'symbols from', source);
    return results;
  };

  return YAMLAnalyzer;
}));
