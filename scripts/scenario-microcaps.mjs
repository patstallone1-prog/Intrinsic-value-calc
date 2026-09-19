// 10 new companies — 5 quality microcaps + 5 larger names across geographies —
// with real figures pulled 2026-07-30. Non-USD reporters converted to USD
// (EUR 1.08, CAD 0.73). Run: node scripts/scenario-microcaps.mjs
import { computeValuation } from "../src/valuationEngine.js"

const COMPANIES = [
  {
    // MICROCAP — US franchise/royalty (Plato's Closet, Once Upon a Child). Capital-light,
    // ~96% gross, 137% ROIC. The purest "quality compounder" economics in the set.
    companyName: "Winmark",
    sector: "Local / Traditional Services", businessModel: "Franchise / Multi-Location Operator",
    tags: ["Subscription / Recurring Revenue", "Multi-Location / Local Footprint", "IP / Licensing"],
    lifecycleStage: "Profitable / Mature", capitalStatus: "Public", profitabilityStatus: "FCF Positive",
    tam: 50e9, sam: 10e9,
    revenue: 86.5e6, revenueGrowth: 0.04, sectorCagr: 0.03,
    grossMargin: 0.97, opexRatio: 0.35, capexPct: 0.005,
    cash: 25.8e6, debt: 62.7e6, roe: 0.9,
    recurringRevenuePct: 0.9, nrr: 1.0, churn: 0.03,
    competitorCount: 2, competitorEvRevenue: 4, competitorEvEbitda: 12,
    competitorRevenueGrowth: 0.03, competitorGrossMargin: 0.8, competitorEbitdaMargin: 0.4,
    clientType: "Enterprise / Business", brandGeographicReach: "National",
    yearsOperating: 37, targetMarketRecognitionPct: 0.5, customerTrustScore: 8,
    purchaseFrequency: 6, missionCriticality: 6, institutionalReliance: 7, consumerHabitStrength: 5,
    competitionIntensity: 2, managementScore: 9, moatScore: 8, gtmScore: 8,
    dataAdvantageScore: 4, networkEffectScore: 4, switchingCostScore: 8, ipScore: 6,
    acquirerPool: 2, techReadiness: 7, regulatoryRisk: 1,
    expectedDilution: 0, dividendYield: 0.0421, buybackYield: 0.02,
    sharePrice: 331.35, sharesOutstanding: 3.59e6, terminalGrowth: 0.025, projectionYears: 7,
  },
  {
    // MICROCAP — US spintronics sensors. Niche IP moat, ~79% gross, 58% net, reaccelerating.
    companyName: "NVE Corp",
    sector: "Industrial / Robotics / Automation", businessModel: "Tools / Devices / Equipment",
    tags: ["Hardware Sales", "IP / Licensing"],
    lifecycleStage: "Late-Stage Growth", capitalStatus: "Public", profitabilityStatus: "FCF Positive",
    tam: 5e9, sam: 1e9,
    revenue: 31.3e6, revenueGrowth: 0.24, sectorCagr: 0.10,
    grossMargin: 0.79, opexRatio: 0.17, capexPct: 0.02,
    cash: 21.8e6, debt: 0.9e6, roe: 0.30,
    recurringRevenuePct: 0.2, nrr: 1.0, churn: 0.05,
    competitorCount: 3, competitorEvRevenue: 6, competitorEvEbitda: 18,
    competitorRevenueGrowth: 0.12, competitorGrossMargin: 0.55, competitorEbitdaMargin: 0.3,
    clientType: "Enterprise / Business", brandGeographicReach: "Global",
    yearsOperating: 36, targetMarketRecognitionPct: 0.3, customerTrustScore: 7,
    purchaseFrequency: 5, missionCriticality: 7, institutionalReliance: 6, consumerHabitStrength: 2,
    competitionIntensity: 2, managementScore: 8, moatScore: 7, gtmScore: 6,
    dataAdvantageScore: 4, networkEffectScore: 2, switchingCostScore: 6, ipScore: 8,
    acquirerPool: 3, techReadiness: 8, regulatoryRisk: 2,
    expectedDilution: 0, dividendYield: 0.0348, buybackYield: 0,
    sharePrice: 114.82, sharesOutstanding: 4.84e6, terminalGrowth: 0.03, projectionYears: 8,
  },
  {
    // MICROCAP — US niche medical devices (neonatal/gyn). Declining revenue but ~40% of
    // market cap is net cash — a value/quality test of the net-cash bridge.
    companyName: "Utah Medical",
    sector: "Medical Devices", businessModel: "Tools / Devices / Equipment",
    tags: ["Consumables / Attachments", "Regulated Approval Path"],
    lifecycleStage: "Profitable / Mature", capitalStatus: "Public", profitabilityStatus: "FCF Positive",
    tam: 5e9, sam: 1e9,
    revenue: 36.1e6, revenueGrowth: -0.07, sectorCagr: 0.05,
    grossMargin: 0.57, opexRatio: 0.28, capexPct: 0.02,
    cash: 87.5e6, debt: 0.2e6, roe: 0.0875,
    recurringRevenuePct: 0.5, nrr: 1.0, churn: 0.03,
    competitorCount: 4, competitorEvRevenue: 4, competitorEvEbitda: 14,
    competitorRevenueGrowth: 0.05, competitorGrossMargin: 0.6, competitorEbitdaMargin: 0.25,
    clientType: "Hospitals / Healthcare Providers", brandGeographicReach: "Global",
    yearsOperating: 48, targetMarketRecognitionPct: 0.3, customerTrustScore: 7,
    purchaseFrequency: 6, missionCriticality: 7, institutionalReliance: 6, consumerHabitStrength: 2,
    competitionIntensity: 3, managementScore: 7, moatScore: 6, gtmScore: 6,
    dataAdvantageScore: 3, networkEffectScore: 2, switchingCostScore: 6, ipScore: 6,
    acquirerPool: 3, techReadiness: 8, regulatoryRisk: 3,
    expectedDilution: 0, dividendYield: 0.0178, buybackYield: 0.01,
    sharePrice: 69.57, sharesOutstanding: 3.18e6, terminalGrowth: 0.02, projectionYears: 7,
  },
  {
    // SMALL-CAP — US title insurer. Balance-sheet business → bank book/ROE regime. Trades ~2x book.
    companyName: "Investors Title",
    sector: "Fintech / Financial Services", businessModel: "Financial / Balance-Sheet Business",
    tags: ["Regulated Approval Path"],
    lifecycleStage: "Profitable / Mature", capitalStatus: "Public", profitabilityStatus: "FCF Positive",
    tam: 20e9, sam: 5e9,
    revenue: 280e6, revenueGrowth: 0.07, sectorCagr: 0.04,
    grossMargin: 0.98, opexRatio: 0.83, capexPct: 0.01,
    cash: 85e6, debt: 8.7e6, tangibleBookValue: 270e6, assetBackingValue: 273e6, roe: 0.144, rotce: 0.15,
    recurringRevenuePct: 0.4, nrr: 1.0, churn: 0.05,
    competitorCount: 4, competitorPe: 12, competitorEvRevenue: 1.5, competitorNetMargin: 0.1,
    competitorRevenueGrowth: 0.04, competitorGrossMargin: 0.98, competitorEbitdaMargin: 0.15,
    clientType: "Mixed / Multiple", brandGeographicReach: "Regional",
    yearsOperating: 50, targetMarketRecognitionPct: 0.3, customerTrustScore: 7,
    purchaseFrequency: 3, missionCriticality: 6, institutionalReliance: 6, consumerHabitStrength: 3,
    competitionIntensity: 3, managementScore: 8, moatScore: 6, gtmScore: 6,
    dataAdvantageScore: 4, networkEffectScore: 3, switchingCostScore: 4, ipScore: 3,
    acquirerPool: 3, techReadiness: 6, regulatoryRisk: 3,
    expectedDilution: 0, dividendYield: 0.0364, buybackYield: 0.01,
    sharePrice: 290.01, sharesOutstanding: 1.89e6, terminalGrowth: 0.03, projectionYears: 7,
  },
  {
    // SMALL-CAP — US oil & gas mineral royalties. ~94% gross, ~76% FCF, 10.4% yield, no capex.
    companyName: "Dorchester Minerals",
    sector: "Advanced Materials / Chemicals", businessModel: "IP / Licensing / Royalty",
    tags: ["IP / Licensing"],
    lifecycleStage: "Profitable / Mature", capitalStatus: "Public", profitabilityStatus: "FCF Positive",
    tam: 100e9, sam: 20e9,
    revenue: 163e6, revenueGrowth: -0.025, sectorCagr: 0.02,
    grossMargin: 0.94, opexRatio: 0.52, capexPct: 0.005,
    cash: 28e6, debt: 0.7e6, roe: 0.215,
    recurringRevenuePct: 0.3, nrr: 1.0, churn: 0.02,
    competitorCount: 3, competitorEvRevenue: 6, competitorEvEbitda: 10,
    competitorRevenueGrowth: 0, competitorGrossMargin: 0.9, competitorEbitdaMargin: 0.5,
    clientType: "Enterprise / Business", brandGeographicReach: "National",
    yearsOperating: 22, targetMarketRecognitionPct: 0.2, customerTrustScore: 6,
    purchaseFrequency: 5, missionCriticality: 5, institutionalReliance: 5, consumerHabitStrength: 2,
    competitionIntensity: 3, managementScore: 8, moatScore: 6, gtmScore: 5,
    dataAdvantageScore: 3, networkEffectScore: 2, switchingCostScore: 3, ipScore: 5,
    acquirerPool: 2, techReadiness: 6, regulatoryRisk: 3,
    expectedDilution: 0, dividendYield: 0.1038, buybackYield: 0,
    sharePrice: 26.95, sharesOutstanding: 48.26e6, terminalGrowth: 0.01, projectionYears: 7,
  },
  {
    // Canada — vertical-market-software serial acquirer, quality compounder. Low gross margin
    // (services/acquired mix) but ~22% FCF. Market converted CAD->USD; revenue is USD.
    companyName: "Constellation Sw (CA)",
    sector: "SaaS / Enterprise Software", businessModel: "Software / Subscription",
    tags: ["Subscription / Recurring Revenue", "Data / AI Advantage"],
    lifecycleStage: "Late-Stage Growth", capitalStatus: "Public", profitabilityStatus: "FCF Positive",
    tam: 500e9, sam: 150e9,
    revenue: 12_150e6, revenueGrowth: 0.17, sectorCagr: 0.10,
    grossMargin: 0.37, opexRatio: 0.13, capexPct: 0.01,
    cash: 3_070e6, debt: 5_660e6, roe: 0.197,
    recurringRevenuePct: 0.85, nrr: 1.05, churn: 0.02,
    competitorCount: 4, competitorEvRevenue: 6, competitorEvEbitda: 20,
    competitorRevenueGrowth: 0.12, competitorGrossMargin: 0.55, competitorEbitdaMargin: 0.3,
    clientType: "Enterprise / Business", brandGeographicReach: "Global",
    yearsOperating: 30, targetMarketRecognitionPct: 0.4, customerTrustScore: 8,
    purchaseFrequency: 8, missionCriticality: 8, institutionalReliance: 8, consumerHabitStrength: 3,
    competitionIntensity: 2, managementScore: 9, moatScore: 8, gtmScore: 8,
    dataAdvantageScore: 6, networkEffectScore: 3, switchingCostScore: 9, ipScore: 6,
    acquirerPool: 1, techReadiness: 8, regulatoryRisk: 2,
    expectedDilution: 0, dividendYield: 0.005, buybackYield: 0,
    sharePrice: 2205, sharesOutstanding: 21.19e6, terminalGrowth: 0.04, projectionYears: 8,
  },
  {
    // LatAm (Brazil/Argentina/Mexico) — e-commerce + fintech, 42% growth. Emerging-market
    // jurisdiction test (State solidity between rule-of-law and China).
    companyName: "MercadoLibre (LatAm)",
    sector: "Consumer Internet / Media / Gaming", businessModel: "Marketplace / Network Platform",
    tags: ["Marketplace / Two-Sided Network", "Transaction-Based", "Data / AI Advantage"],
    lifecycleStage: "Late-Stage Growth", capitalStatus: "Public", profitabilityStatus: "FCF Positive",
    tam: 500e9, sam: 150e9,
    revenue: 31_803e6, revenueGrowth: 0.42, sectorCagr: 0.15,
    grossMargin: 0.44, opexRatio: 0.32, capexPct: 0.03, marginChangeYoy: 0.02,
    cash: 5_660e6, debt: 12_380e6, roe: 0.40,
    recurringRevenuePct: 0.4, nrr: 1.1, churn: 0.05,
    competitorCount: 4, competitorEvRevenue: 3, competitorEvEbitda: 20,
    competitorRevenueGrowth: 0.20, competitorGrossMargin: 0.45, competitorEbitdaMargin: 0.15,
    clientType: "Consumers", brandGeographicReach: "Global",
    governanceRegime: "Stable Democracy / Reforming", governmentPosture: "Neutral / Market",
    yearsOperating: 26, targetMarketRecognitionPct: 0.7, customerTrustScore: 7,
    purchaseFrequency: 7, missionCriticality: 5, institutionalReliance: 4, consumerHabitStrength: 7,
    competitionIntensity: 4, managementScore: 9, moatScore: 8, gtmScore: 8,
    dataAdvantageScore: 8, networkEffectScore: 9, switchingCostScore: 6, ipScore: 4,
    acquirerPool: 2, techReadiness: 9, regulatoryRisk: 4,
    expectedDilution: 0, dividendYield: 0, buybackYield: 0,
    sharePrice: 1885.73, sharesOutstanding: 50.70e6, terminalGrowth: 0.04, projectionYears: 8,
  },
  {
    // US — online salvage-vehicle auction marketplace. Two-sided network + irreplaceable yards,
    // ~37% op margin, but stock recently derated ~36%.
    companyName: "Copart",
    sector: "Consumer Internet / Media / Gaming", businessModel: "Marketplace / Network Platform",
    tags: ["Marketplace / Two-Sided Network", "Asset-Heavy Infrastructure"],
    lifecycleStage: "Profitable / Mature", capitalStatus: "Public", profitabilityStatus: "FCF Positive",
    tam: 100e9, sam: 30e9,
    revenue: 4_639e6, revenueGrowth: 0.01, sectorCagr: 0.06,
    grossMargin: 0.47, opexRatio: 0.10, capexPct: 0.10,
    cash: 4_200e6, debt: 93e6, assetBackingValue: 3_000e6, tangibleBookValue: 5_000e6, roe: 0.176,
    recurringRevenuePct: 0.7, nrr: 1.05, churn: 0.03,
    competitorCount: 2, competitorEvRevenue: 5, competitorEvEbitda: 15,
    competitorRevenueGrowth: 0.05, competitorGrossMargin: 0.45, competitorEbitdaMargin: 0.3,
    clientType: "Enterprise / Business", brandGeographicReach: "Global",
    yearsOperating: 44, targetMarketRecognitionPct: 0.5, customerTrustScore: 7,
    purchaseFrequency: 7, missionCriticality: 6, institutionalReliance: 7, consumerHabitStrength: 4,
    competitionIntensity: 2, managementScore: 8, moatScore: 9, gtmScore: 7,
    dataAdvantageScore: 6, networkEffectScore: 8, switchingCostScore: 7, ipScore: 4,
    acquirerPool: 1, techReadiness: 8, regulatoryRisk: 2,
    expectedDilution: 0, dividendYield: 0, buybackYield: 0.01,
    sharePrice: 29.57, sharesOutstanding: 925.81e6, terminalGrowth: 0.035, projectionYears: 8,
  },
  {
    // US — premium less-than-truckload freight carrier. Best-in-class service and margins;
    // asset-heavy but valued on earnings, so modeled as a service operator, not the rate-base regime.
    companyName: "Old Dominion",
    sector: "Logistics / Supply Chain", businessModel: "Services / Labor-Based",
    tags: ["Multi-Location / Local Footprint"],
    lifecycleStage: "Profitable / Mature", capitalStatus: "Public", profitabilityStatus: "FCF Positive",
    tam: 60e9, sam: 20e9,
    revenue: 5_603e6, revenueGrowth: -0.006, sectorCagr: 0.04,
    grossMargin: 0.40, opexRatio: 0.14, capexPct: 0.07, marginChangeYoy: 0.01,
    cash: 284e6, debt: 20e6, roe: 0.248,
    ar: 600e6, ap: 200e6,
    recurringRevenuePct: 0.6, nrr: 1.0, churn: 0.03,
    competitorCount: 4, competitorEvRevenue: 2, competitorEvEbitda: 12,
    competitorRevenueGrowth: 0.02, competitorGrossMargin: 0.35, competitorEbitdaMargin: 0.2,
    clientType: "Enterprise / Business", brandGeographicReach: "National",
    yearsOperating: 90, targetMarketRecognitionPct: 0.5, customerTrustScore: 8,
    purchaseFrequency: 7, missionCriticality: 6, institutionalReliance: 6, consumerHabitStrength: 4,
    competitionIntensity: 3, managementScore: 9, moatScore: 8, gtmScore: 8,
    dataAdvantageScore: 5, networkEffectScore: 5, switchingCostScore: 5, ipScore: 3,
    acquirerPool: 2, techReadiness: 7, regulatoryRisk: 2,
    expectedDilution: 0, dividendYield: 0.0055, buybackYield: 0.03,
    sharePrice: 212.47, sharesOutstanding: 207.97e6, terminalGrowth: 0.03, projectionYears: 7,
  },
  {
    // Sweden — audio streaming subscription, 90%+ recurring. Structurally low gross margin
    // (~32%, label royalties) with margins now improving. Revenue converted EUR->USD.
    companyName: "Spotify (SE)",
    sector: "Consumer Internet / Media / Gaming", businessModel: "Software / Subscription",
    tags: ["Subscription / Recurring Revenue", "Advertising / Attention-Based", "Brand / Consumer Staples"],
    lifecycleStage: "Late-Stage Growth", capitalStatus: "Public", profitabilityStatus: "FCF Positive",
    tam: 100e9, sam: 40e9,
    revenue: 18_930e6, revenueGrowth: 0.08, sectorCagr: 0.10,
    grossMargin: 0.32, opexRatio: 0.18, capexPct: 0.005, marginChangeYoy: 0.03,
    cash: 7_260e6, debt: 549e6, roe: 0.25,
    recurringRevenuePct: 0.9, nrr: 1.05, churn: 0.03,
    competitorCount: 3, competitorEvRevenue: 4, competitorEvEbitda: 25,
    competitorRevenueGrowth: 0.10, competitorGrossMargin: 0.4, competitorEbitdaMargin: 0.15,
    clientType: "Consumers", brandGeographicReach: "Global",
    yearsOperating: 19, targetMarketRecognitionPct: 0.85, customerTrustScore: 7,
    purchaseFrequency: 9, missionCriticality: 3, institutionalReliance: 2, consumerHabitStrength: 8,
    competitionIntensity: 4, managementScore: 8, moatScore: 7, gtmScore: 8,
    dataAdvantageScore: 7, networkEffectScore: 5, switchingCostScore: 5, ipScore: 3,
    acquirerPool: 2, techReadiness: 9, regulatoryRisk: 2,
    expectedDilution: 0.02, dividendYield: 0, buybackYield: 0,
    sharePrice: 522.61, sharesOutstanding: 205.62e6, terminalGrowth: 0.04, projectionYears: 8,
  },
]

