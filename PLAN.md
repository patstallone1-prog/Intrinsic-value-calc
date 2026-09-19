# Eval System 2 Plan

## Build Target

Eval System 2 is a fresh classification-aware valuation tool. It separates company classification, input relevance, normalization, validation, valuation tracks, confidence bands, and audit output so no single factor can silently appear as multiple independent premiums.

## Engine Contract

1. Classification creates context first.
   Sector, business model, tags, lifecycle, capital status, and profitability status feed `deriveContext()`. The rest of the engine consumes that context instead of scattering raw selector checks everywhere.

2. Tags activate modules, not uncapped premiums.
   Tags can change relevance and modest budgets, but overlapping positive tags are converted into `tagStackingPressure`. That pressure creates explicit caps and penalties in the ledger.

3. Growth is credibility-adjusted before valuation.
   `computeGrowthCredibility()` separates headline growth from effective growth using revenue base, absolute dollar growth, repeatability, pipeline, retention, maturity, and margin support.

4. Valuation uses three tracks.
   Intrinsic, market, and strategic value are computed separately, then blended with context-sensitive weights. Strategic value is capped by a ledger budget and does not dominate by default.

5. Larger scale cannot echo the same story factors.
   `scaleStackingPenalty` activates only when overlapping positive tags are present. It prevents company scale from re-amplifying the same concepts through market multiples and strategic exit value.

6. Size is calculated once from market share, market size, revenue scale, and public/private status.
   `deriveSizeContext()` produces market share, market-size score, revenue-scale score, listing/public-private anchor, market room, and size class. The engine uses this shared context for track trust and strategic caps rather than letting size leak into every layer independently.

7. Outputs must be auditable.
   The UI exposes raw signal, cap, effective signal, source fields, strategic cap, stacking cap penalty, scale stacking penalty, size strategic cap, scale multiple factor, and tag budget multiplier.

## UI Contract

1. Keep the top level simple: headline fair common equity, range, confidence, effective growth, and discount rate.
2. Keep inputs contextual: show recurring fields for recurring businesses, inventory fields for inventory-relevant businesses, probability fields for regulated/R&D cases, and advanced fields only when useful or requested.
3. Preserve hidden field values. Changing classification should not silently delete draft data.
4. Store drafts locally and allow a reset.
5. Ship as a static `index.html` that opens without a local server.

## Verification Contract

The included test suite checks:

1. Core valuation outputs are finite and non-negative.
2. Tiny-revenue hypergrowth is damped.
3. Biotech/R&D probability logic activates.
4. Mature industrial strategic weight stays small.
5. Overlapping positive tags do not create runaway fair-value uplift.
6. Overlapping positive tags do not inflate revenue multiples.
7. Larger scale does not amplify the same stacked factors into a widening fair-value gap.
8. Strategic premium is not applied again after the strategic track.
9. Market share is calculated from revenue and SAM.
10. Public/private status feeds size context and market-track trust.
11. Higher market penetration reduces strategic cap headroom.
