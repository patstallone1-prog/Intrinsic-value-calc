import { DEFAULT_INPUTS, FIXTURES, TAXONOMY, computeValuation, deriveContext, impliedValueDifference, normalizeInputs } from "./valuationEngine.js"

const DRAFT_KEY = "eval-system-2-draft"
const DRAFT_META_KEY = "eval-system-2-ingestion"

function loadDraft() {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null")
    return saved ? normalizeInputs({ ...DEFAULT_INPUTS, ...saved }) : structuredClone(FIXTURES["Costco 2025 Public"])
  } catch {
    return structuredClone(FIXTURES["Costco 2025 Public"])
  }
}

function saveDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(state.inputs))
    localStorage.setItem(DRAFT_META_KEY, JSON.stringify({
      ticker: state.ticker,
      ingestionAudit: state.ingestionAudit,
      marketSnapshot: state.marketSnapshot,
      sourceNotes: state.sourceNotes,
    }))
  } catch {
    // Draft persistence is helpful, but valuation should keep working without storage.
  }
}

function loadIngestionMeta() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_META_KEY) || "null") || {}
  } catch {
    return {}
  }
}

const savedIngestionMeta = loadIngestionMeta()

const state = {
  inputs: loadDraft(),
  activeTab: "inputs",
  entryMode: "deterministic",
  step: 0,
  advanced: false,
  reviewAllFields: false,
  ticker: savedIngestionMeta.ticker || "",
  ingestionStatus: "",
  ingestionBusy: false,
  ingestionAudit: savedIngestionMeta.ingestionAudit || null,
  marketSnapshot: savedIngestionMeta.marketSnapshot || null,
  reportFile: null,
  extractionJson: "",
  extractionStatus: "",
  sourceNotes: savedIngestionMeta.sourceNotes || {},
  humanReview: [],
  screenerResults: null,
  screenerMeta: null,
  screenerLoading: false,
  screenerError: "",
  screenerSearch: "",
  screenerSort: { field: "impliedVsMarketPct", dir: "desc" },
  screenerFilters: { sector: "", minCapM: 100, maxCapM: "", minCoverage: 60, minUpside: "", basis: "", onlyComplete: false, hideSuspect: true },
  screenerRaw: [],
  screenerOverrides: {},
  screenerSubmitted: new Set(),
  screenerFormStatus: "",
  screenerFormPage: 1,
}

const fields = [
  { key: "companyName", label: "Company", type: "text", group: "Profile" },
  { key: "sector", label: "Sector", type: "select", options: TAXONOMY.sectors, group: "Profile" },
  { key: "businessModel", label: "Business Model", type: "select", options: TAXONOMY.businessModels, group: "Profile" },
  { key: "lifecycleStage", label: "Lifecycle", type: "select", options: TAXONOMY.lifecycleStages, group: "Profile" },
  { key: "capitalStatus", label: "Capital Status", type: "select", options: TAXONOMY.capitalStatuses, group: "Profile" },
  { key: "profitabilityStatus", label: "Profitability", type: "select", options: TAXONOMY.profitabilityStatuses, group: "Profile" },
  { key: "tam", label: "TAM", type: "money", group: "Market" },
  { key: "sam", label: "SAM", type: "money", group: "Market" },
  { key: "revenue", label: "Revenue", type: "money", group: "Financials" },
  { key: "revenueGrowth", label: "Revenue Growth", type: "percent", group: "Financials" },
  { key: "sectorCagr", label: "Sector CAGR", type: "percent", group: "Market" },
  { key: "grossMargin", label: "Gross Margin", type: "percent", group: "Financials" },
  { key: "retailRevenuePct", label: "Retail Sales Mix", type: "percent", group: "Financials" },
  { key: "retailGrossMargin", label: "Retail Sale Margin", type: "percent", group: "Financials" },
  { key: "subscriptionRevenuePct", label: "Subscription Mix", type: "percent", group: "Financials" },
  { key: "subscriptionGrossMargin", label: "Subscription Margin", type: "percent", group: "Financials" },
  { key: "marginChangeYoy", label: "Margin Change YoY", type: "percent", group: "Financials" },
  { key: "opexRatio", label: "OpEx Ratio", type: "percent", group: "Financials" },
  { key: "rdPct", label: "R&D % of Revenue", type: "percent", group: "Financials" },
  { key: "cash", label: "Cash", type: "money", group: "Capital" },
  { key: "debt", label: "Debt", type: "money", group: "Capital" },
  { key: "capexPct", label: "CapEx % Revenue", type: "percent", group: "Financials" },
  { key: "customerPrepaymentPct", label: "Customer Prepayment Credit", type: "percent", group: "Advanced", advanced: true },
  { key: "recurringRevenuePct", label: "Recurring Revenue", type: "percent", group: "Revenue Quality" },
  { key: "nrr", label: "NRR", type: "multiple", group: "Revenue Quality" },
  { key: "churn", label: "Monthly Churn", type: "percent", group: "Revenue Quality" },
  { key: "pipelineValue", label: "Pipeline Value", type: "money", group: "Revenue Quality" },
  { key: "pipelineConversion", label: "Pipeline Conversion", type: "percent", group: "Revenue Quality" },
  { key: "backlogValue", label: "Backlog Value", type: "money", group: "Backlog" },
  { key: "backlogConversion", label: "Backlog Conversion", type: "percent", group: "Backlog" },
  { key: "backlogGrossMargin", label: "Backlog Gross Margin", type: "percent", group: "Backlog" },
  { key: "contractDurationYears", label: "Contract Years", type: "number", group: "Backlog" },
  { key: "renewalProbability", label: "Renewal Probability", type: "percent", group: "Backlog" },
  { key: "competitorCount", label: "Comp Count", type: "number", group: "Direct Comps" },
  { key: "competitorEvRevenue", label: "Comp EV / Revenue", type: "multiple", group: "Direct Comps" },
  { key: "competitorEvEbitda", label: "Comp EV / EBITDA", type: "multiple", group: "Direct Comps" },
  { key: "competitorEvFcf", label: "Comp EV / FCF", type: "multiple", group: "Direct Comps" },
  { key: "competitorPe", label: "Comp P/E", type: "multiple", group: "Direct Comps" },
  { key: "competitorRevenueGrowth", label: "Comp Revenue Growth", type: "percent", group: "Direct Comps" },
  { key: "competitorGrossMargin", label: "Comp Gross Margin", type: "percent", group: "Direct Comps" },
  { key: "competitorEbitdaMargin", label: "Comp EBITDA Margin", type: "percent", group: "Direct Comps" },
  { key: "competitorNetMargin", label: "Comp Net Margin", type: "percent", group: "Direct Comps" },
  { key: "competitorNetDebtRevenue", label: "Comp Net Debt / Revenue", type: "multiple", group: "Direct Comps" },
  { key: "tangibleBookValue", label: "Tangible Book", type: "money", group: "Assets" },
  { key: "assetBackingValue", label: "Asset Backing", type: "money", group: "Assets" },
  { key: "asset1Type", label: "Asset 1 Type", type: "select", options: TAXONOMY.assetTypes, group: "Assets" },
  { key: "asset1Value", label: "Asset 1 Value", type: "money", group: "Assets" },
  { key: "asset2Type", label: "Asset 2 Type", type: "select", options: TAXONOMY.assetTypes, group: "Assets" },
  { key: "asset2Value", label: "Asset 2 Value", type: "money", group: "Assets" },
  { key: "asset3Type", label: "Asset 3 Type", type: "select", options: TAXONOMY.assetTypes, group: "Assets", advanced: true },
  { key: "asset3Value", label: "Asset 3 Value", type: "money", group: "Assets", advanced: true },
  { key: "asset4Type", label: "Asset 4 Type", type: "select", options: TAXONOMY.assetTypes, group: "Assets", advanced: true },
  { key: "asset4Value", label: "Asset 4 Value", type: "money", group: "Assets", advanced: true },
  { key: "asset5Type", label: "Asset 5 Type", type: "select", options: TAXONOMY.assetTypes, group: "Assets", advanced: true },
  { key: "asset5Value", label: "Asset 5 Value", type: "money", group: "Assets", advanced: true },
  { key: "asset6Type", label: "Asset 6 Type", type: "select", options: TAXONOMY.assetTypes, group: "Assets", advanced: true },
  { key: "asset6Value", label: "Asset 6 Value", type: "money", group: "Assets", advanced: true },
  { key: "roe", label: "ROE", type: "percent", group: "Assets" },
  { key: "rotce", label: "ROTCE", type: "percent", group: "Assets" },
  { key: "clientType", label: "Client Type", type: "select", options: TAXONOMY.clientTypes, group: "Brand" },
  { key: "brandGeographicReach", label: "Geographic Reach", type: "select", options: TAXONOMY.geographicReaches, group: "Brand" },
  { key: "yearsOperating", label: "Years Operating", type: "number", group: "Brand" },
  { key: "targetMarketRecognitionPct", label: "Market Recognition", type: "percent", group: "Brand" },
  { key: "customerTrustScore", label: "Customer Trust", type: "score", group: "Brand" },
  { key: "purchaseFrequency", label: "Purchase Frequency", type: "score", group: "Brand" },
  { key: "missionCriticality", label: "Mission Criticality", type: "score", group: "Brand" },
  { key: "consumerHabitStrength", label: "Consumer Habit Strength", type: "score", group: "Brand" },
  { key: "institutionalReliance", label: "Institutional Reliance", type: "score", group: "Brand" },
  { key: "competitionIntensity", label: "Competition Intensity", type: "score5", group: "Quality" },
  { key: "managementScore", label: "Management", type: "score", group: "Quality" },
  { key: "moatScore", label: "Moat", type: "score", group: "Quality" },
  { key: "gtmScore", label: "GTM", type: "score", group: "Quality" },
  { key: "switchingCostScore", label: "Switching Cost", type: "score", group: "Quality" },
  { key: "dataAdvantageScore", label: "Data Advantage", type: "score", group: "Strategic" },
  { key: "networkEffectScore", label: "Network Effects", type: "score", group: "Strategic" },
  { key: "ipScore", label: "IP", type: "score", group: "Strategic" },
  { key: "acquirerPool", label: "Acquirer Pool", type: "number", group: "Strategic" },
  { key: "strategicPremiumFlag", label: "Explicit Strategic Case", type: "checkbox", group: "Strategic" },
  { key: "techReadiness", label: "Tech Readiness", type: "score", group: "Risk" },
  { key: "regulatoryRisk", label: "Regulatory Risk", type: "score5", group: "Risk" },
  { key: "governanceRegime", label: "Governing Regime", type: "select", options: TAXONOMY.governanceRegimes, group: "Risk" },
  { key: "governmentPosture", label: "Government Posture", type: "select", options: TAXONOMY.governmentPostures, group: "Risk" },
  { key: "topCustomerRevenuePct", label: "Top Customer Revenue Share", type: "percent", group: "Risk" },
  { key: "topCustomerRelationshipTrend", label: "Top Customer Relationship Trend", type: "select", options: TAXONOMY.topCustomerRelationshipTrends, group: "Risk" },
  { key: "expectedDilution", label: "Expected Dilution", type: "percent", group: "Capital" },
  { key: "sharePrice", label: "Share Price", type: "money", group: "Public Market" },
  { key: "sharesOutstanding", label: "Shares Outstanding", type: "number", group: "Public Market" },
  { key: "marketCapOverride", label: "Market Cap Override", type: "money", group: "Public Market", advanced: true },
  { key: "dividendYield", label: "Dividend Yield", type: "percent", group: "Public Market" },
  { key: "eps", label: "EPS", type: "number", group: "Public Market" },
  { key: "terminalGrowth", label: "Terminal Growth", type: "percent", group: "Financials" },
  { key: "projectionYears", label: "Projection Years", type: "number", group: "Financials" },
  { key: "inventory", label: "Inventory", type: "money", group: "Advanced", advanced: true },
  { key: "ar", label: "AR", type: "money", group: "Advanced", advanced: true },
  { key: "ap", label: "AP", type: "money", group: "Advanced", advanced: true },
  { key: "buybackYield", label: "Buyback Yield", type: "percent", group: "Advanced", advanced: true },
]

