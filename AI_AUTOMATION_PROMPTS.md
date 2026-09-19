# Eval System 2 AI Automation Prompts

Purpose: make the valuation engine ready for AI-assisted data entry without changing the engine's anti-stacking design. The AI should fill the engine input JSON, cite where each value came from, and flag anything that requires human judgment.

## Source Priority

Use this order unless the company is private or foreign and the source is unavailable:

1. Company annual report, 10-K, 20-F, 10-Q, investor presentation, shareholder letter, and earnings release.
2. SEC EDGAR company submissions and XBRL companyfacts for U.S.-listed companies:
   - SEC EDGAR APIs: https://www.sec.gov/search-filings/edgar-application-programming-interfaces
   - SEC developer resources: https://www.sec.gov/about/developer-resources
   - SEC data API host: https://data.sec.gov/
3. Company investor relations site for annual reports, share counts, segment data, backlog, and management commentary.
4. Market-data provider for current quote, market cap, enterprise value, P/E, dividend yield, shares outstanding, and historical multiples. Acceptable examples: exchange data, Nasdaq/NYSE pages, Yahoo Finance, Koyfin, FactSet, Capital IQ, Bloomberg, Financial Modeling Prep, Alpha Vantage, or equivalent.
5. Peer set and industry metrics from 4-8 direct public competitors. Prefer same business model over same broad sector.
6. TAM/SAM and sector CAGR from industry reports, regulator reports, trade associations, reputable consulting reports, company filings, and analyst consensus. If only company-stated TAM exists, haircut it and flag it.

## Master Extraction Prompt

Use this prompt when an AI receives a PDF or public-company filing packet.

