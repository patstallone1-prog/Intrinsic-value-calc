// 10 completely new companies across sectors, sizes, and geographies, with real
// figures pulled 2026-07-30. Non-USD reporters converted to USD (EUR 1.08, CHF 1.12,
// CNY 0.139). Run: node scripts/scenario-batch10.mjs
import { computeValuation } from "../src/valuationEngine.js"

const COMPANIES = [
  {
    // US — AI/accelerated-computing semiconductor + platform. Elite margins, hypergrowth.
    companyName: "NVIDIA",
    sector: "SaaS / Enterprise Software", businessModel: "Product / Hardware",
    tags: ["Data / AI Advantage", "Hardware Sales", "IP / Licensing"],
    lifecycleStage: "Late-Stage Growth", capitalStatus: "Public", profitabilityStatus: "FCF Positive",
    tam: 1_000e9, sam: 400e9,
    revenue: 253_491e6, revenueGrowth: 0.70, sectorCagr: 0.30,
    grossMargin: 0.74, opexRatio: 0.10, capexPct: 0.02,
    cash: 53_170e6, debt: 12_810e6,
    recurringRevenuePct: 0.3, nrr: 1.3, churn: 0.01,
    competitorCount: 3, competitorEvRevenue: 8, competitorEvEbitda: 25,
    competitorRevenueGrowth: 0.25, competitorGrossMargin: 0.55, competitorEbitdaMargin: 0.35,
    clientType: "Enterprise / Business", brandGeographicReach: "Global",
    yearsOperating: 33, targetMarketRecognitionPct: 0.8, customerTrustScore: 9,
    purchaseFrequency: 6, missionCriticality: 10, institutionalReliance: 8, consumerHabitStrength: 3,
    competitionIntensity: 2, managementScore: 9, moatScore: 10, gtmScore: 9,
    dataAdvantageScore: 9, networkEffectScore: 8, switchingCostScore: 9, ipScore: 10,
    acquirerPool: 1, techReadiness: 10, regulatoryRisk: 3,
    expectedDilution: 0.01, dividendYield: 0.0003, buybackYield: 0.02,
    sharePrice: 193.57, sharesOutstanding: 24_220e6, terminalGrowth: 0.04, projectionYears: 8,
  },
  {
    // US — mega-cap retailer. Very low FCF margin but high ROE (capital returns test).
    companyName: "Walmart",
    sector: "Consumer Products / Retail / E-commerce", businessModel: "Retail / Commerce / Distribution",
    tags: ["Inventory-Heavy", "Multi-Location / Local Footprint", "Brand / Consumer Staples"],
    lifecycleStage: "Profitable / Mature", capitalStatus: "Public", profitabilityStatus: "FCF Positive",
    tam: 10_000e9, sam: 2_000e9,
    revenue: 725_305e6, revenueGrowth: 0.06, sectorCagr: 0.03,
    grossMargin: 0.25, opexRatio: 0.21, capexPct: 0.039,
    cash: 10_730e6, debt: 75_550e6,
    tangibleBookValue: 70_000e6, assetBackingValue: 140_000e6, roe: 0.24,
    inventory: 60_000e6, ar: 10_000e6, ap: 60_000e6,
    recurringRevenuePct: 0.1, nrr: 1.0, churn: 0.03,
    competitorCount: 4, competitorEvRevenue: 0.9, competitorEvEbitda: 14,
    competitorRevenueGrowth: 0.05, competitorGrossMargin: 0.25, competitorEbitdaMargin: 0.06,
    clientType: "Consumers", brandGeographicReach: "National",
    yearsOperating: 64, targetMarketRecognitionPct: 0.95, customerTrustScore: 7,
    purchaseFrequency: 9, missionCriticality: 5, consumerHabitStrength: 8, institutionalReliance: 3,
    competitionIntensity: 4, managementScore: 8, moatScore: 8, gtmScore: 8,
    dataAdvantageScore: 6, networkEffectScore: 3, switchingCostScore: 3, ipScore: 3,
    acquirerPool: 1, techReadiness: 7, regulatoryRisk: 2,
    expectedDilution: 0, dividendYield: 0.0089, buybackYield: 0.02,
    sharePrice: 110.92, sharesOutstanding: 7_960e6, terminalGrowth: 0.025, projectionYears: 7,
  },
  {
    // US — payments network. Software-like economics (98% gross, 61% ROE).
    companyName: "Visa",
    sector: "Fintech / Financial Services", businessModel: "Marketplace / Network Platform",
    tags: ["Transaction-Based", "Marketplace / Two-Sided Network", "Data / AI Advantage"],
    lifecycleStage: "Profitable / Mature", capitalStatus: "Public", profitabilityStatus: "FCF Positive",
    tam: 2_000e9, sam: 500e9,
    revenue: 44_488e6, revenueGrowth: 0.14, sectorCagr: 0.08,
    grossMargin: 0.98, opexRatio: 0.37, capexPct: 0.02,
    cash: 13_790e6, debt: 23_860e6, roe: 0.61,
    recurringRevenuePct: 0.7, nrr: 1.1, churn: 0.01,
    competitorCount: 3, competitorEvRevenue: 15, competitorEvEbitda: 25,
    competitorRevenueGrowth: 0.12, competitorGrossMargin: 0.98, competitorEbitdaMargin: 0.65,
    clientType: "Mixed / Multiple", brandGeographicReach: "Global",
    yearsOperating: 67, targetMarketRecognitionPct: 0.85, customerTrustScore: 8,
    purchaseFrequency: 9, missionCriticality: 9, institutionalReliance: 7, consumerHabitStrength: 8,
    competitionIntensity: 2, managementScore: 9, moatScore: 10, gtmScore: 8,
    dataAdvantageScore: 8, networkEffectScore: 10, switchingCostScore: 8, ipScore: 6,
    acquirerPool: 1, techReadiness: 9, regulatoryRisk: 4,
    expectedDilution: 0, dividendYield: 0.0074, buybackYield: 0.03,
    sharePrice: 364.28, sharesOutstanding: 1_840e6, terminalGrowth: 0.04, projectionYears: 8,
  },
  {
    // US — integrated oil major. Cyclical, capital-heavy, moderate returns, declining rev.
    companyName: "ExxonMobil",
    sector: "Advanced Materials / Chemicals", businessModel: "Manufacturing / Production",
    tags: ["Inventory-Heavy", "Working-Capital Intensive"],
    lifecycleStage: "Profitable / Mature", capitalStatus: "Public", profitabilityStatus: "FCF Positive",
    tam: 4_000e9, sam: 1_000e9,
    revenue: 326_008e6, revenueGrowth: -0.04, sectorCagr: 0.02,
    grossMargin: 0.29, opexRatio: 0.20, capexPct: 0.089,
    cash: 8_440e6, debt: 47_660e6,
    tangibleBookValue: 260_000e6, assetBackingValue: 260_000e6, roe: 0.099,
    inventory: 25_000e6, ar: 35_000e6, ap: 45_000e6,
    recurringRevenuePct: 0.1, nrr: 1.0, churn: 0.05,
    competitorCount: 4, competitorEvRevenue: 1.2, competitorEvEbitda: 6,
    competitorRevenueGrowth: 0, competitorGrossMargin: 0.30, competitorEbitdaMargin: 0.18,
    clientType: "Mixed / Multiple", brandGeographicReach: "Global",
    yearsOperating: 140, targetMarketRecognitionPct: 0.8, customerTrustScore: 5,
    purchaseFrequency: 7, missionCriticality: 7, institutionalReliance: 5, consumerHabitStrength: 5,
    competitionIntensity: 4, managementScore: 7, moatScore: 6, gtmScore: 6,
    dataAdvantageScore: 4, networkEffectScore: 3, switchingCostScore: 2, ipScore: 4,
    acquirerPool: 1, techReadiness: 7, regulatoryRisk: 4,
    expectedDilution: 0, dividendYield: 0.0264, buybackYield: 0.03,
    sharePrice: 156.13, sharesOutstanding: 4_140e6, terminalGrowth: 0.015, projectionYears: 7,
  },
  {
    // Italy — ultra-luxury automaker. Same "manufacturing" model as Toyota but LUXURY
    // economics (26% FCF vs ~1%). The capital-returns test: this should earn a rich
    // multiple where Toyota does not. Revenue EUR->USD.
    companyName: "Ferrari (IT)",
    sector: "Consumer Products / Retail / E-commerce", businessModel: "Manufacturing / Production",
    tags: ["Brand / Consumer Staples"],
    lifecycleStage: "Profitable / Mature", capitalStatus: "Public", profitabilityStatus: "FCF Positive",
    tam: 50e9, sam: 15e9,
    revenue: 7_940e6, revenueGrowth: 0.06, sectorCagr: 0.05,
    grossMargin: 0.52, opexRatio: 0.22, capexPct: 0.10,
    cash: 2_080e6, debt: 3_350e6,
    recurringRevenuePct: 0.15, nrr: 1.0, churn: 0.01,
    competitorCount: 3, competitorEvRevenue: 5, competitorEvEbitda: 15,
    competitorRevenueGrowth: 0.05, competitorGrossMargin: 0.50, competitorEbitdaMargin: 0.30,
    clientType: "Consumers", brandGeographicReach: "Global",
    yearsOperating: 78, targetMarketRecognitionPct: 0.85, customerTrustScore: 9,
    purchaseFrequency: 2, missionCriticality: 1, consumerHabitStrength: 7, institutionalReliance: 2,
    competitionIntensity: 2, managementScore: 9, moatScore: 9, gtmScore: 8,
    dataAdvantageScore: 3, networkEffectScore: 3, switchingCostScore: 5, ipScore: 8,
    acquirerPool: 1, techReadiness: 7, regulatoryRisk: 2,
    expectedDilution: 0, dividendYield: 0.0107, buybackYield: 0.01,
    sharePrice: 397.97, sharesOutstanding: 176.05e6, terminalGrowth: 0.03, projectionYears: 8,
  },
  {
    // Canada — commerce platform (SaaS + payments). High growth, now profitable.
    companyName: "Shopify (CA)",
    sector: "SaaS / Enterprise Software", businessModel: "Software / Subscription",
    tags: ["Subscription / Recurring Revenue", "Transaction-Based", "Data / AI Advantage"],
    lifecycleStage: "Late-Stage Growth", capitalStatus: "Public", profitabilityStatus: "FCF Positive",
    tam: 200e9, sam: 80e9,
    revenue: 12_366e6, revenueGrowth: 0.32, sectorCagr: 0.15,
    grossMargin: 0.48, opexRatio: 0.35, capexPct: 0.01,
    cash: 5_740e6, debt: 179e6,
    recurringRevenuePct: 0.7, nrr: 1.1, churn: 0.03,
    competitorCount: 3, competitorEvRevenue: 7, competitorEvEbitda: 30,
    competitorRevenueGrowth: 0.2, competitorGrossMargin: 0.55, competitorEbitdaMargin: 0.15,
    clientType: "Enterprise / Business", brandGeographicReach: "Global",
    yearsOperating: 20, targetMarketRecognitionPct: 0.6, customerTrustScore: 7,
    purchaseFrequency: 8, missionCriticality: 8, institutionalReliance: 6, consumerHabitStrength: 4,
    competitionIntensity: 3, managementScore: 8, moatScore: 8, gtmScore: 8,
    dataAdvantageScore: 7, networkEffectScore: 6, switchingCostScore: 8, ipScore: 5,
    acquirerPool: 2, techReadiness: 9, regulatoryRisk: 2,
    expectedDilution: 0.02, dividendYield: 0, buybackYield: 0,
    sharePrice: 124.45, sharesOutstanding: 1_300e6, terminalGrowth: 0.04, projectionYears: 8,
  },
  {
    // Switzerland — global packaged-food staple, iconic brands, declining sales. CHF->USD.
    companyName: "Nestle (CH)",
    sector: "Consumer Products / Retail / E-commerce", businessModel: "Manufacturing / Production",
    tags: ["Brand / Consumer Staples", "Inventory-Heavy"],
    lifecycleStage: "Profitable / Mature", capitalStatus: "Public", profitabilityStatus: "FCF Positive",
    tam: 3_000e9, sam: 800e9,
    revenue: 99_400e6, revenueGrowth: -0.012, sectorCagr: 0.03,
    grossMargin: 0.46, opexRatio: 0.34, capexPct: 0.04,
    cash: 7_590e6, debt: 77_780e6, roe: 0.26,
    inventory: 12_000e6, ar: 12_000e6, ap: 20_000e6,
    recurringRevenuePct: 0.2, nrr: 1.0, churn: 0.02,
    competitorCount: 4, competitorEvRevenue: 2.5, competitorEvEbitda: 13,
    competitorRevenueGrowth: 0.02, competitorGrossMargin: 0.45, competitorEbitdaMargin: 0.20,
    clientType: "Consumers", brandGeographicReach: "Global",
    yearsOperating: 159, targetMarketRecognitionPct: 0.9, customerTrustScore: 8,
    purchaseFrequency: 8, missionCriticality: 3, consumerHabitStrength: 8, institutionalReliance: 2,
    competitionIntensity: 3, managementScore: 8, moatScore: 8, gtmScore: 8,
    dataAdvantageScore: 4, networkEffectScore: 3, switchingCostScore: 3, ipScore: 6,
    acquirerPool: 1, techReadiness: 6, regulatoryRisk: 2,
    expectedDilution: 0, dividendYield: 0.0328, buybackYield: 0.01,
    sharePrice: 102.41, sharesOutstanding: 2_533e6, terminalGrowth: 0.02, projectionYears: 7,
  },
  {
    // China — e-commerce + cloud. Beaten-down, slow growth, negative FCF (cloud/AI capex).
    // CNY->USD.
    companyName: "Alibaba (CN)",
    sector: "Consumer Internet / Media / Gaming", businessModel: "Marketplace / Network Platform",
    tags: ["Marketplace / Two-Sided Network", "Data / AI Advantage", "Advertising / Attention-Based"],
    lifecycleStage: "Late-Stage Growth", capitalStatus: "Public", profitabilityStatus: "Profitable",
    tam: 2_000e9, sam: 500e9,
    revenue: 142_290e6, revenueGrowth: 0.03, sectorCagr: 0.08,
    grossMargin: 0.40, opexRatio: 0.35, capexPct: 0.10,
    cash: 45_930e6, debt: 40_840e6,
    recurringRevenuePct: 0.4, nrr: 1.0, churn: 0.05,
    competitorCount: 4, competitorEvRevenue: 2, competitorEvEbitda: 10,
    competitorRevenueGrowth: 0.10, competitorGrossMargin: 0.40, competitorEbitdaMargin: 0.20,
    clientType: "Mixed / Multiple", brandGeographicReach: "Global",
    governanceRegime: "State Capitalist / Single-Party", governmentPosture: "Neutral / Market",
    yearsOperating: 27, targetMarketRecognitionPct: 0.7, customerTrustScore: 6,
    purchaseFrequency: 7, missionCriticality: 5, institutionalReliance: 5, consumerHabitStrength: 7,
    competitionIntensity: 4, managementScore: 8, moatScore: 8, gtmScore: 8,
    dataAdvantageScore: 8, networkEffectScore: 8, switchingCostScore: 6, ipScore: 5,
    acquirerPool: 1, techReadiness: 9, regulatoryRisk: 5,
    expectedDilution: 0, dividendYield: 0.01, buybackYield: 0.04,
    sharePrice: 115.74, sharesOutstanding: 2_280e6, terminalGrowth: 0.03, projectionYears: 7,
  },
  {
    // US — health insurance + services (Optum). Huge revenue, very low margin, mid ROE.
    companyName: "UnitedHealth",
    sector: "Healthcare Services", businessModel: "Services / Labor-Based",
    tags: ["Regulated Approval Path", "Data / AI Advantage", "Subscription / Recurring Revenue"],
    lifecycleStage: "Profitable / Mature", capitalStatus: "Public", profitabilityStatus: "FCF Positive",
    tam: 4_500e9, sam: 1_500e9,
    revenue: 450_129e6, revenueGrowth: 0.06, sectorCagr: 0.07,
    grossMargin: 0.24, opexRatio: 0.19, capexPct: 0.01,
    cash: 31_470e6, debt: 73_330e6, roe: 0.14,
    recurringRevenuePct: 0.7, nrr: 1.02, churn: 0.05,
    competitorCount: 4, competitorPe: 14, competitorEvRevenue: 0.5, competitorEvEbitda: 9,
    competitorRevenueGrowth: 0.06, competitorGrossMargin: 0.22, competitorEbitdaMargin: 0.07, competitorNetMargin: 0.04,
    clientType: "Mixed / Multiple", brandGeographicReach: "National",
    yearsOperating: 48, targetMarketRecognitionPct: 0.7, customerTrustScore: 5,
    purchaseFrequency: 8, missionCriticality: 8, institutionalReliance: 8, consumerHabitStrength: 5,
    competitionIntensity: 3, managementScore: 7, moatScore: 8, gtmScore: 7,
    dataAdvantageScore: 8, networkEffectScore: 5, switchingCostScore: 6, ipScore: 4,
    acquirerPool: 1, techReadiness: 8, regulatoryRisk: 5,
    expectedDilution: 0, dividendYield: 0.0218, buybackYield: 0.03,
    sharePrice: 425.71, sharesOutstanding: 908.14e6, terminalGrowth: 0.03, projectionYears: 7,
  },
  {
    // US — industrial logistics REIT. Asset-base operator (tests the infrastructure
    // regime for real estate): negative FCF from property capex, big rate-base-like debt.
    companyName: "Prologis (REIT)",
    sector: "Real Estate / Construction / PropTech", businessModel: "Asset-Heavy Operator",
    tags: ["Asset-Heavy Infrastructure"],
    lifecycleStage: "Profitable / Mature", capitalStatus: "Public", profitabilityStatus: "Profitable",
    tam: 2_000e9, sam: 500e9,
    revenue: 9_190e6, revenueGrowth: 0.07, sectorCagr: 0.05,
    grossMargin: 0.74, opexRatio: 0.36, capexPct: 0.53,
    cash: 1_770e6, debt: 36_440e6,
    tangibleBookValue: 58_120e6, assetBackingValue: 90_000e6, roe: 0.0775,
    recurringRevenuePct: 0.9, nrr: 1.05, churn: 0.02,
    competitorCount: 3, competitorEvRevenue: 12, competitorEvEbitda: 20,
    competitorRevenueGrowth: 0.06, competitorGrossMargin: 0.72, competitorEbitdaMargin: 0.60,
    clientType: "Enterprise / Business", brandGeographicReach: "Global",
    yearsOperating: 42, targetMarketRecognitionPct: 0.5, customerTrustScore: 7,
    purchaseFrequency: 5, missionCriticality: 7, institutionalReliance: 7, consumerHabitStrength: 2,
    competitionIntensity: 3, managementScore: 8, moatScore: 7, gtmScore: 6,
    dataAdvantageScore: 5, networkEffectScore: 4, switchingCostScore: 6, ipScore: 3,
    acquirerPool: 2, techReadiness: 6, regulatoryRisk: 3,
    expectedDilution: 0.02, dividendYield: 0.0294, buybackYield: 0,
    sharePrice: 145.48, sharesOutstanding: 953.07e6, terminalGrowth: 0.025, projectionYears: 8,
  },
]

