// Runs the valuation engine on 5 real companies (values researched from public
// filings / market data as of 2026-07-29) and then performs a variance-attribution
// pass to locate where cross-company dispersion in the applied valuation comes from.
//
// Usage: node scripts/scenario-attribution.mjs
import { computeValuation } from "../src/valuationEngine.js"

// ---------------------------------------------------------------------------
// 1. Company inputs — actual figures, not placeholders.
// Sources: stockanalysis.com financials/statistics pages (revenue, margins,
// cash, debt, price, shares) pulled 2026-07-29; TAM/SAM and qualitative scores
// estimated from each company's disclosures and market position.
// ---------------------------------------------------------------------------
const COMPANIES = [
  {
    // High-quality software, GAAP-unprofitable, margins improving (required case).
    companyName: "Snowflake",
    sector: "SaaS / Enterprise Software",
    businessModel: "Software / Subscription",
    tags: ["Subscription / Recurring Revenue", "Usage-Based", "Data / AI Advantage"],
    lifecycleStage: "Scaling",
    capitalStatus: "Public",
    profitabilityStatus: "Revenue-Generating / Unprofitable",
    tam: 250e9, sam: 120e9,
    revenue: 5_033e6, revenueGrowth: 0.31, sectorCagr: 0.20,
    grossMargin: 0.67, opexRatio: 0.90, capexPct: 0.02, marginChangeYoy: 0.05,
    cash: 2_950e6, debt: 2_770e6,
    recurringRevenuePct: 0.95, nrr: 1.25, churn: 0.01,
    competitorCount: 5, competitorEvRevenue: 14, competitorEvFcf: 45,
    competitorRevenueGrowth: 0.28, competitorGrossMargin: 0.75, competitorEbitdaMargin: 0.10,
    clientType: "Enterprise / Business", brandGeographicReach: "Global",
    yearsOperating: 14, targetMarketRecognitionPct: 0.5, customerTrustScore: 8,
    purchaseFrequency: 8, missionCriticality: 8, institutionalReliance: 7, consumerHabitStrength: 3,
    competitionIntensity: 3, managementScore: 8, moatScore: 8, gtmScore: 8,
    dataAdvantageScore: 8, networkEffectScore: 5, switchingCostScore: 9, ipScore: 5,
    acquirerPool: 3, techReadiness: 9, regulatoryRisk: 2,
    expectedDilution: 0.08, dividendYield: 0,
    sharePrice: 282.90, sharesOutstanding: 346.6e6,
    terminalGrowth: 0.04, projectionYears: 8,
  },
  {
    // Mega-cap consumer staples, brand-driven, slow steady growth.
    companyName: "Coca-Cola",
    sector: "Consumer Products / Retail / E-commerce",
    businessModel: "Manufacturing / Production",
    tags: ["Brand / Consumer Staples"],
    lifecycleStage: "Profitable / Mature",
    capitalStatus: "Public",
    profitabilityStatus: "FCF Positive",
    tam: 1_500e9, sam: 400e9,
    revenue: 50_129e6, revenueGrowth: 0.065, sectorCagr: 0.04,
    grossMargin: 0.62, opexRatio: 0.32, capexPct: 0.04,
    cash: 16_370e6, debt: 43_540e6,
    recurringRevenuePct: 0.2, nrr: 1.0, churn: 0.02,
    competitorCount: 4, competitorEvRevenue: 3.5, competitorEvEbitda: 15,
    competitorRevenueGrowth: 0.04, competitorGrossMargin: 0.55, competitorEbitdaMargin: 0.25,
    clientType: "Consumers", brandGeographicReach: "Global",
    yearsOperating: 139, targetMarketRecognitionPct: 0.97, customerTrustScore: 9,
    purchaseFrequency: 9, missionCriticality: 3, consumerHabitStrength: 10, institutionalReliance: 3,
    competitionIntensity: 2, managementScore: 8, moatScore: 9, gtmScore: 8,
    dataAdvantageScore: 4, networkEffectScore: 3, switchingCostScore: 4, ipScore: 7,
    acquirerPool: 1, techReadiness: 8, regulatoryRisk: 2,
    expectedDilution: 0, dividendYield: 0.0238, buybackYield: 0.005,
    sharePrice: 89.08, sharesOutstanding: 4_300e6,
    terminalGrowth: 0.03, projectionYears: 7,
  },
  {
    // Mega-cap balance-sheet business (bank). Net-debt set ~flat: bank funding is
    // not comparable leverage, so book/ROE carries the value via the asset track.
    companyName: "Bank of America",
    sector: "Fintech / Financial Services",
    businessModel: "Financial / Balance-Sheet Business",
    tags: ["Transaction-Based", "Regulated Approval Path", "Data / AI Advantage"],
    lifecycleStage: "Profitable / Mature",
    capitalStatus: "Public",
    profitabilityStatus: "FCF Positive",
    tam: 2_000e9, sam: 600e9,
    revenue: 115_792e6, revenueGrowth: 0.074, sectorCagr: 0.05,
    grossMargin: 0.98, opexRatio: 0.55, capexPct: 0.01,
    cash: 300_000e6, debt: 300_000e6,
    tangibleBookValue: 200_000e6, assetBackingValue: 200_000e6, roe: 0.112, rotce: 0.14,
    recurringRevenuePct: 0.6, nrr: 1.02, churn: 0.01,
    competitorCount: 5, competitorPe: 13, competitorEvRevenue: 3.5, competitorNetMargin: 0.28,
    competitorRevenueGrowth: 0.05, competitorGrossMargin: 0.98, competitorEbitdaMargin: 0.42,
    clientType: "Mixed / Multiple", brandGeographicReach: "National",
    yearsOperating: 120, targetMarketRecognitionPct: 0.85, customerTrustScore: 7,
    purchaseFrequency: 8, missionCriticality: 8, consumerHabitStrength: 7, institutionalReliance: 8,
    competitionIntensity: 3, managementScore: 8, moatScore: 8, gtmScore: 7,
    dataAdvantageScore: 7, networkEffectScore: 6, switchingCostScore: 8, ipScore: 4,
    acquirerPool: 1, techReadiness: 8, regulatoryRisk: 4,
    expectedDilution: 0, dividendYield: 0.021, buybackYield: 0.03,
    sharePrice: 61.07, sharesOutstanding: 7_020e6,
    terminalGrowth: 0.03, projectionYears: 7,
  },
  {
    // Large-cap industrial / heavy machinery, cyclical, recovering growth. Debt is
    // equipment-operations only (the John Deere Financial captive-finance debt of
    // ~$64B is receivables-backed and excluded, as it would distort net debt).
    companyName: "Deere & Company",
    sector: "Manufacturing / Industrials",
    businessModel: "Manufacturing / Production",
    tags: ["Inventory-Heavy", "Working-Capital Intensive", "Data / AI Advantage"],
    lifecycleStage: "Profitable / Mature",
    capitalStatus: "Public",
    profitabilityStatus: "FCF Positive",
    tam: 250e9, sam: 120e9,
    revenue: 47_392e6, revenueGrowth: 0.04, sectorCagr: 0.03,
    grossMargin: 0.37, opexRatio: 0.18, capexPct: 0.09,
    cash: 6_350e6, debt: 13_000e6,
    inventory: 9_000e6, ar: 10_000e6, ap: 12_000e6,
    recurringRevenuePct: 0.25, nrr: 1.0, churn: 0.03,
    competitorCount: 4, competitorEvRevenue: 1.5, competitorEvEbitda: 9, competitorEvFcf: 16,
    competitorRevenueGrowth: 0.02, competitorGrossMargin: 0.28, competitorEbitdaMargin: 0.16,
    clientType: "Enterprise / Business", brandGeographicReach: "Global",
    yearsOperating: 189, targetMarketRecognitionPct: 0.75, customerTrustScore: 8,
    purchaseFrequency: 4, missionCriticality: 7, consumerHabitStrength: 3, institutionalReliance: 6,
    competitionIntensity: 3, managementScore: 8, moatScore: 8, gtmScore: 8,
    dataAdvantageScore: 6, networkEffectScore: 3, switchingCostScore: 7, ipScore: 7,
    acquirerPool: 1, techReadiness: 8, regulatoryRisk: 2,
    expectedDilution: 0, dividendYield: 0.0106, buybackYield: 0.03,
    sharePrice: 610.95, sharesOutstanding: 269.94e6,
    terminalGrowth: 0.025, projectionYears: 7,
  },
  {
    // Large-cap two-sided consumer marketplace, asset-light, very high FCF margin.
    companyName: "Airbnb",
    sector: "Consumer Internet / Media / Gaming",
    businessModel: "Marketplace / Network Platform",
    tags: ["Marketplace / Two-Sided Network", "Advertising / Attention-Based", "Brand / Consumer Staples", "Data / AI Advantage"],
    lifecycleStage: "Late-Stage Growth",
    capitalStatus: "Public",
    profitabilityStatus: "FCF Positive",
    tam: 1_500e9, sam: 300e9,
    revenue: 12_647e6, revenueGrowth: 0.126, sectorCagr: 0.09,
    grossMargin: 0.83, opexRatio: 0.63, capexPct: 0.01,
    cash: 12_010e6, debt: 2_530e6,
    recurringRevenuePct: 0.3, nrr: 1.05, churn: 0.05,
    competitorCount: 3, competitorEvRevenue: 5, competitorEvEbitda: 15, competitorEvFcf: 20,
    competitorRevenueGrowth: 0.09, competitorGrossMargin: 0.85, competitorEbitdaMargin: 0.30,
    clientType: "Consumers", brandGeographicReach: "Global",
    yearsOperating: 18, targetMarketRecognitionPct: 0.85, customerTrustScore: 7,
    purchaseFrequency: 4, missionCriticality: 3, consumerHabitStrength: 6, institutionalReliance: 2,
    competitionIntensity: 3, managementScore: 8, moatScore: 8, gtmScore: 8,
    dataAdvantageScore: 8, networkEffectScore: 9, switchingCostScore: 4, ipScore: 4,
    acquirerPool: 2, techReadiness: 9, regulatoryRisk: 3,
    expectedDilution: 0.02, dividendYield: 0, buybackYield: 0.04,
    sharePrice: 153.01, sharesOutstanding: 593.5e6,
    terminalGrowth: 0.035, projectionYears: 8,
  },
  {
    // Mega-cap regulated utility + renewables. Very capital-intensive (capex ~35% of
    // revenue) with large rate-base-funded debt that is real leverage (unlike a bank).
    companyName: "NextEra Energy",
    sector: "Clean Energy / Climate",
    businessModel: "Asset-Heavy Operator",
    tags: ["Asset-Heavy Infrastructure", "Regulated Approval Path"],
    lifecycleStage: "Profitable / Mature",
    capitalStatus: "Public",
    profitabilityStatus: "Profitable",
    tam: 500e9, sam: 150e9,
    revenue: 28_701e6, revenueGrowth: 0.108, sectorCagr: 0.08,
    grossMargin: 0.61, opexRatio: 0.31, capexPct: 0.32,
    cash: 2_870e6, debt: 110_200e6,
    tangibleBookValue: 75_000e6, assetBackingValue: 90_000e6, roe: 0.11,
    recurringRevenuePct: 0.85, nrr: 1.0, churn: 0.005,
    competitorCount: 4, competitorEvRevenue: 4, competitorEvEbitda: 12, competitorEvFcf: 0,
    competitorRevenueGrowth: 0.04, competitorGrossMargin: 0.55, competitorEbitdaMargin: 0.35,
    clientType: "Consumers", brandGeographicReach: "National",
    yearsOperating: 100, targetMarketRecognitionPct: 0.5, customerTrustScore: 6,
    purchaseFrequency: 10, missionCriticality: 10, consumerHabitStrength: 8, institutionalReliance: 8,
    competitionIntensity: 2, managementScore: 8, moatScore: 8, gtmScore: 5,
    dataAdvantageScore: 4, networkEffectScore: 4, switchingCostScore: 9, ipScore: 3,
    acquirerPool: 1, techReadiness: 7, regulatoryRisk: 4,
    expectedDilution: 0.02, dividendYield: 0.0279, buybackYield: 0,
    sharePrice: 88.46, sharesOutstanding: 2_090e6,
    terminalGrowth: 0.03, projectionYears: 8,
  },
]

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const B = (x) => (Math.abs(x) >= 1e9 ? (x / 1e9).toFixed(1) + "B" : (x / 1e6).toFixed(0) + "M")
const pct = (x, d = 0) => (x * 100).toFixed(d) + "%"
const pad = (s, n) => String(s).padEnd(n)
const padl = (s, n) => String(s).padStart(n)
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length
const variance = (a) => { const m = mean(a); return mean(a.map((v) => (v - m) ** 2)) }
const cov = (a, b) => { const ma = mean(a), mb = mean(b); return mean(a.map((v, i) => (v - ma) * (b[i] - mb))) }
const cv = (a) => Math.sqrt(variance(a)) / mean(a) // coefficient of variation

