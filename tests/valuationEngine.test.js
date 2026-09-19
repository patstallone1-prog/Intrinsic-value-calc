import assert from "node:assert/strict"
import { pathToFileURL } from "node:url"
import { DEFAULT_INPUTS, FIXTURES, computeValuation, softBand } from "../src/valuationEngine.js"

function finite(value, label) {
  assert.equal(typeof value, "number", `${label} should be numeric`)
  assert.ok(Number.isFinite(value), `${label} should be finite`)
}

function runCase(name, inputs) {
  const result = computeValuation(inputs)
  finite(result.outputs.fairEV, `${name} fair EV`)
  finite(result.outputs.fairCommonEquity, `${name} common equity`)
  finite(result.discount.rate, `${name} discount rate`)
  finite(result.growth.credibility, `${name} growth credibility`)
  const trackWeightTotal = Object.values(result.final.trackWeights).reduce((sum, value) => sum + value, 0)
  assert.ok(trackWeightTotal > 0.999, `${name} independent track weights should normalize`)
  assert.ok(result.outputs.fairEV >= 0, `${name} fair EV should be non-negative`)
  return result
}

function runAll() {
const base = runCase("base", DEFAULT_INPUTS)
const unknownMarket = runCase("unknown market size", { ...DEFAULT_INPUTS, tam: 0, sam: 0, capitalStatus: "Public" })
assert.equal(unknownMarket.context.size.marketKnown, false)
assert.equal(unknownMarket.context.size.marketShare, 0)
assert.equal(unknownMarket.context.size.marketSharePosition, 0.5, "unknown market share should remain neutral")
assert.ok(unknownMarket.tracks.dcf.projections[1].revenue > unknownMarket.tracks.dcf.projections[0].revenue, "missing SAM must not freeze DCF revenue")
  const tiny = runCase("tiny hypergrowth", FIXTURES["Tiny Hypergrowth"])
  const biotech = runCase("biotech", FIXTURES["Biotech R&D"])
  const mature = runCase("mature industrial", FIXTURES["Mature Industrial"])
  const stacked = runCase("stacked story", FIXTURES["Stacked Story SaaS"])

  assert.ok(tiny.growth.credibility < 0.25, "tiny-base hypergrowth should be heavily damped")
  assert.ok(tiny.growth.effectiveGrowth < 2.5, "tiny-base headline growth should not pass through raw")
  assert.equal(biotech.probability.active, true, "biotech R&D should activate probability layers")
  assert.ok(biotech.final.trackWeights.strategic <= biotech.ledger.budgets.strategicCap + 0.001, "biotech strategic weight should obey ledger cap")
  assert.ok(mature.final.trackWeights.strategic < 0.08, "mature industrial strategic weight should stay small")

  const stackedFairRatio = stacked.outputs.fairEV / base.outputs.fairEV
  const stackedRevenueMultipleRatio = stacked.multiples.evRevenue / base.multiples.evRevenue
  assert.ok(stackedFairRatio < 1.12, "overlapping positive tags should not create runaway fair-value uplift")
  assert.ok(stackedRevenueMultipleRatio < 1.06, "overlapping positive tags should not inflate revenue multiples")
  assert.ok(stacked.ledger.capsTriggered.includes("tagStackingPressure"), "stacked tags should be visible as capped pressure")
  assert.ok(stacked.ledger.budgets.tagBudgetMultiplier <= 1, "stacked tags should consume budget instead of adding premium")
  assert.ok(stacked.final.trackWeights.strategic <= stacked.ledger.budgets.strategicCap + 0.001, "strategic final weight should obey cap")

  const scaledStacked = runCase("scaled stacked", {
    ...FIXTURES["Stacked Story SaaS"],
    revenue: 900_000_000,
    sam: 9_000_000_000,
    tam: 25_000_000_000,
    pipelineValue: 300_000_000,
    cash: 600_000_000,
    debt: 250_000_000,
    opexRatio: 0.55,
  })
  const stackedFairRevenueMultiple = stacked.outputs.fairEV / stacked.input.revenue
  const scaledFairRevenueMultiple = scaledStacked.outputs.fairEV / scaledStacked.input.revenue
  assert.ok(
    scaledFairRevenueMultiple / stackedFairRevenueMultiple < 1.18,
    "larger company scale should not amplify the same stacked factors into a widening gap"
  )

  const strategicEchoCheck = stacked.outputs.strategicEV / Math.max(stacked.tracks.strategic.rawEV, 1)
  assert.ok(strategicEchoCheck <= 1, "strategic premium should not be applied a second time after the strategic track")

  assert.ok(Math.abs(base.context.size.marketShare - base.input.revenue / base.input.sam) < 0.0001, "size context should calculate market share from revenue and SAM")
  assert.ok(base.ledger.signals.sizeEvidence.effective > 0, "size should be exposed as a ledger signal")

  const privateAnchor = runCase("private anchor", {
    ...DEFAULT_INPUTS,
    capitalStatus: "Series B",
    revenue: 60_000_000,
    sam: 4_000_000_000,
    tam: 12_000_000_000,
  })
  const publicAnchor = runCase("public anchor", {
    ...privateAnchor.input,
    capitalStatus: "Public",
    sharePrice: 20,
    sharesOutstanding: 100_000_000,
  })
  assert.ok(publicAnchor.context.size.listingScaleAnchor > privateAnchor.context.size.listingScaleAnchor, "public/private input should feed size context")
  assert.ok(publicAnchor.final.weights.market > privateAnchor.final.weights.market, "public anchor should increase market-track trust")
  assert.ok(publicAnchor.tracks.market.paths.observedEquity > 0, "public share inputs should produce observed market equity")
  assert.ok(publicAnchor.tracks.market.paths.publicEvidenceWeight > 0, "public market evidence should enter the market track with visible weight")
  assert.ok(publicAnchor.tracks.publicMarket.rawEV > 0, "public market evidence should be an independent track")
  assert.ok(publicAnchor.marketComparison, "public market inputs should produce a market comparison")

  const maturePublicDcf = runCase("mature public DCF", {
    ...DEFAULT_INPUTS,
    capitalStatus: "Public",
    lifecycleStage: "Profitable / Mature",
    profitabilityStatus: "FCF Positive",
    revenueGrowth: 0.05,
    grossMargin: 0.55,
    opexRatio: 0.28,
    capexPct: 0.02,
    sharePrice: 20,
    sharesOutstanding: 100_000_000,
  })
  assert.ok(maturePublicDcf.discount.rate < 0.13, "healthy mature public companies should use a lower DCF discount rate")
  assert.ok(maturePublicDcf.final.trackWeights.dcf > 0.2, "DCF should matter for mature healthy public companies")

  const directCompsCase = runCase("direct competitor comps", {
    ...DEFAULT_INPUTS,
    competitorCount: 5,
    competitorEvRevenue: 8,
    competitorEvEbitda: 20,
    competitorEvFcf: 28,
    competitorRevenueGrowth: 0.3,
    competitorGrossMargin: 0.7,
    competitorEbitdaMargin: 0.2,
  })
  assert.ok(directCompsCase.tracks.directComps.active, "direct competitor track should activate when competitor inputs are supplied")
  assert.ok(directCompsCase.final.trackWeights.directComps > 0, "active direct comps should receive an independent final weight")

  const justifiedPremiumCase = runCase("justified market multiple premium", {
    ...DEFAULT_INPUTS,
    capitalStatus: "Public",
    lifecycleStage: "Profitable / Mature",
    profitabilityStatus: "FCF Positive",
    revenue: 1_000_000_000,
    revenueGrowth: 0.16,
    grossMargin: 0.72,
    opexRatio: 0.34,
    cash: 250_000_000,
    debt: 50_000_000,
    capexPct: 0.025,
    sharePrice: 30,
    sharesOutstanding: 200_000_000,
    eps: 1.8,
    competitorCount: 6,
    competitorEvRevenue: 4.5,
    competitorEvEbitda: 16,
    competitorEvFcf: 21,
    competitorPe: 22,
    competitorRevenueGrowth: 0.08,
    competitorGrossMargin: 0.58,
    competitorEbitdaMargin: 0.22,
    competitorNetMargin: 0.12,
    competitorNetDebtRevenue: 0.6,
  })
  const unsupportedPremiumCase = runCase("unsupported market multiple premium", {
    ...justifiedPremiumCase.input,
    grossMargin: 0.48,
    opexRatio: 0.38,
    cash: 30_000_000,
    debt: 1_400_000_000,
    revenueGrowth: 0.03,
    sharePrice: 48,
    eps: 0.35,
  })
  assert.ok(justifiedPremiumCase.tracks.market.paths.financialComparison.observed.evRevenue > 0, "public inputs should calculate current EV / revenue")
  assert.ok(justifiedPremiumCase.tracks.market.paths.financialComparison.observed.pe > 0, "public inputs should calculate current P/E from EPS or net income")
  assert.ok(justifiedPremiumCase.ledger.signals.coreFinancialJustification.effective > unsupportedPremiumCase.ledger.signals.coreFinancialJustification.effective, "better margins and lower debt than peers should lift core financial justification")
  assert.ok(unsupportedPremiumCase.ledger.signals.marketMultiplePressure.effective > justifiedPremiumCase.ledger.signals.marketMultiplePressure.effective, "an expensive trading multiple without superior financials should create pressure")
  assert.ok(justifiedPremiumCase.final.weights.market > 0.45, "core financial and multiple evidence should carry the valuation center for mature public companies")

  const marginImprovementCase = runCase("DCF margin improvement", {
    ...DEFAULT_INPUTS,
    capitalStatus: "Public",
    lifecycleStage: "Scaling",
    profitabilityStatus: "Revenue-Generating / Unprofitable",
    tam: 50_000_000_000,
    sam: 10_000_000_000,
    revenue: 2_000_000_000,
    revenueGrowth: 0.18,
    grossMargin: 0.55,
    opexRatio: 0.56,
    capexPct: 0.04,
    marginChangeYoy: 0.06,
  })
  const mt = marginImprovementCase.tracks.dcf.marginTrajectory
  assert.ok(marginImprovementCase.tracks.dcf.rawEV > 0, "rebuilt DCF should produce a positive value for an unprofitable-but-scaling company (converging to mature margins)")
  assert.ok(mt.marginBoostEligible, "only unprofitable or near-breakeven companies should qualify for margin-improvement eligibility")
  assert.ok(mt.matureMargin > mt.startMargin, "an unprofitable company should converge from its current negative margin up toward a positive mature margin")
  assert.ok(mt.matureMargin <= marginImprovementCase.tracks.dcf.marginTrajectory.marginCeiling + 0.0001, "mature margin cannot exceed the durability-aware ceiling")
  const proj = marginImprovementCase.tracks.dcf.projections
  assert.ok(proj.at(-1).fcfMargin > proj[0].fcfMargin, "margin should ramp upward across the explicit projection")
  assert.ok(
    proj.at(-1).fcfMargin - proj.at(-2).fcfMargin < proj[1].fcfMargin - proj[0].fcfMargin + 1e-9,
    "margin convergence increments should shrink farther into the projection"
  )

  const profitableMarginTrendCase = runCase("profitable DCF margin trend ignored", {
    ...marginImprovementCase.input,
    profitabilityStatus: "Profitable",
    lifecycleStage: "Late-Stage Growth",
    opexRatio: 0.4,
  })
  const pmt = profitableMarginTrendCase.tracks.dcf.marginTrajectory
  assert.equal(pmt.marginBoostEligible, false, "profitable companies should not be flagged margin-boost eligible")
  assert.ok(pmt.startMargin > 0, "the profitable test case should have a positive demonstrated FCF margin")
  assert.ok(pmt.matureMargin < pmt.marginCeiling, "a profitable company should not have its mature margin jump straight to the sector ceiling")
  assert.ok(
    pmt.matureMargin - pmt.startMargin < (pmt.marginCeiling - pmt.startMargin) * 0.6,
    "a profitable company's mature margin should stay closer to its demonstrated margin than to the ceiling"
  )

  const negativeMarginTrendCase = runCase("declining DCF margin trend", {
    ...marginImprovementCase.input,
    profitabilityStatus: "Profitable",
    revenueGrowth: -0.05,
    marginChangeYoy: -0.08,
  })
  const neutralMarginTrendCase = runCase("neutral DCF margin trend", {
    ...negativeMarginTrendCase.input,
    marginChangeYoy: 0,
  })
  assert.ok(negativeMarginTrendCase.tracks.dcf.marginTrajectory.declining, "negative YoY margin change should mark the DCF path as declining")
  assert.ok(
    negativeMarginTrendCase.tracks.dcf.marginTrajectory.matureMargin <= negativeMarginTrendCase.tracks.dcf.marginTrajectory.startMargin + 1e-9,
    "a compressing company should not be credited with margin expansion in the DCF"
  )
  assert.ok(
    Math.abs(negativeMarginTrendCase.multiples.evRevenue - neutralMarginTrendCase.multiples.evRevenue) < 0.0001,
    "YoY margin change should affect the DCF path only and not duplicate downside through market multiples"
  )

  const retailMembershipCase = runCase("retail membership blend", {
    ...DEFAULT_INPUTS,
    sector: "Consumer Products / Retail / E-commerce",
    businessModel: "Retail / Commerce / Distribution",
    tags: ["Subscription / Recurring Revenue", "Inventory-Heavy", "Multi-Location / Local Footprint", "Brand / Consumer Staples"],
    capitalStatus: "Public",
    lifecycleStage: "Profitable / Mature",
    profitabilityStatus: "FCF Positive",
    revenue: 1_000_000_000,
    grossMargin: 0.1,
    retailRevenuePct: 0.9,
    retailGrossMargin: 0.1,
    subscriptionRevenuePct: 0.1,
    subscriptionGrossMargin: 0.95,
    opexRatio: 0.08,
    capexPct: 0.025,
    assetBackingValue: 180_000_000,
    asset1Type: "Land / Owned Real Estate",
    asset1Value: 82_000_000,
    asset2Type: "Fleet / Trucks / Vehicles",
    asset2Value: 8_000_000,
    competitionIntensity: 1.4,
    moatScore: 8,
    switchingCostScore: 8,
  })
  assert.equal(retailMembershipCase.margins.marginBlendActive, true, "retail/subscription margin mix should activate blended gross margin")
  assert.ok(retailMembershipCase.margins.grossMargin > retailMembershipCase.input.grossMargin, "subscription margin should lift blended gross margin above the fallback entry")
  assert.ok(retailMembershipCase.ledger.signals.lowDirectCompetition.effective > 0.75, "low competition should produce a visible competitive-position signal")
  assert.ok(retailMembershipCase.ledger.signals.moatStrength.effective > 0.6, "moat should be visible as a separate audited signal")
  assert.ok(retailMembershipCase.tracks.asset.paths.calculatedAssetBacking > retailMembershipCase.input.assetBackingValue, "asset track should calculate footprint and relationship backing beyond disclosed asset backing")
  assert.equal(retailMembershipCase.tracks.asset.paths.assetSplit.active, true, "typed asset split should activate asset split valuation")
  assert.ok(retailMembershipCase.tracks.asset.paths.assetSplit.adjustedValue > retailMembershipCase.tracks.asset.paths.assetSplit.totalInputValue, "appreciating land should be able to lift the adjusted asset split")
  assert.equal(
    retailMembershipCase.tracks.asset.paths.assetSplit.rows.find((row) => row.type === "Fleet / Trucks / Vehicles").multiplier,
    0.65,
    "fleet and vehicles should use the revised 0.65x asset multiplier"
  )
  assert.ok(
    retailMembershipCase.tracks.asset.paths.assetSplit.rows.find((row) => row.type === "Land / Owned Real Estate").multiplier >
      retailMembershipCase.tracks.asset.paths.assetSplit.rows.find((row) => row.type === "Fleet / Trucks / Vehicles").multiplier,
    "land should receive a stronger asset multiplier than depreciating vehicles"
  )

  const highCompetitionCase = runCase("high competition comparison", {
    ...retailMembershipCase.input,
    competitionIntensity: 5,
    moatScore: 4,
    switchingCostScore: 4,
  })
  assert.ok(retailMembershipCase.multiples.evRevenue > highCompetitionCase.multiples.evRevenue, "lower direct competition should lift applied multiples inside the shared market budget")
  assert.ok(retailMembershipCase.discount.rate <= highCompetitionCase.discount.rate, "low competition should support lower mature-company discounting")

  const highChurnMembershipCase = runCase("high churn membership comparison", {
    ...retailMembershipCase.input,
    churn: 0.12,
    nrr: 0.82,
    networkEffectScore: 2,
    switchingCostScore: 3,
  })
  assert.ok(
    retailMembershipCase.tracks.asset.paths.membershipMetrics.multiple > highChurnMembershipCase.tracks.asset.paths.membershipMetrics.multiple,
    "membership/customer relationship multiple should fall when churn rises and retention weakens"
  )
  assert.ok(
    retailMembershipCase.tracks.asset.paths.membershipMetrics.flywheel > highChurnMembershipCase.tracks.asset.paths.membershipMetrics.flywheel,
    "network effects and member scale should create a visible non-linear flywheel score"
  )

  const cloudAndSoftwareAssets = runCase("cloud software asset types", {
    ...DEFAULT_INPUTS,
    asset1Type: "Owned Cloud Compute / Data Center Capacity",
    asset1Value: 100_000_000,
    asset2Type: "Capitalized Software / Platform",
    asset2Value: 100_000_000,
    asset3Type: "Crypto / Digital Assets",
    asset3Value: 25_000_000,
    networkEffectScore: 8,
    moatScore: 8,
  })
  const cloudRow = cloudAndSoftwareAssets.tracks.asset.paths.assetSplit.rows.find((row) => row.type === "Owned Cloud Compute / Data Center Capacity")
  const softwareRow = cloudAndSoftwareAssets.tracks.asset.paths.assetSplit.rows.find((row) => row.type === "Capitalized Software / Platform")
  const cryptoRow = cloudAndSoftwareAssets.tracks.asset.paths.assetSplit.rows.find((row) => row.type === "Crypto / Digital Assets")
  assert.ok(cloudRow.multiplier >= 0.82, "owned cloud compute should use at least the revised 0.82x multiplier before moat lift")
  assert.ok(softwareRow.multiplier < 0.3, "capitalized software or a website should not be treated as a strong standalone asset")
  assert.ok(cryptoRow.multiplier > softwareRow.multiplier, "crypto should be supported as a separate marked asset type")

  const assetLightSoftware = runCase("asset-light software", {
    ...DEFAULT_INPUTS,
    assetBackingValue: 0,
    tangibleBookValue: 0,
    asset1Type: "None",
    asset1Value: 0,
    asset2Type: "None",
    asset2Value: 0,
  })
  assert.equal(assetLightSoftware.tracks.asset.paths.assetSplit?.active || false, false, "software should not require hard asset split inputs")
  assert.ok(assetLightSoftware.final.trackWeights.asset < 0.1, "asset-light software should keep asset evidence low-weight rather than receive a hard-asset penalty")

  const moderateMoatSoftware = runCase("moderate moat software gate", {
    ...DEFAULT_INPUTS,
    capitalStatus: "Public",
    lifecycleStage: "Profitable / Mature",
    profitabilityStatus: "FCF Positive",
    revenue: 1_500_000_000,
    grossMargin: 0.88,
    opexRatio: 0.44,
    recurringRevenuePct: 0.9,
    competitionIntensity: 3.4,
    moatScore: 6,
    switchingCostScore: 6,
    networkEffectScore: 3,
  })
  const industrialNoSoftwareGate = runCase("industrial no software gate", {
    ...moderateMoatSoftware.input,
    sector: "Manufacturing / Industrials",
    businessModel: "Manufacturing / Production",
    tags: ["Hardware Sales", "Inventory-Heavy"],
    grossMargin: 0.36,
    opexRatio: 0.2,
  })
  assert.ok(moderateMoatSoftware.multiples.softwareDurabilityGate < 1, "software multiples should require durable moat support, not only high margins")
  assert.equal(industrialNoSoftwareGate.multiples.softwareDurabilityGate, 1, "software durability gate should not apply to non-software companies")

  const bankCase = runCase("financial asset track", {
    ...DEFAULT_INPUTS,
    sector: "Fintech / Financial Services",
    businessModel: "Financial / Balance-Sheet Business",
    capitalStatus: "Public",
    lifecycleStage: "Profitable / Mature",
    profitabilityStatus: "FCF Positive",
    revenue: 2_000_000_000,
    revenueGrowth: 0.04,
    grossMargin: 0.98,
    opexRatio: 0.54,
    cash: 3_000_000_000,
    debt: 4_000_000_000,
    tangibleBookValue: 6_000_000_000,
    roe: 0.14,
    rotce: 0.18,
    sharePrice: 35,
    sharesOutstanding: 300_000_000,
  })
  assert.ok(bankCase.tracks.asset.active, "financial businesses should activate a book/ROE asset track")
  assert.ok(bankCase.final.trackWeights.asset > bankCase.final.trackWeights.industry, "financial businesses should weight asset/book evidence above generic industry multiples")

  const lowShare = runCase("low share same market", {
    ...DEFAULT_INPUTS,
    revenue: 40_000_000,
    sam: 4_000_000_000,
    tam: 12_000_000_000,
  })
  const highShare = runCase("high share same market", {
    ...DEFAULT_INPUTS,
    revenue: 900_000_000,
    sam: 1_000_000_000,
    tam: 12_000_000_000,
  })
  assert.ok(highShare.context.size.marketSharePosition > lowShare.context.size.marketSharePosition, "higher share should increase calculated market-share position")
  assert.ok(highShare.ledger.budgets.sizeStrategicCapMultiplier < lowShare.ledger.budgets.sizeStrategicCapMultiplier, "higher share should reduce strategic cap multiplier")

  const strongMultipleCase = runCase("strong multiple case", {
    ...DEFAULT_INPUTS,
    revenueGrowth: 0.42,
    sectorCagr: 0.18,
    grossMargin: 0.84,
    opexRatio: 0.38,
    cash: 60_000_000,
    debt: 0,
    recurringRevenuePct: 0.94,
    nrr: 1.24,
    churn: 0.006,
  })
  const weakMultipleCase = runCase("weak multiple case", {
    ...DEFAULT_INPUTS,
    revenueGrowth: -0.18,
    sectorCagr: -0.02,
    grossMargin: 0.42,
    opexRatio: 0.64,
    cash: 2_000_000,
    debt: 95_000_000,
    recurringRevenuePct: 0.35,
    nrr: 0.82,
    churn: 0.12,
  })
  assert.ok(strongMultipleCase.ledger.budgets.companyMultipleFactor > 1, "strong growth and financial quality should raise applied multiples")
  assert.ok(weakMultipleCase.ledger.budgets.companyMultipleFactor < 1, "high debt and declining revenue should lower applied multiples")
  assert.ok(
    strongMultipleCase.ledger.budgets.companyMultipleFactor - 1 > 1 - weakMultipleCase.ledger.budgets.companyMultipleFactor,
    "high-quality upside should not be pulled back as hard as the equivalent downside is cushioned"
  )
  assert.ok(strongMultipleCase.multiples.evRevenue > weakMultipleCase.multiples.evRevenue, "applied revenue multiple should reflect company and sector quality")
  assert.ok(strongMultipleCase.ledger.budgets.companyMultipleFactor <= 2.5, "company multiple factor should respect the 2.5x ceiling")
  assert.ok(weakMultipleCase.ledger.budgets.companyMultipleFactor >= 0.25, "company multiple factor should respect the 0.25x floor")

  const dividendCase = runCase("dividend durability", {
    ...DEFAULT_INPUTS,
    capitalStatus: "Public",
    profitabilityStatus: "FCF Positive",
    lifecycleStage: "Profitable / Mature",
    revenueGrowth: 0.04,
    grossMargin: 0.55,
    opexRatio: 0.28,
    capexPct: 0.02,
    expectedDilution: 0,
    dividendYield: 0.025,
  })
  assert.ok(dividendCase.outputs.equityBridge.dividendDurabilityUplift > dividendCase.input.dividendYield, "durable dividends should add slightly more than the dividend yield alone")

  const smallPipelineCase = runCase("small pipeline-heavy case", {
    ...DEFAULT_INPUTS,
    capitalStatus: "Series B",
    lifecycleStage: "Early Commercial",
    profitabilityStatus: "Revenue-Generating / Unprofitable",
    revenue: 3_000_000,
    revenueGrowth: 0.9,
    sectorCagr: 0.18,
    sam: 900_000_000,
    tam: 8_000_000_000,
    cash: 1_000_000,
    debt: 8_000_000,
    grossMargin: 0.72,
    opexRatio: 1.05,
    pipelineValue: 45_000_000,
    pipelineConversion: 0.45,
  })
  const smallWeakCase = runCase("small weak pipeline case", {
    ...smallPipelineCase.input,
    revenueGrowth: 0.05,
    sectorCagr: 0.02,
    grossMargin: 0.45,
    pipelineValue: 0,
    pipelineConversion: 0,
  })
  assert.ok(smallPipelineCase.ledger.signals.marketPotential.effective > smallWeakCase.ledger.signals.marketPotential.effective, "market potential should distinguish small companies with remaining market room, growth, and pipeline")
  assert.ok(smallPipelineCase.ledger.signals.pipelineOpportunity.effective > 0.5, "expected pipeline conversion should produce a visible pipeline signal")
  assert.ok(smallPipelineCase.tracks.market.paths.pipelineRevenueCredit > 0, "expected converted pipeline should add a capped revenue credit")
  assert.ok(smallPipelineCase.ledger.budgets.companyMultipleFactor > 1.2, "high-potential small companies should be able to overcome current balance-sheet drag")
  assert.ok(smallWeakCase.ledger.budgets.companyMultipleFactor < 0.8, "similar small companies without growth potential should still be discounted")

  const noWorkingCapitalCase = runCase("no working capital fields", {
    ...DEFAULT_INPUTS,
    ar: 0,
    inventory: 0,
    ap: 0,
  })
  const receivablesHeavyCase = runCase("receivables heavy case", {
    ...noWorkingCapitalCase.input,
    ar: 20_000_000,
    inventory: 3_000_000,
    ap: 1_000_000,
  })
  assert.equal(noWorkingCapitalCase.ledger.signals.workingCapitalPressure.effective, 0, "missing or non-applicable AR/AP/inventory should not create working-capital pressure")
  assert.ok(receivablesHeavyCase.ledger.signals.workingCapitalPressure.effective > noWorkingCapitalCase.ledger.signals.workingCapitalPressure.effective, "receivables and inventory should increase working-capital pressure")
  assert.ok(receivablesHeavyCase.ledger.signals.marginConversion.effective <= noWorkingCapitalCase.ledger.signals.marginConversion.effective, "working-capital and debt pressure should be visible in gross-to-net conversion")

  // --- Brand durability signal ---
  const consumerBrandBase = {
    ...DEFAULT_INPUTS,
    sector: "Consumer Products / Retail / E-commerce",
    businessModel: "Retail / Commerce / Distribution",
    clientType: "Consumers",
    capitalStatus: "Public",
    lifecycleStage: "Profitable / Mature",
    profitabilityStatus: "FCF Positive",
    revenue: 1_000_000_000,
    revenueGrowth: 0.05,
    grossMargin: 0.3,
    opexRatio: 0.18,
  }
  const weakBrand = runCase("weak consumer brand", {
    ...consumerBrandBase,
    customerTrustScore: 2, consumerHabitStrength: 2, targetMarketRecognitionPct: 0.05,
    purchaseFrequency: 2, missionCriticality: 2, yearsOperating: 2, brandGeographicReach: "Local",
  })
  const strongBrand = runCase("strong consumer brand", {
    ...consumerBrandBase,
    customerTrustScore: 10, consumerHabitStrength: 10, targetMarketRecognitionPct: 0.9,
    purchaseFrequency: 10, missionCriticality: 8, yearsOperating: 50, brandGeographicReach: "Global",
  })
  assert.ok(strongBrand.ledger.signals.brandDurability.effective > weakBrand.ledger.signals.brandDurability.effective + 0.3, "brand inputs should drive a visible brand-durability signal")
  assert.ok(strongBrand.ledger.signals.durability.effective > weakBrand.ledger.signals.durability.effective, "brand should feed the shared durability composite")
  assert.ok(strongBrand.discount.rate <= weakBrand.discount.rate, "a durable brand should support a lower discount rate")
  assert.ok(strongBrand.multiples.evRevenue > weakBrand.multiples.evRevenue, "a durable brand should modestly lift applied multiples")
  const brandFairRatio = strongBrand.outputs.fairCommonEquity / weakBrand.outputs.fairCommonEquity
  assert.ok(brandFairRatio > 1 && brandFairRatio < 1.25, "brand should add a modest, controlled premium, not a runaway uplift")

  // Brand must not re-read moat/competition inputs: with brand held fixed, brand-durability is unchanged.
  const brandFixedLowMoat = runCase("brand fixed, low moat", { ...strongBrand.input, moatScore: 2, switchingCostScore: 2, networkEffectScore: 1, dataAdvantageScore: 2, ipScore: 1, competitionIntensity: 5 })
  const brandFixedHighMoat = runCase("brand fixed, high moat", { ...strongBrand.input, moatScore: 10, switchingCostScore: 10, networkEffectScore: 8, dataAdvantageScore: 9, ipScore: 8, competitionIntensity: 1 })
  assert.ok(Math.abs(brandFixedLowMoat.ledger.signals.brandDurability.effective - brandFixedHighMoat.ledger.signals.brandDurability.effective) < 0.0001, "brand-durability must not change when only moat/competition inputs change (no shared inputs)")
  assert.ok(brandFixedHighMoat.ledger.signals.moatStrength.effective > brandFixedLowMoat.ledger.signals.moatStrength.effective, "structural moat must respond to structural inputs")

  // Anti-stack: adding full structural moat on top of a full brand is a bounded, sub-additive move in durability.
  const durabilityDelta = brandFixedHighMoat.ledger.signals.durability.effective - brandFixedLowMoat.ledger.signals.durability.effective
  assert.ok(durabilityDelta > 0 && durabilityDelta < 0.45, "durability composite should combine brand and moat sub-additively, not stack them")

  // Business-type weighting: identical brand inputs matter far more for a consumer company than a biopharma asset.
  const consumerRel = runCase("consumer brand relevance", strongBrand.input)
  const biopharmaRel = runCase("biopharma brand relevance", {
    ...strongBrand.input,
    sector: "Biotech Therapeutics",
    businessModel: "Biopharma / R&D Asset",
    clientType: "Hospitals / Healthcare Providers",
  })
  assert.ok(consumerRel.context.brand.relevance > biopharmaRel.context.brand.relevance + 0.3, "brand relevance should be business-type aware")
  const consumerDurabilityLift = consumerRel.ledger.signals.durability.effective - weakBrand.ledger.signals.durability.effective
  const biopharmaDurabilityLift = biopharmaRel.ledger.signals.durability.effective - weakBrand.ledger.signals.durability.effective
  assert.ok(consumerDurabilityLift > biopharmaDurabilityLift, "the same brand strength should move durability more for a consumer business than a biopharma asset")

  // Separable brand intangible only credited to the extent brand durability supports it.
  const strongBrandAsset = runCase("strong brand intangible", { ...strongBrand.input, asset1Type: "Brand / Trademarks", asset1Value: 100_000_000 })
  const weakBrandAsset = runCase("weak brand intangible", { ...weakBrand.input, asset1Type: "Brand / Trademarks", asset1Value: 100_000_000 })
  const strongBrandRow = strongBrandAsset.tracks.asset.paths.assetSplit.rows.find((row) => row.type === "Brand / Trademarks")
  const weakBrandRow = weakBrandAsset.tracks.asset.paths.assetSplit.rows.find((row) => row.type === "Brand / Trademarks")
  assert.ok(strongBrandRow.multiplier > weakBrandRow.multiplier, "a durable consumer brand should be credited as a stronger separable intangible than a weak one")

  // --- Soft-cap compression curve on multiples ---
  const premiumMultipleCase = runCase("premium name soft ceiling", {
    ...DEFAULT_INPUTS,
    capitalStatus: "Public",
    lifecycleStage: "Profitable / Mature",
    profitabilityStatus: "FCF Positive",
    revenue: 3_000_000_000,
    revenueGrowth: 0.32,
    sectorCagr: 0.2,
    grossMargin: 0.85,
    opexRatio: 0.4,
    recurringRevenuePct: 0.95,
    nrr: 1.3,
    churn: 0.004,
    moatScore: 10, switchingCostScore: 10, networkEffectScore: 9, dataAdvantageScore: 9,
    competitionIntensity: 1.5, customerTrustScore: 9, missionCriticality: 9, targetMarketRecognitionPct: 0.8,
    sharePrice: 40, sharesOutstanding: 200_000_000,
  })
  const softwareBandTop = 10.5 // SaaS rev band high
  assert.ok(premiumMultipleCase.multiples.evRevenue > softwareBandTop, "an elite name should be allowed to trade above the sector band top")
  assert.ok(premiumMultipleCase.multiples.evRevenue < softwareBandTop * 3.6, "the soft ceiling should keep even an elite name below the asymptotic cap")

  // softBand unit checks: compression curve on both tails.
  const lo = 4, hi = 12
  assert.equal(softBand(8, lo, hi), 8, "a value inside the band passes through unchanged")
  assert.equal(softBand(hi, lo, hi), hi, "the curve is continuous at the band top")
  assert.equal(softBand(lo, lo, hi), lo, "the curve is continuous at the band bottom")
  assert.ok(softBand(24, lo, hi) > hi && softBand(24, lo, hi) < hi * 3.6, "above the band: allowed above the top but held under the asymptotic ceiling")
  assert.ok(softBand(1_000, lo, hi) <= hi * 3.6 + 1e-9 && softBand(1_000, lo, hi) > softBand(24, lo, hi), "diminishing returns: extreme inputs approach but never exceed the ceiling")
  assert.ok(softBand(1, lo, hi) < lo && softBand(1, lo, hi) > lo * 0.4, "below the band: pulled down but lifted above the asymptotic floor")
  assert.ok(softBand(-50, lo, hi) >= lo * 0.4 - 1e-9, "extreme downside is floored at the lifted minimum, never collapsing to zero")

  // A low-growth but very high quality name should now earn a multiple above the
  // band midpoint on quality alone (the decoupled quality position).
  const lowGrowthQualityCase = runCase("low growth high quality multiple", {
    ...premiumMultipleCase.input,
    revenueGrowth: 0.04,
    sectorCagr: 0.03,
  })
  assert.ok(lowGrowthQualityCase.multiples.evRevenue > 6, "a durable high-margin compounder should earn a rich multiple even at low growth")

  // --- Rebuilt DCF stability across profitability states ---
  // Same company across profitability labels should produce a DCF within a sane
  // band of implied EV/revenue — no collapse to ~0, no explosion.
  const dcfStabilityInputs = {
    ...DEFAULT_INPUTS,
    capitalStatus: "Public",
    lifecycleStage: "Late-Stage Growth",
    revenue: 1_000_000_000,
    revenueGrowth: 0.12,
    grossMargin: 0.7,
    opexRatio: 0.5,
    capexPct: 0.03,
    sam: 40_000_000_000,
    tam: 120_000_000_000,
  }
  const dcfProfitable = runCase("dcf stability profitable", { ...dcfStabilityInputs, profitabilityStatus: "FCF Positive" })
  const dcfUnprofitable = runCase("dcf stability unprofitable", { ...dcfStabilityInputs, profitabilityStatus: "Revenue-Generating / Unprofitable", opexRatio: 0.78, marginChangeYoy: 0.04 })
  for (const c of [dcfProfitable, dcfUnprofitable]) {
    const implied = c.tracks.dcf.rawEV / c.input.revenue
    assert.ok(implied > 1 && implied < 40, `rebuilt DCF implied EV/revenue should be sane (${c.input.companyName}: ${implied.toFixed(1)}x)`)
  }
  assert.ok(dcfUnprofitable.tracks.dcf.rawEV > 0, "unprofitable-but-scaling DCF must be positive, not a collapse to zero")

  // Buyback should lift the intrinsic DCF slightly vs dilution (small yearly effect).
  const buybackDcf = runCase("dcf buyback accretive", { ...dcfStabilityInputs, profitabilityStatus: "FCF Positive", buybackYield: 0.04, expectedDilution: 0 })
  const dilutionDcf = runCase("dcf dilution drag", { ...dcfStabilityInputs, profitabilityStatus: "FCF Positive", buybackYield: 0, expectedDilution: 0.1 })
  assert.ok(buybackDcf.tracks.dcf.shareEffect > dilutionDcf.tracks.dcf.shareEffect, "net buybacks should make the DCF slightly accretive relative to dilution")
  assert.ok(Math.abs(buybackDcf.tracks.dcf.shareEffect - 1) <= 0.12 + 1e-9, "the yearly dilution/buyback effect on the DCF should stay small")

  // --- Regulated / asset-base energy & infrastructure regime ---
  const utilityInputs = {
    ...DEFAULT_INPUTS,
    companyName: "Regulated Utility",
    sector: "Clean Energy / Climate",
    businessModel: "Asset-Heavy Operator",
    tags: ["Asset-Heavy Infrastructure", "Regulated Approval Path"],
    lifecycleStage: "Profitable / Mature",
    capitalStatus: "Public",
    profitabilityStatus: "Profitable",
    tam: 500_000_000_000,
    sam: 150_000_000_000,
    revenue: 28_000_000_000,
    revenueGrowth: 0.1,
    grossMargin: 0.61,
    opexRatio: 0.31,
    capexPct: 0.32, // reinvests more than it earns -> negative FCF by design
    cash: 3_000_000_000,
    debt: 110_000_000_000, // rate-base-funded leverage
    tangibleBookValue: 75_000_000_000,
    assetBackingValue: 90_000_000_000,
    roe: 0.11,
    recurringRevenuePct: 0.85,
    sharePrice: 88, sharesOutstanding: 2_090_000_000,
    dividendYield: 0.028,
  }
  const utility = runCase("regulated utility", utilityInputs)
  assert.equal(utility.context.modules.infrastructure, true, "an asset-heavy regulated operator should activate the infrastructure regime")
  assert.equal(utility.tracks.asset.paths.regime, "regulated-asset-base", "the asset track should use the regulated rate-base valuation")
  assert.ok(utility.tracks.asset.paths.regulatedPremium > 1 && utility.tracks.asset.paths.regulatedPremium <= 2.9, "the regulated-return premium should be bounded")
  assert.ok(utility.outputs.fairCommonEquity > utility.tracks.asset.paths.equityAssetBase, "a growing regulated operator's equity value should exceed its bare equity rate base")
  assert.ok(utility.final.trackWeights.asset > utility.final.trackWeights.dcf, "the rate-base track should outweigh the (structurally understated) FCF DCF for a utility")
  assert.ok(utility.tracks.dcf.rawEV >= 0, "the FCF DCF should not go negative even when the company runs negative free cash flow")

  // No double counting: a disclosed real-estate asset feeds the rate base through the
  // shared max(), it is not stacked on top of the premium-valued base.
  const utilityWithRealEstate = runCase("regulated utility with disclosed land", {
    ...utilityInputs,
    asset1Type: "Land / Owned Real Estate",
    asset1Value: 20_000_000_000,
  })
  const baseAsset = utility.tracks.asset.paths.equityAssetBase
  const withLandAsset = utilityWithRealEstate.tracks.asset.paths.equityAssetBase
  assert.ok(
    withLandAsset - baseAsset < 20_000_000_000,
    "a disclosed asset should enter the rate base through max(), not add its full value on top (no double counting with the asset split)"
  )

  // A capital-intensive but early-stage / unprofitable operator must NOT be pulled into
  // the regulated regime (it is a growth company, valued differently).
  const growthAssetHeavy = runCase("growth asset-heavy not regulated", {
    ...utilityInputs,
    businessModel: "Product / Hardware",
    lifecycleStage: "Scaling",
    profitabilityStatus: "Revenue-Generating / Unprofitable",
  })
  assert.equal(growthAssetHeavy.context.modules.infrastructure, false, "an unprofitable growth-stage asset-heavy company should not be treated as a regulated operator")

  // --- Capital returns signal (orthogonal to brand) ---
  const matureBrandBase = {
    ...DEFAULT_INPUTS,
    sector: "Consumer Products / Retail / E-commerce",
    businessModel: "Manufacturing / Production",
    clientType: "Consumers",
    capitalStatus: "Public",
    lifecycleStage: "Profitable / Mature",
    profitabilityStatus: "FCF Positive",
    revenue: 50_000_000_000,
    revenueGrowth: 0.03,
    grossMargin: 0.4,
    // strong, well-known brand in both cases
    customerTrustScore: 9, consumerHabitStrength: 9, targetMarketRecognitionPct: 0.9,
    yearsOperating: 80, brandGeographicReach: "Global",
  }
  // High capital returns: light capex, strong FCF conversion.
  const efficientName = runCase("efficient mature brand", { ...matureBrandBase, opexRatio: 0.22, capexPct: 0.02 })
  // Same brand and operating margin, poor capital returns: same EBITDA but heavy capex
  // eats most of it, leaving thin (still positive) FCF — a capital-hungry operator.
  const inefficientName = runCase("inefficient mature brand", { ...matureBrandBase, opexRatio: 0.22, capexPct: 0.12 })
  assert.ok(
    Math.abs(efficientName.ledger.signals.brandDurability.effective - inefficientName.ledger.signals.brandDurability.effective) < 0.0001,
    "brand durability must be identical when only capital efficiency differs (the two signals are orthogonal)"
  )
  assert.ok(
    efficientName.ledger.signals.capitalReturns.effective > inefficientName.ledger.signals.capitalReturns.effective + 0.1,
    "the capital-returns signal must separate a capital-light high-FCF name from a capital-hungry low-FCF one"
  )
  assert.ok(
    efficientName.multiples.evRevenue > inefficientName.multiples.evRevenue,
    "a strong brand should NOT earn the same multiple regardless of capital returns — the inefficient name gets a lower multiple"
  )
  assert.ok(
    inefficientName.tracks.dcf.marginTrajectory.matureMargin < efficientName.tracks.dcf.marginTrajectory.matureMargin,
    "a capital-heavy low-FCF operator should converge to a lower mature DCF margin (not be assumed to reach sector-normal free cash flow)"
  )

  // --- Fair-value band width is tied to confidence (tight when confident) ---
  const highConfidence = runCase("high confidence band", {
    ...DEFAULT_INPUTS,
    capitalStatus: "Public",
    lifecycleStage: "Profitable / Mature",
    profitabilityStatus: "FCF Positive",
    revenue: 5_000_000_000,
    revenueGrowth: 0.06,
    grossMargin: 0.7,
    opexRatio: 0.4,
    recurringRevenuePct: 0.9,
    nrr: 1.15,
    sharePrice: 40, sharesOutstanding: 200_000_000,
  })
  const lowConfidence = runCase("low confidence band", {
    ...DEFAULT_INPUTS,
    capitalStatus: "Seed",
    lifecycleStage: "Prototype / Pre-Revenue",
    profitabilityStatus: "Pre-Revenue",
    revenue: 0,
    revenueGrowth: 0.9,
  })
  const bandWidth = (r) => (r.bands.final.high - r.bands.final.low) / Math.max(r.outputs.fairCommonEquity, 1)
  assert.ok(highConfidence.bands.quality > lowConfidence.bands.quality, "a mature profitable public company should be scored more confident than a pre-revenue seed company")
  assert.ok(bandWidth(highConfidence) < bandWidth(lowConfidence), "higher confidence should produce a tighter fair-value band")
  assert.ok(bandWidth(highConfidence) < 0.42, "a high-confidence band should be reasonably tight (well under +/-25% half-width)")

  // --- Jurisdiction / governing-regime solidity ---
  const jurisdictionBase = {
    ...DEFAULT_INPUTS,
    capitalStatus: "Public",
    lifecycleStage: "Late-Stage Growth",
    profitabilityStatus: "Profitable",
    revenue: 100_000_000_000,
    revenueGrowth: 0.08,
    grossMargin: 0.45,
    opexRatio: 0.35,
    moatScore: 8, networkEffectScore: 8, dataAdvantageScore: 8,
  }
  const ruleOfLaw = runCase("rule of law", { ...jurisdictionBase, governanceRegime: "Established Rule of Law" })
  const stateCapitalist = runCase("state capitalist", { ...jurisdictionBase, governanceRegime: "State Capitalist / Single-Party" })
  const fragile = runCase("fragile regime", { ...jurisdictionBase, governanceRegime: "Fragile / Unstable" })
  assert.ok(stateCapitalist.discount.rate > ruleOfLaw.discount.rate, "a weaker regime should carry a higher discount rate (sovereign risk)")
  assert.ok(fragile.discount.rate > stateCapitalist.discount.rate, "a fragile regime should carry a higher discount rate than a state-capitalist one")
  assert.ok(stateCapitalist.multiples.evRevenue < ruleOfLaw.multiples.evRevenue, "a weaker regime should apply a minority-shareholder discount to the market multiple")
  assert.ok(ruleOfLaw.outputs.fairCommonEquity > stateCapitalist.outputs.fairCommonEquity, "the same business is worth more under a solid rule-of-law regime than a weak one")
  assert.ok(stateCapitalist.outputs.fairCommonEquity > fragile.outputs.fairCommonEquity, "and worth more under a state-capitalist regime than a fragile/unstable one")
  assert.ok(ruleOfLaw.ledger.signals.jurisdictionQuality.effective > fragile.ledger.signals.jurisdictionQuality.effective, "jurisdiction quality signal should rank regimes by solidity")

  // Government favor is durable in a solid regime and fragile (worth less, adds risk) in a weak one.
  const championSolid = runCase("national champion, solid regime", { ...jurisdictionBase, governanceRegime: "Established Rule of Law", governmentPosture: "Protected / National Champion" })
  const championWeak = runCase("national champion, weak regime", { ...jurisdictionBase, governanceRegime: "Authoritarian / High-Intervention", governmentPosture: "Protected / National Champion" })
  assert.ok(
    championSolid.context.jurisdiction.durableTailwind > championWeak.context.jurisdiction.durableTailwind,
    "the same 'national champion' status is a more durable tailwind in a solid regime than a weak one"
  )
  assert.ok(
    championWeak.discount.rate > championSolid.discount.rate,
    "state favor in a weak regime is a latent reversal risk, so it raises the discount rate relative to the same favor in a solid regime"
  )

  // US default names are unaffected: adding the default regime should not move value.
  const defaultRegime = runCase("default regime unaffected", DEFAULT_INPUTS)
  assert.ok(defaultRegime.context.jurisdiction.sovereignRiskPremium < 0.006, "an established-rule-of-law company should carry a negligible sovereign risk premium")

  // --- Margin durability (gross-margin quality gate on the multiple) ---
  const softwareCase = (grossMargin) => ({
    ...DEFAULT_INPUTS,
    sector: "SaaS / Enterprise Software", businessModel: "Software / Subscription",
    capitalStatus: "Public", profitabilityStatus: "FCF Positive", lifecycleStage: "Late-Stage Growth",
    revenue: 5_000_000_000, revenueGrowth: 0.15, grossMargin, opexRatio: grossMargin - 0.24,
    recurringRevenuePct: 0.9, moatScore: 8, switchingCostScore: 9,
  })
  const premiumSoftware = runCase("premium software 82pct gross", softwareCase(0.82))
  const lowMarginSoftware = runCase("low-margin software 37pct gross", softwareCase(0.37))
  assert.ok(premiumSoftware.multiples.marginQualityFactor >= 0.98, "a software company at typical software gross margin should be ~neutral on the margin-quality factor")
  assert.ok(lowMarginSoftware.multiples.marginQualityFactor < premiumSoftware.multiples.marginQualityFactor, "a sub-software gross margin should mark down the margin-quality factor")
  assert.ok(lowMarginSoftware.multiples.softwareDurabilityGate < premiumSoftware.multiples.softwareDurabilityGate, "the software gate should additionally penalize a sub-software gross margin")
  assert.ok(
    lowMarginSoftware.multiples.evRevenue < premiumSoftware.multiples.evRevenue * 0.75,
    "a low-gross-margin 'software' name should earn a materially lower multiple than genuine premium software"
  )

  // Above-sector-norm margins earn a concave premium lift (premium names climb slightly).
  const sectorMid = runCase("logistics at sector margin", {
    ...DEFAULT_INPUTS, sector: "Logistics / Supply Chain", businessModel: "Services / Labor-Based",
    capitalStatus: "Public", profitabilityStatus: "FCF Positive", lifecycleStage: "Profitable / Mature",
    revenue: 5_000_000_000, grossMargin: 0.28, opexRatio: 0.14,
  })
  const sectorPremium = runCase("logistics above sector margin", { ...sectorMid.input, grossMargin: 0.42 })
  assert.ok(sectorPremium.multiples.marginQualityFactor > 1.03, "a company with margins well above its sector norm should get a premium multiple lift")
  assert.ok(sectorPremium.multiples.marginQualityFactor <= 1.16 + 1e-9, "the margin-quality lift is bounded (diminishing returns), not unlimited")
  assert.ok(sectorPremium.multiples.evRevenue > sectorMid.multiples.evRevenue, "the lift should raise the applied multiple for the premium-margin name")

  // Low-gross, high-turnover retail must NOT be crushed (quality via asset turns, not margin).
  const retailLowGross = runCase("low-gross retail not over-penalized", {
    ...DEFAULT_INPUTS, sector: "Consumer Products / Retail / E-commerce", businessModel: "Retail / Commerce / Distribution",
    capitalStatus: "Public", profitabilityStatus: "FCF Positive", lifecycleStage: "Profitable / Mature",
    revenue: 100_000_000_000, grossMargin: 0.13, opexRatio: 0.05,
  })
  assert.ok(retailLowGross.multiples.marginQualityFactor > 0.92, "a low-gross-margin turnover retailer should get only a muted margin penalty, not a software-grade markdown")

  // --- Customer prepayment credit (cash-conversion credit, no double count with backlog) ---
  const prepayBase = {
    ...DEFAULT_INPUTS,
    capitalStatus: "Public",
    lifecycleStage: "Scaling",
    profitabilityStatus: "Revenue-Generating / Unprofitable",
    revenue: 2_500_000_000,
    revenueGrowth: 0.2,
    grossMargin: 0.2,
    opexRatio: 0.19,
    capexPct: 0.04,
    backlogValue: 20_000_000_000,
    backlogConversion: 0.12,
    backlogGrossMargin: 0.21,
    contractDurationYears: 3,
    renewalProbability: 0.8,
  }
  const noPrepay = runCase("no prepayment credit", { ...prepayBase, customerPrepaymentPct: 0 })
  const withPrepay = runCase("with prepayment credit", { ...prepayBase, customerPrepaymentPct: 0.15 })
  assert.ok(
    Math.abs(withPrepay.margins.fcfMargin - (noPrepay.margins.fcfMargin + 0.15)) < 0.0001,
    "the prepayment credit should add directly to fcfMargin (0.15 of revenue)"
  )
  assert.ok(withPrepay.tracks.dcf.rawEV > noPrepay.tracks.dcf.rawEV, "a higher cash-conversion credit should raise the DCF track (higher starting FCF margin)")
  // The critical invariant: the backlog track's own valuation math (how many backlog
  // dollars convert, at what margin, discounted for execution risk) must be completely
  // unaffected by the prepayment credit, since pipelineBacklogTrack does not read
  // fcfMargin at all — proving the same backlog dollars are not valued twice (once via
  // backlog conversion, once via an inflated cash-flow baseline that assumes those
  // dollars already arrived). The track's final rawEV may still move slightly through the
  // shared discount rate (a genuinely lower-risk cash-converting company legitimately
  // discounts ALL its future cash flows a little less — the same channel every other
  // margin-quality signal already uses) — that is a real, small, indirect effect, not a
  // double count of the same dollars, so it is bounded rather than forbidden.
  assert.equal(
    withPrepay.tracks.pipeline.paths.expectedBacklog, noPrepay.tracks.pipeline.paths.expectedBacklog,
    "expected backlog conversion must not change with the prepayment credit"
  )
  assert.equal(withPrepay.tracks.pipeline.paths.margin, noPrepay.tracks.pipeline.paths.margin, "backlog margin must not change with the prepayment credit")
  assert.equal(withPrepay.tracks.pipeline.paths.executionRisk, noPrepay.tracks.pipeline.paths.executionRisk, "backlog execution-risk discount must not change with the prepayment credit")
  assert.ok(
    Math.abs(withPrepay.tracks.pipeline.rawEV / noPrepay.tracks.pipeline.rawEV - 1) < 0.08,
    "the backlog track's final value should move only slightly (via the shared discount rate), not track the prepayment credit directly"
  )

  // Cap enforcement: an extreme input clamps to 0.2, not an unbounded credit.
  const extremePrepay = runCase("extreme prepayment credit clamps", { ...prepayBase, customerPrepaymentPct: 5 })
  assert.ok(Math.abs(extremePrepay.margins.customerPrepaymentCredit - 0.2) < 0.0001, "customerPrepaymentPct should clamp to the 0.2 safety cap")
  const negativePrepay = runCase("negative prepayment credit clamps to zero", { ...prepayBase, customerPrepaymentPct: -1 })
  assert.equal(negativePrepay.margins.customerPrepaymentCredit, 0, "a negative prepayment input should clamp to zero, not create a penalty")

  // --- Customer concentration risk (dampened only by expansion + stickiness) ---
  const concentrationBase = {
    ...DEFAULT_INPUTS,
    capitalStatus: "Public",
    lifecycleStage: "Scaling",
    profitabilityStatus: "FCF Positive",
    revenue: 2_500_000_000,
    revenueGrowth: 0.2,
    grossMargin: 0.4,
    opexRatio: 0.3,
  }
  const noConcentration = runCase("no customer concentration disclosed", { ...concentrationBase, topCustomerRevenuePct: 0 })
  assert.equal(noConcentration.ledger.signals.customerConcentration.effective, 0, "undisclosed (0%) concentration should carry no risk premium")

  const highConcStable = runCase("high concentration, stable, low moat", {
    ...concentrationBase, topCustomerRevenuePct: 0.5, topCustomerRelationshipTrend: "Stable",
    moatScore: 3, switchingCostScore: 3, networkEffectScore: 2, dataAdvantageScore: 2, ipScore: 2,
  })
  assert.ok(highConcStable.ledger.signals.customerConcentration.effective > 0.3, "high, stable, low-moat concentration should carry a real risk premium")
  assert.ok(highConcStable.discount.rate > noConcentration.discount.rate, "customer concentration should raise the discount rate relative to no concentration")

  // A merely STABLE relationship gets no stickiness credit even with a strong moat — the
  // engine requires an actually EXPANDING relationship to earn the dampening.
  const highConcStableHighMoat = runCase("high concentration, stable, high moat", {
    ...highConcStable.input, moatScore: 9, switchingCostScore: 9, networkEffectScore: 6, dataAdvantageScore: 6, ipScore: 6,
  })
  assert.ok(
    Math.abs(highConcStableHighMoat.ledger.signals.customerConcentration.effective - highConcStable.ledger.signals.customerConcentration.effective) < 0.02,
    "a merely stable (not expanding) relationship should get no meaningful stickiness credit even with a strong moat"
  )

  // Expansion alone (independent of moat) reduces the raw penalty.
  const highConcExpandingLowMoat = runCase("high concentration, expanding, low moat", {
    ...highConcStable.input, topCustomerRelationshipTrend: "Expanding",
  })
  assert.ok(highConcExpandingLowMoat.ledger.signals.customerConcentration.effective < highConcStable.ledger.signals.customerConcentration.effective, "an expanding relationship should reduce the concentration risk relative to a stable one")

  // Tight differentiation: SAME concentration, SAME expanding trend — only the structural
  // moat/switching-cost profile differs (warehouse-robotics-style physical lock-in vs a
  // software vendor with the same customer share and the same growth trajectory). The
  // sticky (high-moat) name must get a materially larger discount than the low-moat one.
  const expandingHighMoat = runCase("expanding, high moat (robotics-like)", {
    ...highConcStable.input, topCustomerRelationshipTrend: "Expanding",
    moatScore: 9, switchingCostScore: 9, networkEffectScore: 6, dataAdvantageScore: 6, ipScore: 6,
  })
  const expandingLowMoat = highConcExpandingLowMoat
  assert.ok(
    expandingHighMoat.ledger.signals.customerConcentration.effective < expandingLowMoat.ledger.signals.customerConcentration.effective * 0.75,
    "at identical concentration and identical expanding trend, a structurally sticky (high-moat) relationship should get a materially larger risk discount than a low-moat one — tight differentiation between robotics-style lock-in and easily-replaced vendors"
  )
  assert.ok(expandingHighMoat.discount.rate < expandingLowMoat.discount.rate, "the stickier relationship should carry a lower discount rate at identical concentration and trend")

  // A contracting relationship is worse than stable, even at the same concentration and moat.
  const highConcContracting = runCase("high concentration, contracting", { ...highConcStable.input, topCustomerRelationshipTrend: "At Risk / Contracting" })
  assert.ok(highConcContracting.ledger.signals.customerConcentration.effective > highConcStable.ledger.signals.customerConcentration.effective, "a contracting concentrated relationship should carry more risk than a merely stable one")

  // --- Cost-composition credit: R&D vs labor at the SAME current profit ---
  const costCompositionBase = {
    ...DEFAULT_INPUTS,
    sector: "SaaS / Enterprise Software",
    businessModel: "Software / Subscription",
    capitalStatus: "Public",
    lifecycleStage: "Late-Stage Growth",
    profitabilityStatus: "FCF Positive",
    revenue: 3_000_000_000,
    revenueGrowth: 0.15,
    grossMargin: 0.8,
    opexRatio: 0.55, // same total opex ratio for both companies below
    moatScore: 6, switchingCostScore: 6,
  }
  const rdHeavy = runCase("R&D-heavy company", { ...costCompositionBase, rdPct: 0.35 }) // well above the 18% SaaS norm
  const laborHeavy = runCase("labor-heavy company (same profit)", { ...costCompositionBase, rdPct: 0.02 }) // below sector norm

  // The core invariant: identical revenue/grossMargin/opexRatio/capex/etc must produce
  // IDENTICAL current profit — cost composition is invisible to the P&L, only to the
  // valuation multiple. If this fails, the feature is leaking into margins, which breaks
  // the user's literal requirement ("two companies making the same profit").
  assert.equal(rdHeavy.margins.ebitdaMargin, laborHeavy.margins.ebitdaMargin, "R&D-heavy and labor-heavy companies with identical opexRatio must have IDENTICAL EBITDA margin — composition must not leak into the P&L")
  assert.equal(rdHeavy.margins.fcfMargin, laborHeavy.margins.fcfMargin, "R&D-heavy and labor-heavy companies with identical opexRatio must have IDENTICAL FCF margin")
  assert.equal(rdHeavy.margins.netMargin, laborHeavy.margins.netMargin, "R&D-heavy and labor-heavy companies with identical opexRatio must have IDENTICAL net margin")

  // But they should get DIFFERENT valuations: R&D above sector norm earns a credit.
  assert.ok(rdHeavy.multiples.rdInvestmentFactor > 1, "R&D spend above the sector norm should earn a multiple credit")
  assert.equal(laborHeavy.multiples.rdInvestmentFactor, 1, "R&D spend below the sector norm should have zero effect (credit-only, no penalty for a lean/labor-heavy structure)")
  assert.ok(rdHeavy.multiples.evRevenue > laborHeavy.multiples.evRevenue, "at identical current profit, the R&D-heavy company should earn a higher applied multiple")
  assert.ok(rdHeavy.outputs.fairEV > laborHeavy.outputs.fairEV, "at identical current profit, the R&D-heavy company should be valued higher — same profit, different cost composition, different valuation")

  // Sector-relative, not absolute: the SAME rdPct should be treated differently depending
  // on what's typical for that sector.
  const rdPctMidLevel = 0.1 // above Manufacturing's ~2.5% norm, below SaaS's ~18% norm
  const manufacturingWithRd = runCase("manufacturing company investing in R&D", {
    ...DEFAULT_INPUTS, sector: "Manufacturing / Industrials", businessModel: "Manufacturing / Production",
    capitalStatus: "Public", lifecycleStage: "Profitable / Mature", profitabilityStatus: "FCF Positive",
    revenue: 3_000_000_000, grossMargin: 0.4, opexRatio: 0.2, rdPct: rdPctMidLevel,
  })
  const softwareWithSameRdPct = runCase("software company at the same absolute R&D pct", {
    ...costCompositionBase, rdPct: rdPctMidLevel,
  })
  assert.ok(manufacturingWithRd.multiples.rdInvestmentFactor > 1, "10% R&D is well above the manufacturing sector norm and should earn a real credit")
  assert.equal(softwareWithSameRdPct.multiples.rdInvestmentFactor, 1, "the SAME 10% R&D is below the software sector norm and should earn no credit — this is sector-relative, not an absolute threshold")

  // Bounds: rdPct clamps to opexRatio (can't exceed total opex), and the credit itself is capped.
  const rdExceedsOpex = runCase("rdPct clamps to opexRatio", { ...costCompositionBase, opexRatio: 0.3, rdPct: 0.9 })
  assert.ok(rdExceedsOpex.input.rdPct <= rdExceedsOpex.input.opexRatio + 1e-9, "rdPct must clamp to opexRatio — R&D cannot exceed total operating expense")
  const rdExtreme = runCase("extreme R&D credit is capped", { ...costCompositionBase, opexRatio: 1.0, rdPct: 0.95 })
  assert.ok(rdExtreme.multiples.rdInvestmentFactor <= 1.14 + 1e-9, "the R&D investment credit should be capped, not unbounded")

  // Backward compatibility: default rdPct=0 must be a complete no-op regardless of sector,
  // including HIGH-norm sectors (biotech/software) where 0% R&D is far below norm — the
  // credit is one-sided, so being below norm never triggers a penalty.
  const noRdBiotech = runCase("undisclosed R&D in a high-norm sector is a no-op", {
    ...DEFAULT_INPUTS, sector: "Biotech Therapeutics", businessModel: "Biopharma / R&D Asset",
    capitalStatus: "Public", lifecycleStage: "Late-Stage Growth", profitabilityStatus: "FCF Positive",
    revenue: 500_000_000, grossMargin: 0.7, opexRatio: 0.4,
  })
  assert.equal(noRdBiotech.multiples.rdInvestmentFactor, 1, "undisclosed R&D (default 0) must be a no-op even in a sector with a high R&D norm")

  // --- Small / pre-commercial biotech: R&D credit is EXCLUDED, not re-thresholded ---
  // The spend there is largely regulatory-mandatory (mandated trial phases), not a
  // discretionary investment choice, and revenue-relative R&D% is often meaningless when
  // revenue is near zero — so no amount of rdPct should earn the multiple credit.
  const preCommercialBiotech = runCase("pre-commercial biotech: no R&D credit regardless of rdPct", {
    ...DEFAULT_INPUTS,
    sector: "Biotech Therapeutics",
    businessModel: "Biopharma / R&D Asset",
    lifecycleStage: "Prototype / Pre-Revenue",
    capitalStatus: "Series A",
    profitabilityStatus: "Pre-Revenue",
    revenue: 0,
    opexRatio: 1.2,
    rdPct: 1.2, // effectively "all of opex is R&D" — the realistic small-biotech case
  })
  assert.equal(preCommercialBiotech.multiples.rdCreditApplicable, false, "pre-commercial biotech should be flagged as not credit-applicable")
  assert.equal(preCommercialBiotech.multiples.rdInvestmentFactor, 1, "a pre-commercial biotech spending effectively 100% of opex on R&D should get NO multiple credit — that spend is mandatory, not discretionary")

  // A large, profitable, commercial biopharma (the exact same sector) is a genuine
  // discretionary-allocation case and should still be credit-eligible.
  const commercialBiopharmaCase = runCase("commercial biopharma: R&D credit still applies", {
    ...DEFAULT_INPUTS,
    sector: "Biotech Therapeutics",
    businessModel: "IP / Licensing / Royalty",
    lifecycleStage: "Profitable / Mature",
    capitalStatus: "Public",
    profitabilityStatus: "FCF Positive",
    revenue: 10_000_000_000,
    grossMargin: 0.8,
    opexRatio: 0.5,
    rdPct: 0.35, // well above the 25% commercial-biopharma norm
  })
  assert.equal(commercialBiopharmaCase.multiples.rdCreditApplicable, true, "a large, profitable, commercial biopharma should remain credit-eligible")
  assert.ok(commercialBiopharmaCase.multiples.rdInvestmentFactor > 1, "commercial biopharma R&D above its (realistic, ~25%) sector norm should still earn a credit")

  // Even a pre-commercial biotech with a LOW rdPct gets no penalty (still credit-only in spirit).
  const preCommercialLowRd = runCase("pre-commercial biotech, low rdPct, still no penalty", {
    ...preCommercialBiotech.input, rdPct: 0.05,
  })
  assert.equal(preCommercialLowRd.multiples.rdInvestmentFactor, 1, "a pre-commercial biotech with low rdPct should still just be neutral (1.0), never penalized")

  console.log("eval system 2 valuation tests passed")
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAll()
}

export { runAll }