const B = (x) => (Math.abs(x) >= 1e9 ? (x / 1e9).toFixed(1) + "B" : (x / 1e6).toFixed(0) + "M")
const pct = (x, d = 0) => (x * 100).toFixed(d) + "%"
const pad = (s, n) => String(s).padEnd(n)
const padl = (s, n) => String(s).padStart(n)
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length
const variance = (a) => { const m = mean(a); return mean(a.map((v) => (v - m) ** 2)) }
const cv = (a) => Math.sqrt(variance(a)) / mean(a)

const results = COMPANIES.map((c) => ({ c, r: computeValuation(c) }))

console.log("\n=== VALUATION RESULTS (10 new companies, 2026-07-30) ===\n")
console.log(pad("Company", 18), padl("Fair equity", 12), padl("Range", 19), padl("Obs cap", 10), padl("Fair vs obs", 12), padl("Disc", 6))
for (const { r } of results) {
  const obs = r.tracks.market.paths.observedEquity
  const diff = obs > 0 ? pct((r.outputs.fairCommonEquity - obs) / obs, 0) : "n/a"
  console.log(pad(r.input.companyName, 18), padl(B(r.outputs.fairCommonEquity), 12), padl(`${B(r.bands.final.low)}-${B(r.bands.final.high)}`, 19), padl(B(obs), 10), padl(diff, 12), padl(pct(r.discount.rate, 1), 6))
}