// ---------------------------------------------------------------------------
// 2. Run the engine
// ---------------------------------------------------------------------------
const results = COMPANIES.map((c) => ({ c, r: computeValuation(c) }))

console.log("\n=== VALUATION RESULTS (as of 2026-07-29) ===\n")
console.log(pad("Company", 20), padl("Fair equity", 12), padl("Range", 20), padl("Obs cap", 10), padl("Fair vs obs", 12), padl("Disc", 6), padl("EffGrw", 7))
for (const { r } of results) {
  const obs = r.tracks.market.paths.observedEquity
  const diff = obs > 0 ? pct((r.outputs.fairCommonEquity - obs) / obs, 0) : "n/a"
  console.log(
    pad(r.input.companyName, 20),
    padl(B(r.outputs.fairCommonEquity), 12),
    padl(`${B(r.bands.final.low)} - ${B(r.bands.final.high)}`, 20),
    padl(B(obs), 10),
    padl(diff, 12),
    padl(pct(r.discount.rate, 1), 6),
    padl(pct(r.growth.effectiveGrowth, 0), 7),
  )
}

console.log("\n=== SIGNAL / DURABILITY READOUT ===\n")
console.log(pad("Company", 20), padl("brandDur", 9), padl("brandRel", 9), padl("moat", 6), padl("lowComp", 8), padl("durability", 11), padl("confid", 7))
for (const { r } of results) {
  const s = r.ledger.signals
  console.log(
    pad(r.input.companyName, 20),
    padl(pct(s.brandDurability.effective), 9),
    padl(pct(r.context.brand.relevance), 9),
    padl(pct(s.moatStrength.effective), 6),
    padl(pct(s.lowDirectCompetition.effective), 8),
    padl(pct(s.durability.effective), 11),
    padl(pct(r.bands.quality), 7),
  )
}

