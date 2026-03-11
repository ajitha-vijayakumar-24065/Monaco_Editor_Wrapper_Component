// ─────────────────────────────────────────────────────────────────────────────
// SuggestionMapper.js — Raw symbol → Monaco suggestion converter
//
// Converts the raw symbol objects produced by the language analyzers into the
// flat suggestion format expected by SuggestionManager.registerSuggestions().
//
// Output shape per item (matches SuggestionManager's accepted format):
//   {
//     label:               string,
//     detail:              string,
//     insertText:          string,
//     insertTextIsSnippet: boolean,
//     kind:                string,   // function|variable|class|method|property|…
//     documentation:       string,
//     source:              string,
//     sortText:            string,
//     filterText:          string
//   }
//
// No Monaco dependency. Works in browser and Node.js.
// ─────────────────────────────────────────────────────────────────────────────

/* global module */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SuggestionMapper = factory();
}(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function () {
  'use strict';

  // ── Kind → sort priority (lower string = higher in list) ────────────────────
  var KIND_SORT = {
    function:   '1',
    method:     '1',
    class:      '2',
    interface:  '2',
    enum:       '2',
    type:       '3',
    variable:   '3',
    constant:   '3',
    module:     '4',
    property:   '5',
    enumMember: '5',
    decorator:  '6',
    value:      '7',
    keyword:    '8'
  };

  // ── Snippet builder ──────────────────────────────────────────────────────────

  /**
   * Build an insertText string from a symbol, using snippet tab-stop syntax.
   * @param {object} sym   Raw symbol
   * @param {string} style 'tabstop' | 'plain'
   * @returns {{ text: string, isSnippet: boolean }}
   */
  function buildInsertText(sym, style) {
    // Pre-computed _insertText wins (used by SQLAnalyzer for clause templates)
    if (sym._insertText) {
      return { text: sym._insertText, isSnippet: style === 'tabstop' };
    }

    var name = sym.name;

    switch (sym.kind) {
      case 'function':
      case 'method': {
        var params = sym.params || [];
        if (params.length === 0) {
          return { text: name + '()', isSnippet: false };
        }
        if (style !== 'tabstop') {
          return { text: name + '(' + params.join(', ') + ')', isSnippet: false };
        }
        var tabStops = params.map(function (p, i) {
          return '${' + (i + 1) + ':' + p + '}';
        });
        return { text: name + '(' + tabStops.join(', ') + ')', isSnippet: true };
      }

      case 'class': {
        if (style === 'tabstop') {
          return { text: 'new ' + name + '(${1:args})', isSnippet: true };
        }
        return { text: 'new ' + name + '()', isSnippet: false };
      }

      case 'property':
        // Dot-notation paths (JSON / YAML keys) — insert as-is
        return { text: name, isSnippet: false };

      case 'keyword':
        // SQL templates already handled by _insertText above
        return { text: name, isSnippet: false };

      default:
        return { text: name, isSnippet: false };
    }
  }

  // ── Detail builder ───────────────────────────────────────────────────────────

  /**
   * Build a short detail string for the completion item dropdown.
   * @param {object} sym
   * @returns {string}
   */
  function buildDetail(sym) {
    var parts = [];

    switch (sym.kind) {
      case 'function':
      case 'method': {
        var sig = sym.name + '(' + (sym.params || []).join(', ') + ')';
        if (sym.returnType) sig += ' \u2192 ' + sym.returnType;
        parts.push(sig);
        break;
      }
      case 'class':
        parts.push(sym.documentation && sym.documentation.indexOf('extends') === 0
          ? sym.documentation
          : 'class');
        break;
      case 'interface':
        parts.push('interface');
        break;
      case 'type':
        parts.push('type alias');
        break;
      case 'enum':
        parts.push('enum');
        break;
      case 'enumMember':
        parts.push('enum member');
        break;
      case 'decorator':
        parts.push('decorator');
        break;
      case 'module':
        parts.push('module');
        break;
      case 'variable':
      case 'constant':
        parts.push(sym.kind);
        break;
      case 'property':
        // JSON/YAML: returnType has the value type
        parts.push(sym.returnType || 'property');
        break;
      case 'value':
        parts.push('selector');
        break;
      case 'keyword':
        parts.push(sym.documentation || 'keyword');
        break;
      default:
        if (sym.documentation) parts.push(sym.documentation.split('.')[0]);
    }

    if (sym.source && sym.source !== 'manual' && sym.source !== 'sql-template') {
      parts.push('(' + sym.source + ')');
    }

    return parts.join(' \u2014 ');
  }

  // ── Main mapper ──────────────────────────────────────────────────────────────

  /**
   * Map a single raw symbol to a suggestion object.
   * @param {object} sym     Raw symbol from an analyzer
   * @param {object} [opts]  { snippetStyle: 'tabstop'|'plain', source: string }
   * @returns {object}  Suggestion item
   */
  function mapSymbol(sym, opts) {
    opts = opts || {};
    var style = opts.snippetStyle || 'tabstop';
    var insert = buildInsertText(sym, style);
    var sortPrefix = KIND_SORT[sym.kind] || '9';

    return {
      label:               sym.name,
      detail:              buildDetail(sym),
      insertText:          insert.text,
      insertTextIsSnippet: insert.isSnippet,
      kind:                sym.kind || 'variable',
      documentation:       sym.documentation || '',
      source:              sym.source || opts.source || 'manual',
      sortText:            sortPrefix + sym.name.toLowerCase(),
      filterText:          sym.name
    };
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  var SuggestionMapper = {};

  /**
   * Map an array of raw symbols to suggestion objects.
   * Flattens nested symbols (class methods, interface members, enum members)
   * so all are top-level in the output array.
   *
   * @param {object[]} symbols   Raw symbol array from an analyzer
   * @param {object}   [opts]    { snippetStyle, source }
   * @returns {object[]}         Suggestion array
   */
  SuggestionMapper.map = function (symbols, opts) {
    if (!Array.isArray(symbols) || symbols.length === 0) return [];
    opts = opts || {};
    var results = [];

    symbols.forEach(function (sym) {
      if (!sym || !sym.name) return;
      results.push(mapSymbol(sym, opts));

      // Flatten nested members (class methods, interface properties, enum members)
      if (Array.isArray(sym.nested) && sym.nested.length > 0) {
        sym.nested.forEach(function (child) {
          if (!child || !child.name) return;
          results.push(mapSymbol(child, opts));
        });
      }
    });

    return results;
  };

  /**
   * Map a single raw symbol to a suggestion object.
   * @param {object} symbol
   * @param {object} [opts]
   * @returns {object}
   */
  SuggestionMapper.mapOne = function (symbol, opts) {
    if (!symbol || !symbol.name) return null;
    return mapSymbol(symbol, opts || {});
  };

  return SuggestionMapper;
}));