const wizardSteps = [
  { title: "Brand", groups: ["Brand"] },
  { title: "Durability", groups: ["Quality", "Strategic"] },
  { title: "Risk", groups: ["Risk"] },
]

const QUALITATIVE_GROUPS = new Set(["Brand", "Quality", "Strategic", "Risk"])

function cleanIngestionBase(current) {
  const clean = { ...DEFAULT_INPUTS, tags: [] }
  for (const field of fields) {
    if (QUALITATIVE_GROUPS.has(field.group)) {
      clean[field.key] = current[field.key]
      continue
    }
    if (field.key === "terminalGrowth" || field.key === "projectionYears") continue
    if (field.type === "select") clean[field.key] = field.key.startsWith("asset") ? "None" : DEFAULT_INPUTS[field.key]
    else if (field.type === "text") clean[field.key] = ""
    else if (field.type === "checkbox") clean[field.key] = false
    else clean[field.key] = 0
  }
  return clean
}

const automationCoreFields = [
  "companyName", "sector", "businessModel", "lifecycleStage", "capitalStatus", "profitabilityStatus",
  "revenue", "revenueGrowth", "sectorCagr", "grossMargin", "opexRatio", "cash", "debt", "capexPct",
  "competitorCount", "competitorEvRevenue", "competitorEvEbitda", "competitorEvFcf", "competitorPe",
  "competitorRevenueGrowth", "competitorGrossMargin", "competitorEbitdaMargin", "competitorNetMargin", "competitorNetDebtRevenue",
  "tam", "sam", "marketCapOverride", "sharePrice", "sharesOutstanding", "eps",
]

const automationJudgmentFields = [
  "clientType", "brandGeographicReach", "yearsOperating", "targetMarketRecognitionPct", "customerTrustScore",
  "purchaseFrequency", "missionCriticality", "consumerHabitStrength", "institutionalReliance",
  "competitionIntensity", "managementScore", "moatScore", "gtmScore", "switchingCostScore",
  "dataAdvantageScore", "networkEffectScore", "ipScore", "governanceRegime", "governmentPosture",
]

const fieldMap = Object.fromEntries(fields.map((field) => [field.key, field]))

function fieldLabel(key) {
  return fieldMap[key]?.label || key
}

function valueMissing(key, value, input) {
  if (key === "companyName") return !String(value || "").trim() || value === DEFAULT_INPUTS.companyName
  if (key === "marketCapOverride") return input.capitalStatus === "Public" && !(input.marketCapOverride > 0 || (input.sharePrice > 0 && input.sharesOutstanding > 0))
  if (["sharePrice", "sharesOutstanding"].includes(key)) return input.capitalStatus === "Public" && !(input.marketCapOverride > 0 || (input.sharePrice > 0 && input.sharesOutstanding > 0))
  if (key === "eps") return input.capitalStatus === "Public" && !(value > 0)
  if (key === "competitorPe") return input.capitalStatus === "Public" && !(value > 0) && ["FCF Positive", "Profitable"].includes(input.profitabilityStatus)
  if (key === "competitorEvEbitda") return !(value > 0) && ["FCF Positive", "Profitable"].includes(input.profitabilityStatus)
  if (key === "competitorEvFcf") return !(value > 0) && input.profitabilityStatus === "FCF Positive"
  if (typeof value === "string") return value.trim() === ""
  if (Array.isArray(value)) return value.length === 0
  return !(Number(value) !== 0)
}

function automationReview(input) {
  const normalized = normalizeInputs(input)
  const missing = automationCoreFields
    .filter((key) => valueMissing(key, normalized[key], normalized))
    .map((key) => fieldLabel(key))
  const subjective = automationJudgmentFields.map((key) => ({
    key,
    label: fieldLabel(key),
    value: formatValue(normalized[key], fieldMap[key]?.type),
  }))
  return { missing, subjective }
}

function automationPrompt() {
  const schema = fields.map((field) => {
    const type = field.type === "money" ? "number in USD" : field.type === "percent" ? "decimal ratio, not percent text" : field.type
    const options = field.options ? ` options=${field.options.join(" | ")}` : ""
    return `${field.key}: ${type}${options}`
  }).join("\n")
  return `You are preparing inputs for Eval System 2, a classification-aware valuation engine. Extract and estimate a complete JSON payload from the attached annual report, 10-K/20-F/financial report, investor presentation, and current market data.

Return only valid JSON with this shape:
{
  "inputs": { ...all available engine fields... },
  "sourceNotes": { "fieldName": "source or calculation used" },
  "humanReview": [{ "field": "fieldName", "reason": "why the value needs review" }]
}

Rules:
- Use numeric values only. Money is USD. Percent fields are decimal ratios: 12.5% becomes 0.125.
- Prefer latest fiscal year annual values. Use trailing twelve months only when annual data is unavailable; note it.
- Revenue growth = (latest annual revenue - prior annual revenue) / prior annual revenue.
- Gross margin = gross profit / revenue. OpEx ratio = operating expenses / revenue, where operating expenses are gross profit minus operating income if the report does not label total operating expenses cleanly.
- Debt should be interest-bearing debt, finance leases, notes payable, and short-term borrowings. Do not treat bank customer deposits as ordinary debt for a bank.
- Cash should include cash, equivalents, and marketable securities unless restricted.
- CapEx % revenue = capital expenditures / revenue.
- AR, AP, and inventory should come from the balance sheet when material to the business.
- Market cap comes from share price times diluted/basic shares outstanding, or a current quote service. Use marketCapOverride when available.
- EPS should be diluted EPS from continuing operations when available.
- Direct competitor multiples should come from 4-8 close public peers, same business model first, same sector second. Include EV/revenue, EV/EBITDA, EV/FCF, P/E, peer revenue growth, peer gross margin, peer EBITDA margin, peer net margin, and peer net debt/revenue.
- TAM/SAM and sector CAGR may come from market reports, company filings, industry associations, or analyst consensus. Use conservative base-case numbers and flag if estimated.
- For brand/qualitative inputs, estimate from evidence and flag the estimate. Customer recognition is target-market recognition, not general-population awareness.
- Do not infer a high moat from a strong brand twice. Brand inputs measure demand-side trust/recognition/habit. Moat inputs measure structural defensibility.

Engine field schema:
${schema}`
}

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: Math.abs(value) >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(value) >= 1_000_000 ? 1 : 0,
  }).format(value || 0)
}

function pct(value, digits = 0) {
  return `${((value || 0) * 100).toFixed(digits)}%`
}

function signedHtml(text, value) {
  return Number(value) < 0 ? `<span class="negative" title="Negative value">${text}</span>` : text
}

function moneyHtml(value) {
  return signedHtml(money(value), value)
}

function pctHtml(value, digits = 0) {
  return signedHtml(pct(value, digits), value)
}

function periodBasisLabel(basis) {
  if (basis === "ttm") return "Trailing twelve months (10-K + later 10-Qs)"
  if (basis === "quarterly-annualized") return "Latest quarter x 4 (annualized)"
  return "Annual filing"
}

function formatValue(value, type) {
  if (type === "money") return money(value)
  if (type === "percent") return pct(value, 1)
  if (type === "multiple") return `${Number(value || 0).toFixed(2)}x`
  if (type === "checkbox") return value ? "Yes" : "No"
  return String(value ?? "")
}

function inputDisplayValue(value, type) {
  if (type === "percent") return Math.round((value || 0) * 1000) / 10
  return value
}

function parseInputValue(value, type, checked) {
  if (type === "checkbox") return checked
  const numeric = Number(value)
  if (type === "percent") return Number.isFinite(numeric) ? numeric / 100 : 0
  if (["money", "number", "score", "score5", "multiple"].includes(type)) return Number.isFinite(numeric) ? numeric : 0
  return value
}

function fieldVisible(field, context) {
  if (field.advanced) {
    if (["inventory", "ar", "ap"].includes(field.key)) return context.modules.inventoryRelevant
    if (field.key === "customerPrepaymentPct") return state.inputs.backlogValue > 0 || state.inputs.customerPrepaymentPct > 0
    if (/^asset[3-6](Type|Value)$/.test(field.key)) {
      const slot = field.key.match(/^asset([3-6])/)[1]
      return state.inputs[`asset${slot}Value`] > 0 || state.inputs[`asset${slot}Type`] !== "None"
    }
    return false
  }
  if (field.group === "Backlog") return context.modules.regulated || context.modules.assetHeavy || context.relevance.maturity < 0.75 || state.inputs.backlogValue > 0
  if (field.group === "Direct Comps") return true
  if (["tangibleBookValue", "assetBackingValue", "roe", "rotce"].includes(field.key)) return context.modules.financial || context.modules.assetHeavy || state.inputs.tangibleBookValue > 0 || state.inputs.assetBackingValue > 0
  if (/^asset[1-2](Type|Value)$/.test(field.key)) return true
  if (["retailRevenuePct", "retailGrossMargin", "subscriptionRevenuePct", "subscriptionGrossMargin"].includes(field.key)) {
    return context.modules.assetHeavy || context.modules.recurring || state.inputs.retailRevenuePct > 0 || state.inputs.subscriptionRevenuePct > 0
  }
  if (["recurringRevenuePct", "nrr", "churn"].includes(field.key)) return context.modules.recurring
  if (["pipelineValue", "pipelineConversion"].includes(field.key)) return context.modules.recurring || context.modules.marketplace || context.relevance.maturity < 0.75 || state.inputs.pipelineValue > 0
  if (["managementScore", "gtmScore"].includes(field.key)) return context.relevance.management > 0.38
  if (["dataAdvantageScore", "networkEffectScore", "ipScore", "acquirerPool", "strategicPremiumFlag"].includes(field.key)) {
    return context.relevance.strategicOptionality > 0.08 || state.inputs.strategicPremiumFlag
  }
  if (field.key === "consumerHabitStrength") return ["Consumers", "Mixed / Multiple"].includes(state.inputs.clientType)
  if (field.key === "institutionalReliance") return state.inputs.clientType !== "Consumers"
  if (["switchingCostScore", "moatScore"].includes(field.key)) return true
  if (["techReadiness", "regulatoryRisk"].includes(field.key)) return context.modules.regulated || context.modules.rAndD
  if (["buybackYield", "dividendYield", "sharePrice", "sharesOutstanding", "marketCapOverride"].includes(field.key)) return state.inputs.capitalStatus === "Public"
  return true
}

