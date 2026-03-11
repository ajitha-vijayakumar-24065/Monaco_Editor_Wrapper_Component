// ─────────────────────────────────────────────────────────────────────────────
// SuggestionMerger.js — Multi-file suggestion merge + deduplication
//
// Merges suggestion arrays from multiple sources into a single pool.
// Deduplication strategy: by (label + kind) combination.
// When a duplicate is found, the entry with the richer documentation wins.
//
// No Monaco dependency. Works in browser and Node.js.
//
// Usage:
//   SuggestionMerger.merge(arrayOfSuggestionArrays, { maxItems: 500 })
//   → { suggestions: [], stats: { total, duplicatesRemoved, sourceCount, conflicts } }
//
//   SuggestionMerger.mergeInto(existing, incoming, opts)
//   → { suggestions: [], stats: { … } }  // merges incoming into existing
// ─────────────────────────────────────────────────────────────────────────────

/* global module */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SuggestionMerger = factory();
}(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function () {
  'use strict';

  var DEFAULTS = {
    maxItems:           1000,
    deduplicateBy:      'label+kind',   // 'label+kind' | 'label' | 'none'
    preferRicher:       true,           // when deduplicating, keep entry with more documentation
    tagWithSource:      true            // append "(source)" to detail string
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

  /**
   * Build a deduplication key from a suggestion item.
   * @param {object} item
   * @param {string} strategy  'label+kind' | 'label' | 'none'
   * @returns {string}
   */
  function dedupeKey(item, strategy) {
    if (strategy === 'none') return null;
    if (strategy === 'label') return item.label;
    return item.label + '::' + (item.kind || '');
  }

  /**
   * Compute a "richness" score for a suggestion — used to pick the winner on dedup.
   * Higher = richer.
   * @param {object} item
   * @returns {number}
   */
  function richness(item) {
    var score = 0;
    if (item.documentation && item.documentation.length > 0) score += item.documentation.length;
    if (item.detail && item.detail.length > 0) score += 5;
    if (item.insertTextIsSnippet) score += 3;
    return score;
  }

  /**
   * Core merge implementation.
   * @param {object[][]} arrays       Array of suggestion arrays
   * @param {object}     opts         Merged options
   * @param {object[]}   [basePool]   Existing pool to merge INTO (for mergeInto)
   * @returns {{ suggestions: object[], stats: object }}
   */
  function doMerge(arrays, opts, basePool) {
    var seen = {};           // dedupeKey → index in results
    var results = [];
    var duplicatesRemoved = 0;
    var conflicts = 0;
    var totalBefore = 0;
    var sourceCount = arrays.length + (basePool ? 1 : 0);

    // Seed with base pool if provided
    if (basePool && basePool.length > 0) {
      basePool.forEach(function (item) {
        if (!item || !item.label) return;
        var key = dedupeKey(item, opts.deduplicateBy);
        if (key !== null) seen[key] = results.length;
        results.push(item);
        totalBefore++;
      });
    }

    arrays.forEach(function (arr) {
      if (!Array.isArray(arr)) return;
      arr.forEach(function (item) {
        if (!item || !item.label) return;
        totalBefore++;

        // Tag detail with source filename
        var tagged = {};
        for (var k in item) {
          if (Object.prototype.hasOwnProperty.call(item, k)) tagged[k] = item[k];
        }
        if (opts.tagWithSource && tagged.source &&
            tagged.source !== 'manual' && tagged.source !== 'sql-template') {
          tagged.detail = (tagged.detail ? tagged.detail : '') +
            (tagged.detail && tagged.detail.indexOf('(' + tagged.source + ')') === -1
              ? ' (' + tagged.source + ')'
              : '');
        }

        var key = dedupeKey(tagged, opts.deduplicateBy);

        if (key === null) {
          // No dedup
          results.push(tagged);
          return;
        }

        if (seen[key] !== undefined) {
          // Duplicate found
          duplicatesRemoved++;
          var existingIdx = seen[key];
          var existing = results[existingIdx];

          // Conflict = same label but different insertText
          if (existing.insertText !== tagged.insertText) conflicts++;

          if (opts.preferRicher && richness(tagged) > richness(existing)) {
            // Replace with richer version
            results[existingIdx] = tagged;
          }
          return;
        }

        seen[key] = results.length;
        results.push(tagged);
      });
    });

    // Cap at maxItems
    if (opts.maxItems > 0 && results.length > opts.maxItems) {
      results = results.slice(0, opts.maxItems);
    }

    return {
      suggestions: results,
      stats: {
        total:             results.length,
        inputTotal:        totalBefore,
        duplicatesRemoved: duplicatesRemoved,
        sourceCount:       sourceCount,
        conflicts:         conflicts
      }
    };
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  var SuggestionMerger = {};

  /**
   * Merge multiple suggestion arrays into one deduplicated pool.
   *
   * @param {object[][]} arrays   Array of suggestion arrays (one per source file)
   * @param {object}    [opts]   {
   *   maxItems:       number,   max total suggestions (default: 1000)
   *   deduplicateBy:  string,   'label+kind' | 'label' | 'none' (default: 'label+kind')
   *   preferRicher:   boolean,  keep richer entry on dup (default: true)
   *   tagWithSource:  boolean,  append (source) to detail (default: true)
   * }
   * @returns {{ suggestions: object[], stats: object }}
   */
  SuggestionMerger.merge = function (arrays, opts) {
    if (!Array.isArray(arrays)) return { suggestions: [], stats: { total: 0, duplicatesRemoved: 0, sourceCount: 0, conflicts: 0 } };
    var o = mergeOpts(opts);
    return doMerge(arrays, o, null);
  };

  /**
   * Merge an incoming suggestion array into an existing pool.
   * Items in the incoming array that duplicate existing ones are handled
   * per the deduplicateBy / preferRicher strategy.
   *
   * @param {object[]}  existing   Current suggestion pool
   * @param {object[]}  incoming   New suggestions to merge in
   * @param {object}   [opts]
   * @returns {{ suggestions: object[], stats: object }}
   */
  SuggestionMerger.mergeInto = function (existing, incoming, opts) {
    var o = mergeOpts(opts);
    return doMerge([incoming], o, existing || []);
  };

  /**
   * Build a human-readable summary string from merge stats.
   * @param {object} stats
   * @returns {string}
   */
  SuggestionMerger.summaryText = function (stats) {
    if (!stats) return '';
    var txt = 'Merged ' + stats.sourceCount +
      ' source' + (stats.sourceCount === 1 ? '' : 's') +
      ' \u2192 ' + stats.total +
      ' suggestion' + (stats.total === 1 ? '' : 's');
    if (stats.duplicatesRemoved > 0) {
      txt += ' (' + stats.duplicatesRemoved +
        ' duplicate' + (stats.duplicatesRemoved === 1 ? '' : 's') + ' removed)';
    }
    if (stats.conflicts > 0) {
      txt += ' \u26A0 ' + stats.conflicts +
        ' label conflict' + (stats.conflicts === 1 ? '' : 's');
    }
    return txt;
  };

  return SuggestionMerger;
}));