console.log("\n=== TRACK MIX (weight x rawEV as share of fair EV) ===\n")
const TRACKS = ["dcf", "directComps", "industry", "publicMarket", "pipeline", "asset", "strategic"]
console.log(pad("Company", 20), ...TRACKS.map((t) => padl(t.slice(0, 8), 9)), padl("fairEV/rev", 11))
for (const { r } of results) {
  const fairEV = r.outputs.fairEV
  const shares = TRACKS.map((t) => {
    const w = r.final.trackWeights[t] || 0
    const ev = r.tracks[t]?.rawEV || 0
    return fairEV > 0 ? (w * ev) / fairEV : 0
  })
  console.log(
    pad(r.input.companyName, 20),
    ...shares.map((v) => padl(pct(v, 0), 9)),
    padl((fairEV / r.input.revenue).toFixed(1) + "x", 11),
  )
}

// ---------------------------------------------------------------------------
// 3. VARIANCE ATTRIBUTION
// The engine's applied EV/revenue is a product chain in dynamicMultiples:
//   evRevenue = sectorBaseInterp x qualitySpread x capitalDrag x tagBudget
//               x scaleMultipleFactor x companyMultipleFactor x softwareGate
// We take logs so the (multiplicative) chain becomes additive, then attribute
// the cross-company variance of log(applied multiple) to each factor via the
// covariance decomposition:  contribution_i = Cov(log f_i, log total) / Var(log total).
// Factors not individually exposed (sector base, growth/quality/capital position)
// are recovered as a single "sector base + positioning" residual.
// ---------------------------------------------------------------------------
console.log("\n=== ATTRIBUTION A: applied EV/revenue multiple (tunable comps chain) ===\n")
const logMult = results.map(({ r }) => Math.log(r.multiples.evRevenue))
const factorNames = ["companyMultipleFactor", "scaleMultipleFactor", "tagBudgetMultiplier", "softwareDurabilityGate"]
const factorLogs = {}
for (const f of factorNames) {
  factorLogs[f] = results.map(({ r }) => Math.log(f === "softwareDurabilityGate" ? r.multiples.softwareDurabilityGate : r.ledger.budgets[f]))
}
// residual = everything else in the multiple (sector baseline band + growth/quality/margin/capital positioning)
factorLogs["sectorBase+positioning(residual)"] = results.map(({ r }, i) => {
  const explained = factorNames.reduce((s, f) => s + factorLogs[f][i], 0)
  return logMult[i] - explained
})

