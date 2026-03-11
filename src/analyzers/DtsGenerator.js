// ─────────────────────────────────────────────────────────────────────────────
// DtsGenerator.js — Convert JSAnalyzer raw symbols → TypeScript declaration
//                   strings (.d.ts) for use with monaco addExtraLib().
//
// No Monaco dependency. Works in browser and Node.js.
//
// Key cases handled:
//   • IIFE constructor (var X = new function() { var _self = this; ... })
//     → declare var X: { member(...): type; ... };
//   • Named constructor functions (function Name() { this.x = ... })
//     → declare class Name { constructor(...); methods/props... }
//   • Class declarations
//     → declare class Name { ... }
//   • Prototype methods → appended to a matching class/variable block
//   • Plain functions → declare function name(...): type;
//   • Variables with inferred types → declare var name: type;
//   • Namespaces / modules → declare namespace Name { ... }
// ─────────────────────────────────────────────────────────────────────────────

/* global module */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.DtsGenerator = factory();
}(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function () {
  'use strict';

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /**
   * Escape a name so it is safe as a TypeScript identifier.
   * Falls back to quoting if it contains hyphens etc.
   */
  function safeId(name) {
    if (/^[A-Za-z_$][\w$]*$/.test(name)) return name;
    return '"' + name.replace(/"/g, '\\"') + '"';
  }

  /** Map a param list (string[]) to TS parameter string.
   *  Uses JSDoc types when available via docParams array. */
  function paramsToTs(paramNames, docParams) {
    docParams = docParams || [];
    return paramNames.map(function (p, i) {
      var dp = docParams[i];
      var type = (dp && dp.type && dp.type !== 'any') ? dp.type : 'any';
      return p + ': ' + type;
    }).join(', ');
  }

  /** Map a kind + returnType to a TS return type annotation. */
  function returnTs(symbol) {
    if (symbol.returnType && symbol.returnType !== 'any' && symbol.returnType !== '') {
      return symbol.returnType;
    }
    return 'any';
  }

  /** Indent each line of a multi-line string. */
  function indent(str, spaces) {
    var pad = new Array(spaces + 1).join(' ');
    return str.split('\n').map(function (l) { return l.length ? pad + l : l; }).join('\n');
  }

  // ── Symbol → declaration lines ───────────────────────────────────────────────

  /**
   * Generate a member declaration line (used inside object/class bodies).
   * @param {object} sym  Raw symbol
   * @returns {string}
   */
  function memberLine(sym) {
    var id = safeId(sym.name);
    if (sym.kind === 'method' || sym.kind === 'function') {
      var params = paramsToTs(sym.params || [], sym.docParams);
      return id + '(' + params + '): ' + returnTs(sym) + ';';
    }
    var type = sym.returnType && sym.returnType !== '' ? sym.returnType : 'any';
    return id + ': ' + type + ';';
  }

  /**
   * Generate a top-level declaration for a symbol.
   * @param {object}   sym       Root symbol
   * @param {object[]} allSymbols  Full symbol list (for prototype method lookup)
   * @returns {string}
   */
  function topLevelDecl(sym, allSymbols) {
    var id = safeId(sym.name);

    // ── class / constructor function ──────────────────────────────────────────
    if (sym.kind === 'class' || sym.isCtor) {
      var classLines = [];
      // Constructor signature
      var ctorParams = paramsToTs(sym.params || [], sym.docParams);
      classLines.push('  constructor(' + ctorParams + ');');

      // Nested methods/properties (from class body or this.x assignments)
      (sym.nested || []).forEach(function (m) {
        classLines.push('  ' + memberLine(m));
      });

      // Prototype methods referencing this class
      allSymbols.forEach(function (s) {
        if (s.kind === 'method' && !s.memberOf && s.documentation && s.documentation.indexOf(sym.name + ' prototype') !== -1) {
          classLines.push('  ' + memberLine(s));
        }
      });

      var ext = sym.documentation && sym.documentation.indexOf('extends ') === 0
        ? ' extends ' + sym.documentation.replace('extends ', '')
        : '';
      var docComment = sym.documentation && sym.documentation.indexOf('extends') !== 0
        ? '/** ' + sym.documentation + ' */\n'
        : '';
      return docComment + 'declare class ' + id + ext + ' {\n' + classLines.join('\n') + '\n}';
    }

    // ── IIFE constructor / variable with nested members ───────────────────────
    if ((sym.isIIFE || sym.kind === 'variable') && sym.nested && sym.nested.length > 0) {
      var objLines = [];
      sym.nested.forEach(function (m) {
        objLines.push('  ' + memberLine(m));
      });
      var doc = sym.documentation ? '/** ' + sym.documentation + ' */\n' : '';
      return doc + 'declare var ' + id + ': {\n' + objLines.join('\n') + '\n};';
    }

    // ── plain function ────────────────────────────────────────────────────────
    if (sym.kind === 'function') {
      var fnParams = paramsToTs(sym.params || [], sym.docParams);
      var retType  = returnTs(sym);
      var fnDoc    = sym.documentation ? '/** ' + sym.documentation + ' */\n' : '';
      return fnDoc + 'declare function ' + id + '(' + fnParams + '): ' + retType + ';';
    }

    // ── module / namespace ────────────────────────────────────────────────────
    if (sym.kind === 'module') {
      var nsDoc = sym.documentation ? '/** ' + sym.documentation + ' */\n' : '';
      return nsDoc + 'declare namespace ' + id + ' {}';
    }

    // ── constant ─────────────────────────────────────────────────────────────
    if (sym.kind === 'constant') {
      var constType = sym.returnType || 'any';
      return 'declare const ' + id + ': ' + constType + ';';
    }

    // ── plain variable ────────────────────────────────────────────────────────
    var varType = sym.returnType || 'any';
    return 'declare var ' + id + ': ' + varType + ';';
  }

  // ── Main generator ───────────────────────────────────────────────────────────

  /**
   * Generate a full .d.ts declaration string from an array of raw symbols.
   *
   * @param {object[]} symbols  Raw symbols from JSAnalyzer.analyze()
   * @param {object}  [opts]   { header: string }
   * @returns {string}  TypeScript ambient declaration content
   */
  function generate(symbols, opts) {
    opts = opts || {};
    if (!symbols || !symbols.length) return '';

    var lines = [];

    // Optional file header comment
    if (opts.header) {
      lines.push('// ' + opts.header);
      lines.push('');
    }

    // Build a set of names that appear as memberOf another symbol
    // — these are already rendered as nested members, skip as top-level
    var memberOfSet = {};
    symbols.forEach(function (s) {
      if (s.memberOf) memberOfSet[s.name + '|' + s.memberOf] = true;
    });

    // Track which names we already declared to avoid duplicates
    var declared = {};

    symbols.forEach(function (sym) {
      // Skip symbols that are nested members of an IIFE or constructor
      if (sym.memberOf) return;

      // Skip prototype methods — they get folded into a class/variable block
      if (sym.kind === 'method' && !sym.memberOf) return;

      // Skip duplicates (e.g. arrow function that was also picked up as variable)
      if (declared[sym.name]) return;
      declared[sym.name] = true;

      try {
        var decl = topLevelDecl(sym, symbols);
        if (decl) lines.push(decl);
      } catch (e) {
        lines.push('// [DtsGenerator] failed to emit: ' + sym.name);
      }
    });

    return lines.join('\n') + (lines.length ? '\n' : '');
  }

  /**
   * Generate a single-symbol declaration preview string.
   * @param {object} sym  Raw symbol
   * @returns {string}
   */
  function generateForSymbol(sym) {
    return topLevelDecl(sym, []);
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  var DtsGenerator = {};

  /**
   * Generate .d.ts declaration content from raw symbol array.
   * @param {object[]} symbols   Array from JSAnalyzer.analyze()
   * @param {object}  [opts]     { header?: string }
   * @returns {string}
   */
  DtsGenerator.generate = function (symbols, opts) {
    if (!Array.isArray(symbols)) return '';
    try {
      return generate(symbols, opts || {});
    } catch (e) {
      console.error('[DtsGenerator] Error:', e);
      return '';
    }
  };

  /**
   * Generate a declaration string for a single symbol.
   * @param {object} sym
   * @returns {string}
   */
  DtsGenerator.generateForSymbol = function (sym) {
    if (!sym) return '';
    try {
      return generateForSymbol(sym);
    } catch (e) {
      return '';
    }
  };

  return DtsGenerator;
}));
