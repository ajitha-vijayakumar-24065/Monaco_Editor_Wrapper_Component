// ─────────────────────────────────────────────────────────────────────────────
// TSAnalyzer.js — TypeScript / TSX symbol extractor
//
// Extends JSAnalyzer with TypeScript-specific constructs:
//   • Interface declarations and their properties
//   • Type alias declarations
//   • Enum declarations and their members
//   • Decorator names (@Component, @Injectable, etc.)
//   • Generic type parameter names (extracted from relevant declarations)
//
// No Monaco dependency. Works in browser and Node.js.
// Depends on: JSAnalyzer (must be loaded first in browser)
// ─────────────────────────────────────────────────────────────────────────────

/* global module, JSAnalyzer */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./JSAnalyzer'));
  } else {
    root.TSAnalyzer = factory(root.JSAnalyzer);
  }
}(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function (JSAnalyzer) {
  'use strict';

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function lineOf(text, offset) {
    return text.substring(0, offset).split('\n').length;
  }

  function parseParams(paramStr) {
    if (!paramStr || !paramStr.trim()) return [];
    var params = [];
    var depth = 0;
    var cur = '';
    for (var i = 0; i < paramStr.length; i++) {
      var ch = paramStr[i];
      if (ch === '(' || ch === '[' || ch === '{' || ch === '<') depth++;
      else if (ch === ')' || ch === ']' || ch === '}' || ch === '>') depth--;
      else if (ch === ',' && depth === 0) {
        params.push(cur.trim());
        cur = '';
        continue;
      }
      cur += ch;
    }
    if (cur.trim()) params.push(cur.trim());

    return params.map(function (p) {
      p = p.replace(/^\.\.\./, '');
      p = p.split(':')[0].trim();  // strip TS type annotation
      p = p.split('=')[0].trim();  // strip default value
      return p.replace(/[?!]$/, '').trim() || 'arg';
    }).filter(function (p) { return p.length > 0; });
  }

  function extractJsDoc(text, matchIndex) {
    var before = text.substring(0, matchIndex);
    var docMatch = before.match(/\/\*\*([\s\S]*?)\*\/\s*$/);
    if (!docMatch) return { documentation: '' };
    var raw = docMatch[1];
    var lines = raw.split('\n').map(function (l) {
      return l.replace(/^\s*\*?\s?/, '').trim();
    }).filter(function (l) { return l.length > 0; });
    return { documentation: lines.join(' ') };
  }

  // Strip comments preserving newlines
  function stripComments(text) {
    return text
      .replace(/\/\*[\s\S]*?\*\//g, function (m) {
        return m.split('\n').map(function (l, i) { return i === 0 ? '' : ''; }).join('\n');
      })
      .replace(/\/\/[^\n]*/g, '');
  }

  // ── TypeScript-specific extractors ──────────────────────────────────────────

  /**
   * Extract interface declarations and their property members.
   * @param {string} text
   * @param {object} opts
   * @returns {object[]}
   */
  function extractInterfaces(text, opts) {
    var results = [];
    var source = opts.filename || 'manual';
    var stripped = stripComments(text);

    // interface Name [extends ...] {
    var reIface = /(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*(?:extends\s+[^{]+)?\s*\{/g;
    var m;
    while ((m = reIface.exec(stripped)) !== null) {
      var ifName = m[1];
      var doc = extractJsDoc(text, m.index);

      // Find interface body
      var bStart = stripped.indexOf('{', m.index + m[0].length - 1);
      if (bStart === -1) continue;
      var depth = 1;
      var pos = bStart + 1;
      while (pos < stripped.length && depth > 0) {
        if (stripped[pos] === '{') depth++;
        else if (stripped[pos] === '}') depth--;
        pos++;
      }
      var body = stripped.substring(bStart + 1, pos - 1);

      // Extract property signatures: propName[?]: Type;
      var props = [];
      var reProp = /^\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)\s*[?!]?\s*(?::\s*[^\n;,}]+)?[;\n,]/gm;
      var pm;
      while ((pm = reProp.exec(body)) !== null) {
        var pName = pm[1];
        if (!opts.includePrivate && pName.charAt(0) === '_') continue;
        // Skip method signatures captured below
        if (/\(/.test(body.substring(pm.index, pm.index + pm[0].length + 20))) continue;
        props.push({
          name:          ifName + '.' + pName,
          kind:          'property',
          params:        [],
          returnType:    '',
          documentation: 'property of ' + ifName,
          source:        source,
          line:          lineOf(text, bStart) + lineOf(body, pm.index) - 1,
          nested:        []
        });
      }

      // Extract method signatures: methodName(params): ReturnType;
      var reMeth = /^\s*([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(([^)]*)\)\s*(?::\s*[^\n;]+)?[;,]/gm;
      while ((pm = reMeth.exec(body)) !== null) {
        var mName = pm[1];
        if (!opts.includePrivate && mName.charAt(0) === '_') continue;
        props.push({
          name:          ifName + '.' + mName,
          kind:          'method',
          params:        parseParams(pm[2]),
          returnType:    '',
          documentation: 'method of interface ' + ifName,
          source:        source,
          line:          lineOf(text, bStart) + lineOf(body, pm.index) - 1,
          nested:        []
        });
      }

      results.push({
        name:          ifName,
        kind:          'interface',
        params:        [],
        returnType:    '',
        documentation: doc.documentation,
        source:        source,
        line:          lineOf(text, m.index),
        nested:        props
      });
      results = results.concat(props);
    }
    return results;
  }

  /**
   * Extract type alias declarations.
   * @param {string} text
   * @param {object} opts
   * @returns {object[]}
   */
  function extractTypeAliases(text, opts) {
    var results = [];
    var source = opts.filename || 'manual';
    var stripped = stripComments(text);

    var reType = /(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*=/g;
    var m;
    while ((m = reType.exec(stripped)) !== null) {
      var tName = m[1];
      if (!opts.includePrivate && tName.charAt(0) === '_') continue;
      var doc = extractJsDoc(text, m.index);
      results.push({
        name:          tName,
        kind:          'type',
        params:        [],
        returnType:    '',
        documentation: doc.documentation || 'type alias',
        source:        source,
        line:          lineOf(text, m.index),
        nested:        []
      });
    }
    return results;
  }

  /**
   * Extract enum declarations and their members.
   * @param {string} text
   * @param {object} opts
   * @returns {object[]}
   */
  function extractEnums(text, opts) {
    var results = [];
    var source = opts.filename || 'manual';
    var stripped = stripComments(text);

    var reEnum = /(?:export\s+)?(?:const\s+)?enum\s+([A-Za-z_$][\w$]*)\s*\{/g;
    var m;
    while ((m = reEnum.exec(stripped)) !== null) {
      var eName = m[1];
      if (!opts.includePrivate && eName.charAt(0) === '_') continue;
      var doc = extractJsDoc(text, m.index);

      // Find enum body
      var bStart = stripped.indexOf('{', m.index + m[0].length - 1);
      if (bStart === -1) continue;
      var depth = 1;
      var pos = bStart + 1;
      while (pos < stripped.length && depth > 0) {
        if (stripped[pos] === '{') depth++;
        else if (stripped[pos] === '}') depth--;
        pos++;
      }
      var body = stripped.substring(bStart + 1, pos - 1);

      // Extract enum members: Member = value, or just Member,
      var members = [];
      var reMember = /^\s*([A-Za-z_$][\w$]*)\s*(?:=\s*[^,\n}]+)?[,\n]/gm;
      var em;
      while ((em = reMember.exec(body)) !== null) {
        var memName = em[1];
        members.push({
          name:          eName + '.' + memName,
          kind:          'enumMember',
          params:        [],
          returnType:    '',
          documentation: 'member of enum ' + eName,
          source:        source,
          line:          lineOf(text, bStart) + lineOf(body, em.index) - 1,
          nested:        []
        });
      }

      results.push({
        name:          eName,
        kind:          'enum',
        params:        [],
        returnType:    '',
        documentation: doc.documentation,
        source:        source,
        line:          lineOf(text, m.index),
        nested:        members
      });
      results = results.concat(members);
    }
    return results;
  }

  /**
   * Extract decorator names from TypeScript source.
   * @param {string} text
   * @param {object} opts
   * @returns {object[]}
   */
  function extractDecorators(text, opts) {
    var results = [];
    var source = opts.filename || 'manual';

    var reDecorator = /@([A-Za-z_$][\w$]*)\s*(?:\(([^)]*)\))?/g;
    var m;
    while ((m = reDecorator.exec(text)) !== null) {
      var dName = m[1];
      // Skip common non-decorator @ uses
      if (/^(param|returns|type|typedef|example|see|deprecated)$/.test(dName)) continue;
      var already = results.some(function (r) { return r.name === dName && r.kind === 'decorator'; });
      if (already) continue;
      results.push({
        name:          dName,
        kind:          'decorator',
        params:        m[2] ? [m[2]] : [],
        returnType:    '',
        documentation: '@' + dName + ' decorator',
        source:        source,
        line:          lineOf(text, m.index),
        nested:        []
      });
    }
    return results;
  }

  // ── Main analyzer ────────────────────────────────────────────────────────────

  /**
   * Analyze TypeScript source text.
   * Runs JSAnalyzer first, then appends TS-specific extractions.
   * @param {string} text
   * @param {object} [opts]  { filename, includePrivate, maxDepth }
   * @returns {object[]}  Raw symbol array
   */
  function analyze(text, opts) {
    opts = opts || {};
    var source = opts.filename || 'manual';

    // Base JS symbols
    var results = JSAnalyzer ? JSAnalyzer.analyze(text, opts) : [];

    // TS-specific
    results = results.concat(extractInterfaces(text, opts));
    results = results.concat(extractTypeAliases(text, opts));
    results = results.concat(extractEnums(text, opts));
    results = results.concat(extractDecorators(text, opts));

    console.log('[TSAnalyzer] Extracted', results.length, 'symbols from', source);
    return results;
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  var TSAnalyzer = {};

  /**
   * Analyze TypeScript source text.
   * @param {string} text
   * @param {object} [opts]  { filename, includePrivate, maxDepth }
   * @returns {object[]}
   */
  TSAnalyzer.analyze = function (text, opts) {
    if (!text || typeof text !== 'string' || !text.trim()) return [];
    try {
      return analyze(text, opts || {});
    } catch (e) {
      console.error('[TSAnalyzer] Unexpected error:', e);
      return [];
    }
  };

  return TSAnalyzer;
}));