const totalVar = variance(logMult)
console.log(`Applied EV/revenue across corpus: ${results.map(({ r }) => r.multiples.evRevenue.toFixed(1) + "x").join(", ")}`)
console.log(`CV of applied multiple: ${pct(cv(results.map(({ r }) => r.multiples.evRevenue)), 1)}   Var(log) = ${totalVar.toFixed(4)}\n`)
console.log(pad("Factor", 38), padl("Var(logf)", 11), padl("Contribution", 14))
const contribRows = Object.entries(factorLogs).map(([name, logs]) => ({ name, v: variance(logs), contrib: cov(logs, logMult) / totalVar }))
contribRows.sort((a, b) => b.contrib - a.contrib)
for (const { name, v, contrib } of contribRows) {
  console.log(pad(name, 38), padl(v.toFixed(4), 11), padl(pct(contrib, 1), 14))
}

// ---------------------------------------------------------------------------
// Attribution B: where does the FINAL fair value dispersion come from?
// Decompose log(fair EV / revenue) into: applied comps multiple, the DCF-vs-comps
// divergence, and the track-mix tilt. We measure how much each stage's log spread
// co-moves with the final answer.
// ---------------------------------------------------------------------------
console.log("\n=== ATTRIBUTION B: final fair EV/revenue vs its building blocks ===\n")
const logFair = results.map(({ r }) => Math.log(r.outputs.fairEV / r.input.revenue))
const stages = {
  "applied comps multiple": results.map(({ r }) => Math.log(r.multiples.evRevenue)),
  "DCF implied EV/rev": results.map(({ r }) => Math.log(Math.max(r.tracks.dcf.rawEV, 1) / r.input.revenue)),
  "asset track EV/rev": results.map(({ r }) => Math.log(Math.max(r.tracks.asset.rawEV, 1) / r.input.revenue)),
  "discount rate": results.map(({ r }) => Math.log(r.discount.rate)),
  "effective growth (1+g)": results.map(({ r }) => Math.log(1 + Math.max(r.growth.effectiveGrowth, -0.5))),
}
const totalVarFair = variance(logFair)
console.log(`Final fair EV/revenue: ${results.map(({ r }) => (r.outputs.fairEV / r.input.revenue).toFixed(1) + "x").join(", ")}`)
console.log(`CV of final fair EV/rev: ${pct(cv(results.map(({ r }) => r.outputs.fairEV / r.input.revenue)), 1)}   Var(log) = ${totalVarFair.toFixed(4)}\n`)
console.log(pad("Building block", 26), padl("Var(log)", 10), padl("Corr w/ final", 14), padl("Cov/Var(final)", 15))
const stageRows = Object.entries(stages).map(([name, logs]) => ({
  name, v: variance(logs),
  corr: cov(logs, logFair) / Math.sqrt(variance(logs) * totalVarFair),
  share: cov(logs, logFair) / totalVarFair,
}))
stageRows.sort((a, b) => b.share - a.share)
for (const { name, v, corr, share } of stageRows) {
  console.log(pad(name, 26), padl(v.toFixed(4), 10), padl(corr.toFixed(2), 14), padl(pct(share, 0), 15))
}

// ---------------------------------------------------------------------------
// Attribution C: neutralization check — pin each comps factor to the corpus
// geometric mean and measure how much the dispersion (Var log multiple) collapses.
// A large collapse means that factor is a primary source of cross-company spread.
// ---------------------------------------------------------------------------
console.log("\n=== ATTRIBUTION C: neutralization (pin factor -> % of multiple-variance removed) ===\n")
console.log(pad("Pinned factor", 38), padl("Var(log) after", 15), padl("% variance removed", 20))
for (const f of factorNames) {
  const gm = mean(factorLogs[f]) // geometric mean in log space
  const pinned = logMult.map((lm, i) => lm - factorLogs[f][i] + gm)
  const removed = 1 - variance(pinned) / totalVar
  console.log(pad(f, 38), padl(variance(pinned).toFixed(4), 15), padl(pct(removed, 1), 20))
}

console.log("")

export { COMPANIES }