```text
You are preparing inputs for Eval System 2, a classification-aware valuation engine.

Your job is to extract, calculate, and estimate the engine inputs from the provided financial report plus current market/peer data. Return only valid JSON. Do not include prose outside JSON.

Output shape:
{
  "inputs": {
    "companyName": "",
    "sector": "",
    "businessModel": "",
    "tags": [],
    "lifecycleStage": "",
    "capitalStatus": "",
    "profitabilityStatus": "",
    "...": "all known engine fields"
  },
  "sourceNotes": {
    "fieldName": "source, fiscal period, and formula"
  },
  "humanReview": [
    { "field": "fieldName", "reason": "why this needs human review", "suggestedValue": null }
  ]
}

Rules:
- Use numeric values only. Money is USD. Percent fields are decimal ratios: 12.5% becomes 0.125.
- Prefer the latest fiscal-year annual values. Use trailing twelve months only if annual values are unavailable, and mark it in sourceNotes.
- Revenue growth = (latest annual revenue - prior annual revenue) / prior annual revenue.
- Gross margin = gross profit / revenue.
- EBITDA margin = EBITDA / revenue. EBITDA = operating income + depreciation & amortization. Do NOT substitute operating income for EBITDA; if D&A is not separately disclosed, use the best available figure and flag it for review.
- `opexRatio`: the engine computes EBITDA margin as `grossMargin - opexRatio`, then FCF margin as `EBITDA margin - capexPct - interest - working-capital drag + customerPrepaymentPct`. So `opexRatio` is operating expense EXCLUDING depreciation & amortization: `opexRatio = grossMargin - EBITDA margin`. Do NOT use `grossMargin - operating margin` — that includes D&A and would double-count it against the separate `capexPct` input, understating value. `capexPct` carries capital intensity on its own.
- `rdPct`: research & development spend as a % of revenue, sourced directly from the income statement (or 10-K segment/footnote disclosure) when R&D is broken out as its own line. This must be a SUBSET of `opexRatio`, not additive to it (the engine clamps `rdPct <= opexRatio`) — it does not change gross margin, EBITDA margin, or FCF margin at all; it only tells the engine how the SAME total opex is composed. The engine compares `rdPct` against a SECTOR-relative norm (software/biotech sectors expect high R&D; industrials/services/retail expect near-zero) and gives a modest, one-sided multiple credit only when R&D spend is ABOVE that sector's typical level — there is no penalty for low R&D, since a lean or labor-heavy cost structure is often simply correct for that sector. If R&D is not broken out separately in the filing, leave this at 0 (the default, which has zero effect) rather than estimating it.
- `customerPrepaymentPct`: a steady-state cash-conversion credit for businesses that collect meaningful cash from customers BEFORE the associated revenue is recognized — deposits, progress billings, or subscription prepay (contract liabilities / customer deposits on the balance sheet, distinct from ordinary AR/AP/inventory already captured elsewhere). Compute it as the sustainable annual increase in contract liabilities / customer deposits as a % of revenue — not the total balance, which would overstate a mature, steady book. Only use this for businesses where the company itself discloses that advance customer payments are a meaningful, structural source of liquidity (e.g. large build-to-order equipment, aerospace/shipbuilding progress payments, some enterprise software annual-prepay models) — not for ordinary businesses. **Do not treat this as a substitute for the backlog/pipeline fields, and do not double-count the same dollars**: `customerPrepaymentPct` only affects how fast REVENUE converts to CASH in a given year (fcfMargin); it must NOT be inflated to compensate for a company's true revenue growth or used as a proxy for backlog value — enter `backlogValue`/`backlogConversion` for that separately. The engine caps this input at 0.2 (20 points of margin) as a general safety rail; if the disclosed cash-timing benefit is larger, enter the capped value and flag the gap in `humanReview` rather than assuming the cap should be raised for one company.
- Net margin = net income / revenue if needed for peer comparison. The engine calculates company net margin internally, but peer net margin must be supplied if available.
- Debt = interest-bearing debt, finance leases, notes payable, short-term borrowings, and long-term debt. For banks, do not treat customer deposits as ordinary debt.
- Cash = cash, equivalents, short-term investments, and marketable securities unless restricted.
- CapEx % revenue = capital expenditures / revenue.
- AR, AP, and inventory should come from the balance sheet when material.
- Market cap = current share price * diluted or basic shares outstanding, or use a reliable market-data provider. Put this in marketCapOverride when available.
- Multi-class / Up-C structures (e.g. a public Class A plus non-economic voting classes stapled to exchangeable LLC units held by pre-IPO holders, common after de-SPAC mergers): if the company's consolidated revenue and margins represent 100% of the operating business (the normal case — check whether the income statement shows a "net income attributable to noncontrolling interests" line, which confirms full consolidation), then sharesOutstanding must be the FULLY-EXCHANGED total across all classes, not just the publicly-traded class's share count. Using only the traded class's shares against 100%-of-business financials understates market cap and creates a false "undervalued" signal. Flag the share-class breakdown in sourceNotes so it is auditable.
- EPS = diluted EPS from continuing operations when disclosed.
- Use current market data for current multiples; use latest annual financials for denominator consistency unless TTM is materially better documented.
- Peer multiples should come from 4-8 direct public competitors: EV/revenue, EV/EBITDA, EV/FCF, P/E, revenue growth, gross margin, EBITDA margin, net margin, and net debt/revenue.
- TAM/SAM and sector CAGR may be estimated, but must be flagged if not directly sourced.
- For qualitative fields, use the scoring rubric below. Never assign 9-10 without strong evidence.
- Do not infer high brand durability from moat inputs, and do not infer high moat from brand inputs. Brand is demand-side recognition/trust/habit. Moat is structural defensibility.
```

## Engine Field Schema

The AI should return keys matching the app exactly:

