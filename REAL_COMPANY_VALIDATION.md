# Real Company Validation Pass

Date run: 2026-07-28

Observed market caps use July 29, 2026 quote checks multiplied by the latest share counts found in public filings.

## Software-Bias Stress Pass

Date run: 2026-07-29

Purpose: rerun five new companies after tightening the DCF margin-improvement logic and adding a software durability gate so high-margin software is not automatically favored without matching moat / competition durability.

DCF margin-improvement rule in this pass:

- Positive YoY margin change affects DCF only for `Revenue-Generating / Unprofitable` and `Near Breakeven` companies.
- The DCF boost uses at most 0.75x of the true YoY margin improvement.
- Profitable / FCF-positive companies receive no positive DCF margin-improvement boost.
- Negative YoY margin change can pull DCF down through a slightly looser downside cap.
- Margin-improvement increments decay by projection year and by remaining room to the margin ceiling, so theoretical future margin expansion faces steeper discounting farther out.

Software durability rule in this pass:

- Software multiples are gated by moat strength, low direct competition, competition intensity, recurring revenue durability, and tag-stacking pressure.
- The gate applies only to `Software / Subscription`.
- Non-software companies use a 1.00x software gate.

| Company | Engine fair common equity | Observed market cap input | Difference | DCF EV | Direct comps EV | Public market EV | Asset EV | Software gate | Applied margin trend | Terminal FCF margin |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Adobe | $219.9B | $109.5B | +100.9% | $357.5B | $256.7B | $102.9B | $268.7B | 0.84x | 0.0% | 37.4% |
| Salesforce | $195.9B | $165.0B | +18.8% | $267.8B | $240.1B | $172.1B | $370.3B | 0.81x | 0.0% | 18.3% |
| ServiceNow | $86.6B | $122.8B | -29.5% | $72.8B | $107.4B | $119.1B | $120.8B | 0.84x | 0.0% | 12.1% |
| Snowflake | $37.2B | $100.7B | -63.1% | $0.0B | $54.5B | $97.9B | $24.5B | 0.70x | 4.5% | -18.6% |
| Caterpillar | $124.1B | $363.8B | -65.9% | $83.8B | $152.4B | $384.5B | $66.8B | 1.00x | -0.7% | 4.7% |

Interpretation:

- The engine is no longer giving profitable software companies a DCF margin-improvement boost. Adobe, Salesforce, and ServiceNow all show 0.0% applied DCF trend despite positive or improving margins.
- Snowflake is the only company in this pass receiving the positive DCF margin-improvement treatment because it is unprofitable. The applied trend is capped at 4.5%, which is 0.75x of a 6.0% true YoY margin improvement input.
- The software durability gate meaningfully compresses the high-margin software names: Adobe 0.84x, Salesforce 0.81x, ServiceNow 0.84x, Snowflake 0.70x.
- Caterpillar is unaffected by the software gate and remains controlled by industrial comps, public-market anchoring, assets, debt, backlog, and margin compression.
- Direct competitor comps are active in this run. The earlier zero direct-comps output was caused by using obsolete `directComp...` field names in a manual test script, not by the engine.

## Companies Loaded

1. Costco Wholesale Corporation
   - Sector: Consumer Products / Retail / E-commerce
   - Business model: Retail / Commerce / Distribution
   - Size: large / market-anchored
   - Key sources: Costco FY2025 Form 10-K, SEC companyfacts, warehouse club market CAGR estimate, live quote/share-count check

2. Rocket Lab Corporation
   - Sector: Aerospace / Space / Defense
   - Business model: Product / Hardware
   - Size: public growth company with low revenue share of a large market
   - Key sources: Rocket Lab FY2025 Form 10-K, Q1 2026 release, space launch market CAGR estimate, live quote/share-count check

3. JPMorgan Chase & Co.
   - Sector: Fintech / Financial Services
   - Business model: Financial / Balance-Sheet Business
   - Size: very large public financial institution
   - Key sources: JPMorgan FY2025 Form 10-K, Q1 2026 share count, financial services market CAGR estimate, live quote/share-count check

4. Eli Lilly and Company
   - Sector: Biotech Therapeutics
   - Business model: IP / Licensing / Royalty
   - Size: large commercial pharma company
   - Key sources: Eli Lilly FY2025 Form 10-K, Q1 2026 share count, global prescription drug market CAGR estimate, live quote/share-count check