console.log("\n=== SIGNALS: brand vs capital-returns (orthogonal), regime, multiple ===\n")
console.log(pad("Company", 18), padl("brandDur", 9), padl("capReturns", 11), padl("durability", 11), padl("fcfMgn", 8), padl("asset regime", 22), padl("fairEV/rev", 11))
for (const { r } of results) {
  const s = r.ledger.signals
  const regime = r.tracks.asset.paths.regime || (r.context.modules.financial ? "bank" : "general")
  console.log(pad(r.input.companyName, 18), padl(pct(s.brandDurability.effective), 9), padl(pct(s.capitalReturns.effective), 11), padl(pct(s.durability.effective), 11), padl(pct(r.margins.fcfMargin), 8), padl(regime, 22), padl((r.outputs.fairEV / r.input.revenue).toFixed(1) + "x", 11))
}

const devs = results.map(({ r }) => { const o = r.tracks.market.paths.observedEquity; return o > 0 ? (r.outputs.fairCommonEquity - o) / o : null }).filter((x) => x !== null)
const inBand = results.filter(({ r }) => { const o = r.tracks.market.paths.observedEquity; return o > 0 && o >= r.bands.final.low && o <= r.bands.final.high }).length
console.log("\n=== BATCH ACCURACY ===")
console.log(`MAPE: ${pct(mean(devs.map(Math.abs)))}   median |dev|: ${pct(devs.map(Math.abs).sort((a, b) => a - b)[Math.floor(devs.length / 2)])}   in modeled band: ${inBand}/${devs.length}`)
console.log("")
