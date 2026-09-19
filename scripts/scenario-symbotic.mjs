// Symbotic Inc (SYM) — warehouse-robotics automation (AS/RS systems for retail/grocery
// distribution centers). Figures pulled 2026-08-04, TTM ended 2026-03-28. Real, sourced.
//
// Why this is a good stress test:
// - GAAP-unprofitable (net margin -1.1% TTM) but strongly FCF-positive (~30% FCF margin) —
//   the gap is customer prepayments/deposits and non-cash items, a case the engine's split
//   DCF/comps tracks should handle without conflating "unprofitable" with "cash-burning".
// - A massive disclosed backlog ($22.5B, ~12% converting within 12 months) — tests the
//   dedicated pipeline/backlog track rather than folding it into raw revenue growth.
// - Improving margins (operating margin -5.1% FY25 -> -1.8% TTM) — tests the DCF
//   margin-improvement boost path (only eligible because profitabilityStatus is
//   "Revenue-Generating / Unprofitable").
// - Low gross margin (~21%) for a "high-tech" narrative — tests the new margin-durability
//   factor: Symbotic is NOT classified as Software, so the software gate doesn't apply, but
//   the general margin-quality factor should still read 21% gross as unremarkable, not punish
//   it like a "should-be-software" name, since Product/Hardware isn't a high-margin-norm sector.
//
// Sources:
// - stockanalysis.com/stocks/SYM/financials (revenue, margins, growth, capex%)
// - stockanalysis.com/stocks/SYM/statistics (price, shares, cash, debt)
// - Yahoo Finance / StockTitan 10-K coverage: $22.5B backlog as of FY25 year-end
//   (2025-09-27), ~12% expected to convert to FY2026 revenue; Walmart 400-APD deployment
//   commitment and $520M Walmart-funded development program.
import { computeValuation } from "../src/valuationEngine.js"

const SYMBOTIC = {
  companyName: "Symbotic",
  sector: "Industrial / Robotics / Automation",
  businessModel: "Product / Hardware",
  tags: ["Hardware Sales", "Subscription / Recurring Revenue", "Data / AI Advantage"],
  lifecycleStage: "Scaling",
  capitalStatus: "Public",
  profitabilityStatus: "Revenue-Generating / Unprofitable",

  tam: 400e9, sam: 60e9,
  revenue: 2_517e6, revenueGrowth: 0.2152, sectorCagr: 0.15,
  grossMargin: 0.2058, opexRatio: 0.194, capexPct: 0.0384, marginChangeYoy: 0.033,
  cash: 2_010e6, debt: 27.93e6,
  // Symbotic's own 10-K states advance customer payments on install contracts are the
  // "principal source of liquidity" — reported TTM FCF margin (~29.7%) runs ~32.5 points
  // above what gross/opex/capex margins alone would imply (engine-derived fcfMargin before
  // this credit is about -2.8%). Entered at 0.15, a conservative sub-cap estimate (the
  // engine caps this input at 0.2) rather than the full disclosed gap, since sustaining the
  // entire magnitude every year in perpetuity (as a steady-state DCF input effectively
  // assumes) is a stronger claim than the current backlog:revenue ratio alone supports.
  customerPrepaymentPct: 0.15,
  // FY2025 10-K: "more than 84% of Symbotic's total revenues were generated from
  // Walmart." The relationship is deepening, not just persisting: Symbotic acquired
  // Walmart's own Advanced Systems and Robotics business (Jan 2025), signed a Master
  // Automation Agreement, and Walmart committed to 400 additional automated pickup
  // centers plus a $520M Walmart-funded development program — genuine expansion, not
  // mere continuation.
  topCustomerRevenuePct: 0.84,
  topCustomerRelationshipTrend: "Expanding",

  recurringRevenuePct: 0.2, nrr: 1.0, churn: 0.02,

  // Backlog dominates the story here — not pipeline.
  pipelineValue: 0, pipelineConversion: 0,
  backlogValue: 22_500e6, backlogConversion: 0.12, backlogGrossMargin: 0.21,
  contractDurationYears: 3, renewalProbability: 0.8,

  competitorCount: 3, competitorEvRevenue: 3.5, competitorEvEbitda: 18,
  competitorRevenueGrowth: 0.12, competitorGrossMargin: 0.30, competitorEbitdaMargin: 0.15,

  clientType: "Enterprise / Business", brandGeographicReach: "National",
  yearsOperating: 19, targetMarketRecognitionPct: 0.35, customerTrustScore: 7,
  purchaseFrequency: 3, missionCriticality: 8, institutionalReliance: 8, consumerHabitStrength: 2,

  competitionIntensity: 3, managementScore: 7, moatScore: 7, gtmScore: 7,
  dataAdvantageScore: 6, networkEffectScore: 2, switchingCostScore: 8, ipScore: 7,
  acquirerPool: 3, techReadiness: 8, regulatoryRisk: 2,

  expectedDilution: 0.03, dividendYield: 0, buybackYield: 0,
  sharePrice: 46.61, sharesOutstanding: 602.71e6,
  terminalGrowth: 0.035, projectionYears: 8,
}

