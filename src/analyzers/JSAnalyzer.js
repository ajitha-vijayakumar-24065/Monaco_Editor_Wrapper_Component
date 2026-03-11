// ─────────────────────────────────────────────────────────────────────────────
// JSAnalyzer.js — JavaScript / JSX symbol extractor
//
// No Monaco dependency. Works in browser and Node.js.
//
// Extracts:
//   • Named function declarations + arrow functions
//   • Class declarations + all their methods (including static)
//   • Prototype assignments
//   • Top-level var / let / const declarations
//   • Object literals (all nested keys up to maxDepth)
//   • Exported symbols (ES6 export + module.exports)
//   • Imported symbols (ES6 import + require())
//   • JSDoc comments (used as documentation)
//   • Private members (configurable via includePrivate)
//
// Raw symbol shape per item:
//   {
//     name:          string,
//     kind:          'function'|'variable'|'class'|'method'|'property'|'constant',
//     params:        string[],    // parameter name list
//     returnType:    string,      // '' if not detectable
//     documentation: string,      // extracted JSDoc text
//     source:        string,      // filename or 'manual'
//     line:          number,      // 1-based line number
//     nested:        []           // child symbols (class methods, object keys)
//   }
// ─────────────────────────────────────────────────────────────────────────────

/* global module */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.JSAnalyzer = factory();
}(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function () {
  'use strict';

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /**
   * Convert a flat text offset to a 1-based line number.
   * @param {string} text
   * @param {number} offset
   * @returns {number}
   */
  function lineOf(text, offset) {
    var sub = text.substring(0, offset);
    return sub.split('\n').length;
  }

  /**
   * Parse a parameter string into a clean array of names.
   * Handles defaults, destructuring, rest params.
   * @param {string} paramStr  Raw param string, e.g. "a, b = 1, {x, y}, ...rest"
   * @returns {string[]}
   */
  function parseParams(paramStr) {
    if (!paramStr || !paramStr.trim()) return [];
    // Split by comma, but be careful of nested braces
    var params = [];
    var depth = 0;
    var cur = '';
    for (var i = 0; i < paramStr.length; i++) {
      var ch = paramStr[i];
      if (ch === '(' || ch === '[' || ch === '{') depth++;
      else if (ch === ')' || ch === ']' || ch === '}') depth--;
      else if (ch === ',' && depth === 0) {
        params.push(cur.trim());
        cur = '';
        continue;
      }
      cur += ch;
    }
    if (cur.trim()) params.push(cur.trim());

    return params.map(function (p) {
      p = p.replace(/^\.\.\./, '');         // rest param
      p = p.split('=')[0].trim();           // strip default value
      p = p.replace(/^[\[{].*[\]}]$/, '');  // strip destructured object/array
      return p || 'arg';
    }).filter(function (p) { return p.length > 0; });
  }

  /**
   * Extract the JSDoc comment block immediately preceding a given text offset.
   * @param {string} text
   * @param {number} matchIndex  Start offset of the declaration
   * @returns {{ documentation: string }}
   */
  function extractJsDoc(text, matchIndex) {
    var before = text.substring(0, matchIndex);
    var docMatch = before.match(/\/\*\*([\s\S]*?)\*\/\s*$/);
    if (!docMatch) return { documentation: '', params: [], returnType: '' };

    var raw = docMatch[1];
    var lines = raw.split('\n').map(function (l) {
      return l.replace(/^\s*\*?\s?/, '').trim();
    }).filter(function (l) { return l.length > 0; });

    // Parse @param {Type} name and @returns {Type}
    var docParams = [];
    var docReturn = '';
    var descLines = [];
    lines.forEach(function (l) {
      var pm = l.match(/^@param\s+(?:\{([^}]+)\}\s+)?([A-Za-z_$][\w$]*)(?:\s+-?\s*(.*))?/);
      if (pm) {
        docParams.push({ name: pm[2], type: pm[1] || 'any', description: pm[3] || '' });
        return;
      }
      var rm = l.match(/^@returns?\s+(?:\{([^}]+)\})?\s*(.*)/);
      if (rm) { docReturn = rm[1] || ''; return; }
      if (!l.startsWith('@')) descLines.push(l);
    });

    return {
      documentation: descLines.join(' '),
      params:        docParams,
      returnType:    docReturn
    };
  }

  /**
   * Find the index of the closing brace matching an opening brace.
   * @param {string} text
   * @param {number} openIndex  Index of '{'
   * @returns {number}  Index of matching '}'
   */
  function findMatchingBrace(text, openIndex) {
    var depth = 1;
    var pos   = openIndex + 1;
    // Track the previous significant character for regex literal detection
    var prevSignificant = '{';
    while (pos < text.length && depth > 0) {
      var ch = text[pos];
      // Skip over string literals so braces inside strings don't throw off the count
      if (ch === '"' || ch === "'" || ch === '`') {
        var q = ch;
        pos++;
        while (pos < text.length && text[pos] !== q) {
          if (text[pos] === '\\') pos++; // skip escaped character
          pos++;
        }
        prevSignificant = q;
      } else if (ch === '/' && pos + 1 < text.length) {
        // Skip line comments
        if (text[pos + 1] === '/') {
          pos += 2;
          while (pos < text.length && text[pos] !== '\n') pos++;
          pos++;
          continue;
        }
        // Skip block comments
        if (text[pos + 1] === '*') {
          pos += 2;
          while (pos < text.length && !(text[pos] === '*' && text[pos + 1] === '/')) pos++;
          pos += 2;
          continue;
        }
        // Regex literal detection: / after = ( [ ! & | ? : , ; { } ~ ^ + - * % return etc.
        var rePreChars = '=([!&|?:,;{}~^+-*%<>\n';
        if (rePreChars.indexOf(prevSignificant) !== -1) {
          // Skip regex literal /pattern/flags
          pos++;
          while (pos < text.length && text[pos] !== '/') {
            if (text[pos] === '\\') pos++; // skip escaped char in regex
            if (text[pos] === '[') {
              pos++;
              while (pos < text.length && text[pos] !== ']') {
                if (text[pos] === '\\') pos++;
                pos++;
              }
            }
            pos++;
          }
          // pos is now on closing /  — skip optional flags
          if (pos < text.length) {
            pos++;
            while (pos < text.length && /[gimsuy]/.test(text[pos])) pos++;
          }
          prevSignificant = '/';
          continue;
        }
        prevSignificant = '/';
      } else if (ch === '{') {
        depth++;
        prevSignificant = '{';
      } else if (ch === '}') {
        depth--;
        prevSignificant = '}';
      } else if (ch !== ' ' && ch !== '\t' && ch !== '\n' && ch !== '\r') {
        prevSignificant = ch;
      }
      pos++;
    }
    return pos - 1;
  }

  /**
   * Remove block and line comments from text (preserving line count).
   * @param {string} text
   * @returns {string}
   */
  function stripComments(text) {
    var inString = false;
    var stringChar = '';
    var result = [];
    var i = 0;
    while (i < text.length) {
      var ch = text[i];
      if (inString) {
        result.push(ch);
        if (ch === '\\') { i++; if (i < text.length) result.push(text[i]); }
        else if (ch === stringChar) inString = false;
        i++;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        inString = true; stringChar = ch;
        result.push(ch); i++; continue;
      }
      // Line comment
      if (ch === '/' && text[i + 1] === '/') {
        while (i < text.length && text[i] !== '\n') i++;
        continue;
      }
      // Block comment — preserve newlines so line numbers stay accurate
      if (ch === '/' && text[i + 1] === '*') {
        i += 2;
        while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
          if (text[i] === '\n') result.push('\n');
          i++;
        }
        i += 2;
        continue;
      }
      result.push(ch);
      i++;
    }
    return result.join('');
  }

  // ── Core extraction ──────────────────────────────────────────────────────────

  /**
   * Extract class body methods from the text starting at bodyStart index.
   * Returns array of raw method symbols.
   * @param {string} text       Full source text
   * @param {string} className
   * @param {number} bodyStart  Index of '{' opening the class body
   * @param {object} opts
   * @returns {object[]}
   */
  function extractClassMethods(text, className, bodyStart, opts) {
    var methods = [];
    var source = opts.filename || 'manual';

    // Find the matching closing brace
    var depth = 1;
    var pos = bodyStart + 1;
    while (pos < text.length && depth > 0) {
      if (text[pos] === '{') depth++;
      else if (text[pos] === '}') depth--;
      pos++;
    }
    var body = text.substring(bodyStart + 1, pos - 1);

    // Method patterns inside the class body
    // Matches: [static] [async] methodName(params) or [static] get/set propName(params)
    var reMethod = /(?:^|\n)[ \t]*(?:(static)\s+)?(?:(async)\s+)?(?:(get|set)\s+)?([A-Za-z_$#][\w$#]*)\s*\(([^)]*)\)\s*\{/g;
    var m;
    while ((m = reMethod.exec(body)) !== null) {
      var mName = m[4];
      if (mName === 'constructor') continue; // skip constructor here
      if (!opts.includePrivate && (mName.charAt(0) === '_' || mName.charAt(0) === '#')) continue;
      var mParams = parseParams(m[5]);
      var mDoc = extractJsDoc(body, m.index);
      var bodyLineOffset = lineOf(text, bodyStart);
      methods.push({
        name:          mName,
        kind:          'method',
        params:        mParams,
        returnType:    '',
        documentation: mDoc.documentation,
        source:        source,
        line:          bodyLineOffset + lineOf(body, m.index) - 1,
        nested:        []
      });
    }

    // Constructor
    var reCtor = /constructor\s*\(([^)]*)\)\s*\{/g;
    while ((m = reCtor.exec(body)) !== null) {
      var ctorParams = parseParams(m[1]);
      var ctorDoc = extractJsDoc(body, m.index);
      var ctorLine = lineOf(text, bodyStart) + lineOf(body, m.index) - 1;
      methods.unshift({
        name:          className,
        kind:          'method',
        params:        ctorParams,
        returnType:    '',
        documentation: ctorDoc.documentation || 'constructor',
        source:        source,
        line:          ctorLine,
        nested:        []
      });
      break;
    }

    return methods;
  }

  /**
   * Extract nested object keys from an object literal string.
   * Returns flat list of {name, line} up to opts.maxDepth levels.
   * @param {string} objText  The object literal body (between { and })
   * @param {string} prefix
   * @param {number} depth
   * @param {object} opts
   * @param {string} source
   * @param {number} baseLineOffset  Line number of the opening brace in full text
   * @returns {object[]}
   */
  function extractObjectKeys(objText, prefix, depth, opts, source, baseLineOffset) {
    if (depth > (opts.maxDepth || 5)) return [];
    var results = [];

    var reKey = /(?:^|[,\n{])[ \t]*(?:\/\*[\s\S]*?\*\/\s*)?(?:["']([^"']+)["']|([A-Za-z_$][\w$]*))\s*:/g;
    var m;
    while ((m = reKey.exec(objText)) !== null) {
      var key = m[1] !== undefined ? m[1] : m[2];
      if (!key) continue;
      var fullKey = prefix ? prefix + '.' + key : key;
      var keyLine = baseLineOffset + lineOf(objText, m.index) - 1;

      results.push({
        name:          fullKey,
        kind:          'property',
        params:        [],
        returnType:    '',
        documentation: '',
        source:        source,
        line:          keyLine,
        nested:        []
      });

      // Try to find the value start and recurse into nested objects
      var valueStart = objText.indexOf(':', m.index + m[0].length - 1);
      if (valueStart === -1) continue;
      var vPos = valueStart + 1;
      while (vPos < objText.length && /[ \t]/.test(objText[vPos])) vPos++;
      if (objText[vPos] === '{') {
        // Find matching closing brace
        var bDepth = 1;
        var bPos = vPos + 1;
        while (bPos < objText.length && bDepth > 0) {
          if (objText[bPos] === '{') bDepth++;
          else if (objText[bPos] === '}') bDepth--;
          bPos++;
        }
        var nested = extractObjectKeys(
          objText.substring(vPos + 1, bPos - 1),
          fullKey,
          depth + 1,
          opts,
          source,
          keyLine
        );
        results = results.concat(nested);
      }
    }
    return results;
  }

  /**
   * Infer a TypeScript type string from a JavaScript RHS value snippet.
   * @param {string} rhs  Trimmed right-hand-side text after '='
   * @returns {string}
   */
  function inferType(rhs) {
    if (!rhs) return 'any';
    var s = rhs.trim();
    if (s === 'true' || s === 'false')            return 'boolean';
    if (/^-?\d+(\.\d+)?$/.test(s))               return 'number';
    if (s.charAt(0) === '"' || s.charAt(0) === "'" || s.charAt(0) === '`') return 'string';
    if (s.charAt(0) === '[')                      return 'any[]';
    if (/^new\s+([A-Za-z_$][\w$]*)/.test(s)) {
      var ctorMatch = s.match(/^new\s+([A-Za-z_$][\w$]*)/);
      return ctorMatch ? ctorMatch[1] : 'object';
    }
    if (s === 'null' || s === 'undefined')        return 'any';
    if (s.charAt(0) === '{')                      return 'object';
    return 'any';
  }

  // ── Main analyzer ────────────────────────────────────────────────────────────

  /**
   * Analyze JavaScript source text and return an array of raw symbols.
   * @param {string} text
   * @param {object} opts  { filename, includePrivate, maxDepth, snippetStyle }
   * @returns {object[]}  Raw symbol array
   */
  function analyze(text, opts) {
    opts = opts || {};
    var source = opts.filename || 'manual';
    var includePrivate = opts.includePrivate !== false; // default true
    var results = [];

    // Work on comment-stripped text for extraction (preserve newlines for line numbers)
    var stripped = stripComments(text);

    // ── 1. Named function declarations ────────────────────────────────────────
    // Handles: [export] [async] function* name(params)
    var reFn = /(?:export\s+)?(?:async\s+)?function\s*\*?\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/g;
    var m;
    while ((m = reFn.exec(stripped)) !== null) {
      var fnName = m[1];
      if (!includePrivate && fnName.charAt(0) === '_') continue;
      var doc = extractJsDoc(text, m.index);
      results.push({
        name:          fnName,
        kind:          'function',
        params:        parseParams(m[2]),
        returnType:    doc.returnType || '',
        documentation: doc.documentation,
        source:        source,
        line:          lineOf(text, m.index),
        nested:        []
      });
    }

    // ── 2. Arrow functions ────────────────────────────────────────────────────
    // const/let/var name = [async] (params) => or name = param =>
    var reArrow = /(?:^|[;\n])[ \t]*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:\(([^)]*)\)|([A-Za-z_$][\w$]*))\s*=>/gm;
    while ((m = reArrow.exec(stripped)) !== null) {
      var aName = m[1];
      if (!includePrivate && aName.charAt(0) === '_') continue;
      var aParams = m[2] !== undefined ? m[2] : (m[3] || '');
      var aDoc = extractJsDoc(text, m.index);
      // Avoid duplicating with named function declarations
      if (results.some(function (r) { return r.name === aName && r.kind === 'function'; })) continue;
      results.push({
        name:          aName,
        kind:          'function',
        params:        parseParams(aParams),
        returnType:    aDoc.returnType || '',
        documentation: aDoc.documentation,
        source:        source,
        line:          lineOf(text, m.index),
        nested:        []
      });
    }

    // ── 3. Class declarations ────────────────────────────────────────────────
    var reClass = /(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_$][\w$]*)(?:\s+extends\s+([A-Za-z_$][\w$.]*))?(\s*\{)/g;
    while ((m = reClass.exec(stripped)) !== null) {
      var cName = m[1];
      if (!includePrivate && cName.charAt(0) === '_') continue;
      var cDoc = extractJsDoc(text, m.index);

      // Find the opening brace index in the original text
      var braceIndex = m.index + m[0].lastIndexOf('{');

      var methods = extractClassMethods(text, cName, braceIndex, opts);
      results.push({
        name:          cName,
        kind:          'class',
        params:        [],
        returnType:    '',
        documentation: cDoc.documentation || (m[2] ? 'extends ' + m[2] : ''),
        source:        source,
        line:          lineOf(text, m.index),
        nested:        methods
      });
    }

    // ── 4. Prototype method assignments ──────────────────────────────────────
    var reProto = /([A-Za-z_$][\w$]*)\.prototype\.([A-Za-z_$][\w$]*)\s*=\s*function\s*\(([^)]*)\)/g;
    while ((m = reProto.exec(stripped)) !== null) {
      var pMeth = m[2];
      if (!includePrivate && pMeth.charAt(0) === '_') continue;
      var pDoc = extractJsDoc(text, m.index);
      results.push({
        name:          pMeth,
        kind:          'method',
        params:        parseParams(m[3]),
        returnType:    pDoc.returnType || '',
        documentation: pDoc.documentation || m[1] + ' prototype method',
        source:        source,
        line:          lineOf(text, m.index),
        nested:        []
      });
    }

    // ── 10. IIFE constructor: var Name = new function() { var _self = this; _self.x = ... } ───
    var reIIFE = /(?:^|[;\n])[ \t]*(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+function\s*\([^)]*\)\s*\{/gm;
    while ((m = reIIFE.exec(stripped)) !== null) {
      var iifeName = m[1];
      if (!iifeName) continue;
      if (!includePrivate && iifeName.charAt(0) === '_') continue;
      if (results.some(function (r) { return r.name === iifeName; })) continue;

      var iifeOpen = stripped.indexOf('{', m.index + m[0].length - 1);
      if (iifeOpen === -1) continue;
      var iifeClose = findMatchingBrace(stripped, iifeOpen);
      var iifeBody  = stripped.substring(iifeOpen + 1, iifeClose);

      // ── DEBUG: IIFE body diagnostics ──
      console.log('[IIFE-DBG] IIFE "' + iifeName + '": stripped.length=' + stripped.length +
        ', iifeOpen=' + iifeOpen + ', iifeClose=' + iifeClose +
        ', iifeBody.length=' + iifeBody.length);
      // Check if key methods appear in body vs. extended range
      var _dbgNames = ['renderModule','init','loadFiles','loadFile','sendSuccessResponse','getCookie','isQntrlUi'];
      var _dbgExtBody = stripped.substring(iifeOpen + 1);
      _dbgNames.forEach(function(dn) {
        var inBody = iifeBody.indexOf(dn) !== -1;
        var inExt  = _dbgExtBody.indexOf(dn) !== -1;
        var inFull = stripped.indexOf(dn) !== -1;
        if (inFull) {
          console.log('[IIFE-DBG]   "' + dn + '": iifeBody=' + inBody + ', extRange=' + inExt + ', stripped=' + inFull);
        }
      });

      // Detect self-alias: var/let/const _self = this;
      var selfAlias = null;
      var reAliasSearch = /(?:var|let|const)\s+([\w$_]+)\s*=\s*this\s*[;,]/;
      var aliasM = reAliasSearch.exec(iifeBody);
      if (aliasM) selfAlias = aliasM[1];

      var iifeDoc = extractJsDoc(text, m.index);
      var iifeMembers = [];
      var iifeBodyLineOffset = lineOf(text, iifeOpen);

      if (selfAlias) {
        var escapedAlias = selfAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // _self.member = function [name](params) {}
        var reMemberFn = new RegExp(
          escapedAlias + '\\s*\\.\\s*([A-Za-z_$][\\w$]*)\\s*=\\s*(?:async\\s+)?function(?:\\s+[A-Za-z_$][\\w$]*)?\\s*\\(((?:[^)(]|\\([^)]*\\))*)\\)',
          'g'
        );
        var mm;
        while ((mm = reMemberFn.exec(iifeBody)) !== null) {
          var mName = mm[1];
          if (!includePrivate && mName.charAt(0) === '_') continue;
          var mDoc = extractJsDoc(text, iifeOpen + 1 + mm.index);
          iifeMembers.push({
            name:          mName,
            kind:          'method',
            params:        parseParams(mm[2]),
            returnType:    mDoc.returnType || '',
            documentation: mDoc.documentation,
            source:        source,
            line:          iifeBodyLineOffset + lineOf(iifeBody, mm.index) - 1,
            nested:        [],
            memberOf:      iifeName
          });
        }

        // _self.member = (params) => {} OR _self.member = singleParam => {}
        var reMemberArrow = new RegExp(
          escapedAlias + '\\s*\\.\\s*([A-Za-z_$][\\w$]*)\\s*=\\s*(?:async\\s+)?(?:\\(([^)]*)\\)|([A-Za-z_$][\\w$]*))\\s*=>',
          'g'
        );
        while ((mm = reMemberArrow.exec(iifeBody)) !== null) {
          var maName = mm[1];
          if (!includePrivate && maName.charAt(0) === '_') continue;
          if (iifeMembers.some(function (im) { return im.name === maName; })) continue;
          var maDoc = extractJsDoc(text, iifeOpen + 1 + mm.index);
          iifeMembers.push({
            name:          maName,
            kind:          'method',
            params:        parseParams(mm[2] !== undefined ? mm[2] : (mm[3] || '')),
            returnType:    maDoc.returnType || '',
            documentation: maDoc.documentation,
            source:        source,
            line:          iifeBodyLineOffset + lineOf(iifeBody, mm.index) - 1,
            nested:        [],
            memberOf:      iifeName
          });
        }

        // _self.member = value (non-function)
        var reMemberVal = new RegExp(
          escapedAlias + '\\s*\\.\\s*([A-Za-z_$][\\w$]*)\\s*=\\s*(?!(?:async\\s+)?function)',
          'g'
        );
        while ((mm = reMemberVal.exec(iifeBody)) !== null) {
          var mvName = mm[1];
          if (!includePrivate && mvName.charAt(0) === '_') continue;
          if (iifeMembers.some(function (im) { return im.name === mvName; })) continue;
          // Infer value type from RHS character
          var rhs = iifeBody.substring(mm.index + mm[0].length).match(/^([^;\n]+)/);
          var inferredType = inferType(rhs ? rhs[1].trim() : '');
          iifeMembers.push({
            name:          mvName,
            kind:          'property',
            params:        [],
            returnType:    inferredType,
            documentation: '',
            source:        source,
            line:          iifeBodyLineOffset + lineOf(iifeBody, mm.index) - 1,
            nested:        [],
            memberOf:      iifeName
          });
        }

        // ── DEBUG: PASS 1 results ──
        var _p1Count = iifeMembers.length;
        console.log('[IIFE-DBG] PASS 1 found ' + _p1Count + ' members. Has renderModule: ' +
          iifeMembers.some(function(im) { return im.name === 'renderModule'; }));

        // ── PASS 2: Deep scan — catches _self.X assignments nested inside
        //   other method bodies or conditionals that pass 1 may have missed.
        //   Scans from the IIFE opening brace to end-of-file as a safety net
        //   in case findMatchingBrace truncated due to regex literals / edge cases.
        var extendedBody = stripped.substring(iifeOpen + 1);
        var reDeepAssign = new RegExp(
          escapedAlias + '\\s*\\.\\s*([A-Za-z_$][\\w$]*)\\s*=\\s*',
          'g'
        );
        while ((mm = reDeepAssign.exec(extendedBody)) !== null) {
          var dpName = mm[1];
          if (!includePrivate && dpName.charAt(0) === '_') continue;
          if (iifeMembers.some(function (im) { return im.name === dpName; })) continue;
          // Peek at what comes after the '=' to classify
          var afterEq = extendedBody.substring(mm.index + mm[0].length).replace(/^[\t ]+/, '');
          var isFn = /^(?:async\s+)?(?:function\b|\(|[A-Za-z_$][\w$]*\s*=>)/.test(afterEq);
          if (isFn) {
            // Extract params: find opening paren
            var parenM = afterEq.match(/^(?:async\s+)?(?:function(?:\s+[A-Za-z_$][\w$]*)?\s*)?\(([^)]*)\)/);
            var dpParams = parenM ? parenM[1] : '';
            // arrow single-param: x => ...
            if (!parenM) {
              var singleM = afterEq.match(/^(?:async\s+)?([A-Za-z_$][\w$]*)\s*=>/);
              dpParams = singleM ? singleM[1] : '';
            }
            iifeMembers.push({
              name:          dpName,
              kind:          'method',
              params:        parseParams(dpParams),
              returnType:    '',
              documentation: '',
              source:        source,
              line:          iifeBodyLineOffset + lineOf(extendedBody, mm.index) - 1,
              nested:        [],
              memberOf:      iifeName
            });
          } else {
            var dpRhs = afterEq.match(/^([^;\n]+)/);
            iifeMembers.push({
              name:          dpName,
              kind:          'property',
              params:        [],
              returnType:    inferType(dpRhs ? dpRhs[1].trim() : ''),
              documentation: '',
              source:        source,
              line:          iifeBodyLineOffset + lineOf(extendedBody, mm.index) - 1,
              nested:        [],
              memberOf:      iifeName
            });
          }
        }

        // ── DEBUG: PASS 2 results ──
        console.log('[IIFE-DBG] After PASS 2: ' + iifeMembers.length + ' members total (' +
          (iifeMembers.length - _p1Count) + ' added by PASS 2). Has renderModule: ' +
          iifeMembers.some(function(im) { return im.name === 'renderModule'; }));
        // List PASS 2 additions
        iifeMembers.slice(_p1Count).forEach(function(im) {
          console.log('[IIFE-DBG]   PASS2 added: ' + im.name + ' (' + im.kind + ')');
        });
      }

      // ── PASS 2 (no alias): scan for this.X = patterns when no _self alias ──
      if (!selfAlias) {
        var extBodyNoAlias = stripped.substring(iifeOpen + 1);
        var reThisDeep = /this\s*\.\s*([A-Za-z_$][\w$]*)\s*=\s*/g;
        var tdm;
        while ((tdm = reThisDeep.exec(extBodyNoAlias)) !== null) {
          var tdName = tdm[1];
          if (!includePrivate && tdName.charAt(0) === '_') continue;
          if (iifeMembers.some(function (im) { return im.name === tdName; })) continue;
          var tdAfter = extBodyNoAlias.substring(tdm.index + tdm[0].length).replace(/^[\t ]+/, '');
          var tdIsFn  = /^(?:async\s+)?(?:function\b|\(|[A-Za-z_$][\w$]*\s*=>)/.test(tdAfter);
          if (tdIsFn) {
            var tdParenM = tdAfter.match(/^(?:async\s+)?(?:function(?:\s+[A-Za-z_$][\w$]*)?\s*)?\(([^)]*)\)/);
            var tdSingleM = tdParenM ? null : tdAfter.match(/^(?:async\s+)?([A-Za-z_$][\w$]*)\s*=>/);
            iifeMembers.push({
              name:          tdName,
              kind:          'method',
              params:        parseParams(tdParenM ? tdParenM[1] : (tdSingleM ? tdSingleM[1] : '')),
              returnType:    '',
              documentation: '',
              source:        source,
              line:          iifeBodyLineOffset + lineOf(extBodyNoAlias, tdm.index) - 1,
              nested:        [],
              memberOf:      iifeName
            });
          } else {
            var tdRhs = tdAfter.match(/^([^;\n]+)/);
            iifeMembers.push({
              name:          tdName,
              kind:          'property',
              params:        [],
              returnType:    inferType(tdRhs ? tdRhs[1].trim() : ''),
              documentation: '',
              source:        source,
              line:          iifeBodyLineOffset + lineOf(extBodyNoAlias, tdm.index) - 1,
              nested:        [],
              memberOf:      iifeName
            });
          }
        }
      }

      var iifeSymbol = {
        name:          iifeName,
        kind:          'variable',
        params:        [],
        returnType:    '',
        documentation: iifeDoc.documentation || 'IIFE constructor object',
        source:        source,
        line:          lineOf(text, m.index + m[0].indexOf(iifeName)),
        nested:        iifeMembers,
        isIIFE:        true
      };
      results.push(iifeSymbol);
      results = results.concat(iifeMembers);
    }

    // ── 11. Named constructor function: function Name() { this.x = ...; } ────
    var reNamedCtor = /function\s+([A-Z][A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/g;
    while ((m = reNamedCtor.exec(stripped)) !== null) {
      var ctorName = m[1];
      if (!includePrivate && ctorName.charAt(0) === '_') continue;
      if (results.some(function (r) { return r.name === ctorName && (r.kind === 'class' || r.kind === 'function'); })) continue;

      var ctorOpen  = stripped.indexOf('{', m.index + m[0].length - 1);
      if (ctorOpen === -1) continue;
      var ctorClose = findMatchingBrace(stripped, ctorOpen);
      var ctorBody  = stripped.substring(ctorOpen + 1, ctorClose);
      var ctorBodyLineOffset = lineOf(text, ctorOpen);

      var ctorThisMembers = [];
      // this.member = function [name](params) {}
      var reThisFn = /this\s*\.\s*([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?function(?:\s+[A-Za-z_$][\w$]*)?\s*\(((?:[^)(]|\([^)]*\))*)\)/g;
      var tm;
      while ((tm = reThisFn.exec(ctorBody)) !== null) {
        var tName = tm[1];
        if (!includePrivate && tName.charAt(0) === '_') continue;
        if (ctorThisMembers.some(function (x) { return x.name === tName; })) continue;
        ctorThisMembers.push({
          name:          tName,
          kind:          'method',
          params:        parseParams(tm[2]),
          returnType:    '',
          documentation: '',
          source:        source,
          line:          ctorBodyLineOffset + lineOf(ctorBody, tm.index) - 1,
          nested:        [],
          memberOf:      ctorName
        });
      }
      // this.member = (params) => {} OR this.member = singleParam => {}
      var reThisArrow = /this\s*\.\s*([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:\(([^)]*)\)|([A-Za-z_$][\w$]*))\s*=>/g;
      while ((tm = reThisArrow.exec(ctorBody)) !== null) {
        var taName = tm[1];
        if (!includePrivate && taName.charAt(0) === '_') continue;
        if (ctorThisMembers.some(function (x) { return x.name === taName; })) continue;
        ctorThisMembers.push({
          name:          taName,
          kind:          'method',
          params:        parseParams(tm[2] !== undefined ? tm[2] : (tm[3] || '')),
          returnType:    '',
          documentation: '',
          source:        source,
          line:          ctorBodyLineOffset + lineOf(ctorBody, tm.index) - 1,
          nested:        [],
          memberOf:      ctorName
        });
      }
      // this.member = value
      var reThisVal = /this\s*\.\s*([A-Za-z_$][\w$]*)\s*=\s*(?!(?:async\s+)?function)/g;
      while ((tm = reThisVal.exec(ctorBody)) !== null) {
        var tvName = tm[1];
        if (!includePrivate && tvName.charAt(0) === '_') continue;
        if (ctorThisMembers.some(function (x) { return x.name === tvName; })) continue;
        var trhs = ctorBody.substring(tm.index + tm[0].length).match(/^([^;\n]+)/);
        ctorThisMembers.push({
          name:          tvName,
          kind:          'property',
          params:        [],
          returnType:    inferType(trhs ? trhs[1].trim() : ''),
          documentation: '',
          source:        source,
          line:          ctorBodyLineOffset + lineOf(ctorBody, tm.index) - 1,
          nested:        [],
          memberOf:      ctorName
        });
      }

      if (ctorThisMembers.length > 0) {
        var ctorDoc = extractJsDoc(text, m.index);
        results.push({
          name:          ctorName,
          kind:          'class',
          params:        parseParams(m[2]),
          returnType:    '',
          documentation: ctorDoc.documentation || 'Constructor function',
          source:        source,
          line:          lineOf(text, m.index),
          nested:        ctorThisMembers,
          isCtor:        true
        });
        results = results.concat(ctorThisMembers);
      }
    }

    // ── 5. Object literal top-level assignments ───────────────────────────────
    // const obj = { ... }  /  var obj = { ... }
    var reObj = /(?:^|[;\n])[ \t]*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\{/gm;
    while ((m = reObj.exec(stripped)) !== null) {
      var oName = m[1];
      if (!includePrivate && oName.charAt(0) === '_') continue;
      // Skip if this looks like it was already captured as a function/class
      if (results.some(function (r) { return r.name === oName; })) continue;

      // Find the matching closing brace
      var objBraceIdx = stripped.indexOf('{', m.index + m[0].length - 1);
      if (objBraceIdx === -1) continue;
      var odepth = 1;
      var opos = objBraceIdx + 1;
      while (opos < stripped.length && odepth > 0) {
        if (stripped[opos] === '{') odepth++;
        else if (stripped[opos] === '}') odepth--;
        opos++;
      }
      var objBody = stripped.substring(objBraceIdx + 1, opos - 1);
      var oDoc = extractJsDoc(text, m.index);
      var objSymbol = {
        name:          oName,
        kind:          'variable',
        params:        [],
        returnType:    '',
        documentation: oDoc.documentation,
        source:        source,
        line:          lineOf(text, m.index),
        nested:        []
      };

      // Extract nested keys
      var keys = extractObjectKeys(objBody, oName, 1, opts, source, lineOf(text, objBraceIdx));
      objSymbol.nested = keys;
      results.push(objSymbol);
      results = results.concat(keys);
    }

    // ── 6. Top-level const/let/var (non-function, non-object) ────────────────
    var reConst = /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?!(?:async\s+)?(?:function|new\s+function|\(.*\)\s*=>|[A-Za-z_$][\w$]*\s*=>|\{))/gm;
    while ((m = reConst.exec(stripped)) !== null) {
      var vName = m[1];
      if (!includePrivate && vName.charAt(0) === '_') continue;
      if (results.some(function (r) { return r.name === vName; })) continue;
      var vRhsMatch = stripped.substring(m.index + m[0].length).match(/^([^;\n]+)/);
      var vInferredType = inferType(vRhsMatch ? vRhsMatch[1].trim() : '');
      results.push({
        name:          vName,
        kind:          'variable',
        params:        [],
        returnType:    vInferredType,
        documentation: '',
        source:        source,
        line:          lineOf(text, m.index),
        nested:        []
      });
    }

    // ── 7. ES6 import statements ──────────────────────────────────────────────
    // import DefaultExport from 'module'
    // import { a, b, c as d } from 'module'
    // import * as ns from 'module'
    var reImportDefault = /import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"]/g;
    while ((m = reImportDefault.exec(stripped)) !== null) {
      var impName = m[1];
      if (!includePrivate && impName.charAt(0) === '_') continue;
      if (results.some(function (r) { return r.name === impName; })) continue;
      results.push({
        name:          impName,
        kind:          'variable',
        params:        [],
        returnType:    '',
        documentation: 'imported from \'' + m[2] + '\'',
        source:        source,
        line:          lineOf(text, m.index),
        nested:        []
      });
    }

    var reImportNamed = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
    while ((m = reImportNamed.exec(stripped)) !== null) {
      var importedFrom = m[2];
      var names = m[1].split(',');
      names.forEach(function (part) {
        var parts = part.trim().split(/\s+as\s+/);
        var localName = (parts[1] || parts[0]).trim();
        if (!localName || (!includePrivate && localName.charAt(0) === '_')) return;
        if (results.some(function (r) { return r.name === localName; })) return;
        results.push({
          name:          localName,
          kind:          'variable',
          params:        [],
          returnType:    '',
          documentation: 'imported from \'' + importedFrom + '\'',
          source:        source,
          line:          lineOf(text, m.index),
          nested:        []
        });
      });
    }

    // import * as Namespace from 'module'
    var reImportNs = /import\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s+from\s*['"]([^'"]+)['"]/g;
    while ((m = reImportNs.exec(stripped)) !== null) {
      var nsName = m[1];
      if (!includePrivate && nsName.charAt(0) === '_') continue;
      if (results.some(function (r) { return r.name === nsName; })) continue;
      results.push({
        name:          nsName,
        kind:          'module',
        params:        [],
        returnType:    '',
        documentation: 'namespace import from \'' + m[2] + '\'',
        source:        source,
        line:          lineOf(text, m.index),
        nested:        []
      });
    }

    // ── 8. CommonJS require() ─────────────────────────────────────────────────
    var reRequire = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((m = reRequire.exec(stripped)) !== null) {
      var rName = m[1];
      if (!includePrivate && rName.charAt(0) === '_') continue;
      if (results.some(function (r) { return r.name === rName; })) continue;
      results.push({
        name:          rName,
        kind:          'module',
        params:        [],
        returnType:    '',
        documentation: 'require(\'' + m[2] + '\')',
        source:        source,
        line:          lineOf(text, m.index),
        nested:        []
      });
    }

    // ── 9. module.exports assignments ────────────────────────────────────────
    var reModuleExports = /module\.exports(?:\.([\w$]+))?\s*=/g;
    while ((m = reModuleExports.exec(stripped)) !== null) {
      if (m[1]) {
        var expName = m[1];
        if (!includePrivate && expName.charAt(0) === '_') continue;
        results.push({
          name:          expName,
          kind:          'constant',
          params:        [],
          returnType:    '',
          documentation: 'module.exports export',
          source:        source,
          line:          lineOf(text, m.index),
          nested:        []
        });
      }
    }

    console.log('[JSAnalyzer] Extracted', results.length, 'symbols from', source);
    return results;
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  var JSAnalyzer = {};

  /**
   * Analyze JavaScript source text.
   * @param {string} text    Source content
   * @param {object} [opts]  { filename, includePrivate, maxDepth }
   * @returns {object[]}     Raw symbol array
   */
  JSAnalyzer.analyze = function (text, opts) {
    if (!text || typeof text !== 'string' || !text.trim()) return [];
    try {
      return analyze(text, opts || {});
    } catch (e) {
      console.error('[JSAnalyzer] Unexpected error:', e);
      return [];
    }
  };

  return JSAnalyzer;
}));