```json
{
  "companyName": "string",
  "sector": "one taxonomy sector",
  "businessModel": "one taxonomy business model",
  "tags": ["taxonomy tags"],
  "lifecycleStage": "one lifecycle stage",
  "capitalStatus": "one capital status",
  "profitabilityStatus": "one profitability status",
  "tam": 0,
  "sam": 0,
  "revenue": 0,
  "revenueGrowth": 0,
  "sectorCagr": 0,
  "grossMargin": 0,
  "retailRevenuePct": 0,
  "retailGrossMargin": 0,
  "subscriptionRevenuePct": 0,
  "subscriptionGrossMargin": 0,
  "marginChangeYoy": 0,
  "opexRatio": 0,
  "rdPct": 0,
  "cash": 0,
  "debt": 0,
  "capexPct": 0,
  "customerPrepaymentPct": 0,
  "inventory": 0,
  "ar": 0,
  "ap": 0,
  "recurringRevenuePct": 0,
  "nrr": 0,
  "churn": 0,
  "pipelineValue": 0,
  "pipelineConversion": 0,
  "backlogValue": 0,
  "backlogConversion": 0,
  "backlogGrossMargin": 0,
  "contractDurationYears": 1,
  "renewalProbability": 0,
  "competitorCount": 0,
  "competitorEvRevenue": 0,
  "competitorEvEbitda": 0,
  "competitorEvFcf": 0,
  "competitorPe": 0,
  "competitorRevenueGrowth": 0,
  "competitorGrossMargin": 0,
  "competitorEbitdaMargin": 0,
  "competitorNetMargin": 0,
  "competitorNetDebtRevenue": 0,
  "tangibleBookValue": 0,
  "assetBackingValue": 0,
  "asset1Type": "None",
  "asset1Value": 0,
  "asset2Type": "None",
  "asset2Value": 0,
  "asset3Type": "None",
  "asset3Value": 0,
  "asset4Type": "None",
  "asset4Value": 0,
  "asset5Type": "None",
  "asset5Value": 0,
  "asset6Type": "None",
  "asset6Value": 0,
  "roe": 0,
  "rotce": 0,
  "clientType": "Consumers",
  "brandGeographicReach": "Regional",
  "yearsOperating": 0,
  "targetMarketRecognitionPct": 0,
  "customerTrustScore": 1,
  "purchaseFrequency": 1,
  "missionCriticality": 1,
  "consumerHabitStrength": 1,
  "institutionalReliance": 1,
  "competitionIntensity": 3,
  "managementScore": 7,
  "moatScore": 7,
  "gtmScore": 7,
  "switchingCostScore": 7,
  "dataAdvantageScore": 7,
  "networkEffectScore": 3,
  "ipScore": 4,
  "acquirerPool": 12,
  "strategicPremiumFlag": false,
  "techReadiness": 8,
  "regulatoryRisk": 2,
  "governanceRegime": "Established Rule of Law",
  "governmentPosture": "Neutral / Market",
  "expectedDilution": 0,
  "buybackYield": 0,
  "dividendYield": 0,
  "eps": 0,
  "sharePrice": 0,
  "sharesOutstanding": 0,
  "marketCapOverride": 0,
  "terminalGrowth": 0.035,
  "projectionYears": 6
}
```

## Qualitative Scoring Rubric

Use 1-10 scores unless the field uses 1-5.

Brand and customer inputs:

- `targetMarketRecognitionPct`: estimated share of the target customer market that recognizes the company name. Use target market, not the entire population. Costco among U.S. shoppers can be very high; a specialized B2B vendor can be high inside procurement buyers but low generally.
- `customerTrustScore`: 1-3 means unknown/weak trust or frequent customer concern; 4-6 means normal credible brand; 7-8 means trusted default choice; 9-10 means category-defining trust with repeated evidence across surveys, retention, pricing power, or decades of behavior.
- `purchaseFrequency`: 1 = rare one-off purchase, 5 = annual/occasional, 8 = monthly/weekly, 10 = daily or embedded recurring behavior.
- `missionCriticality`: 1 = nice-to-have, 5 = useful but replaceable, 8 = operationally important, 10 = failure would create major financial, safety, compliance, or continuity risk.
- `consumerHabitStrength`: 1-3 means customers comparison-shop each time; 4-6 means some repeat behavior; 7-8 means habitual destination/brand; 9-10 means culturally or behaviorally entrenched default.
- `institutionalReliance`: 1-3 means low renewal/friction; 4-6 means normal vendor reliance; 7-8 means embedded workflow, regulatory, or procurement reliance; 9-10 means extremely difficult replacement by banks, governments, hospitals, schools, or infrastructure customers.
- `yearsOperating`: use years since founding or since the current core business became recognizable. Do not use age alone as proof of brand strength.
- `brandGeographicReach`: Local, Regional, National, or Global based on actual revenue/customer footprint.