function option(value, selectedValue) {
  return `<option value="${escapeHtml(value)}" ${value === selectedValue ? "selected" : ""}>${escapeHtml(value)}</option>`
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function renderField(field) {
  const value = state.inputs[field.key]
  const sourceStatus = state.ingestionAudit?.fieldStatus?.[field.key]
  const unknownAfterIngestion = Boolean(state.ingestionAudit && !state.ingestionAudit.error) && sourceStatus === undefined
    && !QUALITATIVE_GROUPS.has(field.group) && ["money", "number", "percent", "multiple"].includes(field.type)
    && typeof value === "number" && value === 0
  const isMissingNumeric = (sourceStatus === "missing" || unknownAfterIngestion) && typeof value === "number" && value === 0
  const sourceText = sourceStatus === "measured-zero"
    ? "Measured zero from source"
    : sourceStatus === "missing"
      ? "Missing - enter or verify"
      : unknownAfterIngestion
        ? "Not provided by any source - enter if known"
      : sourceStatus === "manual-zero"
        ? "Manual zero"
        : formatValue(value, field.type)
  if (field.type === "select") {
    return `
      <label class="field">
        <span>${field.label}</span>
        <select data-field="${field.key}">
          ${field.options.map((item) => option(item, value)).join("")}
        </select>
      </label>
    `
  }
  if (field.type === "checkbox") {
    return `
      <label class="field field--checkbox">
        <input type="checkbox" data-field="${field.key}" ${value ? "checked" : ""} />
        <span>${field.label}</span>
      </label>
    `
  }
  const min = field.type === "score" || field.type === "score5" ? "1" : ""
  const max = field.type === "score" ? "10" : field.type === "score5" ? "5" : ""
  const step = field.type === "money" ? "1000" : field.type === "number" ? "1" : "0.1"
  const isNegative = typeof value === "number" && value < 0
  return `
    <label class="field ${isNegative ? "field--negative" : ""}">
      <span>${field.label}${isNegative ? ` <em class="negative-badge">negative</em>` : ""}</span>
      <input data-field="${field.key}" type="${field.type === "text" ? "text" : "number"}" value="${isMissingNumeric ? "" : escapeHtml(inputDisplayValue(value, field.type))}" min="${min}" max="${max}" step="${step}" />
      <small class="${sourceStatus === "missing" || unknownAfterIngestion ? "field-source--missing" : sourceStatus === "measured-zero" || sourceStatus === "manual-zero" ? "field-source--verified" : isNegative ? "field-source--negative" : ""}">${escapeHtml(sourceText)}</small>
    </label>
  `
}

function renderTags() {
  const selected = new Set(state.inputs.tags || [])
  return `
    <section class="panel">
      <div class="section-title">
        <h2>Tags</h2>
        <button class="ghost" data-action="toggle-advanced">${state.advanced ? "Hide Advanced" : "Show Advanced"}</button>
      </div>
      <div class="tag-grid">
        ${TAXONOMY.tags.map((tag) => `
          <label class="tag ${selected.has(tag) ? "tag--selected" : ""}">
            <input type="checkbox" data-tag="${escapeHtml(tag)}" ${selected.has(tag) ? "checked" : ""} />
            <span>${escapeHtml(tag)}</span>
          </label>
        `).join("")}
      </div>
    </section>
  `
}

function renderInputs() {
  const context = deriveContext(normalizeInputs(state.inputs))
  const visibleFields = fields.filter((field) => !field.advanced && fieldVisible(field, context))
  const stepIndex = Math.max(0, Math.min(state.step, wizardSteps.length - 1))
  state.step = stepIndex
  const step = wizardSteps[stepIndex]
  const stepFields = visibleFields.filter((field) => step.groups.includes(field.group))
  const groups = [...new Set(stepFields.map((field) => field.group))]
  return `
    <div class="wizard">
      <section class="panel wizard-shell">
        <div class="wizard-steps">
          ${wizardSteps.map((item, index) => `
            <button data-step="${index}" class="${index === stepIndex ? "active" : ""}">
              <span>${index + 1}</span>
              ${escapeHtml(item.title)}
            </button>
          `).join("")}
        </div>
      </section>
      <div class="input-layout">
        ${groups.map((group) => `
          <section class="panel">
            <div class="section-title">
              <h2>${group}</h2>
            </div>
            <div class="field-grid">
              ${stepFields.filter((field) => field.group === group).map(renderField).join("")}
            </div>
          </section>
        `).join("")}
        <section class="panel wizard-actions">
          <button class="ghost" data-action="prev-step" ${stepIndex === 0 ? "disabled" : ""}>Previous</button>
          <div>
            <strong>${stepIndex + 1} / ${wizardSteps.length}</strong>
          </div>
          <button class="primary" data-action="${stepIndex === wizardSteps.length - 1 ? "run-valuation" : "next-step"}">${stepIndex === wizardSteps.length - 1 ? "View Valuation" : "Next"}</button>
        </section>
      </div>
    </div>
  `
}

function renderAllFieldsReview() {
  const context = deriveContext(normalizeInputs(state.inputs))
  const visibleFields = fields.filter((field) => state.advanced || fieldVisible(field, context))
  const groups = [...new Set(visibleFields.map((field) => field.group))]
  const crossChecks = state.ingestionAudit?.crossChecks || []
  const matchedChecks = crossChecks.filter((check) => check.status === "matched").length
  const measuredZeros = Object.values(state.ingestionAudit?.fieldStatus || {}).filter((status) => status === "measured-zero").length
  const auditIssues = [
    ...(state.ingestionAudit?.missing || []).map((field) => `Missing: ${fieldLabel(field)}`),
    ...(state.ingestionAudit?.warnings || []),
  ]
  return `
    <section class="panel review-all-panel">
      <div class="section-title">
        <div>
          <p class="eyebrow">Exception review</p>
          <h2>All Engine Fields</h2>
        </div>
        <div class="section-actions">
          <button class="ghost" data-action="toggle-advanced">${state.advanced ? "Hide Optional Fields" : "Show Optional Fields"}</button>
          <button class="ghost" data-action="toggle-review-all">Close</button>
        </div>
      </div>
      <p class="muted">Edit only a value that the source audit marks missing or incorrect. Derived ratios will be replaced by your explicit override.</p>
      ${(crossChecks.length || measuredZeros) ? `
        <div class="source-strip">
          ${crossChecks.length ? `<span class="pill">${matchedChecks}/${crossChecks.length} cross-source checks matched</span>` : ""}
          ${measuredZeros ? `<span class="pill">${measuredZeros} measured zero${measuredZeros === 1 ? "" : "s"}</span>` : ""}
        </div>
      ` : ""}
      ${auditIssues.length ? `<div class="warning-list">${auditIssues.map((issue) => `<div class="warning">${escapeHtml(issue)}</div>`).join("")}</div>` : ""}
      ${groups.map((group) => `
        <div class="review-field-group">
          <h3>${escapeHtml(group)}</h3>
          <div class="field-grid">${visibleFields.filter((field) => field.group === group).map(renderField).join("")}</div>
        </div>
      `).join("")}
    </section>
  `
}

function unfilledInputFields() {
  const audit = state.ingestionAudit
  if (!audit || audit.error) return []
  const normalized = normalizeInputs(state.inputs)
  const context = deriveContext(normalized)
  const keys = []
  const seen = new Set()
  const add = (key) => {
    if (seen.has(key) || !fieldMap[key]) return
    seen.add(key)
    keys.push(key)
  }
  for (const [key, status] of Object.entries(audit.fieldStatus || {})) if (status === "missing") add(key)
  for (const field of fields) {
    if (QUALITATIVE_GROUPS.has(field.group)) continue
    if (["select", "checkbox"].includes(field.type)) continue
    if (["terminalGrowth", "projectionYears"].includes(field.key)) continue
    const status = audit.fieldStatus?.[field.key]
    if (status && status !== "missing") continue
    if (!fieldVisible(field, context)) continue
    if (valueMissing(field.key, normalized[field.key], normalized)) add(field.key)
  }
  return keys.map((key) => fieldMap[key])
}

function renderNeedsAttention() {
  const missingFields = unfilledInputFields()
  if (!missingFields.length) return ""
  const groups = new Map()
  for (const field of missingFields) {
    const group = field.group || "Other"
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group).push(field)
  }
  return `
    <section class="panel needs-attention-panel">
      <div class="section-title">
        <div>
          <p class="eyebrow">Action needed</p>
          <h2>${missingFields.length} input${missingFields.length === 1 ? "" : "s"} could not be filled</h2>
        </div>
        <button class="primary" data-tab="results">See results</button>
      </div>
      <p class="muted">Every value below is one no connected source could supply. Fill in what you know here - all at once - then open results. Anything left blank stays at zero and is treated as unknown by the engine.</p>
      ${[...groups.entries()].map(([group, groupFields]) => `
        <div class="needs-attention-group">
          <h3>${escapeHtml(group)} <span class="muted">${groupFields.length}</span></h3>
          <div class="field-grid">${groupFields.map(renderField).join("")}</div>
        </div>
      `).join("")}
      <div class="intake-actions">
        <button class="primary" data-tab="results">Run valuation with these inputs</button>
      </div>
    </section>
  `
}