const B = (x) => (Math.abs(x) >= 1e9 ? (x / 1e9).toFixed(1) + "B" : (x / 1e6).toFixed(0) + "M")
const pct = (x, d = 0) => (x * 100).toFixed(d) + "%"
const pad = (s, n) => String(s).padEnd(n)
const padl = (s, n) => String(s).padStart(n)
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length

const results = COMPANIES.map((c) => ({ c, r: computeValuation(c) }))

console.log("\n=== VALUATION RESULTS (10 new incl. quality microcaps, 2026-07-30) ===\n")
console.log(pad("Company", 22), padl("Fair equity", 12), padl("Range", 18), padl("Obs cap", 9), padl("Fair vs obs", 12), padl("Disc", 6))
for (const { r } of results) {
  const obs = r.tracks.market.paths.observedEquity
  const diff = obs > 0 ? pct((r.outputs.fairCommonEquity - obs) / obs, 0) : "n/a"
  console.log(pad(r.input.companyName, 22), padl(B(r.outputs.fairCommonEquity), 12), padl(`${B(r.bands.final.low)}-${B(r.bands.final.high)}`, 18), padl(B(obs), 9), padl(diff, 12), padl(pct(r.discount.rate, 1), 6))
}

console.log("\n=== SIGNALS: brand / capital-returns / durability / regime / multiple ===\n")
console.log(pad("Company", 22), padl("brandDur", 9), padl("capRet", 8), padl("durabty", 8), padl("fcfMgn", 7), padl("asset regime", 22), padl("fairEV/rev", 11))
for (const { r } of results) {
  const s = r.ledger.signals
  const regime = r.tracks.asset.paths.regime || (r.context.modules.financial ? "bank" : "general")
  console.log(pad(r.input.companyName, 22), padl(pct(s.brandDurability.effective), 9), padl(pct(s.capitalReturns.effective), 8), padl(pct(s.durability.effective), 8), padl(pct(r.margins.fcfMargin), 7), padl(regime, 22), padl((r.outputs.fairEV / r.input.revenue).toFixed(1) + "x", 11))
}

const rows = results.map(({ r }) => { const o = r.tracks.market.paths.observedEquity; return { dev: o > 0 ? (r.outputs.fairCommonEquity - o) / o : null, inBand: o > 0 && o >= r.bands.final.low && o <= r.bands.final.high } }).filter((x) => x.dev !== null)
const abs = rows.map((x) => Math.abs(x.dev)).sort((a, b) => a - b)
console.log("\n=== BATCH ACCURACY ===")
console.log(`MAPE: ${pct(mean(abs))}   median |dev|: ${pct(abs[Math.floor(abs.length / 2)])}   in modeled band: ${rows.filter((x) => x.inBand).length}/${rows.length}`)
console.log("")
