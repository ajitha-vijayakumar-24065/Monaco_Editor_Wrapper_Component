# SKILL — SuggestionMerger

## Purpose
Merges suggestion arrays from multiple source files into a single deduplicated pool.
Used by the demo `mergeSources()` function after all per-source analyses complete.

## Location
`src/SuggestionMerger.js`

## Dependencies
None — pure JavaScript, no Monaco dependency.

## Deduplication Strategy
Default: **by `label + kind` combination**
- Two items are duplicates if they have the same `label` AND the same `kind`
- When a duplicate is found, the entry with the higher **richness score** wins (if `preferRicher: true`)
- Richness score = `documentation.length + (hasDetail ? 5 : 0) + (isSnippet ? 3 : 0)`
- A **conflict** is counted when the winner and loser have different `insertText`

## Public API

### Merge multiple arrays into one
```javascript
var result = SuggestionMerger.merge([arrayA, arrayB, arrayC], {
  deduplicateBy: 'label+kind',  // 'label+kind' | 'label' | 'none'
  tagWithSource:  true,          // append (filename) to detail strings
  maxItems:       1000,          // cap total suggestions
  preferRicher:   true           // keep richer entry on dedup
});

result.suggestions; // → merged, deduplicated suggestion[]
result.stats;       // → { total, inputTotal, duplicatesRemoved, sourceCount, conflicts }
```

### Merge incoming into an existing pool
```javascript
var result = SuggestionMerger.mergeInto(existingPool, incomingSuggestions, opts);
```
Used when `opts.merge` strategy is "Merge — combine with existing".

### Human-readable summary
```javascript
var text = SuggestionMerger.summaryText(result.stats);
// → "Merged 3 sources → 142 suggestions (7 duplicates removed) ⚠ 2 label conflicts"
```

## Stats Object Shape
```javascript
{
  total:             142,   // final count after dedup
  inputTotal:        156,   // count before dedup
  duplicatesRemoved: 14,    // how many were dropped
  sourceCount:       3,     // how many source arrays were provided
  conflicts:         2      // how many had different insertText on dedup
}
```

## Re-running This Skill
To change the default deduplication to label-only:
Pass `{ deduplicateBy: 'label' }` to `SuggestionMerger.merge()` — no code change needed.

To increase the item cap: pass `{ maxItems: 2000 }`.
