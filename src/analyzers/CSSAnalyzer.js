// ─────────────────────────────────────────────────────────────────────────────
// CSSAnalyzer.js — CSS / SCSS / Less symbol extractor
//
// Extracts:
//   • Class selectors (.my-class)
//   • ID selectors (#my-id)
//   • CSS custom properties (--my-var)
//   • SCSS / Less variables ($my-var, @my-var)
//   • SCSS / Less mixins (@mixin name, .mixin-name())
//   • @keyframes animation names
//   • Media query labels (stored as keyword)
//
// No Monaco dependency. Works in browser and Node.js.
// ─────────────────────────────────────────────────────────────────────────────

/* global module */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.CSSAnalyzer = factory();
}(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function () {
  'use strict';

  function lineOf(text, offset) {
    return text.substring(0, offset).split('\n').length;
  }

  /**
   * Remove CSS block comments /* ... *‌/ preserving newlines.
   */
  function stripCSSComments(text) {
    return text.replace(/\/\*[\s\S]*?\*\//g, function (match) {
      return match.replace(/[^\n]/g, '');
    });
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  var CSSAnalyzer = {};

  /**
   * Analyze CSS/SCSS/Less source text.
   * @param {string} text
   * @param {object} [opts]  { filename }
   * @returns {object[]}  Raw symbol array
   */
  CSSAnalyzer.analyze = function (text, opts) {
    if (!text || typeof text !== 'string' || !text.trim()) return [];
    opts = opts || {};
    var source = opts.filename || 'manual';
    var results = [];

    var clean = stripCSSComments(text);

    // ── Class selectors: .my-class
    var reClass = /\.(-?[A-Za-z_][\w-]*)\s*[{,>~+\s]/g;
    var m;
    while ((m = reClass.exec(clean)) !== null) {
      var cls = m[1];
      // Skip if inside a rule value (pseudo-class false positive check)
      var already = results.some(function (r) { return r.name === '.' + cls && r.kind === 'value'; });
      if (already) continue;
      results.push({
        name:          '.' + cls,
        kind:          'value',
        params:        [],
        returnType:    '',
        documentation: 'CSS class selector',
        source:        source,
        line:          lineOf(text, m.index),
        nested:        []
      });
    }

    // ── ID selectors: #my-id
    var reId = /#(-?[A-Za-z_][\w-]*)\s*[{,>~+\s]/g;
    while ((m = reId.exec(clean)) !== null) {
      var id = m[1];
      var already2 = results.some(function (r) { return r.name === '#' + id && r.kind === 'value'; });
      if (already2) continue;
      results.push({
        name:          '#' + id,
        kind:          'value',
        params:        [],
        returnType:    '',
        documentation: 'CSS ID selector',
        source:        source,
        line:          lineOf(text, m.index),
        nested:        []
      });
    }

    // ── CSS custom properties: --my-var: value;
    var reCssVar = /--([A-Za-z][\w-]*)\s*:/g;
    while ((m = reCssVar.exec(clean)) !== null) {
      var cssVar = m[1];
      // Get value (up to ; or newline)
      var valMatch = clean.substring(m.index + m[0].length).match(/^([^;\n]{0,60})/);
      var valStr = valMatch ? valMatch[1].trim() : '';
      var already3 = results.some(function (r) { return r.name === '--' + cssVar && r.kind === 'property'; });
      if (already3) continue;
      results.push({
        name:          '--' + cssVar,
        kind:          'property',
        params:        [],
        returnType:    '',
        documentation: valStr ? 'Value: ' + valStr : 'CSS custom property',
        source:        source,
        line:          lineOf(text, m.index),
        nested:        []
      });
    }

    // ── SCSS variables: $my-var: value;
    var reScssVar = /\$([A-Za-z][\w-]*)\s*:/g;
    while ((m = reScssVar.exec(clean)) !== null) {
      var scssVar = m[1];
      var valMatch2 = clean.substring(m.index + m[0].length).match(/^([^;\n]{0,60})/);
      var valStr2 = valMatch2 ? valMatch2[1].trim() : '';
      var already4 = results.some(function (r) { return r.name === '$' + scssVar && r.kind === 'variable'; });
      if (already4) continue;
      results.push({
        name:          '$' + scssVar,
        kind:          'variable',
        params:        [],
        returnType:    '',
        documentation: valStr2 ? 'Value: ' + valStr2 : 'SCSS variable',
        source:        source,
        line:          lineOf(text, m.index),
        nested:        []
      });
    }

    // ── Less variables: @my-var: value;  (avoid @media, @keyframes etc.)
    var reLessVar = /@([A-Za-z][\w-]*)\s*:/g;
    while ((m = reLessVar.exec(clean)) !== null) {
      var lessVar = m[1];
      // Skip at-rule keywords
      if (/^(media|keyframes|import|charset|font-face|supports|page|namespace|mixin|include|extend|if|else|each|for|while)$/.test(lessVar)) continue;
      var already5 = results.some(function (r) { return r.name === '@' + lessVar; });
      if (already5) continue;
      results.push({
        name:          '@' + lessVar,
        kind:          'variable',
        params:        [],
        returnType:    '',
        documentation: 'Less variable',
        source:        source,
        line:          lineOf(text, m.index),
        nested:        []
      });
    }

    // ── SCSS mixins: @mixin name(params)
    var reMixin = /@mixin\s+([A-Za-z][\w-]*)\s*(?:\(([^)]*)\))?/g;
    while ((m = reMixin.exec(clean)) !== null) {
      var mName = m[1];
      var mRawParams = m[2] || '';
      var mParams = mRawParams ? mRawParams.split(',').map(function (p) {
        return p.trim().replace(/^\$/, '').split(':')[0].trim();
      }) : [];
      results.push({
        name:          mName,
        kind:          'function',
        params:        mParams,
        returnType:    '',
        documentation: 'SCSS mixin',
        source:        source,
        line:          lineOf(text, m.index),
        nested:        []
      });
    }

    // ── Less mixins: .mixin-name() { — simple class used as mixin
    var reLessMixin = /\.([A-Za-z][\w-]*)\s*\(([^)]*)\)\s*\{/g;
    while ((m = reLessMixin.exec(clean)) !== null) {
      var lmName = m[1];
      var already6 = results.some(function (r) { return r.name === lmName && r.kind === 'function'; });
      if (already6) continue;
      results.push({
        name:          lmName,
        kind:          'function',
        params:        m[2].split(',').map(function (p) { return p.trim().replace(/^@/, '').split(':')[0].trim(); }).filter(Boolean),
        returnType:    '',
        documentation: 'Less mixin',
        source:        source,
        line:          lineOf(text, m.index),
        nested:        []
      });
    }

    // ── @keyframes animation names
    var reKeyframe = /@(?:-\w+-)?keyframes\s+([A-Za-z_][\w-]*)/g;
    while ((m = reKeyframe.exec(clean)) !== null) {
      var kfName = m[1];
      results.push({
        name:          kfName,
        kind:          'keyword',
        params:        [],
        returnType:    '',
        documentation: '@keyframes animation',
        source:        source,
        line:          lineOf(text, m.index),
        nested:        []
      });
    }

    console.log('[CSSAnalyzer] Extracted', results.length, 'symbols from', source);
    return results;
  };

  return CSSAnalyzer;
}));
