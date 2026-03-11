// ─────────────────────────────────────────────────────────────────────────────
// AnalyzerEngine.js — Central file type dispatcher
//
// Routes source text to the correct per-language analyzer based on filename
// extension and/or content sniffing. Handles minified file detection.
//
// No Monaco dependency. Works in browser and Node.js.
//
// Usage:
//   AnalyzerEngine.analyze(text, { filename: 'app.ts', includePrivate: true })
//   → raw symbol[]
//
//   AnalyzerEngine.detectLanguage('styles.scss', text)
//   → 'css'
// ─────────────────────────────────────────────────────────────────────────────

/* global module, JSAnalyzer, TSAnalyzer, JSONAnalyzer, CSSAnalyzer, SQLAnalyzer, YAMLAnalyzer */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(
      require('./JSAnalyzer'),
      require('./TSAnalyzer'),
      require('./JSONAnalyzer'),
      require('./CSSAnalyzer'),
      require('./SQLAnalyzer'),
      require('./YAMLAnalyzer')
    );
  } else {
    root.AnalyzerEngine = factory(
      root.JSAnalyzer,
      root.TSAnalyzer,
      root.JSONAnalyzer,
      root.CSSAnalyzer,
      root.SQLAnalyzer,
      root.YAMLAnalyzer
    );
  }
}(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function (
  JSAnalyzer, TSAnalyzer, JSONAnalyzer, CSSAnalyzer, SQLAnalyzer, YAMLAnalyzer
) {
  'use strict';

  // ── Extension → language id ──────────────────────────────────────────────────

  var EXT_MAP = {
    js:   'js',  mjs: 'js',  cjs: 'js',  jsx: 'js',
    ts:   'ts',  tsx: 'ts',
    json: 'json',
    css:  'css', scss: 'css', less: 'css',
    sql:  'sql',
    yaml: 'yaml', yml: 'yaml', env: 'yaml'
  };

  var ANALYZER_MAP = {
    js:   JSAnalyzer,
    ts:   TSAnalyzer,
    json: JSONAnalyzer,
    css:  CSSAnalyzer,
    sql:  SQLAnalyzer,
    yaml: YAMLAnalyzer
  };

  // ── Default options ──────────────────────────────────────────────────────────

  var DEFAULTS = {
    filename:       '',
    language:       null,
    maxDepth:       Infinity,
    includePrivate: true,
    snippetStyle:   'tabstop',
    minified:       'skip'     // 'skip' | 'attempt'
  };

  function mergeOpts(userOpts) {
    var o = {};
    for (var k in DEFAULTS) o[k] = DEFAULTS[k];
    if (userOpts) {
      for (var k2 in userOpts) {
        if (Object.prototype.hasOwnProperty.call(userOpts, k2)) o[k2] = userOpts[k2];
      }
    }
    return o;
  }

  // ── Language detection ───────────────────────────────────────────────────────

  /**
   * Detect the language of a file from its name and/or content.
   * @param {string} filename
   * @param {string} [text]
   * @returns {string}  Language id: 'js'|'ts'|'json'|'css'|'sql'|'yaml'
   */
  function detectLanguage(filename, text) {
    var ext = (filename || '').split('.').pop().toLowerCase();
    if (EXT_MAP[ext]) return EXT_MAP[ext];

    // Content sniffing fallback
    var sample = ((text || '').substring(0, 600)).trim();
    if (!sample) return 'js';

    if (/^\s*[\[{]/.test(sample)) return 'json';
    if (/CREATE\s+TABLE|SELECT\s+\*\s+FROM|INSERT\s+INTO/i.test(sample)) return 'sql';
    if (/^[A-Z_][A-Z0-9_]*\s*=/m.test(sample)) return 'yaml';       // ENV
    if (/^\w[\w.-]*:\s/m.test(sample)) return 'yaml';                // YAML
    if (/^\.|#[\w-]|--[\w-]|\$[\w-]/.test(sample)) return 'css';
    if (/interface\s+\w+|type\s+\w+\s*=|enum\s+\w+|:\s*[A-Z][\w<>[\]]+/.test(sample)) return 'ts';
    if (/function\s+\w+|const\s+\w+\s*=|class\s+\w+|=>/.test(sample)) return 'js';

    return 'js';
  }

  // ── Minified file detection ──────────────────────────────────────────────────

  /**
   * Heuristic: file is minified if it has very few lines but any line is > 500 chars.
   * @param {string} text
   * @returns {boolean}
   */
  function isMinified(text) {
    var lines = text.split('\n');
    // Only flag as minified if file has < 10 lines and contains a very long line
    var longLines = lines.filter(function (l) { return l.length > 500; });
    return longLines.length > 0 && lines.length < 10;
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  var AnalyzerEngine = {};

  /**
   * Detect language from filename / text.
   * @param {string} filename
   * @param {string} [text]
   * @returns {string}
   */
  AnalyzerEngine.detectLanguage = function (filename, text) {
    return detectLanguage(filename, text);
  };

  /**
   * List all registered language ids.
   * @returns {string[]}
   */
  AnalyzerEngine.supportedLanguages = function () {
    return Object.keys(ANALYZER_MAP).filter(function (k) { return !!ANALYZER_MAP[k]; });
  };

  /**
   * Analyze source text and return raw symbol array.
   *
   * @param {string} text    Source content
   * @param {object} [opts]  Configuration:
   *   {
   *     filename:       string,    // used for language detection + symbol source field
   *     language:       string,    // override language detection ('js'|'ts'|'json'|'css'|'sql'|'yaml')
   *     maxDepth:       number,    // nesting depth for JSON / YAML / object literals (default: Infinity)
   *     includePrivate: boolean,   // include _ prefixed symbols (default: true)
   *     snippetStyle:   string,    // 'tabstop' | 'plain' (default: 'tabstop')
   *     minified:       string     // 'skip' | 'attempt' (default: 'skip')
   *   }
   * @returns {object[]}  Array of raw symbol objects
   */
  AnalyzerEngine.analyze = function (text, opts) {
    if (!text || typeof text !== 'string' || !text.trim()) {
      console.warn('[AnalyzerEngine] analyze: empty input');
      return [];
    }

    var o = mergeOpts(opts);
    var lang = o.language || detectLanguage(o.filename, text);

    // Minified file guard
    if (o.minified === 'skip' && isMinified(text)) {
      console.warn('[AnalyzerEngine] Skipping minified file:', o.filename || '(unknown)');
      return [];
    }

    var analyzer = ANALYZER_MAP[lang];
    if (!analyzer) {
      console.warn('[AnalyzerEngine] No analyzer registered for language:', lang,
        '— falling back to JSAnalyzer');
      analyzer = JSAnalyzer;
    }

    if (!analyzer) {
      console.error('[AnalyzerEngine] No analyzer available');
      return [];
    }

    console.log('[AnalyzerEngine] Routing', o.filename || '(text)', '\u2192', lang,
      '(' + analyzer.constructor.name + ')');

    try {
      return analyzer.analyze(text, o);
    } catch (e) {
      console.error('[AnalyzerEngine] Error during analysis (lang=' + lang + '):', e);
      return [];
    }
  };

  return AnalyzerEngine;
}));