Structural moat inputs:

- `competitionIntensity` is 1-5 where 1 means few credible alternatives and 5 means intense/commoditized competition.
- `moatScore`: structural defensibility excluding brand. Consider scale economies, cost advantage, regulatory position, distribution lock-up, procurement lock-in, ecosystem control, and supply constraints.
- `switchingCostScore`: cost, friction, retraining, data migration, contract lock-in, integration complexity, or operational risk from replacing the product.
- `dataAdvantageScore`: proprietary data advantage that improves product quality, underwriting, personalization, automation, pricing, or risk control.
- `networkEffectScore`: each additional user/supplier/customer improves value for others. Do not score ordinary scale as network effect.
- `ipScore`: patent, exclusive license, regulatory exclusivity, content library, technical know-how, or protected design rights.

Management and execution:

- `managementScore`: track record of capital allocation, execution reliability, governance, transparency, and avoiding value-destructive behavior.
- `gtmScore`: evidence that sales/distribution/customer acquisition motion works efficiently and repeatedly.
- `acquirerPool`: realistic count of strategic buyers with ability and reason to acquire the company.
- `strategicPremiumFlag`: true only when there is a concrete acquisition/scarcity thesis, not merely a good business.

Risk and jurisdiction:

- `techReadiness`: 10 for fully commercialized technology, 5 for working prototype, 1 for theoretical/preclinical.
- `regulatoryRisk`: 1-5 where 1 is minimal and 5 is existential or approval-dependent.
- `governanceRegime`: use the main jurisdiction where shareholder/property rights and operating permissions matter most.
- `governmentPosture`: supported/protected only when there is explicit policy, licensing, concession, national-champion, or contracted support.

## Peer Selection Prompt

```text
Select 4-8 direct public peers for {company}. Rank by business-model similarity first, revenue model second, sector third, and size fourth.

For each peer, collect:
- market cap
- enterprise value
- revenue
- EBITDA
- free cash flow
- net income
- diluted EPS
- revenue growth
- gross margin
- EBITDA margin
- net margin
- cash
- debt

Return median and trimmed mean for:
- EV/revenue
- EV/EBITDA
- EV/FCF
- P/E
- revenue growth
- gross margin
- EBITDA margin
- net margin
- net debt/revenue

Use the median unless one peer is clearly more comparable and explain the choice in sourceNotes.
```

## Run Prompt

Use this after creating the JSON payload.

```text
Run computeValuation(inputs). Report:
- fairCommonEquity
- fair-value band low/high
- observed market cap
- fair vs observed
- whether observed market cap is in band
- final track weights
- coreFinancialJustification
- marketMultiplePressure
- brandDurability
- durability
- companyMultipleFactor
- warnings

If variance looks wrong, do not tune outputs directly. Audit source data first, then peer set, then brand/qualitative estimates, then classification.
```

## Human Review Policy

Always flag these if they are estimated rather than sourced:

- TAM
- SAM
- sector CAGR
- pipeline conversion
- backlog conversion
- NRR
- churn
- customer recognition percent
- customer trust score
- consumer habit strength
- institutional reliance
- moat score
- switching cost score
- data advantage score
- network effect score
- IP score
- management score
- GTM score
- acquirer pool

Automation is allowed to estimate them, but the final payload should make uncertainty visible.