const r = computeValuation(SYMBOTIC)
const B = (x) => (Math.abs(x) >= 1e9 ? (x / 1e9).toFixed(2) + "B" : (x / 1e6).toFixed(0) + "M")
const pct = (x, d = 0) => (x * 100).toFixed(d) + "%"

const obs = r.tracks.market.paths.observedEquity
console.log("\n=== SYMBOTIC (SYM) — valuation engine run, 2026-08-04 ===\n")
console.log("Fair common equity:", B(r.outputs.fairCommonEquity))
console.log("Fair-value range:  ", B(r.bands.final.low), "-", B(r.bands.final.high), `(confidence ${pct(r.bands.quality)})`)
console.log("Observed market cap:", B(obs))
console.log("Fair vs observed:  ", pct((r.outputs.fairCommonEquity - obs) / obs))
console.log("In modeled band:   ", obs >= r.bands.final.low && obs <= r.bands.final.high ? "yes" : "no")
console.log("Discount rate:     ", pct(r.discount.rate, 1))
console.log("Effective growth:  ", pct(r.growth.effectiveGrowth, 1), " (headline", pct(r.growth.headline, 1) + ", credibility", pct(r.growth.credibility) + ")")

console.log("\n--- Track construction ---")
const TRACKS = [["DCF", "dcf"], ["Direct Comps", "directComps"], ["Industry", "industry"], ["Public Market", "publicMarket"], ["Pipeline/Backlog", "pipeline"], ["Asset", "asset"], ["Strategic", "strategic"]]
for (const [label, key] of TRACKS) {
  const t = r.tracks[key]
  const w = r.final.trackWeights[key] || 0
  console.log(`  ${label.padEnd(18)} rawEV ${B(t?.rawEV || 0).padStart(9)}   weight ${pct(w).padStart(5)}   confidence ${pct(t?.confidence || 0)}`)
}

console.log("\n--- Backlog track detail ---")
console.log("  expectedBacklog (value x conversion):", B(r.tracks.pipeline.paths.expectedBacklog))
console.log("  margin applied:", pct(r.tracks.pipeline.paths.margin))
console.log("  duration (yrs):", r.tracks.pipeline.paths.duration)
console.log("  execution risk discount:", pct(r.tracks.pipeline.paths.executionRisk))

console.log("\n--- Margins (engine-derived) ---")
console.log("  ebitdaMargin:", pct(r.margins.ebitdaMargin, 1), " fcfMargin:", pct(r.margins.fcfMargin, 1), " customerPrepaymentCredit:", pct(r.margins.customerPrepaymentCredit, 1))

console.log("\n--- DCF margin trajectory ---")
const mt = r.tracks.dcf.marginTrajectory
console.log("  start margin:", pct(mt.startMargin, 1), " -> mature margin:", pct(mt.matureMargin, 1))
console.log("  margin ceiling:", pct(mt.marginCeiling, 1), " boost-eligible:", mt.marginBoostEligible)

console.log("\n--- Key signals ---")
const s = r.ledger.signals
console.log("  durability:        ", pct(s.durability.effective))
console.log("  brandDurability:   ", pct(s.brandDurability.effective))
console.log("  moatStrength:      ", pct(s.moatStrength.effective))
console.log("  capitalReturns:    ", pct(s.capitalReturns.effective))
console.log("  marketPotential:   ", pct(s.marketPotential.effective))
console.log("  pipelineOpportunity:", pct(s.pipelineOpportunity.effective))
console.log("  probabilityUncertainty:", pct(s.probabilityUncertainty.effective))
console.log("  customerConcentration:", pct(s.customerConcentration.effective), " (concentration risk premium on discount rate:", pct(r.discount.components.concentrationRiskPremium, 2) + ")")

console.log("\n--- Applied multiple ---")
console.log("  EV/Revenue:", r.multiples.evRevenue.toFixed(2) + "x   marginQualityFactor:", r.multiples.marginQualityFactor)
console.log("  companyMultipleFactor:", r.ledger.budgets.companyMultipleFactor)

if (r.warnings.length) {
  console.log("\n--- Warnings ---")
  for (const w of r.warnings) console.log("  -", w)
}
console.log("")