function renderAutoIntake() {
  const review = automationReview(state.inputs)
  const file = state.reportFile
  const audit = state.ingestionAudit
  const crossChecks = audit?.crossChecks || []
  const matchedChecks = crossChecks.filter((check) => check.status === "matched").length
  return `
    <div class="auto-layout">
      <section class="panel intake-panel">
        <div class="section-title">
          <div>
            <p class="eyebrow">Deterministic ingestion</p>
            <h2>Load a Public Company</h2>
          </div>
          <span class="pill">AI off</span>
        </div>
        <div class="ticker-entry">
          <label class="field">
            <span>Ticker</span>
            <input data-ticker type="text" maxlength="12" value="${escapeHtml(state.ticker)}" placeholder="COST" autocomplete="off" />
          </label>
          <button class="primary" data-action="ingest-company" ${state.ingestionBusy ? "disabled" : ""}>${state.ingestionBusy ? "Loading..." : "Load Financials"}</button>
        </div>
        ${state.ingestionStatus ? `<div class="status-line ${audit?.error ? "status-line--error" : ""}">${escapeHtml(state.ingestionStatus)}</div>` : ""}
        <div class="auto-grid">
          <div>
            <span>Coverage</span>
            <strong>${audit ? `${Math.round((audit.coverage?.percent || 0) * 100)}%` : "Not loaded"}</strong>
          </div>
          <div>
            <span>Sources</span>
            <strong>${audit ? audit.providers.length : 0}</strong>
          </div>
          <div>
            <span>Review Flags</span>
            <strong>${audit ? audit.warnings.length + audit.missing.length : review.missing.length}</strong>
          </div>
        </div>
        ${audit ? `
          <div class="source-strip">
            ${(audit.providers || []).map((provider) => `<span class="pill">${escapeHtml(provider)}</span>`).join("")}
            <span class="muted">Financial period ${escapeHtml(audit.periodEnd || "unknown")}</span>
            <span class="pill ${audit.periodBasis === "quarterly-annualized" ? "pill--warn" : ""}" title="Basis for revenue, margins, cash flows and other flow figures">${escapeHtml(periodBasisLabel(audit.periodBasis))}</span>
            ${crossChecks.length ? `<span class="muted">${matchedChecks}/${crossChecks.length} independent checks matched</span>` : ""}
          </div>
          ${(audit.warnings.length || audit.missing.length) ? `
            <div class="review-alert">
              <strong>${audit.warnings.length + audit.missing.length} items need attention</strong>
              <span>Open all fields to inspect missing values and provider conflicts.</span>
            </div>
          ` : ""}
        ` : ""}
        <div class="intake-actions">
          <button class="ghost" data-action="toggle-review-all">${state.reviewAllFields ? "Close All Fields" : "Review All Fields"}</button>
        </div>
      </section>

      ${renderNeedsAttention()}
      ${state.reviewAllFields ? renderAllFieldsReview() : renderInputs()}

      <details class="panel ai-fallback">
        <summary>
          <span>AI fallback</span>
          <span class="pill">Disabled by default</span>
        </summary>
        <p class="muted">This path never runs automatically. It remains available for unsupported filings after explicit server configuration and human review.</p>
        <label class="upload-box upload-box--compact">
          <input data-action="upload-report" type="file" accept="application/pdf,.pdf" />
          <strong>Attach report for exception review</strong>
          <span>${file ? `${escapeHtml(file.name)} / ${(file.size / 1_000_000).toFixed(2)} MB` : "No model call is made when a file is selected"}</span>
        </label>
        <div class="section-title">
          <h3>Audited JSON override</h3>
          <button class="ghost" data-action="apply-extraction">Apply JSON</button>
        </div>
        <textarea class="json-box" data-extraction-json spellcheck="false">${escapeHtml(state.extractionJson)}</textarea>
        ${state.extractionStatus ? `<div class="status-line">${escapeHtml(state.extractionStatus)}</div>` : ""}
        <button class="ghost" data-action="copy-auto-prompt">Copy AI Prompt</button>
      </details>
    </div>
  `
}

function signalLabel(key) {
  return {
    growthCredibility: "Growth Credibility",
    brandDurability: "Brand Durability",
    durability: "Durability (composite)",
    revenueQuality: "Revenue Quality",
    profitabilityQuality: "Profitability Quality",
    coreFinancialJustification: "Financial Justification",
    marketMultiplePressure: "Multiple Pressure",
    capitalBurden: "Capital Burden",
    capitalReturns: "Capital Returns",
    jurisdictionQuality: "Jurisdiction / Regime",
    customerConcentration: "Customer Concentration",
    marginConversion: "Margin Conversion",
    workingCapitalPressure: "Working Capital Pressure",
    marketAnchorReliability: "Market Anchor",
    sizeEvidence: "Size Evidence",
    sectorMomentum: "Sector Momentum",
    marketPotential: "Market Potential",
    pipelineOpportunity: "Pipeline Opportunity",
    leverageDeclineDrag: "Leverage / Decline Drag",
    dividendDurability: "Dividend Durability",
    strategicScarcity: "Strategic Scarcity",
    executionDependency: "Execution Dependency",
    probabilityUncertainty: "Probability Uncertainty",
    tagStackingPressure: "Stacking Pressure",
  }[key] || key
}

function renderRail(signal) {
  return `
    <div class="rail">
      <div class="rail__top">
        <strong>${signalLabel(signal.key)}</strong>
        <span>${pct(signal.effective)}</span>
      </div>
      <div class="rail__track"><span style="width:${Math.max(0, Math.min(signal.effective, 1)) * 100}%"></span></div>
      <small>${signal.layers.join(" / ")}${signal.capped ? " / capped" : ""}</small>
    </div>
  `
}

