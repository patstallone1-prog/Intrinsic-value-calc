// Runs the valuation engine on 6 companies across sectors and geographies
// (PG&E, Wells Fargo, ASML, LVMH, Toyota, Novo Nordisk) with real figures pulled
// 2026-07-29, then performs the same variance-attribution pass as scenario-attribution.mjs.
//
// Currency: non-USD reporters are converted to USD for internal consistency, EXCEPT
// LVMH which is kept fully in EUR (the fair-vs-observed ratio is currency-invariant).
// FX used: EUR/USD 1.08, JPY/USD 1/150, DKK/USD 0.145.
//
// Usage: node scripts/scenario-global.mjs
import { computeValuation } from "../src/valuationEngine.js"

const COMPANIES = [
  {
    // US regulated utility, troubled (wildfire history), trades near book. Tests the
    // regulated rate-base regime at the LOW-quality end (should earn a modest premium).
    companyName: "PG&E",
    sector: "Clean Energy / Climate",
    businessModel: "Asset-Heavy Operator",
    tags: ["Asset-Heavy Infrastructure", "Regulated Approval Path"],
    lifecycleStage: "Profitable / Mature",
    capitalStatus: "Public",
    profitabilityStatus: "Profitable",
    tam: 200e9, sam: 60e9,
    revenue: 25_837e6, revenueGrowth: 0.057, sectorCagr: 0.05,
    grossMargin: 0.40, opexRatio: 0.20, capexPct: 0.30,
    cash: 972e6, debt: 64_700e6,
    tangibleBookValue: 34_000e6, assetBackingValue: 55_000e6, roe: 0.093,
    recurringRevenuePct: 0.9, nrr: 1.0, churn: 0.005,
    competitorCount: 3, competitorEvRevenue: 3.5, competitorEvEbitda: 11,
    competitorRevenueGrowth: 0.04, competitorGrossMargin: 0.40, competitorEbitdaMargin: 0.35,
    clientType: "Consumers", brandGeographicReach: "Regional",
    yearsOperating: 120, targetMarketRecognitionPct: 0.5, customerTrustScore: 4,
    purchaseFrequency: 10, missionCriticality: 10, consumerHabitStrength: 8, institutionalReliance: 8,
    competitionIntensity: 2, managementScore: 6, moatScore: 7, gtmScore: 5,
    dataAdvantageScore: 4, networkEffectScore: 4, switchingCostScore: 9, ipScore: 2,
    acquirerPool: 1, techReadiness: 6, regulatoryRisk: 5,
    expectedDilution: 0.03, dividendYield: 0.0112, buybackYield: 0,
    sharePrice: 17.71, sharesOutstanding: 2_200e6,
    terminalGrowth: 0.025, projectionYears: 8,
  },
  {
    // US money-center bank. Tests the bank book/ROE (P/B) regime. Trades ~1.8x TBV.
    companyName: "Wells Fargo",
    sector: "Fintech / Financial Services",
    businessModel: "Financial / Balance-Sheet Business",
    tags: ["Transaction-Based", "Regulated Approval Path", "Data / AI Advantage"],
    lifecycleStage: "Profitable / Mature",
    capitalStatus: "Public",
    profitabilityStatus: "FCF Positive",
    tam: 2_000e9, sam: 500e9,
    revenue: 83_026e6, revenueGrowth: 0.07, sectorCagr: 0.04,
    grossMargin: 0.98, opexRatio: 0.60, capexPct: 0.01,
    cash: 480_000e6, debt: 480_000e6,
    tangibleBookValue: 140_000e6, assetBackingValue: 182_000e6, roe: 0.126, rotce: 0.15,
    recurringRevenuePct: 0.6, nrr: 1.02, churn: 0.01,
    competitorCount: 5, competitorPe: 13, competitorEvRevenue: 3.5, competitorNetMargin: 0.27,
    competitorRevenueGrowth: 0.05, competitorGrossMargin: 0.98, competitorEbitdaMargin: 0.42,
    clientType: "Mixed / Multiple", brandGeographicReach: "National",
    yearsOperating: 170, targetMarketRecognitionPct: 0.8, customerTrustScore: 6,
    purchaseFrequency: 8, missionCriticality: 8, consumerHabitStrength: 7, institutionalReliance: 8,
    competitionIntensity: 3, managementScore: 7, moatScore: 7, gtmScore: 7,
    dataAdvantageScore: 7, networkEffectScore: 6, switchingCostScore: 8, ipScore: 4,
    acquirerPool: 1, techReadiness: 8, regulatoryRisk: 4,
    expectedDilution: 0, dividendYield: 0.0215, buybackYield: 0.04,
    sharePrice: 83.87, sharesOutstanding: 3_020e6,
    terminalGrowth: 0.03, projectionYears: 7,
  },
  {
    // Netherlands — semiconductor lithography monopoly (EUV). Elite quality, high
    // multiple; tests the soft ceiling on a genuine monopoly. Revenue converted EUR->USD.
    companyName: "ASML (NL)",
    sector: "Industrial / Robotics / Automation",
    businessModel: "Tools / Devices / Equipment",
    tags: ["Hardware Sales", "Consumables / Attachments", "Data / AI Advantage", "IP / Licensing"],
    lifecycleStage: "Late-Stage Growth",
    capitalStatus: "Public",
    profitabilityStatus: "FCF Positive",
    tam: 130e9, sam: 45e9,
    revenue: 38_150e6, revenueGrowth: 0.10, sectorCagr: 0.12,
    grossMargin: 0.53, opexRatio: 0.17, capexPct: 0.03,
    cash: 8_650e6, debt: 2_260e6,
    recurringRevenuePct: 0.4, nrr: 1.05, churn: 0.01,
    competitorCount: 2, competitorEvRevenue: 6, competitorEvEbitda: 20, competitorEvFcf: 28,
    competitorRevenueGrowth: 0.10, competitorGrossMargin: 0.50, competitorEbitdaMargin: 0.30,
    clientType: "Enterprise / Business", brandGeographicReach: "Global",
    yearsOperating: 42, targetMarketRecognitionPct: 0.6, customerTrustScore: 9,
    purchaseFrequency: 5, missionCriticality: 10, consumerHabitStrength: 2, institutionalReliance: 8,
    competitionIntensity: 1, managementScore: 9, moatScore: 10, gtmScore: 8,
    dataAdvantageScore: 7, networkEffectScore: 4, switchingCostScore: 9, ipScore: 10,
    acquirerPool: 1, techReadiness: 9, regulatoryRisk: 3,
    expectedDilution: 0, dividendYield: 0.008, buybackYield: 0.02,
    sharePrice: 1550.69, sharesOutstanding: 384.1e6,
    terminalGrowth: 0.03, projectionYears: 8,
  },
  {
    // France — luxury goods conglomerate, iconic brands, currently declining sales.
    // Kept fully in EUR. Tests the brand signal on a premium consumer name in a slump.
    companyName: "LVMH (FR, EUR)",
    sector: "Consumer Products / Retail / E-commerce",
    businessModel: "Manufacturing / Production",
    tags: ["Brand / Consumer Staples", "Inventory-Heavy"],
    lifecycleStage: "Profitable / Mature",
    capitalStatus: "Public",
    profitabilityStatus: "FCF Positive",
    tam: 400e9, sam: 150e9,
    revenue: 79_641e6, revenueGrowth: -0.014, sectorCagr: 0.05,
    grossMargin: 0.66, opexRatio: 0.45, capexPct: 0.04,
    cash: 12_210e6, debt: 37_150e6,
    inventory: 23_000e6, ar: 4_000e6, ap: 10_000e6,
    recurringRevenuePct: 0.15, nrr: 1.0, churn: 0.02,
    competitorCount: 4, competitorEvRevenue: 4, competitorEvEbitda: 14,
    competitorRevenueGrowth: 0.02, competitorGrossMargin: 0.68, competitorEbitdaMargin: 0.28,
    clientType: "Consumers", brandGeographicReach: "Global",
    yearsOperating: 38, targetMarketRecognitionPct: 0.9, customerTrustScore: 8,
    purchaseFrequency: 4, missionCriticality: 2, consumerHabitStrength: 6, institutionalReliance: 2,
    competitionIntensity: 3, managementScore: 9, moatScore: 9, gtmScore: 8,
    dataAdvantageScore: 4, networkEffectScore: 3, switchingCostScore: 3, ipScore: 8,
    acquirerPool: 1, techReadiness: 7, regulatoryRisk: 2,
    expectedDilution: 0, dividendYield: 0.0276, buybackYield: 0.01,
    sharePrice: 467.95, sharesOutstanding: 493.1e6,
    terminalGrowth: 0.025, projectionYears: 7,
  },
  {
    // Japan — auto manufacturer, low-margin cyclical, famously "cheap on paper" (trades
    // below book). Revenue converted JPY->USD; debt is auto-operations only (Toyota
    // Financial Services debt of ~$276B is receivables-backed and excluded).
    companyName: "Toyota (JP)",
    sector: "Manufacturing / Industrials",
    businessModel: "Manufacturing / Production",
    tags: ["Inventory-Heavy", "Working-Capital Intensive"],
    lifecycleStage: "Profitable / Mature",
    capitalStatus: "Public",
    profitabilityStatus: "FCF Positive",
    tam: 3_000e9, sam: 600e9,
    revenue: 337_900e6, revenueGrowth: 0.055, sectorCagr: 0.03,
    grossMargin: 0.167, opexRatio: 0.093, capexPct: 0.05,
    cash: 45_000e6, debt: 15_000e6,
    tangibleBookValue: 200_000e6, assetBackingValue: 0,
    inventory: 40_000e6, ar: 30_000e6, ap: 35_000e6,
    recurringRevenuePct: 0.15, nrr: 1.0, churn: 0.05,
    competitorCount: 5, competitorEvRevenue: 0.6, competitorEvEbitda: 8, competitorNetMargin: 0.06,
    competitorRevenueGrowth: 0.03, competitorGrossMargin: 0.15, competitorEbitdaMargin: 0.12,
    clientType: "Consumers", brandGeographicReach: "Global",
    yearsOperating: 88, targetMarketRecognitionPct: 0.9, customerTrustScore: 8,
    purchaseFrequency: 3, missionCriticality: 5, consumerHabitStrength: 6, institutionalReliance: 3,
    competitionIntensity: 4, managementScore: 8, moatScore: 7, gtmScore: 8,
    dataAdvantageScore: 5, networkEffectScore: 3, switchingCostScore: 4, ipScore: 6,
    acquirerPool: 1, techReadiness: 8, regulatoryRisk: 3,
    expectedDilution: 0, dividendYield: 0.0278, buybackYield: 0.02,
    // ADR price $192.84 corresponds to a bundle of local shares; using the local
    // share count (13.03B) requires the local-equivalent price (~$17.9) so observed
    // market cap resolves to the true ~$233B, not $2.5T.
    sharePrice: 17.88, sharesOutstanding: 13_030e6,
    terminalGrowth: 0.02, projectionYears: 7,
  },
  {
    // Denmark — GLP-1 pharma leader (Ozempic/Wegovy), high margin, stock recently
    // derated on competition fears. Revenue converted DKK->USD. Commercial-biopharma.
    companyName: "Novo Nordisk (DK)",
    sector: "Biotech Therapeutics",
    businessModel: "Manufacturing / Production",
    tags: ["IP / Licensing", "Regulated Approval Path", "Brand / Consumer Staples"],
    lifecycleStage: "Late-Stage Growth",
    capitalStatus: "Public",
    profitabilityStatus: "FCF Positive",
    tam: 300e9, sam: 150e9,
    revenue: 47_500e6, revenueGrowth: 0.081, sectorCagr: 0.10,
    grossMargin: 0.82, opexRatio: 0.37, capexPct: 0.10, marginChangeYoy: 0.04,
    cash: 3_340e6, debt: 22_580e6,
    recurringRevenuePct: 0.65, nrr: 1.05, churn: 0.02,
    competitorCount: 3, competitorEvRevenue: 8, competitorEvEbitda: 20, competitorEvFcf: 30,
    competitorRevenueGrowth: 0.15, competitorGrossMargin: 0.78, competitorEbitdaMargin: 0.40,
    clientType: "Mixed / Multiple", brandGeographicReach: "Global",
    yearsOperating: 102, targetMarketRecognitionPct: 0.7, customerTrustScore: 8,
    purchaseFrequency: 8, missionCriticality: 9, consumerHabitStrength: 6, institutionalReliance: 7,
    competitionIntensity: 3, managementScore: 8, moatScore: 9, gtmScore: 8,
    dataAdvantageScore: 6, networkEffectScore: 3, switchingCostScore: 7, ipScore: 10,
    acquirerPool: 2, techReadiness: 9, regulatoryRisk: 4,
    expectedDilution: 0, dividendYield: 0.0249, buybackYield: 0.02,
    sharePrice: 51.58, sharesOutstanding: 4_440e6,
    terminalGrowth: 0.035, projectionYears: 8,
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
const cv = (a) => Math.sqrt(variance(a)) / mean(a)

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

console.log("\n=== SIGNAL / DURABILITY + REGIME READOUT ===\n")
console.log(pad("Company", 20), padl("brandDur", 9), padl("brandRel", 9), padl("moat", 6), padl("durability", 11), padl("asset regime", 24), padl("confid", 7))
for (const { r } of results) {
  const s = r.ledger.signals
  console.log(
    pad(r.input.companyName, 20),
    padl(pct(s.brandDurability.effective), 9),
    padl(pct(r.context.brand.relevance), 9),
    padl(pct(s.moatStrength.effective), 6),
    padl(pct(s.durability.effective), 11),
    padl(r.tracks.asset.paths.regime || (r.context.modules.financial ? "bank book/ROE" : "general backing"), 24),
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
  console.log(pad(r.input.companyName, 20), ...shares.map((v) => padl(pct(v, 0), 9)), padl((fairEV / r.input.revenue).toFixed(1) + "x", 11))
}

console.log("\n=== ATTRIBUTION A: applied EV/revenue multiple ===\n")
const logMult = results.map(({ r }) => Math.log(r.multiples.evRevenue))
const factorNames = ["companyMultipleFactor", "scaleMultipleFactor", "tagBudgetMultiplier", "softwareDurabilityGate"]
const factorLogs = {}
for (const f of factorNames) factorLogs[f] = results.map(({ r }) => Math.log(f === "softwareDurabilityGate" ? r.multiples.softwareDurabilityGate : r.ledger.budgets[f]))
factorLogs["sectorBase+positioning(residual)"] = results.map(({ r }, i) => logMult[i] - factorNames.reduce((s, f) => s + factorLogs[f][i], 0))
const totalVar = variance(logMult)
console.log(`Applied EV/revenue: ${results.map(({ r }) => r.multiples.evRevenue.toFixed(1) + "x").join(", ")}`)
console.log(`CV of applied multiple: ${pct(cv(results.map(({ r }) => r.multiples.evRevenue)), 1)}   Var(log) = ${totalVar.toFixed(4)}\n`)
console.log(pad("Factor", 38), padl("Var(logf)", 11), padl("Contribution", 14))
const contribRows = Object.entries(factorLogs).map(([name, logs]) => ({ name, v: variance(logs), contrib: cov(logs, logMult) / totalVar }))
contribRows.sort((a, b) => b.contrib - a.contrib)
for (const { name, v, contrib } of contribRows) console.log(pad(name, 38), padl(v.toFixed(4), 11), padl(pct(contrib, 1), 14))

console.log("\n=== ATTRIBUTION B: final fair EV/revenue vs building blocks ===\n")
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
const stageRows = Object.entries(stages).map(([name, logs]) => ({ name, v: variance(logs), corr: cov(logs, logFair) / Math.sqrt(variance(logs) * totalVarFair), share: cov(logs, logFair) / totalVarFair }))
stageRows.sort((a, b) => b.share - a.share)
for (const { name, v, corr, share } of stageRows) console.log(pad(name, 26), padl(v.toFixed(4), 10), padl(corr.toFixed(2), 14), padl(pct(share, 0), 15))

console.log("")

export { COMPANIES }