## Current Accuracy Check

| Company | Engine fair common equity | Observed market cap | Difference | Discount rate | Applied EV/Rev | Co. multiple factor | Track weights | In engine range? |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| Costco | $259.7B | $432.8B | -40.0% | 5.5% | 1.27x | -2.4% | DCF 30%, Comps 23%, Industry 6%, Public 30%, Asset 9%, Strategic 2% | No |
| Rocket Lab | $5.7B | $35.2B | -83.8% | 22.4% | 5.16x | 48.6% | Comps 27%, Industry 13%, Public 12%, Pipeline 24%, Asset 5%, Strategic 19% | No |
| JPMorgan Chase & Co. | $978.1B | $935.6B | 4.5% | 6.5% | 7.04x | 62.4% | DCF 16%, Comps 24%, Industry 5%, Public 22%, Asset 30%, Strategic 3% | Yes |
| Eli Lilly | $1.20T | $1.15T | 4.9% | 6.0% | 18.10x | 82.5% | DCF 34%, Comps 27%, Industry 7%, Public 27%, Asset 2%, Strategic 3% | Yes |

## Track Outputs

| Company | DCF | Direct Comps | Industry | Public Market | Pipeline / Backlog | Asset / Book | Strategic |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Costco | $184.8B | $187.2B | $110.0B | $424.5B | $0 | $192.8B | $87.3B |
| Rocket Lab | $0 | $2.9B | $1.2B | $34.3B | $523.0M | $1.6B | $797.9M |
| JPMorgan Chase & Co. | $1.26T | $806.9B | $1.97T | $1.09T | $0 | $1.02T | $985.9B |
| Eli Lilly | $1.53T | $928.6B | $1.10T | $1.18T | $0 | $67.3B | $2.42T |

## Implementation Notes

- Applied multiples are no longer only sector-standard. They are raised or lowered by a single `companyMultipleFactor` built from growth credibility, profitability quality, revenue quality, sector momentum, capital burden, and leverage / revenue-decline drag.
- The company multiple factor keeps a 0.25x floor and 2.5x ceiling. Final applied multiples are now allowed to move above the old ceiling when direct quality, growth, and market potential justify it, with revenue capped at 3.0x the sector high end and EBITDA/FCF capped at 2.8x.
- The multiple curve is now asymmetric: high-quality upside is allowed to move toward the upper range more easily, while the downside path remains stricter for weak or deteriorating companies. The new `qualityShield` audit field shows how profitability, credible growth, and market potential reduce drag without creating another valuation layer.
- Profitable and FCF-positive companies now receive smaller DCF discount-rate penalties, lighter post-track risk haircuts, and less capital-drag pressure inside applied multiples. Distressed, pre-revenue, and unprofitable cases still keep higher discounts.
- Tag-only strategic cap expansion was removed. Strategic cap expansion now depends on classification or scored strategic inputs, so overlapping tags cannot silently expand strategic weight and also lift the strategic score.
- Retail/subscription hybrids can now enter separate retail sales mix, retail sale margin, subscription mix, and subscription margin. The engine computes one blended gross margin and exposes the retail/subscription contribution in the audit so membership-style economics do not disappear inside a low merchandise margin.
- `competitionIntensity` now feeds one `lowDirectCompetition` signal. That signal can raise applied multiples, strengthen direct-comps relative adjustment, increase public-market evidence trust, and lower mature-company discounting only through visible shared budgets.
- Asset backing is now calculated from disclosed asset backing, tangible book, typed asset splits, working assets, productive footprint value, and subscription/customer-relationship asset value where applicable.
- Typed asset split inputs now support six value/type buckets. Asset rules are type-specific: land / owned real estate can receive an appreciation multiple, fleet / trucks / vehicles now use 0.65x, owned cloud compute / data-center capacity starts at 0.82x before moat lift, and capitalized software/platform is treated cautiously at 0.18x because owning a website or software codebase is usually not a clean resale asset by itself.
- Added more asset types: crypto / digital assets, public securities / investments, strategic investments / minority stakes, brand / trademarks, natural resource / mineral rights, and renewable energy / power assets.
- Customer contracts / membership base no longer use a flat multiple. Membership value now uses monthly churn to estimate annual retention, then combines NRR, switching costs, recurring revenue scale, `moatStrength`, and network effects through a capped non-linear flywheel score.
- Costco's fixture now uses a typed split example: $82.0B land / owned real estate at 1.35x and $8.0B fleet / vehicles at 0.65x. The adjusted split is $115.9B; calculated asset backing is $180.5B after membership/customer relationship support; the asset track is $192.8B.
- Asset-light software is treated as neutral rather than penalized for lacking hard assets. Asset split inputs can still capture cloud capacity, data centers, capitalized software, IP, or contracts when those assets are actually material.
- Final valuation now aggregates independent tracks once: DCF, direct competitor comps, industry baseline, public market, pipeline/backlog, asset/book, and strategic optionality.
- Track weights are classification-aware. Mature public companies emphasize DCF/direct comps/public evidence; financial companies emphasize asset/book and comps; early or project/backlog companies emphasize direct comps, pipeline/backlog, and strategic optionality.
- DCF is independent from industry multiples. Its terminal value is bounded by market capacity and margin capacity rather than by the industry multiple track.
- Healthy mature public companies now receive lower discount rates; early, unprofitable, regulated, or technically uncertain companies still receive higher rates.
- `marketPotential` is computed from remaining market room, market size, sector CAGR, company growth, and expected pipeline, then used as one visible upside signal.
- `pipelineOpportunity` is computed from pipeline value, expected conversion, market room, GTM quality, and public/private status. It is weighted more heavily for smaller/private companies and creates a capped pipeline revenue credit.
- Sector CAGR is weighted through the single `sectorMomentum` ledger signal. It feeds quality and multiples from there, rather than reappearing as separate growth, market, and size bonuses.
- Dividend yield is a public-market input and adds a modest durability uplift to equity value only when the company is public, dividend-paying, and FCF-positive. This keeps the dividend signal stronger than a pure payout math adjustment without letting it dominate.
- Margins are split into gross, EBITDA, approximate net, and FCF margin. AR, inventory, and AP feed `workingCapitalPressure` plus working-capital drag; missing/non-applicable working-capital fields are neutral rather than punitive.
- JPMorgan deposits are not treated as debt in the generic enterprise-value bridge. The debt input uses short-term borrowings plus long-term debt/capital lease obligations so bank operating deposits do not mechanically destroy the output.
- Eli Lilly uses the biotech sector but a commercial-pharma baseline override because it is a large, profitable, revenue-generating drug company, not a pre-revenue R&D asset.