function renderResults(result) {
  const warnings = [...result.errors.map((item) => `Error: ${item}`), ...result.warnings]
  const comparison = result.ledger.budgets.financialComparison
  // Headline comparison anchors to the REAL, current market value — a 20-day trailing
  // average can diverge sharply from today's actual price after a rally/selloff, which
  // previously made "implied vs market" wildly misleading (e.g. showing 70% upside on a
  // $1.1B implied value against a real $1B market cap). The average is still shown as
  // supplementary context below, never as the primary percentage's denominator.
  const currentMarketValue = state.marketSnapshot?.currentMarketCap || result.tracks.market.paths.observedEquity || 0
  const averageMarketValue = state.marketSnapshot?.averageMarketCap || 0
  const valueDifference = impliedValueDifference(result.outputs.fairCommonEquity, currentMarketValue)
  const averageWindow = state.marketSnapshot?.tradingDays || 0
  const averageDiffersMeaningfully = averageMarketValue > 0 && currentMarketValue > 0 && Math.abs(averageMarketValue - currentMarketValue) / currentMarketValue > 0.01
  const trackRows = [
    ["DCF", "dcf", result.tracks.dcf],
    ["Direct Comps", "directComps", result.tracks.directComps],
    ["Industry Baseline", "industry", result.tracks.industry],
    ["Public Market", "publicMarket", result.tracks.publicMarket],
    ["Pipeline / Backlog", "pipeline", result.tracks.pipeline],
    ["Asset / Book", "asset", result.tracks.asset],
    ["Strategic", "strategic", result.tracks.strategic],
  ]
  return `
    <div class="results-layout">
      <section class="panel hero-panel">
        <div class="valuation-comparison">
          <div>
            <p class="eyebrow">Estimated fair value</p>
            <h2>${moneyHtml(result.outputs.fairCommonEquity)}</h2>
            <p class="muted">Range ${moneyHtml(result.bands.final.low)} - ${moneyHtml(result.bands.final.high)}</p>
          </div>
          <div class="market-value-block">
            <p class="eyebrow">Current market value</p>
            <h3>${currentMarketValue > 0 ? moneyHtml(currentMarketValue) : "Unavailable"}</h3>
            ${averageDiffersMeaningfully ? `<p class="muted">${averageWindow}-day avg ${moneyHtml(averageMarketValue)}</p>` : ""}
          </div>
          <div class="difference-block ${valueDifference !== null && valueDifference < 0 ? "difference-block--negative" : ""}">
            <span>Implied vs current market</span>
            <strong>${valueDifference === null ? "N/A" : `${valueDifference >= 0 ? "+" : ""}${pctHtml(valueDifference, 1)}`}</strong>
            <small>${valueDifference === null ? "Load market data to compare" : `(implied value - current market value) / current market value`}</small>
          </div>
        </div>
        <div>
          <p class="eyebrow">${escapeHtml(result.input.companyName)}</p>
          <p class="muted">${escapeHtml(result.input.sector)} / ${escapeHtml(result.input.businessModel)}</p>
        </div>
        <div class="hero-metrics">
          <div><span>Confidence</span><strong>${pctHtml(result.bands.quality, 0)}</strong></div>
          <div><span>Effective Growth</span><strong>${pctHtml(result.growth.effectiveGrowth, 1)}</strong></div>
          <div><span>Discount Rate</span><strong>${pctHtml(result.discount.rate, 1)}</strong></div>
        </div>
      </section>

      <section class="panel">
        <div class="section-title"><h2>Track Construction</h2></div>
        <div class="track-grid">
          ${trackRows.map(([label, key, track]) => `
            <article class="track-card ${track?.active === false || !track?.rawEV ? "track-card--muted" : ""}">
              <span>${label}</span>
              <strong>${moneyHtml(track?.rawEV || 0)}</strong>
              <small>Weight ${pctHtml(result.final.trackWeights[key] || 0)} / confidence ${pctHtml(track?.confidence || 0)}</small>
            </article>
          `).join("")}
        </div>
      </section>

      <section class="panel">
        <div class="section-title">
          <h2>Signal Ledger</h2>
          <span class="${result.ledger.capsTriggered.length ? "pill pill--warn" : "pill"}">${result.ledger.capsTriggered.length} caps active</span>
        </div>
        <div class="ledger-grid">
          <div class="budget-card">
            <span>Tag Budget</span>
            <strong>${pctHtml(result.ledger.budgets.tagBudgetMultiplier - 1, 1)}</strong>
            <small>Positive overlap cannot become an uncapped premium.</small>
          </div>
          <div class="budget-card">
            <span>Quality Budget</span>
            <strong>${pctHtml(result.ledger.budgets.qualityBudget.market - 1, 1)}</strong>
            <small>Market quality adjustment after shared signal caps.</small>
          </div>
          <div class="signal-stack">
            ${result.ledger.topSignals.map(renderRail).join("")}
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="section-title"><h2>Details</h2></div>
        <div class="detail-grid">
          <div><span>EV / Revenue</span><strong>${result.multiples.evRevenue.toFixed(2)}x</strong></div>
          <div><span>EV / EBITDA</span><strong>${result.multiples.evEbitda.toFixed(2)}x</strong></div>
          <div><span>EV / FCF</span><strong>${result.multiples.evFcf.toFixed(2)}x</strong></div>
          <div><span>Current EV / Revenue</span><strong>${(comparison.observed.evRevenue || 0).toFixed(2)}x</strong></div>
          <div><span>Current EV / EBITDA</span><strong>${(comparison.observed.evEbitda || 0).toFixed(2)}x</strong></div>
          <div><span>Current P/E</span><strong>${(comparison.observed.pe || 0).toFixed(2)}x</strong></div>
          <div><span>Peer EV / Revenue</span><strong>${(comparison.peer.evRevenue || 0).toFixed(2)}x</strong></div>
          <div><span>Peer EV / EBITDA</span><strong>${(comparison.peer.evEbitda || 0).toFixed(2)}x</strong></div>
          <div><span>Peer P/E</span><strong>${(comparison.peer.pe || 0).toFixed(2)}x</strong></div>
          <div><span>Financial Justification</span><strong>${pctHtml(result.ledger.signals.coreFinancialJustification.effective, 0)}</strong></div>
          <div><span>Unsupported Premium</span><strong>${pctHtml(result.ledger.signals.marketMultiplePressure.effective, 0)}</strong></div>
          <div><span>Premium vs Peers</span><strong>${pctHtml(comparison.multiplePremium || 0, 1)}</strong></div>
          ${result.multiples.softwareDurabilityGate !== 1 ? `<div><span>Software Durability Gate</span><strong>${pctHtml(result.multiples.softwareDurabilityGate - 1, 1)}</strong></div>` : ""}
          ${result.multiples.marginQualityFactor !== 1 ? `<div><span>Margin Durability</span><strong>${pctHtml(result.multiples.marginQualityFactor - 1, 1)}</strong></div>` : ""}
          ${result.multiples.rdInvestmentFactor !== 1 ? `<div><span>R&D Investment Credit</span><strong>${pctHtml(result.multiples.rdInvestmentFactor - 1, 1)}</strong></div>` : ""}
          ${result.input.rdPct > 0 ? `<div><span>R&D % of Revenue vs Sector Norm</span><strong>${pctHtml(result.input.rdPct, 1)} vs ${pctHtml(result.multiples.sectorRdNorm, 1)}</strong></div>` : ""}
          <div><span>Gross Margin</span><strong>${pctHtml(result.margins.grossMargin, 1)}</strong></div>
          ${result.margins.marginBlendActive ? `<div><span>Base Gross Margin</span><strong>${pctHtml(result.margins.inputGrossMargin, 1)}</strong></div>` : ""}
          ${result.margins.marginBlendActive ? `<div><span>Subscription Gross Contribution</span><strong>${pctHtml(result.margins.subscriptionGrossContribution, 1)}</strong></div>` : ""}
          <div><span>EBITDA Margin</span><strong>${pctHtml(result.margins.ebitdaMargin, 1)}</strong></div>
          <div><span>Net Margin</span><strong>${pctHtml(result.margins.netMargin, 1)}</strong></div>
          <div><span>FCF Margin</span><strong>${pctHtml(result.margins.fcfMargin, 1)}</strong></div>
          <div><span>DCF Margin Trend</span><strong>${pctHtml(result.tracks.dcf.marginTrajectory?.appliedTrend || 0, 1)}</strong></div>
          <div><span>Working Capital Drag</span><strong>${pctHtml(result.margins.workingCapitalDrag, 1)}</strong></div>
          ${result.margins.customerPrepaymentCredit > 0 ? `<div><span>Customer Prepayment Credit</span><strong>${pctHtml(result.margins.customerPrepaymentCredit, 1)}</strong></div>` : ""}
          <div><span>Growth Credibility</span><strong>${pctHtml(result.growth.credibility, 0)}</strong></div>
          <div><span>Market Potential</span><strong>${pctHtml(result.ledger.signals.marketPotential.effective, 0)}</strong></div>
          <div><span>Low Competition</span><strong>${pctHtml(result.ledger.signals.lowDirectCompetition.effective, 0)}</strong></div>
          <div><span>Moat Strength</span><strong>${pctHtml(result.ledger.signals.moatStrength.effective, 0)}</strong></div>
          <div><span>Brand Durability</span><strong>${pctHtml(result.ledger.signals.brandDurability.effective, 0)}</strong></div>
          <div><span>Durability (composite)</span><strong>${pctHtml(result.ledger.signals.durability.effective, 0)}</strong></div>
          <div><span>Brand Relevance</span><strong>${pctHtml(result.context.brand.relevance, 0)}</strong></div>
          <div><span>Pipeline Signal</span><strong>${pctHtml(result.ledger.signals.pipelineOpportunity.effective, 0)}</strong></div>
          <div><span>Pipeline Credit</span><strong>${moneyHtml(result.tracks.market.paths.pipelineRevenueCredit)}</strong></div>
          <div><span>Probability Layer</span><strong>${result.probability.active ? pctHtml(result.probability.combined, 0) : "Inactive"}</strong></div>
          <div><span>Net Debt</span><strong>${moneyHtml(result.margins.netDebt)}</strong></div>
          <div><span>Net Working Capital</span><strong>${moneyHtml(result.margins.netWorkingCapital)}</strong></div>
          <div><span>Market Share</span><strong>${result.context.size.marketKnown ? pctHtml(result.context.size.marketShare, 2) : "N/A"}</strong></div>
          <div><span>Market Size Score</span><strong>${result.context.size.marketKnown ? pctHtml(result.context.size.marketSizeScore, 0) : "Neutral / unavailable"}</strong></div>
          <div><span>Size Class</span><strong>${escapeHtml(result.context.size.className)}</strong></div>
          <div><span>Observed Market Cap</span><strong>${moneyHtml(result.tracks.market.paths.observedEquity)}</strong></div>
          <div><span>Market Evidence Weight</span><strong>${pctHtml(result.tracks.market.paths.publicEvidenceWeight, 0)}</strong></div>
          <div><span>Calculated Asset Backing</span><strong>${moneyHtml(result.tracks.asset.paths.calculatedAssetBacking || 0)}</strong></div>
          <div><span>Asset Split Adjusted</span><strong>${moneyHtml(result.tracks.asset.paths.assetSplit?.adjustedValue || 0)}</strong></div>
          <div><span>Asset Liquidation Value</span><strong>${moneyHtml(result.tracks.asset.paths.assetSplit?.liquidationValue || 0)}</strong></div>
          ${(result.tracks.asset.paths.membershipMetrics?.recurringRevenue || 0) > 0 ? `<div><span>Membership Multiple</span><strong>${(result.tracks.asset.paths.membershipMetrics?.multiple || 0).toFixed(2)}x</strong></div>` : ""}
          ${(result.tracks.asset.paths.membershipMetrics?.recurringRevenue || 0) > 0 ? `<div><span>Membership Flywheel</span><strong>${pctHtml(result.tracks.asset.paths.membershipMetrics?.flywheel || 0, 0)}</strong></div>` : ""}
          <div><span>Fair vs Market</span><strong>${result.marketComparison ? pctHtml(result.marketComparison.premiumDiscount, 1) : "N/A"}</strong></div>
          <div><span>Company Multiple Factor</span><strong>${pctHtml(result.ledger.budgets.companyMultipleFactor - 1, 1)}</strong></div>
          <div><span>Dividend Uplift</span><strong>${pctHtml(result.outputs.equityBridge.dividendDurabilityUplift, 1)}</strong></div>
        </div>
      </section>

      ${warnings.length ? `
        <section class="panel">
          <div class="section-title"><h2>Warnings</h2></div>
          <div class="warning-list">${warnings.map((warning) => `<div class="warning">${escapeHtml(warning)}</div>`).join("")}</div>
        </section>
      ` : ""}
    </div>
  `
}

