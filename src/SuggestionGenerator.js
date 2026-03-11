// ─────────────────────────────────────────────────────────────────────────────
// SuggestionGenerator.js — Standalone file → suggestion array converter
//
// Zero Monaco dependencies. Works in both browser and Node.js.
//
// API:
//   SuggestionGenerator.fromText(text, options) → suggestion[]
//   SuggestionGenerator.fromFile(file, options) → Promise<suggestion[]>
//
// Output shape per item:
//   {
//     label:              string,
//     detail:             string,
//     insertText:         string,
//     insertTextIsSnippet: boolean,
//     kind:               string,   // 'function'|'variable'|'class'|'keyword'|'property'|'value'|'text'
//     documentation:      string,
//     source:             string    // filename or 'manual'
//   }
// ─────────────────────────────────────────────────────────────────────────────

/* global module */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    // Node.js
    module.exports = factory();
  } else {
    // Browser global
    root.SuggestionGenerator = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function () {
  'use strict';

  // ── Default options ────────────────────────────────────────────────────────
  var DEFAULTS = {
    language:          null,   // auto-detect from filename/content
    filename:          '',
    maxDepth:          3,
    includePrivate:    false,
    deduplicateLabels: true,
    minOccurrences:    2,
    snippetStyle:      'tabstop',  // 'tabstop' | 'plain'
    maxItems:          200
  };

  // ── Helpers ────────────────────────────────────────────────────────────────

  function mergeOpts(userOpts) {
    var o = {};
    for (var k in DEFAULTS) o[k] = DEFAULTS[k];
    if (userOpts) {
      for (var k2 in userOpts) {
        if (Object.prototype.hasOwnProperty.call(userOpts, k2)) {
          o[k2] = userOpts[k2];
        }
      }
    }
    return o;
  }

  function buildSnippet(name, params, opts) {
    if (!params || !params.trim()) {
      return name + '()';
    }
    if (opts.snippetStyle === 'plain') {
      return name + '(' + params + ')';
    }
    // tabstop style: ${1:param1}, ${2:param2}
    var parts = params.split(',').map(function (p, i) {
      var clean = p.trim().split('=')[0].trim(); // strip defaults
      clean = clean.replace(/^\.\.\./, '');       // strip rest params
      if (!clean) clean = 'arg' + (i + 1);
      return '${' + (i + 1) + ':' + clean + '}';
    });
    return name + '(' + parts.join(', ') + ')';
  }

  function dedupe(arr) {
    var seen = {};
    return arr.filter(function (item) {
      if (seen[item.label]) return false;
      seen[item.label] = true;
      return true;
    });
  }

  function stripComments(text) {
    // Remove block comments /* ... */
    text = text.replace(/\/\*[\s\S]*?\*\//g, ' ');
    // Remove line comments // ...
    text = text.replace(/\/\/[^\n]*/g, '');
    return text;
  }

  // Extract the JSDoc block immediately preceding a match index
  function extractJsDoc(text, matchIndex) {
    var before = text.substring(0, matchIndex);
    // Find last /** ... */ before this match (allow whitespace between doc and declaration)
    var docMatch = before.match(/\/\*\*([\s\S]*?)\*\/\s*$/);
    if (!docMatch) return { detail: '', documentation: '' };

    var raw = docMatch[1];
    // First non-empty line = detail
    var lines = raw.split('\n').map(function (l) {
      return l.replace(/^\s*\*?\s?/, '').trim();
    }).filter(function (l) { return l.length > 0; });

    var detail = lines[0] || '';
    var documentation = lines.join(' ');
    return { detail: detail, documentation: documentation };
  }

  // ── Language detection ─────────────────────────────────────────────────────

  function detectLanguage(filename, text) {
    var ext = (filename || '').split('.').pop().toLowerCase();
    var extMap = {
      js: 'js', mjs: 'js', cjs: 'js', jsx: 'js',
      ts: 'js', tsx: 'js',
      json: 'json',
      css: 'css', scss: 'css', less: 'css',
      sql: 'sql',
      yaml: 'yaml', yml: 'yaml',
      env: 'yaml',
      md: 'text', markdown: 'text',
      txt: 'text'
    };

    if (extMap[ext]) return extMap[ext];

    // Content sniffing fallback
    var sample = (text || '').substring(0, 400).trim();
    if (/^\s*[\[{]/.test(sample)) return 'json';
    if (/CREATE\s+TABLE|SELECT\s+\*|INSERT\s+INTO/i.test(sample)) return 'sql';
    if (/^[A-Z_]+=|^\w+:\s/m.test(sample)) return 'yaml';
    if (/^\.|#[\w-]|--[\w-]/.test(sample)) return 'css';
    if (/function\s+\w+|const\s+\w+\s*=|class\s+\w+/.test(sample)) return 'js';

    return 'text';
  }

  // ── Parsers ────────────────────────────────────────────────────────────────

  // JavaScript / TypeScript
  function parseJS(text, opts) {
    var results = [];
    var source = opts.filename || 'manual';

    // --- Named function declarations ---
    // export async function name(params) {
    var reFn = /(?:export\s+)?(?:async\s+)?function\s*\*?\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/g;
    var m;
    while ((m = reFn.exec(text)) !== null) {
      var name = m[1];
      if (!opts.includePrivate && name.charAt(0) === '_') continue;
      var doc = extractJsDoc(text, m.index);
      results.push({
        label: name,
        detail: doc.detail || 'function',
        insertText: buildSnippet(name, m[2], opts),
        insertTextIsSnippet: opts.snippetStyle === 'tabstop',
        kind: 'function',
        documentation: doc.documentation,
        source: source
      });
    }

    // --- Arrow functions: const/let/var name = (params) => ---
    var reArrow = /(?:^|[;\n])[ \t]*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:\(([^)]*)\)|([A-Za-z_$][\w$]*))\s*=>/gm;
    while ((m = reArrow.exec(text)) !== null) {
      var aName = m[1];
      if (!opts.includePrivate && aName.charAt(0) === '_') continue;
      var aParams = m[2] !== undefined ? m[2] : (m[3] || '');
      var aDoc = extractJsDoc(text, m.index);
      results.push({
        label: aName,
        detail: aDoc.detail || 'function',
        insertText: buildSnippet(aName, aParams, opts),
        insertTextIsSnippet: opts.snippetStyle === 'tabstop',
        kind: 'function',
        documentation: aDoc.documentation,
        source: source
      });
    }

    // --- Class declarations ---
    var reClass = /(?:export\s+)?class\s+([A-Za-z_$][\w$]*)(?:\s+extends\s+([A-Za-z_$][\w$.]*))?\s*\{/g;
    while ((m = reClass.exec(text)) !== null) {
      var cName = m[1];
      if (!opts.includePrivate && cName.charAt(0) === '_') continue;
      var cDoc = extractJsDoc(text, m.index);
      results.push({
        label: cName,
        detail: cDoc.detail || (m[2] ? 'extends ' + m[2] : 'class'),
        insertText: opts.snippetStyle === 'tabstop'
          ? 'new ' + cName + '(${1:args})'
          : 'new ' + cName + '()',
        insertTextIsSnippet: opts.snippetStyle === 'tabstop',
        kind: 'class',
        documentation: cDoc.documentation,
        source: source
      });
    }

    // --- Prototype methods: Foo.prototype.bar = function(params) ---
    var reProto = /([A-Za-z_$][\w$]*)\.prototype\.([A-Za-z_$][\w$]*)\s*=\s*function\s*\(([^)]*)\)/g;
    while ((m = reProto.exec(text)) !== null) {
      var mName = m[2];
      if (!opts.includePrivate && mName.charAt(0) === '_') continue;
      var pDoc = extractJsDoc(text, m.index);
      results.push({
        label: mName,
        detail: pDoc.detail || m[1] + ' method',
        insertText: buildSnippet(mName, m[3], opts),
        insertTextIsSnippet: opts.snippetStyle === 'tabstop',
        kind: 'method',
        documentation: pDoc.documentation,
        source: source
      });
    }

    // --- Exported constants: export const NAME = ---
    var reExportConst = /export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g;
    while ((m = reExportConst.exec(text)) !== null) {
      var eName = m[1];
      if (!opts.includePrivate && eName.charAt(0) === '_') continue;
      // skip if already captured as arrow fn (label already in results)
      var alreadyIn = results.some(function (r) { return r.label === eName; });
      if (alreadyIn) continue;
      var eDoc = extractJsDoc(text, m.index);
      results.push({
        label: eName,
        detail: eDoc.detail || 'exported constant',
        insertText: eName,
        insertTextIsSnippet: false,
        kind: 'variable',
        documentation: eDoc.documentation,
        source: source
      });
    }

    // --- Top-level const/let/var (non-function) ---
    var reConst = /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?!(?:async\s+)?(?:function|\(.*\)\s*=>|[A-Za-z_$][\w$]*\s*=>))/gm;
    while ((m = reConst.exec(text)) !== null) {
      var vName = m[1];
      if (!opts.includePrivate && vName.charAt(0) === '_') continue;
      var alreadyIn2 = results.some(function (r) { return r.label === vName; });
      if (alreadyIn2) continue;
      results.push({
        label: vName,
        detail: 'variable',
        insertText: vName,
        insertTextIsSnippet: false,
        kind: 'variable',
        documentation: '',
        source: source
      });
    }

    return results;
  }

  // JSON
  function parseJSON(text, opts) {
    var results = [];
    var obj;
    try {
      obj = JSON.parse(text);
    } catch (e) {
      return results;
    }

    function walk(node, path, depth) {
      if (depth > opts.maxDepth) return;
      if (node === null || typeof node !== 'object') return;

      var keys = Object.keys(node);
      keys.forEach(function (key) {
        var fullPath = path ? path + '.' + key : key;
        var val = node[key];
        var type = Array.isArray(val) ? 'array' : typeof val;
        var detail = type;
        var documentation = '';

        if (type === 'string' || type === 'number' || type === 'boolean') {
          var valStr = String(val);
          if (valStr.length <= 80) documentation = 'Value: ' + valStr;
          detail = type + ' — ' + (valStr.length <= 30 ? valStr : valStr.substring(0, 30) + '…');
        }

        results.push({
          label: fullPath,
          detail: detail,
          insertText: fullPath,
          insertTextIsSnippet: false,
          kind: 'property',
          documentation: documentation,
          source: opts.filename || 'manual'
        });

        if (type === 'object' || type === 'array') {
          walk(val, fullPath, depth + 1);
        }
      });
    }

    walk(obj, '', 0);
    return results;
  }

  // CSS / SCSS / Less
  function parseCSS(text, opts) {
    var results = [];
    var source = opts.filename || 'manual';

    // Strip comments
    var clean = stripComments(text);

    // Class selectors: .my-class
    var reClass = /\.([A-Za-z][\w-]*)\s*[{,]/g;
    var m;
    while ((m = reClass.exec(clean)) !== null) {
      results.push({
        label: '.' + m[1],
        detail: 'CSS class',
        insertText: '.' + m[1],
        insertTextIsSnippet: false,
        kind: 'value',
        documentation: '',
        source: source
      });
    }

    // ID selectors: #my-id
    var reId = /#([A-Za-z][\w-]*)\s*[{,]/g;
    while ((m = reId.exec(clean)) !== null) {
      results.push({
        label: '#' + m[1],
        detail: 'CSS ID',
        insertText: '#' + m[1],
        insertTextIsSnippet: false,
        kind: 'value',
        documentation: '',
        source: source
      });
    }

    // CSS custom properties: --my-var
    var reCssVar = /--([A-Za-z][\w-]*)\s*:/g;
    while ((m = reCssVar.exec(clean)) !== null) {
      results.push({
        label: '--' + m[1],
        detail: 'CSS custom property',
        insertText: 'var(--' + m[1] + ')',
        insertTextIsSnippet: false,
        kind: 'property',
        documentation: '',
        source: source
      });
    }

    // SCSS variables: $my-var
    var reScssVar = /\$([A-Za-z][\w-]*)\s*:/g;
    while ((m = reScssVar.exec(clean)) !== null) {
      results.push({
        label: '$' + m[1],
        detail: 'SCSS variable',
        insertText: '$' + m[1],
        insertTextIsSnippet: false,
        kind: 'variable',
        documentation: '',
        source: source
      });
    }

    // SCSS mixins: @mixin name
    var reMixin = /@mixin\s+([A-Za-z][\w-]*)\s*(?:\(([^)]*)\))?/g;
    while ((m = reMixin.exec(clean)) !== null) {
      var mName = m[1];
      var mParams = m[2] || '';
      results.push({
        label: mName,
        detail: 'SCSS mixin',
        insertText: opts.snippetStyle === 'tabstop' && mParams
          ? '@include ' + mName + '(${1:' + mParams + '})'
          : '@include ' + mName + (mParams ? '(' + mParams + ')' : ''),
        insertTextIsSnippet: opts.snippetStyle === 'tabstop' && !!mParams,
        kind: 'function',
        documentation: '',
        source: source
      });
    }

    return results;
  }

  // SQL
  function parseSQL(text, opts) {
    var results = [];
    var source = opts.filename || 'manual';
    var upper = text.toUpperCase();

    // Table names from CREATE TABLE
    var reCreate = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"[]?(\w+)[`"\]]?/gi;
    var m;
    while ((m = reCreate.exec(text)) !== null) {
      var tName = m[1];
      results.push({
        label: tName,
        detail: 'table',
        insertText: tName,
        insertTextIsSnippet: false,
        kind: 'value',
        documentation: 'SQL table: ' + tName,
        source: source
      });

      // Extract columns from the CREATE TABLE body
      var bodyStart = text.indexOf('(', m.index + m[0].length);
      if (bodyStart !== -1) {
        var depth = 1;
        var bodyEnd = bodyStart + 1;
        while (bodyEnd < text.length && depth > 0) {
          if (text[bodyEnd] === '(') depth++;
          else if (text[bodyEnd] === ')') depth--;
          bodyEnd++;
        }
        var body = text.substring(bodyStart + 1, bodyEnd - 1);
        // Each line = one column definition
        body.split('\n').forEach(function (line) {
          var colMatch = line.trim().match(/^[`"[]?([A-Za-z_]\w*)[`"\]]?\s+\w/);
          if (colMatch) {
            var colName = colMatch[1].toUpperCase();
            // Exclude SQL constraint keywords
            if (/^(PRIMARY|FOREIGN|UNIQUE|INDEX|KEY|CONSTRAINT|CHECK)$/.test(colName)) return;
            results.push({
              label: tName + '.' + colMatch[1],
              detail: 'column of ' + tName,
              insertText: colMatch[1],
              insertTextIsSnippet: false,
              kind: 'property',
              documentation: 'Column in table ' + tName,
              source: source
            });
          }
        });
      }
    }

    // Stored procedures / functions
    var reProcFn = /CREATE\s+(?:OR\s+REPLACE\s+)?(?:PROCEDURE|FUNCTION)\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/gi;
    while ((m = reProcFn.exec(text)) !== null) {
      var pName = m[1];
      results.push({
        label: pName,
        detail: 'stored procedure/function',
        insertText: buildSnippet(pName, m[2], opts),
        insertTextIsSnippet: opts.snippetStyle === 'tabstop',
        kind: 'function',
        documentation: 'SQL stored procedure/function',
        source: source
      });
    }

    // Common SQL clause templates
    var templates = [
      { label: 'SELECT', insertText: opts.snippetStyle === 'tabstop' ? 'SELECT ${1:*} FROM ${2:table} WHERE ${3:condition}' : 'SELECT * FROM table WHERE condition', detail: 'SELECT query template' },
      { label: 'INSERT INTO', insertText: opts.snippetStyle === 'tabstop' ? 'INSERT INTO ${1:table} (${2:columns}) VALUES (${3:values})' : 'INSERT INTO table (columns) VALUES (values)', detail: 'INSERT statement' },
      { label: 'UPDATE', insertText: opts.snippetStyle === 'tabstop' ? 'UPDATE ${1:table} SET ${2:col} = ${3:val} WHERE ${4:condition}' : 'UPDATE table SET col = val WHERE condition', detail: 'UPDATE statement' },
      { label: 'DELETE FROM', insertText: opts.snippetStyle === 'tabstop' ? 'DELETE FROM ${1:table} WHERE ${2:condition}' : 'DELETE FROM table WHERE condition', detail: 'DELETE statement' },
      { label: 'JOIN', insertText: opts.snippetStyle === 'tabstop' ? 'JOIN ${1:table} ON ${2:condition}' : 'JOIN table ON condition', detail: 'JOIN clause' },
      { label: 'LEFT JOIN', insertText: opts.snippetStyle === 'tabstop' ? 'LEFT JOIN ${1:table} ON ${2:condition}' : 'LEFT JOIN table ON condition', detail: 'LEFT JOIN clause' },
      { label: 'GROUP BY', insertText: opts.snippetStyle === 'tabstop' ? 'GROUP BY ${1:column}' : 'GROUP BY column', detail: 'GROUP BY clause' },
      { label: 'ORDER BY', insertText: opts.snippetStyle === 'tabstop' ? 'ORDER BY ${1:column} ${2:ASC}' : 'ORDER BY column ASC', detail: 'ORDER BY clause' },
      { label: 'HAVING', insertText: opts.snippetStyle === 'tabstop' ? 'HAVING ${1:condition}' : 'HAVING condition', detail: 'HAVING clause' },
      { label: 'LIMIT', insertText: opts.snippetStyle === 'tabstop' ? 'LIMIT ${1:10}' : 'LIMIT 10', detail: 'LIMIT clause' }
    ];
    templates.forEach(function (t) {
      results.push({
        label: t.label,
        detail: t.detail,
        insertText: t.insertText,
        insertTextIsSnippet: opts.snippetStyle === 'tabstop',
        kind: 'keyword',
        documentation: '',
        source: 'sql-template'
      });
    });

    return results;
  }

  // YAML / ENV
  function parseYAML(text, opts) {
    var results = [];
    var source = opts.filename || 'manual';
    var lines = text.split('\n');

    // ENV file format: KEY=value
    var isEnv = /^[A-Z_][A-Z0-9_]*\s*=/.test(lines[0]);
    if (isEnv) {
      lines.forEach(function (line) {
        var envMatch = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)/);
        if (!envMatch) return;
        var val = envMatch[2].trim().replace(/^["']|["']$/g, '');
        results.push({
          label: envMatch[1],
          detail: 'env variable' + (val.length <= 30 ? ' — ' + val : ''),
          insertText: envMatch[1],
          insertTextIsSnippet: false,
          kind: 'variable',
          documentation: val.length <= 80 ? 'Value: ' + val : '',
          source: source
        });
      });
      return results;
    }

    // YAML line-by-line path tracking
    var pathStack = [];   // [ { key, indent } ]
    lines.forEach(function (line) {
      if (!line.trim() || line.trim().charAt(0) === '#') return;

      var yamlMatch = line.match(/^(\s*)([A-Za-z_][\w.-]*)\s*:\s*(.*)?$/);
      if (!yamlMatch) return;

      var indent = yamlMatch[1].length;
      var key    = yamlMatch[2];
      var val    = (yamlMatch[3] || '').trim();

      // Pop stack entries that are at same or deeper indent
      while (pathStack.length > 0 && pathStack[pathStack.length - 1].indent >= indent) {
        pathStack.pop();
      }

      var fullPath = pathStack.map(function (s) { return s.key; }).concat(key).join('.');

      if (fullPath.split('.').length > opts.maxDepth) {
        pathStack.push({ key: key, indent: indent });
        return;
      }

      var type = val ? 'string' : 'object';
      var detail = type + (val && val.length <= 30 ? ' — ' + val : '');
      var documentation = val && val.length <= 80 ? 'Value: ' + val : '';

      results.push({
        label: fullPath,
        detail: detail,
        insertText: fullPath,
        insertTextIsSnippet: false,
        kind: 'property',
        documentation: documentation,
        source: source
      });

      pathStack.push({ key: key, indent: indent });
    });

    return results;
  }

  // Plain Text / Markdown
  function parsePlainText(text, opts) {
    var results = [];
    var source = opts.filename || 'manual';

    // Extract fenced code blocks and parse as JS
    var reCode = /```(?:\w+)?\n([\s\S]*?)```/g;
    var m;
    while ((m = reCode.exec(text)) !== null) {
      var blockSuggestions = parseJS(m[1], opts);
      blockSuggestions.forEach(function (s) { s.source = source + ' (code block)'; });
      results = results.concat(blockSuggestions);
    }

    // Markdown headings
    var reHeading = /^#{1,6}\s+(.+)$/gm;
    while ((m = reHeading.exec(text)) !== null) {
      var heading = m[1].trim();
      results.push({
        label: heading,
        detail: 'heading',
        insertText: heading,
        insertTextIsSnippet: false,
        kind: 'text',
        documentation: '',
        source: source
      });
    }

    // Word frequency: capitalized words appearing >= minOccurrences times
    var stripped = text
      .replace(/```[\s\S]*?```/g, '')   // remove code blocks
      .replace(/`[^`]+`/g, '')           // remove inline code
      .replace(/https?:\/\/\S+/g, '');   // remove URLs

    var wordFreq = {};
    var reWord = /\b([A-Z][A-Za-z]{3,})\b/g;
    while ((m = reWord.exec(stripped)) !== null) {
      var word = m[1];
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    }

    Object.keys(wordFreq).forEach(function (word) {
      if (wordFreq[word] >= opts.minOccurrences) {
        // Don't duplicate headings already added
        var alreadyIn = results.some(function (r) { return r.label === word; });
        if (!alreadyIn) {
          results.push({
            label: word,
            detail: 'appears ' + wordFreq[word] + ' times',
            insertText: word,
            insertTextIsSnippet: false,
            kind: 'text',
            documentation: '',
            source: source
          });
        }
      }
    });

    return results;
  }

  // ── Parser dispatch map ───────────────────────────────────────────────────
  var _parsers = {
    js:   parseJS,
    json: parseJSON,
    css:  parseCSS,
    sql:  parseSQL,
    yaml: parseYAML,
    text: parsePlainText
  };

  // ── Public API ─────────────────────────────────────────────────────────────

  var SuggestionGenerator = {};

  /**
   * Detect the language of a file from its name and/or content.
   * @param {string} filename
   * @param {string} text
   * @returns {string}  One of: 'js'|'json'|'css'|'sql'|'yaml'|'text'
   */
  SuggestionGenerator.detectLanguage = function (filename, text) {
    return detectLanguage(filename, text);
  };

  /**
   * Generate suggestions from raw text.
   * @param {string} text      Source file content
   * @param {object} [options] See DEFAULTS above
   * @returns {Array}          Suggestion objects
   */
  SuggestionGenerator.fromText = function (text, options) {
    if (!text || typeof text !== 'string' || !text.trim()) return [];

    var opts = mergeOpts(options);
    var lang = opts.language || detectLanguage(opts.filename || '', text);
    var parser = _parsers[lang] || parsePlainText;

    var suggestions;
    try {
      suggestions = parser(text, opts);
    } catch (e) {
      console.error('[SuggestionGenerator] parser error for lang=' + lang + ':', e);
      return [];
    }

    // Attach source / deduplicate / cap
    suggestions.forEach(function (s) {
      if (!s.source) s.source = opts.filename || 'manual';
    });

    if (opts.deduplicateLabels) {
      suggestions = dedupe(suggestions);
    }

    if (opts.maxItems && suggestions.length > opts.maxItems) {
      suggestions = suggestions.slice(0, opts.maxItems);
    }

    return suggestions;
  };

  /**
   * Generate suggestions from a File object (browser) or file path (Node.js).
   * @param {File|string} file   Browser File object, or Node.js file path string
   * @param {object} [options]
   * @returns {Promise<Array>}
   */
  SuggestionGenerator.fromFile = function (file, options) {
    var opts = mergeOpts(options);

    // Node.js path string
    if (typeof file === 'string') {
      return new Promise(function (resolve, reject) {
        try {
          /* jshint node:true */
          var fs = require('fs');
          var text = fs.readFileSync(file, 'utf8');
          opts.filename = opts.filename || file.split('/').pop().split('\\').pop();
          resolve(SuggestionGenerator.fromText(text, opts));
        } catch (e) {
          reject(e);
        }
      });
    }

    // Browser File object
    if (typeof File !== 'undefined' && file instanceof File) {
      opts.filename = opts.filename || file.name;

      // File size guard: 500KB
      if (file.size > 500 * 1024) {
        return Promise.reject(new Error(
          'File is too large (' + Math.round(file.size / 1024) + 'KB). Maximum is 500KB.'
        ));
      }

      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function (e) {
          try {
            resolve(SuggestionGenerator.fromText(e.target.result, opts));
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = function () {
          reject(new Error('Failed to read file: ' + file.name));
        };
        reader.readAsText(file);
      });
    }

    return Promise.reject(new Error('fromFile: unsupported file argument'));
  };

  return SuggestionGenerator;
}));