## Source Links

- Costco FY2025 Form 10-K: https://www.sec.gov/Archives/edgar/data/909832/000090983225000101/cost-20250831.htm
- Rocket Lab FY2025 Form 10-K: https://www.sec.gov/Archives/edgar/data/1819994/000181999426000013/rklb-20251231.htm
- Rocket Lab Q1 2026 release: https://www.sec.gov/Archives/edgar/data/1819994/000181999426000027/rklb-05072026ex991.htm
- JPMorgan FY2025 Form 10-K: https://www.jpmorganchase.com/content/dam/jpmc/jpmorgan-chase-and-co/investor-relations/documents/quarterly-earnings/2025/4th-quarter/corp-10k-2025.pdf
- Eli Lilly FY2025 Form 10-K: https://investor.lilly.com/static-files/0d64699c-0cc7-490e-9152-b2ba1de08634
- Warehouse club CAGR reference: https://www.businessresearchinsights.com/market-reports/warehouse-clubs-market-118839
- Space launch CAGR reference: https://www.marknteladvisors.com/press-release/space-launch-services-market-size
- Financial services CAGR reference: https://www.thebusinessresearchcompany.com/report/financial-services-global-market-report
- Prescription drug CAGR reference: https://www.evaluate.com/press-release/evaluate-releases-2030-forecasts-for-global-pharmaceutical-market/

## Manual / Estimated Inputs

The following values are not cleanly disclosed as single filing facts and were entered as explicit assumptions:

- TAM / SAM selection
- NRR
- churn
- pipeline conversion
- management score
- moat score
- GTM score
- data advantage score
- network-effect score
- switching-cost score
- IP score
- acquirer pool
- strategic premium flag
- technical readiness
- regulatory risk
- expected dilution
- terminal growth
- projection years
- aggregate direct-competitor multiple set
- competitor growth and margin averages
- backlog conversion / duration / renewal assumptions
- tangible-book and asset-backing valuation inputs where not disclosed as a clean single field