function renderAudit(result) {
  const trackRows = [
    ["DCF", "dcf", result.tracks.dcf],
    ["Direct Comps", "directComps", result.tracks.directComps],
    ["Industry Baseline", "industry", result.tracks.industry],
    ["Public Market", "publicMarket", result.tracks.publicMarket],
    ["Pipeline / Backlog", "pipeline", result.tracks.pipeline],
    ["Asset / Book", "asset", result.tracks.asset],
    ["Strategic", "strategic", result.tracks.strategic],
  ]
  const budgetRows = [
    ["Strategic Cap", result.ledger.budgets.strategicCap, "Final strategic track weight cannot exceed this cap."],
    ["Stacking Cap Penalty", result.ledger.budgets.stackingCapPenalty, "Overlapping positive tags reduce strategic headroom."],
    ["Scale Stacking Penalty", result.ledger.budgets.scaleStackingPenalty, "Large-company scale cannot re-amplify the same story tags."],
    ["Size Strategic Cap", result.ledger.budgets.sizeStrategicCapMultiplier, "Market penetration and size reduce casual strategic dominance."],
    ["Scale Multiple Factor", result.ledger.budgets.scaleMultipleFactor, "Small capped size adjustment applied to selected multiple family."],
    ["Company Multiple Factor", result.ledger.budgets.companyMultipleFactor, "Growth, financial quality, sector CAGR, leverage, and revenue decline adjust applied multiples."],
    ["Financial Justification", result.ledger.signals.coreFinancialJustification.effective, "Peer-relative margins, growth, P/E/EV multiple context, and net debt/revenue justify market multiple support once."],
    ["Multiple Pressure", result.ledger.signals.marketMultiplePressure.effective, "Observed trading premium not supported by peer-relative financials reduces market trust once."],
    ["Raw Multiple Score", result.ledger.budgets.rawMultipleScore, "Centered score before the diminishing-return curve is applied."],
    ["Multiple Lift", result.ledger.budgets.multipleLift, "Positive support from potential, growth, margins, revenue quality, sector CAGR, and pipeline."],
    ["Multiple Drag", result.ledger.budgets.multipleDrag, "Negative pull from capital burden, leverage/decline, working capital, probability risk, and tag stacking."],
    ["Drag Coefficient", result.ledger.budgets.dragCoefficient, "Potential and pipeline reduce how strongly current drag pulls the multiple back."],
    ["Tag Budget Multiplier", result.ledger.budgets.tagBudgetMultiplier, "Shared tag budget applied to market multiple construction."],
  ]
  return `
    <div class="results-layout">
      <section class="panel">
        <div class="section-title">
          <h2>Anti-Stacking Audit</h2>
        </div>
        <table>
          <thead>
            <tr><th>Signal</th><th>Raw</th><th>Cap</th><th>Effective</th><th>Sources</th></tr>
          </thead>
          <tbody>
            ${Object.entries(result.ledger.signals).map(([key, signal]) => `
              <tr>
                <td>${signalLabel(key)}</td>
                <td>${pctHtml(signal.raw)}</td>
                <td>${pctHtml(signal.cap)}</td>
                <td>${pctHtml(signal.effective)}</td>
                <td>${signal.sources.join(", ")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </section>
      <section class="panel">
        <div class="section-title">
          <h2>Track Weights</h2>
        </div>
        <table>
          <thead>
            <tr><th>Track</th><th>Value</th><th>Weight</th><th>Confidence</th></tr>
          </thead>
          <tbody>
            ${trackRows.map(([label, key, track]) => `
              <tr>
                <td>${label}</td>
                <td>${moneyHtml(track?.rawEV || 0)}</td>
                <td>${pctHtml(result.final.trackWeights[key] || 0)}</td>
                <td>${pctHtml(track?.confidence || 0)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </section>
      <section class="panel">
        <div class="section-title">
          <h2>Budgets</h2>
        </div>
        <div class="detail-grid">
          ${budgetRows.map(([label, value, note]) => `
            <div>
              <span>${label}</span>
              <strong>${pctHtml(value, 1)}</strong>
              <small>${note}</small>
            </div>
          `).join("")}
        </div>
      </section>
    </div>
  `
}

const SCREENER_COLUMNS = [
  { key: "ticker", label: "Ticker" },
  { key: "companyName", label: "Company" },
  { key: "sector", label: "Sector" },
  { key: "currentPrice", label: "Price" },
  { key: "observedMarketCap", label: "Market Cap" },
  { key: "fairCommonEquity", label: "Fair Value" },
  { key: "impliedVsMarketPct", label: "Implied vs Market" },
  { key: "confidence", label: "Confidence" },
  { key: "coveragePct", label: "Coverage" },
  { key: "unfilledCount", label: "Unfilled" },
  { key: "periodBasis", label: "Basis" },
  { key: "processedAt", label: "Updated" },
]
const SCREENER_OVERRIDES_KEY = "eval-system-2-screener-overrides"
const SCREENER_FORM_PAGE = 25

function loadLocalScreenerOverrides() {
  try {
    return JSON.parse(localStorage.getItem(SCREENER_OVERRIDES_KEY) || "{}") || {}
  } catch {
    return {}
  }
}

function saveLocalScreenerOverrides(overrides) {
  try {
    localStorage.setItem(SCREENER_OVERRIDES_KEY, JSON.stringify(overrides))
  } catch {
    // Browser storage is a convenience; the server copy (when available) is the durable one.
  }
}

// Re-run the engine for one screener row with any manual fill-ins layered over the recorded
// inputs, so the table reflects complete values without waiting for the next full screener run.
function applyScreenerOverrides(row, overrides) {
  const manual = overrides?.[row.ticker]
  const baseInputs = row.inputs || {}
  const merged = { ...baseInputs }
  const filled = []
  for (const [key, value] of Object.entries(manual || {})) {
    if (key === "submittedAt" || !fieldMap[key]) continue
    merged[key] = value
    filled.push(key)
  }
  const missing = (row.missing || []).filter((key) => !filled.includes(key))
  const originalMissing = (row.missing || []).length
  const coverageFraction = (row.coveragePct || 0) / 100
  const applicableCount = row.applicableCount || (originalMissing > 0 ? Math.round(originalMissing / Math.max(1 - coverageFraction, 1e-9)) : 0)
  const updated = { ...row, missing, unfilledCount: missing.length, manualFilled: filled }
  if (!filled.length) return updated
  try {
    const engineInputs = normalizeInputs({
      ...DEFAULT_INPUTS,
      companyName: row.companyName,
      sector: row.sector,
      businessModel: row.businessModel,
      ...merged,
    })
    const result = computeValuation(engineInputs)
    const fair = result.outputs.fairCommonEquity
    const observed = row.observedMarketCap || 0
    updated.fairCommonEquity = Math.round(fair * 100) / 100
    updated.fairValueLow = Math.round(result.bands.final.low * 100) / 100
    updated.fairValueHigh = Math.round(result.bands.final.high * 100) / 100
    updated.impliedVsMarketPct = observed > 0 ? Math.round(((fair - observed) / observed) * 10_000) / 100 : row.impliedVsMarketPct
    updated.confidence = result.bands.quality
    const total = Math.max(applicableCount, originalMissing, 1)
    updated.coveragePct = Math.round(((total - missing.length) / total) * 1000) / 10
    updated.recomputedAt = new Date().toISOString()
  } catch {
    // A bad manual value must never take the row down; keep the recorded valuation.
  }
  return updated
}

// A fair value more than 8x above or below the observed market value is almost always a
// data problem (ADR ratio, share-class count, a supplement in the wrong currency) rather
// than a real 700% mispricing, so those rows are flagged and hidden by default.
function flagSuspect(row) {
  const observed = row.observedMarketCap || 0
  const fair = row.fairCommonEquity || 0
  const ratio = observed > 0 && fair > 0 ? fair / observed : 1
  return { ...row, suspect: observed <= 0 || ratio > 8 || ratio < 1 / 8 }
}

function decorateScreenerRows(rows, overrides) {
  return rows.map((row) => flagSuspect(applyScreenerOverrides({ ...row, unfilledCount: (row.missing || []).length }, overrides)))
}

async function loadScreener() {
  if (state.screenerLoading) return
  state.screenerLoading = true
  state.screenerError = ""
  render()
  try {
    let payload = null
    try {
      const response = await fetch("/api/screener")
      payload = await response.json()
      if (!response.ok) throw new Error(payload.error || `Screener request failed (${response.status})`)
    } catch (apiError) {
      // Static hosting has no API; fall back to the snapshot file shipped with the build.
      const fallback = await fetch("screener-results.json")
      if (!fallback.ok) throw apiError
      payload = { results: await fallback.json(), meta: null, overrides: {} }
    }
    state.screenerOverrides = { ...(payload.overrides || {}), ...loadLocalScreenerOverrides() }
    state.screenerRaw = payload.results || []
    state.screenerResults = decorateScreenerRows(state.screenerRaw, state.screenerOverrides)
    state.screenerMeta = payload.meta || null
  } catch (error) {
    state.screenerError = error.message
  } finally {
    state.screenerLoading = false
    render()
  }
}

async function submitScreenerFill(ticker) {
  const card = document.querySelector(`[data-screener-form="${ticker}"]`)
  if (!card) return
  const inputs = {}
  card.querySelectorAll("[data-fill-field]").forEach((input) => {
    const key = input.dataset.fillField
    const field = fieldMap[key]
    if (!field || input.value === "") return
    const parsed = parseInputValue(input.value, field.type, input.checked)
    if (typeof parsed === "number" && !Number.isFinite(parsed)) return
    inputs[key] = parsed
  })
  if (!Object.keys(inputs).length) {
    state.screenerFormStatus = `Nothing entered for ${ticker} - type a value in at least one box first.`
    render()
    return
  }
  const previous = state.screenerOverrides[ticker] || {}
  state.screenerOverrides = { ...state.screenerOverrides, [ticker]: { ...previous, ...inputs, submittedAt: new Date().toISOString() } }
  saveLocalScreenerOverrides(state.screenerOverrides)
  state.screenerSubmitted = new Set([...(state.screenerSubmitted || []), ticker])
  state.screenerResults = decorateScreenerRows(state.screenerRaw, state.screenerOverrides)
  state.screenerFormStatus = `Saved ${Object.keys(inputs).length} value${Object.keys(inputs).length === 1 ? "" : "s"} for ${ticker}; its valuation has been recomputed.`
  render()
  try {
    const response = await fetch("/api/screener/overrides", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticker, inputs }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      if (response.status === 501) state.screenerFormStatus += " (Kept in this browser; this deployment has no server-side storage.)"
      else state.screenerFormStatus += ` (Server did not persist it: ${payload.error || response.status}.)`
      render()
    }
  } catch {
    state.screenerFormStatus += " (Kept in this browser only - server unreachable.)"
    render()
  }
}

function screenerFillRows(sorted) {
  const submitted = state.screenerSubmitted || new Set()
  return sorted.filter((row) => row.unfilledCount > 0 && !submitted.has(row.ticker))
}

function renderScreenerFillForm(sorted) {
  const candidates = screenerFillRows(sorted)
  if (!candidates.length) return ""
  const page = Math.max(1, state.screenerFormPage || 1)
  const visible = candidates.slice(0, page * SCREENER_FORM_PAGE)
  const totalUnfilled = candidates.reduce((sum, row) => sum + row.unfilledCount, 0)
  return `
    <section class="panel needs-attention-panel">
      <div class="section-title">
        <div>
          <p class="eyebrow">Fill in what the sources could not</p>
          <h2>${totalUnfilled.toLocaleString()} input${totalUnfilled === 1 ? "" : "s"} could not be filled across ${candidates.length.toLocaleString()} compan${candidates.length === 1 ? "y" : "ies"} in this view</h2>
        </div>
      </div>
      <p class="muted">Each card is one company and the exact inputs no provider returned for it. Enter what you know and submit - the card disappears, the company's row is recomputed with the complete values, and your entries are kept for the next run. Narrow the search above to jump to specific companies.</p>
      ${state.screenerFormStatus ? `<div class="status-line">${escapeHtml(state.screenerFormStatus)}</div>` : ""}
      <div class="fill-grid">
        ${visible.map((row) => `
          <article class="fill-card" data-screener-form="${escapeHtml(row.ticker)}">
            <header>
              <strong>${escapeHtml(row.ticker)}</strong>
              <span>${escapeHtml(row.companyName || "")}</span>
              <small>${escapeHtml(row.sector || "")} / ${escapeHtml(periodBasisLabel(row.periodBasis))}</small>
            </header>
            <div class="fill-fields">
              ${row.missing.map((key) => {
                const field = fieldMap[key]
                if (!field) return ""
                const step = field.type === "money" ? "1000" : field.type === "number" ? "1" : "0.1"
                return `
                  <label class="field">
                    <span>${escapeHtml(field.label)}${field.type === "percent" ? " (%)" : field.type === "money" ? " (USD)" : ""}</span>
                    <input data-fill-field="${escapeHtml(key)}" type="number" step="${step}" placeholder="${field.type === "percent" ? "e.g. 12.5" : field.type === "money" ? "e.g. 250000000" : ""}" />
                  </label>
                `
              }).join("")}
            </div>
            <div class="intake-actions">
              <button class="primary" data-action="submit-screener-fill" data-ticker="${escapeHtml(row.ticker)}">Submit ${escapeHtml(row.ticker)}</button>
            </div>
          </article>
        `).join("")}
      </div>
      ${candidates.length > visible.length ? `
        <div class="intake-actions">
          <button class="ghost" data-action="more-screener-forms">Show ${Math.min(SCREENER_FORM_PAGE, candidates.length - visible.length)} more companies (${candidates.length - visible.length} left in this view)</button>
        </div>
      ` : ""}
    </section>
  `
}

function screenerSectors() {
  return [...new Set((state.screenerResults || []).map((row) => row.sector).filter(Boolean))].sort()
}

const SCREENER_PRESETS = {
  upside: { field: "impliedVsMarketPct", dir: "desc" },
  downside: { field: "impliedVsMarketPct", dir: "asc" },
  cap: { field: "observedMarketCap", dir: "desc" },
  confidence: { field: "confidence", dir: "desc" },
  coverage: { field: "coveragePct", dir: "desc" },
}

function screenerPresetKey() {
  const { field, dir } = state.screenerSort
  return Object.entries(SCREENER_PRESETS).find(([, sort]) => sort.field === field && sort.dir === dir)?.[0] || ""
}

function basisTag(basis) {
  if (basis === "ttm") return `<span class="pill" title="${escapeHtml(periodBasisLabel(basis))}">TTM</span>`
  if (basis === "quarterly-annualized") return `<span class="pill pill--warn" title="${escapeHtml(periodBasisLabel(basis))}">Q x4</span>`
  return `<span class="pill" title="Annual filing">Annual</span>`
}

function renderScreener() {
  if (state.screenerResults === null) {
    if (!state.screenerLoading) loadScreener()
    return `
      <div class="results-layout">
        <section class="panel">
          <div class="section-title"><h2>Screened Companies</h2></div>
          <p class="muted">${state.screenerLoading ? "Loading every recorded company..." : state.screenerError || "No screener data yet."}</p>
        </section>
      </div>
    `
  }
  const search = state.screenerSearch.trim().toLowerCase()
  const f = state.screenerFilters
  const minCap = f.minCapM === "" ? 0 : Number(f.minCapM) * 1e6
  const maxCap = f.maxCapM === "" ? Infinity : Number(f.maxCapM) * 1e6
  const minCoverage = f.minCoverage === "" ? 0 : Number(f.minCoverage)
  const minUpside = f.minUpside === "" ? -Infinity : Number(f.minUpside)
  const filtered = state.screenerResults.filter((row) => {
    if (search && !(row.ticker?.toLowerCase().includes(search) || row.companyName?.toLowerCase().includes(search) || row.sector?.toLowerCase().includes(search))) return false
    if (f.sector && row.sector !== f.sector) return false
    if (f.basis && row.periodBasis !== f.basis) return false
    const cap = row.observedMarketCap || 0
    if (cap < minCap || cap > maxCap) return false
    if ((row.coveragePct || 0) < minCoverage) return false
    if (f.onlyComplete && row.unfilledCount > 0) return false
    if (f.hideSuspect && row.suspect) return false
    if (minUpside !== -Infinity && !(row.impliedVsMarketPct >= minUpside)) return false
    return true
  })
  const { field, dir } = state.screenerSort
  const sorted = [...filtered].sort((a, b) => {
    const av = a[field]
    const bv = b[field]
    if (av === null || av === undefined) return 1
    if (bv === null || bv === undefined) return -1
    if (typeof av === "string") return dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av)
    return dir === "asc" ? av - bv : bv - av
  })
  const meta = state.screenerMeta
  const filledCount = Object.keys(state.screenerOverrides || {}).length
  return `
    <div class="results-layout">
      <section class="panel">
        <div class="section-title">
          <div>
            <p class="eyebrow">Every successfully screened public company</p>
            <h2>Screened Companies</h2>
          </div>
          <button class="ghost" data-action="refresh-screener">${state.screenerLoading ? "Refreshing..." : "Refresh"}</button>
        </div>
        ${meta ? `
          <p class="muted">
            ${(meta.totalRecorded || 0).toLocaleString()} of ${(meta.universeSize || 0).toLocaleString()} SEC-registered companies recorded${meta.running ? " - background run in progress" : ""} - last run ${meta.updatedAt ? new Date(meta.updatedAt).toLocaleString() : "n/a"}${filledCount ? ` - ${filledCount} compan${filledCount === 1 ? "y" : "ies"} completed by hand` : ""}.
          </p>
        ` : state.screenerResults.length === 0 ? `<p class="muted">No screener results recorded yet. Run "node scripts/run-screener.mjs" to start populating this table.</p>` : ""}
        <div class="screener-filters">
          <label class="field field--wide">
            <span>Search</span>
            <input data-screener-search type="text" placeholder="Ticker, company, or sector" value="${escapeHtml(state.screenerSearch)}" />
          </label>
          <label class="field">
            <span>Sort</span>
            <select data-screener-preset>
              ${[
                ["upside", "Highest implied upside"],
                ["downside", "Most overvalued"],
                ["cap", "Largest market cap"],
                ["confidence", "Highest confidence"],
                ["coverage", "Most complete data"],
              ].map(([key, label]) => `<option value="${key}" ${screenerPresetKey() === key ? "selected" : ""}>${label}</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>Industry</span>
            <select data-screener-filter="sector">
              <option value="">All industries</option>
              ${screenerSectors().map((sector) => `<option value="${escapeHtml(sector)}" ${f.sector === sector ? "selected" : ""}>${escapeHtml(sector)}</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>Market cap ($M) min</span>
            <input data-screener-filter="minCapM" type="number" min="0" step="50" value="${escapeHtml(f.minCapM)}" placeholder="0" />
          </label>
          <label class="field">
            <span>Market cap ($M) max</span>
            <input data-screener-filter="maxCapM" type="number" min="0" step="50" value="${escapeHtml(f.maxCapM)}" placeholder="No limit" />
          </label>
          <label class="field">
            <span>Min implied upside (%)</span>
            <input data-screener-filter="minUpside" type="number" step="5" value="${escapeHtml(f.minUpside)}" placeholder="Any" />
          </label>
          <label class="field">
            <span>Min data coverage (%)</span>
            <input data-screener-filter="minCoverage" type="number" min="0" max="100" step="10" value="${escapeHtml(f.minCoverage)}" />
          </label>
          <label class="field">
            <span>Period basis</span>
            <select data-screener-filter="basis">
              <option value="">Any</option>
              <option value="annual" ${f.basis === "annual" ? "selected" : ""}>Annual filing</option>
              <option value="ttm" ${f.basis === "ttm" ? "selected" : ""}>Trailing twelve months</option>
            </select>
          </label>
          <label class="field field--checkbox">
            <input data-screener-filter="onlyComplete" type="checkbox" ${f.onlyComplete ? "checked" : ""} />
            <span>Only fully filled companies</span>
          </label>
          <label class="field field--checkbox">
            <input data-screener-filter="hideSuspect" type="checkbox" ${f.hideSuspect ? "checked" : ""} />
            <span>Hide likely data errors (fair value &gt;8x off market)</span>
          </label>
          <div class="screener-filter-actions">
            <button class="ghost" data-action="screener-cap" data-min="200000" data-max="">Mega &gt;$200B</button>
            <button class="ghost" data-action="screener-cap" data-min="10000" data-max="200000">Large</button>
            <button class="ghost" data-action="screener-cap" data-min="2000" data-max="10000">Mid</button>
            <button class="ghost" data-action="screener-cap" data-min="300" data-max="2000">Small</button>
            <button class="ghost" data-action="screener-cap" data-min="0" data-max="300">Micro</button>
            <button class="ghost" data-action="screener-reset">Reset filters</button>
          </div>
        </div>
        <p class="muted">${sorted.length.toLocaleString()} compan${sorted.length === 1 ? "y" : "ies"} match. Implied upside = (fair value - market value) / market value; extreme values usually mean a share-count or ADR-ratio mismatch - raise the coverage floor or check the company's inputs before acting on them.</p>
        <div class="table-scroll">
        <table>
          <thead>
            <tr>
              ${SCREENER_COLUMNS.map((column) => `
                <th data-screener-sort="${column.key}" class="${field === column.key ? "active" : ""}">${escapeHtml(column.label)}${field === column.key ? (dir === "asc" ? " ^" : " v") : ""}</th>
              `).join("")}
            </tr>
          </thead>
          <tbody>
            ${sorted.slice(0, 500).map((row) => `
              <tr class="${row.manualFilled?.length ? "row--manual" : ""}">
                <td>${escapeHtml(row.ticker || "")}${row.suspect ? ` <span class="pill pill--warn" title="Fair value is more than 8x away from market value - probably a share-count, ADR-ratio or currency mismatch">check</span>` : ""}</td>
                <td>${escapeHtml(row.companyName || "")}</td>
                <td>${escapeHtml(row.sector || "")}</td>
                <td>${moneyHtml(row.currentPrice || 0)}</td>
                <td>${moneyHtml(row.observedMarketCap || 0)}</td>
                <td>${moneyHtml(row.fairCommonEquity || 0)}</td>
                <td>${row.impliedVsMarketPct === null || row.impliedVsMarketPct === undefined ? "n/a" : signedHtml(`${row.impliedVsMarketPct.toFixed(1)}%`, row.impliedVsMarketPct)}</td>
                <td>${pctHtml(row.confidence || 0, 0)}</td>
                <td>${row.coveragePct === null || row.coveragePct === undefined ? "n/a" : `${row.coveragePct.toFixed(0)}%`}</td>
                <td>${row.unfilledCount ? `<span class="pill pill--warn">${row.unfilledCount}</span>` : row.manualFilled?.length ? `<span class="pill">filled</span>` : "0"}</td>
                <td>${basisTag(row.periodBasis)}</td>
                <td>${row.processedAt ? new Date(row.recomputedAt || row.processedAt).toLocaleDateString() : ""}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        </div>
        ${sorted.length > 500 ? `<p class="muted">Showing 500 of ${sorted.length.toLocaleString()} matching companies - narrow the filter to see the rest.</p>` : ""}
        ${sorted.length === 0 && state.screenerResults.length > 0 ? `<p class="muted">No companies match "${escapeHtml(state.screenerSearch)}".</p>` : ""}
      </section>
      ${renderScreenerFillForm(sorted)}
    </div>
  `
}

function render() {
  const result = computeValuation(state.inputs)
  const app = document.querySelector("#app")
  app.innerHTML = `
    <aside class="sidebar">
      <div>
        <p class="eyebrow">eval system 2</p>
        <h1>Valuation Engine</h1>
      </div>
      <nav>
        <button data-tab="inputs" class="${state.activeTab === "inputs" ? "active" : ""}">Inputs</button>
        <button data-tab="results" class="${state.activeTab === "results" ? "active" : ""}">Results</button>
        <button data-tab="audit" class="${state.activeTab === "audit" ? "active" : ""}">Audit</button>
        <button data-tab="screener" class="${state.activeTab === "screener" ? "active" : ""}">Screened Companies</button>
      </nav>
      <button class="primary primary--sidebar" data-tab="screener">Browse ${state.screenerResults ? state.screenerResults.length.toLocaleString() : "all"} screened companies</button>
      <a class="ghost ghost--sidebar ghost--link" href="screener/">Open the standalone screener site</a>
      <button class="ghost ghost--sidebar" data-action="reset-draft">Reset Draft</button>
      <div class="fixture-list">
        <span>Scenarios</span>
        ${Object.keys(FIXTURES).map((name) => `<button data-fixture="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join("")}
      </div>
    </aside>
    <main>
      <header class="topbar">
        <div>
          <p class="eyebrow">${escapeHtml(result.input.sector)} / ${escapeHtml(result.input.businessModel)}</p>
          <h1>${escapeHtml(result.input.companyName)}</h1>
        </div>
        <div class="topbar-actions">
          <button class="ghost" data-action="toggle-review-all">${state.reviewAllFields ? "Close All Fields" : "Review All Fields"}</button>
          <button class="ghost ghost--accent" data-tab="screener">Screened Companies</button>
          <button class="primary" data-tab="results">Run Valuation</button>
        </div>
      </header>
      ${state.activeTab === "inputs" ? renderAutoIntake() : state.activeTab === "audit" ? renderAudit(result) : state.activeTab === "screener" ? renderScreener() : renderResults(result)}
    </main>
  `

  for (const field of fields) {
    const element = app.querySelector(`[data-field="${field.key}"]`)
    if (element && field.type === "select") element.value = state.inputs[field.key]
  }
}

document.addEventListener("input", (event) => {
  const fieldKey = event.target.dataset.field
  const tag = event.target.dataset.tag
  if (event.target.dataset.ticker !== undefined) {
    state.ticker = event.target.value.toUpperCase().replace(/[^A-Z0-9.-]/g, "")
    event.target.value = state.ticker
    return
  }
  if (event.target.dataset.screenerSearch !== undefined) {
    state.screenerSearch = event.target.value
    state.screenerFormPage = 1
    render()
    const input = document.querySelector("[data-screener-search]")
    if (input) {
      input.focus()
      input.setSelectionRange(input.value.length, input.value.length)
    }
    return
  }
  if (event.target.dataset.extractionJson !== undefined) {
    state.extractionJson = event.target.value
    return
  }
  if (fieldKey) {
    const field = fields.find((item) => item.key === fieldKey)
    state.inputs[fieldKey] = parseInputValue(event.target.value, field.type, event.target.checked)
    const isNumericField = ["money", "number", "score", "score5", "multiple", "percent"].includes(field.type)
    const isManualZero = isNumericField && Number(state.inputs[fieldKey]) === 0
    if (state.ingestionAudit?.fieldStatus && !["select", "checkbox"].includes(field.type)) {
      state.ingestionAudit.fieldStatus[fieldKey] = isManualZero ? "manual-zero" : "manual"
    }
    saveDraft()
    const note = event.target.closest(".field")?.querySelector("small")
    if (note && !["select", "checkbox"].includes(field.type)) {
      note.textContent = isManualZero ? "Manual zero" : formatValue(state.inputs[fieldKey], field.type)
      note.className = isManualZero ? "field-source--verified" : ""
    }
  }
  if (tag) {
    const selected = new Set(state.inputs.tags || [])
    if (event.target.checked) selected.add(tag)
    else selected.delete(tag)
    state.inputs.tags = [...selected]
    saveDraft()
    event.target.closest(".tag")?.classList.toggle("tag--selected", event.target.checked)
  }
})

document.addEventListener("change", (event) => {
  if (event.target.dataset.screenerPreset !== undefined) {
    state.screenerSort = { ...SCREENER_PRESETS[event.target.value] }
    render()
    return
  }
  if (event.target.dataset.screenerFilter !== undefined) {
    const key = event.target.dataset.screenerFilter
    const value = event.target.type === "checkbox" ? event.target.checked : event.target.value
    state.screenerFilters = { ...state.screenerFilters, [key]: value }
    state.screenerFormPage = 1
    render()
    return
  }
  const fieldKey = event.target.dataset.field
  if (fieldKey) {
    const field = fields.find((item) => item.key === fieldKey)
    if (field && ["select", "checkbox"].includes(field.type)) render()
  }
  if (event.target.dataset.action === "upload-report") {
    state.reportFile = event.target.files?.[0] || null
    state.extractionStatus = state.reportFile ? "Report attached for exception review. AI remains off." : ""
    render()
  }
})

async function ingestCompany() {
  const ticker = state.ticker.trim().toUpperCase()
  if (!ticker) {
    state.ingestionStatus = "Enter a ticker first."
    render()
    return
  }
  state.ingestionBusy = true
  state.ingestionStatus = `Loading filings and market data for ${ticker}...`
  state.ingestionAudit = null
  render()
  try {
    const response = await fetch(`/api/ingest?ticker=${encodeURIComponent(ticker)}`)
    const contentType = response.headers.get("content-type") || ""
    if (!contentType.includes("application/json")) {
      throw new Error("Live filing ingestion needs the server build and isn't available on this static site. Use Screened Companies for pre-computed valuations, or enter the inputs manually below.")
    }
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || `Ingestion failed (${response.status})`)
    state.inputs = normalizeInputs({ ...cleanIngestionBase(state.inputs), ...payload.inputs })
    state.sourceNotes = payload.sourceNotes || {}
    state.humanReview = [
      ...(payload.missing || []).map((field) => ({ field, reason: "No deterministic provider value was available." })),
      ...(payload.warnings || []).map((reason) => ({ field: "providerAudit", reason })),
    ]
    state.marketSnapshot = payload.marketSnapshot || null
    state.ingestionAudit = {
      coverage: payload.coverage,
      providers: payload.providers || [],
      warnings: payload.warnings || [],
      missing: payload.missing || [],
      periodEnd: payload.periodEnd,
      periodBasis: payload.periodBasis || "annual",
      provenance: payload.provenance || [],
      fieldStatus: payload.fieldStatus || {},
      crossChecks: payload.crossChecks || [],
    }
    state.ingestionStatus = `Loaded ${payload.company?.title || ticker}. Review the qualitative questions below.`
    state.step = 0
    saveDraft()
  } catch (error) {
    state.ingestionStatus = error.message
    state.ingestionAudit = { error: true, coverage: { percent: 0 }, providers: [], warnings: [error.message], missing: [] }
  } finally {
    state.ingestionBusy = false
    render()
  }
}

document.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-tab], [data-fixture], [data-step], [data-action], [data-mode], [data-screener-sort]")
  if (!target) return
  const tab = target.dataset.tab
  const fixture = target.dataset.fixture
  const step = target.dataset.step
  const action = target.dataset.action
  const mode = target.dataset.mode
  const screenerSortField = target.dataset.screenerSort
  if (tab) {
    state.activeTab = tab
    render()
  }
  if (screenerSortField) {
    state.screenerSort = {
      field: screenerSortField,
      dir: state.screenerSort.field === screenerSortField && state.screenerSort.dir === "desc" ? "asc" : "desc",
    }
    render()
  }
  if (action === "refresh-screener") {
    state.screenerSubmitted = new Set()
    loadScreener()
  }
  if (action === "submit-screener-fill") {
    submitScreenerFill(target.dataset.ticker)
  }
  if (action === "screener-cap") {
    state.screenerFilters = { ...state.screenerFilters, minCapM: target.dataset.min === "" ? "" : Number(target.dataset.min), maxCapM: target.dataset.max === "" ? "" : Number(target.dataset.max) }
    state.screenerFormPage = 1
    render()
  }
  if (action === "screener-reset") {
    state.screenerFilters = { sector: "", minCapM: "", maxCapM: "", minCoverage: 0, minUpside: "", basis: "", onlyComplete: false, hideSuspect: true }
    state.screenerSearch = ""
    state.screenerFormPage = 1
    render()
  }
  if (action === "more-screener-forms") {
    state.screenerFormPage = (state.screenerFormPage || 1) + 1
    render()
  }
  if (step !== undefined) {
    state.step = Number(step)
    state.activeTab = "inputs"
    render()
  }
  if (fixture) {
    state.inputs = structuredClone(FIXTURES[fixture])
    state.activeTab = "results"
    state.entryMode = "deterministic"
    state.step = 0
    state.marketSnapshot = null
    state.ingestionAudit = null
    saveDraft()
    render()
  }
  if (action === "copy-auto-prompt") {
    navigator.clipboard?.writeText(automationPrompt())
    state.extractionStatus = "Prompt copied."
    render()
  }
  if (action === "apply-extraction") {
    try {
      const parsed = JSON.parse(state.extractionJson || "{}")
      const extractedInputs = parsed.inputs || parsed
      state.inputs = normalizeInputs({ ...state.inputs, ...extractedInputs })
      state.sourceNotes = parsed.sourceNotes || {}
      state.humanReview = Array.isArray(parsed.humanReview) ? parsed.humanReview : []
      const review = automationReview(state.inputs)
      state.extractionStatus = `Applied extraction. ${review.missing.length} core fields still missing.`
      saveDraft()
    } catch (error) {
      state.extractionStatus = `Invalid JSON: ${error.message}`
    }
    render()
  }
  if (action === "toggle-advanced") {
    state.advanced = !state.advanced
    render()
  }
  if (action === "toggle-review-all") {
    state.reviewAllFields = !state.reviewAllFields
    state.activeTab = "inputs"
    render()
  }
  if (action === "ingest-company") await ingestCompany()
  if (action === "reset-draft") {
    state.inputs = structuredClone(DEFAULT_INPUTS)
    state.activeTab = "inputs"
    state.entryMode = "deterministic"
    state.step = 0
    state.advanced = false
    state.reviewAllFields = false
    state.ticker = ""
    state.ingestionStatus = ""
    state.ingestionBusy = false
    state.ingestionAudit = null
    state.marketSnapshot = null
    state.reportFile = null
    state.extractionJson = ""
    state.extractionStatus = ""
    state.sourceNotes = {}
    state.humanReview = []
    saveDraft()
    render()
  }
  if (action === "prev-step") {
    state.step = Math.max(0, state.step - 1)
    state.activeTab = "inputs"
    render()
  }
  if (action === "next-step") {
    state.step = Math.min(wizardSteps.length - 1, state.step + 1)
    state.activeTab = "inputs"
    render()
  }
  if (action === "run-valuation") {
    state.activeTab = "results"
    render()
  }
})

render()
